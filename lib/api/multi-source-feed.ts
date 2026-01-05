/**
 * Multi-Source Token Feed
 * Aggregates data from multiple sources for comprehensive token discovery:
 * - Helius RPC (on-chain data, token metadata)
 * - DexScreener (pairs, volume, trending)
 * - Jupiter (prices, verified tokens)
 * - Birdeye (token analytics)
 */

// Types
export interface TokenData {
  address: string
  symbol: string
  name: string
  price: number
  priceChange24h: number
  priceChange1h: number
  volume24h: number
  volume1h: number
  liquidity: number
  marketCap: number
  fdv: number
  pairCreatedAt: number
  logo: string
  txns24h: { buys: number; sells: number }
  txns1h: { buys: number; sells: number }
  holders?: number
  source: 'dexscreener' | 'jupiter' | 'helius' | 'birdeye' | 'aggregated'
}

export interface FeedConfig {
  sources: ('dexscreener' | 'jupiter' | 'helius' | 'birdeye')[]
  limit: number
  minLiquidity?: number
  minVolume?: number
  maxAge?: number // in hours
}

// Rate limiting and caching
const cache = new Map<string, { data: unknown; timestamp: number; source: string }>()
const CACHE_TTL: Record<string, number> = {
  dexscreener: 15000,  // 15s
  jupiter: 30000,      // 30s
  helius: 10000,       // 10s
  birdeye: 20000,      // 20s
}

const rateLimitState: Record<string, number> = {}
const RATE_LIMIT_COOLDOWN = 60000 // 1 minute cooldown after rate limit

function isRateLimited(source: string): boolean {
  const lastLimit = rateLimitState[source]
  if (!lastLimit) return false
  return Date.now() - lastLimit < RATE_LIMIT_COOLDOWN
}

function setRateLimited(source: string) {
  rateLimitState[source] = Date.now()
}

function getCached<T>(key: string, source: string): T | null {
  const cached = cache.get(key)
  if (!cached) return null
  const ttl = CACHE_TTL[source] || 15000
  if (Date.now() - cached.timestamp > ttl) return null
  return cached.data as T
}

function setCache(key: string, data: unknown, source: string) {
  cache.set(key, { data, timestamp: Date.now(), source })
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = 8000): Promise<Response> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeout)
  
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    clearTimeout(id)
    return response
  } catch (error) {
    clearTimeout(id)
    throw error
  }
}

// ============== DEXSCREENER ==============
export async function fetchDexScreenerTokens(limit = 40): Promise<TokenData[]> {
  const cacheKey = `dex-tokens-${limit}`
  const cached = getCached<TokenData[]>(cacheKey, 'dexscreener')
  if (cached) return cached

  if (isRateLimited('dexscreener')) {
    console.log('[FEED] DexScreener rate limited, skipping')
    return []
  }

  const tokens: TokenData[] = []
  const seenAddresses = new Set<string>()

  try {
    // Fetch from multiple DexScreener endpoints in parallel
    const [boostedRes, profilesRes] = await Promise.allSettled([
      fetchWithTimeout('https://api.dexscreener.com/token-boosts/latest/v1'),
      fetchWithTimeout('https://api.dexscreener.com/token-profiles/latest/v1'),
    ])

    const addresses: string[] = []

    if (boostedRes.status === 'fulfilled' && boostedRes.value.ok) {
      const data = await boostedRes.value.json()
      const solanaTokens = (data || []).filter((t: { chainId: string }) => t.chainId === 'solana')
      addresses.push(...solanaTokens.slice(0, 25).map((t: { tokenAddress: string }) => t.tokenAddress))
    }

    if (profilesRes.status === 'fulfilled' && profilesRes.value.ok) {
      const data = await profilesRes.value.json()
      const solanaTokens = (data || []).filter((t: { chainId: string }) => t.chainId === 'solana')
      const newAddrs = solanaTokens
        .slice(0, 25)
        .map((t: { tokenAddress: string }) => t.tokenAddress)
        .filter((addr: string) => !addresses.includes(addr))
      addresses.push(...newAddrs)
    }

    // Batch fetch token data
    if (addresses.length > 0) {
      const uniqueAddrs = [...new Set(addresses)].slice(0, 30)
      const batchRes = await fetchWithTimeout(
        `https://api.dexscreener.com/tokens/v1/solana/${uniqueAddrs.join(',')}`
      )
      
      if (batchRes.ok) {
        const pairs = await batchRes.json()
        for (const pair of pairs || []) {
          if (!pair?.baseToken?.address || seenAddresses.has(pair.baseToken.address)) continue
          seenAddresses.add(pair.baseToken.address)
          
          tokens.push({
            address: pair.baseToken.address,
            symbol: pair.baseToken.symbol || 'UNKNOWN',
            name: pair.baseToken.name || 'Unknown',
            price: parseFloat(pair.priceUsd) || 0,
            priceChange24h: pair.priceChange?.h24 || 0,
            priceChange1h: pair.priceChange?.h1 || 0,
            volume24h: pair.volume?.h24 || 0,
            volume1h: pair.volume?.h1 || 0,
            liquidity: pair.liquidity?.usd || 0,
            marketCap: pair.marketCap || pair.fdv || 0,
            fdv: pair.fdv || 0,
            pairCreatedAt: pair.pairCreatedAt || Date.now(),
            logo: pair.info?.imageUrl || `https://dd.dexscreener.com/ds-data/tokens/solana/${pair.baseToken.address}.png`,
            txns24h: {
              buys: pair.txns?.h24?.buys || 0,
              sells: pair.txns?.h24?.sells || 0,
            },
            txns1h: {
              buys: pair.txns?.h1?.buys || 0,
              sells: pair.txns?.h1?.sells || 0,
            },
            source: 'dexscreener',
          })
        }
      }
    }
  } catch (error) {
    console.error('[FEED] DexScreener error:', error)
    if (String(error).includes('429') || String(error).includes('Too Many')) {
      setRateLimited('dexscreener')
    }
  }

  setCache(cacheKey, tokens, 'dexscreener')
  return tokens.slice(0, limit)
}

