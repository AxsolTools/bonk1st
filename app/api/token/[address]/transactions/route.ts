/**
 * Token Transactions API - Fetch on-chain transaction history
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const HELIUS_API_KEY = process.env.HELIUS_API_KEY
const HELIUS_RPC = process.env.HELIUS_RPC_URL || (HELIUS_API_KEY ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}` : null)

interface Transaction {
  signature: string
  type: "buy" | "sell" | "transfer" | "unknown"
  walletAddress: string
  amountSol: number
  amountTokens: number
  timestamp: number
  status: "confirmed" | "pending" | "failed"
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await context.params
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100)
    const beforeSignature = searchParams.get("before")

    // First try to get transactions from database (for platform tokens)
    const dbTransactions = await fetchDatabaseTransactions(address, limit)

    // Also fetch on-chain transactions via Helius
    const onChainTransactions = await fetchHeliusTransactions(address, limit, beforeSignature)

    // Merge and deduplicate
    const allTransactions = mergeTransactions(dbTransactions, onChainTransactions)
      .slice(0, limit)

    return NextResponse.json({
      success: true,
      data: {
        transactions: allTransactions,
        hasMore: allTransactions.length === limit,
      },
    })
  } catch (error) {
    console.error("[TOKEN-TRANSACTIONS] Error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch transactions" },
      { status: 500 }
    )
  }
}

/**
 * Fetch transactions from database (platform trades)
 */
async function fetchDatabaseTransactions(
  tokenAddress: string,
  limit: number
): Promise<Transaction[]> {
  try {
    // First get token ID
    const { data: token } = await supabase
      .from("tokens")
      .select("id")
      .eq("mint_address", tokenAddress)
      .single()

    if (!token) return []

    // Fetch trades
    const { data: trades, error } = await supabase
      .from("trades")
      .select("*")
      .eq("token_id", token.id)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error || !trades) return []

    return trades.map((trade) => ({
      signature: trade.tx_signature || "",
      type: trade.trade_type as "buy" | "sell",
      walletAddress: trade.wallet_address,
      amountSol: trade.amount_sol || 0,
      amountTokens: trade.amount_tokens || 0,
      timestamp: new Date(trade.created_at).getTime(),
      status: trade.status === "completed" ? "confirmed" : trade.status as Transaction["status"],
    }))
  } catch (error) {
    console.error("[TOKEN-TRANSACTIONS] DB fetch error:", error)
    return []
  }
}

/**
 * Fetch transactions using two-step approach (works on ALL Helius plans):
 * 1. getSignaturesForAddress (standard RPC) - get signatures
 * 2. POST /v0/transactions (Enhanced API) - parse into rich data
 * 
 * Docs: https://www.helius.dev/docs/api-reference/enhanced-transactions/gettransactions
 */
