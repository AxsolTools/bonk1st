'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from '@/hooks/use-toast'
import { useAuth } from '@/components/providers/auth-provider'

// ============================================================================
// TYPES
// ============================================================================

export interface AntiSniperConfig {
  enabled: boolean
  maxSupplyPercentThreshold: number
  maxSolAmountThreshold: number
  monitorBlocksWindow: number
  takeProfitEnabled: boolean
  takeProfitMultiplier: number
  autoSellWalletIds: string[]
  sellPercentage: number
}

export interface AntiSniperStatus {
  tokenMint: string
  status: 'monitoring' | 'triggered' | 'expired' | 'not_found' | 'error'
  triggered: boolean
  startTime?: number
  expiresAt?: number
  remainingMs?: number
  config?: {
    windowBlocks: number
    maxSupplyPercent: number
    maxSolAmount: number
  }
  triggerEvent?: {
    reason: string
    trader: string
    solAmount: number
    tokensSold: number
    solReceived: number
    timestamp: number
  }
}

export interface AntiSniperEvent {
  id: string
  tokenMint: string
  eventType: 'sniper_detected' | 'take_profit' | 'manual'
  triggerTrade?: {
    signature: string
    trader: string
    solAmount: number
  }
  walletsSold: string[]
  totalTokensSold: number
  totalSolReceived: number
  timestamp: number
}

interface UseAntiSniperOptions {
  tokenMint?: string
  pollInterval?: number
  enabled?: boolean
  onTrigger?: (event: AntiSniperEvent) => void
}

// ============================================================================
// HOOK
// ============================================================================

