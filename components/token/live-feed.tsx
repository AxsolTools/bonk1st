"use client"

import type { Trade } from "@/lib/types/database"
import { GlassPanel } from "@/components/ui/glass-panel"
import { cn } from "@/lib/utils"

interface LiveFeedProps {
  trades: Trade[]
  tokenSymbol: string
}

export function LiveFeed({ trades, tokenSymbol }: LiveFeedProps) {
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 1) return "now"
    if (diffMins < 60) return `${diffMins}m`
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h`
    return `${Math.floor(diffMins / 1440)}d`
  }

  const formatAddress = (address: string) => {
    if (!address) return "..."
    return `${address.slice(0, 4)}...${address.slice(-4)}`
  }

  // Get trade type - handle both 'type' and 'trade_type' field names
  const getTradeType = (trade: Trade): "buy" | "sell" => {
    return (trade.trade_type || (trade as any).type || "buy") as "buy" | "sell"
  }

  return (
    <GlassPanel className="p-4 h-full">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-[var(--text-secondary)]">Recent Trades</h3>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] text-[var(--text-muted)]">Live</span>
        </div>
      </div>

      <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
        {trades.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-xs text-[var(--text-muted)]">No trades yet</p>
          </div>
        ) : (
          trades.slice(0, 10).map((trade) => {
            const tradeType = getTradeType(trade)
            return (
              <div
                key={trade.id}
                className={cn(
                  "flex items-center justify-between p-2 rounded-lg",
                  tradeType === "buy" ? "bg-emerald-500/10" : "bg-red-500/10",
                )}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold",
                      tradeType === "buy" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400",
                    )}
                  >
                    {tradeType === "buy" ? "B" : "S"}
                  </span>
                  <div>
                    <p className="text-xs font-medium text-[var(--text-primary)]">
                      {formatAddress(trade.wallet_address)}
                    </p>
                    <p className="text-[10px] text-[var(--text-muted)]">
                      {(trade.amount_tokens ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} {tokenSymbol}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={cn("text-xs font-mono font-medium", tradeType === "buy" ? "text-emerald-400" : "text-red-400")}>
                    {(trade.amount_sol ?? 0).toFixed(3)} SOL
                  </p>
                  <p className="text-[10px] text-[var(--text-muted)]">{formatTime(trade.created_at)}</p>
                </div>
              </div>
            )
          })
        )}
      </div>
    </GlassPanel>
  )
}
