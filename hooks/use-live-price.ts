"use client"

import { useState, useEffect, useCallback } from "react"

// ============================================================================
// TYPES
// ============================================================================

export interface LivePriceResult {
  priceSol: number
  priceUsd: number
  solPriceUsd: number
  marketCap: number
  isLoading: boolean
  error: string | null
  lastUpdated: number
  source: string
}

interface JupiterPriceResponse {
  data: {
    [mint: string]: {
      id: string
      price: number
    }
  }
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SOL_MINT = "So11111111111111111111111111111111111111112"
// Jupiter API (requires API key as of Jan 2026)
// Note: Direct client-side calls are deprecated. Use server-side API routes instead.
const JUPITER_API_BASE = "https://api.jup.ag"
const POLL_INTERVAL = 30_000 // 30 seconds

// ============================================================================
// HOOK: useLivePrice
// ============================================================================

/**
 * Hook for fetching real-time token prices with 30-second polling
 * Uses server-side API to avoid CORS and auth issues
 * 
 * @param mintAddress - Token mint address
 * @param totalSupply - Total supply for market cap calculation
 * @param decimals - Token decimals (default 6 for pump.fun tokens)
 * @returns LivePriceResult with prices and market cap
 */
export function useLivePrice(
  mintAddress: string | null,
  totalSupply?: number,
  decimals: number = 6
): LivePriceResult {
  const [priceSol, setPriceSol] = useState(0)
  const [priceUsd, setPriceUsd] = useState(0)
  const [solPriceUsd, setSolPriceUsd] = useState(0)
  const [marketCap, setMarketCap] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState(0)
  const [source, setSource] = useState("none")

  const fetchPrices = useCallback(async () => {
    if (!mintAddress) {
      setIsLoading(false)
      return
    }

    try {
      // Use our server-side API to fetch prices
      // The API now fetches supply from RPC and calculates market cap properly
      const response = await fetch(`/api/price/token?mint=${mintAddress}`)
      
      if (response.ok) {
        const result = await response.json()
        
        if (result.success && result.data) {
          setPriceUsd(result.data.priceUsd || 0)
          setPriceSol(result.data.priceSol || 0)
          setMarketCap(result.data.marketCap || 0)
          setSource(result.data.source || "none")
          setSolPriceUsd(result.solPriceUsd || 0)
          setLastUpdated(Date.now())
          setError(null)
          setIsLoading(false)
          return
        }
      }

      // Fallback: try DexScreener directly for FDV (market cap)
      try {
        const dexResponse = await fetch(
          `https://api.dexscreener.com/latest/dex/tokens/${mintAddress}`
        )
        if (dexResponse.ok) {
          const dexData = await dexResponse.json()
          const pair = dexData.pairs?.find(
            (p: { priceUsd?: string; fdv?: number }) => 
              p.priceUsd && parseFloat(p.priceUsd) > 0
          )
          if (pair) {
            const tokenPriceUsd = parseFloat(pair.priceUsd)
            // Use FDV from DexScreener as market cap
            const dexMarketCap = pair.fdv || pair.marketCap || 0
            
            // Get SOL price for conversion
            let currentSolPrice = solPriceUsd
            if (currentSolPrice <= 0) {
              try {
                const solRes = await fetch('/api/price/sol')
                const solData = await solRes.json()
                currentSolPrice = solData.data?.price || 150
              } catch {
                currentSolPrice = 150
              }
            }
            
            const tokenPriceSol = tokenPriceUsd / currentSolPrice
            
            setPriceUsd(tokenPriceUsd)
            setPriceSol(tokenPriceSol)
            setMarketCap(dexMarketCap)
            setSolPriceUsd(currentSolPrice)
            setSource("dexscreener")
            setLastUpdated(Date.now())
            setError(null)
          }
        }
      } catch {
        // Silently fail fallback
      }
    } catch (err) {
      console.warn("[useLivePrice] Failed to fetch prices:", err)
      setError(err instanceof Error ? err.message : "Failed to fetch prices")
    } finally {
      setIsLoading(false)
    }
  }, [mintAddress, solPriceUsd])

  // Initial fetch and polling
  useEffect(() => {
    fetchPrices()

    const interval = setInterval(fetchPrices, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchPrices])

  return {
    priceSol,
    priceUsd,
    solPriceUsd,
    marketCap,
    isLoading,
    error,
    lastUpdated,
    source,
  }
}

// ============================================================================
// HOOK: useBatchLivePrices
// ============================================================================

interface BatchPriceResult {
  prices: Map<string, { priceSol: number; priceUsd: number }>
  solPriceUsd: number
  isLoading: boolean
  error: string | null
  lastUpdated: number
}

/**
 * Hook for fetching live prices for multiple tokens at once
 * Useful for P&L calculations across holdings
 * Uses server-side API to avoid CORS/auth issues
 * 
 * @param mintAddresses - Array of token mint addresses
 * @returns BatchPriceResult with prices map
 */
export function useBatchLivePrices(mintAddresses: string[]): BatchPriceResult {
  const [prices, setPrices] = useState<Map<string, { priceSol: number; priceUsd: number }>>(
    new Map()
  )
  const [solPriceUsd, setSolPriceUsd] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState(0)

  const fetchBatchPrices = useCallback(async () => {
    if (mintAddresses.length === 0) {
      setIsLoading(false)
      return
    }

    try {
      // Use our server-side batch API
      const response = await fetch("/api/price/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mints: mintAddresses }),
      })

      if (response.ok) {
        const result = await response.json()
        
        if (result.success && result.data) {
          const priceMap = new Map<string, { priceSol: number; priceUsd: number }>()
          
          for (const [mint, priceData] of Object.entries(result.data)) {
            const data = priceData as { priceSol: number; priceUsd: number }
            priceMap.set(mint, { priceSol: data.priceSol, priceUsd: data.priceUsd })
          }
          
          setPrices(priceMap)
          setSolPriceUsd(result.solPriceUsd || 0)
          setLastUpdated(Date.now())
          setError(null)
          return
        }
      }

      // Fallback to DexScreener (one by one)
      const priceMap = new Map<string, { priceSol: number; priceUsd: number }>()
      const fetchedSolPrice = solPriceUsd > 0 ? solPriceUsd : 150

      for (const mint of mintAddresses.slice(0, 10)) { // Limit fallback to 10
        try {
          const dexResponse = await fetch(
            `https://api.dexscreener.com/latest/dex/tokens/${mint}`
          )
          if (dexResponse.ok) {
            const dexData = await dexResponse.json()
            const pair = dexData.pairs?.find(
              (p: { priceUsd?: string }) => p.priceUsd && parseFloat(p.priceUsd) > 0
            )
            if (pair) {
              const priceUsd = parseFloat(pair.priceUsd)
              const priceSol = priceUsd / fetchedSolPrice
              priceMap.set(mint, { priceSol, priceUsd })
            } else {
              priceMap.set(mint, { priceSol: 0, priceUsd: 0 })
            }
          }
        } catch {
          priceMap.set(mint, { priceSol: 0, priceUsd: 0 })
        }
      }

      setPrices(priceMap)
      setLastUpdated(Date.now())
    } catch (err) {
      console.warn("[useBatchLivePrices] Failed:", err)
      setError(err instanceof Error ? err.message : "Failed to fetch prices")
    } finally {
      setIsLoading(false)
    }
  }, [mintAddresses, solPriceUsd])

  // Fetch on mount and when addresses change
  useEffect(() => {
    fetchBatchPrices()

    const interval = setInterval(fetchBatchPrices, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchBatchPrices])

  return {
    prices,
    solPriceUsd,
    isLoading,
    error,
    lastUpdated,
  }
}

// ============================================================================
// HOOK: useSolPrice
// ============================================================================

interface SolPriceResult {
  price: number
  isLoading: boolean
  error: string | null
  source: string
}

/**
 * Simple hook for just SOL price
 * 
 * @returns SolPriceResult with current SOL/USD price
 */
export function useSolPrice(): SolPriceResult {
  const [price, setPrice] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState("none")

  const fetchSolPrice = useCallback(async () => {
    try {
      // Try internal API first (uses aggregated sources)
      const response = await fetch("/api/price/sol")
      
      if (response.ok) {
        const data = await response.json()
        if (data.success && data.data?.price) {
          setPrice(data.data.price)
          setSource(data.data.source || "aggregated")
          setError(null)
          return
        }
      }

      // Fallback to DexScreener (no auth required, client-side friendly)
      const dexResponse = await fetch(
        `https://api.dexscreener.com/latest/dex/tokens/${SOL_MINT}`
      )
      if (dexResponse.ok) {
        const dexData = await dexResponse.json()
        const pair = dexData.pairs?.find(
          (p: { priceUsd?: string; baseToken?: { symbol?: string } }) => 
            p.priceUsd && parseFloat(p.priceUsd) > 0 && 
            (p.baseToken?.symbol === 'SOL' || p.baseToken?.symbol === 'WSOL')
        )
        if (pair) {
          setPrice(parseFloat(pair.priceUsd))
          setSource("dexscreener")
          setError(null)
          return
        }
      }

      throw new Error("All price sources failed")
    } catch (err) {
      console.warn("[useSolPrice] Failed:", err)
      setError(err instanceof Error ? err.message : "Failed to fetch SOL price")
      // Keep last known price
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSolPrice()

    const interval = setInterval(fetchSolPrice, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchSolPrice])

  return { price, isLoading, error, source }
}

