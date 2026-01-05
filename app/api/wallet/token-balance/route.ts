/**
 * AQUA Launchpad - Token Balance API
 * Gets SPL token balance for a wallet
 */

import { NextRequest, NextResponse } from "next/server"
import { Connection, PublicKey } from "@solana/web3.js"
import { getAssociatedTokenAddress, getAccount, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token"

const HELIUS_RPC = process.env.HELIUS_RPC_URL || "https://api.mainnet-beta.solana.com"
const connection = new Connection(HELIUS_RPC, "confirmed")

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get("wallet")
    const tokenMint = searchParams.get("mint")

    if (!walletAddress || !tokenMint) {
      return NextResponse.json(
        { error: "wallet and mint are required" },
        { status: 400 }
      )
    }

    // Validate addresses
    let walletPubkey: PublicKey
    let mintPubkey: PublicKey
    try {
      walletPubkey = new PublicKey(walletAddress)
      mintPubkey = new PublicKey(tokenMint)
    } catch {
      return NextResponse.json(
        { error: "Invalid wallet or mint address" },
        { status: 400 }
      )
    }

    // Try both token programs (regular SPL and Token-2022)
    let tokenBalance = 0
    let decimals = 9
    let tokenAccount: string | null = null
    let found = false

    // Try regular SPL Token first
    try {
      const ata = await getAssociatedTokenAddress(mintPubkey, walletPubkey, false, TOKEN_PROGRAM_ID)
      const account = await getAccount(connection, ata, "confirmed", TOKEN_PROGRAM_ID)
      tokenBalance = Number(account.amount)
      tokenAccount = ata.toBase58()
      found = true
      
      // Get decimals from mint
      const mintInfo = await connection.getParsedAccountInfo(mintPubkey)
      if (mintInfo.value?.data && 'parsed' in mintInfo.value.data) {
        decimals = mintInfo.value.data.parsed.info.decimals
      }
    } catch {
      // Account doesn't exist for SPL Token, try Token-2022
    }

    // Try Token-2022 if not found
    if (!found) {
      try {
        const ata = await getAssociatedTokenAddress(mintPubkey, walletPubkey, false, TOKEN_2022_PROGRAM_ID)
        const account = await getAccount(connection, ata, "confirmed", TOKEN_2022_PROGRAM_ID)
        tokenBalance = Number(account.amount)
        tokenAccount = ata.toBase58()
        found = true
        
        // Get decimals from mint
        const mintInfo = await connection.getParsedAccountInfo(mintPubkey)
        if (mintInfo.value?.data && 'parsed' in mintInfo.value.data) {
          decimals = mintInfo.value.data.parsed.info.decimals
        }
      } catch {
        // No token account exists
      }
    }

    const uiBalance = tokenBalance / Math.pow(10, decimals)

    return NextResponse.json({
      success: true,
      data: {
        wallet: walletAddress,
        mint: tokenMint,
        balance: tokenBalance,
        uiBalance,
        decimals,
        tokenAccount,
        hasBalance: found && tokenBalance > 0,
      },
    })
  } catch (error) {
    console.error("[TOKEN-BALANCE] GET error:", error)
    return NextResponse.json(
      { error: "Failed to get token balance" },
      { status: 500 }
    )
  }
}

