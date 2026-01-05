import { NextResponse } from 'next/server'
import { fetchMasterTokenFeed, getMasterCacheSize } from '@/lib/api/solana-token-feed'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  
  // Parse params - NO artificial limits
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '100')
  const sort = (searchParams.get('sort') || 'trending') as 'trending' | 'new' | 'volume' | 'gainers' | 'losers' | 'buy_signal' | 'risk' | 'prepump'
  
  // bonk.fun filtering
  const bonkOnly = searchParams.get('bonk') === 'true'
  const poolType = (searchParams.get('pool') || 'all') as 'bonk-usd1' | 'bonk-sol' | 'all'
  
  try {
    const result = await fetchMasterTokenFeed({
      page,
      limit,
      sort,
      bonkOnly,
      poolType,
    })
    
    return NextResponse.json({
      success: true,
      data: result.tokens,
      count: result.tokens.length,
      total: result.total,
      page,
      hasMore: result.hasMore,
      sources: result.sources,
      cacheSize: getMasterCacheSize(),
      fetchTime: result.fetchTime,
      filters: {
        bonkOnly,
        poolType,
        sort,
      },
    })
  } catch (error) {
    console.error('Error fetching live tokens:', error)
    
    return NextResponse.json(
      { success: false, error: 'Failed to fetch tokens', data: [] },
      { status: 500 }
    )
  }
}
