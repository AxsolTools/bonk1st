/**
 * AQUA Launchpad - Anti-Sniper Auto-Sell API
 * 
 * Executes automatic sell of bundle wallets when sniper activity is detected.
 * Called by the monitoring system or can be triggered manually.
 * 
 * POST /api/token22/anti-sniper/sell
 * {
 *   tokenMint: string,
 *   walletIds: string[],
 *   sellPercentage: number,
 *   reason: 'sniper_detected' | 'take_profit' | 'manual',
 *   triggerTrade?: TradeEvent,
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { Connection, Keypair, PublicKey, VersionedTransaction } from '@solana/web3.js'
import { getAssociatedTokenAddress, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import bs58 from 'bs58'
import { getAdminClient } from '@/lib/supabase/admin'
import { decryptPrivateKey, getOrCreateServiceSalt } from '@/lib/crypto'

// ============================================================================
// CONFIGURATION
// ============================================================================

const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com'
const PUMPPORTAL_LOCAL_TRADE = 'https://pumpportal.fun/api/trade-local'
const MAX_RETRIES = 3
const JITO_TIP_LAMPORTS = 10000 // 0.00001 SOL tip for priority

// ============================================================================
// TYPES
// ============================================================================

interface TradeEvent {
  signature: string
  slot: number
  traderWallet: string
  type: 'buy' | 'sell'
  solAmount: number
  tokenAmount: number
  timestamp: number
}

interface SellRequest {
  tokenMint: string
  walletIds: string[]
  sellPercentage: number
  reason: 'sniper_detected' | 'take_profit' | 'manual'
  triggerTrade?: TradeEvent
}

interface WalletSellResult {
  walletId: string
  walletAddress: string
  success: boolean
  txSignature?: string
  tokensSold?: number
  solReceived?: number
  error?: string
}

// ============================================================================
// HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const sessionId = request.headers.get('x-session-id')
    const isInternalCall = request.headers.get('x-internal-call') === 'true'

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: { code: 1001, message: 'Session required' } },
        { status: 401 }
      )
    }

    const body: SellRequest = await request.json()
    const {
      tokenMint,
      walletIds,
      sellPercentage,
      reason,
      triggerTrade,
    } = body

    if (!tokenMint || !walletIds || walletIds.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 4001, message: 'Invalid request' } },
        { status: 400 }
      )
    }

    console.log(`[ANTI-SNIPER-SELL] Executing auto-sell for ${tokenMint}`, {
      reason,
      walletCount: walletIds.length,
      sellPercentage,
      triggerTrader: triggerTrade?.traderWallet?.slice(0, 8),
      triggerAmount: triggerTrade?.solAmount,
    })

    const adminClient = getAdminClient()
    const connection = new Connection(HELIUS_RPC_URL, 'confirmed')
    const serviceSalt = await getOrCreateServiceSalt(adminClient)

    // Get wallet details from database
    // Cast to any to bypass strict Supabase typing (table schema not in generated types)
    const { data: wallets, error: walletsError } = await (adminClient
      .from('wallets') as any)
      .select('id, public_key, encrypted_private_key, label')
      .eq('session_id', sessionId)
      .in('id', walletIds)

    if (walletsError || !wallets || wallets.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 1003, message: 'No wallets found' } },
        { status: 404 }
      )
    }

    console.log(`[ANTI-SNIPER-SELL] Found ${wallets.length} wallets to sell`)

    // Determine token program (Token or Token-2022)
    const tokenProgram = await detectTokenProgram(connection, tokenMint)
    console.log(`[ANTI-SNIPER-SELL] Token program: ${tokenProgram === TOKEN_2022_PROGRAM_ID ? 'Token-2022' : 'SPL Token'}`)

    const results: WalletSellResult[] = []

    // Execute sells for each wallet
    for (const wallet of wallets) {
      try {
        // Decrypt private key
        const privateKeyBase58 = decryptPrivateKey(
          wallet.encrypted_private_key,
          sessionId,
          serviceSalt
        )
        const keypair = Keypair.fromSecretKey(bs58.decode(privateKeyBase58))

        // Get token balance
        const tokenBalance = await getTokenBalance(
          connection,
          wallet.public_key,
          tokenMint,
          tokenProgram
        )

        if (tokenBalance <= 0) {
          console.log(`[ANTI-SNIPER-SELL] Wallet ${wallet.public_key.slice(0, 8)} has no tokens, skipping`)
          results.push({
            walletId: wallet.id,
            walletAddress: wallet.public_key,
            success: false,
            error: 'No tokens to sell',
          })
          continue
        }

        // Calculate amount to sell
        const sellAmount = Math.floor(tokenBalance * (sellPercentage / 100))
        console.log(`[ANTI-SNIPER-SELL] Selling ${sellAmount} tokens from ${wallet.public_key.slice(0, 8)} (${sellPercentage}% of ${tokenBalance})`)

        // Execute the sell
        const sellResult = await executeSell(
          connection,
          keypair,
          tokenMint,
          sellAmount
        )

        results.push({
          walletId: wallet.id,
          walletAddress: wallet.public_key,
          success: sellResult.success,
          txSignature: sellResult.signature,
          tokensSold: sellAmount,
          solReceived: sellResult.solReceived,
          error: sellResult.error,
        })

        // Log the trade
        await (adminClient.from('trades') as any).insert({
          wallet_address: wallet.public_key,
          token_address: tokenMint,
          trade_type: 'sell',
          amount_sol: sellResult.solReceived || 0,
          token_amount: sellAmount,
          tx_signature: sellResult.signature,
          status: sellResult.success ? 'confirmed' : 'failed',
          source: 'anti_sniper',
          metadata: {
            reason,
            triggerTrade: triggerTrade ? {
              signature: triggerTrade.signature,
              trader: triggerTrade.traderWallet,
              solAmount: triggerTrade.solAmount,
            } : null,
          },
        })

      } catch (error) {
        console.error(`[ANTI-SNIPER-SELL] Failed for wallet ${wallet.public_key}:`, error)
        results.push({
          walletId: wallet.id,
          walletAddress: wallet.public_key,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    const successCount = results.filter(r => r.success).length
    const totalSolReceived = results.reduce((sum, r) => sum + (r.solReceived || 0), 0)
    const totalTokensSold = results.reduce((sum, r) => sum + (r.tokensSold || 0), 0)
    const duration = Date.now() - startTime

    console.log(`[ANTI-SNIPER-SELL] Complete:`, {
      successCount,
      totalCount: results.length,
      totalSolReceived,
      totalTokensSold,
      duration,
    })

    // Log anti-sniper event
    await (adminClient.from('anti_sniper_events') as any).insert({
      token_mint: tokenMint,
      session_id: sessionId,
      event_type: reason,
      trigger_trade: triggerTrade || null,
      wallets_sold: results.filter(r => r.success).map(r => r.walletAddress),
      total_tokens_sold: totalTokensSold,
      total_sol_received: totalSolReceived,
      results,
      duration_ms: duration,
    })

    // Send notification (toast will be handled by the frontend polling)

    return NextResponse.json({
      success: successCount > 0,
      data: {
        reason,
        tokenMint,
        successCount,
        totalCount: results.length,
        totalTokensSold,
        totalSolReceived,
        results,
        duration,
        triggerTrade: triggerTrade ? {
          signature: triggerTrade.signature,
          trader: triggerTrade.traderWallet,
          solAmount: triggerTrade.solAmount,
        } : null,
      },
    })

  } catch (error) {
    console.error('[ANTI-SNIPER-SELL] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 5001,
          message: error instanceof Error ? error.message : 'Auto-sell failed',
        },
      },
      { status: 500 }
    )
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function detectTokenProgram(
  connection: Connection,
  tokenMint: string
): Promise<PublicKey> {
  try {
    const mintPubkey = new PublicKey(tokenMint)
    const accountInfo = await connection.getAccountInfo(mintPubkey)
    
    if (accountInfo?.owner.equals(TOKEN_2022_PROGRAM_ID)) {
      return TOKEN_2022_PROGRAM_ID
    }
    
    return TOKEN_PROGRAM_ID
  } catch {
    return TOKEN_PROGRAM_ID
  }
}

async function getTokenBalance(
  connection: Connection,
  walletAddress: string,
  tokenMint: string,
  tokenProgram: PublicKey
): Promise<number> {
  try {
    const walletPubkey = new PublicKey(walletAddress)
    const mintPubkey = new PublicKey(tokenMint)
    
    const ata = await getAssociatedTokenAddress(
      mintPubkey,
      walletPubkey,
      false,
      tokenProgram
    )

    const balance = await connection.getTokenAccountBalance(ata)
    return Number(balance.value.amount)
  } catch {
    return 0
  }
}

async function executeSell(
  connection: Connection,
  keypair: Keypair,
  tokenMint: string,
  amount: number,
  retries = MAX_RETRIES
): Promise<{ success: boolean; signature?: string; solReceived?: number; error?: string }> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`[ANTI-SNIPER-SELL] Attempt ${attempt}/${retries} for sell`)

      // Build trade request via PumpPortal
      const tradeBody = {
        publicKey: keypair.publicKey.toBase58(),
        action: 'sell',
        mint: tokenMint,
        denominatedInSol: 'false',
        amount: amount,
        slippage: 50, // 50% slippage for emergency sell (sniper response)
        priorityFee: 0.0001,
        pool: 'pump',
      }

      const response = await fetch(PUMPPORTAL_LOCAL_TRADE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tradeBody),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`PumpPortal error: ${errorText}`)
      }

      // Deserialize and sign
      const txBytes = new Uint8Array(await response.arrayBuffer())
      const tx = VersionedTransaction.deserialize(txBytes)
      tx.sign([keypair])

      // Send with preflight skip for speed
      const signature = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: true,
        maxRetries: 2,
      })

      // Wait for confirmation
      const confirmation = await connection.confirmTransaction(signature, 'confirmed')
      
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`)
      }

      // Get SOL received from transaction
      const txInfo = await connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
      })
      
      let solReceived = 0
      if (txInfo?.meta) {
        const preBalance = txInfo.meta.preBalances[0] || 0
        const postBalance = txInfo.meta.postBalances[0] || 0
        solReceived = (postBalance - preBalance) / 1e9
      }

      return {
        success: true,
        signature,
        solReceived,
      }

    } catch (error) {
      console.error(`[ANTI-SNIPER-SELL] Attempt ${attempt} failed:`, error)
      
      if (attempt === retries) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Sell failed',
        }
      }

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 500 * attempt))
    }
  }

  return { success: false, error: 'Max retries exceeded' }
}

