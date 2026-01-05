/**
 * AQUA Launchpad - Anti-Sniper Events API
 * 
 * Retrieves anti-sniper events and history for a token.
 * 
 * GET /api/token22/anti-sniper/events?tokenMint=xxx&limit=10
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  try {
    const sessionId = request.headers.get('x-session-id')
    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: { code: 1001, message: 'Session required' } },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const tokenMint = searchParams.get('tokenMint')
    const limit = parseInt(searchParams.get('limit') || '10')

    if (!tokenMint) {
      return NextResponse.json(
        { success: false, error: { code: 4001, message: 'tokenMint required' } },
        { status: 400 }
      )
    }

    const adminClient = getAdminClient()

    // Fetch events for this token
    // Cast to any to bypass strict Supabase typing (table schema not in generated types)
    const { data: events, error } = await (adminClient
      .from('anti_sniper_events') as any)
      .select('*')
      .eq('token_mint', tokenMint)
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('[ANTI-SNIPER-EVENTS] Query error:', error)
      return NextResponse.json(
        { success: false, error: { code: 5001, message: 'Failed to fetch events' } },
        { status: 500 }
      )
    }

    // Transform to frontend format
    const transformedEvents = (events || []).map((event: any) => ({
      id: event.id,
      tokenMint: event.token_mint,
      eventType: event.event_type,
      triggerTrade: event.trigger_trade,
      walletsSold: event.wallets_sold,
      totalTokensSold: event.total_tokens_sold,
      totalSolReceived: event.total_sol_received,
      results: event.results,
      timestamp: new Date(event.created_at).getTime(),
    }))

    return NextResponse.json({
      success: true,
      data: {
        events: transformedEvents,
        count: transformedEvents.length,
      },
    })

  } catch (error) {
    console.error('[ANTI-SNIPER-EVENTS] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 5001,
          message: error instanceof Error ? error.message : 'Failed to fetch events',
        },
      },
      { status: 500 }
    )
  }
}

