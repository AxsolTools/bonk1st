/**
 * Helius Webhook Endpoint
 * Receives real-time notifications for blockchain events
 * 
 * CREDIT COSTS: 1 credit per webhook event received
 * 
 * This endpoint handles:
 * - Token transfers (buys/sells)
 * - Account changes
 * - Transaction confirmations
 * - Pre-pump detection signals (feeds into prepump-engine)
 * 
 * To set up webhooks:
 * 1. Go to https://dashboard.helius.dev/webhooks
 * 2. Create a new webhook pointing to this endpoint
 * 3. Select the events and addresses to monitor
 * 
 * OR use the API:
 * POST https://api.helius.xyz/v0/webhooks?api-key=YOUR_KEY
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { recordTransaction, startCleanup, getEngineStats } from '@/lib/api/prepump-engine'

// Start cleanup on module load
startCleanup()

// Webhook secret for verification (set in Helius dashboard)
const WEBHOOK_SECRET = process.env.HELIUS_WEBHOOK_SECRET

// Supabase client for storing events
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Types for Helius webhook payloads
interface WebhookPayload {
  webhookType: string
  webhookId: string
  timestamp: string
  data: TransactionData[]
}

interface TransactionData {
  signature: string
  timestamp: number
  slot: number
  type: string
  source: string
  fee: number
  feePayer: string
  description?: string
  nativeTransfers?: NativeTransfer[]
  tokenTransfers?: TokenTransfer[]
  accountData?: AccountData[]
  events?: {
    swap?: SwapEvent
    transfer?: TransferEvent
  }
}

interface NativeTransfer {
  amount: number
  fromUserAccount: string
  toUserAccount: string
}

interface TokenTransfer {
  mint: string
  tokenAmount: number
  fromUserAccount: string
  toUserAccount: string
  tokenStandard: string
}

interface AccountData {
  account: string
  nativeBalanceChange: number
  tokenBalanceChanges: {
    mint: string
    rawTokenAmount: { tokenAmount: string; decimals: number }
    userAccount: string
  }[]
}

interface SwapEvent {
  tokenInputs: { mint: string; amount: number }[]
  tokenOutputs: { mint: string; amount: number }[]
  nativeInput: { amount: number } | null
  nativeOutput: { amount: number } | null
  innerSwaps: unknown[]
}

interface TransferEvent {
  amount: number
  fromUserAccount: string
  toUserAccount: string
}

// In-memory event buffer for high-throughput scenarios
// Can be replaced with Redis for production
const eventBuffer: Map<string, TransactionData> = new Map()
let flushTimeout: ReturnType<typeof setTimeout> | null = null

/**
 * POST handler for Helius webhook events
 */
