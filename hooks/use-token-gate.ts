"use client"

import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/components/providers/auth-provider"
import { useTokenConfig } from "@/components/dice/useTokenConfig"

interface TokenGateConfig {
  enabled: boolean
  minTokens: number
}

interface TokenGateState {
  isChecking: boolean
  hasAccess: boolean
  tokenBalance: number
  requiredBalance: number
  shortfall: number
  tokenSymbol: string
  tokenMint: string | null
  walletConnected: boolean
  error: string | null
  gateEnabled: boolean
}

interface UseTokenGateReturn extends TokenGateState {
  refresh: () => Promise<void>
  formatBalance: (amount: number) => string
}

// Default config (will be overridden by API)
const DEFAULT_CONFIG: TokenGateConfig = {
  enabled: false, // Disabled by default
  minTokens: 5_000_000,
}

export function useTokenGate(minRequired?: number): UseTokenGateReturn {
  const { activeWallet, isAuthenticated } = useAuth()
  const publicKey = activeWallet?.public_key || null
  const connected = isAuthenticated && !!publicKey
  const { token, isLoading: configLoading } = useTokenConfig()
  
  const [gateConfig, setGateConfig] = useState<TokenGateConfig>(DEFAULT_CONFIG)
  const effectiveMinRequired = minRequired ?? gateConfig.minTokens
  
  const [state, setState] = useState<TokenGateState>({
    isChecking: true,
    hasAccess: true, // Default to true when gate is disabled
    tokenBalance: 0,
    requiredBalance: effectiveMinRequired,
    shortfall: effectiveMinRequired,
    tokenSymbol: token.symbol,
    tokenMint: token.mint,
    walletConnected: false,
    error: null,
    gateEnabled: false,
  })

  // Fetch token gate config from API
  useEffect(() => {
    const fetchGateConfig = async () => {
      try {
        const res = await fetch('/api/token-gate/config')
        if (res.ok) {
          const data = await res.json()
          if (data.success) {
            setGateConfig({
              enabled: data.enabled ?? false,
              minTokens: data.minTokens ?? DEFAULT_CONFIG.minTokens,
            })
          }
        }
      } catch (e) {
        console.error('Failed to fetch token gate config:', e)
      }
    }
    fetchGateConfig()
  }, [])

  const checkTokenBalance = useCallback(async () => {
    // If gate is disabled, always grant access
    if (!gateConfig.enabled) {
      setState(prev => ({
        ...prev,
        isChecking: false,
        hasAccess: true,
        walletConnected: connected,
        gateEnabled: false,
        error: null,
      }))
      return
    }

    // Update wallet connection status
    if (!connected || !publicKey) {
      setState(prev => ({
        ...prev,
        isChecking: false,
        hasAccess: false,
        walletConnected: false,
        tokenBalance: 0,
        shortfall: effectiveMinRequired,
        gateEnabled: true,
        error: null,
      }))
      return
    }

    // Wait for token config
    if (configLoading || !token.mint) {
      setState(prev => ({
        ...prev,
        isChecking: true,
        walletConnected: true,
        gateEnabled: true,
      }))
      return
    }

    setState(prev => ({
      ...prev,
      isChecking: true,
      walletConnected: true,
      tokenSymbol: token.symbol,
      tokenMint: token.mint,
      gateEnabled: true,
    }))

    try {
      const response = await fetch(
        `/api/wallet/token-balance?wallet=${publicKey}&mint=${token.mint}`
      )
      
      const result = await response.json()

      if (result.success && result.data) {
        const balance = result.data.uiBalance || 0
        const hasAccess = balance >= effectiveMinRequired
        const shortfall = Math.max(0, effectiveMinRequired - balance)

        setState(prev => ({
          ...prev,
          isChecking: false,
          hasAccess,
          tokenBalance: balance,
          shortfall,
          requiredBalance: effectiveMinRequired,
          gateEnabled: true,
          error: null,
        }))
      } else {
        // If no balance found, user doesn't have access
        setState(prev => ({
          ...prev,
          isChecking: false,
          hasAccess: false,
          tokenBalance: 0,
          shortfall: effectiveMinRequired,
          requiredBalance: effectiveMinRequired,
          gateEnabled: true,
          error: null,
        }))
      }
    } catch (error) {
      console.error("Token gate check error:", error)
      setState(prev => ({
        ...prev,
        isChecking: false,
        hasAccess: false,
        gateEnabled: true,
        error: error instanceof Error ? error.message : "Failed to check token balance",
      }))
    }
  }, [connected, publicKey, token.mint, token.symbol, effectiveMinRequired, configLoading, gateConfig.enabled])

  useEffect(() => {
    checkTokenBalance()
  }, [checkTokenBalance, gateConfig])

  // Also refresh periodically (every 30 seconds)
  useEffect(() => {
    if (!connected) return

    const interval = setInterval(checkTokenBalance, 30000)
    return () => clearInterval(interval)
  }, [connected, checkTokenBalance])

  const formatBalance = useCallback((amount: number): string => {
    if (amount >= 1_000_000_000) {
      return `${(amount / 1_000_000_000).toFixed(2)}B`
    }
    if (amount >= 1_000_000) {
      return `${(amount / 1_000_000).toFixed(2)}M`
    }
    if (amount >= 1_000) {
      return `${(amount / 1_000).toFixed(2)}K`
    }
    return amount.toLocaleString()
  }, [])

  return {
    ...state,
    refresh: checkTokenBalance,
    formatBalance,
  }
}

// Hook specifically for checking if user can access premium features
export function usePremiumAccess() {
  const gate = useTokenGate()
  
  return {
    canAccess: gate.hasAccess,
    isChecking: gate.isChecking,
    walletConnected: gate.walletConnected,
    balance: gate.tokenBalance,
    required: gate.requiredBalance,
    shortfall: gate.shortfall,
    symbol: gate.tokenSymbol,
    formatBalance: gate.formatBalance,
  }
}

// Export constants
export const TOKEN_GATE_REQUIREMENTS = {
  KOL_MONITOR: 5_000_000,
  TOKEN_AGGREGATOR: 5_000_000,
  ADVANCED_ANALYTICS: 10_000_000,
  COPY_TRADE: 25_000_000,
} as const

