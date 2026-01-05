/**
 * DexScreener Updates API
 * Real-time endpoint for fetching latest DexScreener boosts and profiles for Solana tokens
 */

import { NextRequest, NextResponse } from "next/server"
import { fetchAllUpdates, fetchLatestBoosts, fetchLatestProfiles, getCacheStats } from "@/lib/dexscreener"

// In-memory store for SSE connections and last updates
const lastUpdates: Map<string, any> = new Map()
let lastFetchTime = 0
const CACHE_TTL = 3000 // 3 seconds cache

/**
 * GET - Fetch latest DexScreener updates
 * Query params:
 *   - type: 'all' | 'boosts' | 'profiles' (default: 'all')
 *   - limit: number (default: 20)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'all'
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50)

    // Check cache
    const now = Date.now()
    const cacheKey = `${type}_${limit}`
    
    if (now - lastFetchTime < CACHE_TTL && lastUpdates.has(cacheKey)) {
      return NextResponse.json({
        success: true,
        data: lastUpdates.get(cacheKey),
        cached: true,
        stats: getCacheStats(),
      })
    }

    // Fetch based on type
    let updates
    switch (type) {
      case 'boosts':
        updates = await fetchLatestBoosts()
        break
      case 'profiles':
        updates = await fetchLatestProfiles()
        break
      default:
        updates = await fetchAllUpdates()
    }

    // Limit results
    const limitedUpdates = updates.slice(0, limit)

    // Cache results
    lastUpdates.set(cacheKey, limitedUpdates)
    lastFetchTime = now

    return NextResponse.json({
      success: true,
      data: limitedUpdates,
      count: limitedUpdates.length,
      stats: getCacheStats(),
    })
  } catch (error) {
    console.error('[DEXSCREENER-API] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch DexScreener updates' },
      { status: 500 }
    )
  }
}

// Enable streaming responses
export const dynamic = 'force-dynamic'

