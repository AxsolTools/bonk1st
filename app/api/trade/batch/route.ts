/**
 * Batch Trade API - Execute trades for multiple wallets atomically
 * 
 * Uses Jito bundles for atomic execution with sequential fallback
 * Each wallet trades the FULL specified amount (not split)
 */

import { NextRequest, NextResponse } from "next/server"
import { Connection, Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js"
import { getAssociatedTokenAddress, getAccount, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token"
import bs58 from "bs58"
import { getAdminClient } from "@/lib/supabase/admin"
import { decryptPrivateKey, getOrCreateServiceSalt } from "@/lib/crypto"
import { executeBundle, executeSequentialFallback } from "@/lib/blockchain/jito-bundles"
import { QUOTE_MINTS, POOL_TYPES } from "@/lib/blockchain"

// ============================================================================
// CONFIGURATION
// ============================================================================

const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL || "https://api.mainnet-beta.solana.com"
const PUMPPORTAL_LOCAL_TRADE = "https://pumpportal.fun/api/trade-local"
const MAX_BUNDLE_SIZE = 5 // Jito max transactions per bundle
const DEFAULT_PRIORITY_FEE = 0.0005

// ============================================================================
// TYPES
// ============================================================================

interface BatchTradeRequest {
  walletAddresses: string[]
  action: "buy" | "sell"
  tokenMint: string
  amountPerWallet: number
  slippageBps: number
  tokenDecimals?: number
  // Bonk pool USD1 support (PumpPortal handles SOL<->USD1 conversion internally)
  pool?: string
  quoteMint?: string
}

interface WalletTradeResult {
  walletAddress: string
  success: boolean
  txSignature?: string
  error?: string
}

// ============================================================================
// HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    // Get auth headers
    const sessionId = request.headers.get("x-session-id")
    const userId = request.headers.get("x-user-id")

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: { code: 1001, message: "Session required" } },
        { status: 401 }
      )
    }

    // Parse request body
    const body: BatchTradeRequest = await request.json()
    const {
      walletAddresses,
      action,
      tokenMint,
      amountPerWallet,
      slippageBps = 500,
      tokenDecimals = 6,
      // Bonk pool USD1 support (PumpPortal handles SOL<->USD1 conversion internally)
      pool = 'pump',
      quoteMint = QUOTE_MINTS.WSOL,
    } = body
    
    // Detect Bonk USD1 mode
    const isBonkPool = pool === 'bonk' || pool === POOL_TYPES.BONK
    const isUsd1Quote = quoteMint === QUOTE_MINTS.USD1

    // Validate request
    if (!walletAddresses || !Array.isArray(walletAddresses) || walletAddresses.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 3001, message: "No wallet addresses provided" } },
        { status: 400 }
      )
    }

    if (!["buy", "sell"].includes(action)) {
      return NextResponse.json(
        { success: false, error: { code: 3001, message: "Invalid action" } },
        { status: 400 }
      )
    }

    if (typeof amountPerWallet !== "number" || amountPerWallet <= 0) {
      return NextResponse.json(
        { success: false, error: { code: 3001, message: "Invalid amount" } },
        { status: 400 }
      )
    }

    if (!tokenMint || tokenMint.length < 32) {
      return NextResponse.json(
        { success: false, error: { code: 4001, message: "Invalid token mint" } },
        { status: 400 }
      )
    }

    console.log("[BATCH-TRADE] Request:", {
      walletCount: walletAddresses.length,
      action,
      tokenMint: tokenMint.slice(0, 8),
      amountPerWallet,
      slippageBps,
      pool,
      isBonkPool,
      isUsd1Quote,
    })

    const adminClient = getAdminClient()
    const connection = new Connection(HELIUS_RPC_URL, "confirmed")
    const serviceSalt = await getOrCreateServiceSalt(adminClient)
    
    // Check if this is a Jupiter DBC token
    const { data: token } = await adminClient
      .from("tokens")
      .select("id, pool_type, dbc_pool_address, decimals")
      .eq("mint_address", tokenMint)
      .single()
    
    const isJupiterToken = token?.pool_type === "jupiter"
    const effectiveDecimals = token?.decimals ?? tokenDecimals
    
    console.log("[BATCH-TRADE] Token type:", {
      isJupiter: isJupiterToken,
      poolType: token?.pool_type,
      decimals: effectiveDecimals,
    })

    // Fetch and decrypt all wallet keypairs
    const walletKeypairs: Map<string, Keypair> = new Map()
    const walletErrors: WalletTradeResult[] = []

    for (const address of walletAddresses) {
      try {
        const { data: wallet, error: walletError } = await adminClient
          .from("wallets")
          .select("encrypted_private_key")
          .eq("session_id", sessionId)
          .eq("public_key", address)
          .single()

        if (walletError || !wallet) {
          walletErrors.push({
            walletAddress: address,
            success: false,
            error: "Wallet not found or not authorized",
          })
          continue
        }

        const privateKeyBase58 = decryptPrivateKey(
          wallet.encrypted_private_key,
          sessionId,
          serviceSalt
        )
        const keypair = Keypair.fromSecretKey(bs58.decode(privateKeyBase58))
        walletKeypairs.set(address, keypair)
      } catch (error) {
        console.error(`[BATCH-TRADE] Failed to decrypt wallet ${address}:`, error)
        walletErrors.push({
          walletAddress: address,
          success: false,
          error: "Failed to decrypt wallet",
        })
      }
    }

    if (walletKeypairs.size === 0) {
      return NextResponse.json(
        { success: false, error: { code: 1003, message: "No valid wallets found" } },
        { status: 404 }
      )
    }

    console.log(`[BATCH-TRADE] Loaded ${walletKeypairs.size} wallets`)

    // For sells, we need to get each wallet's actual token balance
    // because the client sends the TOTAL amount across all wallets
    const walletTokenBalances: Map<string, number> = new Map()
    // Track which token program each wallet uses (for correct ATA derivation)
    const walletTokenProgram: Map<string, PublicKey> = new Map()
    const walletTokenAccount: Map<string, string> = new Map()
    
    if (action === "sell") {
      console.log("[BATCH-TRADE] Fetching individual token balances for sell...")
      const tokenMintPubkey = new PublicKey(tokenMint)
      
      // Fetch all balances in parallel for speed
      // Try both SPL Token and Token-2022 programs
      const balancePromises = Array.from(walletKeypairs.keys()).map(async (address) => {
        const walletPubkey = new PublicKey(address)
        
        // Try standard SPL Token first
        try {
          const ata = await getAssociatedTokenAddress(tokenMintPubkey, walletPubkey, false, TOKEN_PROGRAM_ID)
          const account = await getAccount(connection, ata, "confirmed", TOKEN_PROGRAM_ID)
          const tokenAmount = Number(account.amount) / Math.pow(10, tokenDecimals)
          console.log(`[BATCH-TRADE] Wallet ${address.slice(0, 8)} has ${tokenAmount.toFixed(2)} tokens (SPL Token ATA: ${ata.toBase58().slice(0, 8)})`)
          return { 
            address, 
            balance: tokenAmount, 
            error: null, 
            programId: TOKEN_PROGRAM_ID,
            ata: ata.toBase58()
          }
        } catch {
          // SPL Token account not found, try Token-2022
        }
        
        // Try Token-2022
        try {
          const ata = await getAssociatedTokenAddress(tokenMintPubkey, walletPubkey, false, TOKEN_2022_PROGRAM_ID)
          const account = await getAccount(connection, ata, "confirmed", TOKEN_2022_PROGRAM_ID)
          const tokenAmount = Number(account.amount) / Math.pow(10, tokenDecimals)
          console.log(`[BATCH-TRADE] Wallet ${address.slice(0, 8)} has ${tokenAmount.toFixed(2)} tokens (Token-2022 ATA: ${ata.toBase58().slice(0, 8)})`)
          return { 
            address, 
            balance: tokenAmount, 
            error: null, 
            programId: TOKEN_2022_PROGRAM_ID,
            ata: ata.toBase58()
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error'
          console.warn(`[BATCH-TRADE] Could not fetch balance for ${address.slice(0, 8)} (tried both SPL Token and Token-2022):`, errorMsg)
          return { address, balance: 0, error: errorMsg, programId: null, ata: null }
        }
      })
      
      const balanceResults = await Promise.all(balancePromises)
      let fetchErrors = 0
      
      for (const result of balanceResults) {
        walletTokenBalances.set(result.address, result.balance)
        if (result.error) {
          fetchErrors++
        } else {
          if (result.programId) walletTokenProgram.set(result.address, result.programId)
          if (result.ata) walletTokenAccount.set(result.address, result.ata)
        }
      }
      
      console.log(`[BATCH-TRADE] Balance fetch complete: ${balanceResults.length - fetchErrors}/${balanceResults.length} successful`)
      
      // If ALL balance fetches failed, there might be an RPC issue
      if (fetchErrors === balanceResults.length && balanceResults.length > 0) {
        console.error("[BATCH-TRADE] All balance fetches failed - possible RPC issue or wallets have no tokens")
      }
    }

    // ============================================================================
    // JUPITER TOKEN PATH - Execute swaps directly (no Jito bundles)
    // ============================================================================
    if (isJupiterToken) {
      console.log("[BATCH-TRADE] Using Jupiter swap for DBC token...")
      const { executeJupiterSwap } = await import("@/lib/blockchain/jupiter-studio")
      
      const results: WalletTradeResult[] = [...walletErrors]
      let successCount = 0
      let failedCount = walletErrors.length
      
      // Jupiter DBC tokens need higher slippage
      const minSlippageForJupiter = action === "sell" ? 1000 : 300 // 10% for sells, 3% for buys
      const effectiveSlippageBps = Math.max(slippageBps, minSlippageForJupiter)
      
      // Execute Jupiter swaps for each wallet (sequentially to avoid rate limits)
      for (const [address, keypair] of walletKeypairs) {
        try {
          // For sells, use actual wallet balance
          let actualAmount = amountPerWallet
          
          if (action === "sell") {
            const walletBalance = walletTokenBalances.get(address) || 0
            if (walletBalance <= 0) {
              console.log(`[BATCH-TRADE] Skipping ${address.slice(0, 8)} - no tokens to sell`)
              results.push({
                walletAddress: address,
                success: false,
                error: "No tokens to sell",
              })
              failedCount++
              continue
            }
            actualAmount = walletBalance
          }
          
          console.log(`[BATCH-TRADE] Jupiter swap for ${address.slice(0, 8)}: ${action} ${actualAmount}`)
          
          const swapResult = await executeJupiterSwap(connection, {
            walletKeypair: keypair,
            tokenMint,
            action,
            amount: actualAmount,
            slippageBps: effectiveSlippageBps,
            tokenDecimals: effectiveDecimals,
          })
          
          if (swapResult.success) {
            results.push({
              walletAddress: address,
              success: true,
              txSignature: swapResult.txSignature,
            })
            successCount++
            
            // Log trade to database (async, don't await)
            if (token && userId) {
              adminClient.from("trades").insert({
                token_id: token.id,
                token_address: tokenMint,
                user_id: userId,
                wallet_address: address,
                trade_type: action,
                amount_sol: swapResult.amountSol || 0,
                token_amount: swapResult.amountTokens || 0,
                price_per_token_sol: swapResult.pricePerToken || 0,
                tx_signature: swapResult.txSignature,
                status: "confirmed",
              } as any).then(() => {}).catch((e) => console.error("[BATCH-TRADE] DB log error:", e))
            }
          } else {
            results.push({
              walletAddress: address,
              success: false,
              error: swapResult.error || "Jupiter swap failed",
            })
            failedCount++
          }
        } catch (error) {
          console.error(`[BATCH-TRADE] Jupiter swap error for ${address.slice(0, 8)}:`, error)
          results.push({
            walletAddress: address,
            success: false,
            error: error instanceof Error ? error.message : "Jupiter swap failed",
          })
          failedCount++
        }
      }
      
      console.log(`[BATCH-TRADE] Jupiter swaps complete: ${successCount} succeeded, ${failedCount} failed`)
      
      return NextResponse.json({
        success: successCount > 0,
        data: {
          successCount,
          failedCount,
          results,
          method: "jupiter",
        },
      })
    }
    
    // ============================================================================
    // PUMP.FUN / BONK.FUN PATH - Build transactions for Jito bundle
    // Uses batch array request per PumpPortal docs (optimal method)
    // For USD1 pairs, PumpPortal handles SOL<->USD1 conversion internally
    // ============================================================================
    const poolLabel = isBonkPool ? 'Bonk.fun' : 'Pump.fun'
    console.log(`[BATCH-TRADE] Using ${poolLabel} for trades...`)
    
    const walletActualAmounts: Map<string, number> = new Map()
    const validWalletAddresses: string[] = []
    
    // Build batch array of trade arguments (per official PumpPortal docs)
    const bundledTxArgs: Record<string, unknown>[] = []

    for (const [address, keypair] of walletKeypairs) {
        // For sells, use actual wallet balance. For buys, use the requested amount.
        let actualAmount = amountPerWallet
        
        if (action === "sell") {
          const walletBalance = walletTokenBalances.get(address) || 0
          if (walletBalance <= 0) {
            console.log(`[BATCH-TRADE] Skipping ${address.slice(0, 8)} - no tokens to sell`)
            walletErrors.push({
              walletAddress: address,
              success: false,
              error: "No tokens to sell",
            })
            continue
          }
          // Use the wallet's actual balance for sells
          actualAmount = walletBalance
          console.log(`[BATCH-TRADE] Will sell ${actualAmount.toFixed(2)} tokens from ${address.slice(0, 8)}`)
        }
        
        walletActualAmounts.set(address, actualAmount)
      validWalletAddresses.push(address)

      // Build trade request for PumpPortal batch array
      const tradeArg: Record<string, unknown> = {
          publicKey: address,
          action,
          mint: tokenMint,
        denominatedInSol: action === "buy" ? "true" : "false", // For buys: SOL amount, for sells: token amount
          amount: actualAmount,
          slippage: slippageBps / 100, // Convert to percentage
        priorityFee: bundledTxArgs.length === 0 ? DEFAULT_PRIORITY_FEE : 0, // Only first tx pays Jito tip
          pool: isBonkPool ? POOL_TYPES.BONK : POOL_TYPES.PUMP,
        }
        
      // Add quoteMint for Bonk pools (PumpPortal handles USD1 conversion internally)
        if (isBonkPool && quoteMint) {
        tradeArg.quoteMint = quoteMint
        }
        
        // For sells, include tokenAccount (use the ATA we already found during balance fetch)
        if (action === "sell") {
          const cachedAta = walletTokenAccount.get(address)
          if (cachedAta) {
          tradeArg.tokenAccount = cachedAta
          } else {
          // Fallback: derive ATA
            const tokenMintPubkey = new PublicKey(tokenMint)
            const walletPubkey = new PublicKey(address)
            const programId = walletTokenProgram.get(address) || TOKEN_PROGRAM_ID
            const ata = await getAssociatedTokenAddress(tokenMintPubkey, walletPubkey, false, programId)
          tradeArg.tokenAccount = ata.toBase58()
        }
      }

      bundledTxArgs.push(tradeArg)
    }

    if (bundledTxArgs.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 3002, message: "No transactions could be built" },
          data: {
            totalWallets: walletAddresses.length,
            successCount: 0,
            failureCount: walletErrors.length,
            results: walletErrors,
            duration: Date.now() - startTime,
          },
        },
        { status: 400 }
      )
    }

    console.log(`[BATCH-TRADE] Requesting ${bundledTxArgs.length} transactions from PumpPortal (batch array)...`)

    // ============================================================================
    // PRIMARY METHOD: Batch array request to PumpPortal (per official docs)
    // ============================================================================
    let transactions: VersionedTransaction[] = []
    let usedFallback = false
    
    try {
      const response = await fetch(PUMPPORTAL_LOCAL_TRADE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bundledTxArgs), // Send ALL tx args at once as array
      })

      if (!response.ok) {
        throw new Error(`PumpPortal batch error: ${response.statusText}`)
      }

      const txPayloads = await response.json()
      const txArray = Array.isArray(txPayloads) ? txPayloads : []
      
      if (txArray.length === 0) {
        throw new Error("PumpPortal returned no transactions")
      }

      console.log(`[BATCH-TRADE] Received ${txArray.length} transactions from batch request`)

      // Deserialize and sign each transaction
      for (let i = 0; i < txArray.length; i++) {
        const address = validWalletAddresses[i]
        const keypair = walletKeypairs.get(address)
        
        if (!keypair) {
          console.warn(`[BATCH-TRADE] No keypair for index ${i}`)
          continue
        }
        
        const tx = VersionedTransaction.deserialize(new Uint8Array(bs58.decode(txArray[i])))
        tx.sign([keypair])
        transactions.push(tx)
          }
      
      console.log(`[BATCH-TRADE] Signed ${transactions.length} transactions (batch method)`)
      
    } catch (batchError) {
      // ============================================================================
      // FALLBACK: Individual requests (legacy method, still works)
      // ============================================================================
      console.warn(`[BATCH-TRADE] Batch request failed, falling back to individual requests:`, batchError)
      usedFallback = true
      transactions = []
      
      for (let i = 0; i < bundledTxArgs.length; i++) {
        const tradeArg = bundledTxArgs[i]
        const address = validWalletAddresses[i]
        const keypair = walletKeypairs.get(address)
        
        if (!keypair) continue
        
        try {
          console.log(`[BATCH-TRADE] [Fallback] Requesting tx for ${address.slice(0, 8)}...`)

        const response = await fetch(PUMPPORTAL_LOCAL_TRADE, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
            body: JSON.stringify(tradeArg), // Individual request
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`PumpPortal error: ${errorText}`)
        }

          // Individual request returns raw bytes, batch returns base58 array
        const txBytes = new Uint8Array(await response.arrayBuffer())
        const tx = VersionedTransaction.deserialize(txBytes)
        tx.sign([keypair])
        transactions.push(tx)
          
        } catch (individualError) {
          console.error(`[BATCH-TRADE] [Fallback] Failed for ${address.slice(0, 8)}:`, individualError)
        walletErrors.push({
          walletAddress: address,
          success: false,
            error: individualError instanceof Error ? individualError.message : "Failed to build transaction",
        })
      }
      }
      
      console.log(`[BATCH-TRADE] [Fallback] Built ${transactions.length} transactions`)
    }

    if (transactions.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 3002, message: "No transactions could be built" },
          data: {
            totalWallets: walletAddresses.length,
            successCount: 0,
            failureCount: walletErrors.length,
            results: walletErrors,
            duration: Date.now() - startTime,
          },
        },
        { status: 400 }
      )
    }

    console.log(`[BATCH-TRADE] Ready to execute ${transactions.length} transactions${usedFallback ? ' (fallback method)' : ' (batch method)'}`)

    // Execute transactions via Jito bundle
    const results: WalletTradeResult[] = [...walletErrors]
    
    // Build wallet-to-transaction index mapping using validWalletAddresses
    // (transactions are in same order as validWalletAddresses after fallback filtering)
    const txWalletAddresses = usedFallback 
      ? validWalletAddresses.filter(addr => !walletErrors.some(e => e.walletAddress === addr))
      : validWalletAddresses.slice(0, transactions.length)

    if (transactions.length <= MAX_BUNDLE_SIZE) {
      // Single bundle execution
      console.log("[BATCH-TRADE] Executing as single Jito bundle...")

      const bundleResult = await executeBundle(connection, transactions, {
        retries: 3,
        sequentialFallback: true,
      })

      // Map results back to wallets
      for (let i = 0; i < transactions.length; i++) {
        const address = txWalletAddresses[i]
        if (address) {
          const signature = bundleResult.signatures[i]
        results.push({
          walletAddress: address,
          success: bundleResult.success,
          txSignature: signature,
          error: bundleResult.success ? undefined : bundleResult.error,
        })
        }
      }
    } else {
      // Multiple bundles needed - execute in chunks (max 5 per Jito bundle)
      console.log(`[BATCH-TRADE] Splitting into ${Math.ceil(transactions.length / MAX_BUNDLE_SIZE)} bundles...`)

      const chunks: VersionedTransaction[][] = []
      for (let i = 0; i < transactions.length; i += MAX_BUNDLE_SIZE) {
        chunks.push(transactions.slice(i, i + MAX_BUNDLE_SIZE))
      }

      let globalIndex = 0
      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const chunk = chunks[chunkIndex]
        console.log(`[BATCH-TRADE] Executing bundle ${chunkIndex + 1}/${chunks.length}...`)

        const bundleResult = await executeBundle(connection, chunk, {
          retries: 3,
          sequentialFallback: true,
        })

        // Map results back to wallets
        for (let i = 0; i < chunk.length; i++) {
          const address = txWalletAddresses[globalIndex + i]
          if (address) {
            const signature = bundleResult.signatures[i]
            results.push({
              walletAddress: address,
              success: bundleResult.success,
              txSignature: signature,
              error: bundleResult.success ? undefined : bundleResult.error,
            })
          }
        }

        globalIndex += chunk.length

        // Small delay between bundles
        if (chunkIndex < chunks.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500))
        }
      }
    }

    // NOTE: For Bonk USD1 pairs, PumpPortal handles SOL<->USD1 conversion internally
    // No manual pre-buy or post-sell conversion needed

    const successCount = results.filter((r) => r.success).length
    const duration = Date.now() - startTime

    console.log(`[BATCH-TRADE] Complete: ${successCount}/${results.length} successful in ${duration}ms`)

    // Record trades in database
    for (const result of results.filter((r) => r.success)) {
      try {
        const actualAmount = walletActualAmounts.get(result.walletAddress) || amountPerWallet
        // For buys: actualAmount is SOL, need to estimate tokens
        // For sells: actualAmount is tokens, need to estimate SOL (from Jito bundle we don't have exact)
        await adminClient.from("trades").insert({
          wallet_address: result.walletAddress,
          token_address: tokenMint,
          trade_type: action,
          amount_sol: actualAmount, // For buys it's SOL spent, for sells we'll update later
          token_amount: actualAmount, // For sells it's tokens sold, for buys we'll update later
          tx_signature: result.txSignature,
          status: "confirmed",
          source: "batch_trade",
        })
      } catch (dbError) {
        console.warn("[BATCH-TRADE] Failed to record trade:", dbError)
      }
    }

    return NextResponse.json({
      success: successCount > 0,
      data: {
        totalWallets: walletAddresses.length,
        successCount,
        failureCount: results.length - successCount,
        results,
        duration,
      },
    })
  } catch (error) {
    console.error("[BATCH-TRADE] Error:", error)
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 5001,
          message: error instanceof Error ? error.message : "Batch trade failed",
        },
        data: {
          totalWallets: 0,
          successCount: 0,
          failureCount: 0,
          results: [],
          duration: 0,
        },
      },
      { status: 500 }
    )
  }
}

