import { NextResponse } from 'next/server'
import { getTrendingTokens, getDexScreenerLogoUrl } from '@/lib/api/dexscreener'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const trendingPairs = await getTrendingTokens()

    // Calculate volume to MC ratio and filter for gems
    const gems = trendingPairs
      .filter((pair) => pair.marketCap > 0 && pair.volume?.h24 > 0)
      .map((pair) => {
        const volumeToMC = pair.volume.h24 / pair.marketCap
        const daysActive = pair.pairCreatedAt 
          ? Math.floor((Date.now() - pair.pairCreatedAt) / 86400000)
          : 0

        return {
          address: pair.baseToken.address,
          symbol: pair.baseToken.symbol,
          name: pair.baseToken.name,
          logoURI: pair.info?.imageUrl || getDexScreenerLogoUrl('solana', pair.baseToken.address),
          volume24h: pair.volume.h24,
          marketCap: pair.marketCap,
          volumeToMC,
          daysActive,
          trend: pair.priceChange?.h24 >= 0 ? 'up' : 'down',
          priceChange24h: pair.priceChange?.h24 || 0,
          liquidity: pair.liquidity?.usd || 0,
        }
      })
      .filter((gem) => gem.volumeToMC >= 0.5) // At least 50% volume to MC ratio
      .sort((a, b) => b.volumeToMC - a.volumeToMC)
      .slice(0, 10)

    return NextResponse.json({
      success: true,
      gems,
    })
  } catch (error) {
    console.error('Error fetching volume gems:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch volume gems', gems: [] },
      { status: 500 }
    )
  }
}

