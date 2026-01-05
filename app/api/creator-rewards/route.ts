/**
 * Creator Rewards API - Fetch and claim rewards from Pump.fun, Bonk.fun, and Jupiter DBC pools
 * 
 * Supports:
 * - Pump.fun: Creator vault PDA (per-creator, accumulates all tokens)
 * - Bonk.fun: Creator vault PDA (per-creator, accumulates all tokens)
 * - Jupiter: DBC pool fees (per-token, each token has its own pool)
 * 
 * Reference: https://pumpportal.fun/docs, https://dev.jup.ag
 */

import { NextRequest, NextResponse } from "next/server"
import { 
  Connection, 
  PublicKey, 
  LAMPORTS_PER_SOL, 
  VersionedTransaction, 
  Keypair,
  SystemProgram,
  SystemInstruction,
  TransactionInstruction,
} from "@solana/web3.js"
import bs58 from "bs58"
import { getAdminClient } from "@/lib/supabase/admin"
import { decryptPrivateKey, getOrCreateServiceSalt } from "@/lib/crypto"
import { getJupiterFeeInfo, claimJupiterFees } from "@/lib/blockchain"

const HELIUS_RPC = process.env.HELIUS_RPC_URL || "https://api.mainnet-beta.solana.com"
const connection = new Connection(HELIUS_RPC, "confirmed")

// Program IDs
const PUMP_PROGRAM_ID = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P")
// LetsBonk.fun uses Raydium LaunchLab program
// Source: https://docs.raydium.io/raydium/pool-creation/launchlab/launchlab-typescript-sdk
const RAYDIUM_LAUNCHLAB_PROGRAM_ID = new PublicKey("LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj")
// LetsBonk platform config address
const LETSBONK_PLATFORM_CONFIG = new PublicKey("FfYek5vEz23cMkWsdJwG2oa6EphsvXSHrGpdALN4g6W1")
// Legacy - keeping for backwards compatibility but should use RAYDIUM_LAUNCHLAB_PROGRAM_ID
const BONK_PROGRAM_ID = RAYDIUM_LAUNCHLAB_PROGRAM_ID
const PUMPPORTAL_LOCAL_TRADE = "https://pumpportal.fun/api/trade-local"

// Pool types
type PoolType = 'pump' | 'bonk' | 'jupiter'

type TokenRow = {
  id?: string
  stage?: string
  creator_wallet?: string
  pool_type?: string
  dbc_pool_address?: string
}

