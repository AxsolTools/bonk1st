/**
 * AQUA Launchpad - Wallet Balance API
 * Gets real-time wallet balance via RPC
 */

import { NextRequest, NextResponse } from "next/server"
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js"

const HELIUS_RPC = process.env.HELIUS_RPC_URL || "https://api.mainnet-beta.solana.com"
const connection = new Connection(HELIUS_RPC, "confirmed")

// GET - Get wallet balance
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get("address")

    if (!walletAddress) {
      return NextResponse.json(
        { error: "address is required" },
        { status: 400 }
      )
    }

    // Validate the address
    let publicKey: PublicKey
    try {
      publicKey = new PublicKey(walletAddress)
    } catch {
      return NextResponse.json(
        { error: "Invalid wallet address" },
        { status: 400 }
      )
    }

    // Get balance in lamports
    const balanceLamports = await connection.getBalance(publicKey)
    const balanceSol = balanceLamports / LAMPORTS_PER_SOL

    // Get SOL price for USD conversion
    let solPriceUsd = 0
    try {
      const priceResponse = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/price/sol`
      )
      const priceData = await priceResponse.json()
      solPriceUsd = priceData.data?.price || 0
    } catch {
      // Fallback - continue without USD price
    }

    const balanceUsd = balanceSol * solPriceUsd

    return NextResponse.json({
      success: true,
      data: {
        address: walletAddress,
        balanceLamports,
        balanceSol: Number(balanceSol.toFixed(9)),
        balanceUsd: Number(balanceUsd.toFixed(2)),
        solPriceUsd,
      },
    })
  } catch (error) {
    console.error("[BALANCE] GET error:", error)
    return NextResponse.json(
      { error: "Failed to get wallet balance" },
      { status: 500 }
    )
  }
}

// POST - Get balances for multiple wallets
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { addresses } = body

    if (!addresses || !Array.isArray(addresses) || addresses.length === 0) {
      return NextResponse.json(
        { error: "addresses array is required" },
        { status: 400 }
      )
    }

    if (addresses.length > 100) {
      return NextResponse.json(
        { error: "Maximum 100 addresses per request" },
        { status: 400 }
      )
    }

    // Get SOL price once
    let solPriceUsd = 0
    try {
      const priceResponse = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/price/sol`
      )
      const priceData = await priceResponse.json()
      solPriceUsd = priceData.data?.price || 0
    } catch {
      // Fallback - continue without USD price
    }

    // Fetch all balances in parallel
    const balances = await Promise.all(
      addresses.map(async (address: string) => {
        try {
          const publicKey = new PublicKey(address)
          const balanceLamports = await connection.getBalance(publicKey)
          const balanceSol = balanceLamports / LAMPORTS_PER_SOL
          const balanceUsd = balanceSol * solPriceUsd

          return {
            address,
            balanceLamports,
            balanceSol: Number(balanceSol.toFixed(9)),
            balanceUsd: Number(balanceUsd.toFixed(2)),
            error: null,
          }
        } catch (error) {
          return {
            address,
            balanceLamports: 0,
            balanceSol: 0,
            balanceUsd: 0,
            error: error instanceof Error ? error.message : "Unknown error",
          }
        }
      })
    )

    const totalSol = balances.reduce((sum, b) => sum + b.balanceSol, 0)
    const totalUsd = balances.reduce((sum, b) => sum + b.balanceUsd, 0)

    return NextResponse.json({
      success: true,
      data: {
        balances,
        totalSol: Number(totalSol.toFixed(9)),
        totalUsd: Number(totalUsd.toFixed(2)),
        solPriceUsd,
      },
    })
  } catch (error) {
    console.error("[BALANCE] POST error:", error)
    return NextResponse.json(
      { error: "Failed to get wallet balances" },
      { status: 500 }
    )
  }
}

