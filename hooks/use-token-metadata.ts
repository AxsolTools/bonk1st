"use client"

import { useState, useEffect, useCallback } from 'react'

/**
 * Hook for fetching token metadata using Helius DAS API
 * 
 * Benefits:
 * - Rich metadata (name, symbol, image, description)
 * - Token supply and decimals
 * - Creator/authority info
 * - All in one efficient API call (10 credits)
 */

interface TokenMetadata {
  address: string
  name: string
  symbol: string
  decimals: number
  logoUri: string
  description: string
  supply: number
  isNft: boolean
  isFungible: boolean
  creators: Array<{
    address: string
    share: number
    verified: boolean
  }>
  authority: string | null
  updateAuthority: string | null
  mintAuthority: string | null
  freezeAuthority: string | null
}

interface UseTokenMetadataResult {
  metadata: TokenMetadata | null
  isLoading: boolean
  error: string | null
  refetch: () => void
}

// Cache for metadata
const metadataCache = new Map<string, { data: TokenMetadata; timestamp: number }>()
const CACHE_TTL = 60000 // 1 minute - metadata doesn't change often

/**
 * Hook to fetch token metadata via DAS API
 * 
 * @param tokenAddress - Token mint address
 * @returns Token metadata, loading state, and error
 * 
 * @example
 * const { metadata, isLoading, error } = useTokenMetadata(tokenMint)
 * if (metadata) {
 *   console.log(metadata.name, metadata.symbol, metadata.logoUri)
 * }
 */
export function useTokenMetadata(tokenAddress: string | null): UseTokenMetadataResult {
  const [metadata, setMetadata] = useState<TokenMetadata | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchMetadata = useCallback(async () => {
    if (!tokenAddress) {
      setIsLoading(false)
      return
    }

    // Check cache first
    const cached = metadataCache.get(tokenAddress)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setMetadata(cached.data)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // Use our server-side API that calls DAS
      const response = await fetch(`/api/token/${tokenAddress}/metadata`)
      
      if (!response.ok) {
        // Fallback to DexScreener for basic metadata
        const dexResponse = await fetch(
          `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`
        )
        
        if (dexResponse.ok) {
          const dexData = await dexResponse.json()
          const pair = dexData.pairs?.[0]
          
          if (pair?.baseToken) {
            const fallbackMetadata: TokenMetadata = {
              address: tokenAddress,
              name: pair.baseToken.name || 'Unknown',
              symbol: pair.baseToken.symbol || 'UNKNOWN',
              decimals: 6, // Default for most tokens
              logoUri: pair.info?.imageUrl || `https://dd.dexscreener.com/ds-data/tokens/solana/${tokenAddress}.png`,
              description: '',
              supply: 0,
              isNft: false,
              isFungible: true,
              creators: [],
              authority: null,
              updateAuthority: null,
              mintAuthority: null,
              freezeAuthority: null,
            }
            
            metadataCache.set(tokenAddress, { data: fallbackMetadata, timestamp: Date.now() })
            setMetadata(fallbackMetadata)
            setIsLoading(false)
            return
          }
        }
        
        throw new Error('Failed to fetch metadata')
      }

      const data = await response.json()
      
      if (data.success && data.data) {
        metadataCache.set(tokenAddress, { data: data.data, timestamp: Date.now() })
        setMetadata(data.data)
      } else {
        throw new Error(data.error || 'Invalid response')
      }
    } catch (err) {
      console.warn('[useTokenMetadata] Error:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch metadata')
    } finally {
      setIsLoading(false)
    }
  }, [tokenAddress])

  useEffect(() => {
    fetchMetadata()
  }, [fetchMetadata])

  return { metadata, isLoading, error, refetch: fetchMetadata }
}

/**
 * Hook for batch fetching token metadata
 * More efficient when you need metadata for multiple tokens
 * 
 * @param tokenAddresses - Array of token mint addresses
 * @returns Map of token address to metadata
 */
export function useBatchTokenMetadata(
  tokenAddresses: string[]
): {
  metadataMap: Map<string, TokenMetadata>
  isLoading: boolean
  error: string | null
} {
  const [metadataMap, setMetadataMap] = useState<Map<string, TokenMetadata>>(new Map())
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (tokenAddresses.length === 0) {
      setIsLoading(false)
      return
    }

    const fetchBatch = async () => {
      setIsLoading(true)
      setError(null)

      try {
        // Check cache for each address
        const newMap = new Map<string, TokenMetadata>()
        const uncached: string[] = []

        for (const addr of tokenAddresses) {
          const cached = metadataCache.get(addr)
          if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            newMap.set(addr, cached.data)
          } else {
            uncached.push(addr)
          }
        }

        // Fetch uncached from API
        if (uncached.length > 0) {
          const response = await fetch('/api/token/batch/metadata', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ addresses: uncached }),
          })

          if (response.ok) {
            const data = await response.json()
            
            if (data.success && data.data) {
              for (const [addr, meta] of Object.entries(data.data)) {
                const metadata = meta as TokenMetadata
                metadataCache.set(addr, { data: metadata, timestamp: Date.now() })
                newMap.set(addr, metadata)
              }
            }
          }
        }

        setMetadataMap(newMap)
      } catch (err) {
        console.warn('[useBatchTokenMetadata] Error:', err)
        setError(err instanceof Error ? err.message : 'Failed to fetch metadata')
      } finally {
        setIsLoading(false)
      }
    }

    fetchBatch()
  }, [tokenAddresses.join(',')])

  return { metadataMap, isLoading, error }
}

/**
 * Clear the metadata cache
 * Call this if you need fresh data
 */
export function clearMetadataCache(): void {
  metadataCache.clear()
}

export type { TokenMetadata, UseTokenMetadataResult }

