'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAntiSniper, formatRemainingTime } from '@/hooks/use-anti-sniper'
import { cn } from '@/lib/utils'

interface AntiSniperStatusPanelProps {
  tokenMint: string
  className?: string
}

export function AntiSniperStatusPanel({ tokenMint, className }: AntiSniperStatusPanelProps) {
  const { 
    status, 
    events,
  } = useAntiSniper({ 
    tokenMint, 
    enabled: true,
    pollInterval: 500,
  })

  const [isExpanded, setIsExpanded] = useState(true)
  const [remainingTime, setRemainingTime] = useState<string>('--')

  // Update remaining time countdown
  useEffect(() => {
    if (!status?.expiresAt || status.status !== 'monitoring') return

    const updateTime = () => {
      const remaining = Math.max(0, status.expiresAt! - Date.now())
      setRemainingTime(formatRemainingTime(remaining))
    }

    updateTime()
    const interval = setInterval(updateTime, 100)
    return () => clearInterval(interval)
  }, [status?.expiresAt, status?.status])

  // Don't render if no status or not active
  if (!status || status.status === 'not_found') {
    return null
  }

  const getStatusColor = () => {
    switch (status.status) {
      case 'monitoring':
        return 'from-cyan-500/10 to-blue-500/10 border-cyan-500/30'
      case 'triggered':
        return 'from-red-500/10 to-orange-500/10 border-red-500/30'
      case 'expired':
        return 'from-emerald-500/10 to-green-500/10 border-emerald-500/30'
      default:
        return 'from-gray-500/10 to-gray-600/10 border-gray-500/30'
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'rounded-xl border bg-gradient-to-r p-4',
        getStatusColor(),
        className
      )}
    >
      {/* Header */}
      <div 
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-2 h-2 rounded-full",
            status.status === 'monitoring' && "bg-cyan-400 animate-pulse",
            status.status === 'triggered' && "bg-red-400",
            status.status === 'expired' && "bg-emerald-400",
          )} />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-white">Anti-Sniper</h3>
              <span className={cn(
                'text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wide',
                status.status === 'monitoring' && 'bg-cyan-500/20 text-cyan-300',
                status.status === 'triggered' && 'bg-red-500/20 text-red-300',
                status.status === 'expired' && 'bg-emerald-500/20 text-emerald-300',
              )}>
                {status.status === 'monitoring' && 'Active'}
                {status.status === 'triggered' && 'Triggered'}
                {status.status === 'expired' && 'Complete'}
              </span>
            </div>
            {status.status === 'monitoring' && (
              <p className="text-[10px] text-white/50 font-mono">{remainingTime} remaining</p>
            )}
          </div>
        </div>

        <button className="text-white/40 hover:text-white transition-colors text-xs">
          {isExpanded ? '−' : '+'}
        </button>
      </div>

      {/* Expanded Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-3 pt-3 border-t border-white/10 space-y-3">
              {/* Monitoring Config */}
              {status.config && (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded bg-black/20">
                    <p className="text-sm font-mono font-bold text-white">{status.config.windowBlocks}</p>
                    <p className="text-[10px] text-white/40 uppercase">Blocks</p>
                  </div>
                  <div className="p-2 rounded bg-black/20">
                    <p className="text-sm font-mono font-bold text-purple-400">{status.config.maxSupplyPercent}%</p>
                    <p className="text-[10px] text-white/40 uppercase">Max %</p>
                  </div>
                  <div className="p-2 rounded bg-black/20">
                    <p className="text-sm font-mono font-bold text-cyan-400">{status.config.maxSolAmount}</p>
                    <p className="text-[10px] text-white/40 uppercase">Max SOL</p>
                  </div>
                </div>
              )}

              {/* Progress Bar */}
              {status.status === 'monitoring' && status.expiresAt && status.startTime && (
                <div>
                  <div className="h-1.5 rounded-full bg-black/30 overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-cyan-500 to-blue-500"
                      initial={{ width: 0 }}
                      animate={{
                        width: `${Math.min(100, ((Date.now() - status.startTime) / (status.expiresAt - status.startTime)) * 100)}%`,
                      }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                  <p className="text-[10px] text-white/40 mt-1">Watching for large external buys...</p>
                </div>
              )}

              {/* Triggered Event */}
              {status.status === 'triggered' && status.triggerEvent && (
                <div className="p-3 rounded bg-red-500/10 border border-red-500/20 space-y-2">
                  <div className="text-xs font-medium text-red-400">Sniper Blocked</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-white/40">Attacker: </span>
                      <span className="font-mono text-white">
                        {status.triggerEvent.trader.slice(0, 4)}...{status.triggerEvent.trader.slice(-4)}
                      </span>
                    </div>
                    <div>
                      <span className="text-white/40">Size: </span>
                      <span className="font-mono text-red-400">{status.triggerEvent.solAmount.toFixed(2)} SOL</span>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-red-500/20 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-white/40">Sold: </span>
                      <span className="font-mono text-white">{status.triggerEvent.tokensSold.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-white/40">Received: </span>
                      <span className="font-mono text-emerald-400">{status.triggerEvent.solReceived.toFixed(4)} SOL</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Complete */}
              {status.status === 'expired' && !status.triggered && (
                <div className="p-3 rounded bg-emerald-500/10 border border-emerald-500/20 text-center">
                  <p className="text-xs text-emerald-400">✓ No sniper activity detected</p>
                </div>
              )}

              {/* Recent Events */}
              {events.length > 0 && (
                <div className="space-y-1">
                  {events.slice(0, 2).map((event) => (
                    <div 
                      key={event.id}
                      className="flex items-center justify-between p-2 rounded bg-black/20 text-xs"
                    >
                      <span className="text-white/60 capitalize">{event.eventType.replace('_', ' ')}</span>
                      <span className="font-mono text-emerald-400">+{event.totalSolReceived.toFixed(4)} SOL</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
