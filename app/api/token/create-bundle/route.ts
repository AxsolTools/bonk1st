/**
 * Bundle Token Creation API - Create token with coordinated multi-wallet launch
 * 
 * Uses Jito bundles for atomic execution:
 * - Token creation + dev buy in first transaction
 * - Bundle wallet buys in subsequent transactions (max 4)
 * 
 * Reference: raydiumspltoken/pumpfun_complete.js createPumpfunTokenWithBundle()
 */

import { NextRequest, NextResponse } from "next/server"
import { Connection, Keypair, VersionedTransaction, PublicKey } from "@solana/web3.js"
import bs58 from "bs58"
import { getAdminClient } from "@/lib/supabase/admin"
import { decryptPrivateKey, getOrCreateServiceSalt } from "@/lib/crypto"
import { executeBundle } from "@/lib/blockchain/jito-bundles"
import { solToLamports, lamportsToSol, calculatePlatformFee } from "@/lib/precision"
import { collectPlatformFee, TOKEN_CREATION_FEE_LAMPORTS, TOKEN_CREATION_FEE_SOL } from "@/lib/fees"
import { getReferrer, addReferralEarnings } from "@/lib/referral"
// USD1 swap functions for BONK USD1 pairs
import { QUOTE_MINTS, POOL_TYPES } from "@/lib/blockchain/pumpfun"
import { swapSolToUsd1 } from "@/lib/blockchain/jupiter-swap"

// ============================================================================
// CONFIGURATION
// ============================================================================

const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL || "https://api.mainnet-beta.solana.com"
const PUMPPORTAL_LOCAL_TRADE = "https://pumpportal.fun/api/trade-local"
const PUMPFUN_IPFS_API = "https://pump.fun/api/ipfs"
const MAX_BUNDLE_WALLETS = 4 // Jito limit: 5 txs total (1 create + 4 buys)
const DEFAULT_PRIORITY_FEE = 0.0005
const BUNDLE_SLIPPAGE = 10 // 10% slippage for bundle

// ============================================================================
// TYPES
// ============================================================================

interface BundleWallet {
  walletId?: string
  address: string
  buyAmountSol: number
}

interface CreateBundleRequest {
  name: string
  symbol: string
  description: string
  image: string // Base64
  website?: string
  twitter?: string
  telegram?: string
  discord?: string
  totalSupply: number
  decimals: number
  initialBuySol: number
  mintSecretKey: string
  mintAddress: string
  bundleWallets: BundleWallet[]
  // Pool configuration (pump or bonk)
  pool?: 'pump' | 'bonk'
  quoteMint?: string // WSOL or USD1 mint address
  autoConvertToUsd1?: boolean // Auto-swap SOL to USD1 before creation (for USD1 pairs)
  // AQUA parameters
  pourEnabled?: boolean
  pourRate?: number
  pourInterval?: string
  pourSource?: string
  evaporationEnabled?: boolean
  evaporationRate?: number
  feeToLiquidity?: number
  feeToCreator?: number
  autoClaimEnabled?: boolean
  claimThreshold?: number
  claimInterval?: string
  migrationTarget?: string
  treasuryWallet?: string
  devWallet?: string
}

