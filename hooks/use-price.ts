"use client"

import { useState, useEffect, useCallback } from "react"

interface PriceData {
  price: number
  source: string
  timestamp: number
}

interface UsePriceOptions {
  refreshInterval?: number // in ms, default 30000 (30s)
  enabled?: boolean
}

// Hook for SOL price
export function useSolPrice(options: UsePriceOptions = {}) {
  const { refreshInterval = 30000, enabled = true } = options
  const [price, setPrice] = useState<number>(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<number>(0)

  const fetchPrice = useCallback(async () => {
    if (!enabled) return

    try {
      const response = await fetch("/api/price/sol")
      const data = await response.json()

      if (data.success && data.data?.price) {
        setPrice(data.data.price)
        setLastUpdate(Date.now())
        setError(null)
      } else {
        setError(data.error || "Failed to fetch price")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch price")
    }
    setIsLoading(false)
  }, [enabled])

  useEffect(() => {
    fetchPrice()

    if (enabled && refreshInterval > 0) {
      const interval = setInterval(fetchPrice, refreshInterval)
      return () => clearInterval(interval)
    }
  }, [fetchPrice, enabled, refreshInterval])

  return {
    price,
    isLoading,
    error,
    lastUpdate,
    refresh: fetchPrice,
  }
}

// Hook for token price
export function useTokenPrice(mintAddress: string | null, options: UsePriceOptions = {}) {
  const { refreshInterval = 30000, enabled = true } = options
  const [price, setPrice] = useState<number>(0)
  const [priceUsd, setPriceUsd] = useState<number>(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<number>(0)

  const fetchPrice = useCallback(async () => {
    if (!enabled || !mintAddress) {
      setIsLoading(false)
      return
    }

    try {
      const response = await fetch(`/api/price/${mintAddress}`)
      const data = await response.json()

      if (data.success && data.data) {
        setPrice(data.data.priceSol || 0)
        setPriceUsd(data.data.priceUsd || 0)
        setLastUpdate(Date.now())
        setError(null)
      } else {
        setError(data.error || "Failed to fetch price")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch price")
    }
    setIsLoading(false)
  }, [mintAddress, enabled])

  useEffect(() => {
    fetchPrice()

    if (enabled && refreshInterval > 0 && mintAddress) {
      const interval = setInterval(fetchPrice, refreshInterval)
      return () => clearInterval(interval)
    }
  }, [fetchPrice, enabled, refreshInterval, mintAddress])

  return {
    priceSol: price,
    priceUsd,
    isLoading,
    error,
    lastUpdate,
    refresh: fetchPrice,
  }
}

// Hook for multiple token prices
export function useTokenPrices(mintAddresses: string[], options: UsePriceOptions = {}) {
  const { refreshInterval = 30000, enabled = true } = options
  const [prices, setPrices] = useState<Record<string, { priceSol: number; priceUsd: number }>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPrices = useCallback(async () => {
    if (!enabled || mintAddresses.length === 0) {
      setIsLoading(false)
      return
    }

    try {
      const results = await Promise.all(
        mintAddresses.map(async (mint) => {
          try {
            const response = await fetch(`/api/price/${mint}`)
            const data = await response.json()
            return {
              mint,
              priceSol: data.data?.priceSol || 0,
              priceUsd: data.data?.priceUsd || 0,
            }
          } catch {
            return { mint, priceSol: 0, priceUsd: 0 }
          }
        })
      )

      const priceMap: Record<string, { priceSol: number; priceUsd: number }> = {}
      results.forEach((result) => {
        priceMap[result.mint] = {
          priceSol: result.priceSol,
          priceUsd: result.priceUsd,
        }
      })

      setPrices(priceMap)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch prices")
    }
    setIsLoading(false)
  }, [mintAddresses, enabled])

  useEffect(() => {
    fetchPrices()

    if (enabled && refreshInterval > 0 && mintAddresses.length > 0) {
      const interval = setInterval(fetchPrices, refreshInterval)
      return () => clearInterval(interval)
    }
  }, [fetchPrices, enabled, refreshInterval, mintAddresses.length])

  return {
    prices,
    isLoading,
    error,
    refresh: fetchPrices,
  }
}