// ============== JUPITER ==============
// Jupiter API deprecated lite-api.jup.ag and now requires paid API key signup
// Disabled - using other sources instead
export async function fetchJupiterTokens(limit = 30): Promise<TokenData[]> {
  // Jupiter API now requires API key signup - disabled
  return []
}

// ============== HELIUS (via RPC) ==============
export async function fetchHeliusNewTokens(heliusApiKey: string | null, limit = 20): Promise<TokenData[]> {
  if (!heliusApiKey) return []
  
  const cacheKey = `helius-new-${limit}`
  const cached = getCached<TokenData[]>(cacheKey, 'helius')
  if (cached) return cached

  if (isRateLimited('helius')) {
    return []
  }

  const tokens: TokenData[] = []

  try {
    // Use Helius signature search for recent token mints
    // This gives us the newest tokens before they hit aggregators
    const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`
    
    // Get recent token metadata using DAS
    const response = await fetchWithTimeout(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'searchAssets',
        params: {
          ownerAddress: null,
          tokenType: 'fungible',
          displayOptions: { showFungible: true },
          sortBy: { sortBy: 'created', sortDirection: 'desc' },
          limit: limit,
        },
      }),
    })

    if (response.ok) {
      const data = await response.json()
      const assets = data.result?.items || []
      
      for (const asset of assets) {
        if (!asset.id) continue
        
        tokens.push({
          address: asset.id,
          symbol: asset.content?.metadata?.symbol || 'UNKNOWN',
          name: asset.content?.metadata?.name || 'Unknown Token',
          price: 0, // Need to fetch from price API
          priceChange24h: 0,
          priceChange1h: 0,
          volume24h: 0,
          volume1h: 0,
          liquidity: 0,
          marketCap: 0,
          fdv: 0,
          pairCreatedAt: Date.now(),
          logo: asset.content?.links?.image || asset.content?.files?.[0]?.uri || '',
          txns24h: { buys: 0, sells: 0 },
          txns1h: { buys: 0, sells: 0 },
          source: 'helius',
        })
      }
    }
  } catch (error) {
    console.error('[FEED] Helius error:', error)
    if (String(error).includes('429')) {
      setRateLimited('helius')
    }
  }

  setCache(cacheKey, tokens, 'helius')
  return tokens
}

// ============== BIRDEYE ==============
export async function fetchBirdeyeTokens(apiKey: string | null, limit = 30): Promise<TokenData[]> {
  if (!apiKey) return []
  
  const cacheKey = `birdeye-tokens-${limit}`
  const cached = getCached<TokenData[]>(cacheKey, 'birdeye')
  if (cached) return cached

  if (isRateLimited('birdeye')) {
    return []
  }

  const tokens: TokenData[] = []

  try {
    const response = await fetchWithTimeout(
      `https://public-api.birdeye.so/defi/tokenlist?sort_by=v24hUSD&sort_type=desc&offset=0&limit=${limit}`,
      {
        headers: {
          'X-API-KEY': apiKey,
          'x-chain': 'solana',
        },
      }
    )

    if (response.ok) {
      const data = await response.json()
      const tokenList = data.data?.tokens || []
      
      for (const token of tokenList) {
        tokens.push({
          address: token.address,
          symbol: token.symbol || 'UNKNOWN',
          name: token.name || 'Unknown',
          price: token.price || 0,
          priceChange24h: token.priceChange24hPercent || 0,
          priceChange1h: token.priceChange1hPercent || 0,
          volume24h: token.v24hUSD || 0,
          volume1h: token.v1hUSD || 0,
          liquidity: token.liquidity || 0,
          marketCap: token.mc || 0,
          fdv: token.fdv || 0,
          pairCreatedAt: Date.now(),
          logo: token.logoURI || '',
          txns24h: { buys: 0, sells: 0 },
          txns1h: { buys: 0, sells: 0 },
          holders: token.holder || 0,
          source: 'birdeye',
        })
      }
    }
  } catch (error) {
    console.error('[FEED] Birdeye error:', error)
    if (String(error).includes('429')) {
      setRateLimited('birdeye')
    }
  }

  setCache(cacheKey, tokens, 'birdeye')
  return tokens
}