async function fetchHeliusTransactions(
  tokenAddress: string,
  limit: number,
  beforeSignature?: string | null
): Promise<Transaction[]> {
  if (!HELIUS_API_KEY || !HELIUS_RPC) {
    console.log("[TOKEN-TRANSACTIONS] No HELIUS_API_KEY configured")
    return []
  }

  console.log("[TOKEN-TRANSACTIONS] Fetching for token:", tokenAddress.slice(0, 8))

  try {
    // Step 1: Get signatures using standard RPC (works on all plans)
    const sigResponse = await fetch(HELIUS_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "sigs",
        method: "getSignaturesForAddress",
        params: [
          tokenAddress,
          { 
            limit: Math.min(limit, 50),
            ...(beforeSignature ? { before: beforeSignature } : {})
          }
        ]
      }),
      signal: AbortSignal.timeout(10000)
    })

    if (!sigResponse.ok) {
      console.warn("[TOKEN-TRANSACTIONS] getSignaturesForAddress error:", sigResponse.status)
      return []
    }

    const sigData = await sigResponse.json()
    const signatures: SignatureInfo[] = (sigData.result || []).filter((s: SignatureInfo) => s.err === null)
    
    if (signatures.length === 0) {
      console.log("[TOKEN-TRANSACTIONS] No signatures found")
      return []
    }
    
    console.log("[TOKEN-TRANSACTIONS] Found", signatures.length, "signatures")

    // Step 2: Get enhanced transaction data using GET /v0/addresses/{address}/transactions
    // Docs: https://www.helius.dev/docs/api-reference/enhanced-transactions/gettransactionsbyaddress
    const enhancedUrl = new URL(`https://api-mainnet.helius-rpc.com/v0/addresses/${tokenAddress}/transactions`)
    enhancedUrl.searchParams.set("api-key", HELIUS_API_KEY)
    if (beforeSignature) {
      enhancedUrl.searchParams.set("before", beforeSignature)
    }
    
    const enhancedResponse = await fetch(enhancedUrl.toString(), {
      method: "GET",
      signal: AbortSignal.timeout(15000)
    })

    if (!enhancedResponse.ok) {
      const errorText = await enhancedResponse.text().catch(() => "")
      console.warn("[TOKEN-TRANSACTIONS] Enhanced API error:", enhancedResponse.status, errorText.slice(0, 200))
      // Return basic data from signatures
      return signatures.slice(0, limit).map((sig) => ({
        signature: sig.signature,
        type: "unknown" as const,
        walletAddress: "",
        amountSol: 0,
        amountTokens: 0,
        timestamp: (sig.blockTime || 0) * 1000,
        status: "confirmed" as const,
      }))
    }

    const enhancedTxs: EnhancedTransaction[] = await enhancedResponse.json()
    
    if (!Array.isArray(enhancedTxs)) {
      console.warn("[TOKEN-TRANSACTIONS] Unexpected enhanced response format")
      return signatures.slice(0, limit).map((sig) => ({
        signature: sig.signature,
        type: "unknown" as const,
        walletAddress: "",
        amountSol: 0,
        amountTokens: 0,
        timestamp: (sig.blockTime || 0) * 1000,
        status: "confirmed" as const,
      }))
    }

    console.log("[TOKEN-TRANSACTIONS] Enhanced data for", enhancedTxs.length, "transactions")

    // Map enhanced transactions to our format
    return enhancedTxs
      .slice(0, limit)
      .map((tx): Transaction => {
        const isBuy = isTokenBuy(tx, tokenAddress)
        const solAmount = extractSolAmount(tx)
        const tokenAmount = extractTokenAmount(tx, tokenAddress)
        
        // Debug log for first few transactions
        if (enhancedTxs.indexOf(tx) < 3) {
          console.log("[TOKEN-TRANSACTIONS] TX:", tx.signature?.slice(0, 12), 
            "type:", tx.type,
            "isBuy:", isBuy,
            "SOL:", solAmount.toFixed(6),
            "tokens:", tokenAmount
          )
        }
        
        return {
          signature: tx.signature || "",
          type: isBuy ? "buy" as const : "sell" as const,
          walletAddress: tx.feePayer || "",
          amountSol: solAmount,
          amountTokens: tokenAmount,
          timestamp: (tx.timestamp || 0) * 1000,
          status: "confirmed" as const,
        }
      })
      .filter((tx) => tx.signature)
  } catch (error) {
    if (error instanceof Error && error.name !== 'AbortError') {
      console.error("[TOKEN-TRANSACTIONS] Helius fetch error:", error)
    }
    return []
  }
}

// Enhanced Transaction format from Helius POST /v0/transactions API
interface EnhancedTransaction {
  signature: string
  timestamp?: number
  slot?: number
  feePayer?: string
  type?: string
  description?: string
  nativeTransfers?: Array<{
    amount: number
    fromUserAccount: string
    toUserAccount: string
  }>
  tokenTransfers?: Array<{
    mint: string
    tokenAmount: number
    fromUserAccount: string
    toUserAccount: string
  }>
  accountData?: Array<{
    account: string
    nativeBalanceChange: number
    tokenBalanceChanges?: Array<{
      mint: string
      rawTokenAmount: { tokenAmount: string; decimals: number }
      userAccount: string
    }>
  }>
  events?: {
    swap?: {
      nativeInput?: { account: string; amount: number }
      nativeOutput?: { account: string; amount: number }
      tokenInputs?: Array<{ mint: string; rawTokenAmount: { tokenAmount: string; decimals: number } }>
      tokenOutputs?: Array<{ mint: string; rawTokenAmount: { tokenAmount: string; decimals: number } }>
    }
  }
}

/**
 * Determine if transaction is a buy (tokens going to the fee payer)
 */
