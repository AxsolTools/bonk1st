"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { createClient } from "@/lib/supabase/client"
import { GlassPanel } from "@/components/ui/glass-panel"
import { cn } from "@/lib/utils"
import { useLogsSubscription, useHeliusWebSocketState, useHeliusConnect } from "@/hooks/use-helius-websocket"
import { tradeEvents, type TradeEvent } from "@/lib/events/trade-events"

interface Transaction {
  signature: string
  type: "buy" | "sell" | "transfer" | "unknown"
  walletAddress: string
  amountSol: number
  amountTokens: number
  timestamp: number
  status: "confirmed" | "pending" | "failed"
}

interface TransactionHistoryProps {
  tokenAddress: string
  tokenId?: string
}

export function TransactionHistory({ tokenAddress, tokenId }: TransactionHistoryProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const pendingSignatures = useRef<Set<string>>(new Set())
  const hasInitializedWs = useRef(false)
  
  // WebSocket state for UI indicator
  const wsState = useHeliusWebSocketState()
  const { connect } = useHeliusConnect()
  
  // Initialize WebSocket connection on mount (fix deadlock)
  useEffect(() => {
    if (!hasInitializedWs.current) {
      hasInitializedWs.current = true
      connect().catch(() => {
        // Silently fail - will fallback to polling
      })
    }
  }, [connect])

  // Fetch transactions from API (combines on-chain + database)
  const fetchTransactions = useCallback(async () => {
    try {
      setError(null)
      const response = await fetch(`/api/token/${tokenAddress}/transactions?limit=50`)
      
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setTransactions(data.data?.transactions || [])
        }
      } else {
        console.warn('[TRANSACTIONS] API error:', response.status)
      }
    } catch (err) {
      console.warn('[TRANSACTIONS] Fetch error:', err)
      setError("Failed to load transactions")
    } finally {
      setIsLoading(false)
    }
  }, [tokenAddress])

  // Initial fetch
  useEffect(() => {
    fetchTransactions()
  }, [fetchTransactions])

  // WebSocket subscription for real-time updates
  // FIXED: Always pass tokenAddress (removed wsState.isConnected conditional that caused deadlock)
  // The hook will handle connection internally
  useLogsSubscription(
    tokenAddress, // Always subscribe - hook will attempt connection
    useCallback((logs) => {
      // New transaction detected via WebSocket!
      const signature = logs.signature
      
      // Avoid duplicate processing for the same signature
      if (pendingSignatures.current.has(signature)) return
      pendingSignatures.current.add(signature)
      
      // Parse transaction type from logs (instant - no indexing delay!)
      // Safety check - logs.logs might not be an array
      const logArray = Array.isArray(logs.logs) ? logs.logs : []
      const isBuy = parseIsBuyFromLogs(logArray)
      const solAmount = parseSolAmountFromLogs(logArray)
      
      // Immediately add to UI as pending (no waiting for Helius indexing!)
      if (signature && (isBuy !== null || solAmount > 0)) {
        const newTx: Transaction = {
          signature,
          type: isBuy ? "buy" : "sell",
          walletAddress: "", // Will be filled when confirmed
          amountSol: solAmount,
          amountTokens: 0,
          timestamp: Date.now(),
          status: "pending",
        }
        
        setTransactions(prev => {
          if (prev.some(t => t.signature === signature)) return prev
          return [newTx, ...prev].slice(0, 50)
        })
        
        console.log('[TRANSACTIONS] WebSocket detected:', signature.slice(0, 12), isBuy ? 'BUY' : 'SELL')
      }
      
      // Also fetch full details after a delay (to get accurate amounts)
      setTimeout(() => {
        fetchTransactions()
        pendingSignatures.current.delete(signature)
      }, 3000) // 3 seconds - transaction should be indexed by then
    }, [fetchTransactions])
  )
  
  // Subscribe to instant platform trade events
  useEffect(() => {
    const unsubscribe = tradeEvents.subscribe(tokenAddress, (event: TradeEvent) => {
      // Immediately add platform trades to UI
      const newTx: Transaction = {
        signature: event.signature,
        type: event.type,
        walletAddress: event.walletAddress,
        amountSol: event.amountSol,
        amountTokens: event.amountTokens,
        timestamp: event.timestamp,
        status: event.status,
      }
      
      setTransactions(prev => {
        // Update existing or add new
        const existingIdx = prev.findIndex(t => t.signature === event.signature)
        if (existingIdx >= 0) {
          // Update status
          const updated = [...prev]
          updated[existingIdx] = { ...updated[existingIdx], status: event.status }
          return updated
        }
        return [newTx, ...prev].slice(0, 50)
      })
    })
    
    return unsubscribe
  }, [tokenAddress])

  // Fallback polling when WebSocket is not connected (less frequent)
  useEffect(() => {
    // If WebSocket is connected, use less frequent polling as backup
    // If not connected, poll every 5 seconds
    const interval = wsState.isConnected ? 30_000 : 5_000
    const timer = setInterval(fetchTransactions, interval)
    return () => clearInterval(timer)
  }, [fetchTransactions, wsState.isConnected])

  // Real-time subscription for platform trades
  useEffect(() => {
    if (!tokenId || tokenId.startsWith('external-')) return

    const supabase = createClient()
    const channel = supabase
      .channel(`txns-${tokenId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "trades", filter: `token_id=eq.${tokenId}` },
        (payload) => {
          const trade = payload.new as {
            tx_signature: string
            trade_type: string
            wallet_address: string
            amount_sol: number
            amount_tokens: number
            created_at: string
            status: string
          }
          
          const newTx: Transaction = {
            signature: trade.tx_signature || "",
            type: trade.trade_type as "buy" | "sell",
            walletAddress: trade.wallet_address,
            amountSol: trade.amount_sol || 0,
            amountTokens: trade.amount_tokens || 0,
            timestamp: new Date(trade.created_at).getTime(),
            status: trade.status === "completed" ? "confirmed" : "pending",
          }
          
          setTransactions((prev) => {
            // Avoid duplicates
            if (prev.some(t => t.signature === newTx.signature)) return prev
            return [newTx, ...prev].slice(0, 50)
          })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [tokenId])

  const formatAddress = (addr: string) => {
    if (!addr || addr.length < 8) return addr || "..."
    return `${addr.slice(0, 4)}...${addr.slice(-4)}`
  }
  
  // Helper: Parse if transaction is a buy from program logs
  function parseIsBuyFromLogs(logs: string[]): boolean | null {
    for (const log of logs) {
      // Pump.fun logs
      if (log.includes('Instruction: Buy')) return true
      if (log.includes('Instruction: Sell')) return false
      // Jupiter logs
      if (log.includes('Swap') && log.includes('SOL')) {
        // If SOL is being spent (before token), it's a buy
        const solIndex = log.indexOf('SOL')
        const tokenIndex = log.indexOf('token')
        if (tokenIndex > 0 && solIndex < tokenIndex) return true
        if (solIndex > tokenIndex) return false
      }
    }
    return null
  }
  
  // Helper: Parse SOL amount from program logs (rough estimate)
  function parseSolAmountFromLogs(logs: string[]): number {
    for (const log of logs) {
      // Look for lamport transfers
      const match = log.match(/(\d+)\s*lamports?/i)
      if (match) {
        const lamports = parseInt(match[1], 10)
        if (lamports > 1_000_000 && lamports < 100_000_000_000) { // 0.001 - 100 SOL
          return lamports / 1e9
        }
      }
      // Look for SOL amount patterns
      const solMatch = log.match(/(\d+\.?\d*)\s*SOL/i)
      if (solMatch) {
        return parseFloat(solMatch[1])
      }
    }
    return 0
  }

  const formatSolAmount = (amount: number) => {
    if (!amount || amount === 0) return "0.0000"
    if (amount < 0.0001) return "<0.0001"
    if (amount < 0.01) return amount.toFixed(6)
    if (amount < 1) return amount.toFixed(4)
    return amount.toFixed(2)
  }
  
  const formatTime = (timestamp: number) => {
    const now = Date.now()
    const diff = (now - timestamp) / 1000

    if (diff < 60) return `${Math.floor(diff)}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return new Date(timestamp).toLocaleDateString()
  }

  const openExplorer = (signature: string) => {
    if (signature) {
      window.open(`https://solscan.io/tx/${signature}`, "_blank")
    }
  }

  if (isLoading) {
    return (
      <GlassPanel className="p-4">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Recent Trades</h3>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 skeleton rounded-lg" />
          ))}
        </div>
      </GlassPanel>
    )
  }

  return (
    <GlassPanel className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Recent Trades</h3>
          <div className="flex items-center gap-1.5">
            <span 
              className={cn(
                "w-2 h-2 rounded-full",
                wsState.isConnected 
                  ? "bg-[var(--success)] animate-pulse" 
                  : "bg-[var(--warning)]"
              )} 
            />
            <span className="text-xs text-[var(--text-muted)]">
              {wsState.isConnected ? "Live" : "Polling"}
            </span>
          </div>
        </div>
        <button
          onClick={fetchTransactions}
          className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="text-center py-4 mb-2 rounded-lg bg-[var(--error)]/10 border border-[var(--error)]/20">
          <p className="text-sm text-[var(--error)]">{error}</p>
          <button
            onClick={fetchTransactions}
            className="text-xs text-[var(--aqua-primary)] hover:underline mt-1"
          >
            Try again
          </button>
        </div>
      )}

      {transactions.length === 0 ? (
        <div className="text-center py-8">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center">
            <svg className="w-6 h-6 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <p className="text-sm text-[var(--text-muted)]">No transactions yet</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">Trades will appear here in real-time</p>
        </div>
      ) : (
        <div className="space-y-1.5 max-h-80 overflow-y-auto custom-scrollbar">
          <AnimatePresence mode="popLayout">
            {transactions.map((tx, index) => (
              <motion.div
                key={tx.signature || `tx-${index}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ delay: index * 0.02 }}
                onClick={() => openExplorer(tx.signature)}
                className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--bg-secondary)]/50 hover:bg-[var(--bg-secondary)] transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={cn(
                      "w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0",
                      tx.type === "buy" ? "bg-[var(--success)]/10" : "bg-[var(--error)]/10",
                    )}
                  >
                    {tx.type === "buy" ? (
                      <svg width="12" height="12" viewBox="0 0 14 14" fill="none" className="text-[var(--success)]">
                        <path
                          d="M7 11V3M3 7l4-4 4 4"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 14 14" fill="none" className="text-[var(--error)]">
                        <path
                          d="M7 3v8M11 7l-4 4-4-4"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className={cn(
                        "text-sm font-medium",
                        tx.type === "buy" ? "text-[var(--success)]" : "text-[var(--error)]"
                      )}>
                        {tx.type === "buy" ? "Buy" : "Sell"}
                      </span>
                      <svg 
                        className="w-3 h-3 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity" 
                        fill="none" 
                        viewBox="0 0 24 24" 
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </div>
                    <p className="text-xs text-[var(--text-muted)] font-mono">{formatAddress(tx.walletAddress)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p
                    className={cn(
                      "text-sm font-semibold font-mono",
                      tx.type === "buy" ? "text-[var(--success)]" : "text-[var(--error)]",
                    )}
                  >
                    {tx.type === "buy" ? "+" : "-"}
                    {formatSolAmount(tx.amountSol)} SOL
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">{formatTime(tx.timestamp)}</p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </GlassPanel>
  )
}
