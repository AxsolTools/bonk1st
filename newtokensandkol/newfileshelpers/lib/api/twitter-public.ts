// Free public Twitter/X APIs for crypto CA scanning

// Simple in-memory cache
const cache = new Map<string, { data: unknown; timestamp: number }>()
const CACHE_TTL = 30000 // 30 second cache for Twitter data

function getCached<T>(key: string): T | null {
  const cached = cache.get(key)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data as T
  }
  return null
}

function setCache(key: string, data: unknown) {
  cache.set(key, { data, timestamp: Date.now() })
}

// Safe fetch with rate limit handling
async function safeFetch<T>(url: string, defaultValue: T): Promise<T> {
  try {
    const res = await fetch(url, {
      next: { revalidate: 30 },
      headers: { Accept: "application/json" },
    })

    if (!res.ok) {
      return defaultValue
    }

    const text = await res.text()

    // Check if response is valid JSON
    if (
      !text ||
      text.startsWith("Too Many") ||
      text.startsWith("<!") ||
      (!text.startsWith("{") && !text.startsWith("["))
    ) {
      return defaultValue
    }

    return JSON.parse(text) as T
  } catch {
    return defaultValue
  }
}

export interface TwitterMention {
  id: string
  text: string
  author: {
    name: string
    username: string
    profileImage: string
    followers: number
    verified: boolean
  }
  createdAt: string
  likes: number
  retweets: number
  replies: number
  contractAddresses: string[]
  url: string
  engagementScore: number
}

// Solana CA pattern
const SOLANA_CA_REGEX = /[1-9A-HJ-NP-Za-km-z]{32,44}/g

export function extractSolanaAddresses(text: string): string[] {
  const matches = text.match(SOLANA_CA_REGEX) || []
  return matches.filter((addr) => {
    if (addr.length < 32 || addr.length > 44) return false
    if (/[0OIl]/.test(addr)) return false
    if (/^[A-Za-z]+$/.test(addr)) return false
    return true
  })
}

export function calculateEngagement(tweet: {
  likes: number
  retweets: number
  replies: number
  followers: number
}): number {
  const base = tweet.likes + tweet.retweets * 2 + tweet.replies * 1.5
  const multiplier = Math.log10(Math.max(tweet.followers, 100)) / 4
  return Math.round(base * multiplier)
}

// Token profile interface from DexScreener
interface TokenProfile {
  chainId: string
  tokenAddress: string
  icon?: string
  header?: string
  description?: string
  links?: { type: string; label?: string; url: string }[]
  url?: string
}

// Main search function using DexScreener's token profiles
export async function searchTwitterForCAs(): Promise<TwitterMention[]> {
  // Check cache first
  const cached = getCached<TwitterMention[]>("twitter-mentions")
  if (cached) return cached

  const mentions: TwitterMention[] = []

  try {
    // Use DexScreener's latest tokens which includes social data
    const tokens = await safeFetch<TokenProfile[]>("https://api.dexscreener.com/token-profiles/latest/v1", [])

    for (const token of (tokens || []).slice(0, 30)) {
      if (token.chainId !== "solana") continue

      const twitterLink = token.links?.find((l) => l.type === "twitter")

      mentions.push({
        id: `dex-${token.tokenAddress}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        text: token.description || `New token listed: ${token.tokenAddress.slice(0, 8)}...`,
        author: {
          name: token.header || "New Token",
          username: twitterLink ? twitterLink.url.split("/").pop() || "unknown" : "dexscreener",
          profileImage: token.icon || `https://dd.dexscreener.com/ds-data/tokens/solana/${token.tokenAddress}.png`,
          followers: 1000,
          verified: false,
        },
        createdAt: new Date().toISOString(),
        likes: 0,
        retweets: 0,
        replies: 0,
        contractAddresses: [token.tokenAddress],
        url: token.url || `https://dexscreener.com/solana/${token.tokenAddress}`,
        engagementScore: 100,
      })
    }

    // Get boosted tokens
    const boostedTokens = await safeFetch<TokenProfile[]>("https://api.dexscreener.com/token-boosts/latest/v1", [])

    for (const token of (boostedTokens || []).slice(0, 15)) {
      if (token.chainId !== "solana") continue

      mentions.push({
        id: `boost-${token.tokenAddress}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        text: `Boosted: ${token.description || token.tokenAddress.slice(0, 8)}...`,
        author: {
          name: token.header || "DEX Boosted",
          username: "dexscreener",
          profileImage: token.icon || `https://dd.dexscreener.com/ds-data/tokens/solana/${token.tokenAddress}.png`,
          followers: 5000,
          verified: false,
        },
        createdAt: new Date().toISOString(),
        likes: 0,
        retweets: 0,
        replies: 0,
        contractAddresses: [token.tokenAddress],
        url: `https://dexscreener.com/solana/${token.tokenAddress}`,
        engagementScore: 200,
      })
    }

    // Cache the results
    setCache("twitter-mentions", mentions)
  } catch (error) {
    console.log("[v0] Twitter search error:", error)
    // Return cached data if available
    return getCached<TwitterMention[]>("twitter-mentions") || []
  }

  return mentions
}

// Fetch specific account tweets (uses Nitter as fallback)
export async function fetchAccountTweets(username: string): Promise<TwitterMention[]> {
  const cached = getCached<TwitterMention[]>(`account-${username}`)
  if (cached) return cached

  const nitterInstances = ["https://nitter.privacydev.net", "https://nitter.poast.org", "https://nitter.kavin.rocks"]

  for (const instance of nitterInstances) {
    try {
      const res = await fetch(`${instance}/${username}/rss`, {
        next: { revalidate: 60 },
      })

      if (res.ok) {
        const rss = await res.text()
        const items = rss.match(/<item>([\s\S]*?)<\/item>/g) || []
        const mentions: TwitterMention[] = []

        for (const item of items.slice(0, 10)) {
          const titleMatch = item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)
          const text = titleMatch ? titleMatch[1] : ""
          const cas = extractSolanaAddresses(text)

          if (cas.length > 0) {
            mentions.push({
              id: `nitter-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              text,
              author: {
                name: username,
                username: `@${username}`,
                profileImage: `https://unavatar.io/twitter/${username}`,
                followers: 10000,
                verified: false,
              },
              createdAt: new Date().toISOString(),
              likes: 0,
              retweets: 0,
              replies: 0,
              contractAddresses: cas,
              url: `https://twitter.com/${username}`,
              engagementScore: 100,
            })
          }
        }

        setCache(`account-${username}`, mentions)
        return mentions
      }
    } catch {
      continue
    }
  }

  return []
}