/**
 * GET - Check creator rewards balance for a token
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const tokenMint = searchParams.get("tokenMint")
    const creatorWallet = searchParams.get("creatorWallet")
    const poolTypeOverride = searchParams.get("poolType") as PoolType | null
    const dbcPoolOverride = searchParams.get("dbcPool")

    console.log(`\n[CREATOR-REWARDS-GET] ========== REQUEST START ==========`)
    console.log(`[CREATOR-REWARDS-GET] Input params:`, {
      tokenMint: tokenMint?.slice(0, 12) + '...',
      creatorWallet: creatorWallet?.slice(0, 12) + '...',
      poolTypeOverride,
      dbcPoolOverride: dbcPoolOverride?.slice(0, 12) + '...' || 'none',
    })

    if (!tokenMint || !creatorWallet) {
      console.log(`[CREATOR-REWARDS-GET] ❌ Missing required params`)
      return NextResponse.json(
        { success: false, error: "tokenMint and creatorWallet are required" },
        { status: 400 }
      )
    }

    const adminClient = getAdminClient()

    // Check if token is migrated or on bonding curve, and get pool type
    // DB is optional: use as a hint, but never block on it for read path
    // Note: Only select columns that exist in the database schema
    let tokenData: TokenRow | null = null
    let tokenError: any = null
    try {
      const { data, error } = await adminClient
        .from("tokens")
        .select("id, stage, creator_wallet, pool_type, dbc_pool_address")
        .eq("mint_address", tokenMint)
        .single()
      tokenData = data ? (data as TokenRow) : null
      tokenError = error
    } catch (e: any) {
      tokenData = null
      tokenError = e
    }

    console.log(`[CREATOR-REWARDS-GET] DB lookup result:`, {
      found: !!tokenData,
      error: tokenError?.message || 'none',
      dbPoolType: tokenData?.pool_type || 'none',
      dbCreatorWallet: tokenData?.creator_wallet?.slice(0, 12) + '...' || 'none',
      dbDbcPool: tokenData?.dbc_pool_address?.slice(0, 12) + '...' || 'none',
      dbStage: tokenData?.stage || 'none',
    })

    if (tokenError) {
      console.warn(`[CREATOR-REWARDS-GET] DB query ERROR for ${tokenMint.slice(0, 8)}...:`, tokenError.message, tokenError.code)
    }

    // Determine pool type (prefer query override, then DB, else pump)
    let poolType: PoolType = poolTypeOverride || 'pump'
    if (!poolTypeOverride && tokenData?.pool_type === 'bonk') {
      poolType = 'bonk'
    } else if (!poolTypeOverride && tokenData?.pool_type === 'jupiter') {
      poolType = 'jupiter'
    }
    
    let dbcPoolAddress = dbcPoolOverride || tokenData?.dbc_pool_address

    console.log(`[CREATOR-REWARDS-GET] Resolved pool type:`, {
      finalPoolType: poolType,
      source: poolTypeOverride ? 'query override' : (tokenData?.pool_type ? 'database' : 'default'),
      dbcPoolAddress: dbcPoolAddress?.slice(0, 12) + '...' || 'none',
    })

    let rewards: { balance: number; vaultAddress: string; hasRewards: boolean }
    let platformName: string

    console.log(`[CREATOR-REWARDS-GET] ===== FETCHING REWARDS FOR POOL TYPE: ${poolType.toUpperCase()} =====`)

    // Jupiter tokens use DBC pool fees (per-token) and must NOT fall back to Pump.fun
    if (poolType === 'jupiter') {
      console.log(`[CREATOR-REWARDS-GET] [JUPITER] Processing Jupiter DBC token`)
      console.log(`[CREATOR-REWARDS-GET] [JUPITER] DBC pool address: ${dbcPoolAddress || 'MISSING'}`)
      
      if (dbcPoolAddress) {
        console.log(`[CREATOR-REWARDS-GET] [JUPITER] Calling getJupiterCreatorRewards with pool: ${dbcPoolAddress.slice(0, 12)}...`)
        rewards = await getJupiterCreatorRewards(dbcPoolAddress)
        console.log(`[CREATOR-REWARDS-GET] [JUPITER] Result:`, {
          balance: rewards.balance,
          vaultAddress: rewards.vaultAddress?.slice(0, 12) + '...' || 'none',
          hasRewards: rewards.hasRewards,
        })
        platformName = 'Jupiter'
      } else {
        // Jupiter token without DBC pool address - try to fetch it once
        console.log(`[CREATOR-REWARDS-GET] [JUPITER] ⚠️ Missing dbc_pool_address, attempting to fetch from chain...`)
        try {
          const { getJupiterPoolAddress } = await import("@/lib/blockchain")
          const fetchedPoolAddress = await getJupiterPoolAddress(tokenMint)
          console.log(`[CREATOR-REWARDS-GET] [JUPITER] Fetched pool result: ${fetchedPoolAddress || 'NOT FOUND'}`)
          
          if (fetchedPoolAddress) {
            console.log(`[CREATOR-REWARDS-GET] [JUPITER] Calling getJupiterCreatorRewards with fetched pool: ${fetchedPoolAddress.slice(0, 12)}...`)
            rewards = await getJupiterCreatorRewards(fetchedPoolAddress)
            console.log(`[CREATOR-REWARDS-GET] [JUPITER] Result:`, {
              balance: rewards.balance,
              vaultAddress: rewards.vaultAddress?.slice(0, 12) + '...' || 'none',
              hasRewards: rewards.hasRewards,
            })
            platformName = 'Jupiter'
            
            // Update the database with the pool address for next time
            try {
              const updateData: Record<string, string> = { dbc_pool_address: fetchedPoolAddress }
              await (adminClient.from("tokens") as any).update(updateData).eq("mint_address", tokenMint)
              console.log(`[CREATOR-REWARDS-GET] [JUPITER] Updated dbc_pool_address in database`)
            } catch (updateErr) {
              console.warn(`[CREATOR-REWARDS-GET] [JUPITER] Failed to update dbc_pool_address:`, updateErr)
            }
          } else {
            // No Jupiter pool found, do NOT fall back to Pump.fun
            console.warn(`[CREATOR-REWARDS-GET] [JUPITER] ❌ No Jupiter pool found - returning zero rewards (NOT falling back to Pump.fun)`)
            rewards = { balance: 0, vaultAddress: '', hasRewards: false }
            platformName = 'Jupiter'
          }
        } catch (fetchErr) {
          console.warn(`[CREATOR-REWARDS-GET] [JUPITER] ❌ Failed to fetch Jupiter pool:`, fetchErr)
          rewards = { balance: 0, vaultAddress: '', hasRewards: false }
          platformName = 'Jupiter'
        }
      }
    } else if (poolType === 'bonk') {
      // Bonk.fun uses creator vault (per-creator, accumulates all tokens)
      console.log(`[CREATOR-REWARDS-GET] [BONK] Processing Bonk.fun token`)
      console.log(`[CREATOR-REWARDS-GET] [BONK] Creator wallet for vault derivation: ${creatorWallet.slice(0, 12)}...`)
      rewards = await getCreatorRewards(tokenMint, creatorWallet, 'bonk')
      console.log(`[CREATOR-REWARDS-GET] [BONK] Result:`, {
        balance: rewards.balance,
        vaultAddress: rewards.vaultAddress?.slice(0, 12) + '...' || 'none',
        hasRewards: rewards.hasRewards,
      })
      platformName = 'Bonk.fun'
    } else {
      // Pump.fun uses creator vault (per-creator, accumulates all tokens)
      console.log(`[CREATOR-REWARDS-GET] [PUMP] Processing Pump.fun token`)
      console.log(`[CREATOR-REWARDS-GET] [PUMP] Token mint: ${tokenMint.slice(0, 12)}...`)
      console.log(`[CREATOR-REWARDS-GET] [PUMP] Creator wallet for vault derivation: ${creatorWallet.slice(0, 12)}...`)
      rewards = await getCreatorRewards(tokenMint, creatorWallet, 'pump')
      console.log(`[CREATOR-REWARDS-GET] [PUMP] Result:`, {
        balance: rewards.balance,
        vaultAddress: rewards.vaultAddress?.slice(0, 12) + '...' || 'none',
        hasRewards: rewards.hasRewards,
      })
      platformName = 'Pump.fun'
    }
    
    // If migrated, also check for any Raydium/Meteora LP fee rewards
    let migrationRewards = 0
    const tokenStage = tokenData?.stage
    if (tokenStage === "migrated" && poolType !== 'jupiter') {
      migrationRewards = await getMigratedTokenRewards(tokenMint, creatorWallet, poolType)
    }

    const totalRewards = rewards.balance + migrationRewards
    const tokenCreatorWallet = tokenData?.creator_wallet
    // quote_mint column may not exist in database, default to false
    const isUsd1Token = false

    // Final summary log
    console.log(`[CREATOR-REWARDS-GET] ===== FINAL RESPONSE =====`)
    console.log(`[CREATOR-REWARDS-GET] Token: ${tokenMint.slice(0, 12)}...`)
    console.log(`[CREATOR-REWARDS-GET] Pool type: ${poolType}`)
    console.log(`[CREATOR-REWARDS-GET] Platform: ${platformName}`)
    console.log(`[CREATOR-REWARDS-GET] Balances:`, {
      total: totalRewards.toFixed(9) + ' SOL',
      pumpBalance: poolType !== 'jupiter' ? rewards.balance.toFixed(9) + ' SOL' : 'N/A',
      jupiterBalance: poolType === 'jupiter' ? rewards.balance.toFixed(9) + ' SOL' : 'N/A',
      migrationBalance: migrationRewards.toFixed(9) + ' SOL',
    })
    console.log(`[CREATOR-REWARDS-GET] Vault: ${rewards.vaultAddress?.slice(0, 20) || 'none'}`)
    console.log(`[CREATOR-REWARDS-GET] Has rewards: ${totalRewards > 0}`)
    console.log(`[CREATOR-REWARDS-GET] Creator match: ${tokenCreatorWallet === creatorWallet}`)
    console.log(`[CREATOR-REWARDS-GET] Can claim Pump/Bonk: ${poolType !== 'jupiter' && rewards.balance > 0 && tokenStage !== "migrated"}`)
    console.log(`[CREATOR-REWARDS-GET] Can claim Jupiter: ${poolType === 'jupiter' && rewards.balance > 0}`)
    console.log(`[CREATOR-REWARDS-GET] ========== REQUEST END ==========\n`)

    return NextResponse.json({
      success: true,
      data: {
        balance: totalRewards,
        pumpBalance: poolType !== 'jupiter' ? rewards.balance : 0,
        jupiterBalance: poolType === 'jupiter' ? rewards.balance : 0,
        migrationBalance: migrationRewards,
        vaultAddress: rewards.vaultAddress,
        hasRewards: totalRewards > 0,
        stage: tokenStage || "unknown",
        isCreator: tokenCreatorWallet === creatorWallet,
        canClaimViaPumpPortal: poolType !== 'jupiter' && rewards.balance > 0 && tokenStage !== "migrated",
        canClaimViaJupiter: poolType === 'jupiter' && rewards.balance > 0,
        // Pool info
        poolType,
        isUsd1Token,
        platformName,
        dbcPoolAddress,
      }
    })
  } catch (error) {
    console.error("[CREATOR-REWARDS-GET] ❌ EXCEPTION:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch creator rewards" },
      { status: 500 }
    )
  }
}

/**
 * POST - Claim creator rewards using PumpPortal API or Jupiter API
 */
