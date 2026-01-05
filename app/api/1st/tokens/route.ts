/**
 * BONK1ST - BONK Token Feed API
 * 
 * Filters for bonk.fun / letsbonk.fun tokens:
 * - Token addresses ending with "bonk"
 * - Tokens from LaunchLab (bonk.fun platform)
 * - USD1 and SOL paired tokens
 */

import { NextResponse } from 'next/server'
import { fetchMasterTokenFeed, getMasterCacheSize, type TokenData } from '@/lib/api/solana-token-feed'

export const revalidate = 0

// Known bonk.fun / LaunchLab identifiers
const BONK_IDENTIFIERS = {
  // Address suffix
  ADDRESS_SUFFIX: 'bonk',
  
  // DEX IDs that indicate bonk.fun
  DEX_IDS: ['launchlab', 'bonk', 'letsbonk', 'raydium-launchlab'],
  
  // Quote mints for bonk pools
  USD1_MINT: 'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB',
  WSOL_MINT: 'So11111111111111111111111111111111111111112',
  
  // LaunchLab program
  LAUNCHLAB_PROGRAM: 'LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj',
}

/**
 * Check if a token is a bonk.fun token
 */
function isBonkToken(token: TokenData): boolean {
  // 1. Check if address ends with "bonk" (case-insensitive)
  if (token.address.toLowerCase().endsWith('bonk')) {
    return true
  }
  
  // 2. Check DEX ID
  const dexId = token.dexId?.toLowerCase() || ''
  if (BONK_IDENTIFIERS.DEX_IDS.some(id => dexId.includes(id))) {
    return true
  }
  
  // 3. Check pair address for LaunchLab
  if (token.pairAddress?.includes(BONK_IDENTIFIERS.LAUNCHLAB_PROGRAM)) {
    return true
  }
  
  // 4. Check source for bonk indicators
  const source = token.source?.toLowerCase() || ''
  if (source.includes('bonk') || source.includes('launchlab')) {
    return true
  }
  
  return false
}

/**
 * Determine the pool type for a bonk token
 */
function getBonkPoolType(token: TokenData): 'bonk-usd1' | 'bonk-sol' | 'unknown' {
  // Check pair address or other indicators for USD1
  const pairInfo = (token.pairAddress || '').toLowerCase()
  const dexId = (token.dexId || '').toLowerCase()
  
  // If paired with USD1
  if (pairInfo.includes('usd1') || dexId.includes('usd1')) {
    return 'bonk-usd1'
  }
  
  // Default to SOL pair
  return 'bonk-sol'
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '50')
  const sort = (searchParams.get('sort') || 'new') as 'trending' | 'new' | 'volume' | 'gainers'
  const poolType = searchParams.get('pool') as 'bonk-usd1' | 'bonk-sol' | 'all' | null
  
  try {
    // Fetch from master feed with larger limit to filter
    const result = await fetchMasterTokenFeed({
      page: 1,
      limit: 500, // Get more to filter
      sort,
    })
    
    // Filter for bonk tokens only
    let bonkTokens = result.tokens.filter(isBonkToken)
    
    // Add pool type to each token
    bonkTokens = bonkTokens.map(token => ({
      ...token,
      bonkPoolType: getBonkPoolType(token),
    }))
    
    // Filter by pool type if specified
    if (poolType && poolType !== 'all') {
      bonkTokens = bonkTokens.filter(t => (t as any).bonkPoolType === poolType)
    }
    
    // Calculate bonk-specific trending score
    bonkTokens = bonkTokens.map(token => ({
      ...token,
      bonkTrendingScore: calculateBonkTrendingScore(token),
    }))
    
    // Sort by bonk trending score
    if (sort === 'trending') {
      bonkTokens.sort((a, b) => ((b as any).bonkTrendingScore || 0) - ((a as any).bonkTrendingScore || 0))
    }
    
    // Paginate
    const startIdx = (page - 1) * limit
    const pageTokens = bonkTokens.slice(startIdx, startIdx + limit)
    
    return NextResponse.json({
      success: true,
      data: pageTokens,
      count: pageTokens.length,
      total: bonkTokens.length,
      page,
      hasMore: startIdx + limit < bonkTokens.length,
      cacheSize: getMasterCacheSize(),
      filters: {
        poolType: poolType || 'all',
        sort,
      },
    })
  } catch (error) {
    console.error('[BONK1ST] Error fetching bonk tokens:', error)
    
    return NextResponse.json(
      { success: false, error: 'Failed to fetch bonk tokens', data: [] },
      { status: 500 }
    )
  }
}

/**
 * Calculate bonk-specific trending score
 * Prioritizes: new tokens, high activity, USD1 pairs
 */
function calculateBonkTrendingScore(token: TokenData): number {
  let score = token.trendingScore || 0
  
  // Boost for address ending with "bonk"
  if (token.address.toLowerCase().endsWith('bonk')) {
    score += 50
  }
  
  // Boost for USD1 pairs (more unique to bonk.fun)
  if ((token as any).bonkPoolType === 'bonk-usd1') {
    score += 30
  }
  
  // Boost for very new tokens (< 1 hour)
  const ageHours = (Date.now() - token.pairCreatedAt) / 3600000
  if (ageHours < 1) {
    score += 100
  } else if (ageHours < 6) {
    score += 50
  } else if (ageHours < 24) {
    score += 20
  }
  
  // Boost for high activity
  const txns5m = (token.txns5m?.buys || 0) + (token.txns5m?.sells || 0)
  if (txns5m > 50) {
    score += 40
  } else if (txns5m > 20) {
    score += 20
  }
  
  // Boost for buy pressure
  const buyRatio = txns5m > 0 ? (token.txns5m?.buys || 0) / txns5m : 0.5
  if (buyRatio > 0.7) {
    score += 30
  }
  
  return Math.round(score)
}

