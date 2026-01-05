"use client"

import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"

interface Activity {
  id: string
  type: 'deposit' | 'withdraw' | 'claim'
  walletAddress: string
  walletShort: string
  vaultSymbol: string
  assetSymbol: string
  propelAmount: number
  underlyingAmount: number
  usdValue: number
  txSignature: string | null
  createdAt: string
  timeAgo: string
}

interface EarnActivityFeedProps {
  maxItems?: number
  showHeader?: boolean
  compact?: boolean
}

export function EarnActivityFeed({ 
  maxItems = 5, 
  showHeader = true,
  compact = false 
}: EarnActivityFeedProps) {
  const [activities, setActivities] = useState<Activity[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Fetch activities
  const fetchActivities = async () => {
    try {
      const response = await fetch(`/api/earn/activity?limit=${maxItems}`)
      const data = await response.json()
      
      if (data.success) {
        setActivities(data.data.activities)
      }
    } catch (err) {
      console.debug('[EARN-FEED] Failed to fetch activities:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchActivities()
    
    // Poll every 10 seconds for new activity
    const interval = setInterval(fetchActivities, 10000)
    return () => clearInterval(interval)
  }, [maxItems])

  // Format numbers
  const formatAmount = (num: number, symbol: string) => {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M ${symbol}`
    if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K ${symbol}`
    return `${num.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${symbol}`
  }

  const formatUsd = (num: number) => {
    if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`
    if (num >= 1_000) return `$${(num / 1_000).toFixed(2)}K`
    return `$${num.toFixed(2)}`
  }

  // Get activity icon and color
  const getActivityStyle = (type: string) => {
    switch (type) {
      case 'deposit':
        return { 
          icon: '🟢', 
          emoji: '→',
          color: 'text-[var(--green)]',
          bgColor: 'bg-[var(--green)]/10',
          borderColor: 'border-[var(--green)]/20',
          label: 'deposited'
        }
      case 'withdraw':
        return { 
          icon: '🔴', 
          emoji: '←',
          color: 'text-red-400',
          bgColor: 'bg-red-400/10',
          borderColor: 'border-red-400/20',
          label: 'withdrew'
        }
      case 'claim':
        return { 
          icon: '✨', 
          emoji: '💰',
          color: 'text-amber-400',
          bgColor: 'bg-amber-400/10',
          borderColor: 'border-amber-400/20',
          label: 'claimed'
        }
      default:
        return { 
          icon: '⚡', 
          emoji: '•',
          color: 'text-[var(--text-secondary)]',
          bgColor: 'bg-[var(--bg-secondary)]',
          borderColor: 'border-[var(--border-subtle)]',
          label: 'activity'
        }
    }
  }

  if (isLoading) {
    return (
      <div className={cn(
        "rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)]",
        compact ? "p-3" : "p-4"
      )}>
        {showHeader && (
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm">⚡</span>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Live Activity</h3>
          </div>
        )}
        <div className="flex items-center justify-center py-6">
          <div className="flex items-center gap-2 text-[var(--text-muted)] text-xs">
            <div className="w-3 h-3 border-2 border-[var(--aqua-primary)] border-t-transparent rounded-full animate-spin" />
            <span>Loading activity...</span>
          </div>
        </div>
      </div>
    )
  }

  if (activities.length === 0) {
    return (
      <div className={cn(
        "rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)]",
        compact ? "p-3" : "p-4"
      )}>
        {showHeader && (
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm">⚡</span>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Live Activity</h3>
          </div>
        )}
        <div className="text-center py-6">
          <p className="text-sm text-[var(--text-muted)]">No activity yet</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">Be the first to deposit!</p>
        </div>
      </div>
    )
  }

  return (
    <div className={cn(
      "rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] overflow-hidden",
      compact ? "p-3" : "p-4"
    )}>
      {showHeader && (
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-sm">⚡</span>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Live Activity</h3>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[var(--green)]/10 border border-[var(--green)]/20">
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--green)] animate-pulse" />
            <span className="text-[9px] font-medium text-[var(--green)] uppercase tracking-wider">Live</span>
          </div>
        </div>
      )}
      
      <div className="space-y-2">
        <AnimatePresence mode="popLayout">
          {activities.map((activity, index) => {
            const style = getActivityStyle(activity.type)
            
            return (
              <motion.div
                key={activity.id}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.2, delay: index * 0.05 }}
                className={cn(
                  "flex items-center gap-3 p-2 rounded-lg border transition-colors",
                  style.bgColor,
                  style.borderColor,
                  "hover:bg-[var(--bg-secondary)]"
                )}
              >
                {/* Icon */}
                <div className="text-sm flex-shrink-0">{style.icon}</div>
                
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="font-mono text-[var(--text-secondary)]">{activity.walletShort}</span>
                    <span className="text-[var(--text-muted)]">{style.label}</span>
                    {activity.propelAmount > 0 && (
                      <>
                        <span className="font-semibold text-[var(--warm-pink)]">
                          {formatAmount(activity.propelAmount, 'PROPEL')}
                        </span>
                        <span className="text-[var(--text-muted)]">{style.emoji}</span>
                      </>
                    )}
                    <span className={cn("font-semibold", style.color)}>
                      {formatAmount(activity.underlyingAmount, activity.assetSymbol)}
                    </span>
                  </div>
                  
                  {/* USD value and time */}
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-[var(--text-muted)]">
                      {formatUsd(activity.usdValue)}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)]">•</span>
                    <span className="text-[10px] text-[var(--text-muted)]">{activity.timeAgo}</span>
                    {activity.txSignature && (
                      <>
                        <span className="text-[10px] text-[var(--text-muted)]">•</span>
                        <a
                          href={`https://solscan.io/tx/${activity.txSignature}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-[var(--aqua-primary)] hover:underline"
                        >
                          View tx
                        </a>
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}

