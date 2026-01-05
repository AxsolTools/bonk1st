/**
 * AQUA Launchpad - Watchlist API
 * Manages user watchlists for tokens
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Helper to get session ID
async function getSessionId(request: NextRequest): Promise<string | null> {
  // Try from Authorization header
  const authHeader = request.headers.get("authorization")
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7)
  }

  // Try from cookies
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get("aqua_user_id")
  return sessionCookie?.value || null
}

// GET - Get user's watchlist
export async function GET(request: NextRequest) {
  try {
    const sessionId = await getSessionId(request)
    const { searchParams } = new URL(request.url)
    const tokenAddress = searchParams.get("token_address")

    if (!sessionId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      )
    }

    // Check if specific token is in watchlist
    if (tokenAddress) {
      const { data, error } = await supabase
        .from("watchlist")
        .select("id")
        .eq("session_id", sessionId)
        .eq("token_address", tokenAddress)
        .single()

      return NextResponse.json({
        success: true,
        data: {
          isWatchlisted: !!data && !error,
        },
      })
    }

    // Get full watchlist with token details
    const { data: watchlist, error } = await supabase
      .from("watchlist")
      .select(`
        id,
        token_address,
        created_at,
        tokens:token_id (
          id,
          name,
          symbol,
          image_url,
          price_sol,
          price_usd,
          market_cap,
          market_cap_usd,
          volume_24h,
          change_24h,
          bonding_curve_progress
        )
      `)
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })

    if (error) throw error

    return NextResponse.json({
      success: true,
      data: {
        watchlist: watchlist || [],
        count: watchlist?.length || 0,
      },
    })
  } catch (error) {
    console.error("[WATCHLIST] GET error:", error)
    return NextResponse.json(
      { error: "Failed to get watchlist" },
      { status: 500 }
    )
  }
}

// POST - Add token to watchlist
export async function POST(request: NextRequest) {
  try {
    const sessionId = await getSessionId(request)

    if (!sessionId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { token_address, token_id } = body

    if (!token_address) {
      return NextResponse.json(
        { error: "token_address is required" },
        { status: 400 }
      )
    }

    // Check if already in watchlist
    const { data: existing } = await supabase
      .from("watchlist")
      .select("id")
      .eq("session_id", sessionId)
      .eq("token_address", token_address)
      .single()

    if (existing) {
      return NextResponse.json({
        success: true,
        data: {
          message: "Already in watchlist",
          isWatchlisted: true,
        },
      })
    }

    // Add to watchlist
    const { data, error } = await supabase
      .from("watchlist")
      .insert({
        session_id: sessionId,
        token_address,
        token_id,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({
      success: true,
      data: {
        watchlistItem: data,
        isWatchlisted: true,
      },
    })
  } catch (error) {
    console.error("[WATCHLIST] POST error:", error)
    return NextResponse.json(
      { error: "Failed to add to watchlist" },
      { status: 500 }
    )
  }
}

// DELETE - Remove token from watchlist
export async function DELETE(request: NextRequest) {
  try {
    const sessionId = await getSessionId(request)
    const { searchParams } = new URL(request.url)
    const tokenAddress = searchParams.get("token_address")

    if (!sessionId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      )
    }

    if (!tokenAddress) {
      return NextResponse.json(
        { error: "token_address is required" },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from("watchlist")
      .delete()
      .eq("session_id", sessionId)
      .eq("token_address", tokenAddress)

    if (error) throw error

    return NextResponse.json({
      success: true,
      data: {
        isWatchlisted: false,
      },
    })
  } catch (error) {
    console.error("[WATCHLIST] DELETE error:", error)
    return NextResponse.json(
      { error: "Failed to remove from watchlist" },
      { status: 500 }
    )
  }
}

