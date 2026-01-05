// Birdeye API - Token analytics (free tier available)
// Note: Some endpoints require API key for higher rate limits

export interface BirdeyeToken {
  address: string
  symbol: string
  name: string
  decimals: number
  logoURI?: string
  liquidity: number
  price: number
  priceChange24h: number
  volume24h: number
  mc: number
  holder: number
  trade24h: number
  buy24h: number
  sell24h: number
  v24hUSD: number
}

export interface BirdeyeOHLCV {
  o: number
  h: number
  l: number
  c: number
  v: number
  unixTime: number
}

const BIRDEYE_BASE = "https://public-api.birdeye.so"

// Get token overview
export async function getBirdeyeTokenOverview(address: string): Promise<BirdeyeToken | null> {
  try {
    const res = await fetch(`${BIRDEYE_BASE}/defi/token_overview?address=${address}`, {
      headers: {
        accept: "application/json",
        "x-chain": "solana",
      },
      next: { revalidate: 60 },
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.data || null
  } catch {
    return null
  }
}

// Get trending tokens
export async function getBirdeyeTrending(): Promise<BirdeyeToken[]> {
  try {
    const res = await fetch(`${BIRDEYE_BASE}/defi/tokenlist?sort_by=v24hUSD&sort_type=desc&limit=20`, {
      headers: {
        accept: "application/json",
        "x-chain": "solana",
      },
      next: { revalidate: 60 },
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.data?.tokens || []
  } catch {
    return []
  }
}

// Get new listings
export async function getBirdeyeNewListings(): Promise<BirdeyeToken[]> {
  try {
    const res = await fetch(`${BIRDEYE_BASE}/defi/tokenlist?sort_by=createdAt&sort_type=desc&limit=50`, {
      headers: {
        accept: "application/json",
        "x-chain": "solana",
      },
      next: { revalidate: 30 },
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.data?.tokens || []
  } catch {
    return []
  }
}

// Get token holders
export async function getTokenHolders(address: string): Promise<number | null> {
  try {
    const res = await fetch(`${BIRDEYE_BASE}/defi/token_holder?address=${address}`, {
      headers: {
        accept: "application/json",
        "x-chain": "solana",
      },
      next: { revalidate: 300 },
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.data?.total || null
  } catch {
    return null
  }
}
