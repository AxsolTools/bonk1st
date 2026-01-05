/**
 * DexScreener Tracker Service
 * Monitors DexScreener for real-time boosts and profile updates for Solana tokens
 * Based on the Soldexpaid tracker logic
 */

export interface DexBoost {
  tokenAddress: string
  chainId: string
  amount: number
  totalAmount: number
  description?: string
  url: string
  links?: Array<{ label?: string; type?: string; url: string }>
  name?: string
  icon?: string
  timestamp?: number
}

export interface DexProfile {
  tokenAddress: string
  chainId: string
  name?: string
  description?: string
  url: string
  links?: Array<{ type: string; url: string; title?: string }>
  icon?: string
  header?: string
  timestamp?: number
}

export interface DexScreenerUpdate {
  id: string // Unique identifier
  type: 'boost' | 'profile'
  data: DexBoost | DexProfile
  tokenName?: string
  tokenSymbol?: string
  tokenLogo?: string
}

// Persistent store for ALL updates (keeps growing until max limit)
const allUpdates: DexScreenerUpdate[] = []
const MAX_STORED_UPDATES = 100 // Keep last 100 updates

// Track seen items to avoid adding duplicates
const seenIds = new Set<string>()
const tokenNameCache = new Map<string, { name: string; symbol: string; logo: string }>()

// Configuration
const CONFIG = {
  endpoints: {
    boosts: 'https://api.dexscreener.com/token-boosts/latest/v1',
    profiles: 'https://api.dexscreener.com/token-profiles/latest/v1',
    tokenInfo: 'https://api.dexscreener.com/latest/dex/tokens',
  },
  targetChainId: 'solana',
}

/**
 * Fetch token info from DexScreener
 */
async function fetchTokenInfo(tokenAddress: string): Promise<{ name: string; symbol: string; logo: string } | null> {
  if (tokenNameCache.has(tokenAddress)) {
    return tokenNameCache.get(tokenAddress)!
  }

  try {
    const response = await fetch(`${CONFIG.endpoints.tokenInfo}/${tokenAddress}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
      next: { revalidate: 60 },
    })

    if (!response.ok) return null

    const data = await response.json()
    const pair = data?.pairs?.[0]
    
    if (!pair) return null

    const info = {
      name: pair.baseToken?.name || pair.quoteToken?.name || 'Unknown',
      symbol: pair.baseToken?.symbol || pair.quoteToken?.symbol || '???',
      logo: pair.info?.imageUrl || `https://dd.dexscreener.com/ds-data/tokens/solana/${tokenAddress}.png`,
    }

    tokenNameCache.set(tokenAddress, info)
    return info
  } catch (error) {
    console.error('[DEXSCREENER] Failed to fetch token info:', error)
    return null
  }
}

/**
 * Validate if token address looks like a valid Solana address
 */
function isValidSolanaAddress(address: string): boolean {
  // Solana addresses are base58 encoded, typically 32-44 characters
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)
}

/**
 * Add new updates to the persistent store
 */
function addUpdates(newUpdates: DexScreenerUpdate[]): number {
  let addedCount = 0
  
  for (const update of newUpdates) {
    if (seenIds.has(update.id)) continue
    
    seenIds.add(update.id)
    allUpdates.unshift(update) // Add to beginning (newest first)
    addedCount++
  }
  
  // Trim to max size
  while (allUpdates.length > MAX_STORED_UPDATES) {
    const removed = allUpdates.pop()
    if (removed) {
      seenIds.delete(removed.id)
    }
  }
  
  return addedCount
}

/**
 * Fetch latest boosts from DexScreener API
 */