export async function POST(request: NextRequest) {
  try {
    // Verify webhook authentication if secret is configured
    if (WEBHOOK_SECRET) {
      const authHeader = request.headers.get('authorization')
      
      // Helius sends the auth header you configured in the dashboard
      // Format: "Bearer your_secret_here"
      const expectedAuth = `Bearer ${WEBHOOK_SECRET}`
      
      if (!authHeader || authHeader !== expectedAuth) {
        console.warn('[WEBHOOK] Invalid or missing authorization header')
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const payload: WebhookPayload = await request.json()
    
    console.log('[WEBHOOK] Received:', {
      type: payload.webhookType,
      id: payload.webhookId,
      eventCount: payload.data?.length || 0,
    })

    // Process each transaction in the payload
    for (const tx of payload.data || []) {
      await processTransaction(tx)
    }

    // Schedule buffer flush if we have events
    if (eventBuffer.size > 0 && !flushTimeout) {
      flushTimeout = setTimeout(flushEventBuffer, 1000)
    }

    return NextResponse.json({ 
      success: true, 
      processed: payload.data?.length || 0 
    })
  } catch (error) {
    console.error('[WEBHOOK] Error processing payload:', error)
    return NextResponse.json(
      { error: 'Failed to process webhook' },
      { status: 500 }
    )
  }
}

/**
 * Process a single transaction from webhook
 */
async function processTransaction(tx: TransactionData): Promise<void> {
  // Skip if we've already processed this transaction
  if (eventBuffer.has(tx.signature)) {
    return
  }

  // Add to buffer for batch processing
  eventBuffer.set(tx.signature, tx)

  // Determine transaction type and extract relevant data
  const txType = determineTransactionType(tx)
  
  if (txType === 'swap' || txType === 'buy' || txType === 'sell') {
    await processSwapTransaction(tx, txType)
  } else if (txType === 'transfer') {
    await processTransferTransaction(tx)
  }
}

/**
 * Determine the type of transaction
 */
function determineTransactionType(tx: TransactionData): string {
  // Check for swap events
  if (tx.events?.swap) {
    const hasNativeInput = tx.events.swap.nativeInput && tx.events.swap.nativeInput.amount > 0
    const hasNativeOutput = tx.events.swap.nativeOutput && tx.events.swap.nativeOutput.amount > 0
    
    if (hasNativeInput && !hasNativeOutput) return 'buy'
    if (!hasNativeInput && hasNativeOutput) return 'sell'
    return 'swap'
  }

  // Check for transfer events
  if (tx.events?.transfer || tx.tokenTransfers?.length) {
    return 'transfer'
  }

  // Check based on type field
  if (tx.type?.toUpperCase() === 'SWAP') return 'swap'
  if (tx.type?.toUpperCase() === 'TRANSFER') return 'transfer'

  return 'unknown'
}

/**
 * Process swap/buy/sell transactions
 * Store in database for display in Recent Trades panel
 * Feed into pre-pump detection engine
 */
async function processSwapTransaction(tx: TransactionData, type: string): Promise<void> {
  try {
    // Extract token address and amounts
    let tokenMint = ''
    let tokenAmount = 0
    let solAmount = 0

    if (tx.events?.swap) {
      const swap = tx.events.swap
      
      // Get token mint (the non-SOL token)
      const tokenInput = swap.tokenInputs?.[0]
      const tokenOutput = swap.tokenOutputs?.[0]
      
      tokenMint = tokenInput?.mint || tokenOutput?.mint || ''
      tokenAmount = tokenInput?.amount || tokenOutput?.amount || 0
      
      // Get SOL amount
      solAmount = (swap.nativeInput?.amount || swap.nativeOutput?.amount || 0) / 1e9
    } else if (tx.tokenTransfers?.length) {
      // Fallback to token transfers
      const transfer = tx.tokenTransfers[0]
      tokenMint = transfer.mint
      tokenAmount = transfer.tokenAmount
      
      // Try to get SOL from native transfers
      if (tx.nativeTransfers?.length) {
        solAmount = tx.nativeTransfers.reduce((sum, t) => sum + Math.abs(t.amount), 0) / 1e9
      }
    }

    if (!tokenMint) return

    // ========== FEED INTO PRE-PUMP ENGINE ==========
    // Record this transaction for pre-pump signal calculation
    // This happens for ALL tokens, not just our platform tokens
    recordTransaction({
      tokenAddress: tokenMint,
      wallet: tx.feePayer,
      type: type === 'buy' ? 'buy' : 'sell',
      amountSOL: solAmount,
      signature: tx.signature,
      timestamp: tx.timestamp * 1000, // Convert to ms
    })

    // Look up token in our database
    const { data: token } = await supabase
      .from('tokens')
      .select('id')
      .eq('mint_address', tokenMint)
      .single()

    if (!token) {
      // Token not in our platform, but we still track it for pre-pump signals
      return
    }

    // Insert trade record
    await supabase.from('trades').insert({
      token_id: token.id,
      tx_signature: tx.signature,
      trade_type: type === 'buy' ? 'buy' : 'sell',
      wallet_address: tx.feePayer,
      amount_sol: solAmount,
      amount_tokens: tokenAmount,
      status: 'completed',
      created_at: new Date(tx.timestamp * 1000).toISOString(),
    })

    console.log('[WEBHOOK] Trade recorded:', {
      type,
      token: tokenMint.slice(0, 8),
      sol: solAmount.toFixed(4),
      tokens: tokenAmount,
    })
  } catch (error) {
    console.error('[WEBHOOK] Failed to process swap:', error)
  }
}

/**
 * Process transfer transactions
 */
async function processTransferTransaction(tx: TransactionData): Promise<void> {
  // Log transfer for monitoring
  console.log('[WEBHOOK] Transfer:', {
    signature: tx.signature.slice(0, 8),
    feePayer: tx.feePayer.slice(0, 8),
    transfers: tx.tokenTransfers?.length || 0,
  })
  
  // Can be extended to:
  // - Track holder changes
  // - Detect whale movements
  // - Update token analytics
}

/**
 * Flush buffered events to prevent memory buildup
 */
function flushEventBuffer(): void {
  const size = eventBuffer.size
  if (size > 100) {
    // Keep only the most recent 100 events
    const entries = Array.from(eventBuffer.entries())
    const toRemove = entries.slice(0, size - 100)
    for (const [key] of toRemove) {
      eventBuffer.delete(key)
    }
  }
  flushTimeout = null
}

/**
 * GET handler for webhook health check
 */
export async function GET() {
  const engineStats = getEngineStats()
  
  return NextResponse.json({
    status: 'ok',
    service: 'helius-webhook',
    timestamp: new Date().toISOString(),
    bufferSize: eventBuffer.size,
    prepumpEngine: engineStats,
  })
}