export async function POST(request: NextRequest) {
  try {
    const sessionId = request.headers.get("x-session-id")
    const userId = request.headers.get("x-user-id")
    
    console.log(`\n[CREATOR-REWARDS-POST] ========== CLAIM REQUEST START ==========`)
    console.log(`[CREATOR-REWARDS-POST] Headers:`, {
      sessionId: sessionId?.slice(0, 12) + '...' || 'MISSING',
      userId: userId?.slice(0, 12) + '...' || 'none',
    })
    
    if (!sessionId) {
      console.log(`[CREATOR-REWARDS-POST] ❌ No session ID - authentication required`)
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { tokenMint, walletAddress, poolType: poolTypeBody, dbcPool: dbcPoolBody } = body

    console.log(`[CREATOR-REWARDS-POST] Request body:`, {
      tokenMint: tokenMint?.slice(0, 12) + '...' || 'MISSING',
      walletAddress: walletAddress?.slice(0, 12) + '...' || 'MISSING',
      poolTypeBody: poolTypeBody || 'not specified',
      dbcPoolBody: dbcPoolBody?.slice(0, 12) + '...' || 'none',
    })

    if (!tokenMint || !walletAddress) {
      console.log(`[CREATOR-REWARDS-POST] ❌ Missing required params`)
      return NextResponse.json(
        { success: false, error: "tokenMint and walletAddress are required" },
        { status: 400 }
      )
    }

    const adminClient = getAdminClient()

    // Verify this wallet belongs to the user
    console.log(`[CREATOR-REWARDS-POST] Verifying wallet ownership...`)
    console.log(`[CREATOR-REWARDS-POST] Query: session_id=${sessionId.slice(0, 12)}..., public_key=${walletAddress.slice(0, 12)}...`)
    
    const { data: wallet, error: walletError } = await adminClient
      .from("wallets")
      .select("encrypted_private_key")
      .eq("session_id", sessionId)
      .eq("public_key", walletAddress)
      .single()

    if (walletError || !wallet) {
      console.log(`[CREATOR-REWARDS-POST] ❌ Wallet verification FAILED:`, {
        error: walletError?.message || 'Wallet not found',
        code: walletError?.code,
      })
      return NextResponse.json(
        { success: false, error: "Wallet not found or unauthorized" },
        { status: 403 }
      )
    }
    
    console.log(`[CREATOR-REWARDS-POST] ✅ Wallet verified - belongs to this session`)

    // Verify this is the token creator (DB optional)
    console.log(`[CREATOR-REWARDS-POST] Looking up token in database...`)
    let tokenData: TokenRow | null = null
    let tokenError: any = null
    try {
      const { data, error } = await adminClient
        .from("tokens")
        .select("id, creator_wallet, stage, pool_type, dbc_pool_address")
        .eq("mint_address", tokenMint)
        .single()
      tokenData = data ? (data as TokenRow) : null
      tokenError = error
      
      console.log(`[CREATOR-REWARDS-POST] Token DB lookup result:`, {
        found: !!tokenData,
        error: tokenError?.message || 'none',
        dbCreatorWallet: tokenData?.creator_wallet?.slice(0, 12) + '...' || 'none',
        dbPoolType: tokenData?.pool_type || 'none',
        dbStage: tokenData?.stage || 'none',
        dbDbcPool: tokenData?.dbc_pool_address?.slice(0, 12) + '...' || 'none',
      })
    } catch (e: any) {
      tokenData = null
      tokenError = e
    }

    if (tokenError) {
      console.warn(`[CREATOR-REWARDS-POST] ⚠️ DB query error (proceeding anyway):`, tokenError.message || tokenError)
    }
    
    // If DB lookup failed, use provided values as fallback
    const safeTokenData: TokenRow = tokenData || {
      creator_wallet: walletAddress, // Assume caller is creator if no DB record
      pool_type: poolTypeBody || 'pump',
      dbc_pool_address: dbcPoolBody,
    }

    console.log(`[CREATOR-REWARDS-POST] Safe token data (after fallback):`, {
      creatorWallet: safeTokenData.creator_wallet?.slice(0, 12) + '...',
      poolType: safeTokenData.pool_type,
      dbcPool: safeTokenData.dbc_pool_address?.slice(0, 12) + '...' || 'none',
      usedFallback: !tokenData,
    })

    // CREATOR VERIFICATION
    const creatorFromDb = safeTokenData.creator_wallet?.toLowerCase()
    const walletAddressLower = walletAddress.toLowerCase()
    const isCreator = creatorFromDb ? creatorFromDb === walletAddressLower : true
    
    console.log(`[CREATOR-REWARDS-POST] ===== CREATOR VERIFICATION =====`)
    console.log(`[CREATOR-REWARDS-POST] Provided wallet:  ${walletAddress}`)
    console.log(`[CREATOR-REWARDS-POST] DB creator:       ${tokenData?.creator_wallet || 'NOT IN DB'}`)
    console.log(`[CREATOR-REWARDS-POST] Safe creator:     ${safeTokenData.creator_wallet}`)
    console.log(`[CREATOR-REWARDS-POST] Lowercase match:  ${creatorFromDb} === ${walletAddressLower} ? ${isCreator}`)
    console.log(`[CREATOR-REWARDS-POST] Is creator:       ${isCreator ? '✅ YES' : '❌ NO'}`)
    
    if (!isCreator) {
      console.log(`[CREATOR-REWARDS-POST] ❌ REJECTED - wallet does not match creator`)
      return NextResponse.json(
        { 
          success: false, 
          error: "Only the token creator can claim rewards",
          debug: {
            providedWallet: walletAddress,
            creatorWallet: tokenData?.creator_wallet,
            providedLower: walletAddressLower,
            creatorLower: creatorFromDb,
          }
        },
        { status: 403 }
      )
    }

    // Determine pool type
    let poolType: PoolType = (poolTypeBody as PoolType) || 'pump'
    if (!poolTypeBody && safeTokenData.pool_type === 'bonk') {
      poolType = 'bonk'
    } else if (!poolTypeBody && safeTokenData.pool_type === 'jupiter') {
      poolType = 'jupiter'
    }
    
    console.log(`[CREATOR-REWARDS-POST] ===== POOL TYPE DETERMINATION =====`)
    console.log(`[CREATOR-REWARDS-POST] Pool type from body: ${poolTypeBody || 'not specified'}`)
    console.log(`[CREATOR-REWARDS-POST] Pool type from DB:   ${safeTokenData.pool_type || 'not specified'}`)
    console.log(`[CREATOR-REWARDS-POST] Final pool type:     ${poolType}`)

    // Decrypt private key
    const serviceSalt = await getOrCreateServiceSalt(adminClient)
    const walletData = wallet as { encrypted_private_key: string }
    const privateKeyBase58 = decryptPrivateKey(
      walletData.encrypted_private_key,
      sessionId,
      serviceSalt
    )
    const keypair = Keypair.fromSecretKey(bs58.decode(privateKeyBase58))

    // ============================================================================
    // JUPITER DBC POOL CLAIM
    // ============================================================================
    if (poolType === 'jupiter') {
      console.log(`[CREATOR-REWARDS-POST] ===== JUPITER CLAIM FLOW =====`)
      const dbcPoolAddress = dbcPoolBody || safeTokenData.dbc_pool_address
      
      console.log(`[CREATOR-REWARDS-POST] [JUPITER] DBC pool address:`, {
        fromBody: dbcPoolBody?.slice(0, 12) + '...' || 'none',
        fromDB: safeTokenData.dbc_pool_address?.slice(0, 12) + '...' || 'none',
        final: dbcPoolAddress?.slice(0, 12) + '...' || 'MISSING',
      })
      
      if (!dbcPoolAddress) {
        console.log(`[CREATOR-REWARDS-POST] [JUPITER] ❌ No DBC pool address available`)
        return NextResponse.json({
          success: false,
          error: "Jupiter DBC pool address not found for this token"
        })
      }

      // Get current rewards balance
      console.log(`[CREATOR-REWARDS-POST] [JUPITER] Fetching rewards balance...`)
      const rewardsData = await getJupiterCreatorRewards(dbcPoolAddress)
      console.log(`[CREATOR-REWARDS-POST] [JUPITER] Rewards data:`, rewardsData)

      if (rewardsData.balance <= 0) {
        console.log(`[CREATOR-REWARDS-POST] [JUPITER] ❌ No fees to claim`)
        return NextResponse.json({
          success: false,
          error: "No Jupiter fees available to claim"
        })
      }

      console.log(`[CREATOR-REWARDS-POST] [JUPITER] Executing claim for ${rewardsData.balance} SOL...`)
      console.log(`[CREATOR-REWARDS-POST] [JUPITER] Using wallet: ${keypair.publicKey.toBase58().slice(0, 12)}...`)

      // Use Jupiter API to claim fees
      const claimResult = await claimJupiterFees(connection, keypair, dbcPoolAddress)
      console.log(`[CREATOR-REWARDS-POST] [JUPITER] Claim result:`, claimResult)

      if (!claimResult.success) {
        console.log(`[CREATOR-REWARDS-POST] [JUPITER] ❌ Claim failed:`, claimResult.error)
        return NextResponse.json({
          success: false,
          error: claimResult.error || "Failed to claim Jupiter fees",
          data: {
            balance: rewardsData.balance,
            dbcPoolAddress,
          }
        })
      }

      console.log(`[CREATOR-REWARDS-POST] [JUPITER] ✅ Claim successful! TX: ${claimResult.txSignature}`)

      // Record the claim in database
      try {
        if (safeTokenData.id) {
          await adminClient.from("tide_harvest_claims").insert({
            token_id: safeTokenData.id,
            wallet_address: walletAddress,
            amount_sol: rewardsData.balance,
            tx_signature: claimResult.txSignature,
            claimed_at: new Date().toISOString(),
          } as any)
          console.log(`[CREATOR-REWARDS-POST] [JUPITER] Recorded claim in database`)
        }
      } catch (dbError) {
        console.warn("[CREATOR-REWARDS-POST] [JUPITER] Failed to record claim:", dbError)
      }

      console.log(`[CREATOR-REWARDS-POST] ========== CLAIM REQUEST END (JUPITER SUCCESS) ==========\n`)
      return NextResponse.json({
        success: true,
        data: {
          signature: claimResult.txSignature,
          amountClaimed: rewardsData.balance,
          explorerUrl: `https://solscan.io/tx/${claimResult.txSignature}`,
          platformName: 'Jupiter',
        }
      })
    }

    // ============================================================================
    // PUMP.FUN / BONK.FUN CLAIM
    // ============================================================================
    const platformName = poolType === 'bonk' ? 'Bonk.fun' : 'Pump.fun'
    console.log(`[CREATOR-REWARDS-POST] ===== ${platformName.toUpperCase()} CLAIM FLOW =====`)
    console.log(`[CREATOR-REWARDS-POST] [${poolType.toUpperCase()}] Token mint: ${tokenMint.slice(0, 12)}...`)
    console.log(`[CREATOR-REWARDS-POST] [${poolType.toUpperCase()}] Wallet: ${walletAddress.slice(0, 12)}...`)

    // Get current rewards balance
    console.log(`[CREATOR-REWARDS-POST] [${poolType.toUpperCase()}] Fetching rewards balance...`)
    const rewardsData = await getCreatorRewards(tokenMint, walletAddress, poolType)
    console.log(`[CREATOR-REWARDS-POST] [${poolType.toUpperCase()}] Rewards data:`, {
      balance: rewardsData.balance,
      vaultAddress: rewardsData.vaultAddress?.slice(0, 12) + '...' || 'none',
      hasRewards: rewardsData.hasRewards,
    })

    if (rewardsData.balance <= 0) {
      console.log(`[CREATOR-REWARDS-POST] [${poolType.toUpperCase()}] ❌ No rewards to claim`)
      return NextResponse.json({
        success: false,
        error: "No rewards available to claim"
      })
    }

    // For migrated tokens, try Meteora DBC pool claim via PumpPortal
    // Pump.fun tokens migrate to Raydium but fees may still be claimable via meteora-dbc
    if (safeTokenData.stage === "migrated" && poolType === 'pump') {
      console.log(`[CREATOR-REWARDS-POST] [PUMP] Token is MIGRATED - trying meteora-dbc pool...`)
      
      try {
        const meteoraTradeBody = {
          publicKey: walletAddress,
          action: "collectCreatorFee",
          mint: tokenMint,
          priorityFee: 0.0001,
          pool: "meteora-dbc",
        }
        
        const meteoraResponse = await fetch(PUMPPORTAL_LOCAL_TRADE, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(meteoraTradeBody),
        })
        
        if (meteoraResponse.ok) {
          const txBytes = new Uint8Array(await meteoraResponse.arrayBuffer())
          if (txBytes.length > 10) {
            const tx = VersionedTransaction.deserialize(txBytes)
            tx.sign([keypair])
            
            const signature = await connection.sendTransaction(tx, {
              skipPreflight: false,
              maxRetries: 3,
            })
            
            const confirmation = await connection.confirmTransaction(signature, "confirmed")
            
            if (!confirmation.value.err) {
              console.log("[CREATOR-REWARDS] Meteora DBC claim successful:", signature)
              
              return NextResponse.json({
                success: true,
                data: {
                  signature,
                  amountClaimed: rewardsData.balance,
                  explorerUrl: `https://solscan.io/tx/${signature}`,
                  platformName: 'Meteora DBC',
                }
              })
            }
          }
        }
      } catch (meteoraError) {
        console.debug("[CREATOR-REWARDS] Meteora DBC claim failed:", meteoraError)
      }
      
      // Fallback: Direct user to the platform
      const dexUrl = `https://pump.fun/coin/${tokenMint}`
      
      return NextResponse.json({
        success: false,
        error: `Token has migrated. Visit Pump.fun to claim your ${rewardsData.balance.toFixed(6)} SOL rewards.`,
        data: {
          balance: rewardsData.balance,
          claimUrl: dexUrl,
        }
      })
    }

    // Call PumpPortal API for collectCreatorFee with pool parameter
    console.log(`[CREATOR-REWARDS] Requesting collectCreatorFee transaction for ${poolType} pool...`)

    const tradeBody = {
      publicKey: walletAddress,
      action: "collectCreatorFee",
      mint: tokenMint,
      priorityFee: 0.0001,
      pool: poolType, // 'pump' or 'bonk'
    }

    const pumpResponse = await fetch(PUMPPORTAL_LOCAL_TRADE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tradeBody),
    })

    if (!pumpResponse.ok) {
      const errorText = await pumpResponse.text()
      console.error("[CREATOR-REWARDS] PumpPortal error:", errorText)
      
      // Fallback: Direct user to the appropriate platform
      const fallbackUrl = poolType === 'bonk' 
        ? `https://bonk.fun/token/${tokenMint}`
        : `https://pump.fun/coin/${tokenMint}`
      
      return NextResponse.json({
        success: false,
        error: `Unable to claim via API. Please visit ${platformName} to claim your ${rewardsData.balance.toFixed(6)} SOL rewards directly.`,
        data: {
          balance: rewardsData.balance,
          vaultAddress: rewardsData.vaultAddress,
          claimUrl: fallbackUrl,
          poolType,
        }
      })
    }

    // Deserialize and sign the transaction
    const txBytes = new Uint8Array(await pumpResponse.arrayBuffer())
    const tx = VersionedTransaction.deserialize(txBytes)
    tx.sign([keypair])

    // Send to RPC
    console.log("[CREATOR-REWARDS] Submitting claim transaction...")
    const signature = await connection.sendTransaction(tx, {
      skipPreflight: false,
      maxRetries: 3,
    })

    // Confirm transaction
    const confirmation = await connection.confirmTransaction(signature, "confirmed")
    
    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`)
    }

    console.log("[CREATOR-REWARDS] Claim successful:", signature)

    // Record the claim in database
    try {
        if (safeTokenData.id) {
        await adminClient.from("tide_harvest_claims").insert({
            token_id: safeTokenData.id,
          wallet_address: walletAddress,
          amount_sol: rewardsData.balance,
          tx_signature: signature,
          claimed_at: new Date().toISOString(),
        } as any)
      }
    } catch (dbError) {
      console.warn("[CREATOR-REWARDS] Failed to record claim:", dbError)
    }

    return NextResponse.json({
      success: true,
      data: {
        signature,
        amountClaimed: rewardsData.balance,
        explorerUrl: `https://solscan.io/tx/${signature}`,
        platformName,
      }
    })

  } catch (error) {
    console.error("[CREATOR-REWARDS] POST error:", error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to process claim" 
      },
      { status: 500 }
    )
  }
}

