"use client"

import { useState, useEffect, useCallback } from 'react'

/**
 * Hook for getting priority fee estimates from Helius
 * 
 * Benefits:
 * - Improves transaction landing rate during congestion
 * - Real-time network-aware estimates
 * - Multiple priority levels (low, medium, high)
 */

interface PriorityFeeResult {
  fee: number
  feeInSol: number
  allLevels: {
    low: number
    medium: number
    high: number
    veryHigh: number
  } | null
  isLoading: boolean
  error: string | null
  refetch: () => void
}

interface PriorityFeeOptions {
  priorityLevel?: 'Low' | 'Medium' | 'High' | 'VeryHigh'
  accountKeys?: string[]
  refreshInterval?: number // ms, 0 to disable
}

// Cache for fee estimates (short TTL)
const feeCache = new Map<string, { data: { priorityFeeEstimate: number; priorityFeeLevels?: Record<string, number> }; timestamp: number }>()
const CACHE_TTL = 5000 // 5 seconds

/**
 * Hook to get priority fee estimate for transactions
 * 
 * @param options - Configuration options
 * @returns Priority fee estimate and loading state
 * 
 * @example
 * const { fee, allLevels, isLoading } = usePriorityFee({ priorityLevel: 'High' })
 * // Use fee when building transaction
 */
export function usePriorityFee(options: PriorityFeeOptions = {}): PriorityFeeResult {
  const [fee, setFee] = useState(0)
  const [allLevels, setAllLevels] = useState<PriorityFeeResult['allLevels']>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const priorityLevel = options.priorityLevel || 'Medium'
  const refreshInterval = options.refreshInterval ?? 10000 // Default 10s

  const fetchFee = useCallback(async () => {
    const cacheKey = `fee-${priorityLevel}-${(options.accountKeys || []).join('-')}`
    
    // Check cache
    const cached = feeCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setFee(cached.data.priorityFeeEstimate)
      if (cached.data.priorityFeeLevels) {
        setAllLevels({
          low: cached.data.priorityFeeLevels.low || 0,
          medium: cached.data.priorityFeeLevels.medium || 0,
          high: cached.data.priorityFeeLevels.high || 0,
          veryHigh: cached.data.priorityFeeLevels.veryHigh || 0,
        })
      }
      setIsLoading(false)
      return
    }

    try {
      const response = await fetch('/api/priority-fee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priorityLevel,
          accountKeys: options.accountKeys,
          includeAllLevels: true,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        
        if (data.success && data.data) {
          const estimate = data.data.priorityFeeEstimate || 0
          setFee(estimate)
          
          if (data.data.priorityFeeLevels) {
            setAllLevels({
              low: data.data.priorityFeeLevels.low || 0,
              medium: data.data.priorityFeeLevels.medium || 0,
              high: data.data.priorityFeeLevels.high || 0,
              veryHigh: data.data.priorityFeeLevels.veryHigh || 0,
            })
          }

          feeCache.set(cacheKey, { 
            data: { 
              priorityFeeEstimate: estimate, 
              priorityFeeLevels: data.data.priorityFeeLevels 
            }, 
            timestamp: Date.now() 
          })
          setError(null)
        }
      } else {
        // Use defaults if API fails
        const defaults: Record<string, number> = {
          Low: 1000,
          Medium: 10000,
          High: 100000,
          VeryHigh: 500000,
        }
        setFee(defaults[priorityLevel] || 10000)
      }
    } catch (err) {
      console.warn('[usePriorityFee] Error:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch fee')
      // Use sensible defaults
      setFee(10000)
    } finally {
      setIsLoading(false)
    }
  }, [priorityLevel, options.accountKeys])

  useEffect(() => {
    fetchFee()

    if (refreshInterval > 0) {
      const interval = setInterval(fetchFee, refreshInterval)
      return () => clearInterval(interval)
    }
  }, [fetchFee, refreshInterval])

  return {
    fee,
    feeInSol: fee / 1_000_000_000,
    allLevels,
    isLoading,
    error,
    refetch: fetchFee,
  }
}

/**
 * Hook specifically for swap transactions
 * Pre-configured with common DEX program accounts
 */
export function useSwapPriorityFee(
  priorityLevel: 'Low' | 'Medium' | 'High' | 'VeryHigh' = 'Medium'
): PriorityFeeResult {
  return usePriorityFee({
    priorityLevel,
    accountKeys: [
      'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', // Jupiter
      'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // Token Program
      'So11111111111111111111111111111111111111112', // Wrapped SOL
      '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P', // Pump.fun
    ],
    refreshInterval: 10000,
  })
}

/**
 * Get fee estimate without a hook (for one-time use)
 */
export async function getPriorityFeeEstimate(
  priorityLevel: 'Low' | 'Medium' | 'High' | 'VeryHigh' = 'Medium'
): Promise<number> {
  try {
    const response = await fetch('/api/priority-fee', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priorityLevel }),
    })

    if (response.ok) {
      const data = await response.json()
      return data.data?.priorityFeeEstimate || 10000
    }
  } catch {
    // Silent fail
  }

  // Defaults
  const defaults: Record<string, number> = {
    Low: 1000,
    Medium: 10000,
    High: 100000,
    VeryHigh: 500000,
  }
  return defaults[priorityLevel] || 10000
}

export type { PriorityFeeResult, PriorityFeeOptions }

