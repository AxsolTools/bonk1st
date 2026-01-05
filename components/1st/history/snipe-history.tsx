"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { GoldCard, GoldCardHeader, StatCard } from "../ui/gold-card"
import { GoldBadge, PoolBadge, PnLBadge, TokenLogo } from "../ui/gold-badge"
import { GoldButton } from "../ui/gold-button"
import { GoldSelect, GoldInput } from "../ui/gold-input"
import { use1stSniper } from "@/hooks/use-1st-sniper"
import { 
  formatSol, 
  formatUsd, 
  formatPercent, 
  formatTimeAgo,
  type SnipeHistory,
  type AutoSellTrigger,
} from "@/lib/1st/sniper-config"

// Trigger badge colors
const triggerStyles: Record<AutoSellTrigger, { label: string; variant: 'success' | 'danger' | 'warning' | 'info' | 'gold' }> = {
  take_profit: { label: 'TAKE PROFIT', variant: 'success' },
  stop_loss: { label: 'STOP LOSS', variant: 'danger' },
  trailing_stop: { label: 'TRAILING STOP', variant: 'warning' },
  time_based: { label: 'TIME EXIT', variant: 'info' },
  dev_sold: { label: 'DEV SOLD', variant: 'danger' },
  manual: { label: 'MANUAL', variant: 'gold' },
  emergency: { label: 'EMERGENCY', variant: 'danger' },
}

