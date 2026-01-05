"use client"

import { useState, useEffect, useCallback } from "react"
import type { Token } from "@/lib/types/database"
import { GlassPanel } from "@/components/ui/glass-panel"
import { cn } from "@/lib/utils"

interface TokenInfoProps {
  token: Token
}

interface BondingCurveStats {
  progress: number
  solBalance: number
  isMigrated: boolean
}

export function TokenInfo({ token }: TokenInfoProps) {
  const [bondingStats, setBondingStats] = useState<BondingCurveStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Fetch bonding curve progress from on-chain
  const fetchBondingStats = useCallback(async () => {
    try {
      const response = await fetch(`/api/token/${token.mint_address}/stats`)
      if (response.ok) {
        const data = await response.json()
        if (data.success && data.data) {
          setBondingStats({
            progress: data.data.bondingCurveProgress || 0,
            solBalance: data.data.bondingCurveSol || 0,
            isMigrated: data.data.isMigrated || false,
          })
        }
      }
    } catch (error) {
      console.debug("[TOKEN-INFO] Stats fetch failed:", error)
    } finally {
      setIsLoading(false)
    }
  }, [token.mint_address])

  useEffect(() => {
    fetchBondingStats()
    // Poll every 10 seconds for real-time updates
    const interval = setInterval(fetchBondingStats, 10_000)
    return () => clearInterval(interval)
  }, [fetchBondingStats])

  const formatNumber = (num: number | null | undefined) => {
    const n = num || 0
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`
    return n.toFixed(0)
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }

  // Use on-chain data if available, otherwise fallback to database
  const migrationProgress = bondingStats?.progress ?? token.bonding_curve_progress ?? 0
  const isMigrated = bondingStats?.isMigrated ?? token.stage === "migrated"
  const bondingSol = bondingStats?.solBalance ?? 0

  return (
    <GlassPanel className="p-4 h-full">
      <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-3">Token Info</h3>

      {/* Compact grid layout */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-[var(--text-muted)]">Supply</span>
          <span className="font-medium text-[var(--text-primary)]">{formatNumber(token.total_supply || 0)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-muted)]">Decimals</span>
          <span className="font-medium text-[var(--text-primary)]">{token.decimals || 6}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-muted)]">Stage</span>
          <span className={cn(
            "font-medium",
            isMigrated ? "text-[var(--aqua-primary)]" : "text-[var(--warm-orange)]"
          )}>
            {isMigrated ? "Migrated" : "Bonding"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-muted)]">Created</span>
          <span className="font-medium text-[var(--text-primary)]">{formatDate(token.created_at)}</span>
        </div>
      </div>

      {/* Migration Progress (if bonding stage) - uses on-chain data */}
      {!isMigrated && (
        <div className="mt-3 pt-3 border-t border-[var(--glass-border)]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[var(--text-secondary)]">Migration Progress</span>
              {isLoading && (
                <div className="w-2 h-2 border border-[var(--aqua-primary)] border-t-transparent rounded-full animate-spin" />
              )}
            </div>
            <span className="text-xs font-bold text-[var(--aqua-primary)]">
              {migrationProgress.toFixed(1)}%
            </span>
          </div>
          
          {/* Progress bar */}
          <div className="h-2 bg-[var(--ocean-surface)] rounded-full overflow-hidden mb-2">
            <div
              className="h-full bg-gradient-to-r from-[var(--aqua-primary)] to-[var(--warm-pink)] transition-all duration-500 ease-out"
              style={{ width: `${Math.min(100, migrationProgress)}%` }}
            />
          </div>
          
          {/* Bonding curve info */}
          <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)]">
            <span>Bonding Curve: {bondingSol.toFixed(2)} SOL</span>
            <span>Target: 85 SOL</span>
          </div>
          
          {migrationProgress >= 100 && (
            <div className="mt-2 p-2 rounded-lg bg-[var(--aqua-primary)]/10 border border-[var(--aqua-primary)]/30">
              <p className="text-[10px] text-[var(--aqua-primary)] text-center font-medium">
                🎉 Ready to migrate to Raydium!
              </p>
            </div>
          )}
        </div>
      )}

      {/* Migrated info */}
      {isMigrated && (
        <div className="mt-3 pt-3 border-t border-[var(--glass-border)]">
          <div className="p-2 rounded-lg bg-[var(--aqua-primary)]/10 border border-[var(--aqua-primary)]/30">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-[var(--aqua-primary)]" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              <span className="text-xs text-[var(--aqua-primary)] font-medium">Migrated to Raydium</span>
            </div>
            {token.migration_pool_address && (
              <a
                href={`https://raydium.io/swap/?inputMint=sol&outputMint=${token.mint_address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-[var(--text-muted)] hover:text-[var(--aqua-primary)] mt-1 block"
              >
                Trade on Raydium →
              </a>
            )}
          </div>
        </div>
      )}

      {/* Description - truncated */}
      {token.description && (
        <div className="mt-3 pt-3 border-t border-[var(--glass-border)]">
          <p className="text-xs text-[var(--text-primary)] leading-relaxed line-clamp-3">{token.description}</p>
        </div>
      )}
    </GlassPanel>
  )
}
