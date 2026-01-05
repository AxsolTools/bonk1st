/**
 * Earn Activity API - Returns recent Earn activity for the live feed
 * Used by the Earn ticker component for real-time activity display
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50)
    const offset = parseInt(searchParams.get('offset') || '0')
    const activityType = searchParams.get('type') // 'deposit', 'withdraw', 'claim', or null for all
    
    const supabase = await createClient()
    
    // Build query
    let query = supabase
      .from('earn_activity')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
    
    // Filter by activity type if specified
    if (activityType && ['deposit', 'withdraw', 'claim'].includes(activityType)) {
      query = query.eq('activity_type', activityType)
    }
    
    const { data: activities, error } = await query
    
    if (error) {
      console.error('[EARN-ACTIVITY] Fetch error:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch activity' },
        { status: 500 }
      )
    }
    
    // Format activities for display
    const formattedActivities = (activities || []).map(activity => ({
      id: activity.id,
      type: activity.activity_type,
      walletAddress: activity.wallet_address,
      walletShort: `${activity.wallet_address.slice(0, 4)}...${activity.wallet_address.slice(-4)}`,
      vaultSymbol: activity.vault_symbol,
      assetSymbol: activity.asset_symbol,
      propelAmount: activity.propel_amount,
      underlyingAmount: activity.underlying_amount,
      usdValue: activity.usd_value,
      txSignature: activity.tx_signature,
      createdAt: activity.created_at,
      // Human-readable time
      timeAgo: getTimeAgo(new Date(activity.created_at)),
    }))
    
    return NextResponse.json({
      success: true,
      data: {
        activities: formattedActivities,
        hasMore: activities?.length === limit,
      },
    })
    
  } catch (error) {
    console.error('[EARN-ACTIVITY] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch activity' },
      { status: 500 }
    )
  }
}

// Helper function to format time ago
function getTimeAgo(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)
  
  if (diffSec < 60) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHour < 24) return `${diffHour}h ago`
  if (diffDay < 7) return `${diffDay}d ago`
  return date.toLocaleDateString()
}

/**
 * POST - Log new earn activity
 * Called internally by deposit/withdraw APIs
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      userId,
      walletAddress,
      activityType,
      vaultSymbol,
      vaultAddress,
      assetSymbol,
      propelAmount,
      underlyingAmount,
      sharesAmount,
      usdValue,
      txSignature,
    } = body
    
    // Validate required fields
    if (!walletAddress || !activityType || !vaultSymbol || !assetSymbol) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }
    
    if (!['deposit', 'withdraw', 'claim'].includes(activityType)) {
      return NextResponse.json(
        { success: false, error: 'Invalid activity type' },
        { status: 400 }
      )
    }
    
    const supabase = await createClient()
    
    const { data, error } = await supabase
      .from('earn_activity')
      .insert({
        user_id: userId || null,
        wallet_address: walletAddress,
        activity_type: activityType,
        vault_symbol: vaultSymbol,
        vault_address: vaultAddress || null,
        asset_symbol: assetSymbol,
        propel_amount: propelAmount || 0,
        underlying_amount: underlyingAmount || 0,
        shares_amount: sharesAmount || 0,
        usd_value: usdValue || 0,
        tx_signature: txSignature || null,
      })
      .select('id')
      .single()
    
    if (error) {
      console.error('[EARN-ACTIVITY] Insert error:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to log activity' },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      success: true,
      data: { activityId: data.id },
    })
    
  } catch (error) {
    console.error('[EARN-ACTIVITY] POST Error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to log activity' },
      { status: 500 }
    )
  }
}

