/**
 * AQUA Launchpad - Trending Profiles API
 * Manages promoted/trending token profiles
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - Get trending profiles
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get("limit") || "10")
    const includeExpired = searchParams.get("include_expired") === "true"

    let query = supabase
      .from("trending_profiles")
      .select("*")
      .eq("is_active", true)
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit)

    // Exclude expired profiles by default
    if (!includeExpired) {
      query = query.or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({
      success: true,
      data: {
        profiles: data || [],
        count: data?.length || 0,
      },
    })
  } catch (error) {
    console.error("[TRENDING] GET error:", error)
    return NextResponse.json(
      { error: "Failed to get trending profiles" },
      { status: 500 }
    )
  }
}

// POST - Create a trending profile (requires SOL payment)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      token_address,
      wallet_address,
      token_name,
      token_symbol,
      token_image,
      banner_url,
      description,
      website,
      twitter,
      telegram,
      discord,
      tx_signature,
      amount_paid,
      duration_days = 7,
    } = body

    if (!token_address || !wallet_address) {
      return NextResponse.json(
        { error: "token_address and wallet_address are required" },
        { status: 400 }
      )
    }

    // Calculate expiration
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + duration_days)

    // Calculate priority based on amount paid
    const priority = Math.floor(Number(amount_paid || 0) * 100)

    // Insert the trending profile
    const { data, error } = await supabase
      .from("trending_profiles")
      .insert({
        token_address,
        wallet_address,
        token_name,
        token_symbol,
        token_image,
        banner_url,
        description,
        website,
        twitter,
        telegram,
        discord,
        tx_signature,
        amount_paid: Number(amount_paid || 0),
        priority,
        is_active: true,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error("[TRENDING] POST error:", error)
    return NextResponse.json(
      { error: "Failed to create trending profile" },
      { status: 500 }
    )
  }
}

// PATCH - Update a trending profile
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { profile_id, wallet_address, ...updates } = body

    if (!profile_id || !wallet_address) {
      return NextResponse.json(
        { error: "profile_id and wallet_address are required" },
        { status: 400 }
      )
    }

    // Verify ownership
    const { data: profile, error: fetchError } = await supabase
      .from("trending_profiles")
      .select("wallet_address")
      .eq("id", profile_id)
      .single()

    if (fetchError || !profile) {
      return NextResponse.json(
        { error: "Profile not found" },
        { status: 404 }
      )
    }

    if (profile.wallet_address !== wallet_address) {
      return NextResponse.json(
        { error: "Not authorized to update this profile" },
        { status: 403 }
      )
    }

    // Update allowed fields only
    const allowedFields = [
      "token_name",
      "token_symbol",
      "token_image",
      "banner_url",
      "description",
      "website",
      "twitter",
      "telegram",
      "discord",
      "is_active",
    ]

    const sanitizedUpdates: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        sanitizedUpdates[key] = value
      }
    }

    sanitizedUpdates.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from("trending_profiles")
      .update(sanitizedUpdates)
      .eq("id", profile_id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error("[TRENDING] PATCH error:", error)
    return NextResponse.json(
      { error: "Failed to update trending profile" },
      { status: 500 }
    )
  }
}

// DELETE - Deactivate a trending profile
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const profileId = searchParams.get("profile_id")
    const walletAddress = searchParams.get("wallet_address")

    if (!profileId || !walletAddress) {
      return NextResponse.json(
        { error: "profile_id and wallet_address are required" },
        { status: 400 }
      )
    }

    // Verify ownership
    const { data: profile, error: fetchError } = await supabase
      .from("trending_profiles")
      .select("wallet_address")
      .eq("id", profileId)
      .single()

    if (fetchError || !profile) {
      return NextResponse.json(
        { error: "Profile not found" },
        { status: 404 }
      )
    }

    if (profile.wallet_address !== walletAddress) {
      return NextResponse.json(
        { error: "Not authorized to delete this profile" },
        { status: 403 }
      )
    }

    // Soft delete by setting is_active to false
    const { error } = await supabase
      .from("trending_profiles")
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profileId)

    if (error) throw error

    return NextResponse.json({
      success: true,
      message: "Trending profile deactivated",
    })
  } catch (error) {
    console.error("[TRENDING] DELETE error:", error)
    return NextResponse.json(
      { error: "Failed to deactivate trending profile" },
      { status: 500 }
    )
  }
}

