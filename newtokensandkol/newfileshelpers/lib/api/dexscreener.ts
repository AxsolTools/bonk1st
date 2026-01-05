// DexScreener API - Free public API for token data

// Cache stores data indefinitely, TTL only determines if we try to refresh
const cache = new Map<string, { data: unknown; timestamp: number }>()
const CACHE_TTL = 45000 // 45 seconds - when to try refreshing (balanced for real-time)
const RATE_LIMIT_BACKOFF = 60000 // 1 minute backoff when rate limited (reduced from 2 min)
let lastRateLimitTime = 0

// Get cached data regardless of TTL (for fallback) - ALWAYS returns data if exists
function getStaleCache<T>(key: string): T | null {
  const cached = cache.get(key)
  return cached ? (cached.data as T) : null
}

// Check if cache is fresh
function isCacheFresh(key: string): boolean {
  const cached = cache.get(key)
  if (!cached) return false
  return Date.now() - cached.timestamp < CACHE_TTL
}

// Check if we're in rate limit backoff
function isRateLimited(): boolean {
  return Date.now() - lastRateLimitTime < RATE_LIMIT_BACKOFF
}

function setCache(key: string, data: unknown) {
  cache.set(key, { data, timestamp: Date.now() })
}

// Safe JSON parse with rate limit handling
async function safeFetch<T>(url: string, cacheKey: string, defaultValue: T): Promise<T> {
  // Always check for stale cache first - return it if API is rate limited
  const staleData = getStaleCache<T>(cacheKey)

  // If cache is fresh, return immediately
  if (isCacheFresh(cacheKey) && staleData) {
    return staleData
  }

  // If rate limited, return stale cache or default
  if (isRateLimited()) {
    return staleData || defaultValue
  }

  try {
    const res = await fetch(url, {
      next: { revalidate: 30 },
      headers: { Accept: "application/json" },
    })

    if (!res.ok) {
      if (res.status === 429) {
        lastRateLimitTime = Date.now()
      }
      // Return stale data on any HTTP error
      return staleData || defaultValue
    }

    const text = await res.text()

    // Check if response is rate limited or invalid
    if (
      !text ||
      text.startsWith("Too Many") ||
      text.startsWith("<!") ||
      (!text.startsWith("{") && !text.startsWith("["))
    ) {
      lastRateLimitTime = Date.now()
      return staleData || defaultValue
    }

    const data = JSON.parse(text) as T
    setCache(cacheKey, data)
    return data
  } catch {
    // On any error, return stale cache
    return staleData || defaultValue
  }
}

export interface DexScreenerToken {
  chainId: string
  dexId: string
  url: string
  pairAddress: string
  baseToken: {
    address: string
    name: string
    symbol: string
  }
  quoteToken: {
    address: string
    name: string
    symbol: string
  }
  priceNative: string
  priceUsd: string
  txns: {
    m5: { buys: number; sells: number }
    h1: { buys: number; sells: number }
    h6: { buys: number; sells: number }
    h24: { buys: number; sells: number }
  }
  volume: {
    h24: number
    h6: number
    h1: number
    m5: number
  }
  priceChange: {
    m5: number
    h1: number
    h6: number
    h24: number
  }
  liquidity: {
    usd: number
    base: number
    quote: number
  }
  fdv: number
  marketCap: number
  pairCreatedAt: number
  info?: {
    imageUrl?: string
    header?: string
    openGraph?: string
    websites?: { label: string; url: string }[]
    socials?: { type: string; url: string }[]
  }
  boosts?: {
    active: number
  }
}

export interface DexScreenerResponse {
  schemaVersion: string
  pairs: DexScreenerToken[]
}

const DEXSCREENER_BASE = "https://api.dexscreener.com/latest"

export async function getTokenPairs(tokenAddress: string): Promise<DexScreenerToken[]> {
  const data = await safeFetch<DexScreenerResponse>(
    `${DEXSCREENER_BASE}/dex/tokens/${tokenAddress}`,
    `pairs-${tokenAddress}`,
    { schemaVersion: "", pairs: [] },
  )
  return data.pairs || []
}

export async function getTrendingTokens(): Promise<DexScreenerToken[]> {
  const data = await safeFetch<DexScreenerResponse>(`${DEXSCREENER_BASE}/dex/search?q=solana`, "trending-solana", {
    schemaVersion: "",
    pairs: [],
  })
  return (data.pairs || [])
    .filter((p) => p.chainId === "solana")
    .sort((a, b) => (b.volume?.h24 || 0) - (a.volume?.h24 || 0))
    .slice(0, 20)
}

