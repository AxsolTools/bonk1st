/**
 * Token Stats API - Fetch real-time holders, volume, liquidity, and bonding curve progress
 * Uses Helius for on-chain data
 */

import { NextRequest, NextResponse } from "next/server"
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const HELIUS_RPC = process.env.HELIUS_RPC_URL || "https://api.mainnet-beta.solana.com"
const HELIUS_API_KEY = process.env.HELIUS_API_KEY
const connection = new Connection(HELIUS_RPC, "confirmed")

// Pump.fun program ID and bonding curve constants
const PUMP_PROGRAM_ID = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P")
const PUMP_MIGRATION_THRESHOLD_SOL = 85 // ~$12,750 at $150 SOL

interface TokenStats {
  holders: number
  volume24h: number
  liquidity: number
  bondingCurveProgress: number
  bondingCurveSol: number
  isMigrated: boolean
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await context.params
    
    console.log(`[TOKEN-STATS] ========== START ==========`)
    console.log(`[TOKEN-STATS] Fetching stats for: ${address}`)

    // Validate address
    let mintPubkey: PublicKey
    try {
      mintPubkey = new PublicKey(address)
    } catch {
      console.log(`[TOKEN-STATS] Invalid address: ${address}`)
      return NextResponse.json(
        { success: false, error: "Invalid token address" },
        { status: 400 }
      )
    }

    // Fetch all stats in parallel
    console.log(`[TOKEN-STATS] Fetching holders, volume, bonding, dex data...`)
    const [holders, volumeData, bondingData, dexData] = await Promise.all([
      fetchHolderCount(address),
      fetchVolume24h(address),
      fetchBondingCurveProgress(address),
      fetchDexScreenerData(address),
    ])
    
    console.log(`[TOKEN-STATS] Raw data:`, {
      holders,
      volumeData,
      bondingData,
      dexData
    })

    // For bonding tokens, use bonding curve SOL as liquidity (in USD)
    // For migrated tokens, use DexScreener liquidity
    const solPriceUsd = 150 // Approximate SOL price
    const bondingLiquidityUsd = bondingData.solBalance * solPriceUsd
    
    // Determine if migrated: either bonding curve says so, OR token has real DEX liquidity
    // This handles PumpSwap and other DEX migrations that don't use Raydium
    const hasDexLiquidity = dexData.liquidity > 0 && dexData.hasPairs
    const isMigrated = bondingData.isMigrated || hasDexLiquidity
    
    console.log(`[TOKEN-STATS] Migration check:`, {
      bondingIsMigrated: bondingData.isMigrated,
      hasDexLiquidity,
      finalIsMigrated: isMigrated,
      bondingSolBalance: bondingData.solBalance,
      dexLiquidity: dexData.liquidity,
      dexHasPairs: dexData.hasPairs
    })
    
    const stats: TokenStats = {
      holders,
      volume24h: volumeData.volume24h || dexData.volume24h || 0,
      // Use DexScreener liquidity if available (migrated), otherwise bonding curve SOL value
      liquidity: dexData.liquidity > 0 ? dexData.liquidity : bondingLiquidityUsd,
      bondingCurveProgress: isMigrated ? 100 : bondingData.progress,
      bondingCurveSol: bondingData.solBalance,
      isMigrated: isMigrated,
    }
    
    console.log(`[TOKEN-STATS] Final stats:`, stats)
    console.log(`[TOKEN-STATS] ========== END ==========`)

    // Update database with fresh values (async)
    updateDatabaseStats(address, stats)

    return NextResponse.json({
      success: true,
      data: stats,
    })
  } catch (error) {
    console.error("[TOKEN-STATS] Error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch token stats" },
      { status: 500 }
    )
  }
}

/**
 * Fetch holder count using Helius DAS API
 */
