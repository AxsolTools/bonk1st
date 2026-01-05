"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { Zap, Sparkles, ExternalLink, Copy, Check, ChevronDown, ChevronUp, RefreshCw, Bell } from "lucide-react"

interface DexUpdate {
  id: string
  type: 'boost' | 'profile'
  data: {
    tokenAddress: string
    chainId: string
    amount?: number
    totalAmount?: number
    name?: string
    description?: string
    url: string
    icon?: string
    timestamp?: number
  }
  tokenName?: string
  tokenSymbol?: string
  tokenLogo?: string
}

interface DexAlertsTickerProps {
  className?: string
  maxVisible?: number
}

const DEXSCREENER_LOGO = "https://dexscreener.com/favicon.png"
const POLL_INTERVAL = 10000 // 10 seconds

export function DexAlertsTicker({ className, maxVisible = 20 }: DexAlertsTickerProps) {
  // Persistent local storage of alerts
  const [alerts, setAlerts] = useState<DexUpdate[]>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('dex_alerts_cache')
      if (stored) {
        try {
          const parsed = JSON.parse(stored)
          // Filter out alerts older than 24 hours
          const dayAgo = Date.now() - 24 * 60 * 60 * 1000
          return parsed.filter((a: DexUpdate) => (a.data.timestamp || 0) > dayAgo)
        } catch {
          return []
        }
      }
    }
    return []
  })
  
  const [isLoading, setIsLoading] = useState(true)
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [hasNewAlerts, setHasNewAlerts] = useState(false)
  const seenIdsRef = useRef<Set<string>>(new Set())
  const containerRef = useRef<HTMLDivElement>(null)

  // Initialize seen IDs from stored alerts
  useEffect(() => {
    alerts.forEach(a => seenIdsRef.current.add(a.id))
  }, [])

  // Persist alerts to localStorage
  useEffect(() => {
    if (alerts.length > 0) {
      localStorage.setItem('dex_alerts_cache', JSON.stringify(alerts.slice(0, 100)))
    }
  }, [alerts])

  const fetchUpdates = useCallback(async () => {
    try {
      const res = await fetch('/api/dexscreener/updates?type=all&limit=50', {
        cache: 'no-store',
      })
      
      if (!res.ok) return
      
      const data = await res.json()
      
      if (data.success && data.data && Array.isArray(data.data)) {
        const newAlerts: DexUpdate[] = []
        
        for (const update of data.data) {
          if (!update.id || seenIdsRef.current.has(update.id)) continue
          seenIdsRef.current.add(update.id)
          newAlerts.push(update)
        }
        
        if (newAlerts.length > 0) {
          setAlerts(prev => {
            // Add new alerts to the beginning
            const combined = [...newAlerts, ...prev]
            // Keep only the last 100 alerts
            return combined.slice(0, 100)
          })
          setHasNewAlerts(true)
          setTimeout(() => setHasNewAlerts(false), 3000)
        }
      }
    } catch (error) {
      console.error('Failed to fetch DexScreener updates:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUpdates()
    const interval = setInterval(fetchUpdates, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchUpdates])

  const copyAddress = (address: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    navigator.clipboard.writeText(address)
    setCopiedAddress(address)
    setTimeout(() => setCopiedAddress(null), 1500)
  }

  const formatTimeAgo = (timestamp?: number) => {
    if (!timestamp) return 'now'
    const seconds = Math.floor((Date.now() - timestamp) / 1000)
    if (seconds < 60) return `${seconds}s`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
    return `${Math.floor(seconds / 86400)}d`
  }

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`
  }

  if (isLoading && alerts.length === 0) {
    return (
      <div className={cn(
        "w-full bg-gradient-to-r from-[var(--bg-secondary)] via-[var(--bg-primary)] to-[var(--bg-secondary)] border-b border-[var(--border-subtle)]",
        className
      )}>
        <div className="max-w-[1920px] mx-auto px-4 py-3 flex items-center gap-3">
          <RefreshCw className="w-4 h-4 text-[var(--aqua-primary)] animate-spin" />
          <span className="text-sm text-[var(--text-muted)]">Loading DexScreener alerts...</span>
        </div>
      </div>
    )
  }

  if (alerts.length === 0) {
    return (
      <div className={cn(
        "w-full bg-gradient-to-r from-[var(--bg-secondary)] via-[var(--bg-primary)] to-[var(--bg-secondary)] border-b border-[var(--border-subtle)]",
        className
      )}>
        <div className="max-w-[1920px] mx-auto px-4 py-3 flex items-center gap-3">
          <img src={DEXSCREENER_LOGO} alt="DexScreener" className="w-5 h-5 rounded" />
          <Bell className="w-4 h-4 text-[var(--text-muted)]" />
          <span className="text-sm text-[var(--text-muted)]">Waiting for DexScreener updates...</span>
          <span className="text-xs text-[var(--text-dim)]">(SOL tokens only)</span>
        </div>
      </div>
    )
  }

  return (
    <div 
      ref={containerRef}
      className={cn(
        "w-full bg-gradient-to-r from-[var(--bg-secondary)] via-[var(--bg-primary)] to-[var(--bg-secondary)] border-b transition-all duration-300",
        hasNewAlerts ? "border-[var(--aqua-primary)] shadow-[0_2px_20px_rgba(20,184,166,0.2)]" : "border-[var(--border-subtle)]",
        className
      )}
    >
      <div className="max-w-[1920px] mx-auto">
        {/* Main Ticker Row - Always visible */}
        <div 
          className="px-4 py-2 flex items-center gap-3 cursor-pointer hover:bg-[var(--bg-elevated)]/20 transition-colors"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {/* DexScreener Badge */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <img 
              src={DEXSCREENER_LOGO} 
              alt="DexScreener" 
              className="w-5 h-5 rounded"
            />
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-[var(--aqua-primary)] uppercase tracking-wider">LIVE</span>
              {hasNewAlerts && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="w-2 h-2 rounded-full bg-[var(--aqua-primary)] animate-pulse"
                />
              )}
            </div>
            <span className="text-xs text-[var(--text-dim)] hidden sm:inline">|</span>
            <span className="text-xs text-[var(--text-muted)] hidden sm:inline">{alerts.length} alerts</span>
          </div>

          {/* Separator */}
          <div className="w-px h-6 bg-[var(--border-subtle)] flex-shrink-0" />

          {/* Scrolling Ticker Container - Full Width */}
          <div className="flex-1 overflow-hidden">
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
              {alerts.slice(0, maxVisible).map((alert, index) => (
                <AlertChip
                  key={alert.id}
                  alert={alert}
                  copiedAddress={copiedAddress}
                  onCopy={copyAddress}
                  formatTimeAgo={formatTimeAgo}
                  truncateAddress={truncateAddress}
                  isNew={index < 3 && hasNewAlerts}
                />
              ))}
            </div>
          </div>

          {/* Expand/Collapse Button */}
          <button className="flex-shrink-0 p-1.5 rounded-lg hover:bg-[var(--bg-elevated)] transition-colors">
            {isExpanded ? (
              <ChevronUp className="w-5 h-5 text-[var(--text-muted)]" />
            ) : (
              <ChevronDown className="w-5 h-5 text-[var(--text-muted)]" />
            )}
          </button>
        </div>

        {/* Expanded Content - Grid View */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden border-t border-[var(--border-subtle)]"
            >
              <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 max-h-[400px] overflow-y-auto">
                {alerts.map((alert) => (
                  <ExpandedAlertCard
                    key={alert.id}
                    alert={alert}
                    copiedAddress={copiedAddress}
                    onCopy={copyAddress}
                    formatTimeAgo={formatTimeAgo}
                    truncateAddress={truncateAddress}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// Compact Alert Chip - Larger and more visible
function AlertChip({
  alert,
  copiedAddress,
  onCopy,
  formatTimeAgo,
  truncateAddress,
  isNew,
}: {
  alert: DexUpdate
  copiedAddress: string | null
  onCopy: (address: string, e: React.MouseEvent) => void
  formatTimeAgo: (timestamp?: number) => string
  truncateAddress: (address: string) => string
  isNew: boolean
}) {
  const isBoost = alert.type === 'boost'
  
  return (
    <Link 
      href={`/token/${alert.data.tokenAddress}`}
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-lg transition-all group flex-shrink-0",
        isBoost 
          ? "bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/30"
          : "bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30",
        isNew && "ring-1 ring-[var(--aqua-primary)] ring-offset-1 ring-offset-[var(--bg-primary)]"
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Type Icon */}
      {isBoost ? (
        <Zap className="w-4 h-4 text-yellow-400 flex-shrink-0" />
      ) : (
        <Sparkles className="w-4 h-4 text-purple-400 flex-shrink-0" />
      )}

      {/* Token Logo */}
      <div className="relative w-6 h-6 rounded-full overflow-hidden flex-shrink-0 bg-[var(--bg-secondary)] flex items-center justify-center">
        <Image
          src={alert.tokenLogo || alert.data.icon || `https://dd.dexscreener.com/ds-data/tokens/solana/${alert.data.tokenAddress}.png`}
          alt={alert.tokenSymbol || '?'}
          fill
          className="object-cover"
          unoptimized
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none'
          }}
        />
        <span className="text-[8px] font-bold text-[var(--text-muted)] absolute">
          {(alert.tokenSymbol || '?').slice(0, 2).toUpperCase()}
        </span>
      </div>

      {/* Token Symbol */}
      <span className="text-sm font-bold text-[var(--text-primary)] max-w-[80px] truncate">
        {alert.tokenSymbol || truncateAddress(alert.data.tokenAddress)}
      </span>

      {/* Boost Amount (for boosts only) */}
      {isBoost && (alert.data as any).amount > 1 && (
        <span className="text-xs font-bold text-yellow-300 bg-yellow-500/20 px-1.5 py-0.5 rounded">
          x{(alert.data as any).amount}
        </span>
      )}

      {/* Time */}
      <span className="text-xs text-[var(--text-dim)]">
        {formatTimeAgo(alert.data.timestamp)}
      </span>
    </Link>
  )
}

