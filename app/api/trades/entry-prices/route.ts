/**
 * Entry Prices API - Calculate average entry price for multiple wallets
 * Used for PNL calculation
 */

import { NextRequest, NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/admin"

export async function POST(request: NextRequest) {
  try {
    const { addresses, tokenMint } = await request.json()

    if (!addresses || !Array.isArray(addresses) || addresses.length === 0) {
      return NextResponse.json(
        { success: false, error: "No addresses provided" },
        { status: 400 }
      )
    }

    if (!tokenMint) {
      return NextResponse.json(
        { success: false, error: "No token mint provided" },
        { status: 400 }
      )
    }

    const adminClient = getAdminClient()
    const entryPrices: Record<string, number> = {}

    // Batch fetch trades for all wallets
    // Cast to any to bypass strict Supabase typing (table schema not in generated types)
    const { data: trades, error } = await (adminClient
      .from("trades") as any)
      .select("wallet_address, trade_type, amount_sol, token_amount")
      .in("wallet_address", addresses)
      .eq("token_address", tokenMint)
      .eq("status", "confirmed")
      .order("created_at", { ascending: true })

    if (error) {
      console.error("[ENTRY-PRICES] Database error:", error)
      // Return zeros for all wallets on error
      for (const addr of addresses) {
        entryPrices[addr] = 0
      }
      return NextResponse.json({ success: true, entryPrices })
    }

    // Group trades by wallet and calculate entry price
    const walletTrades = new Map<string, { totalSpent: number; totalTokens: number }>()

    for (const trade of trades || []) {
      const existing = walletTrades.get(trade.wallet_address) || { totalSpent: 0, totalTokens: 0 }
      
      if (trade.trade_type === "buy") {
        existing.totalSpent += trade.amount_sol || 0
        existing.totalTokens += trade.token_amount || 0
      } else if (trade.trade_type === "sell") {
        // For sells, we reduce the position (FIFO)
        const sellRatio = trade.token_amount && existing.totalTokens > 0
          ? trade.token_amount / existing.totalTokens
          : 0
        existing.totalSpent *= (1 - sellRatio)
        existing.totalTokens -= trade.token_amount || 0
      }
      
      walletTrades.set(trade.wallet_address, existing)
    }

    // Calculate entry prices
    for (const addr of addresses) {
      const walletData = walletTrades.get(addr)
      
      if (walletData && walletData.totalTokens > 0) {
        entryPrices[addr] = walletData.totalSpent / walletData.totalTokens
      } else {
        entryPrices[addr] = 0
      }
    }

    return NextResponse.json({
      success: true,
      entryPrices,
      fetchedAt: Date.now(),
    })
  } catch (error) {
    console.error("[ENTRY-PRICES] Error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to calculate entry prices" },
      { status: 500 }
    )
  }
}