export async function fetchLatestBoosts(): Promise<DexScreenerUpdate[]> {
  try {
    const response = await fetch(CONFIG.endpoints.boosts, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json()
    const boosts = (Array.isArray(data) ? data : [data])
      .filter((b: any) => {
        if (!b?.tokenAddress) return false
        if (b.chainId?.toLowerCase() !== CONFIG.targetChainId) return false
        if (!isValidSolanaAddress(b.tokenAddress)) return false
        return true
      })

    const newUpdates: DexScreenerUpdate[] = []

    for (const boost of boosts) {
      const boostId = `boost_${boost.tokenAddress}_${boost.amount}_${boost.totalAmount || 0}`
      
      // Skip if already seen
      if (seenIds.has(boostId)) continue

      // Fetch token info
      const tokenInfo = await fetchTokenInfo(boost.tokenAddress)

      newUpdates.push({
        id: boostId,
        type: 'boost',
        data: {
          tokenAddress: boost.tokenAddress,
          chainId: boost.chainId,
          amount: boost.amount || 1,
          totalAmount: boost.totalAmount || boost.amount || 1,
          description: boost.description,
          url: boost.url || `https://dexscreener.com/solana/${boost.tokenAddress}`,
          links: boost.links,
          name: tokenInfo?.name,
          icon: boost.icon || tokenInfo?.logo,
          timestamp: Date.now(),
        },
        tokenName: tokenInfo?.name,
        tokenSymbol: tokenInfo?.symbol,
        tokenLogo: tokenInfo?.logo,
      })
    }

    // Add to persistent store
    addUpdates(newUpdates)

    return newUpdates
  } catch (error) {
    console.error('[DEXSCREENER] Failed to fetch boosts:', error)
    return []
  }
}

/**
 * Fetch latest profiles from DexScreener API
 */
export async function fetchLatestProfiles(): Promise<DexScreenerUpdate[]> {
  try {
    const response = await fetch(CONFIG.endpoints.profiles, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json()
    const profiles = (Array.isArray(data) ? data : [data])
      .filter((p: any) => {
        if (!p?.tokenAddress) return false
        if (p.chainId?.toLowerCase() !== CONFIG.targetChainId) return false
        if (!isValidSolanaAddress(p.tokenAddress)) return false
        return true
      })

    const newUpdates: DexScreenerUpdate[] = []

    for (const profile of profiles) {
      const profileId = `profile_${profile.tokenAddress}_${profile.schemaVersion || 1}`
      
      // Skip if already seen
      if (seenIds.has(profileId)) continue

      // Fetch token info
      const tokenInfo = await fetchTokenInfo(profile.tokenAddress)

      newUpdates.push({
        id: profileId,
        type: 'profile',
        data: {
          tokenAddress: profile.tokenAddress,
          chainId: profile.chainId,
          name: profile.name || tokenInfo?.name,
          description: profile.description,
          url: profile.url || `https://dexscreener.com/solana/${profile.tokenAddress}`,
          links: profile.links,
          icon: profile.icon || tokenInfo?.logo,
          header: profile.header,
          timestamp: Date.now(),
        },
        tokenName: profile.name || tokenInfo?.name,
        tokenSymbol: tokenInfo?.symbol,
        tokenLogo: profile.icon || tokenInfo?.logo,
      })
    }

    // Add to persistent store
    addUpdates(newUpdates)

    return newUpdates
  } catch (error) {
    console.error('[DEXSCREENER] Failed to fetch profiles:', error)
    return []
  }
}

/**
 * Fetch new updates and return ALL stored updates
 */
export async function fetchAllUpdates(): Promise<DexScreenerUpdate[]> {
  // Fetch new data (this adds to the persistent store)
  await Promise.all([
    fetchLatestBoosts(),
    fetchLatestProfiles(),
  ])

  // Return ALL stored updates (newest first)
  return [...allUpdates]
}

/**
 * Get all stored updates without fetching new ones
 */
export function getAllStoredUpdates(): DexScreenerUpdate[] {
  return [...allUpdates]
}

/**
 * Clear all stored updates (for testing or reset)
 */
export function clearCache(): void {
  allUpdates.length = 0
  seenIds.clear()
  console.log('[DEXSCREENER] Cache cleared')
}

/**
 * Get cache stats
 */
export function getCacheStats(): { total: number; tokens: number } {
  return {
    total: allUpdates.length,
    tokens: tokenNameCache.size,
  }
}