function isTokenBuy(tx: EnhancedTransaction, tokenAddress: string): boolean {
  // Check swap events first
  if (tx.events?.swap) {
    const swap = tx.events.swap
    if (swap.nativeInput && swap.tokenOutputs && swap.tokenOutputs.length > 0) {
      return true // SOL in, tokens out = buy
    }
    if (swap.nativeOutput && swap.tokenInputs && swap.tokenInputs.length > 0) {
      return false // tokens in, SOL out = sell
    }
  }

  // Check token transfers
  if (tx.tokenTransfers) {
    const transfer = tx.tokenTransfers.find(t => t.mint === tokenAddress)
    if (transfer) {
      return transfer.toUserAccount === tx.feePayer
    }
  }
  
  // Check account data
  if (tx.accountData) {
    const feePayerData = tx.accountData.find(a => a.account === tx.feePayer)
    if (feePayerData?.tokenBalanceChanges) {
      const tokenChange = feePayerData.tokenBalanceChanges.find(t => t.mint === tokenAddress)
      if (tokenChange) {
        return parseFloat(tokenChange.rawTokenAmount.tokenAmount) > 0
      }
    }
  }
  
  return false
}

/**
 * Extract SOL amount from transaction
 */
function extractSolAmount(tx: EnhancedTransaction): number {
  // Check swap events
  if (tx.events?.swap) {
    const swap = tx.events.swap
    if (swap.nativeInput?.amount) return swap.nativeInput.amount / 1e9
    if (swap.nativeOutput?.amount) return swap.nativeOutput.amount / 1e9
  }

  // Check native transfers
  if (tx.nativeTransfers && tx.nativeTransfers.length > 0) {
    let maxAmount = 0
    for (const transfer of tx.nativeTransfers) {
      if (transfer.amount > 1_000_000) { // > 0.001 SOL
        maxAmount = Math.max(maxAmount, transfer.amount)
      }
    }
    if (maxAmount > 0) return maxAmount / 1e9
  }
  
  // Check account data
  if (tx.accountData) {
    let maxChange = 0
    for (const account of tx.accountData) {
      const change = Math.abs(account.nativeBalanceChange || 0)
      if (change > 1_000_000) {
        maxChange = Math.max(maxChange, change)
      }
    }
    if (maxChange > 0) return maxChange / 1e9
  }
  
  return 0
}

/**
 * Extract token amount from transaction
 */
function extractTokenAmount(tx: EnhancedTransaction, tokenAddress: string): number {
  // Check swap events
  if (tx.events?.swap) {
    const swap = tx.events.swap
    if (swap.tokenOutputs) {
      const out = swap.tokenOutputs.find(t => t.mint === tokenAddress) || swap.tokenOutputs[0]
      if (out?.rawTokenAmount) {
        return Math.abs(parseFloat(out.rawTokenAmount.tokenAmount) / Math.pow(10, out.rawTokenAmount.decimals))
      }
    }
    if (swap.tokenInputs) {
      const inp = swap.tokenInputs.find(t => t.mint === tokenAddress) || swap.tokenInputs[0]
      if (inp?.rawTokenAmount) {
        return Math.abs(parseFloat(inp.rawTokenAmount.tokenAmount) / Math.pow(10, inp.rawTokenAmount.decimals))
      }
    }
  }

  // Check token transfers
  if (tx.tokenTransfers) {
    const transfer = tx.tokenTransfers.find(t => t.mint === tokenAddress)
    if (transfer?.tokenAmount) return Math.abs(transfer.tokenAmount)
  }
  
  // Check account data
  if (tx.accountData) {
    for (const account of tx.accountData) {
      if (account.tokenBalanceChanges) {
        const change = account.tokenBalanceChanges.find(t => t.mint === tokenAddress)
        if (change?.rawTokenAmount) {
          return Math.abs(parseFloat(change.rawTokenAmount.tokenAmount) / Math.pow(10, change.rawTokenAmount.decimals))
        }
      }
    }
  }
  
  return 0
}

// Signature info from getSignaturesForAddress
interface SignatureInfo {
  signature: string
  slot: number
  blockTime: number | null
  err: unknown | null
  memo: string | null
  confirmationStatus: string
}

/**
 * Merge and deduplicate transactions from multiple sources
 */
function mergeTransactions(db: Transaction[], onChain: Transaction[]): Transaction[] {
  const seen = new Set<string>()
  const merged: Transaction[] = []

  // Add DB transactions first (they have more accurate data for platform trades)
  for (const tx of db) {
    if (tx.signature && !seen.has(tx.signature)) {
      seen.add(tx.signature)
      merged.push(tx)
    }
  }

  // Add on-chain transactions that aren't in DB
  for (const tx of onChain) {
    if (tx.signature && !seen.has(tx.signature)) {
      seen.add(tx.signature)
      merged.push(tx)
    }
  }

  // Sort by timestamp descending
  return merged.sort((a, b) => b.timestamp - a.timestamp)
}
