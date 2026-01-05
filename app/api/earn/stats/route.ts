/**
 * Earn Stats API - Returns aggregated platform-wide Earn metrics
 * Used by the Earn ticker component for real-time stats display
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// PROPEL token mint from environment
const PROPEL_MINT = process.env.PROPEL_TOKEN_MINT || process.env.NEXT_PUBLIC_PROPEL_TOKEN_MINT || ''

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Fetch global stats
    const { data: stats, error: statsError } = await supabase
      .from('earn_stats')
      .select('*')
      .eq('id', 'global')
      .single()
    
    if (statsError && statsError.code !== 'PGRST116') {
      console.error('[EARN-STATS] Stats fetch error:', statsError)
    }
    
    // Fetch vault data for live APY calculation
    let avgApy = stats?.avg_apy || 0
    let vaultCount = 0
    
    try {
      const vaultsResponse = await fetch('https://api.jup.ag/lend/v1/earn/tokens', {
        headers: {
          'Accept': 'application/json',
        },
        next: { revalidate: 60 }, // Cache for 60 seconds
      })
      
      if (vaultsResponse.ok) {
        const vaultsData = await vaultsResponse.json()
        if (Array.isArray(vaultsData) && vaultsData.length > 0) {
          // Calculate weighted average APY based on TVL
          let totalTvl = 0
          let weightedApy = 0
          
          vaultsData.forEach((vault: any) => {
            const apy = vault.apy || 0
            const tvl = vault.tvlUsd || 0
            weightedApy += apy * tvl
            totalTvl += tvl
          })
          
          avgApy = totalTvl > 0 ? weightedApy / totalTvl : 0
          vaultCount = vaultsData.length
        }
      }
    } catch (err) {
      console.debug('[EARN-STATS] Failed to fetch live APY:', err)
    }
    
    // Fetch unique user count
    const { count: uniqueUsers } = await supabase
      .from('earn_activity')
      .select('wallet_address', { count: 'exact', head: true })
    
    // Fetch 24h activity count
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count: activity24h } = await supabase
      .from('earn_activity')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', twentyFourHoursAgo)
    
    // Build response with defaults if no stats exist yet
    const response = {
      // TVL
      totalTvlUsd: stats?.total_tvl_usd || 0,
      tvlUsdc: stats?.tvl_usdc || 0,
      tvlSol: stats?.tvl_sol || 0,
      
      // PROPEL metrics
      totalPropelDeposited: stats?.total_propel_deposited || 0,
      totalPropelDepositedUsd: stats?.total_propel_deposited_usd || 0,
      propelMint: PROPEL_MINT,
      
      // Earnings
      totalYieldEarnedUsd: stats?.total_yield_earned_usd || 0,
      totalYieldEarnedUsdc: stats?.total_yield_earned_usdc || 0,
      totalYieldEarnedSol: stats?.total_yield_earned_sol || 0,
      
      // Positions
      activePositions: stats?.active_positions || 0,
      totalUniqueUsers: uniqueUsers || stats?.total_unique_users || 0,
      
      // Volume
      volume24hUsd: stats?.volume_24h_usd || 0,
      volume7dUsd: stats?.volume_7d_usd || 0,
      volume30dUsd: stats?.volume_30d_usd || 0,
      
      // APY
      avgApy: avgApy * 100, // Convert to percentage
      vaultCount,
      
      // Activity
      activity24h: activity24h || 0,
      
      // Metadata
      lastUpdated: stats?.last_updated || new Date().toISOString(),
    }
    
    return NextResponse.json({
      success: true,
      data: response,
    })
    
  } catch (error) {
    console.error('[EARN-STATS] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch earn stats' },
      { status: 500 }
    )
  }
}

