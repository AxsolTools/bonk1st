// DexScreener API for live token data
export async function fetchTokenFromDexScreener(address: string) {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`, {
      next: { revalidate: 30 },
    })
    const data = await res.json()
    if (data.pairs && data.pairs.length > 0) {
      const pair = data.pairs[0]
      return {
        symbol: pair.baseToken.symbol,
        name: pair.baseToken.name,
        address: pair.baseToken.address,
        price: Number.parseFloat(pair.priceUsd) || 0,
        priceChange24h: pair.priceChange?.h24 || 0,
        volume24h: pair.volume?.h24 || 0,
        liquidity: pair.liquidity?.usd || 0,
        marketCap: pair.marketCap || pair.fdv || 0,
        pairCreatedAt: pair.pairCreatedAt,
        logo: `https://dd.dexscreener.com/ds-data/tokens/solana/${address}.png`,
        txns24h: {
          buys: pair.txns?.h24?.buys || 0,
          sells: pair.txns?.h24?.sells || 0,
        },
      }
    }
    return null
  } catch (error) {
    console.error("DexScreener fetch error:", error)
    return null
  }
}

// Fetch multiple tokens at once
export async function fetchMultipleTokens(addresses: string[]) {
  const results = await Promise.all(addresses.map((addr) => fetchTokenFromDexScreener(addr)))
  return results.filter(Boolean)
}

// Search for new tokens on DexScreener
export async function searchNewTokens(query = "solana") {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${query}`, {
      next: { revalidate: 60 },
    })
    const data = await res.json()
    return data.pairs?.filter((p: any) => p.chainId === "solana").slice(0, 20) || []
  } catch (error) {
    console.error("DexScreener search error:", error)
    return []
  }
}

// Get trending tokens from DexScreener
export async function fetchTrendingTokens() {
  try {
    // Fetch boosted tokens (trending)
    const res = await fetch("https://api.dexscreener.com/token-boosts/top/v1", {
      next: { revalidate: 60 },
    })
    const data = await res.json()
    const solanaTokens = data.filter((t: any) => t.chainId === "solana").slice(0, 10)

    // Fetch full data for each
    const fullData = await Promise.all(solanaTokens.map((t: any) => fetchTokenFromDexScreener(t.tokenAddress)))
    return fullData.filter(Boolean)
  } catch (error) {
    console.error("Trending fetch error:", error)
    return []
  }
}

// Get latest token profiles (newly listed)
export async function fetchLatestTokens() {
  try {
    const res = await fetch("https://api.dexscreener.com/token-profiles/latest/v1", {
      next: { revalidate: 30 },
    })
    const data = await res.json()
    const solanaTokens = data.filter((t: any) => t.chainId === "solana").slice(0, 15)

    const fullData = await Promise.all(solanaTokens.map((t: any) => fetchTokenFromDexScreener(t.tokenAddress)))
    return fullData.filter(Boolean)
  } catch (error) {
    console.error("Latest tokens fetch error:", error)
    return []
  }
}

// Jupiter Price API for accurate pricing
export async function fetchJupiterPrice(tokenMint: string) {
  try {
    const res = await fetch(`https://price.jup.ag/v4/price?ids=${tokenMint}`, {
      next: { revalidate: 10 },
    })
    const data = await res.json()
    return data.data?.[tokenMint]?.price || null
  } catch (error) {
    return null
  }
}

// Calculate token age from creation timestamp
export function getTokenAge(createdAt: number): string {
  const now = Date.now()
  const diff = now - createdAt

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 60) return `${minutes}m`
  if (hours < 24) return `${hours}h`
  if (days < 7) return `${days}d`
  return `${Math.floor(days / 7)}w`
}

// Format market cap
export function formatMarketCap(mc: number): string {
  if (mc >= 1_000_000_000) return `$${(mc / 1_000_000_000).toFixed(2)}B`
  if (mc >= 1_000_000) return `$${(mc / 1_000_000).toFixed(2)}M`
  if (mc >= 1_000) return `$${(mc / 1_000).toFixed(0)}K`
  return `$${mc.toFixed(0)}`
}

// Format volume
export function formatVolume(vol: number): string {
  if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(2)}M`
  if (vol >= 1_000) return `$${(vol / 1_000).toFixed(1)}K`
  return `$${vol.toFixed(0)}`
}

export async function fetchMixedTrendingTokens() {
  try {
    // Fetch from multiple sources in parallel
    const [boostedRes, latestRes] = await Promise.all([
      fetch("https://api.dexscreener.com/token-boosts/top/v1", { next: { revalidate: 30 } }),
      fetch("https://api.dexscreener.com/token-profiles/latest/v1", { next: { revalidate: 30 } }),
    ])

    const boostedData = await boostedRes.json()
    const latestData = await latestRes.json()

    // Get Solana tokens from both sources
    const boostedTokens = (boostedData || [])
      .filter((t: any) => t.chainId === "solana")
      .slice(0, 8)
      .map((t: any) => t.tokenAddress)

    const latestTokens = (latestData || [])
      .filter((t: any) => t.chainId === "solana")
      .slice(0, 8)
      .map((t: any) => t.tokenAddress)

    // Combine and dedupe
    const allAddresses = [...new Set([...latestTokens, ...boostedTokens])]

    // Shuffle the array for variety
    const shuffled = allAddresses.sort(() => Math.random() - 0.5).slice(0, 12)

    // Fetch full data for each token
    const fullData = await Promise.all(shuffled.map((addr) => fetchTokenFromDexScreener(addr)))

    return fullData.filter(Boolean)
  } catch (error) {
    console.error("Mixed trending fetch error:", error)
    return []
  }
}
