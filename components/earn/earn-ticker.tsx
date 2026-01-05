"use client"

import { useState, useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

interface EarnStats {
  totalTvlUsd: number
  totalPropelDeposited: number
  totalYieldEarnedUsd: number
  activePositions: number
  totalUniqueUsers: number
  volume24hUsd: number
  avgApy: number
  activity24h: number
  lastUpdated: string
}

interface TickerItem {
  id: string
  symbol: string
  label: string
  value: string
  change?: number // For showing up/down indicator
  color: string
}

// Bloomberg-style mini chart SVG (static sparkline)
function MiniChart({ trend = "up" }: { trend?: "up" | "down" | "flat" }) {
  const paths = {
    up: "M0 8 L3 6 L6 7 L9 4 L12 5 L15 2 L18 3 L21 1",
    down: "M0 2 L3 3 L6 1 L9 4 L12 3 L15 6 L18 5 L21 8",
    flat: "M0 4 L3 5 L6 4 L9 5 L12 4 L15 5 L18 4 L21 5",
  }
  const color = trend === "up" ? "#22c55e" : trend === "down" ? "#ef4444" : "#6b7280"
  
  return (
    <svg width="24" height="10" viewBox="0 0 24 10" fill="none" className="opacity-60">
      <path d={paths[trend]} stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Fintech-style status indicator (like Bloomberg terminal)
function StatusDot({ status = "live" }: { status?: "live" | "delayed" | "offline" }) {
  const colors = {
    live: "bg-emerald-500",
    delayed: "bg-amber-500", 
    offline: "bg-red-500",
  }
  
  return (
    <span className={cn("w-1.5 h-1.5 rounded-full", colors[status], status === "live" && "animate-pulse")} />
  )
}

export function EarnTicker() {
  const [stats, setStats] = useState<EarnStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isPaused, setIsPaused] = useState(false)
  const tickerRef = useRef<HTMLDivElement>(null)

  // Fetch stats
  const fetchStats = async () => {
    try {
      const response = await fetch('/api/earn/stats')
      const data = await response.json()
      
      if (data.success) {
        setStats(data.data)
      }
    } catch (err) {
      console.debug('[EARN-TICKER] Failed to fetch stats:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchStats()
    
    // Poll every 30 seconds
    const interval = setInterval(fetchStats, 30000)
    return () => clearInterval(interval)
  }, [])

  // Format numbers - Bloomberg style (compact, precise)
  const formatUsd = (num: number) => {
    if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`
    if (num >= 1_000) return `$${(num / 1_000).toFixed(2)}K`
    return `$${num.toFixed(2)}`
  }

  const formatNumber = (num: number) => {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`
    return num.toLocaleString()
  }

  // Build ticker items with Bloomberg-style abbreviations
  const tickerItems: TickerItem[] = stats ? [
    {
      id: 'tvl',
      symbol: 'TVL',
      label: 'Total Value Locked',
      value: formatUsd(stats.totalTvlUsd),
      color: 'text-cyan-400',
    },
    {
      id: 'apy',
      symbol: 'APY',
      label: 'Avg Annual Yield',
      value: `${stats.avgApy.toFixed(2)}%`,
      change: stats.avgApy,
      color: stats.avgApy > 0 ? 'text-emerald-400' : 'text-zinc-400',
    },
    {
      id: 'propel',
      symbol: 'PROPEL',
      label: 'Deposited',
      value: formatNumber(stats.totalPropelDeposited),
      color: 'text-fuchsia-400',
    },
    {
      id: 'positions',
      symbol: 'POS',
      label: 'Active Positions',
      value: stats.activePositions.toLocaleString(),
      color: 'text-amber-400',
    },
    {
      id: 'earned',
      symbol: 'YIELD',
      label: 'Total Earned',
      value: formatUsd(stats.totalYieldEarnedUsd),
      change: stats.totalYieldEarnedUsd,
      color: 'text-emerald-400',
    },
    {
      id: 'volume',
      symbol: 'VOL24',
      label: '24h Volume',
      value: formatUsd(stats.volume24hUsd),
      color: 'text-violet-400',
    },
    {
      id: 'users',
      symbol: 'USR',
      label: 'Unique Users',
      value: stats.totalUniqueUsers.toLocaleString(),
      color: 'text-sky-400',
    },
  ] : []

  // Duplicate items for seamless loop
  const duplicatedItems = [...tickerItems, ...tickerItems, ...tickerItems]

  if (isLoading) {
    return (
      <div className="h-8 bg-zinc-950 border-b border-zinc-800/50 flex items-center justify-center">
        <div className="flex items-center gap-2 text-zinc-500 text-[10px] font-mono">
          <div className="w-2 h-2 border border-zinc-600 border-t-transparent rounded-full animate-spin" />
          <span>CONNECTING...</span>
        </div>
      </div>
    )
  }

  if (!stats) {
    return null
  }

  return (
    <div 
      className="relative h-8 bg-zinc-950 border-b border-zinc-800/50 overflow-hidden font-mono"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Gradient overlays for fade effect */}
      <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-zinc-950 to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-zinc-950 to-transparent z-10 pointer-events-none" />
      
      {/* Live indicator - Bloomberg style */}
      <div className="absolute left-3 top-1/2 -translate-y-1/2 z-20 flex items-center gap-1.5">
        <StatusDot status="live" />
        <span className="text-[9px] font-medium text-emerald-500 uppercase tracking-widest">LIVE</span>
      </div>
      
      {/* Scrolling ticker */}
      <div 
        ref={tickerRef}
        className={cn(
          "flex items-center h-full pl-20",
          !isPaused && "animate-ticker"
        )}
        style={{
          animationPlayState: isPaused ? 'paused' : 'running',
        }}
      >
        {duplicatedItems.map((item, index) => (
          <div
            key={`${item.id}-${index}`}
            className="flex items-center gap-1.5 px-4 whitespace-nowrap border-r border-zinc-800/30 last:border-r-0"
          >
            {/* Symbol badge */}
            <span className="text-[9px] font-semibold text-zinc-500 bg-zinc-800/50 px-1.5 py-0.5 rounded">
              {item.symbol}
            </span>
            
            {/* Value */}
            <span className={cn("text-[11px] font-semibold tabular-nums tracking-tight", item.color)}>
              {item.value}
            </span>
            
            {/* Mini trend chart for APY and Yield */}
            {item.change !== undefined && (
              <MiniChart trend={item.change > 0 ? "up" : item.change < 0 ? "down" : "flat"} />
            )}
          </div>
        ))}
      </div>
      
      {/* CSS for ticker animation */}
      <style jsx>{`
        @keyframes ticker {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-33.333%);
          }
        }
        .animate-ticker {
          animation: ticker 45s linear infinite;
        }
      `}</style>
    </div>
  )
}