// ============== AGGREGATED FEED ==============
export async function fetchAggregatedFeed(config: FeedConfig): Promise<TokenData[]> {
  const heliusApiKey = process.env.HELIUS_API_KEY || null
  const birdeyeApiKey = process.env.BIRDEYE_API_KEY || null

  const fetchPromises: Promise<TokenData[]>[] = []

  if (config.sources.includes('dexscreener')) {
    fetchPromises.push(fetchDexScreenerTokens(config.limit))
  }
  if (config.sources.includes('jupiter')) {
    fetchPromises.push(fetchJupiterTokens(config.limit))
  }
  if (config.sources.includes('helius') && heliusApiKey) {
    fetchPromises.push(fetchHeliusNewTokens(heliusApiKey, config.limit))
  }
  if (config.sources.includes('birdeye') && birdeyeApiKey) {
    fetchPromises.push(fetchBirdeyeTokens(birdeyeApiKey, config.limit))
  }

  const results = await Promise.allSettled(fetchPromises)
  const allTokens: TokenData[] = []
  const seenAddresses = new Set<string>()

  for (const result of results) {
    if (result.status === 'fulfilled') {
      for (const token of result.value) {
        // Skip if we've seen this token or it doesn't meet criteria
        if (seenAddresses.has(token.address)) continue
        if (config.minLiquidity && token.liquidity < config.minLiquidity) continue
        if (config.minVolume && token.volume24h < config.minVolume) continue
        if (config.maxAge) {
          const ageHours = (Date.now() - token.pairCreatedAt) / 3600000
          if (ageHours > config.maxAge) continue
        }

        seenAddresses.add(token.address)
        allTokens.push({ ...token, source: 'aggregated' })
      }
    }
  }

  // Sort by volume + recency score
  allTokens.sort((a, b) => {
    const aScore = (a.volume24h / Math.max(a.marketCap, 1)) * 100 + 
                   (a.txns24h.buys + a.txns24h.sells) / 100
    const bScore = (b.volume24h / Math.max(b.marketCap, 1)) * 100 + 
                   (b.txns24h.buys + b.txns24h.sells) / 100
    return bScore - aScore
  })

  return allTokens.slice(0, config.limit)
}

// ============== TRENDING AGGREGATOR ==============
export async function fetchTrendingAggregated(limit = 40): Promise<TokenData[]> {
  const cacheKey = 'trending-aggregated'
  const cached = getCached<TokenData[]>(cacheKey, 'dexscreener')
  if (cached) return cached

  const tokens: TokenData[] = []
  const seenAddresses = new Set<string>()

  try {
    // Fetch from multiple sources
    const [dexTokens, jupTokens] = await Promise.allSettled([
      fetchDexScreenerTokens(30),
      fetchJupiterTokens(20),
    ])

    // Merge with dedup
    const allTokens: TokenData[] = []
    
    if (dexTokens.status === 'fulfilled') {
      allTokens.push(...dexTokens.value)
    }
    if (jupTokens.status === 'fulfilled') {
      allTokens.push(...jupTokens.value)
    }

    for (const token of allTokens) {
      if (seenAddresses.has(token.address)) continue
      seenAddresses.add(token.address)
      tokens.push(token)
    }

    // Sort by trending score (volume, activity, price change)
    tokens.sort((a, b) => {
      const aVolScore = Math.min((a.volume24h || 0) / 100000, 100)
      const aChangeScore = Math.min(Math.abs(a.priceChange24h || 0), 100)
      const aActivityScore = Math.min((a.txns24h.buys + a.txns24h.sells) / 100, 100)
      const aScore = aVolScore + aChangeScore + aActivityScore

      const bVolScore = Math.min((b.volume24h || 0) / 100000, 100)
      const bChangeScore = Math.min(Math.abs(b.priceChange24h || 0), 100)
      const bActivityScore = Math.min((b.txns24h.buys + b.txns24h.sells) / 100, 100)
      const bScore = bVolScore + bChangeScore + bActivityScore

      return bScore - aScore
    })
  } catch (error) {
    console.error('[FEED] Trending aggregation error:', error)
  }

  setCache(cacheKey, tokens.slice(0, limit), 'dexscreener')
  return tokens.slice(0, limit)
}

// Export source health status
export function getSourceHealth(): Record<string, { healthy: boolean; lastLimit: number | null }> {
  return {
    dexscreener: {
      healthy: !isRateLimited('dexscreener'),
      lastLimit: rateLimitState['dexscreener'] || null,
    },
    jupiter: {
      healthy: !isRateLimited('jupiter'),
      lastLimit: rateLimitState['jupiter'] || null,
    },
    helius: {
      healthy: !isRateLimited('helius'),
      lastLimit: rateLimitState['helius'] || null,
    },
    birdeye: {
      healthy: !isRateLimited('birdeye'),
      lastLimit: rateLimitState['birdeye'] || null,
    },
  }
}

