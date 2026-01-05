"use client"

/**
 * PROPEL Launchpad - Volume Bot Control Panel
 * 
 * Allows users to configure and control:
 * - Volume generation strategies (DBPM, PLD, CMWA)
 * - Smart Profit automation (take profit, stop loss, trailing stop)
 * - Real-time monitoring and execution status
 * - Emergency stop controls
 */

import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useAuth } from "@/components/providers/auth-provider"
import { getAuthHeaders } from "@/lib/api/auth-headers"
import { Loader2, ChevronDown, ChevronUp, HelpCircle, Zap, Target, Shield, Rocket } from "lucide-react"
import { cn } from "@/lib/utils"

// ============================================================================
// TYPES
// ============================================================================

interface VolumeBotPanelProps {
  tokenMint: string
  tokenSymbol?: string
  tokenDecimals?: number
  currentPrice?: number
}

interface VolumeBotSettings {
  // Core settings
  enabled: boolean
  strategy: 'DBPM' | 'PLD' | 'CMWA'
  targetVolumeSol: number
  minTxSol: number
  maxTxSol: number
  tradeIntervalMs: number
  buyPressurePercent: number
  
  // Smart Profit
  smartProfitEnabled: boolean
  takeProfitEnabled: boolean
  takeProfitPercent: number
  takeProfitSellPercent: number
  stopLossEnabled: boolean
  stopLossPercent: number
  trailingStopEnabled: boolean
  trailingStopPercent: number
  trailingStopActivationPercent: number
  emergencyStopEnabled: boolean
  emergencyStopLossPercent: number
  
  // Entry tracking
  averageEntryPrice: number
  totalTokensHeld: number
  totalSolInvested: number
}

interface VolumeBotState {
  isMonitoring: boolean
  currentPrice: number
  highestPrice: number
  lowestPrice: number
  currentProfitPercent: number
  trailingStopPrice: number | null
  lastUpdated: number
  triggersExecuted: {
    takeProfit: boolean
    stopLoss: boolean
    trailingStop: boolean
    emergencyStop: boolean
  }
}

interface SessionStatus {
  status: 'pending' | 'running' | 'paused' | 'stopped' | 'completed' | 'error'
  executedVolumeSol: number
  targetVolumeSol: number
  totalTrades: number
  successfulTrades: number
  buyCount: number
  sellCount: number
  netPnlSol: number
}

const DEFAULT_SETTINGS: VolumeBotSettings = {
  enabled: false,
  strategy: 'DBPM',
  targetVolumeSol: 1.0,
  minTxSol: 0.01,
  maxTxSol: 0.1,
  tradeIntervalMs: 5000,
  buyPressurePercent: 70,
  smartProfitEnabled: true,
  takeProfitEnabled: true,
  takeProfitPercent: 50,
  takeProfitSellPercent: 50,
  stopLossEnabled: true,
  stopLossPercent: 20,
  trailingStopEnabled: false,
  trailingStopPercent: 10,
  trailingStopActivationPercent: 20,
  emergencyStopEnabled: true,
  emergencyStopLossPercent: 50,
  averageEntryPrice: 0,
  totalTokensHeld: 0,
  totalSolInvested: 0,
}

// Strategy descriptions
const STRATEGIES = {
  DBPM: {
    name: 'Dynamic Buy-Pressure',
    code: 'DBPM',
    description: 'Creates sustained buy pressure with more buys than sells',
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/20',
  },
  PLD: {
    name: 'Predictive Liquidity',
    code: 'PLD',
    description: 'Counter-buys when price drops to stabilize',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/20',
  },
  CMWA: {
    name: 'Multi-Wallet Arbitrage',
    code: 'CMWA',
    description: 'Advanced multi-wallet trading patterns',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/20',
  },
}

// ============================================================================
// COMPONENT
// ============================================================================