// Single history row
function HistoryRow({ snipe }: { snipe: SnipeHistory }) {
  const [expanded, setExpanded] = React.useState(false)
  const trigger = triggerStyles[snipe.exitTrigger]
  const isProfit = snipe.realizedPnlSol >= 0
  
  return (
    <div 
      className={cn(
        "border rounded-lg transition-all",
        isProfit 
          ? "bg-[#00FF41]/5 border-[#00FF41]/20 hover:border-[#00FF41]/40"
          : "bg-[#FF3333]/5 border-[#FF3333]/20 hover:border-[#FF3333]/40"
      )}
    >
      {/* Main Row */}
      <div 
        className="flex items-center gap-4 p-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <TokenLogo symbol={snipe.tokenSymbol} size="md" />
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white">${snipe.tokenSymbol}</span>
            <PoolBadge pool={snipe.pool} />
          </div>
          <p className="text-xs text-white/50">
            {formatTimeAgo(snipe.exitTimestamp)}
          </p>
        </div>
        
        <div className="text-right">
          <p className={cn(
            "font-bold font-mono",
            isProfit ? "text-[#00FF41]" : "text-[#FF3333]"
          )}>
            {isProfit ? '+' : ''}{formatSol(snipe.realizedPnlSol)} SOL
          </p>
          <p className={cn(
            "text-xs font-mono",
            isProfit ? "text-[#00FF41]/70" : "text-[#FF3333]/70"
          )}>
            {formatPercent(snipe.realizedPnlPercent)}
          </p>
        </div>
        
        <GoldBadge variant={trigger.variant} size="xs">
          {trigger.label}
        </GoldBadge>
        
        <svg 
          width="16" 
          height="16" 
          viewBox="0 0 16 16" 
          fill="none" 
          className={cn(
            "text-white/30 transition-transform",
            expanded && "rotate-180"
          )}
        >
          <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
      
      {/* Expanded Details */}
      {expanded && (
        <div className="px-3 pb-3 pt-0 border-t border-white/5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
            <div>
              <p className="text-[10px] text-white/40">Entry Price</p>
              <p className="text-sm font-mono text-white">{formatSol(snipe.entryPriceSol)} SOL</p>
            </div>
            <div>
              <p className="text-[10px] text-white/40">Exit Price</p>
              <p className="text-sm font-mono text-white">{formatSol(snipe.exitPriceSol)} SOL</p>
            </div>
            <div>
              <p className="text-[10px] text-white/40">Amount</p>
              <p className="text-sm font-mono text-white">{formatSol(snipe.amountSol)} SOL</p>
            </div>
            <div>
              <p className="text-[10px] text-white/40">Hold Time</p>
              <p className="text-sm font-mono text-white">
                {snipe.holdDurationSeconds < 60 
                  ? `${snipe.holdDurationSeconds}s`
                  : snipe.holdDurationSeconds < 3600
                    ? `${Math.floor(snipe.holdDurationSeconds / 60)}m`
                    : `${Math.floor(snipe.holdDurationSeconds / 3600)}h`
                }
              </p>
            </div>
          </div>
          
          <div className="flex gap-2 mt-3">
            <a
              href={`https://solscan.io/tx/${snipe.entryTxSignature}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[#D4AF37]/70 hover:text-[#D4AF37]"
            >
              Entry TX →
            </a>
            <a
              href={`https://solscan.io/tx/${snipe.exitTxSignature}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[#D4AF37]/70 hover:text-[#D4AF37]"
            >
              Exit TX →
            </a>
            <a
              href={`https://solscan.io/token/${snipe.tokenMint}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[#D4AF37]/70 hover:text-[#D4AF37]"
            >
              Token →
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

// Main History Component
export function SnipeHistoryPage() {
  const { history, stats } = use1stSniper()
  
  const [sortBy, setSortBy] = React.useState<'recent' | 'pnl' | 'amount'>('recent')
  const [filterResult, setFilterResult] = React.useState<'all' | 'profit' | 'loss'>('all')
  const [searchTerm, setSearchTerm] = React.useState('')
  
  // Calculate stats from history
  const historyStats = React.useMemo(() => {
    if (history.length === 0) return null
    
    const profits = history.filter(h => h.realizedPnlSol > 0)
    const losses = history.filter(h => h.realizedPnlSol < 0)
    
    return {
      totalTrades: history.length,
      winRate: (profits.length / history.length) * 100,
      totalPnl: history.reduce((sum, h) => sum + h.realizedPnlSol, 0),
      avgPnl: history.reduce((sum, h) => sum + h.realizedPnlPercent, 0) / history.length,
      bestTrade: Math.max(...history.map(h => h.realizedPnlPercent)),
      worstTrade: Math.min(...history.map(h => h.realizedPnlPercent)),
      avgHoldTime: history.reduce((sum, h) => sum + h.holdDurationSeconds, 0) / history.length,
    }
  }, [history])
  
  // Filter and sort history
  const filteredHistory = React.useMemo(() => {
    let filtered = [...history]
    
    // Filter by result
    if (filterResult === 'profit') {
      filtered = filtered.filter(h => h.realizedPnlSol > 0)
    } else if (filterResult === 'loss') {
      filtered = filtered.filter(h => h.realizedPnlSol < 0)
    }
    
    // Filter by search
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(h => 
        h.tokenSymbol.toLowerCase().includes(term) ||
        h.tokenMint.toLowerCase().includes(term)
      )
    }
    
    // Sort
    switch (sortBy) {
      case 'recent':
        filtered.sort((a, b) => b.exitTimestamp - a.exitTimestamp)
        break
      case 'pnl':
        filtered.sort((a, b) => b.realizedPnlSol - a.realizedPnlSol)
        break
      case 'amount':
        filtered.sort((a, b) => b.amountSol - a.amountSol)
        break
    }
    
    return filtered
  }, [history, sortBy, filterResult, searchTerm])
  
  return (
    <div className="w-full max-w-[1920px] mx-auto px-4 lg:px-8 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#D4AF37]">SNIPE HISTORY</h1>
          <p className="text-xs text-white/50">Your trading performance</p>
        </div>
        
        <GoldBadge variant="gold">
          {history.length} trades
        </GoldBadge>
      </div>
      
      {/* Stats Cards */}
      {historyStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <StatCard 
            label="Total P&L" 
            value={formatSol(historyStats.totalPnl)}
            suffix=" SOL"
            change={historyStats.totalPnl > 0 ? 100 : -100}
          />
          <StatCard 
            label="Win Rate" 
            value={historyStats.winRate.toFixed(0)}
            suffix="%"
          />
          <StatCard 
            label="Avg P&L" 
            value={historyStats.avgPnl.toFixed(1)}
            suffix="%"
          />
          <StatCard 
            label="Best Trade" 
            value={`+${historyStats.bestTrade.toFixed(0)}`}
            suffix="%"
          />
          <StatCard 
            label="Worst Trade" 
            value={historyStats.worstTrade.toFixed(0)}
            suffix="%"
          />
          <StatCard 
            label="Total Trades" 
            value={historyStats.totalTrades}
          />
          <StatCard 
            label="Avg Hold" 
            value={historyStats.avgHoldTime < 60 
              ? `${historyStats.avgHoldTime.toFixed(0)}s`
              : `${(historyStats.avgHoldTime / 60).toFixed(0)}m`
            }
          />
        </div>
      )}
      
      {/* Filters */}
      <GoldCard variant="default">
        <div className="flex flex-wrap items-center gap-4">
          <GoldInput
            placeholder="Search by token..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-48"
          />
          
          <div className="flex gap-1">
            {(['all', 'profit', 'loss'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilterResult(f)}
                className={cn(
                  "px-3 py-1.5 text-xs font-semibold uppercase rounded-lg transition-all",
                  filterResult === f
                    ? f === 'profit' 
                      ? "bg-[#00FF41]/20 text-[#00FF41] border border-[#00FF41]/40"
                      : f === 'loss'
                        ? "bg-[#FF3333]/20 text-[#FF3333] border border-[#FF3333]/40"
                        : "bg-[#D4AF37]/20 text-[#FFD700] border border-[#D4AF37]/40"
                    : "text-white/50 hover:text-white border border-transparent"
                )}
              >
                {f === 'all' ? 'ALL' : f.toUpperCase()}
              </button>
            ))}
          </div>
          
          <div className="h-6 w-px bg-white/10" />
          
          <GoldSelect
            value={sortBy}
            onChange={(value) => setSortBy(value as typeof sortBy)}
            options={[
              { value: 'recent', label: 'Most Recent' },
              { value: 'pnl', label: 'Highest P&L' },
              { value: 'amount', label: 'Largest Amount' },
            ]}
          />
        </div>
      </GoldCard>
      
      {/* History List */}
      {filteredHistory.length === 0 ? (
        <GoldCard variant="elevated" className="text-center py-12">
          <div className="text-4xl mb-4">📊</div>
          <p className="text-white/50">No trading history yet</p>
          <p className="text-xs text-white/30 mt-1">
            Start sniping to build your track record
          </p>
        </GoldCard>
      ) : (
        <div className="space-y-2">
          {filteredHistory.map((snipe) => (
            <HistoryRow key={snipe.id} snipe={snipe} />
          ))}
        </div>
      )}
    </div>
  )
}

