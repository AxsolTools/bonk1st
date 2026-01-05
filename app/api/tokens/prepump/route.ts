/**
 * Pre-Pump Signals API
 * Returns tokens showing pre-pump patterns based on:
 * - Fresh wallet influx rate
 * - Wallet velocity patterns (coordinated wallets)
 * - Transaction clustering
 * - Bonding curve velocity
 * - Sell absence
 * - Buy size distribution shifts
 */

import { NextResponse } from 'next/server'
import { 
  getHighSignalTokens, 
  calculatePrePumpSignal,
  getCachedSignal,
  getEngineStats,
  type PrePumpSignal 
} from '@/lib/api/prepump-engine'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  
  // Get params
  const minScore = parseInt(searchParams.get('minScore') || '50')
  const tokenAddress = searchParams.get('token')
  const limit = parseInt(searchParams.get('limit') || '20')
  
  try {
    // If specific token requested, return its signal
    if (tokenAddress) {
      const signal = calculatePrePumpSignal(tokenAddress)
      
      if (!signal) {
        return NextResponse.json({
          success: false,
          error: 'No data for this token yet. Webhook data needed.',
          token: tokenAddress,
        })
      }
      
      return NextResponse.json({
        success: true,
        signal,
      })
    }
    
    // Otherwise return all high-signal tokens
    const signals = getHighSignalTokens(minScore)
    const stats = getEngineStats()
    
    return NextResponse.json({
      success: true,
      signals: signals.slice(0, limit),
      count: signals.length,
      stats: {
        walletsTracked: stats.walletsTracked,
        tokensTracked: stats.tokensTracked,
        signalsCached: stats.signalsCached,
      },
      minScore,
    })
  } catch (error) {
    console.error('[PREPUMP API] Error:', error)
    
    return NextResponse.json(
      { success: false, error: 'Failed to get pre-pump signals', signals: [] },
      { status: 500 }
    )
  }
}