export function VolumeBotPanel({
  tokenMint,
  tokenSymbol = "TOKEN",
  tokenDecimals = 9,
  currentPrice = 0,
}: VolumeBotPanelProps) {
  const { 
    sessionId, 
    activeWallet, 
    userId, 
    wallets,
    toggledWallets,
    isMultiWalletMode,
  } = useAuth()
  
  // State
  const [settings, setSettings] = useState<VolumeBotSettings>(DEFAULT_SETTINGS)
  const [state, setState] = useState<VolumeBotState | null>(null)
  const [sessionStatus, setSessionStatus] = useState<SessionStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [isStopping, setIsStopping] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [expandedSection, setExpandedSection] = useState<string | null>('strategy')
  
  // Selected wallets for trading - sync with multi-wallet mode
  const [selectedWalletIds, setSelectedWalletIds] = useState<string[]>([])

  // Sync with multi-wallet mode from TradePanel
  useEffect(() => {
    if (isMultiWalletMode && toggledWallets.size > 0) {
      setSelectedWalletIds(Array.from(toggledWallets))
    }
  }, [isMultiWalletMode, toggledWallets])

  // Load settings on mount
  useEffect(() => {
    loadSettings()
    loadSessionStatus()
    
    // Poll for updates every 5 seconds when active
    const interval = setInterval(() => {
      if (settings.enabled) {
        loadSmartProfitState()
        loadSessionStatus()
      }
    }, 5000)
    
    return () => clearInterval(interval)
  }, [tokenMint, settings.enabled])

  const loadSettings = useCallback(async () => {
    if (!sessionId || !userId) return
    
    try {
      setIsLoading(true)
      const response = await fetch(`/api/volume-bot/settings?tokenMint=${tokenMint}`, {
        headers: getAuthHeaders({
          sessionId,
          walletAddress: activeWallet?.public_key || null,
          userId,
        }),
      })
      
      if (response.ok) {
        const data = await response.json()
        if (data.success && data.data) {
          setSettings(prev => ({ ...prev, ...data.data }))
        }
      }
    } catch (err) {
      console.error('[VOLUME_BOT_UI] Failed to load settings:', err)
    } finally {
      setIsLoading(false)
    }
  }, [tokenMint, sessionId, activeWallet, userId])

  const loadSmartProfitState = useCallback(async () => {
    if (!sessionId || !userId) return
    
    try {
      const response = await fetch(`/api/volume-bot/smart-profit?tokenMint=${tokenMint}`, {
        headers: getAuthHeaders({
          sessionId,
          walletAddress: activeWallet?.public_key || null,
          userId,
        }),
      })
      
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setState(data.data.state)
          if (data.data.settings) {
            setSettings(prev => ({ ...prev, ...data.data.settings }))
          }
        }
      }
    } catch (err) {
      console.error('[VOLUME_BOT_UI] Failed to load state:', err)
    }
  }, [tokenMint, sessionId, activeWallet, userId])

  const loadSessionStatus = useCallback(async () => {
    if (!sessionId || !userId) return
    
    try {
      const response = await fetch(`/api/volume-bot/session?tokenMint=${tokenMint}`, {
        headers: getAuthHeaders({
          sessionId,
          walletAddress: activeWallet?.public_key || null,
          userId,
        }),
      })
      
      if (response.ok) {
        const data = await response.json()
        if (data.success && data.data) {
          setSessionStatus(data.data)
        }
      }
    } catch (err) {
      console.error('[VOLUME_BOT_UI] Failed to load session status:', err)
    }
  }, [tokenMint, sessionId, activeWallet, userId])

  const saveSettings = async () => {
    if (!sessionId || !userId) return
    
    setIsSaving(true)
    setError(null)
    
    try {
      const response = await fetch('/api/volume-bot/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders({ sessionId, walletAddress: activeWallet?.public_key || null, userId }),
        },
        body: JSON.stringify({
          tokenMint,
          settings,
        }),
      })
      
      const data = await response.json()
      
      if (data.success) {
        setSuccess('Settings saved successfully')
        setTimeout(() => setSuccess(null), 3000)
      } else {
        setError(data.error || 'Failed to save settings')
      }
    } catch (err) {
      setError('Failed to save settings')
    } finally {
      setIsSaving(false)
    }
  }

  const startBot = async () => {
    if (!sessionId || !userId || selectedWalletIds.length === 0) {
      setError('Please select at least one wallet')
      return
    }
    
    setIsStarting(true)
    setError(null)
    
    try {
      // Get wallet addresses
      const selectedWallets = wallets.filter(w => selectedWalletIds.includes(w.wallet_id))
      const walletAddresses = selectedWallets.map(w => w.address)
      
      // Start Smart Profit monitoring
      const smartProfitResponse = await fetch('/api/volume-bot/smart-profit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders({ sessionId, walletAddress: activeWallet?.public_key || null, userId }),
        },
        body: JSON.stringify({
          action: 'start',
          tokenMint,
          settings: {
            ...settings,
            walletIds: selectedWalletIds,
            walletAddresses,
            averageEntryPrice: currentPrice || settings.averageEntryPrice,
          },
        }),
      })
      
      const spData = await smartProfitResponse.json()
      
      if (!spData.success) {
        throw new Error(spData.error || 'Failed to start Smart Profit')
      }
      
      // Start session
      const sessionResponse = await fetch('/api/volume-bot/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders({ sessionId, walletAddress: activeWallet?.public_key || null, userId }),
        },
        body: JSON.stringify({
          tokenMint,
          config: {
            ...settings,
            walletIds: selectedWalletIds,
          },
        }),
      })
      
      const sessData = await sessionResponse.json()
      
      if (sessData.success) {
        setSettings(prev => ({ ...prev, enabled: true }))
        setSuccess('Volume Bot started successfully')
        setTimeout(() => setSuccess(null), 3000)
        loadSessionStatus()
        loadSmartProfitState()
      } else {
        throw new Error(sessData.error || 'Failed to start session')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start bot')
    } finally {
      setIsStarting(false)
    }
  }

  const stopBot = async () => {
    if (!sessionId || !userId) return
    
    setIsStopping(true)
    setError(null)
    
    try {
      // Stop Smart Profit
      await fetch('/api/volume-bot/smart-profit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders({ sessionId, walletAddress: activeWallet?.public_key || null, userId }),
        },
        body: JSON.stringify({
          action: 'stop',
          tokenMint,
        }),
      })
      
      // Stop session
      await fetch(`/api/volume-bot/session?tokenMint=${tokenMint}`, {
        method: 'DELETE',
        headers: getAuthHeaders({ sessionId, walletAddress: activeWallet?.public_key || null, userId }),
      })
      
      setSettings(prev => ({ ...prev, enabled: false }))
      setState(null)
      setSuccess('Volume Bot stopped')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError('Failed to stop bot')
    } finally {
      setIsStopping(false)
    }
  }

  const triggerEmergencyStop = async () => {
    if (!sessionId || !userId) return
    
    if (!confirm('⚠️ EMERGENCY STOP will immediately sell all positions. Are you sure?')) {
      return
    }
    
    setIsStopping(true)
    setError(null)
    
    try {
      await fetch('/api/volume-bot/smart-profit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders({ sessionId, walletAddress: activeWallet?.public_key || null, userId }),
        },
        body: JSON.stringify({
          action: 'emergency_stop',
          tokenMint,
        }),
      })
      
      setSettings(prev => ({ ...prev, enabled: false }))
      setState(null)
      setSuccess('Emergency stop executed')
    } catch (err) {
      setError('Emergency stop failed')
    } finally {
      setIsStopping(false)
    }
  }

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section)
  }

  const toggleWallet = (walletId: string) => {
    setSelectedWalletIds(prev => 
      prev.includes(walletId) 
        ? prev.filter(id => id !== walletId)
        : [...prev, walletId]
    )
  }

  // Render loading state
  if (isLoading) {
    return (
      <div className="card p-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
        </div>
      </div>
    )
  }

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-[var(--border)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-2 h-2 rounded-full",
              settings.enabled ? "bg-green-400 animate-pulse" : "bg-[var(--text-muted)]"
            )} />
            <div>
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                Volume Bot
              </h3>
              <p className="text-sm text-[var(--text-muted)]">
                {settings.enabled ? 'Active' : 'Inactive'} • {tokenSymbol}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {settings.enabled ? (
              <>
                <button
                  onClick={stopBot}
                  disabled={isStopping}
                  className="px-4 py-2 bg-[var(--bg-secondary)] text-[var(--text-primary)] rounded border border-[var(--border)] hover:bg-[var(--bg-secondary)]/80 transition-colors text-sm font-medium"
                >
                  {isStopping ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Stop'}
                </button>
                <button
                  onClick={triggerEmergencyStop}
                  disabled={isStopping}
                  className="px-4 py-2 bg-red-500/10 text-red-400 rounded border border-red-500/20 hover:bg-red-500/20 transition-colors text-sm font-medium"
                >
                  Emergency Stop
                </button>
              </>
            ) : (
              <button
                onClick={startBot}
                disabled={isStarting || selectedWalletIds.length === 0}
                className="px-4 py-2 bg-[var(--accent)] text-white rounded hover:bg-[var(--accent)]/80 transition-colors text-sm font-medium disabled:opacity-50"
              >
                {isStarting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Start'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Quick Guide - Degen/Pro Hybrid */}
      <div className="px-4 py-3 border-b border-[var(--border)] bg-gradient-to-r from-purple-500/5 to-[var(--bg-secondary)]">
        <details className="group">
          <summary className="flex items-center gap-2 cursor-pointer list-none">
            <HelpCircle className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-medium text-[var(--text-primary)]">Quick Guide</span>
            <ChevronDown className="w-4 h-4 text-[var(--text-muted)] ml-auto group-open:rotate-180 transition-transform" />
          </summary>
          <div className="mt-3 space-y-2 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div className="flex items-start gap-2 p-2 rounded bg-[var(--bg-primary)]/50">
                <Rocket className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-green-400">1. Select Wallets</p>
                  <p className="text-[var(--text-muted)]">Choose which wallets to trade with. Multiple wallets create organic-looking activity.</p>
                </div>
              </div>
              <div className="flex items-start gap-2 p-2 rounded bg-[var(--bg-primary)]/50">
                <Zap className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-yellow-400">2. Choose Strategy</p>
                  <p className="text-[var(--text-muted)]">DBPM: Buy pressure | PLD: Price stabilization | CMWA: Multi-wallet patterns</p>
                </div>
              </div>
              <div className="flex items-start gap-2 p-2 rounded bg-[var(--bg-primary)]/50">
                <Target className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-blue-400">3. Set Volume Target</p>
                  <p className="text-[var(--text-muted)]">Total SOL volume to generate. Bot automatically splits into buy/sell transactions.</p>
                </div>
              </div>
              <div className="flex items-start gap-2 p-2 rounded bg-[var(--bg-primary)]/50">
                <Shield className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-red-400">4. Smart Profit (Optional)</p>
                  <p className="text-[var(--text-muted)]">Enable auto take-profit and stop-loss for hands-free risk management.</p>
                </div>
              </div>
            </div>
            <p className="text-center text-[var(--text-dim)] pt-1 border-t border-[var(--border-subtle)]">
              Pro tip: Start with small amounts to test, then scale up once you see results.
            </p>
          </div>
        </details>
      </div>

      {/* Status Messages */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="p-3 bg-red-500/10 border-b border-red-500/20"
          >
            <span className="text-sm text-red-400">{error}</span>
          </motion.div>
        )}
        {success && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="p-3 bg-green-500/10 border-b border-green-500/20"
          >
            <span className="text-sm text-green-400">{success}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Live Status (when active) */}
      {state && settings.enabled && (
        <div className="p-4 border-b border-[var(--border)] bg-[var(--bg-secondary)]/50">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-xs text-[var(--text-muted)] mb-1">Current Price</p>
              <p className="text-lg font-mono font-semibold text-[var(--text-primary)]">
                {state.currentPrice.toFixed(9)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-[var(--text-muted)] mb-1">P/L</p>
              <p className={cn(
                "text-lg font-mono font-semibold",
                state.currentProfitPercent >= 0 ? "text-green-400" : "text-red-400"
              )}>
                {state.currentProfitPercent >= 0 ? '+' : ''}{state.currentProfitPercent.toFixed(2)}%
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-[var(--text-muted)] mb-1">Highest</p>
              <p className="text-lg font-mono font-semibold text-green-400">
                {state.highestPrice.toFixed(9)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-[var(--text-muted)] mb-1">Trailing Stop</p>
              <p className="text-lg font-mono font-semibold text-yellow-400">
                {state.trailingStopPrice ? state.trailingStopPrice.toFixed(9) : '-'}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="p-4 space-y-4">
        {/* Wallet Selection */}
        <div className="border border-[var(--border)] rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('wallets')}
            className="w-full p-3 flex items-center justify-between bg-[var(--bg-secondary)]/50 hover:bg-[var(--bg-secondary)] transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="font-medium text-[var(--text-primary)]">Trading Wallets</span>
              <span className="text-xs text-[var(--text-muted)] px-2 py-0.5 bg-[var(--bg-primary)] rounded">
                {selectedWalletIds.length} selected
              </span>
            </div>
            {expandedSection === 'wallets' ? (
              <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" />
            ) : (
              <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
            )}
          </button>
          
          <AnimatePresence>
            {expandedSection === 'wallets' && (
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: 'auto' }}
                exit={{ height: 0 }}
                className="overflow-hidden"
              >
                <div className="p-3 space-y-2 bg-[var(--bg-primary)]">
                  {wallets.length === 0 ? (
                    <p className="text-sm text-[var(--text-muted)]">
                      No wallets available. Add wallets to use the Volume Bot.
                    </p>
                  ) : (
                    wallets.map((wallet) => (
                      <label
                        key={wallet.id}
                        className={cn(
                          "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors",
                          selectedWalletIds.includes(wallet.id)
                            ? "bg-[var(--accent)]/10 border border-[var(--accent)]/30"
                            : "bg-[var(--bg-secondary)] hover:bg-[var(--bg-secondary)]/80"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={selectedWalletIds.includes(wallet.id)}
                          onChange={() => toggleWallet(wallet.id)}
                          className="w-4 h-4 accent-[var(--accent)]"
                          disabled={settings.enabled}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                            {wallet.label || 'Unnamed Wallet'}
                          </p>
                          <p className="text-xs text-[var(--text-muted)] font-mono">
                            {wallet.public_key.slice(0, 4)}...{wallet.public_key.slice(-4)}
                          </p>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Strategy Selection */}
        <div className="border border-[var(--border)] rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('strategy')}
            className="w-full p-3 flex items-center justify-between bg-[var(--bg-secondary)]/50 hover:bg-[var(--bg-secondary)] transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="font-medium text-[var(--text-primary)]">Strategy</span>
              <span className={cn("text-xs px-2 py-0.5 rounded font-mono", STRATEGIES[settings.strategy].bgColor, STRATEGIES[settings.strategy].color)}>
                {settings.strategy}
              </span>
            </div>
            {expandedSection === 'strategy' ? (
              <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" />
            ) : (
              <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
            )}
          </button>
          
          <AnimatePresence>
            {expandedSection === 'strategy' && (
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: 'auto' }}
                exit={{ height: 0 }}
                className="overflow-hidden"
              >
                <div className="p-3 space-y-2 bg-[var(--bg-primary)]">
                  {(Object.keys(STRATEGIES) as Array<keyof typeof STRATEGIES>).map((key) => {
                    const strat = STRATEGIES[key]
                    return (
                      <button
                        key={key}
                        onClick={() => setSettings(prev => ({ ...prev, strategy: key }))}
                        disabled={settings.enabled}
                        className={cn(
                          "w-full p-3 rounded-lg text-left transition-colors",
                          settings.strategy === key
                            ? cn(strat.bgColor, strat.borderColor, "border")
                            : "bg-[var(--bg-secondary)] hover:bg-[var(--bg-secondary)]/80"
                        )}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className={cn("font-medium text-sm", strat.color)}>{strat.name}</p>
                            <p className="text-xs text-[var(--text-muted)] mt-0.5">{strat.description}</p>
                          </div>
                          <span className={cn("text-xs font-mono px-1.5 py-0.5 rounded", strat.bgColor, strat.color)}>
                            {strat.code}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                  
                  {/* Buy Pressure Slider */}
                  <div className="pt-3 border-t border-[var(--border)]">
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                      Buy Pressure: {settings.buyPressurePercent}%
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={settings.buyPressurePercent}
                      onChange={(e) => setSettings(prev => ({ ...prev, buyPressurePercent: Number(e.target.value) }))}
                      disabled={settings.enabled}
                      className="w-full accent-[var(--accent)]"
                    />
                    <div className="flex justify-between text-xs text-[var(--text-muted)]">
                      <span>More Sells</span>
                      <span>Balanced</span>
                      <span>More Buys</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Volume Settings */}
        <div className="border border-[var(--border)] rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('volume')}
            className="w-full p-3 flex items-center justify-between bg-[var(--bg-secondary)]/50 hover:bg-[var(--bg-secondary)] transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="font-medium text-[var(--text-primary)]">Volume Target</span>
              <span className="text-xs px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded font-mono">
                {settings.targetVolumeSol} SOL
              </span>
            </div>
            {expandedSection === 'volume' ? (
              <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" />
            ) : (
              <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
            )}
          </button>
          
          <AnimatePresence>
            {expandedSection === 'volume' && (
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: 'auto' }}
                exit={{ height: 0 }}
                className="overflow-hidden"
              >
                <div className="p-3 space-y-4 bg-[var(--bg-primary)]">
                  {/* Target Volume */}
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                      Target Volume (SOL)
                    </label>
                    <p className="text-xs text-[var(--text-muted)] mb-2">
                      Total SOL volume to generate. Bot automatically splits into buy/sell transactions.
                    </p>
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={settings.targetVolumeSol}
                      onChange={(e) => setSettings(prev => ({ ...prev, targetVolumeSol: Number(e.target.value) }))}
                      disabled={settings.enabled}
                      className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded text-sm font-mono"
                      placeholder="1.0"
                    />
                  </div>

                  {/* Transaction Size Range */}
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                      Transaction Size Range (SOL)
                    </label>
                    <p className="text-xs text-[var(--text-muted)] mb-2">
                      Each trade will be a random amount between min and max.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-[var(--text-muted)]">Min per Tx</label>
                        <input
                          type="number"
                          min="0.001"
                          step="0.001"
                          value={settings.minTxSol}
                          onChange={(e) => setSettings(prev => ({ ...prev, minTxSol: Number(e.target.value) }))}
                          disabled={settings.enabled}
                          className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded text-sm font-mono"
                          placeholder="0.01"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-[var(--text-muted)]">Max per Tx</label>
                        <input
                          type="number"
                          min="0.001"
                          step="0.01"
                          value={settings.maxTxSol}
                          onChange={(e) => setSettings(prev => ({ ...prev, maxTxSol: Number(e.target.value) }))}
                          disabled={settings.enabled}
                          className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded text-sm font-mono"
                          placeholder="0.1"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Trade Interval */}
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                      Trade Interval: {(settings.tradeIntervalMs / 1000).toFixed(1)}s
                    </label>
                    <p className="text-xs text-[var(--text-muted)] mb-2">
                      Time between trades. Faster = more organic activity, but uses more SOL for fees.
                    </p>
                    <input
                      type="range"
                      min="1000"
                      max="30000"
                      step="500"
                      value={settings.tradeIntervalMs}
                      onChange={(e) => setSettings(prev => ({ ...prev, tradeIntervalMs: Number(e.target.value) }))}
                      disabled={settings.enabled}
                      className="w-full accent-[var(--accent)]"
                    />
                    <div className="flex justify-between text-xs text-[var(--text-muted)]">
                      <span>1s (Fast)</span>
                      <span>15s</span>
                      <span>30s (Slow)</span>
                    </div>
                  </div>

                  {/* Estimated Info */}
                  <div className="p-3 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-subtle)]">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-[var(--text-muted)]">Est. Trades</p>
                        <p className="font-mono text-[var(--text-primary)]">
                          {Math.ceil(settings.targetVolumeSol / ((settings.minTxSol + settings.maxTxSol) / 2))}
                        </p>
                      </div>
                      <div>
                        <p className="text-[var(--text-muted)]">Est. Duration</p>
                        <p className="font-mono text-[var(--text-primary)]">
                          {(() => {
                            const trades = Math.ceil(settings.targetVolumeSol / ((settings.minTxSol + settings.maxTxSol) / 2))
                            const totalMs = trades * settings.tradeIntervalMs
                            const minutes = Math.floor(totalMs / 60000)
                            return minutes < 60 ? `~${minutes}m` : `~${(minutes / 60).toFixed(1)}h`
                          })()}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Smart Profit Settings */}
        <div className="border border-[var(--border)] rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('smartProfit')}
            className="w-full p-3 flex items-center justify-between bg-[var(--bg-secondary)]/50 hover:bg-[var(--bg-secondary)] transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="font-medium text-[var(--text-primary)]">Smart Profit</span>
              {settings.smartProfitEnabled && (
                <span className="text-xs px-2 py-0.5 bg-green-500/10 text-green-400 rounded">
                  Enabled
                </span>
              )}
            </div>
            {expandedSection === 'smartProfit' ? (
              <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" />
            ) : (
              <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
            )}
          </button>
          
          <AnimatePresence>
            {expandedSection === 'smartProfit' && (
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: 'auto' }}
                exit={{ height: 0 }}
                className="overflow-hidden"
              >
                <div className="p-3 space-y-4 bg-[var(--bg-primary)]">
                  {/* Take Profit */}
                  <div className="space-y-2">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={settings.takeProfitEnabled}
                        onChange={(e) => setSettings(prev => ({ ...prev, takeProfitEnabled: e.target.checked }))}
                        disabled={settings.enabled}
                        className="w-4 h-4 accent-green-500"
                      />
                      <span className="text-sm font-medium text-green-400">Take Profit</span>
                    </label>
                    {settings.takeProfitEnabled && (
                      <div className="ml-6 grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-[var(--text-muted)]">At Profit %</label>
                          <input
                            type="number"
                            value={settings.takeProfitPercent}
                            onChange={(e) => setSettings(prev => ({ ...prev, takeProfitPercent: Number(e.target.value) }))}
                            disabled={settings.enabled}
                            className="w-full px-2 py-1 bg-[var(--bg-secondary)] border border-[var(--border)] rounded text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-[var(--text-muted)]">Sell %</label>
                          <input
                            type="number"
                            value={settings.takeProfitSellPercent}
                            onChange={(e) => setSettings(prev => ({ ...prev, takeProfitSellPercent: Number(e.target.value) }))}
                            disabled={settings.enabled}
                            className="w-full px-2 py-1 bg-[var(--bg-secondary)] border border-[var(--border)] rounded text-sm"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Stop Loss */}
                  <div className="space-y-2">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={settings.stopLossEnabled}
                        onChange={(e) => setSettings(prev => ({ ...prev, stopLossEnabled: e.target.checked }))}
                        disabled={settings.enabled}
                        className="w-4 h-4 accent-red-500"
                      />
                      <span className="text-sm font-medium text-red-400">Stop Loss</span>
                    </label>
                    {settings.stopLossEnabled && (
                      <div className="ml-6">
                        <label className="text-xs text-[var(--text-muted)]">At Loss %</label>
                        <input
                          type="number"
                          value={settings.stopLossPercent}
                          onChange={(e) => setSettings(prev => ({ ...prev, stopLossPercent: Number(e.target.value) }))}
                          disabled={settings.enabled}
                          className="w-full px-2 py-1 bg-[var(--bg-secondary)] border border-[var(--border)] rounded text-sm"
                        />
                      </div>
                    )}
                  </div>
                  
                  {/* Trailing Stop */}
                  <div className="space-y-2">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={settings.trailingStopEnabled}
                        onChange={(e) => setSettings(prev => ({ ...prev, trailingStopEnabled: e.target.checked }))}
                        disabled={settings.enabled}
                        className="w-4 h-4 accent-yellow-500"
                      />
                      <span className="text-sm font-medium text-yellow-400">Trailing Stop</span>
                    </label>
                    {settings.trailingStopEnabled && (
                      <div className="ml-6 grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-[var(--text-muted)]">Trail %</label>
                          <input
                            type="number"
                            value={settings.trailingStopPercent}
                            onChange={(e) => setSettings(prev => ({ ...prev, trailingStopPercent: Number(e.target.value) }))}
                            disabled={settings.enabled}
                            className="w-full px-2 py-1 bg-[var(--bg-secondary)] border border-[var(--border)] rounded text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-[var(--text-muted)]">Activate at %</label>
                          <input
                            type="number"
                            value={settings.trailingStopActivationPercent}
                            onChange={(e) => setSettings(prev => ({ ...prev, trailingStopActivationPercent: Number(e.target.value) }))}
                            disabled={settings.enabled}
                            className="w-full px-2 py-1 bg-[var(--bg-secondary)] border border-[var(--border)] rounded text-sm"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Emergency Stop */}
                  <div className="pt-2 border-t border-[var(--border)]">
                    <p className="text-xs text-[var(--text-muted)]">
                      Emergency stop at {settings.emergencyStopLossPercent}% loss is always enabled
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Save Button */}
        <div className="flex justify-end gap-2">
          <button
            onClick={saveSettings}
            disabled={isSaving || settings.enabled}
            className="px-4 py-2 bg-[var(--accent)] text-white rounded text-sm font-medium hover:bg-[var(--accent)]/80 transition-colors disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Settings'}
          </button>
        </div>

        {/* Session Stats (when active) */}
        {sessionStatus && settings.enabled && (
          <div className="mt-4 p-4 bg-[var(--bg-secondary)] rounded-lg">
            <h4 className="text-sm font-medium text-[var(--text-primary)] mb-3">Session Stats</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-[var(--text-muted)]">Volume</p>
                <p className="font-mono">
                  {sessionStatus.executedVolumeSol.toFixed(4)} / {sessionStatus.targetVolumeSol.toFixed(2)} SOL
                </p>
              </div>
              <div>
                <p className="text-[var(--text-muted)]">Trades</p>
                <p className="font-mono">
                  {sessionStatus.successfulTrades} / {sessionStatus.totalTrades}
                </p>
              </div>
              <div>
                <p className="text-[var(--text-muted)]">Buy / Sell</p>
                <p className="font-mono">
                  <span className="text-green-400">{sessionStatus.buyCount}</span>
                  {' / '}
                  <span className="text-red-400">{sessionStatus.sellCount}</span>
                </p>
              </div>
              <div>
                <p className="text-[var(--text-muted)]">Net P/L</p>
                <p className={cn(
                  "font-mono",
                  sessionStatus.netPnlSol >= 0 ? "text-green-400" : "text-red-400"
                )}>
                  {sessionStatus.netPnlSol >= 0 ? '+' : ''}{sessionStatus.netPnlSol.toFixed(4)} SOL
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Info Box */}
        <div className="p-3 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg">
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            2% platform fee applies to all transactions.
          </p>
        </div>
      </div>
    </div>
  )
}

