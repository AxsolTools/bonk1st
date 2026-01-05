/**
 * Batch SOL Balance API - Fetch multiple wallet balances in one call
 * Uses getMultipleAccountsInfo for efficiency
 */

import { NextRequest, NextResponse } from "next/server"
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js"

const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL || "https://api.mainnet-beta.solana.com"

export async function POST(request: NextRequest) {
  try {
    const { addresses } = await request.json()

    if (!addresses || !Array.isArray(addresses) || addresses.length === 0) {
      return NextResponse.json(
        { success: false, error: "No addresses provided" },
        { status: 400 }
      )
    }

    // Limit batch size
    const limitedAddresses = addresses.slice(0, 20)
    
    const connection = new Connection(HELIUS_RPC_URL, "confirmed")
    
    // Convert to PublicKeys
    const publicKeys = limitedAddresses.map((addr: string) => {
      try {
        return new PublicKey(addr)
      } catch {
        return null
      }
    }).filter(Boolean) as PublicKey[]

    // Batch fetch all account info
    const accountInfos = await connection.getMultipleAccountsInfo(publicKeys)

    // Map results
    const balances: Record<string, number> = {}
    
    for (let i = 0; i < publicKeys.length; i++) {
      const address = publicKeys[i].toBase58()
      const accountInfo = accountInfos[i]
      
      if (accountInfo) {
        balances[address] = accountInfo.lamports / LAMPORTS_PER_SOL
      } else {
        balances[address] = 0
      }
    }

    return NextResponse.json({
      success: true,
      balances,
      fetchedAt: Date.now(),
    })
  } catch (error) {
    console.error("[BATCH-BALANCE] Error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch balances" },
      { status: 500 }
    )
  }
}

