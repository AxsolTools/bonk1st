"use client"

import { useState, useEffect, useCallback } from "react"

interface BalanceData {
  address: string
  balanceLamports: number
  balanceSol: number
  balanceUsd: number
}

interface UseBalanceOptions {
  refreshInterval?: number // in ms, default 10000 (10s)
  enabled?: boolean
}

// Hook for single wallet balance
export function useBalance(walletAddress: string | null, options: UseBalanceOptions = {}) {
  const { refreshInterval = 10000, enabled = true } = options
  const [balance, setBalance] = useState<BalanceData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<number>(0)

  const fetchBalance = useCallback(async () => {
    if (!enabled || !walletAddress) {
      setIsLoading(false)
      return
    }

    try {
      const response = await fetch(`/api/wallet/balance?address=${walletAddress}`)
      const data = await response.json()

      if (data.success && data.data) {
        setBalance(data.data)
        setLastUpdate(Date.now())
        setError(null)
      } else {
        setError(data.error || "Failed to fetch balance")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch balance")
    }
    setIsLoading(false)
  }, [walletAddress, enabled])

  useEffect(() => {
    fetchBalance()

    if (enabled && refreshInterval > 0 && walletAddress) {
      const interval = setInterval(fetchBalance, refreshInterval)
      return () => clearInterval(interval)
    }
  }, [fetchBalance, enabled, refreshInterval, walletAddress])

  return {
    balance,
    balanceSol: balance?.balanceSol || 0,
    balanceUsd: balance?.balanceUsd || 0,
    balanceLamports: balance?.balanceLamports || 0,
    isLoading,
    error,
    lastUpdate,
    refresh: fetchBalance,
  }
}

// Hook for multiple wallet balances
export function useBalances(walletAddresses: string[], options: UseBalanceOptions = {}) {
  const { refreshInterval = 10000, enabled = true } = options
  const [balances, setBalances] = useState<BalanceData[]>([])
  const [totalSol, setTotalSol] = useState<number>(0)
  const [totalUsd, setTotalUsd] = useState<number>(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchBalances = useCallback(async () => {
    if (!enabled || walletAddresses.length === 0) {
      setIsLoading(false)
      return
    }

    try {
      const response = await fetch("/api/wallet/balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addresses: walletAddresses }),
      })
      const data = await response.json()

      if (data.success && data.data) {
        setBalances(data.data.balances || [])
        setTotalSol(data.data.totalSol || 0)
        setTotalUsd(data.data.totalUsd || 0)
        setError(null)
      } else {
        setError(data.error || "Failed to fetch balances")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch balances")
    }
    setIsLoading(false)
  }, [walletAddresses, enabled])

  useEffect(() => {
    fetchBalances()

    if (enabled && refreshInterval > 0 && walletAddresses.length > 0) {
      const interval = setInterval(fetchBalances, refreshInterval)
      return () => clearInterval(interval)
    }
  }, [fetchBalances, enabled, refreshInterval, walletAddresses.length])

  return {
    balances,
    totalSol,
    totalUsd,
    isLoading,
    error,
    refresh: fetchBalances,
  }
}

// Hook to check if wallet has sufficient balance for a transaction
export function useBalanceCheck(
  walletAddress: string | null,
  requiredAmount: number,
  options: UseBalanceOptions = {}
) {
  const { balance, balanceSol, isLoading, error, refresh } = useBalance(walletAddress, options)

  const hasSufficientBalance = balanceSol >= requiredAmount
  const shortfall = requiredAmount - balanceSol
  const requiredLamports = Math.ceil(requiredAmount * 1e9)
  const balanceLamports = balance?.balanceLamports || 0

  return {
    hasSufficientBalance,
    balanceSol,
    balanceLamports,
    requiredAmount,
    requiredLamports,
    shortfall: shortfall > 0 ? shortfall : 0,
    isLoading,
    error,
    refresh,
  }
}

// Hook for token balance (SPL tokens)
interface TokenBalanceData {
  wallet: string
  mint: string
  balance: number
  uiBalance: number
  decimals: number
  tokenAccount: string | null
  hasBalance: boolean
}

export function useTokenBalance(
  walletAddress: string | null,
  tokenMint: string | null,
  options: UseBalanceOptions = {}
) {
  const { refreshInterval = 10000, enabled = true } = options
  const [data, setData] = useState<TokenBalanceData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTokenBalance = useCallback(async () => {
    if (!enabled || !walletAddress || !tokenMint) {
      setIsLoading(false)
      return
    }

    try {
      const response = await fetch(
        `/api/wallet/token-balance?wallet=${walletAddress}&mint=${tokenMint}`
      )
      const result = await response.json()

      if (result.success && result.data) {
        setData(result.data)
        setError(null)
      } else {
        setError(result.error || "Failed to fetch token balance")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch token balance")
    }
    setIsLoading(false)
  }, [walletAddress, tokenMint, enabled])

  useEffect(() => {
    fetchTokenBalance()

    if (enabled && refreshInterval > 0 && walletAddress && tokenMint) {
      const interval = setInterval(fetchTokenBalance, refreshInterval)
      return () => clearInterval(interval)
    }
  }, [fetchTokenBalance, enabled, refreshInterval, walletAddress, tokenMint])

  return {
    data,
    balance: data?.uiBalance || 0,
    rawBalance: data?.balance || 0,
    decimals: data?.decimals || 9,
    hasBalance: data?.hasBalance || false,
    isLoading,
    error,
    refresh: fetchTokenBalance,
  }
}

