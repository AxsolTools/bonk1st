"use client"

import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"

interface PositionCardProps {
  position: {
    vaultAddress: string
    vaultSymbol: string
    assetSymbol: string
    sharesFormatted: number
    underlyingAssetsFormatted: number
    underlyingValueUsd: number
    logoUrl?: string
    walletAddress?: string
  }
  earnings?: {
    earnedAmountFormatted: number
    earnedValueUsd: number
  }
  apy?: number
  onWithdraw?: () => void
}

export function PositionCard({ position, earnings, apy, onWithdraw }: PositionCardProps) {
  const [animatedEarnings, setAnimatedEarnings] = useState(earnings?.earnedValueUsd || 0)
  
  // Animate earnings counter
  useEffect(() => {
    if (!earnings?.earnedValueUsd || !apy) return
    
    const dailyRate = apy / 100 / 365
    const secondRate = dailyRate / 86400
    const valuePerSecond = position.underlyingValueUsd * secondRate
    
    const interval = setInterval(() => {
      setAnimatedEarnings(prev => prev + valuePerSecond)
    }, 1000)
    
    return () => clearInterval(interval)
  }, [earnings?.earnedValueUsd, apy, position.underlyingValueUsd])
  
  // Get asset icon
  const getAssetIcon = () => {
    if (position.assetSymbol === 'USDC') {
      return (
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
          <span className="text-white font-bold">$</span>
        </div>
      )
    }
    if (position.assetSymbol === 'SOL') {
      return (
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 via-violet-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
          <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M4.5 7.5L12 3l7.5 4.5v9L12 21l-7.5-4.5v-9z" />
          </svg>
        </div>
      )
    }
    return (
      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--aqua-primary)] to-[var(--aqua-secondary)] flex items-center justify-center">
        <span className="text-white font-bold">{position.assetSymbol.charAt(0)}</span>
      </div>
    )
  }

  const formatUsd = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`
    if (value >= 1000) return `$${(value / 1000).toFixed(2)}K`
    if (value >= 1) return `$${value.toFixed(2)}`
    if (value >= 0.01) return `$${value.toFixed(4)}`
    return `$${value.toFixed(6)}`
  }

  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[var(--bg-card)] to-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-[var(--aqua-primary)]/30 transition-all duration-300">
      {/* Subtle animated gradient */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--aqua-primary)]/30 to-transparent" />
      
      <div className="p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {getAssetIcon()}
            <div>
              <h4 className="text-base font-semibold text-[var(--text-primary)]">{position.vaultSymbol}</h4>
              <p className="text-xs text-[var(--text-muted)]">
                {position.walletAddress ? `${position.walletAddress.slice(0, 4)}...${position.walletAddress.slice(-4)}` : 'Your Position'}
              </p>
            </div>
          </div>
          
          {apy && (
            <div className="px-2.5 py-1 rounded-lg bg-[var(--aqua-bg)] border border-[var(--aqua-border)]">
              <span className="text-xs font-semibold text-[var(--aqua-primary)]">{apy.toFixed(2)}% APY</span>
            </div>
          )}
        </div>

        {/* Value Display */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Deposited</p>
            <p className="text-lg font-semibold text-[var(--text-primary)] tabular-nums">
              {position.underlyingAssetsFormatted.toLocaleString(undefined, { maximumFractionDigits: 4 })} {position.assetSymbol}
            </p>
            <p className="text-xs text-[var(--text-muted)]">{formatUsd(position.underlyingValueUsd)}</p>
          </div>
          
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Shares</p>
            <p className="text-lg font-semibold text-[var(--text-secondary)] tabular-nums">
              {position.sharesFormatted.toLocaleString(undefined, { maximumFractionDigits: 4 })}
            </p>
            <p className="text-xs text-[var(--text-muted)]">{position.vaultSymbol}</p>
          </div>
        </div>

        {/* Earnings Display */}
        {earnings && (
          <div className="p-3 rounded-lg bg-gradient-to-r from-[var(--green)]/10 to-[var(--green)]/5 border border-[var(--green)]/20 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[var(--green)]/80 mb-0.5">Earnings</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-bold text-[var(--green)] tabular-nums">
                    +{earnings.earnedAmountFormatted.toFixed(6)}
                  </span>
                  <span className="text-xs text-[var(--green)]/80">{position.assetSymbol}</span>
                </div>
              </div>
              
              {/* Animated USD counter */}
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-0.5">Value</p>
                <p className="text-lg font-semibold text-[var(--green)] tabular-nums">
                  +{formatUsd(animatedEarnings)}
                </p>
              </div>
            </div>
            
            {/* Earning indicator */}
            <div className="flex items-center gap-1.5 mt-2">
              <div className="flex gap-0.5">
                <div className="w-1 h-3 bg-[var(--green)] rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
                <div className="w-1 h-3 bg-[var(--green)]/70 rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                <div className="w-1 h-3 bg-[var(--green)]/40 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-[10px] text-[var(--green)]/80">Earning in real-time</span>
            </div>
          </div>
        )}

        {/* Withdraw Button */}
        {onWithdraw && (
          <button
            onClick={onWithdraw}
            className={cn(
              "w-full py-2.5 rounded-lg font-medium text-sm transition-all duration-200",
              "bg-[var(--bg-secondary)] border border-[var(--border-default)]",
              "text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]",
              "hover:border-[var(--warm)]/50 hover:text-[var(--warm)]"
            )}
          >
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Withdraw
            </span>
          </button>
        )}
      </div>
    </div>
  )
}

