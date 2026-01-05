"use client"

import Link from "next/link"
import Image from "next/image"
import { cn, formatTimeAgo } from "@/lib/utils"
import type { Token } from "@/lib/types/database"

interface TokenWithMetrics extends Omit<Token, 'volume_24h'> {
  creator?: {
    username: string | null
    avatar_url: string | null
  } | null
  live_market_cap?: number
  volume_24h?: number
  tx_count?: number
  holders_count?: number
  dev_holdings_percent?: number
  net_flow?: number
  bonding_progress?: number // Real-time bonding curve progress from PumpPortal
}

interface TokenRowCardProps {
  token: TokenWithMetrics
  showProgress?: boolean
  compact?: boolean
}

export function TokenRowCard({ token, showProgress = true, compact = false }: TokenRowCardProps) {
  const formatMarketCap = (mc: number | null | undefined) => {
    const m = mc || 0
    if (m >= 1000000) return `$${(m / 1000000).toFixed(1)}M`
    if (m >= 1000) return `$${(m / 1000).toFixed(1)}K`
    return `$${m.toFixed(0)}`
  }

  const formatVolume = (vol: number | null | undefined) => {
    const v = vol || 0
    if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`
    if (v >= 1000) return `$${(v / 1000).toFixed(1)}K`
    return `$${v.toFixed(0)}`
  }

  const formatNumber = (num: number | null | undefined) => {
    const n = num || 0
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
    return n.toString()
  }

  const formatAddress = (addr: string) => `${addr.slice(0, 4)}...${addr.slice(-4)}`

  const getProgress = (): number | undefined => {
    // Use bonding progress if available (from WebSocket or stats API)
    if (token.bonding_progress !== undefined) {
      return token.bonding_progress
    }
    // For migrated tokens, show 100%
    if (token.stage === 'migrated') {
      return 100
    }
    // No data yet - return undefined to indicate loading
    return undefined
  }

  const getMarketCap = () => {
    return token.live_market_cap || token.market_cap_usd || token.market_cap || 0
  }

  const timeAgo = token.created_at ? formatTimeAgo(new Date(token.created_at)) : ""
  const progress = getProgress()
  const isLive = token.stage === "bonding"
  const isMigrated = token.stage === "migrated"
  const netFlowPositive = (token.net_flow || 0) >= 0

  return (
    <Link href={`/token/${token.mint_address}`}>
      <div className={cn(
        "group flex gap-2.5 p-2.5 rounded-lg transition-all cursor-pointer",
        "bg-[var(--bg-secondary)]/50 hover:bg-[var(--bg-elevated)]",
        "border border-transparent hover:border-[var(--aqua-primary)]/30",
        compact ? "p-2" : "p-2.5"
      )}>
        {/* Token Image */}
        <div className={cn(
          "relative rounded-lg bg-[var(--bg-tertiary)] flex-shrink-0 overflow-hidden",
          compact ? "w-10 h-10" : "w-12 h-12"
        )}>
          {(() => {
            // Get image URL - use Jupiter static hosting for Jupiter tokens
            const imageUrl = token.image_url 
              || (token.pool_type === 'jupiter' ? `https://static-create.jup.ag/images/${token.mint_address}` : null)
            
            return imageUrl ? (
              <Image src={imageUrl} alt={token.name} fill className="object-cover" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[var(--aqua-primary)]/20 to-[var(--warm-pink)]/20">
                <span className={cn(
                  "font-bold text-[var(--text-muted)]",
                  compact ? "text-xs" : "text-sm"
                )}>
                  {token.symbol?.slice(0, 2)}
                </span>
              </div>
            )
          })()}
          
          {/* Status badge overlay */}
          {isLive && (
            <div className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-[var(--green)] animate-pulse" />
          )}
          {isMigrated && (
            <div className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-[var(--aqua-primary)]" />
          )}
        </div>

        {/* Token Info */}
        <div className="flex-1 min-w-0 flex flex-col justify-between">
          {/* Top Row: Name + Age */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={cn(
                "font-semibold text-[var(--text-primary)] truncate",
                compact ? "text-xs" : "text-sm"
              )}>
                {token.symbol}
              </span>
              <span className="text-[10px] text-[var(--text-dim)] truncate hidden sm:inline">
                {token.name}
              </span>
            </div>
            <span className="text-[10px] text-[var(--aqua-secondary)] whitespace-nowrap flex-shrink-0">
              {timeAgo}
            </span>
          </div>

          {/* Middle Row: Metrics V | MC | TX */}
          <div className="flex items-center gap-3 text-[10px]">
            {/* Volume */}
            <div className="flex items-center gap-1">
              <span className="text-[var(--text-dim)] font-medium">V</span>
              <span className="text-[var(--text-secondary)] font-medium">
                {formatVolume(token.volume_24h)}
              </span>
            </div>
            
            {/* Market Cap */}
            <div className="flex items-center gap-1">
              <span className="text-[var(--text-dim)] font-medium">MC</span>
              <span className="text-[var(--aqua-primary)] font-bold">
                {formatMarketCap(getMarketCap())}
              </span>
            </div>
            
            {/* Transaction Count */}
            <div className="flex items-center gap-1">
              <span className="text-[var(--text-dim)] font-medium">TX</span>
              <span className="text-[var(--text-secondary)] font-medium">
                {formatNumber(token.tx_count)}
              </span>
            </div>

            {/* Holders - if available */}
            {token.holders_count && token.holders_count > 0 && (
              <div className="flex items-center gap-1 hidden lg:flex">
                <span className="text-[var(--text-dim)] font-medium">H</span>
                <span className="text-[var(--text-secondary)] font-medium">
                  {formatNumber(token.holders_count)}
                </span>
              </div>
            )}
          </div>

          {/* Bottom Row: Progress or Net Flow */}
          <div className="flex items-center gap-2">
            {showProgress && !isMigrated && (
              <>
                {/* Progress Bar - Gray track with green fill */}
                <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full transition-all duration-300 bg-[var(--green)]"
                    style={{ width: `${progress !== undefined ? Math.max(progress, 0) : 0}%` }}
                  />
                </div>
                <span className="text-[9px] font-bold whitespace-nowrap text-[var(--green)]">
                  {progress !== undefined ? progress.toFixed(0) : '0'}%
                </span>
              </>
            )}
            
            {/* Net Flow indicator */}
            {token.net_flow !== undefined && (
              <span className={cn(
                "text-[9px] font-bold",
                netFlowPositive ? "text-[var(--green)]" : "text-[var(--red)]"
              )}>
                N {netFlowPositive ? "+" : ""}{formatVolume(token.net_flow)}
              </span>
            )}
            
            {/* DEX badge for migrated */}
            {isMigrated && (
              <span className="px-1.5 py-0.5 text-[8px] font-bold rounded bg-[var(--aqua-primary)]/20 text-[var(--aqua-primary)]">
                DEX
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}

