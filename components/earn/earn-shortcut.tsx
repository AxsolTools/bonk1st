"use client"

import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/components/providers/auth-provider"
import Link from "next/link"

interface EarnShortcutProps {
  tokenSymbol?: string
  propelBalance?: number
  className?: string
}

interface VaultPreview {
  symbol: string
  assetSymbol: string
  apy: number
  apyFormatted: string
}

// PROPEL mint from environment
const PROPEL_MINT = process.env.NEXT_PUBLIC_PROPEL_TOKEN_MINT || ''

export function EarnShortcut({ tokenSymbol, propelBalance = 0, className }: EarnShortcutProps) {
  const { isAuthenticated, sessionId, activeWallet } = useAuth()
  const [isExpanded, setIsExpanded] = useState(false)
  const [vaults, setVaults] = useState<VaultPreview[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [userPropelBalance, setUserPropelBalance] = useState(propelBalance)

  // Fetch vault previews
  useEffect(() => {
    const fetchVaults = async () => {
      try {
        const response = await fetch('/api/earn/vaults')
        const data = await response.json()
        
        if (data.success) {
          setVaults(data.data.slice(0, 2).map((v: any) => ({
            symbol: v.symbol,
            assetSymbol: v.asset.symbol,
            apy: v.apy,
            apyFormatted: v.apyFormatted,
          })))
        }
      } catch (err) {
        console.error('Failed to fetch vaults:', err)
      }
    }

    fetchVaults()
  }, [])

  // Fetch PROPEL balance if not provided
  useEffect(() => {
    if (propelBalance > 0 || !activeWallet || !PROPEL_MINT) return

    const fetchBalance = async () => {
      try {
        const response = await fetch(`/api/token/balance?wallet=${activeWallet.publicKey}&mint=${PROPEL_MINT}`)
        const data = await response.json()
        if (data.success) {
          setUserPropelBalance(data.balance || 0)
        }
      } catch (err) {
        console.error('Failed to fetch PROPEL balance:', err)
      }
    }

    fetchBalance()
  }, [activeWallet, propelBalance])

  // Only show if PROPEL mint is configured
  if (!PROPEL_MINT) {
    return null
  }

  const bestApy = vaults.length > 0 ? Math.max(...vaults.map(v => v.apy)) : 0

  return (
    <div className={cn(
      "relative overflow-hidden rounded-xl transition-all duration-300",
      "bg-gradient-to-br from-[var(--aqua-primary)]/5 via-[var(--bg-secondary)] to-[var(--green)]/5",
      "border border-[var(--aqua-border)]",
      isExpanded && "ring-1 ring-[var(--aqua-primary)]/30",
      className
    )}>
      {/* Animated accent line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--aqua-primary)]/50 to-transparent" />
      
      {/* Header - Always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 text-left"
      >
        <div className="flex items-center gap-3">
          {/* Icon */}
          <div className="relative">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[var(--aqua-primary)] to-[var(--green)] flex items-center justify-center shadow-lg shadow-[var(--aqua-primary)]/20">
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            {/* Pulse indicator */}
            <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[var(--green)] border-2 border-[var(--bg-card)] animate-pulse" />
          </div>
          
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[var(--text-primary)]">PROPEL Earn</span>
              {bestApy > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--green)]/10 text-[var(--green)] font-semibold">
                  Up to {bestApy.toFixed(1)}% APY
                </span>
              )}
            </div>
            <p className="text-[10px] text-[var(--text-muted)]">
              Swap PROPEL → Yield-bearing positions
            </p>
          </div>
        </div>
        
        <svg 
          className={cn(
            "w-4 h-4 text-[var(--text-muted)] transition-transform duration-200",
            isExpanded && "rotate-180"
          )} 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-3">
          {/* PROPEL Balance */}
          {isAuthenticated && userPropelBalance > 0 && (
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[var(--aqua-primary)] to-[var(--warm-pink)] flex items-center justify-center">
                  <span className="text-[8px] font-bold text-white">P</span>
                </div>
                <span className="text-xs text-[var(--text-muted)]">Your PROPEL</span>
              </div>
              <span className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">
                {userPropelBalance.toLocaleString()}
              </span>
            </div>
          )}

          {/* Vault Previews */}
          {vaults.length > 0 && (
            <div className="space-y-2">
              <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Available Vaults</span>
              <div className="grid grid-cols-2 gap-2">
                {vaults.map((vault) => (
                  <div
                    key={vault.symbol}
                    className="p-2.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)]"
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className={cn(
                        "w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white",
                        vault.assetSymbol === 'USDC' 
                          ? "bg-gradient-to-br from-blue-500 to-blue-600" 
                          : "bg-gradient-to-br from-purple-500 to-fuchsia-500"
                      )}>
                        {vault.assetSymbol === 'USDC' ? '$' : '◎'}
                      </div>
                      <span className="text-xs font-medium text-[var(--text-primary)]">{vault.symbol}</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-lg font-bold text-[var(--aqua-primary)] tabular-nums">{vault.apyFormatted}</span>
                      <span className="text-[10px] text-[var(--text-muted)]">APY</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Button */}
          <Link
            href="/earn"
            className={cn(
              "w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-sm transition-all",
              "bg-gradient-to-r from-[var(--aqua-primary)] to-[var(--aqua-secondary)]",
              "text-white shadow-lg shadow-[var(--aqua-primary)]/20",
              "hover:shadow-xl hover:shadow-[var(--aqua-primary)]/30 hover:scale-[1.01]"
            )}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            Start Earning
          </Link>

          {/* Info text */}
          <p className="text-[9px] text-center text-[var(--text-muted)]">
            Withdraw anytime • No lockups
          </p>
        </div>
      )}
    </div>
  )
}

