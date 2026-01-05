/**
 * AQUA Launchpad - Wallet Remove API
 * 
 * Allows users to remove (delete) a non-primary wallet from their account
 * Primary/main wallet cannot be removed
 */

import { NextRequest, NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/admin"

export async function DELETE(request: NextRequest) {
  try {
    // Get auth headers
    const sessionId = request.headers.get("x-session-id")

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: { code: 1001, message: "Authentication required" } },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { walletId } = body

    if (!walletId) {
      return NextResponse.json(
        { success: false, error: { code: 4002, message: "Wallet ID required" } },
        { status: 400 }
      )
    }

    const adminClient = getAdminClient()

    // Verify wallet belongs to session and is not primary
    // Cast to any to bypass strict Supabase typing (table schema not in generated types)
    const { data: wallet, error: walletError } = await (adminClient
      .from("wallets") as any)
      .select("id, is_primary, public_key")
      .eq("session_id", sessionId)
      .eq("id", walletId)
      .single()

    if (walletError || !wallet) {
      return NextResponse.json(
        { success: false, error: { code: 1003, message: "Wallet not found or unauthorized" } },
        { status: 403 }
      )
    }

    if (wallet.is_primary) {
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            code: 4003, 
            message: "Cannot remove primary wallet. Set another wallet as primary first." 
          } 
        },
        { status: 400 }
      )
    }

    // Delete the wallet
    const { error: deleteError } = await adminClient
      .from("wallets")
      .delete()
      .eq("id", walletId)
      .eq("session_id", sessionId)

    if (deleteError) {
      throw deleteError
    }

    console.log(`[WALLET] Removed wallet ${wallet.public_key} for session ${sessionId.slice(0, 8)}...`)

    return NextResponse.json({
      success: true,
      data: {
        removedWalletId: walletId,
        removedAddress: wallet.public_key,
      },
    })
  } catch (error) {
    console.error("[WALLET] Remove error:", error)
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 4000,
          message: "Failed to remove wallet",
          details: error instanceof Error ? error.message : "Unknown error",
        },
      },
      { status: 500 }
    )
  }
}

