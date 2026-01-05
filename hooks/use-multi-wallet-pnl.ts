/**
 * Multi-Wallet PNL Hook - Optimized for Performance
 * 
 * Uses batch RPC calls and smart caching to minimize API load
 * Industry-standard approach:
 * - Batch fetch all wallet balances in one RPC call
 * - Cache entry prices (only fetch once per session)
 * - Calculate PNL client-side
 * - Use longer polling intervals with immediate refresh on trades
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import type { Wallet } from "@/lib/types/database"

export interface WalletPNL {
  walletId: string
  address: string
  label: string
  solBalance: number
  tokenBalance: number
  tokenValueSol: number
  tokenValueUsd: number
  entryPriceSol: number  // Cached entry price
  unrealizedPnlSol: number
  unrealizedPnlPercent: number
  isToggled: boolean
  isLoading: boolean
  error: string | null
}

interface UseMultiWalletPNLOptions {
  enabled?: boolean
  refreshInterval?: number  // Default 30s for balance refresh (lighter on API)
}

// Cache for entry prices - persists across re-renders
const entryPriceCache = new Map<string, { price: number; timestamp: number }>()
const ENTRY_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export function useMultiWalletPNL(
  wallets: Wallet[],
  tokenMint: string | null,
  tokenPriceSol: number,
  tokenPriceUsd: number,
  toggledWalletIds: Set<string>,
  options: UseMultiWalletPNLOptions = {}
): {
  data: WalletPNL[]
  isLoading: boolean
  refresh: () => Promise<void>
  totalTokenBalance: number
  totalValueSol: number
  totalValueUsd: number
  totalSolBalance: number
} {
  const { enabled = true, refreshInterval = 30000 } = options
  const [data, setData] = useState<WalletPNL[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const fetchingRef = useRef(false)
  const lastFetchRef = useRef<number>(0)

  // Memoize wallet addresses for batch fetching
  const walletAddresses = useMemo(
    () => wallets.map((w) => w.public_key),
    [wallets]
  )

  const fetchWalletData = useCallback(async (forceRefresh = false) => {
    if (!enabled || !tokenMint || wallets.length === 0) {
      setIsLoading(false)
      return
    }

    // Debounce rapid calls
    const now = Date.now()
    if (!forceRefresh && now - lastFetchRef.current < 5000) {
      return
    }

    if (fetchingRef.current) return
    fetchingRef.current = true
    lastFetchRef.current = now

    try {
      // BATCH FETCH: Get all balances in a single API call
      const [solBalances, tokenBalances] = await Promise.all([
        fetchBatchSolBalances(walletAddresses),
        fetchBatchTokenBalances(walletAddresses, tokenMint),
      ])

      // Get entry prices (cached or fetch)
      const entryPrices = await getEntryPrices(walletAddresses, tokenMint)

      // Build wallet PNL data
      const walletData: WalletPNL[] = wallets.map((wallet) => {
        const solBalance = solBalances.get(wallet.public_key) || 0
        const tokenBalance = tokenBalances.get(wallet.public_key) || 0
        const entryPrice = entryPrices.get(wallet.public_key) || 0
        
        const tokenValueSol = tokenBalance * tokenPriceSol
        const tokenValueUsd = tokenBalance * tokenPriceUsd
        
        // Calculate unrealized PNL
        let unrealizedPnlSol = 0
        let unrealizedPnlPercent = 0
        
        if (entryPrice > 0 && tokenBalance > 0) {
          const entryValue = tokenBalance * entryPrice
          const currentValue = tokenValueSol
          unrealizedPnlSol = currentValue - entryValue
          unrealizedPnlPercent = ((currentValue - entryValue) / entryValue) * 100
        }

        return {
          walletId: wallet.id,
          address: wallet.public_key,
          label: wallet.label || `${wallet.public_key.slice(0, 4)}...${wallet.public_key.slice(-4)}`,
          solBalance,
          tokenBalance,
          tokenValueSol,
          tokenValueUsd,
          entryPriceSol: entryPrice,
          unrealizedPnlSol,
          unrealizedPnlPercent,
          isToggled: toggledWalletIds.has(wallet.id),
          isLoading: false,
          error: null,
        }
      })

      setData(walletData)
    } catch (error) {
      console.error("[PNL] Error fetching multi-wallet data:", error)
    } finally {
      setIsLoading(false)
      fetchingRef.current = false
    }
  }, [wallets, walletAddresses, tokenMint, tokenPriceSol, tokenPriceUsd, toggledWalletIds, enabled])

  // Initial fetch
  useEffect(() => {
    fetchWalletData(true)
  }, [fetchWalletData])

  // Polling - use longer interval to be lighter on API
  useEffect(() => {
    if (!enabled || refreshInterval <= 0) return

    const interval = setInterval(() => fetchWalletData(false), refreshInterval)
    return () => clearInterval(interval)
  }, [fetchWalletData, enabled, refreshInterval])

  // Update toggle state without refetching
  useEffect(() => {
    setData((prev) =>
      prev.map((wallet) => ({
        ...wallet,
        isToggled: toggledWalletIds.has(wallet.walletId),
      }))
    )
  }, [toggledWalletIds])

  // Recalculate values when price changes (no API call needed)
  useEffect(() => {
    if (tokenPriceSol <= 0) return
    
    setData((prev) =>
      prev.map((wallet) => {
        const tokenValueSol = wallet.tokenBalance * tokenPriceSol
        const tokenValueUsd = wallet.tokenBalance * tokenPriceUsd
        
        let unrealizedPnlSol = 0
        let unrealizedPnlPercent = 0
        
        if (wallet.entryPriceSol > 0 && wallet.tokenBalance > 0) {
          const entryValue = wallet.tokenBalance * wallet.entryPriceSol
          unrealizedPnlSol = tokenValueSol - entryValue
          unrealizedPnlPercent = ((tokenValueSol - entryValue) / entryValue) * 100
        }
        
        return {
          ...wallet,
          tokenValueSol,
          tokenValueUsd,
          unrealizedPnlSol,
          unrealizedPnlPercent,
        }
      })
    )
  }, [tokenPriceSol, tokenPriceUsd])

  // Calculate totals for toggled wallets
  const toggledWallets = data.filter((w) => w.isToggled)
  const totalTokenBalance = toggledWallets.reduce((sum, w) => sum + w.tokenBalance, 0)
  const totalValueSol = toggledWallets.reduce((sum, w) => sum + w.tokenValueSol, 0)
  const totalValueUsd = toggledWallets.reduce((sum, w) => sum + w.tokenValueUsd, 0)
  const totalSolBalance = toggledWallets.reduce((sum, w) => sum + w.solBalance, 0)

  return {
    data,
    isLoading,
    refresh: () => fetchWalletData(true),
    totalTokenBalance,
    totalValueSol,
    totalValueUsd,
    totalSolBalance,
  }
}

// ============================================================================
// BATCH FETCH FUNCTIONS - Minimize API calls
// ============================================================================

/**
 * Batch fetch SOL balances for multiple wallets in ONE call
 */
