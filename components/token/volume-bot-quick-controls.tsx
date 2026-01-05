"use client"

import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useAuth } from "@/components/providers/auth-provider"
import { getAuthHeaders } from "@/lib/api/auth-headers"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { 
  Zap, 
  Play, 
  Square, 
  Settings, 
  AlertTriangle, 
  ChevronDown,
  ChevronUp,
  Loader2,
  TrendingUp,
  TrendingDown
} from "lucide-react"

interface VolumeBotQuickControlsProps {
  tokenMint: string
  tokenSymbol?: string
  currentPrice?: number
}

interface BotStatus {
  isActive: boolean
  strategy: 'DBPM' | 'PLD' | 'CMWA' | null
  executedVolumeSol: number
  targetVolumeSol: number
  successfulTrades: number
  buyCount: number
  sellCount: number
  netPnlSol: number
  currentProfitPercent: number
}

const STRATEGY_LABELS: Record<string, { label: string; color: string }> = {
  DBPM: { label: "Buy Pressure", color: "text-green-400" },
  PLD: { label: "Liquidity", color: "text-blue-400" },
  CMWA: { label: "Multi-Wallet", color: "text-purple-400" },
}

export function VolumeBotQuickControls({ 
  tokenMint, 
  tokenSymbol = "TOKEN",
  currentPrice = 0 
}: VolumeBotQuickControlsProps) {
  const { 
    isAuthenticated, 
    sessionId, 
    activeWallet, 
    userId, 
    wallets,
    toggledWallets,
    isMultiWalletMode,
  } = useAuth()
  
  const [isExpanded, setIsExpanded] = useState(false)
  const [status, setStatus] = useState<BotStatus | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [isStopping, setIsStopping] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch bot status
  const fetchStatus = useCallback(async () => {
    if (!sessionId || !userId || !tokenMint) return

    try {
      const response = await fetch(`/api/volume-bot/session?tokenMint=${tokenMint}`, {
        headers: getAuthHeaders({ sessionId, walletAddress: activeWallet?.public_key || '', userId }),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success && data.data) {
          setStatus({
            isActive: data.data.status === 'running',
            strategy: data.data.strategy || null,
            executedVolumeSol: data.data.executedVolumeSol || 0,
            targetVolumeSol: data.data.targetVolumeSol || 0,
            successfulTrades: data.data.successfulTrades || 0,
            buyCount: data.data.buyCount || 0,
            sellCount: data.data.sellCount || 0,
            netPnlSol: data.data.netPnlSol || 0,
            currentProfitPercent: data.data.currentProfitPercent || 0,
          })
        } else {
          setStatus({
            isActive: false,
            strategy: null,
            executedVolumeSol: 0,
            targetVolumeSol: 0,
            successfulTrades: 0,
            buyCount: 0,
            sellCount: 0,
            netPnlSol: 0,
            currentProfitPercent: 0,
          })
        }
      }
    } catch (err) {
      console.error('[VOLUME_BOT_QUICK] Failed to fetch status:', err)
    }
  }, [tokenMint, sessionId, activeWallet, userId])

  useEffect(() => {
    if (isAuthenticated) {
      fetchStatus()
      // Poll every 10 seconds when expanded
      const interval = setInterval(() => {
        if (isExpanded) fetchStatus()
      }, 10000)
      return () => clearInterval(interval)
    }
  }, [isAuthenticated, fetchStatus, isExpanded])

  const quickStart = async () => {
    if (!sessionId || !userId) return
    
    const walletIds = isMultiWalletMode && toggledWallets.size > 0
      ? Array.from(toggledWallets)
      : activeWallet ? [activeWallet.wallet_id] : []

    if (walletIds.length === 0) {
      setError("Please select at least one wallet")
      return
    }

    setIsStarting(true)
    setError(null)

    try {
      // Get wallet addresses
      const selectedWallets = wallets.filter(w => walletIds.includes(w.wallet_id))
      const walletAddresses = selectedWallets.map(w => w.address)

      // Quick start with default settings
      const response = await fetch('/api/volume-bot/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders({ sessionId, walletAddress: activeWallet?.public_key || '', userId }),
        },
        body: JSON.stringify({
          tokenMint,
          config: {
            strategy: 'DBPM',
            targetVolumeSol: 1.0,
            minTxSol: 0.01,
            maxTxSol: 0.1,
            buyPressurePercent: 70,
            walletIds,
            walletAddresses,
          },
        }),
      })

      const data = await response.json()
      if (data.success) {
        fetchStatus()
      } else {
        setError(data.error || 'Failed to start')
      }
    } catch (err) {
      setError('Failed to start Volume Bot')
    } finally {
      setIsStarting(false)
    }
  }

  const quickStop = async () => {
    if (!sessionId || !userId) return

    setIsStopping(true)
    setError(null)

    try {
      await fetch(`/api/volume-bot/session?tokenMint=${tokenMint}`, {
        method: 'DELETE',
        headers: getAuthHeaders({ sessionId, walletAddress: activeWallet?.public_key || '', userId }),
      })
      
      setStatus(prev => prev ? { ...prev, isActive: false } : null)
    } catch (err) {
      setError('Failed to stop')
    } finally {
      setIsStopping(false)
    }
  }

  const emergencyStop = async () => {
    if (!confirm('⚠️ EMERGENCY STOP will immediately halt all bot activity. Continue?')) {
      return
    }
    
    setIsStopping(true)
    try {
      await fetch('/api/volume-bot/smart-profit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders({ sessionId: sessionId || '', walletAddress: activeWallet?.public_key || '', userId: userId || '' }),
        },
        body: JSON.stringify({
          action: 'emergency_stop',
          tokenMint,
        }),
      })
      
      setStatus(prev => prev ? { ...prev, isActive: false } : null)
    } catch (err) {
      setError('Emergency stop failed')
    } finally {
      setIsStopping(false)
    }
  }

  if (!isAuthenticated) return null

  return (
    <div className="glass-panel rounded-xl overflow-hidden border border-purple-500/20">
      {/* Header - Always Visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-[var(--bg-secondary)]/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center",
            status?.isActive 
              ? "bg-purple-500/20 animate-pulse" 
              : "bg-[var(--bg-secondary)]"
          )}>
            <Zap className={cn(
              "w-4 h-4",
              status?.isActive ? "text-purple-400" : "text-[var(--text-muted)]"
            )} />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[var(--text-primary)]">
                Volume Bot
              </span>
              {status?.isActive && status.strategy && (
                <span className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded font-medium",
                  STRATEGY_LABELS[status.strategy]?.color || "text-purple-400",
                  "bg-purple-500/10"
                )}>
                  {status.strategy}
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              {status?.isActive 
                ? `${status.successfulTrades} trades • ${status.executedVolumeSol.toFixed(3)} SOL`
                : "Quick start volume generation"
              }
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {status?.isActive && (
            <div className={cn(
              "text-xs font-mono font-semibold px-2 py-1 rounded",
              status.netPnlSol >= 0 
                ? "bg-green-500/10 text-green-400" 
                : "bg-red-500/10 text-red-400"
            )}>
              {status.netPnlSol >= 0 ? '+' : ''}{status.netPnlSol.toFixed(4)} SOL
            </div>
          )}
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
          )}
        </div>
      </button>

      {/* Expanded Controls */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-[var(--border-subtle)]"
          >
            <div className="p-3 space-y-3">
              {/* Status Display */}
              {status?.isActive && (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded-lg bg-[var(--bg-secondary)]">
                    <p className="text-[10px] text-[var(--text-muted)]">Buys</p>
                    <p className="text-sm font-mono font-semibold text-green-400">
                      {status.buyCount}
                    </p>
                  </div>
                  <div className="p-2 rounded-lg bg-[var(--bg-secondary)]">
                    <p className="text-[10px] text-[var(--text-muted)]">Sells</p>
                    <p className="text-sm font-mono font-semibold text-red-400">
                      {status.sellCount}
                    </p>
                  </div>
                  <div className="p-2 rounded-lg bg-[var(--bg-secondary)]">
                    <p className="text-[10px] text-[var(--text-muted)]">Progress</p>
                    <p className="text-sm font-mono font-semibold text-purple-400">
                      {((status.executedVolumeSol / status.targetVolumeSol) * 100).toFixed(0)}%
                    </p>
                  </div>
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                  {error}
                </div>
              )}

              {/* Quick Actions */}
              <div className="flex gap-2">
                {status?.isActive ? (
                  <>
                    <button
                      onClick={quickStop}
                      disabled={isStopping}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] hover:border-[var(--border-default)] text-sm font-medium text-[var(--text-primary)] transition-all"
                    >
                      {isStopping ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                      Stop
                    </button>
                    <button
                      onClick={emergencyStop}
                      disabled={isStopping}
                      className="px-4 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-sm font-medium text-red-400 transition-all"
                    >
                      <AlertTriangle className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <button
                    onClick={quickStart}
                    disabled={isStarting}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-purple-500/20 border border-purple-500/30 hover:bg-purple-500/30 text-sm font-medium text-purple-400 transition-all"
                  >
                    {isStarting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                    Quick Start
                  </button>
                )}
              </div>

              {/* Link to Full Settings */}
              <Link
                href={`/volume-bot?token=${tokenMint}`}
                className="flex items-center justify-center gap-2 py-2 text-xs text-[var(--text-muted)] hover:text-purple-400 transition-colors"
              >
                <Settings className="w-3 h-3" />
                Advanced Settings
              </Link>

              {/* Wallet Info */}
              <div className="pt-2 border-t border-[var(--border-subtle)] text-center">
                <p className="text-[10px] text-[var(--text-muted)]">
                  {isMultiWalletMode && toggledWallets.size > 0
                    ? `Using ${toggledWallets.size} wallets from Multi-Wallet Mode`
                    : activeWallet 
                      ? `Using: ${activeWallet.public_key.slice(0, 4)}...${activeWallet.public_key.slice(-4)}`
                      : "No wallet selected"
                  }
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

