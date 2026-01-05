import { NextResponse } from 'next/server'
import { fetchMasterTokenFeed, getMasterCacheSize, type TokenData } from '@/lib/api/solana-token-feed'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  
  // Parse params - NO artificial limits
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '100')
  
  try {
    // Get tokens sorted by trending score
    const result = await fetchMasterTokenFeed({
      page,
      limit,
      sort: 'trending',
    })
    
    // Apply enhanced trending scoring for this endpoint
    const enhancedTokens = result.tokens.map(token => ({
      ...token,
      trendingScore: calculateEnhancedTrendingScore(token),
    }))
    
    // Re-sort by enhanced score
    enhancedTokens.sort((a, b) => (b.trendingScore || 0) - (a.trendingScore || 0))
    
    return NextResponse.json({
      success: true,
      data: enhancedTokens,
      count: enhancedTokens.length,
      total: result.total,
      page,
      hasMore: result.hasMore,
      cacheSize: getMasterCacheSize(),
    })
  } catch (error) {
    console.error('Error fetching trending tokens:', error)
    
    return NextResponse.json(
      { success: false, error: 'Failed to fetch trending tokens', data: [] },
      { status: 500 }
    )
  }
}

function calculateEnhancedTrendingScore(token: TokenData): number {
  let score = token.trendingScore || 0
  
  // Boost for very recent high activity
  const txns5m = (token.txns5m?.buys || 0) + (token.txns5m?.sells || 0)
  if (txns5m > 50) score += 100
  else if (txns5m > 20) score += 50
  else if (txns5m > 10) score += 25
  
  // Volume spike detection
  const avgHourlyVol = token.volume24h / 24
  if (token.volume1h > avgHourlyVol * 5) score += 80
  else if (token.volume1h > avgHourlyVol * 3) score += 40
  else if (token.volume1h > avgHourlyVol * 2) score += 20
  
  // Price momentum multiplier
  if (token.priceChange5m > 10) score *= 1.5
  else if (token.priceChange5m > 5) score *= 1.3
  else if (token.priceChange5m < -20) score *= 0.5
  
  // Fresh token bonus
  const ageMinutes = (Date.now() - token.pairCreatedAt) / 60000
  if (ageMinutes < 10) score += 150
  else if (ageMinutes < 30) score += 100
  else if (ageMinutes < 60) score += 50
  
  return Math.round(score)
}
