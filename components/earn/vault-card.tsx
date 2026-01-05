"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"

interface VaultCardProps {
  vault: {
    id: number
    address: string
    name: string
    symbol: string
    asset: {
      symbol: string
      name: string
      logoUrl: string
      priceUsd: number
    }
    apy: number
    apyFormatted: string
    tvlUsd: number
    tvlFormatted: string
    availableLiquidity: number
    supplyRate: number
    rewardsRate: number
  }
  onDeposit?: () => void
  isSelected?: boolean
}

// Official token logos
const ASSET_LOGOS: Record<string, string> = {
  USDC: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
  SOL: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
}

export function VaultCard({ vault, onDeposit, isSelected }: VaultCardProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [imageError, setImageError] = useState(false)
  
  // Get logo URL - use official logos or fallback
  const logoUrl = ASSET_LOGOS[vault.asset.symbol] || vault.asset.logoUrl
  
  // Fallback icon if image fails
  const renderFallbackIcon = () => {
    if (vault.asset.symbol === 'USDC') {
      return (
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
          <span className="text-white font-bold text-lg">$</span>
        </div>
      )
    }
    if (vault.asset.symbol === 'SOL') {
      return (
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#9945FF] to-[#14F195] flex items-center justify-center shadow-lg shadow-purple-500/25">
          <svg className="w-6 h-6 text-white" viewBox="0 0 397.7 311.7" fill="currentColor">
            <path d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1l62.7-62.7z"/>
            <path d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z"/>
            <path d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z"/>
          </svg>
        </div>
      )
    }
    return (
      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[var(--aqua-primary)] to-[var(--aqua-secondary)] flex items-center justify-center shadow-lg shadow-[var(--aqua-primary)]/25">
        <span className="text-white font-bold text-lg">{vault.asset.symbol.charAt(0)}</span>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "relative group overflow-hidden rounded-2xl transition-all duration-300",
        "bg-gradient-to-br from-[var(--bg-card)] to-[var(--bg-elevated)]",
        "border border-[var(--border-subtle)]",
        isSelected && "ring-2 ring-[var(--aqua-primary)] border-[var(--aqua-primary)]",
        isHovered && "border-[var(--aqua-primary)]/50 shadow-xl shadow-[var(--aqua-primary)]/10"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Animated gradient background */}
      <div className={cn(
        "absolute inset-0 opacity-0 transition-opacity duration-500",
        isHovered && "opacity-100"
      )}>
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--aqua-primary)]/5 via-transparent to-[var(--warm-pink)]/5" />
        <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-[var(--aqua-primary)]/50 to-transparent" />
      </div>

      <div className="relative p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            {/* Asset Logo */}
            {logoUrl && !imageError ? (
              <div className="relative w-12 h-12 rounded-full overflow-hidden shadow-lg">
                <img
                  src={logoUrl}
                  alt={vault.asset.symbol}
                  className="w-full h-full object-cover"
                  onError={() => setImageError(true)}
                />
              </div>
            ) : (
              renderFallbackIcon()
            )}
            <div>
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">{vault.symbol}</h3>
              <p className="text-sm text-[var(--text-muted)]">{vault.asset.name}</p>
            </div>
          </div>
          
          {/* Live indicator */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-[var(--green)]/10 border border-[var(--green)]/20">
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--green)] animate-pulse" />
            <span className="text-[10px] font-medium text-[var(--green)] uppercase tracking-wider">Live</span>
          </div>
        </div>

        {/* APY Display - Hero element */}
        <div className="mb-6 p-4 rounded-xl bg-gradient-to-br from-[var(--aqua-primary)]/10 to-[var(--aqua-secondary)]/5 border border-[var(--aqua-border)]">
          <div className="flex items-baseline justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Annual Yield</p>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-[var(--aqua-primary)] tabular-nums">
                  {vault.apyFormatted}
                </span>
                <span className="text-xs text-[var(--text-muted)]">APY</span>
              </div>
            </div>
            
            {/* APY breakdown */}
            <div className="text-right">
              <div className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                <span>Supply:</span>
                <span className="text-[var(--text-secondary)]">{vault.supplyRate.toFixed(2)}%</span>
              </div>
              <div className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                <span>Rewards:</span>
                <span className="text-[var(--aqua-primary)]">{vault.rewardsRate.toFixed(2)}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
            <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Total Value Locked</p>
            <p className="text-lg font-semibold text-[var(--text-primary)] tabular-nums">{vault.tvlFormatted}</p>
          </div>
          <div className="p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
            <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Available Liquidity</p>
            <p className="text-lg font-semibold text-[var(--text-primary)] tabular-nums">
              {vault.availableLiquidity >= 1000000 
                ? `${(vault.availableLiquidity / 1000000).toFixed(2)}M` 
                : vault.availableLiquidity >= 1000 
                  ? `${(vault.availableLiquidity / 1000).toFixed(2)}K`
                  : vault.availableLiquidity.toFixed(2)
              } {vault.asset.symbol}
            </p>
          </div>
        </div>

        {/* Action Button */}
        {onDeposit && (
          <button
            onClick={onDeposit}
            className={cn(
              "w-full py-3 rounded-xl font-semibold text-sm transition-all duration-300",
              "bg-gradient-to-r from-[var(--aqua-primary)] to-[var(--aqua-secondary)]",
              "text-white shadow-lg shadow-[var(--aqua-primary)]/25",
              "hover:shadow-xl hover:shadow-[var(--aqua-primary)]/30 hover:scale-[1.02]",
              "active:scale-[0.98]"
            )}
          >
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
              Deposit to Earn
            </span>
          </button>
        )}
      </div>
    </div>
  )
}