export function useAntiSniper({
  tokenMint,
  pollInterval = 1000,
  enabled = true,
  onTrigger,
}: UseAntiSniperOptions = {}) {
  const { sessionId } = useAuth()
  const [status, setStatus] = useState<AntiSniperStatus | null>(null)
  const [isMonitoring, setIsMonitoring] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [events, setEvents] = useState<AntiSniperEvent[]>([])
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const hasTriggeredRef = useRef(false)

  // Start monitoring a token
  const startMonitoring = useCallback(async (
    mint: string,
    config: AntiSniperConfig,
    launchSlot: number,
    userWallets: string[],
    totalSupply: number,
    decimals: number
  ) => {
    if (!sessionId) {
      setError('Session required')
      return { success: false, error: 'Session required' }
    }

    try {
      setIsMonitoring(true)
      setError(null)
      hasTriggeredRef.current = false

      const response = await fetch('/api/token22/anti-sniper/monitor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': sessionId,
        },
        body: JSON.stringify({
          tokenMint: mint,
          config,
          launchSlot,
          userWallets,
          totalSupply,
          decimals,
          sessionId,
        }),
      })

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to start monitoring')
      }

      setStatus({
        tokenMint: mint,
        status: 'monitoring',
        triggered: false,
        startTime: Date.now(),
        expiresAt: new Date(data.data.expiresAt).getTime(),
        remainingMs: data.data.windowMs,
        config: {
          windowBlocks: config.monitorBlocksWindow,
          maxSupplyPercent: config.maxSupplyPercentThreshold,
          maxSolAmount: config.maxSolAmountThreshold,
        },
      })

      // Show toast
      toast({
        title: '🛡️ Anti-Sniper Active',
        description: `Monitoring for ${config.monitorBlocksWindow} blocks. Auto-sell will trigger on sniper detection.`,
        variant: 'default',
      })

      return { success: true, data: data.data }

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start monitoring'
      setError(message)
      setIsMonitoring(false)
      return { success: false, error: message }
    }
  }, [sessionId])

  // Poll for status updates
  const pollStatus = useCallback(async (mint: string) => {
    if (!sessionId) return

    try {
      const response = await fetch(`/api/token22/anti-sniper/monitor?tokenMint=${mint}`, {
        headers: {
          'x-session-id': sessionId,
        },
      })

      const data = await response.json()

      if (data.success) {
        const newStatus: AntiSniperStatus = {
          tokenMint: mint,
          status: data.data.status,
          triggered: data.data.triggered,
          startTime: data.data.startTime,
          expiresAt: data.data.expiresAt,
          remainingMs: data.data.remainingMs,
          config: data.data.config,
        }

        setStatus(newStatus)

        // Check if just triggered
        if (newStatus.triggered && !hasTriggeredRef.current) {
          hasTriggeredRef.current = true
          
          // Show triggered toast
          toast({
            title: '🚨 Sniper Detected!',
            description: 'Anti-sniper protection triggered. Bundle wallets are being sold automatically.',
            variant: 'destructive',
          })

          // Fetch latest event details
          await fetchLatestEvent(mint)
        }

        // Check if monitoring complete
        if (newStatus.status === 'expired' && !newStatus.triggered) {
          setIsMonitoring(false)
          
          toast({
            title: '✅ Monitoring Complete',
            description: 'No sniper activity detected during the monitoring window.',
            variant: 'default',
          })
        }
      }
    } catch (err) {
      console.error('[useAntiSniper] Poll error:', err)
    }
  }, [sessionId])

  // Fetch the latest event for a token
  const fetchLatestEvent = useCallback(async (mint: string) => {
    try {
      const response = await fetch(`/api/token22/anti-sniper/events?tokenMint=${mint}&limit=1`, {
        headers: {
          'x-session-id': sessionId || '',
        },
      })

      const data = await response.json()

      if (data.success && data.data.events?.length > 0) {
        const event = data.data.events[0]
        setEvents(prev => [event, ...prev])
        
        if (onTrigger) {
          onTrigger(event)
        }

        // Update status with event details
        setStatus(prev => prev ? {
          ...prev,
          triggerEvent: {
            reason: event.eventType,
            trader: event.triggerTrade?.trader || 'Unknown',
            solAmount: event.triggerTrade?.solAmount || 0,
            tokensSold: event.totalTokensSold,
            solReceived: event.totalSolReceived,
            timestamp: event.timestamp,
          },
        } : null)
      }
    } catch (err) {
      console.error('[useAntiSniper] Failed to fetch events:', err)
    }
  }, [sessionId, onTrigger])

  // Manual sell trigger
  const triggerSell = useCallback(async (
    mint: string,
    walletIds: string[],
    sellPercentage: number,
    reason: 'sniper_detected' | 'take_profit' | 'manual' = 'manual'
  ) => {
    if (!sessionId) {
      return { success: false, error: 'Session required' }
    }

    try {
      const response = await fetch('/api/token22/anti-sniper/sell', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': sessionId,
        },
        body: JSON.stringify({
          tokenMint: mint,
          walletIds,
          sellPercentage,
          reason,
        }),
      })

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error?.message || 'Sell failed')
      }

      toast({
        title: '💰 Auto-Sell Executed',
        description: `Sold ${data.data.totalTokensSold.toLocaleString()} tokens for ${data.data.totalSolReceived.toFixed(4)} SOL`,
        variant: 'default',
      })

      return { success: true, data: data.data }

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sell failed'
      toast({
        title: '❌ Sell Failed',
        description: message,
        variant: 'destructive',
      })
      return { success: false, error: message }
    }
  }, [sessionId])

  // Stop monitoring
  const stopMonitoring = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setIsMonitoring(false)
  }, [])

  // Effect: Poll for status when monitoring
  useEffect(() => {
    if (!enabled || !tokenMint || !isMonitoring) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    // Initial poll
    pollStatus(tokenMint)

    // Set up polling interval
    intervalRef.current = setInterval(() => {
      pollStatus(tokenMint)
    }, pollInterval)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [enabled, tokenMint, isMonitoring, pollInterval, pollStatus])

  // Effect: Check for status on mount if tokenMint provided
  useEffect(() => {
    if (tokenMint && enabled && sessionId) {
      pollStatus(tokenMint)
    }
  }, [tokenMint, enabled, sessionId, pollStatus])

  return {
    status,
    isMonitoring,
    error,
    events,
    startMonitoring,
    stopMonitoring,
    triggerSell,
    pollStatus,
  }
}

// ============================================================================
// HELPER: Format remaining time
// ============================================================================

export function formatRemainingTime(ms: number): string {
  if (ms <= 0) return '0s'
  
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
}

