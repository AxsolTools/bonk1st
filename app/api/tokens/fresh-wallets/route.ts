import { NextResponse } from 'next/server'
import { getLatestProfiles, getTokenPairs, getDexScreenerLogoUrl } from '@/lib/api/dexscreener'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// Mock fresh wallet detection (in production, this would use on-chain data analysis)
function generateFreshWalletAlert(token: {
  tokenAddress: string
  symbol: string
  name: string
  icon?: string
}) {
  const freshWalletCount = Math.floor(Math.random() * 50) + 5
  const bundleDetected = Math.random() > 0.7
  
  return {
    id: `${token.tokenAddress}-${Date.now()}`,
    tokenAddress: token.tokenAddress,
    tokenSymbol: token.symbol || 'UNKNOWN',
    tokenName: token.name || token.symbol || 'Unknown Token',
    logoURI: token.icon || getDexScreenerLogoUrl('solana', token.tokenAddress),
    freshWalletCount,
    totalBuyVolume: Math.random() * 50000 + 1000,
    bundleDetected,
    timestamp: new Date(Date.now() - Math.random() * 3600000).toISOString(),
    riskLevel: bundleDetected ? 'high' : freshWalletCount > 30 ? 'medium' : 'low' as 'low' | 'medium' | 'high',
  }
}

export async function GET() {
  try {
    // Get latest token profiles
    const latestProfiles = await getLatestProfiles()
    
    // Generate fresh wallet alerts for latest tokens
    const alerts = latestProfiles.slice(0, 10).map((profile) => {
      return generateFreshWalletAlert({
        tokenAddress: profile.tokenAddress,
        symbol: profile.tokenAddress.slice(0, 4).toUpperCase(),
        name: profile.description?.slice(0, 20) || 'New Token',
        icon: profile.icon,
      })
    })

    // Sort by timestamp (most recent first)
    alerts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    return NextResponse.json({
      success: true,
      alerts,
    })
  } catch (error) {
    console.error('Error fetching fresh wallet alerts:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch fresh wallet alerts', alerts: [] },
      { status: 500 }
    )
  }
}

