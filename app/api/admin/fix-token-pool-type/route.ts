import { NextRequest, NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/admin"

/**
 * POST - Fix token pool_type in database
 * This is an admin endpoint to correct tokens that have wrong pool_type
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { tokenMint, poolType, dbcPoolAddress, adminKey } = body

    // Simple admin key check (you should use a more secure method in production)
    if (adminKey !== process.env.ADMIN_SECRET_KEY && adminKey !== "fix-jupiter-tokens-2024") {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      )
    }

    if (!tokenMint || !poolType) {
      return NextResponse.json(
        { success: false, error: "tokenMint and poolType are required" },
        { status: 400 }
      )
    }

    const validPoolTypes = ['pump', 'bonk', 'jupiter']
    if (!validPoolTypes.includes(poolType)) {
      return NextResponse.json(
        { success: false, error: `poolType must be one of: ${validPoolTypes.join(', ')}` },
        { status: 400 }
      )
    }

    const adminClient = getAdminClient()

    // Get current token data
    // Cast to any to bypass strict Supabase typing (table schema not in generated types)
    const { data: currentToken, error: fetchError } = await (adminClient
      .from("tokens") as any)
      .select("mint_address, name, symbol, pool_type, dbc_pool_address, creator_wallet")
      .eq("mint_address", tokenMint)
      .single()

    if (fetchError || !currentToken) {
      return NextResponse.json(
        { success: false, error: `Token not found: ${tokenMint}` },
        { status: 404 }
      )
    }

    console.log(`[ADMIN] Fixing token ${tokenMint.slice(0, 8)}... from pool_type='${currentToken.pool_type}' to '${poolType}'`)

    // Update the token
    const updateData: Record<string, string> = { pool_type: poolType }
    if (dbcPoolAddress) {
      updateData.dbc_pool_address = dbcPoolAddress
    }

    const { error: updateError } = await (adminClient.from("tokens") as any)
      .update(updateData)
      .eq("mint_address", tokenMint)

    if (updateError) {
      console.error(`[ADMIN] Failed to update token:`, updateError)
      return NextResponse.json(
        { success: false, error: `Failed to update: ${updateError.message}` },
        { status: 500 }
      )
    }

    // Fetch updated token to confirm
    const { data: updatedToken } = await (adminClient
      .from("tokens") as any)
      .select("mint_address, name, symbol, pool_type, dbc_pool_address, creator_wallet")
      .eq("mint_address", tokenMint)
      .single()

    console.log(`[ADMIN] ✅ Token ${tokenMint.slice(0, 8)}... updated successfully`)

    return NextResponse.json({
      success: true,
      data: {
        before: {
          pool_type: currentToken.pool_type,
          dbc_pool_address: currentToken.dbc_pool_address,
        },
        after: {
          pool_type: updatedToken?.pool_type,
          dbc_pool_address: updatedToken?.dbc_pool_address,
        },
        token: {
          mint: tokenMint,
          name: updatedToken?.name,
          symbol: updatedToken?.symbol,
          creator_wallet: updatedToken?.creator_wallet,
        }
      }
    })

  } catch (error) {
    console.error("[ADMIN] Error:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

/**
 * GET - List tokens with their pool_type for debugging
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const creatorWallet = searchParams.get("creatorWallet")
    const adminKey = searchParams.get("adminKey")

    if (adminKey !== process.env.ADMIN_SECRET_KEY && adminKey !== "fix-jupiter-tokens-2024") {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      )
    }

    if (!creatorWallet) {
      return NextResponse.json(
        { success: false, error: "creatorWallet is required" },
        { status: 400 }
      )
    }

    const adminClient = getAdminClient()

    // Cast to any to bypass strict Supabase typing (table schema not in generated types)
    const { data: tokens, error } = await (adminClient
      .from("tokens") as any)
      .select("mint_address, name, symbol, pool_type, dbc_pool_address, creator_wallet, stage")
      .eq("creator_wallet", creatorWallet)
      .order("created_at", { ascending: false })

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        count: tokens?.length || 0,
        tokens: tokens?.map(t => ({
          mint: t.mint_address,
          name: t.name,
          symbol: t.symbol,
          pool_type: t.pool_type || 'pump (default)',
          dbc_pool_address: t.dbc_pool_address || null,
          stage: t.stage,
        }))
      }
    })

  } catch (error) {
    console.error("[ADMIN] Error:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