// Expanded Alert Card
function ExpandedAlertCard({
  alert,
  copiedAddress,
  onCopy,
  formatTimeAgo,
  truncateAddress,
}: {
  alert: DexUpdate
  copiedAddress: string | null
  onCopy: (address: string, e: React.MouseEvent) => void
  formatTimeAgo: (timestamp?: number) => string
  truncateAddress: (address: string) => string
}) {
  const isBoost = alert.type === 'boost'
  
  return (
    <div className={cn(
      "flex items-center gap-3 p-3 rounded-xl transition-all",
      isBoost 
        ? "bg-yellow-500/5 hover:bg-yellow-500/10 border border-yellow-500/20"
        : "bg-purple-500/5 hover:bg-purple-500/10 border border-purple-500/20"
    )}>
      {/* Type Badge */}
      <div className={cn(
        "flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold uppercase flex-shrink-0",
        isBoost ? "bg-yellow-500/20 text-yellow-400" : "bg-purple-500/20 text-purple-400"
      )}>
        {isBoost ? (
          <>
            <Zap className="w-3 h-3" />
            Boost
          </>
        ) : (
          <>
            <Sparkles className="w-3 h-3" />
            Profile
          </>
        )}
      </div>

      {/* Token Logo */}
      <div className="relative w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-[var(--bg-secondary)] flex items-center justify-center">
        <Image
          src={alert.tokenLogo || alert.data.icon || `https://dd.dexscreener.com/ds-data/tokens/solana/${alert.data.tokenAddress}.png`}
          alt={alert.tokenSymbol || '?'}
          fill
          className="object-cover"
          unoptimized
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none'
          }}
        />
        <span className="text-[10px] font-bold text-[var(--text-muted)] absolute">
          {(alert.tokenSymbol || '?').slice(0, 2).toUpperCase()}
        </span>
      </div>

      {/* Token Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-[var(--text-primary)] truncate">
            {alert.tokenSymbol || 'Unknown'}
          </span>
          {isBoost && (
            <span className="text-xs font-bold text-yellow-400">
              +{(alert.data as any).amount || 1}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-[var(--text-dim)] font-mono">
            {truncateAddress(alert.data.tokenAddress)}
          </span>
          <button
            onClick={(e) => onCopy(alert.data.tokenAddress, e)}
            className="p-0.5 rounded hover:bg-[var(--bg-elevated)] transition-colors"
          >
            {copiedAddress === alert.data.tokenAddress ? (
              <Check className="w-3 h-3 text-[var(--success)]" />
            ) : (
              <Copy className="w-3 h-3 text-[var(--text-muted)]" />
            )}
          </button>
        </div>
      </div>

      {/* Time */}
      <span className="text-xs text-[var(--text-dim)] flex-shrink-0">
        {formatTimeAgo(alert.data.timestamp)}
      </span>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <Link
          href={`/token/${alert.data.tokenAddress}`}
          className="p-2 rounded-lg bg-[var(--aqua-primary)]/10 hover:bg-[var(--aqua-primary)]/20 transition-colors"
          title="View Token"
        >
          <ExternalLink className="w-3.5 h-3.5 text-[var(--aqua-primary)]" />
        </Link>
        <a
          href={alert.data.url}
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-secondary)] transition-colors"
          title="View on DexScreener"
          onClick={(e) => e.stopPropagation()}
        >
          <img src="https://dexscreener.com/favicon.png" alt="DS" className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  )
}

export default DexAlertsTicker
