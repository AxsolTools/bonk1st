/**
 * Token Gate Check API
 * Verifies if a wallet holds the required amount of the gate token
 * 
 * Reads configuration from environment variables:
 * - NEXT_PUBLIC_TOKEN_GATE_MINT
 * - NEXT_PUBLIC_TOKEN_GATE_MIN_AMOUNT
 * - NEXT_PUBLIC_TOKEN_GATE_ENABLED
 */

import { NextRequest, NextResponse } from "next/server"
import { Connection, PublicKey } from "@solana/web3.js"
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token"

const HELIUS_RPC = process.env.HELIUS_RPC_URL || "https://api.mainnet-beta.solana.com"
const connection = new Connection(HELIUS_RPC, "confirmed")

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get("wallet")
    
    if (!walletAddress) {
      return NextResponse.json(
        { success: false, error: "Wallet address required" },
        { status: 400 }
      )
    }
    
    // Read config from environment
    const enabled = process.env.NEXT_PUBLIC_TOKEN_GATE_ENABLED === 'true'
    const tokenMint = process.env.NEXT_PUBLIC_TOKEN_GATE_MINT || ''
    const tokenSymbol = process.env.NEXT_PUBLIC_TOKEN_GATE_SYMBOL || 'TOKEN'
    const minAmount = parseFloat(process.env.NEXT_PUBLIC_TOKEN_GATE_MIN_AMOUNT || '0')
    const decimals = parseInt(process.env.NEXT_PUBLIC_TOKEN_GATE_DECIMALS || '6', 10)
    
    // If token gate is disabled, allow access
    if (!enabled) {
      return NextResponse.json({
        success: true,
        data: {
          hasAccess: true,
          gateEnabled: false,
          message: "Token gate is disabled",
        }
      })
    }
    
    // If no mint configured, allow access
    if (!tokenMint || tokenMint.length < 30) {
      return NextResponse.json({
        success: true,
        data: {
          hasAccess: true,
          gateEnabled: false,
          message: "Token gate not configured",
        }
      })
    }
    
    // Validate addresses
    let walletPubkey: PublicKey
    let mintPubkey: PublicKey
    
    try {
      walletPubkey = new PublicKey(walletAddress)
      mintPubkey = new PublicKey(tokenMint)
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid wallet or mint address" },
        { status: 400 }
      )
    }
    
    // Get the associated token account
    const ata = await getAssociatedTokenAddress(mintPubkey, walletPubkey)
    
    let balance = 0
    try {
      const tokenAccount = await getAccount(connection, ata)
      // Convert from raw amount to human-readable
      balance = Number(tokenAccount.amount) / Math.pow(10, decimals)
    } catch {
      // Account doesn't exist = 0 balance
      balance = 0
    }
    
    const hasAccess = balance >= minAmount
    
    return NextResponse.json({
      success: true,
      data: {
        hasAccess,
        gateEnabled: true,
        tokenMint,
        tokenSymbol,
        requiredAmount: minAmount,
        currentBalance: balance,
        message: hasAccess 
          ? `Access granted - you hold ${balance.toLocaleString()} ${tokenSymbol}`
          : `Access denied - need ${minAmount.toLocaleString()} ${tokenSymbol}, you have ${balance.toLocaleString()}`,
      }
    })
    
  } catch (error) {
    console.error("[TOKEN-GATE] Check failed:", error)
    return NextResponse.json(
      { success: false, error: "Failed to check token balance" },
      { status: 500 }
    )
  }
}