async function fetchBatchSolBalances(
  addresses: string[]
): Promise<Map<string, number>> {
  const balances = new Map<string, number>()
  
  if (addresses.length === 0) return balances

  try {
    // Use batch endpoint
    const response = await fetch("/api/balance/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addresses }),
    })

    if (response.ok) {
      const data = await response.json()
      if (data.balances) {
        for (const [address, balance] of Object.entries(data.balances)) {
          balances.set(address, balance as number)
        }
      }
    } else {
      // Fallback: fetch individually but in parallel
      const results = await Promise.allSettled(
        addresses.map(async (addr) => {
          const res = await fetch(`/api/balance?wallet=${addr}`)
          const data = await res.json()
          return { address: addr, balance: data.balance || 0 }
        })
      )
      
      for (const result of results) {
        if (result.status === "fulfilled") {
          balances.set(result.value.address, result.value.balance)
        }
      }
    }
  } catch (error) {
    console.debug("[PNL] Batch SOL balance fetch error:", error)
  }

  return balances
}

/**
 * Batch fetch token balances for multiple wallets
 * Uses the same working endpoint as single wallet mode
 */
async function fetchBatchTokenBalances(
  addresses: string[],
  tokenMint: string
): Promise<Map<string, number>> {
  const balances = new Map<string, number>()
  
  if (addresses.length === 0 || !tokenMint) return balances

  try {
    // Fetch each wallet's token balance using the working endpoint
    // This is the same endpoint that single-wallet mode uses
    const results = await Promise.allSettled(
      addresses.map(async (addr) => {
        const res = await fetch(`/api/wallet/token-balance?wallet=${addr}&mint=${tokenMint}`)
        const data = await res.json()
        // The endpoint returns { success, data: { uiBalance, balance, decimals } }
        const balance = data.success && data.data ? (data.data.uiBalance || 0) : 0
        return { address: addr, balance }
      })
    )
    
    for (const result of results) {
      if (result.status === "fulfilled") {
        balances.set(result.value.address, result.value.balance)
      }
    }
  } catch (error) {
    console.debug("[PNL] Batch token balance fetch error:", error)
  }

  return balances
}