/**
 * Fetch creator rewards from Jupiter DBC pool (per-token)
 * 
 * Jupiter tokens use a different fee structure - each token has its own DBC pool
 * that accumulates fees from trades on that specific token.
 */
async function getJupiterCreatorRewards(
  dbcPoolAddress: string
): Promise<{
  balance: number
  vaultAddress: string
  hasRewards: boolean
}> {
  const debugPrefix = `[GET-JUPITER-REWARDS]`
  console.log(`${debugPrefix} ========== FUNCTION START ==========`)
  console.log(`${debugPrefix} DBC Pool Address: ${dbcPoolAddress}`)
  
  try {
    console.log(`${debugPrefix} Calling getJupiterFeeInfo...`)
    const feeInfo = await getJupiterFeeInfo(dbcPoolAddress)
    
    console.log(`${debugPrefix} Raw fee info:`, {
      poolAddress: feeInfo.poolAddress,
      totalFees: feeInfo.totalFees,
      unclaimedFees: feeInfo.unclaimedFees,
      claimedFees: feeInfo.claimedFees,
    })
    
    const unclaimedSol = feeInfo.unclaimedFees / LAMPORTS_PER_SOL
    
    console.log(`${debugPrefix} ========== FUNCTION RESULT ==========`)
    console.log(`${debugPrefix} Unclaimed fees: ${unclaimedSol.toFixed(9)} SOL`)
    console.log(`${debugPrefix} Has rewards: ${unclaimedSol > 0}`)
    console.log(`${debugPrefix} ========== FUNCTION END ==========`)
    
    return {
      balance: unclaimedSol,
      vaultAddress: dbcPoolAddress,
      hasRewards: unclaimedSol > 0,
    }
  } catch (error) {
    console.error(`${debugPrefix} ❌ EXCEPTION:`, error)
    return { balance: 0, vaultAddress: dbcPoolAddress, hasRewards: false }
  }
}

