"use client"

import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/contexts/auth-context"
import { getTokenGateConfig } from "@/lib/1st/token-gate-config"

export interface TokenGateStatus {
  isLoading: boolean
  hasAccess: boolean
  gateEnabled: boolean
  tokenMint: string
  tokenSymbol: string
  requiredAmount: number
  currentBalance: number
  message: string
  error: string | null
}

/**
 * Hook to check if the current user has access through the token gate
 * Uses the main wallet from the database
 */
export function useTokenGate(): TokenGateStatus {
  const { mainWallet, isAuthenticated } = useAuth()
  
  const [status, setStatus] = useState<TokenGateStatus>({
    isLoading: true,
    hasAccess: false,
    gateEnabled: false,
    tokenMint: '',
    tokenSymbol: '',
    requiredAmount: 0,
    currentBalance: 0,
    message: '',
    error: null,
  })
  
  const checkAccess = useCallback(async () => {
    // Get client-side config
    const config = getTokenGateConfig()
    
    // If gate is disabled, grant access immediately
    if (!config.enabled) {
      setStatus({
        isLoading: false,
        hasAccess: true,
        gateEnabled: false,
        tokenMint: config.tokenMint,
        tokenSymbol: config.tokenSymbol,
        requiredAmount: config.minAmount,
        currentBalance: 0,
        message: 'Token gate is disabled',
        error: null,
      })
      return
    }
    
    // If not authenticated or no main wallet, deny access
    if (!isAuthenticated || !mainWallet?.public_key) {
      setStatus({
        isLoading: false,
        hasAccess: false,
        gateEnabled: config.enabled,
        tokenMint: config.tokenMint,
        tokenSymbol: config.tokenSymbol,
        requiredAmount: config.minAmount,
        currentBalance: 0,
        message: 'Connect your wallet to access the sniper',
        error: null,
      })
      return
    }
    
    try {
      // Call the server API to check balance
      const response = await fetch(`/api/1st/token-gate/check?wallet=${mainWallet.public_key}`)
      
      if (!response.ok) {
        throw new Error('Failed to check token gate')
      }
      
      const result = await response.json()
      
      if (result.success && result.data) {
        setStatus({
          isLoading: false,
          hasAccess: result.data.hasAccess,
          gateEnabled: result.data.gateEnabled,
          tokenMint: result.data.tokenMint || config.tokenMint,
          tokenSymbol: result.data.tokenSymbol || config.tokenSymbol,
          requiredAmount: result.data.requiredAmount || config.minAmount,
          currentBalance: result.data.currentBalance || 0,
          message: result.data.message,
          error: null,
        })
      } else {
        throw new Error(result.error || 'Unknown error')
      }
    } catch (error) {
      console.error('[TOKEN-GATE] Check failed:', error)
      setStatus(prev => ({
        ...prev,
        isLoading: false,
        hasAccess: false,
        error: error instanceof Error ? error.message : 'Failed to check access',
      }))
    }
  }, [isAuthenticated, mainWallet?.public_key])
  
  // Check on mount and when wallet changes
  useEffect(() => {
    checkAccess()
  }, [checkAccess])
  
  // Re-check every 60 seconds while gate is enabled
  useEffect(() => {
    if (!status.gateEnabled) return
    
    const interval = setInterval(checkAccess, 60_000)
    return () => clearInterval(interval)
  }, [status.gateEnabled, checkAccess])
  
  return status
}