/**
 * Get entry prices from cache or fetch from trade history
 */
async function getEntryPrices(
  addresses: string[],
  tokenMint: string
): Promise<Map<string, number>> {
  const prices = new Map<string, number>()
  const addressesToFetch: string[] = []
  const now = Date.now()

  // Check cache first
  for (const addr of addresses) {
    const cacheKey = `${addr}:${tokenMint}`
    const cached = entryPriceCache.get(cacheKey)
    
    if (cached && now - cached.timestamp < ENTRY_CACHE_TTL) {
      prices.set(addr, cached.price)
    } else {
      addressesToFetch.push(addr)
    }
  }

  // Fetch missing entry prices
  if (addressesToFetch.length > 0) {
    try {
      const response = await fetch("/api/trades/entry-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          addresses: addressesToFetch,
          tokenMint,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.entryPrices) {
          for (const [addr, price] of Object.entries(data.entryPrices)) {
            const numPrice = price as number
            prices.set(addr, numPrice)
            entryPriceCache.set(`${addr}:${tokenMint}`, {
              price: numPrice,
              timestamp: now,
            })
          }
        }
      }
    } catch (error) {
      console.debug("[PNL] Entry price fetch error:", error)
    }
  }

  return prices
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format PNL percentage with color indicator
 */
export function formatPnlPercent(percent: number): {
  text: string
  color: "green" | "red" | "neutral"
} {
  if (percent > 0.1) {
    return { text: `+${percent.toFixed(1)}%`, color: "green" }
  } else if (percent < -0.1) {
    return { text: `${percent.toFixed(1)}%`, color: "red" }
  }
  return { text: "0.0%", color: "neutral" }
}

/**
 * Format token balance with appropriate decimals
 */
export function formatTokenBalance(balance: number): string {
  if (balance >= 1_000_000) {
    return `${(balance / 1_000_000).toFixed(2)}M`
  }
  if (balance >= 1_000) {
    return `${(balance / 1_000).toFixed(2)}K`
  }
  if (balance >= 1) {
    return balance.toFixed(2)
  }
  if (balance > 0) {
    return balance.toFixed(4)
  }
  return "0"
}

/**
 * Format SOL balance compactly
 */
export function formatSolBalance(balance: number): string {
  if (balance >= 1000) {
    return `${(balance / 1000).toFixed(1)}K`
  }
  if (balance >= 100) {
    return balance.toFixed(1)
  }
  if (balance >= 10) {
    return balance.toFixed(2)
  }
  if (balance >= 1) {
    return balance.toFixed(3)
  }
  return balance.toFixed(4)
}