/**
 * Fetch creator rewards from Pump.fun or Bonk.fun
 * 
 * Pump.fun creator fees are stored in a PDA derived from:
 * - Seeds: ["creator_vault", creator_pubkey] (per-creator, NOT per-token)
 * - OR for newer tokens: fees accumulate directly and use collectCreatorFee action
 * 
 * The most reliable method is to use PumpPortal's collectCreatorFee API which will
 * return a transaction if there are fees to claim.
 */
async function getCreatorRewards(
  tokenMint: string, 
  creatorWallet: string,
  poolType: 'pump' | 'bonk' = 'pump'
): Promise<{
  balance: number
  vaultAddress: string
  hasRewards: boolean
}> {
  const debugPrefix = `[GET-CREATOR-REWARDS][${poolType.toUpperCase()}]`
  console.log(`${debugPrefix} ========== FUNCTION START ==========`)
  console.log(`${debugPrefix} Input params:`, {
    tokenMint: tokenMint.slice(0, 12) + '...',
    creatorWallet: creatorWallet.slice(0, 12) + '...',
    poolType,
  })
  
  try {
    const creatorPubkey = new PublicKey(creatorWallet)
    const mintPubkey = new PublicKey(tokenMint)
    const programId = poolType === 'bonk' ? BONK_PROGRAM_ID : PUMP_PROGRAM_ID
    const platformName = poolType === 'bonk' ? 'Bonk.fun' : 'Pump.fun'

    console.log(`${debugPrefix} PublicKeys created:`, {
      creator: creatorPubkey.toBase58().slice(0, 12) + '...',
      mint: mintPubkey.toBase58().slice(0, 12) + '...',
      programId: programId.toBase58().slice(0, 12) + '...',
    })

    let claimableBalance = 0
    let feeAccountAddress = ""

    // ============================================================================
    // METHOD 1: Query Platform API first (fastest and most accurate)
    // Pump.fun frontend API returns creator balance info for tokens
    // ============================================================================
    try {
      const apiUrl = poolType === 'bonk'
        ? `https://api.bonk.fun/coins/${tokenMint}`
        : `https://frontend-api.pump.fun/coins/${tokenMint}`
      
      console.log(`[CREATOR-REWARDS] Querying ${platformName} API for token ${tokenMint.slice(0, 8)}...`)
      
      const response = await fetch(apiUrl, {
        headers: { 
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 (compatible; PropelBot/1.0)",
        },
        signal: AbortSignal.timeout(8000)
      })
      
      if (response.ok) {
        const data = await response.json()
        
        // Check if this is the token creator
        if (data.creator === creatorWallet) {
          // Pump.fun API returns creator_fee_basis_points and may have accumulated fees info
          // The exact field name varies - check common patterns
          const possibleBalanceFields = [
            'creator_balance_sol',
            'creatorBalance',
            'creator_fees_sol',
            'accumulated_fees',
            'unclaimed_fees',
          ]
          
          for (const field of possibleBalanceFields) {
            if (data[field] !== undefined) {
              const balance = parseFloat(data[field])
              if (balance > 0) {
                claimableBalance = balance * LAMPORTS_PER_SOL
                console.log(`[CREATOR-REWARDS] ✅ ${platformName} API: ${balance.toFixed(6)} SOL (field: ${field})`)
                break
              }
            }
          }
          
          // Also capture the bonding curve address if available
          if (data.bonding_curve) {
            feeAccountAddress = data.bonding_curve
          }
        } else {
          console.log(`[CREATOR-REWARDS] ℹ️ Token creator mismatch: ${data.creator?.slice(0, 8)} != ${creatorWallet.slice(0, 8)}`)
        }
      } else {
        console.debug(`[CREATOR-REWARDS] ${platformName} API returned ${response.status}`)
      }
    } catch (apiError) {
      console.debug(`[CREATOR-REWARDS] ${platformName} API error:`, 
        apiError instanceof Error ? apiError.message : "Unknown")
    }

    // ============================================================================
    // METHOD 2: PumpPortal Preview Transaction
    // If API didn't give us balance info, try getting a preview transaction
    // This method creates a transaction without submitting it - we parse it to
    // extract the transfer amount (the claimable fees)
    // ============================================================================
    if (claimableBalance === 0) {
      try {
        console.log(`[CREATOR-REWARDS] Trying ${platformName} PumpPortal preview...`)
        
        const previewResponse = await fetch(PUMPPORTAL_LOCAL_TRADE, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            publicKey: creatorWallet,
            action: "collectCreatorFee",
            mint: tokenMint,
            priorityFee: 0.00001,
            pool: poolType,
          }),
          signal: AbortSignal.timeout(10000)
        })

        if (previewResponse.ok) {
          const contentType = previewResponse.headers.get('content-type')
          
          // Check if it's actually a transaction (binary) or an error (JSON)
          if (contentType?.includes('application/octet-stream') || !contentType?.includes('json')) {
            const txBytes = new Uint8Array(await previewResponse.arrayBuffer())
            
            if (txBytes.length > 10) { // Valid transaction is at least some bytes
              try {
                const tx = VersionedTransaction.deserialize(txBytes)
                const lamports = await extractTransferAmount(tx, creatorPubkey)
                
                if (lamports > 0) {
                  claimableBalance = lamports
                  console.log(`[CREATOR-REWARDS] ✅ ${platformName} preview: ${(lamports / LAMPORTS_PER_SOL).toFixed(6)} SOL claimable`)
                }
              } catch (parseError) {
                console.debug(`[CREATOR-REWARDS] Transaction parse error:`, parseError)
              }
            }
          } else {
            // It returned JSON instead of a transaction - likely an error or "no fees"
            try {
              const jsonResponse = await previewResponse.json()
              if (jsonResponse.error) {
                console.log(`[CREATOR-REWARDS] ℹ️ ${platformName}: ${jsonResponse.error}`)
              }
            } catch {
              // Ignore JSON parse errors
            }
          }
        } else {
          const errorText = await previewResponse.text().catch(() => 'Unknown error')
          // Check for known "no fees" responses
          const noFeesIndicators = ['no fees', 'nothing to claim', 'not found', 'insufficient', '0 SOL']
          const hasNoFees = noFeesIndicators.some(indicator => 
            errorText.toLowerCase().includes(indicator.toLowerCase())
          )
          
          if (hasNoFees) {
            console.log(`[CREATOR-REWARDS] ℹ️ ${platformName}: No fees to claim`)
          } else {
            console.debug(`[CREATOR-REWARDS] ${platformName} preview failed (${previewResponse.status}):`, 
              errorText.slice(0, 100))
          }
        }
      } catch (previewError) {
        console.debug(`[CREATOR-REWARDS] ${platformName} preview error:`, 
          previewError instanceof Error ? previewError.message : "Unknown")
      }
    }

    // ============================================================================
    // METHOD 3: On-chain PDA check (fallback)
    // Try multiple possible PDA derivation patterns that Pump.fun has used
    // Based on working Telegram bot implementation
    // ============================================================================
    if (claimableBalance === 0) {
      console.log(`${debugPrefix} [METHOD 3] API/Preview returned no balance, trying on-chain PDA check...`)
      console.log(`${debugPrefix} [METHOD 3] Deriving PDAs with:`)
      console.log(`${debugPrefix}   - Creator pubkey: ${creatorPubkey.toBase58()}`)
      console.log(`${debugPrefix}   - Mint pubkey: ${mintPubkey.toBase58()}`)
      console.log(`${debugPrefix}   - Program ID: ${programId.toBase58()}`)
      
      // Try multiple PDA patterns that Pump.fun might use
      // NOTE: "creator-vault" (hyphen) is the correct seed based on working Telegram bot
      const pdaPatterns: { seeds: Buffer[]; name: string }[] = [
        // Pattern 1: Per-creator vault (accumulates ALL creator fees across all tokens)
        // This is the primary pattern for Pump.fun creator rewards
        { seeds: [Buffer.from("creator-vault"), creatorPubkey.toBuffer()], name: "creator-vault (per-creator)" },
        // Pattern 2: Per-token fee account (older pattern)
        { seeds: [Buffer.from("creator_fee"), creatorPubkey.toBuffer(), mintPubkey.toBuffer()], name: "creator_fee (per-token)" },
        // Pattern 3: Alternative underscore naming
        { seeds: [Buffer.from("creator_vault"), creatorPubkey.toBuffer()], name: "creator_vault underscore" },
      ]
      
      for (const { seeds, name } of pdaPatterns) {
        try {
          const [pda] = PublicKey.findProgramAddressSync(seeds, programId)
          console.log(`${debugPrefix} [METHOD 3] Trying pattern "${name}": PDA = ${pda.toBase58()}`)
          
          const accountInfo = await connection.getAccountInfo(pda)
          
          if (accountInfo) {
            console.log(`${debugPrefix} [METHOD 3] Account exists! Lamports: ${accountInfo.lamports}`)
          } else {
            console.log(`${debugPrefix} [METHOD 3] Account does not exist`)
          }
          
          if (accountInfo && accountInfo.lamports > 0) {
            // For fee vaults, the full balance is typically claimable
            // (rent is paid separately by the program)
            const balance = accountInfo.lamports
            
            if (balance > 0) {
              feeAccountAddress = pda.toBase58()
              claimableBalance = balance
              console.log(`${debugPrefix} [METHOD 3] ✅ FOUND! ${(balance / LAMPORTS_PER_SOL).toFixed(6)} SOL in vault ${pda.toBase58().slice(0, 12)}...`)
              break
            }
          }
        } catch (pdaError) {
          console.log(`${debugPrefix} [METHOD 3] Pattern "${name}" error:`, pdaError instanceof Error ? pdaError.message : 'Unknown')
        }
      }
      
      if (claimableBalance === 0) {
        console.log(`${debugPrefix} [METHOD 3] No vault found with any pattern`)
      }
    }

    const finalBalance = claimableBalance / LAMPORTS_PER_SOL
    
    console.log(`${debugPrefix} ========== FUNCTION RESULT ==========`)
    console.log(`${debugPrefix} Final balance: ${finalBalance.toFixed(9)} SOL`)
    console.log(`${debugPrefix} Vault address: ${feeAccountAddress || 'none'}`)
    console.log(`${debugPrefix} Has rewards: ${finalBalance > 0}`)
    console.log(`${debugPrefix} ========== FUNCTION END ==========`)

    return {
      balance: finalBalance,
      vaultAddress: feeAccountAddress,
      hasRewards: finalBalance > 0,
    }
  } catch (error) {
    console.error(`${debugPrefix} ❌ EXCEPTION:`, error)
    return { balance: 0, vaultAddress: "", hasRewards: false }
  }
}