export async function getNewPairs(): Promise<DexScreenerToken[]> {
  const data = await safeFetch<DexScreenerResponse>(`${DEXSCREENER_BASE}/dex/pairs/solana`, "new-pairs-solana", {
    schemaVersion: "",
    pairs: [],
  })
  return (data.pairs || []).sort((a, b) => (b.pairCreatedAt || 0) - (a.pairCreatedAt || 0)).slice(0, 50)
}

export async function searchTokens(query: string): Promise<DexScreenerToken[]> {
  const data = await safeFetch<DexScreenerResponse>(
    `${DEXSCREENER_BASE}/dex/search?q=${encodeURIComponent(query)}`,
    `search-${query}`,
    { schemaVersion: "", pairs: [] },
  )
  return (data.pairs || []).filter((p) => p.chainId === "solana")
}

export async function getTokenProfile(
  tokenAddress: string,
): Promise<{ url: string; imageUrl?: string; description?: string; links?: { type: string; url: string }[] } | null> {
  return await safeFetch(
    `https://api.dexscreener.com/token-profiles/latest/v1/${tokenAddress}`,
    `profile-${tokenAddress}`,
    null,
  )
}

export interface BoostedToken {
  url: string
  chainId: string
  tokenAddress: string
  icon?: string
  header?: string
  openGraph?: string
  description?: string
  links?: { type: string; label: string; url: string }[]
  amount: number
  totalAmount: number
}

export async function getBoostedTokens(): Promise<BoostedToken[]> {
  const data = await safeFetch<BoostedToken[]>(`https://api.dexscreener.com/token-boosts/top/v1`, "boosted-top", [])
  return (data || []).filter((t: BoostedToken) => t.chainId === "solana")
}

export async function getLatestBoostedTokens(): Promise<BoostedToken[]> {
  const data = await safeFetch<BoostedToken[]>(
    `https://api.dexscreener.com/token-boosts/latest/v1`,
    "boosted-latest",
    [],
  )
  return (data || []).filter((t: BoostedToken) => t.chainId === "solana")
}

export interface TokenProfile {
  url: string
  chainId: string
  tokenAddress: string
  icon?: string
  header?: string
  description?: string
  links?: { type: string; label: string; url: string }[]
}

export async function getLatestProfiles(): Promise<TokenProfile[]> {
  const data = await safeFetch<TokenProfile[]>(
    `https://api.dexscreener.com/token-profiles/latest/v1`,
    "profiles-latest",
    [],
  )
  return (data || []).filter((t: TokenProfile) => t.chainId === "solana")
}

export async function getBulkTokenPairs(tokenAddresses: string[]): Promise<Map<string, DexScreenerToken>> {
  const result = new Map<string, DexScreenerToken>()

  if (tokenAddresses.length === 0) return result

  // DexScreener multi-token endpoint: /tokens/v1/{chainId}/{addresses}
  // Supports up to 30 comma-separated addresses per request
  const chunks: string[][] = []
  for (let i = 0; i < tokenAddresses.length; i += 30) {
    chunks.push(tokenAddresses.slice(i, i + 30))
  }

  for (const chunk of chunks) {
    const addresses = chunk.join(",")
    // Use the correct multi-token endpoint
    const data = await safeFetch<DexScreenerToken[]>(
      `https://api.dexscreener.com/tokens/v1/solana/${addresses}`,
      `multi-tokens-${chunk[0]}`,
      [],
    )

    // This endpoint returns an array of pairs directly
    for (const pair of data || []) {
      if (pair?.baseToken?.address && !result.has(pair.baseToken.address)) {
        result.set(pair.baseToken.address, pair)
      }
    }
  }

  return result
}

export async function getTokenLogo(tokenAddress: string): Promise<string | null> {
  // DexScreener is the primary source for logos (no auth required)
  const pairs = await getTokenPairs(tokenAddress)
  if (pairs[0]?.info?.imageUrl) return pairs[0].info.imageUrl

  // Fallback to DexScreener direct logo URL
  return `https://dd.dexscreener.com/ds-data/tokens/solana/${tokenAddress}.png`
}

export function getDexScreenerLogoUrl(chainId: string, tokenAddress: string): string {
  return `https://dd.dexscreener.com/ds-data/tokens/${chainId}/${tokenAddress}.png`
}
