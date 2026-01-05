// DexScreener API - Free public API for token data
// Adapted for Aquarius Launchpad with caching and rate limiting

const cache = new Map<string, { data: unknown; timestamp: number }>()
const CACHE_TTL = 45000 // 45 seconds
const RATE_LIMIT_BACKOFF = 60000 // 1 minute backoff when rate limited
let lastRateLimitTime = 0

function getStaleCache<T>(key: string): T | null {
  const cached = cache.get(key)
  return cached ? (cached.data as T) : null
}

function isCacheFresh(key: string): boolean {
  const cached = cache.get(key)
  if (!cached) return false
  return Date.now() - cached.timestamp < CACHE_TTL
}

function isRateLimited(): boolean {
  return Date.now() - lastRateLimitTime < RATE_LIMIT_BACKOFF
}

function setCache(key: string, data: unknown) {
  cache.set(key, { data, timestamp: Date.now() })
}

async function safeFetch<T>(url: string, cacheKey: string, defaultValue: T): Promise<T> {
  const staleData = getStaleCache<T>(cacheKey)

  if (isCacheFresh(cacheKey) && staleData) {
    return staleData
  }

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
      return staleData || defaultValue
    }

    const text = await res.text()

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

export interface TokenProfile {
  url: string
  chainId: string
  tokenAddress: string
  icon?: string
  header?: string
  description?: string
  links?: { type: string; label: string; url: string }[]
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

  const chunks: string[][] = []
  for (let i = 0; i < tokenAddresses.length; i += 30) {
    chunks.push(tokenAddresses.slice(i, i + 30))
  }

  for (const chunk of chunks) {
    const addresses = chunk.join(",")
    const data = await safeFetch<DexScreenerToken[]>(
      `https://api.dexscreener.com/tokens/v1/solana/${addresses}`,
      `multi-tokens-${chunk[0]}`,
      [],
    )

    for (const pair of data || []) {
      if (pair?.baseToken?.address && !result.has(pair.baseToken.address)) {
        result.set(pair.baseToken.address, pair)
      }
    }
  }

  return result
}

export function getDexScreenerLogoUrl(chainId: string, tokenAddress: string): string {
  return `https://dd.dexscreener.com/ds-data/tokens/${chainId}/${tokenAddress}.png`
}

// Helper to identify Pump.fun tokens
export function isPumpFunToken(token: DexScreenerToken): boolean {
  return (
    token.dexId === 'pumpfun' || 
    token.baseToken.address.endsWith('pump') ||
    token.url?.includes('pump.fun')
  )
}

// Get token age string
export function getTokenAge(createdAt: number): string {
  const diff = Date.now() - createdAt
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 60) return `${minutes}m`
  if (hours < 24) return `${hours}h`
  if (days < 7) return `${days}d`
  return `${Math.floor(days / 7)}w`
}