/**
 * Extract transfer amount from a VersionedTransaction
 * Uses the proper SystemInstruction decoder to parse transfer instructions
 * Based on the working implementation from the Telegram bot
 */
async function extractTransferAmount(tx: VersionedTransaction, destination: PublicKey): Promise<number> {
  try {
    const message = tx.message
    const staticAccountKeys = message.staticAccountKeys
    
    // Build account keys map (static keys only for now)
    const accountKeys = new Map<number, PublicKey>()
    staticAccountKeys.forEach((key, index) => {
      accountKeys.set(index, key)
    })
    
    // Also need to handle address table lookups for VersionedTransaction
    // For now, we'll work with static keys which should cover most cases
    
    let totalLamports = 0
    
    // Parse compiled instructions
    for (const ix of message.compiledInstructions) {
      const programKey = accountKeys.get(ix.programIdIndex)
      if (!programKey || !programKey.equals(SystemProgram.programId)) {
        continue
      }
      
      // Build the instruction keys array
      const keys = ix.accountKeyIndexes.map((index) => {
        const pubkey = accountKeys.get(index)
        return {
          pubkey: pubkey || PublicKey.default,
          isSigner: message.isAccountSigner(index),
          isWritable: message.isAccountWritable(index),
        }
      })
      
      // Create TransactionInstruction for decoding
      const instruction = new TransactionInstruction({
        programId: programKey,
        keys,
        data: Buffer.from(ix.data),
      })
      
      // Try to decode the instruction type
      let instructionType: string
      try {
        instructionType = SystemInstruction.decodeInstructionType(instruction)
      } catch {
        continue // Not a decodable system instruction
      }
      
      // Handle Transfer and TransferWithSeed instructions
      if (instructionType === 'Transfer') {
        try {
          const transferInfo = SystemInstruction.decodeTransfer(instruction)
          if (transferInfo.toPubkey.equals(destination)) {
            totalLamports += Number(transferInfo.lamports)
          }
        } catch {
          // Failed to decode transfer
        }
      } else if (instructionType === 'TransferWithSeed') {
        try {
          const transferInfo = SystemInstruction.decodeTransferWithSeed(instruction)
          if (transferInfo.toPubkey.equals(destination)) {
            totalLamports += Number(transferInfo.lamports)
          }
        } catch {
          // Failed to decode transfer with seed
        }
      }
    }
    
    return totalLamports
  } catch (error) {
    console.error("[CREATOR-REWARDS] Error extracting transfer amount:", error)
    return 0
  }
}

/**
 * Get rewards for migrated tokens (from Raydium/Meteora LP fees etc)
 */
async function getMigratedTokenRewards(
  tokenMint: string,
  creatorWallet: string,
  poolType: PoolType = 'pump'
): Promise<number> {
  try {
    // For migrated tokens, check if there are any LP rewards
    // Pump.fun tokens migrate to Raydium
    // Bonk.fun tokens migrate to Meteora
    
    // Future: Integrate with Raydium/Meteora API to check LP fee accumulation
    // For now, we return 0 as this requires more complex integration
    return 0
  } catch (error) {
    console.error(`[CREATOR-REWARDS] ${poolType} migration rewards fetch error:`, error)
    return 0
  }
}
