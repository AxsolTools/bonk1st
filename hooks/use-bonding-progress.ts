"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { getPumpPortalMonitor, TradeEvent } from "@/lib/pumpportal/migration-monitor"

interface BondingProgressData {
  progress: number
  vSolInBondingCurve: number
  lastUpdated: number
}

/**
 * Hook to get real-time bonding curve progress for Pump.fun tokens
 * Uses our stats API for initial data (same as token page), then PumpPortal WebSocket for real-time updates
 */
export function useBondingProgress(mintAddresses: string[]) {
  const [progressMap, setProgressMap] = useState<Record<string, BondingProgressData>>({})
  const subscribedRef = useRef<Set<string>>(new Set())
  const fetchedInitialRef = useRef<Set<string>>(new Set())
  const monitorRef = useRef<ReturnType<typeof getPumpPortalMonitor> | null>(null)

  // Handle trade events to update bonding progress
  const handleTrade = useCallback((event: TradeEvent) => {
    if (event.vSolInBondingCurve !== undefined) {
      const migrationThreshold = 85 // SOL threshold for migration
      const progress = Math.min((event.vSolInBondingCurve / migrationThreshold) * 100, 100)
      
      setProgressMap(prev => ({
        ...prev,
        [event.mint]: {
          progress,
          vSolInBondingCurve: event.vSolInBondingCurve!,
          lastUpdated: Date.now(),
        }
      }))
    }
  }, [])

  // Fetch initial bonding curve state from our stats API (same source as token page)
  const fetchInitialProgress = useCallback(async (mints: string[]) => {
    const mintsToFetch = mints.filter(m => !fetchedInitialRef.current.has(m))
    if (mintsToFetch.length === 0) return

    // Fetch in parallel but limit concurrency
    const batchSize = 5
    for (let i = 0; i < mintsToFetch.length; i += batchSize) {
      const batch = mintsToFetch.slice(i, i + batchSize)
      
      await Promise.all(batch.map(async (mint) => {
        try {
          // Use the same stats API that the token page uses
          const response = await fetch(`/api/token/${mint}/stats`)
          if (response.ok) {
            const result = await response.json()
            if (result.success && result.data) {
              const { bondingCurveProgress, bondingCurveSol } = result.data
              
              setProgressMap(prev => ({
                ...prev,
                [mint]: {
                  progress: bondingCurveProgress || 0,
                  vSolInBondingCurve: bondingCurveSol || 0,
                  lastUpdated: Date.now(),
                }
              }))
            }
          }
          fetchedInitialRef.current.add(mint)
        } catch (error) {
          console.debug(`[BONDING-PROGRESS] Failed to fetch stats for ${mint}:`, error)
          fetchedInitialRef.current.add(mint)
        }
      }))
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return // Server-side guard
    
    // Filter to only valid mint addresses
    const validMints = mintAddresses.filter(m => m && m.length > 0)
    if (validMints.length === 0) return

    // Fetch initial progress from our stats API
    fetchInitialProgress(validMints)

    // Get or create monitor instance for real-time updates
    if (!monitorRef.current) {
      monitorRef.current = getPumpPortalMonitor()
    }
    const monitor = monitorRef.current

    // Connect if not already connected
    if (!monitor.getIsConnected()) {
      monitor.connect()
    }

    // Register trade handler for real-time updates
    const unsubscribeTrade = monitor.onTrade(handleTrade)

    // Find new mints to subscribe to
    const newMints = validMints.filter(mint => !subscribedRef.current.has(mint))
    
    if (newMints.length > 0) {
      monitor.subscribeTokenTrades(newMints)
      newMints.forEach(mint => subscribedRef.current.add(mint))
    }

    // Cleanup function
    return () => {
      unsubscribeTrade()
      
      // Unsubscribe from tokens we no longer need
      const mintsToUnsubscribe = Array.from(subscribedRef.current).filter(
        mint => !validMints.includes(mint)
      )
      
      if (mintsToUnsubscribe.length > 0) {
        monitor.unsubscribeTokenTrades(mintsToUnsubscribe)
        mintsToUnsubscribe.forEach(mint => subscribedRef.current.delete(mint))
      }
    }
  }, [mintAddresses, handleTrade, fetchInitialProgress])

  // Get progress for a specific mint
  const getProgress = useCallback((mint: string): number | undefined => {
    return progressMap[mint]?.progress
  }, [progressMap])

  return {
    progressMap,
    getProgress,
  }
}

/**
 * Hook for a single token's bonding progress
 */
export function useSingleBondingProgress(mintAddress: string | null) {
  const mints = mintAddress ? [mintAddress] : []
  const { progressMap } = useBondingProgress(mints)
  
  return mintAddress ? progressMap[mintAddress] : undefined
}

