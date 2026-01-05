"use client"

import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"

interface EarningsSummaryProps {
  totalDeposited: number
  totalEarnings: number
  averageApy: number
  positionCount: number
}

export function EarningsSummary({ 
  totalDeposited, 
  totalEarnings, 
  averageApy, 
  positionCount 
}: EarningsSummaryProps) {
  const [animatedEarnings, setAnimatedEarnings] = useState(totalEarnings)
  
  // Animate earnings counter based on APY
  useEffect(() => {
    if (!totalDeposited || !averageApy) return
    
    const dailyRate = averageApy / 100 / 365
    const secondRate = dailyRate / 86400
    const valuePerSecond = totalDeposited * secondRate
    
    const interval = setInterval(() => {
      setAnimatedEarnings(prev => prev + valuePerSecond)
    }, 1000)
    
    return () => clearInterval(interval)
  }, [totalDeposited, averageApy])

  const formatUsd = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`
    if (value >= 1000) return `$${(value / 1000).toFixed(2)}K`
    if (value >= 1) return `$${value.toFixed(2)}`
    return `$${value.toFixed(4)}`
  }

  // Calculate daily/monthly earnings estimate
  const dailyEarnings = totalDeposited * (averageApy / 100 / 365)
  const monthlyEarnings = dailyEarnings * 30

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[var(--bg-card)] via-[var(--bg-elevated)] to-[var(--bg-card)] border border-[var(--border-subtle)]">
      {/* Animated background pattern */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[var(--aqua-primary)]/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[var(--green)]/10 rounded-full blur-3xl" />
      </div>
      
      {/* Top gradient line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--aqua-primary)]/50 to-transparent" />
      
      <div className="relative p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--aqua-primary)] to-[var(--aqua-secondary)] flex items-center justify-center shadow-lg shadow-[var(--aqua-primary)]/25">
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">Your Earnings</h3>
              <p className="text-xs text-[var(--text-muted)]">{positionCount} active position{positionCount !== 1 ? 's' : ''}</p>
            </div>
          </div>
          
          {/* Live indicator */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--green)]/10 border border-[var(--green)]/20">
            <div className="w-2 h-2 rounded-full bg-[var(--green)] animate-pulse" />
            <span className="text-xs font-medium text-[var(--green)]">Live</span>
          </div>
        </div>

        {/* Main Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {/* Total Deposited */}
          <div className="p-4 rounded-xl bg-[var(--bg-secondary)]/50 border border-[var(--border-subtle)]">
            <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Total Deposited</p>
            <p className="text-2xl font-bold text-[var(--text-primary)] tabular-nums">{formatUsd(totalDeposited)}</p>
          </div>
          
          {/* Total Earnings - Animated */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-[var(--green)]/10 to-[var(--green)]/5 border border-[var(--green)]/20">
            <p className="text-[10px] uppercase tracking-wider text-[var(--green)]/80 mb-1">Total Earned</p>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-[var(--green)] tabular-nums">+{formatUsd(animatedEarnings)}</span>
            </div>
            <div className="flex items-center gap-1 mt-1">
              <div className="flex gap-0.5">
                {[0, 1, 2].map(i => (
                  <div 
                    key={i}
                    className="w-1 h-2 bg-[var(--green)] rounded-full animate-pulse" 
                    style={{ animationDelay: `${i * 100}ms` }} 
                  />
                ))}
              </div>
              <span className="text-[9px] text-[var(--green)]/60">Accumulating</span>
            </div>
          </div>
          
          {/* Average APY */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-[var(--aqua-primary)]/10 to-[var(--aqua-secondary)]/5 border border-[var(--aqua-border)]">
            <p className="text-[10px] uppercase tracking-wider text-[var(--aqua-primary)]/80 mb-1">Average APY</p>
            <p className="text-2xl font-bold text-[var(--aqua-primary)] tabular-nums">{averageApy.toFixed(2)}%</p>
          </div>
          
          {/* Monthly Estimate */}
          <div className="p-4 rounded-xl bg-[var(--bg-secondary)]/50 border border-[var(--border-subtle)]">
            <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Monthly Est.</p>
            <p className="text-2xl font-bold text-[var(--text-primary)] tabular-nums">+{formatUsd(monthlyEarnings)}</p>
            <p className="text-[9px] text-[var(--text-muted)] mt-1">~{formatUsd(dailyEarnings)}/day</p>
          </div>
        </div>

        {/* Earnings Progress Bar */}
        <div className="p-4 rounded-xl bg-[var(--bg-secondary)]/50 border border-[var(--border-subtle)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-[var(--text-muted)]">Earnings Progress</span>
            <span className="text-xs font-medium text-[var(--aqua-primary)]">
              {((animatedEarnings / totalDeposited) * 100).toFixed(4)}% of principal
            </span>
          </div>
          <div className="h-2 bg-[var(--bg-primary)] rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-[var(--aqua-primary)] to-[var(--green)] rounded-full transition-all duration-1000"
              style={{ width: `${Math.min((animatedEarnings / totalDeposited) * 100 * 100, 100)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

