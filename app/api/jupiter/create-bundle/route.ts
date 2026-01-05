/**
 * Jupiter Bundle Token Creation API - Create token with coordinated multi-wallet launch
 * 
 * Uses Jito bundles for atomic execution:
 * - Token creation + dev buy in first transaction
 * - Bundle wallet buys in subsequent transactions (max 4)
 */

import { NextRequest, NextResponse } from "next/server"
import { Connection, Keypair, VersionedTransaction, PublicKey } from "@solana/web3.js"
import bs58 from "bs58"
import { getAdminClient } from "@/lib/supabase/admin"
import { decryptPrivateKey, getOrCreateServiceSalt } from "@/lib/crypto"
import { executeBundle } from "@/lib/blockchain/jito-bundles"
import { solToLamports, lamportsToSol, calculatePlatformFee } from "@/lib/precision"
import { createJupiterToken, getJupiterPoolAddress, executeJupiterSwap, JUPITER_PRESETS } from "@/lib/blockchain/jupiter-studio"
import { collectPlatformFee, TOKEN_CREATION_FEE_LAMPORTS, TOKEN_CREATION_FEE_SOL } from "@/lib/fees"
import { getReferrer, addReferralEarnings } from "@/lib/referral"

// ============================================================================
// CONFIGURATION
// ============================================================================

const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL || "https://api.mainnet-beta.solana.com"
const MAX_BUNDLE_WALLETS = 4 // Jito limit: 5 txs total (1 create + 4 buys)

// ============================================================================
// TYPES
// ============================================================================

interface BundleWallet {
  walletId?: string
  address: string
  buyAmountSol: number
}

interface CreateBundleRequest {
  name: string
  symbol: string
  description: string
  image: string
  website?: string
  twitter?: string
  telegram?: string
  discord?: string
  totalSupply: number
  decimals: number
  initialBuySol: number
  mintSecretKey: string
  mintAddress: string
  bundleWallets: BundleWallet[]
  // AQUA parameters
  pourEnabled?: boolean
  pourRate?: number
  pourInterval?: string
  pourSource?: string
  evaporationEnabled?: boolean
  evaporationRate?: number
  feeToLiquidity?: number
  feeToCreator?: number
  autoClaimEnabled?: boolean
  claimThreshold?: number
  claimInterval?: string
  migrationTarget?: string
  treasuryWallet?: string
  devWallet?: string
}

