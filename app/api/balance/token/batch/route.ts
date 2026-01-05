/**
 * Batch Token Balance API - Fetch token balances for multiple wallets
 * Uses getMultipleAccountsInfo on token accounts for efficiency
 */

import { NextRequest, NextResponse } from "next/server"
import { Connection, PublicKey } from "@solana/web3.js"
import { getAssociatedTokenAddressSync, AccountLayout } from "@solana/spl-token"

const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL || "https://api.mainnet-beta.solana.com"

export async function POST(request: NextRequest) {
  try {
    const { addresses, mint } = await request.json()

    if (!addresses || !Array.isArray(addresses) || addresses.length === 0) {
      return NextResponse.json(
        { success: false, error: "No addresses provided" },
        { status: 400 }
      )
    }

    if (!mint) {
      return NextResponse.json(
        { success: false, error: "No mint address provided" },
        { status: 400 }
      )
    }

    // Limit batch size
    const limitedAddresses = addresses.slice(0, 20)
    
    const connection = new Connection(HELIUS_RPC_URL, "confirmed")
    const mintPubkey = new PublicKey(mint)
    
    // Get associated token addresses for all wallets
    const tokenAddresses: { wallet: string; ata: PublicKey }[] = []
    
    for (const addr of limitedAddresses) {
      try {
        const walletPubkey = new PublicKey(addr)
        const ata = getAssociatedTokenAddressSync(mintPubkey, walletPubkey)
        tokenAddresses.push({ wallet: addr, ata })
      } catch {
        // Invalid address, skip
      }
    }

    // Batch fetch all token account info
    const accountInfos = await connection.getMultipleAccountsInfo(
      tokenAddresses.map((t) => t.ata)
    )

    // Parse balances
    const balances: Record<string, number> = {}
    
    // First, get token decimals
    let decimals = 6 // Default
    try {
      const mintInfo = await connection.getParsedAccountInfo(mintPubkey)
      if (mintInfo.value?.data && typeof mintInfo.value.data === "object" && "parsed" in mintInfo.value.data) {
        decimals = mintInfo.value.data.parsed?.info?.decimals || 6
      }
    } catch {
      // Use default decimals
    }

    for (let i = 0; i < tokenAddresses.length; i++) {
      const { wallet } = tokenAddresses[i]
      const accountInfo = accountInfos[i]
      
      if (accountInfo && accountInfo.data) {
        try {
          const decoded = AccountLayout.decode(accountInfo.data)
          const amount = Number(decoded.amount)
          balances[wallet] = amount / Math.pow(10, decimals)
        } catch {
          balances[wallet] = 0
        }
      } else {
        balances[wallet] = 0
      }
    }

    return NextResponse.json({
      success: true,
      balances,
      decimals,
      fetchedAt: Date.now(),
    })
  } catch (error) {
    console.error("[BATCH-TOKEN-BALANCE] Error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch token balances" },
      { status: 500 }
    )
  }
}

