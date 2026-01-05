/**
 * React hook for PumpPortal monitoring
 * - Migration events: Updates token stage in database
 * - Trade events: Real-time bonding curve progress
 * - New token events: Real-time new Pump.fun tokens
 */

import { useEffect, useRef, useCallback } from 'react'
import { 
  getPumpPortalMonitor, 
  MigrationEvent, 
  TradeEvent, 
  NewTokenEvent 
} from '@/lib/pumpportal/migration-monitor'
import { createClient } from '@/lib/supabase/client'

interface UsePumpPortalOptions {
  enabled?: boolean
  tokenMints?: string[] // Subscribe to specific token trades
  onMigration?: (event: MigrationEvent) => void
  onTrade?: (event: TradeEvent) => void
  onNewToken?: (event: NewTokenEvent) => void
}

export function usePumpPortal(options: UsePumpPortalOptions = {}) {
  const { 
    enabled = true, 
    tokenMints = [],
    onMigration, 
    onTrade,
    onNewToken 
  } = options
  const connectedRef = useRef(false)
  const subscribedMintsRef = useRef<string[]>([])

  // Handle migration - update database
  const handleMigration = useCallback(async (event: MigrationEvent) => {
    console.log('[PUMPPORTAL] Token migrated:', event.mint)
    
    // Update database - set token as migrated
    const supabase = createClient()
    await supabase
      .from('tokens')
      .update({ 
        stage: 'migrated',
        bonding_curve_progress: 100,
        updated_at: new Date().toISOString()
      })
      .eq('mint_address', event.mint)
    
    onMigration?.(event)
  }, [onMigration])

  // Handle trade - can update bonding curve progress
  const handleTrade = useCallback(async (event: TradeEvent) => {
    // Calculate bonding curve progress from vSolInBondingCurve
    // Pump.fun migrates at ~85 SOL
    if (event.vSolInBondingCurve !== undefined) {
      const progress = Math.min(100, (event.vSolInBondingCurve / 85) * 100)
      
      // Update database with live progress
      const supabase = createClient()
      await supabase
        .from('tokens')
        .update({ 
          bonding_curve_progress: progress,
          updated_at: new Date().toISOString()
        })
        .eq('mint_address', event.mint)
    }
    
    onTrade?.(event)
  }, [onTrade])

  // Handle new token
  const handleNewToken = useCallback((event: NewTokenEvent) => {
    console.log('[PUMPPORTAL] New token:', event.symbol)
    onNewToken?.(event)
  }, [onNewToken])

  // Connect and subscribe
  useEffect(() => {
    if (!enabled) return

    const monitor = getPumpPortalMonitor()
    
    // Connect if not already
    if (!connectedRef.current) {
      monitor.connect()
      connectedRef.current = true
    }

    // Register handlers
    const unsubMigration = monitor.onMigration(handleMigration)
    const unsubTrade = monitor.onTrade(handleTrade)
    const unsubNewToken = monitor.onNewToken(handleNewToken)

    return () => {
      unsubMigration()
      unsubTrade()
      unsubNewToken()
    }
  }, [enabled, handleMigration, handleTrade, handleNewToken])

  // Subscribe to specific token trades
  useEffect(() => {
    if (!enabled || tokenMints.length === 0) return

    const monitor = getPumpPortalMonitor()
    
    // Only subscribe to new mints
    const newMints = tokenMints.filter(m => !subscribedMintsRef.current.includes(m))
    if (newMints.length > 0) {
      monitor.subscribeTokenTrades(newMints)
      subscribedMintsRef.current = [...subscribedMintsRef.current, ...newMints]
    }

    return () => {
      // Unsubscribe when component unmounts
      if (subscribedMintsRef.current.length > 0) {
        monitor.unsubscribeTokenTrades(subscribedMintsRef.current)
        subscribedMintsRef.current = []
      }
    }
  }, [enabled, tokenMints])

  return {
    isConnected: getPumpPortalMonitor().getIsConnected(),
    subscribeTokenTrades: (mints: string[]) => getPumpPortalMonitor().subscribeTokenTrades(mints),
    unsubscribeTokenTrades: (mints: string[]) => getPumpPortalMonitor().unsubscribeTokenTrades(mints),
    subscribeNewTokens: () => getPumpPortalMonitor().subscribeNewTokens(),
  }
}

// Legacy export for backwards compatibility
export const usePumpPortalMigrations = usePumpPortal