async function fetchHolderCount(mintAddress: string): Promise<number> {
  // Try Helius Token Holders API
  if (HELIUS_API_KEY) {
    try {
      const response = await fetch(
        `https://api.helius.xyz/v0/token-metadata?api-key=${HELIUS_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mintAccounts: [mintAddress] }),
        }
      )

      if (response.ok) {
        const data = await response.json()
        if (data?.[0]?.onChainAccountInfo?.holderCount) {
          return data[0].onChainAccountInfo.holderCount
        }
      }
    } catch (error) {
      console.warn("[TOKEN-STATS] Helius holder count failed:", error)
    }
  }

  // Fallback: Use getTokenLargestAccounts to estimate
  try {
    const accounts = await connection.getTokenLargestAccounts(new PublicKey(mintAddress))
    // Count accounts with non-zero balance
    return accounts.value.filter(a => a.uiAmount && a.uiAmount > 0).length
  } catch (error) {
    console.warn("[TOKEN-STATS] RPC holder count failed:", error)
  }

  // Fallback: Query from database trades
  try {
    const { count } = await supabase
      .from("trades")
      .select("wallet_address", { count: "exact", head: true })
      .eq("token_address", mintAddress)
      .eq("trade_type", "buy")
      .eq("status", "confirmed")

    return count || 0
  } catch {
    return 0
  }
}

/**
 * Fetch 24h volume from database and DexScreener
 */
async function fetchVolume24h(mintAddress: string): Promise<{ volume24h: number }> {
  try {
    // Get token ID first
    const { data: token } = await supabase
      .from("tokens")
      .select("id")
      .eq("mint_address", mintAddress)
      .single()

    if (!token) return { volume24h: 0 }

    // Sum trades from last 24h
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: trades } = await supabase
      .from("trades")
      .select("amount_sol")
      .eq("token_id", token.id)
      .eq("status", "confirmed")
      .gte("created_at", yesterday)

    const volume = trades?.reduce((sum, t) => sum + (t.amount_sol || 0), 0) || 0
    return { volume24h: volume }
  } catch (error) {
    console.warn("[TOKEN-STATS] Volume fetch failed:", error)
    return { volume24h: 0 }
  }
}

/**
 * Fetch bonding curve progress from on-chain
 */
async function fetchBondingCurveProgress(mintAddress: string): Promise<{
  progress: number
  solBalance: number
  isMigrated: boolean
}> {
  try {
    const mintPubkey = new PublicKey(mintAddress)

    // Derive bonding curve PDA
    const [bondingCurvePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("bonding-curve"), mintPubkey.toBuffer()],
      PUMP_PROGRAM_ID
    )

    // Get bonding curve account balance
    const balance = await connection.getBalance(bondingCurvePDA)
    const solBalance = balance / LAMPORTS_PER_SOL

    // Calculate progress (85 SOL = 100% = migration)
    const progress = Math.min(100, (solBalance / PUMP_MIGRATION_THRESHOLD_SOL) * 100)
    const isMigrated = solBalance >= PUMP_MIGRATION_THRESHOLD_SOL

    return { progress, solBalance, isMigrated }
  } catch (error) {
    console.warn("[TOKEN-STATS] Bonding curve fetch failed:", error)
    
    // Try Pump.fun API as fallback
    try {
      const response = await fetch(`https://frontend-api.pump.fun/coins/${mintAddress}`)
      if (response.ok) {
        const data = await response.json()
        if (data) {
          const solBalance = parseFloat(data.virtual_sol_reserves || "0") / LAMPORTS_PER_SOL
          const progress = Math.min(100, (solBalance / PUMP_MIGRATION_THRESHOLD_SOL) * 100)
          return {
            progress,
            solBalance,
            isMigrated: data.complete || data.raydium_pool !== null,
          }
        }
      }
    } catch {
      // Ignore fallback errors
    }

    return { progress: 0, solBalance: 0, isMigrated: false }
  }
}

/**
 * Fetch data from DexScreener for liquidity and volume
 */
async function fetchDexScreenerData(mintAddress: string): Promise<{
  liquidity: number
  volume24h: number
  hasPairs: boolean
}> {
  try {
    const response = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${mintAddress}`,
      { next: { revalidate: 30 } }
    )

    if (response.ok) {
      const data = await response.json()
      if (data.pairs && data.pairs.length > 0) {
        // Sum liquidity from all pairs
        const liquidity = data.pairs.reduce(
          (sum: number, p: { liquidity?: { usd?: number } }) => sum + (p.liquidity?.usd || 0),
          0
        )
        // Sum 24h volume from all pairs
        const volume24h = data.pairs.reduce(
          (sum: number, p: { volume?: { h24?: number } }) => sum + (p.volume?.h24 || 0),
          0
        )
        return { liquidity, volume24h, hasPairs: true }
      }
    }
  } catch (error) {
    console.warn("[TOKEN-STATS] DexScreener fetch failed:", error)
  }

  return { liquidity: 0, volume24h: 0, hasPairs: false }
}

/**
 * Update database with fresh stats (fire and forget)
 */
async function updateDatabaseStats(mintAddress: string, stats: TokenStats) {
  try {
    await supabase
      .from("tokens")
      .update({
        holders: stats.holders,
        volume_24h: stats.volume24h,
        current_liquidity: stats.liquidity,
        bonding_curve_progress: stats.bondingCurveProgress,
        stage: stats.isMigrated ? "migrated" : "bonding",
        updated_at: new Date().toISOString(),
      })
      .eq("mint_address", mintAddress)
  } catch (error) {
    console.warn("[TOKEN-STATS] DB update failed:", error)
  }
}