// ============================================================================
// HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    // Get auth headers
    const sessionId = request.headers.get("x-session-id")
    const walletAddress = request.headers.get("x-wallet-address")

    if (!sessionId || !walletAddress) {
      return NextResponse.json(
        { success: false, error: { code: 1001, message: "Authentication required" } },
        { status: 401 }
      )
    }

    const body: CreateBundleRequest = await request.json()
    const {
      name,
      symbol,
      description,
      image,
      website,
      twitter,
      telegram,
      discord,
      totalSupply,
      decimals = 6,
      initialBuySol = 0,
      mintSecretKey,
      mintAddress,
      bundleWallets = [],
      pool = 'pump',
      quoteMint = QUOTE_MINTS.WSOL,
      autoConvertToUsd1 = false, // Auto-swap SOL to USD1 before creation (for USD1 pairs)
    } = body
    
    // Determine pool type and quote type
    const poolType = pool === 'bonk' ? POOL_TYPES.BONK : POOL_TYPES.PUMP
    const isUsd1Quote = quoteMint === QUOTE_MINTS.USD1
    const quoteType = isUsd1Quote ? QUOTE_MINTS.USD1 : QUOTE_MINTS.WSOL

    // Validate required fields
    if (!name || !symbol) {
      return NextResponse.json(
        { success: false, error: { code: 3001, message: "Name and symbol are required" } },
        { status: 400 }
      )
    }

    if (!mintSecretKey || !mintAddress) {
      return NextResponse.json(
        { success: false, error: { code: 3001, message: "Mint keypair is required" } },
        { status: 400 }
      )
    }

    console.log("[BUNDLE-CREATE] Starting bundle token creation:", {
      name,
      symbol,
      initialBuySol,
      bundleWalletsCount: bundleWallets.length,
      mintAddress: mintAddress.slice(0, 8),
      pool: poolType,
      quoteMint: isUsd1Quote ? 'USD1' : 'SOL',
    })

    const adminClient = getAdminClient()
    const connection = new Connection(HELIUS_RPC_URL, "confirmed")
    const serviceSalt = await getOrCreateServiceSalt(adminClient)

    // Reconstruct mint keypair
    const mintKeypair = Keypair.fromSecretKey(bs58.decode(mintSecretKey))

    // Get creator wallet keypair
    // Cast to any to bypass strict Supabase typing (table schema not in generated types)
    const { data: creatorWallet, error: walletError } = await (adminClient
      .from("wallets") as any)
      .select("encrypted_private_key")
      .eq("session_id", sessionId)
      .eq("public_key", walletAddress)
      .single()

    if (walletError || !creatorWallet) {
      return NextResponse.json(
        { success: false, error: { code: 1003, message: "Creator wallet not found" } },
        { status: 404 }
      )
    }

    const creatorPrivateKey = decryptPrivateKey(
      creatorWallet.encrypted_private_key,
      sessionId,
      serviceSalt
    )
    const creatorKeypair = Keypair.fromSecretKey(bs58.decode(creatorPrivateKey))

    // =========================================================================
    // STEP 1: Upload metadata to IPFS
    // =========================================================================
    console.log("[BUNDLE-CREATE] Uploading metadata to IPFS...")

    let metadataUri: string
    try {
      const formData = new FormData()
      formData.append("name", name)
      formData.append("symbol", symbol)
      formData.append("description", description || "")
      if (website) formData.append("website", website)
      if (twitter) formData.append("twitter", twitter)
      if (telegram) formData.append("telegram", telegram)
      
      // Convert base64 image to blob
      if (image && image.startsWith("data:")) {
        const [header, base64Data] = image.split(",")
        const mimeType = header.match(/:(.*?);/)?.[1] || "image/png"
        const imageBuffer = Buffer.from(base64Data, "base64")
        const imageBlob = new Blob([imageBuffer], { type: mimeType })
        formData.append("file", imageBlob, "token.png")
      }

      const ipfsResponse = await fetch(PUMPFUN_IPFS_API, {
        method: "POST",
        body: formData,
      })

      if (!ipfsResponse.ok) {
        throw new Error(`IPFS upload failed: ${ipfsResponse.statusText}`)
      }

      const ipfsData = await ipfsResponse.json()
      metadataUri = ipfsData.metadataUri
      console.log("[BUNDLE-CREATE] Metadata URI:", metadataUri)
    } catch (error) {
      console.error("[BUNDLE-CREATE] IPFS error:", error)
      return NextResponse.json(
        { success: false, error: { code: 3003, message: "Failed to upload metadata" } },
        { status: 500 }
      )
    }

    // =========================================================================
    // STEP 2: Load bundle wallet keypairs
    // =========================================================================
    const bundleKeypairs: Map<string, { keypair: Keypair; amount: number }> = new Map()
    const limitedWallets = bundleWallets.slice(0, MAX_BUNDLE_WALLETS)

    console.log(`[BUNDLE-CREATE] Loading ${limitedWallets.length} bundle wallets...`)

    for (const bw of limitedWallets) {
      try {
        // Query by address OR by wallet ID (frontend may send either)
        // Cast to any to bypass strict Supabase typing
        let walletQuery = (adminClient
          .from("wallets") as any)
          .select("encrypted_private_key, public_key")
          .eq("session_id", sessionId)
        
        if (bw.address) {
          walletQuery = walletQuery.eq("public_key", bw.address)
        } else if (bw.walletId) {
          walletQuery = walletQuery.eq("id", bw.walletId)
        } else {
          console.warn(`[BUNDLE-CREATE] Bundle wallet missing address and walletId`)
          continue
        }

        const { data: wallet, error: walletErr } = await walletQuery.single()

        if (walletErr) {
          console.warn(`[BUNDLE-CREATE] Failed to find bundle wallet:`, { 
            address: bw.address?.slice(0, 8), 
            walletId: bw.walletId, 
            error: walletErr.message 
          })
          continue
        }

        if (wallet) {
          const privateKey = decryptPrivateKey(
            wallet.encrypted_private_key,
            sessionId,
            serviceSalt
          )
          const walletAddress = bw.address || wallet.public_key
          bundleKeypairs.set(walletAddress, {
            keypair: Keypair.fromSecretKey(bs58.decode(privateKey)),
            amount: bw.buyAmountSol,
          })
          console.log(`[BUNDLE-CREATE] Loaded bundle wallet ${walletAddress.slice(0, 8)} with ${bw.buyAmountSol} SOL`)
        }
      } catch (error) {
        console.error(`[BUNDLE-CREATE] Failed to load bundle wallet ${bw.address}:`, error)
      }
    }

    console.log(`[BUNDLE-CREATE] Successfully loaded ${bundleKeypairs.size}/${limitedWallets.length} bundle wallets`)

    // =========================================================================
    // STEP 2.5: AUTO-SWAP SOL TO USD1 (for Bonk USD1 pairs)
    // =========================================================================
    let actualInitialBuySol = initialBuySol
    let swapTxSignature: string | undefined
    const bundleWalletUsd1Amounts: Map<string, number> = new Map()
    
    if (poolType === POOL_TYPES.BONK && isUsd1Quote && autoConvertToUsd1) {
      console.log(`[BUNDLE-CREATE] Auto-converting SOL to USD1 for USD1 pair...`)
      
      // Swap creator's SOL to USD1
      if (initialBuySol > 0) {
        console.log(`[BUNDLE-CREATE] Swapping ${initialBuySol} SOL to USD1 for creator...`)
        const creatorSwapResult = await swapSolToUsd1(connection, creatorKeypair, initialBuySol)
        
        if (!creatorSwapResult.success) {
          return NextResponse.json(
            { success: false, error: { code: 4001, message: `Creator SOL to USD1 conversion failed: ${creatorSwapResult.error}` } },
            { status: 500 }
          )
        }
        
        actualInitialBuySol = creatorSwapResult.outputAmount
        swapTxSignature = creatorSwapResult.txSignature
        console.log(`[BUNDLE-CREATE] ✅ Creator: ${initialBuySol} SOL -> ${actualInitialBuySol.toFixed(2)} USD1`)
        
        // Wait for swap to confirm
        await connection.confirmTransaction(swapTxSignature, 'confirmed')
      }
      
      // Swap bundle wallets' SOL to USD1
      for (const [address, { keypair, amount }] of bundleKeypairs) {
        if (amount > 0) {
          console.log(`[BUNDLE-CREATE] Swapping ${amount} SOL to USD1 for ${address.slice(0, 8)}...`)
          const walletSwapResult = await swapSolToUsd1(connection, keypair, amount)
          
          if (!walletSwapResult.success) {
            console.warn(`[BUNDLE-CREATE] ⚠️ Failed to swap for ${address.slice(0, 8)}: ${walletSwapResult.error}`)
            bundleWalletUsd1Amounts.set(address, 0) // Will skip this wallet in bundle
            continue
          }
          
          bundleWalletUsd1Amounts.set(address, walletSwapResult.outputAmount)
          console.log(`[BUNDLE-CREATE] ✅ ${address.slice(0, 8)}: ${amount} SOL -> ${walletSwapResult.outputAmount.toFixed(2)} USD1`)
          
          // Wait for swap to confirm
          await connection.confirmTransaction(walletSwapResult.txSignature, 'confirmed')
        }
      }
      
      console.log(`[BUNDLE-CREATE] ✅ All SOL->USD1 swaps completed`)
    }

    // =========================================================================
    // STEP 3: Build bundle transactions via PumpPortal
    // =========================================================================
    const txArgs: {
      publicKey: string
      action: string
      tokenMetadata?: { name: string; symbol: string; uri: string }
      mint?: string
      denominatedInSol: string
      amount: number
      slippage: number
      priorityFee: number
      pool: string
      quoteMint?: string
    }[] = []

    // Transaction 0: Create + dev buy (with Jito tip via priorityFee)
    // For USD1 pairs: denominatedInSol: "false" means amount is in USD1 terms
    const createTxArg: typeof txArgs[0] = {
      publicKey: walletAddress,
      action: "create",
      tokenMetadata: {
        name,
        symbol,
        uri: metadataUri,
      },
      mint: mintAddress,
      denominatedInSol: isUsd1Quote ? "false" : "true", // false for USD1 (amount is in USD1), true for SOL
      amount: actualInitialBuySol, // USD1 amount for USD1 pairs, SOL amount otherwise
      slippage: BUNDLE_SLIPPAGE,
      priorityFee: DEFAULT_PRIORITY_FEE,
      pool: poolType,
    }
    
    // Add quoteMint for bonk pool
    if (poolType === POOL_TYPES.BONK) {
      createTxArg.quoteMint = quoteType
    }
    
    txArgs.push(createTxArg)

    // Transactions 1-4: Bundle wallet buys
    // For USD1 pairs: use the swapped USD1 amounts with denominatedInSol: "false"
    for (const [address, { amount }] of bundleKeypairs) {
      // For USD1 pairs, use the swapped USD1 amount; otherwise use original SOL amount
      const buyAmount = isUsd1Quote && autoConvertToUsd1 
        ? (bundleWalletUsd1Amounts.get(address) || 0)
        : amount
      
      // Skip if wallet has no funds (swap failed or amount is 0)
      if (buyAmount <= 0) {
        console.log(`[BUNDLE-CREATE] Skipping ${address.slice(0, 8)} - no funds`)
        continue
      }
      
      const buyTxArg: typeof txArgs[0] = {
        publicKey: address,
        action: "buy",
        mint: mintAddress,
        denominatedInSol: isUsd1Quote ? "false" : "true", // false for USD1, true for SOL
        amount: buyAmount,
        slippage: BUNDLE_SLIPPAGE,
        priorityFee: 0, // Only first tx pays tip
        pool: poolType,
      }
      
      // Add quoteMint for bonk pool
      if (poolType === POOL_TYPES.BONK) {
        buyTxArg.quoteMint = quoteType
      }
      
      txArgs.push(buyTxArg)
    }

    console.log(`[BUNDLE-CREATE] Requesting ${txArgs.length} transactions from PumpPortal...`)

    // Request all transactions from PumpPortal
    const pumpResponse = await fetch(PUMPPORTAL_LOCAL_TRADE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(txArgs),
    })

    if (!pumpResponse.ok) {
      const errorText = await pumpResponse.text()
      console.error("[BUNDLE-CREATE] PumpPortal error:", errorText)
      return NextResponse.json(
        { success: false, error: { code: 3004, message: "PumpPortal request failed" } },
        { status: 500 }
      )
    }

    const txPayloads = await pumpResponse.json()
    const txArray = Array.isArray(txPayloads) ? txPayloads : txPayloads?.transactions || []

    if (txArray.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 3005, message: "No transactions returned from PumpPortal" } },
        { status: 500 }
      )
    }

    console.log(`[BUNDLE-CREATE] Received ${txArray.length} transactions`)

    // =========================================================================
    // STEP 4: Sign all transactions
    // =========================================================================
    const signedTransactions: VersionedTransaction[] = []

    // Sign create transaction (index 0)
    const createTx = VersionedTransaction.deserialize(new Uint8Array(bs58.decode(txArray[0])))
    createTx.sign([mintKeypair, creatorKeypair])
    signedTransactions.push(createTx)

    // Sign bundle wallet transactions
    let bundleIndex = 0
    for (const [address, { keypair }] of bundleKeypairs) {
      const txIndex = bundleIndex + 1
      if (txIndex < txArray.length) {
        const tx = VersionedTransaction.deserialize(new Uint8Array(bs58.decode(txArray[txIndex])))
        tx.sign([keypair])
        signedTransactions.push(tx)
      }
      bundleIndex++
    }

    console.log(`[BUNDLE-CREATE] Signed ${signedTransactions.length} transactions`)

    // =========================================================================
    // STEP 5: Submit bundle via Jito
    // =========================================================================
    console.log("[BUNDLE-CREATE] Submitting Jito bundle...")

    const bundleResult = await executeBundle(connection, signedTransactions, {
      retries: 3,
      sequentialFallback: true,
    })

    if (!bundleResult.success) {
      console.error("[BUNDLE-CREATE] Bundle execution failed:", bundleResult.error)
      return NextResponse.json({
        success: false,
        error: { code: 3006, message: bundleResult.error || "Bundle execution failed" },
      }, { status: 500 })
    }

    const creationSignature = bundleResult.signatures[0]
    console.log("[BUNDLE-CREATE] Bundle successful:", {
      bundleId: bundleResult.bundleId,
      method: bundleResult.method,
      signatures: bundleResult.signatures.length,
    })

    // =========================================================================
    // STEP 6: Collect platform fee (ONLY AFTER SUCCESS)
    // =========================================================================
    // Fee structure:
    // - Fixed creation fee: 0.1 SOL
    // - 2% of initial buy + bundle buys
    const totalBuySol = initialBuySol + Array.from(bundleKeypairs.values()).reduce((sum, w) => sum + w.amount, 0)
    const percentageFeeLamports = calculatePlatformFee(solToLamports(totalBuySol))
    const totalFeeLamports = percentageFeeLamports + TOKEN_CREATION_FEE_LAMPORTS

    console.log(`[BUNDLE-CREATE] Collecting fees: ${TOKEN_CREATION_FEE_SOL} SOL (creation) + ${lamportsToSol(percentageFeeLamports)} SOL (2% of ${totalBuySol} SOL) = ${lamportsToSol(totalFeeLamports)} SOL total`)

    // Check for referrer
    const userId = request.headers.get("x-user-id")
    const referrerUserId = userId ? await getReferrer(userId) : null
    let referrerWallet: PublicKey | undefined

    if (referrerUserId) {
      const { data: referrerData } = await (adminClient
        .from("users") as any)
        .select("main_wallet_address")
        .eq("id", referrerUserId)
        .single()

      if (referrerData?.main_wallet_address) {
        referrerWallet = new PublicKey(referrerData.main_wallet_address)
      }
    }

    const feeResult = await collectPlatformFee(
      connection,
      creatorKeypair,
      solToLamports(totalBuySol), // 2% of this amount
      referrerWallet,
      5000, // priority fee
      TOKEN_CREATION_FEE_LAMPORTS // fixed 0.1 SOL creation fee
    )

    // Add referral earnings
    if (feeResult.success && referrerUserId && feeResult.referralShare) {
      await addReferralEarnings(
        referrerUserId,
        lamportsToSol(feeResult.referralShare),
        userId || "anonymous",
        "pumpfun_create"
      )
    }

    // =========================================================================
    // STEP 7: Resolve creator_id from user record
    // =========================================================================
    let finalUserId: string | null = null
    
    if (userId) {
      // Try to find existing user by ID first
      const { data: existingUser } = await adminClient
        .from('users')
        .select('id')
        .eq('id', userId)
        .single() as { data: { id: string } | null; error: any }
      
      if (existingUser) {
        finalUserId = existingUser.id
      } else {
        // Try to find by wallet address
        const { data: existingUserByWallet } = await adminClient
          .from('users')
          .select('id')
          .eq('main_wallet_address', walletAddress)
          .single() as { data: { id: string } | null; error: any }
        
        if (existingUserByWallet) {
          finalUserId = existingUserByWallet.id
        } else {
          // Create new user record
          const { data: newUser, error: userError } = await adminClient
            .from('users')
            .insert({
              id: userId,
              main_wallet_address: walletAddress,
            } as any)
            .select('id')
            .single() as { data: { id: string } | null; error: any }
          
          if (newUser) {
            finalUserId = newUser.id
          } else {
            console.warn('[BUNDLE-CREATE] Failed to create user record:', userError)
          }
        }
      }
    }

    // =========================================================================
    // STEP 8: Save to database
    // =========================================================================
    const { data: tokenRecord, error: dbError } = await adminClient
      .from("tokens")
      .insert({
        creator_id: finalUserId,
        creator_wallet: walletAddress,
        mint_address: mintAddress,
        name,
        symbol,
        description,
        image_url: image,
        website,
        twitter,
        telegram,
        discord,
        total_supply: totalSupply,
        decimals,
        session_id: sessionId,
        stage: "bonding",
        launch_tx_signature: creationSignature,
        initial_buy_sol: body.initialBuySol || 0,
        price_sol: 0,
        price_usd: 0,
        market_cap: 0,
        current_liquidity: body.initialBuySol || 0,
        volume_24h: body.initialBuySol || 0,
        change_24h: 0,
        holders: 1,
        water_level: 50,
        constellation_strength: 50,
        pool_type: poolType,
        quote_mint: quoteType,
        is_platform_token: true,
      } as any)
      .select("id")
      .single() as { data: { id: string } | null; error: any }

    if (dbError) {
      console.error("[BUNDLE-CREATE] Database error:", dbError)
      // Token was created on-chain, so return success with warning
    }
    
    // Create token_parameters record for AQUA settings
    if (tokenRecord?.id) {
      await adminClient.from('token_parameters').insert({
        token_id: tokenRecord.id,
        pour_rate_percent: body.pourRate || 0,
        pour_interval_seconds: body.pourInterval === 'hourly' ? 3600 : 86400,
        pour_source: body.pourSource || 'liquidity',
        pour_enabled: body.pourEnabled ?? false,
        evaporation_rate_percent: body.evaporationRate || 0,
        evaporation_enabled: body.evaporationEnabled ?? false,
        fee_to_liquidity_percent: body.feeToLiquidity || 0,
        fee_to_creator_percent: body.feeToCreator || 0,
        auto_claim_enabled: body.autoClaimEnabled ?? false,
        claim_threshold_sol: body.claimThreshold || 0.1,
        claim_interval_seconds: body.claimInterval === 'hourly' ? 3600 : body.claimInterval === 'daily' ? 86400 : 604800,
        migration_target: body.migrationTarget || 'raydium',
        treasury_wallet: body.treasuryWallet || walletAddress,
        dev_wallet: body.devWallet || walletAddress,
      } as any)
    }

    const duration = Date.now() - startTime
    console.log(`[BUNDLE-CREATE] Complete in ${duration}ms`)

    return NextResponse.json({
      success: true,
      data: {
        tokenId: tokenRecord?.id,
        mintAddress,
        txSignature: creationSignature,
        bundleId: bundleResult.bundleId,
        bundleMethod: bundleResult.method,
        bundleWalletsProcessed: bundleKeypairs.size,
        signatures: bundleResult.signatures,
        platformFee: lamportsToSol(totalFeeLamports),
        duration,
        // Pool info
        pool: poolType,
        quoteMint: quoteType,
      },
    })

  } catch (error) {
    console.error("[BUNDLE-CREATE] Error:", error)
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 5001,
          message: error instanceof Error ? error.message : "Bundle creation failed",
        },
      },
      { status: 500 }
    )
  }
}