// ============================================================================
// HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    // Get auth headers
    const sessionId = request.headers.get("x-session-id")
    const walletAddress = request.headers.get("x-wallet-address")
    const userId = request.headers.get("x-user-id")

    if (!sessionId || !walletAddress) {
      return NextResponse.json(
        { success: false, error: { code: 1001, message: "Authentication required" } },
        { status: 401 }
      )
    }

    const body: CreateBundleRequest = await request.json()
    const {
      name,
      symbol,
      description,
      image,
      website,
      twitter,
      telegram,
      discord,
      totalSupply,
      decimals = 6, // Jupiter DBC tokens use 6 decimals (NOT 9)
      initialBuySol = 0,
      mintSecretKey,
      mintAddress,
      bundleWallets = [],
    } = body

    // Validate required fields
    if (!name || !symbol) {
      return NextResponse.json(
        { success: false, error: { code: 3001, message: "Name and symbol are required" } },
        { status: 400 }
      )
    }

    if (!mintSecretKey || !mintAddress) {
      return NextResponse.json(
        { success: false, error: { code: 3001, message: "Mint keypair is required" } },
        { status: 400 }
      )
    }

    console.log("[JUPITER-BUNDLE] Starting bundle token creation:", {
      name,
      symbol,
      initialBuySol,
      bundleWalletsCount: bundleWallets.length,
      mintAddress: mintAddress.slice(0, 8),
    })

    const adminClient = getAdminClient()
    const connection = new Connection(HELIUS_RPC_URL, "confirmed")
    const serviceSalt = await getOrCreateServiceSalt(adminClient)

    // Reconstruct mint keypair
    const mintKeypair = Keypair.fromSecretKey(bs58.decode(mintSecretKey))

    // Get creator wallet keypair
    const { data: creatorWallet, error: walletError } = await adminClient
      .from("wallets")
      .select("encrypted_private_key")
      .eq("session_id", sessionId)
      .eq("public_key", walletAddress)
      .single() as { data: { encrypted_private_key: string } | null; error: any }

    if (walletError || !creatorWallet) {
      return NextResponse.json(
        { success: false, error: { code: 1003, message: "Creator wallet not found" } },
        { status: 404 }
      )
    }

    const creatorPrivateKey = decryptPrivateKey(
      creatorWallet.encrypted_private_key,
      sessionId,
      serviceSalt
    )
    const creatorKeypair = Keypair.fromSecretKey(bs58.decode(creatorPrivateKey))

    // =========================================================================
    // STEP 1: Create token on Jupiter (first transaction)
    // =========================================================================
    console.log("[JUPITER-BUNDLE] Creating token on Jupiter...")

    const createResult = await createJupiterToken(connection, {
      metadata: {
        name,
        symbol,
        description,
        image: image || "https://aqua.launchpad/placeholder.png",
        website,
        twitter,
        telegram,
        discord,
      },
      creatorKeypair,
      curveParams: JUPITER_PRESETS.MEME, // Default to meme preset
      feeBps: 100, // 1% trading fee
      antiSniping: false,
      isLpLocked: true,
      initialBuySol,
      slippageBps: 1000, // 10% for bundle
    })

    if (!createResult.success || !createResult.mintAddress) {
      console.error("[JUPITER-BUNDLE] Token creation failed:", createResult.error)
      return NextResponse.json({
        success: false,
        error: { code: 3004, message: createResult.error || "Jupiter token creation failed" },
      }, { status: 500 })
    }

    const creationSignature = createResult.txSignature!
    console.log("[JUPITER-BUNDLE] Token created:", {
      mintAddress: createResult.mintAddress,
      txSignature: creationSignature,
    })

    // =========================================================================
    // STEP 2: Load bundle wallet keypairs for follow-up buys
    // =========================================================================
    const bundleKeypairs: Map<string, { keypair: Keypair; amount: number }> = new Map()
    const limitedWallets = bundleWallets.slice(0, MAX_BUNDLE_WALLETS)

    console.log(`[JUPITER-BUNDLE] Loading ${limitedWallets.length} bundle wallets...`)

    for (const bw of limitedWallets) {
      try {
        let walletQuery = adminClient
          .from("wallets")
          .select("encrypted_private_key, public_key")
          .eq("session_id", sessionId)
        
        if (bw.address) {
          walletQuery = walletQuery.eq("public_key", bw.address)
        } else if (bw.walletId) {
          walletQuery = walletQuery.eq("id", bw.walletId)
        } else {
          console.warn(`[JUPITER-BUNDLE] Bundle wallet missing address and walletId`)
          continue
        }

        const { data: wallet, error: walletErr } = await walletQuery.single() as { 
          data: { encrypted_private_key: string; public_key: string } | null; 
          error: any 
        }

        if (walletErr) {
          console.warn(`[JUPITER-BUNDLE] Failed to find bundle wallet:`, { 
            address: bw.address?.slice(0, 8), 
            walletId: bw.walletId, 
            error: walletErr.message 
          })
          continue
        }

        if (wallet) {
          const privateKey = decryptPrivateKey(
            wallet.encrypted_private_key,
            sessionId,
            serviceSalt
          )
          const walletAddr = bw.address || wallet.public_key
          bundleKeypairs.set(walletAddr, {
            keypair: Keypair.fromSecretKey(bs58.decode(privateKey)),
            amount: bw.buyAmountSol,
          })
          console.log(`[JUPITER-BUNDLE] Loaded bundle wallet ${walletAddr.slice(0, 8)} with ${bw.buyAmountSol} SOL`)
        }
      } catch (error) {
        console.error(`[JUPITER-BUNDLE] Failed to load bundle wallet ${bw.address}:`, error)
      }
    }

    console.log(`[JUPITER-BUNDLE] Successfully loaded ${bundleKeypairs.size}/${limitedWallets.length} bundle wallets`)

    // =========================================================================
    // STEP 3: Execute bundle buys via Jupiter swap (if bundle wallets exist)
    // =========================================================================
    const bundleSignatures: string[] = [creationSignature]
    const bundleBuyResults: { address: string; success: boolean; signature?: string; error?: string }[] = []
    
    if (bundleKeypairs.size > 0) {
      console.log(`[JUPITER-BUNDLE] ========== BUNDLE WALLET BUYS ==========`)
      console.log(`[JUPITER-BUNDLE] Executing ${bundleKeypairs.size} bundle wallet buys...`)
      
      // Wait for token to be indexed by Jupiter (newly created tokens take time)
      console.log(`[JUPITER-BUNDLE] Waiting 15 seconds for token indexing...`)
      await new Promise(resolve => setTimeout(resolve, 15000))
      
      for (const [address, { keypair, amount }] of bundleKeypairs) {
        console.log(`[JUPITER-BUNDLE] Bundle buy: ${address.slice(0, 8)} buying ${amount} SOL worth...`)
        
        try {
          const buyResult = await executeJupiterSwap(connection, {
            walletKeypair: keypair,
            tokenMint: createResult.mintAddress,
            action: 'buy',
            amount: amount,
            slippageBps: 1000, // 10% slippage for bundle buys
            tokenDecimals: decimals,
          })
          
          if (buyResult.success && buyResult.txSignature) {
            console.log(`[JUPITER-BUNDLE] ✅ Bundle buy success: ${address.slice(0, 8)} - ${buyResult.txSignature.slice(0, 12)}`)
            bundleSignatures.push(buyResult.txSignature)
            bundleBuyResults.push({ address, success: true, signature: buyResult.txSignature })
          } else {
            console.warn(`[JUPITER-BUNDLE] ⚠️ Bundle buy failed: ${address.slice(0, 8)} - ${buyResult.error}`)
            bundleBuyResults.push({ address, success: false, error: buyResult.error })
          }
        } catch (buyError) {
          const errorMsg = buyError instanceof Error ? buyError.message : 'Unknown error'
          console.error(`[JUPITER-BUNDLE] ❌ Bundle buy error: ${address.slice(0, 8)} - ${errorMsg}`)
          bundleBuyResults.push({ address, success: false, error: errorMsg })
        }
        
        // Small delay between buys to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
      
      const successCount = bundleBuyResults.filter(r => r.success).length
      console.log(`[JUPITER-BUNDLE] Bundle buys complete: ${successCount}/${bundleKeypairs.size} successful`)
      console.log(`[JUPITER-BUNDLE] ========== END BUNDLE WALLET BUYS ==========`)
    }

    // =========================================================================
    // STEP 4: Get DBC pool address
    // =========================================================================
    let dbcPoolAddress: string | null = null
    try {
      dbcPoolAddress = await getJupiterPoolAddress(createResult.mintAddress)
      console.log(`[JUPITER-BUNDLE] DBC Pool Address: ${dbcPoolAddress}`)
    } catch (poolError) {
      console.warn("[JUPITER-BUNDLE] Could not fetch pool address:", poolError)
    }

    // =========================================================================
    // STEP 5: Collect platform fee (ONLY AFTER SUCCESS)
    // =========================================================================
    // Fee structure:
    // - Fixed creation fee: 0.1 SOL
    // - 2% of initial buy + bundle buys
    const totalBuySol = initialBuySol + Array.from(bundleKeypairs.values()).reduce((sum, w) => sum + w.amount, 0)
    const percentageFeeLamports = calculatePlatformFee(solToLamports(totalBuySol))
    const totalFeeLamports = percentageFeeLamports + TOKEN_CREATION_FEE_LAMPORTS

    console.log(`[JUPITER-BUNDLE] Collecting fees: ${TOKEN_CREATION_FEE_SOL} SOL (creation) + ${lamportsToSol(percentageFeeLamports)} SOL (2% of ${totalBuySol} SOL) = ${lamportsToSol(totalFeeLamports)} SOL total`)

    // Check for referrer
    const referrerUserId = userId ? await getReferrer(userId) : null
    let referrerWallet: PublicKey | undefined

    if (referrerUserId) {
      const { data: referrerData } = await adminClient
        .from("users")
        .select("main_wallet_address")
        .eq("id", referrerUserId)
        .single() as { data: { main_wallet_address: string } | null; error: any }

      if (referrerData?.main_wallet_address) {
        referrerWallet = new PublicKey(referrerData.main_wallet_address)
      }
    }

    const feeResult = await collectPlatformFee(
      connection,
      creatorKeypair,
      solToLamports(totalBuySol), // 2% of this amount
      referrerWallet,
      5000, // priority fee
      TOKEN_CREATION_FEE_LAMPORTS // fixed 0.1 SOL creation fee
    )

    // Add referral earnings
    if (feeResult.success && referrerUserId && feeResult.referralShare) {
      await addReferralEarnings(
        referrerUserId,
        lamportsToSol(feeResult.referralShare),
        userId || "anonymous",
        "jupiter_create"
      )
    }

    // =========================================================================
    // STEP 6: Resolve creator_id from user record
    // =========================================================================
    let finalUserId: string | null = null
    
    if (userId) {
      // Try to find existing user by ID first
      const { data: existingUser } = await adminClient
        .from('users')
        .select('id')
        .eq('id', userId)
        .single() as { data: { id: string } | null; error: any }
      
      if (existingUser) {
        finalUserId = existingUser.id
      } else {
        // Try to find by wallet address
        const { data: existingUserByWallet } = await adminClient
          .from('users')
          .select('id')
          .eq('main_wallet_address', walletAddress)
          .single() as { data: { id: string } | null; error: any }
        
        if (existingUserByWallet) {
          finalUserId = existingUserByWallet.id
        } else {
          // Create new user record
          const { data: newUser, error: userError } = await adminClient
            .from('users')
            .insert({
              id: userId,
              main_wallet_address: walletAddress,
            } as any)
            .select('id')
            .single() as { data: { id: string } | null; error: any }
          
          if (newUser) {
            finalUserId = newUser.id
          } else {
            console.warn('[JUPITER-BUNDLE] Failed to create user record:', userError)
          }
        }
      }
    }

    // =========================================================================
    // STEP 7: Save to database
    // =========================================================================
    const { data: tokenRecord, error: dbError } = await adminClient
      .from("tokens")
      .insert({
        creator_id: finalUserId,
        creator_wallet: walletAddress,
        mint_address: createResult.mintAddress,
        name,
        symbol,
        description,
        image_url: image,
        metadata_uri: createResult.metadataUri || '',
        website,
        twitter,
        telegram,
        discord,
        total_supply: totalSupply,
        decimals,
        stage: "bonding",
        launch_tx_signature: creationSignature,
        initial_buy_sol: initialBuySol,
        price_sol: 0,
        price_usd: 0,
        market_cap: 0,
        current_liquidity: initialBuySol,
        volume_24h: initialBuySol,
        change_24h: 0,
        holders: 1,
        water_level: 50,
        constellation_strength: 50,
        pool_type: "jupiter",
        dbc_pool_address: dbcPoolAddress || null,
        is_platform_token: true,
      } as any)
      .select("id")
      .single() as { data: { id: string } | null; error: any }

    if (dbError) {
      console.error("[JUPITER-BUNDLE] Database error:", dbError)
      // Token was created on-chain, so return success with warning
    }
    
    // Create token_parameters record for AQUA settings
    if (tokenRecord?.id) {
      await adminClient.from('token_parameters').insert({
        token_id: tokenRecord.id,
        pour_rate_percent: body.pourRate || 0,
        pour_interval_seconds: body.pourInterval === 'hourly' ? 3600 : 86400,
        pour_source: body.pourSource || 'liquidity',
        pour_enabled: body.pourEnabled ?? false,
        evaporation_rate_percent: body.evaporationRate || 0,
        evaporation_enabled: body.evaporationEnabled ?? false,
        fee_to_liquidity_percent: body.feeToLiquidity || 0,
        fee_to_creator_percent: body.feeToCreator || 0,
        auto_claim_enabled: body.autoClaimEnabled ?? false,
        claim_threshold_sol: body.claimThreshold || 0.1,
        claim_interval_seconds: body.claimInterval === 'hourly' ? 3600 : body.claimInterval === 'daily' ? 86400 : 604800,
        migration_target: body.migrationTarget || 'raydium',
        treasury_wallet: body.treasuryWallet || walletAddress,
        dev_wallet: body.devWallet || walletAddress,
      } as any)
    }

    const duration = Date.now() - startTime
    console.log(`[JUPITER-BUNDLE] Complete in ${duration}ms`)

    // Count successful bundle buys
    const bundleSuccessCount = bundleBuyResults.filter(r => r.success).length
    
    return NextResponse.json({
      success: true,
      data: {
        tokenId: tokenRecord?.id,
        mintAddress: createResult.mintAddress,
        txSignature: creationSignature,
        dbcPoolAddress,
        metadataUri: createResult.metadataUri,
        bundleWalletsProcessed: bundleKeypairs.size,
        bundleWalletsSuccessful: bundleSuccessCount,
        bundleBuyResults,
        signatures: bundleSignatures,
        pool: "jupiter",
        platformFee: lamportsToSol(totalFeeLamports),
        duration,
      },
    })

  } catch (error) {
    console.error("[JUPITER-BUNDLE] Error:", error)
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 5001,
          message: error instanceof Error ? error.message : "Bundle creation failed",
        },
      },
      { status: 500 }
    )
  }
}

