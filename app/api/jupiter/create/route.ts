/**
 * AQUA Launchpad - Jupiter Token Creation API
 * 
 * Creates a new token on Jupiter's Dynamic Bonding Curve (DBC)
 * Includes:
 * - Metadata upload via Jupiter presigned URLs
 * - Token creation on DBC pool
 * - Optional initial buy (performed after creation)
 * - Fee collection
 * - Database record creation
 */

import { type NextRequest, NextResponse } from 'next/server';
import { Connection, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { getAdminClient } from '@/lib/supabase/admin';
import { decryptPrivateKey, getOrCreateServiceSalt } from '@/lib/crypto';
import { validateBalanceForTransaction, collectPlatformFee, TOKEN_CREATION_FEE_LAMPORTS, TOKEN_CREATION_FEE_SOL } from '@/lib/fees';
import { solToLamports, lamportsToSol, calculatePlatformFee } from '@/lib/precision';
import { 
  createJupiterTokenWithBuy, 
  validateJupiterTokenParams, 
  JUPITER_PRESETS,
  JUPITER_QUOTE_MINTS,
  type JupiterCurveParams,
} from '@/lib/blockchain/jupiter-studio';
import { getReferrer, addReferralEarnings } from '@/lib/referral';

// ============================================================================
// CONFIGURATION
// ============================================================================

const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com';
const MIN_CREATE_BALANCE_SOL = 0.05; // Minimum SOL needed to create token

// ============================================================================
// HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    // Get auth headers
    const sessionId = request.headers.get('x-session-id');
    const walletAddress = request.headers.get('x-wallet-address');
    const userId = request.headers.get('x-user-id');

    if (!sessionId || !walletAddress) {
      return NextResponse.json(
        { success: false, error: { code: 1001, message: 'Wallet connection required' } },
        { status: 401 }
      );
    }

    const adminClient = getAdminClient();
    const connection = new Connection(HELIUS_RPC_URL, 'confirmed');

    // Parse request body
    const body = await request.json();
    const {
      // Basic info
      name,
      symbol,
      description,
      image, // Base64 or URL
      
      // Social links
      website,
      twitter,
      telegram,
      discord,
      
      // Token settings
      totalSupply = 1_000_000_000,
      decimals = 6, // Jupiter DBC tokens use 6 decimals (NOT 9)
      
      // AQUA parameters - Pour Rate
      pourEnabled = true,
      pourRate = 2,
      pourInterval = 'hourly',
      pourSource = 'fees',
      
      // AQUA parameters - Evaporation
      evaporationEnabled = false,
      evaporationRate = 1,
      
      // Fee distribution
      feeToLiquidity = 25,
      feeToCreator = 75,
      
      // Auto-harvest settings
      autoClaimEnabled = true,
      claimThreshold = 0.1,
      claimInterval = 'daily',
      
      // Jupiter-specific settings
      preset = 'meme', // 'meme' or 'indie'
      quoteMint = 'usdc', // 'usdc', 'sol', or 'jup'
      initialMarketCap,
      migrationMarketCap,
      feeBps = 100, // 1% trading fee
      antiSniping = false,
      isLpLocked = true,
      
      // Advanced settings
      migrationThreshold = 85,
      migrationTarget = 'raydium',
      treasuryWallet,
      devWallet,
      
      // Launch options
      initialBuySol = 0,
      slippageBps = 500,
      
      // Pre-generated mint keypair from frontend (not used by Jupiter, but kept for consistency)
      mintSecretKey,
      mintAddress: preGeneratedMintAddress,
    } = body;

    // ========== VALIDATION ==========
    const validation = validateJupiterTokenParams({ name, symbol, decimals });
    
    if (!validation.valid) {
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            code: 4002, 
            message: 'Validation failed', 
            details: validation.errors 
          } 
        },
        { status: 400 }
      );
    }

    if (!description) {
      return NextResponse.json(
        { success: false, error: { code: 4002, message: 'Description is required' } },
        { status: 400 }
      );
    }

    // Get user's wallet keypair
    // Cast to any to bypass strict Supabase typing (table schema not in generated types)
    const { data: wallet, error: walletError } = await (adminClient
      .from('wallets') as any)
      .select('encrypted_private_key')
      .eq('session_id', sessionId)
      .eq('public_key', walletAddress)
      .single();

    if (walletError || !wallet) {
      return NextResponse.json(
        { success: false, error: { code: 1003, message: 'Wallet not found' } },
        { status: 404 }
      );
    }

    // Decrypt private key
    const serviceSalt = await getOrCreateServiceSalt(adminClient);
    const privateKeyBase58 = decryptPrivateKey(wallet.encrypted_private_key, sessionId, serviceSalt);
    const creatorKeypair = Keypair.fromSecretKey(bs58.decode(privateKeyBase58));

    // ========== BALANCE VALIDATION ==========
    const estimatedCostSol = MIN_CREATE_BALANCE_SOL + initialBuySol + TOKEN_CREATION_FEE_SOL;
    const operationLamports = solToLamports(estimatedCostSol);
    const priorityFeeLamports = solToLamports(0.001);

    const balanceValidation = await validateBalanceForTransaction(
      connection,
      walletAddress,
      operationLamports,
      priorityFeeLamports
    );

    if (!balanceValidation.sufficient) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 2001,
            message: balanceValidation.error || 'Insufficient balance',
            breakdown: {
              currentBalance: lamportsToSol(balanceValidation.currentBalance).toFixed(9),
              required: lamportsToSol(balanceValidation.requiredTotal).toFixed(9),
              shortfall: balanceValidation.shortfall ? lamportsToSol(balanceValidation.shortfall).toFixed(9) : undefined,
            },
          },
        },
        { status: 400 }
      );
    }

    // ========== BUILD CURVE PARAMETERS ==========
    // Determine quote mint
    let selectedQuoteMint: string;
    let tokenQuoteDecimal: number;
    
    switch (quoteMint.toLowerCase()) {
      case 'sol':
        selectedQuoteMint = JUPITER_QUOTE_MINTS.SOL;
        tokenQuoteDecimal = 9;
        break;
      case 'jup':
        selectedQuoteMint = JUPITER_QUOTE_MINTS.JUP;
        tokenQuoteDecimal = 6;
        break;
      case 'usdc':
      default:
        selectedQuoteMint = JUPITER_QUOTE_MINTS.USDC;
        tokenQuoteDecimal = 6;
        break;
    }

    // Build curve params - use preset or custom values
    let curveParams: JupiterCurveParams;
    
    if (preset === 'indie') {
      curveParams = {
        ...JUPITER_PRESETS.INDIE,
        quoteMint: selectedQuoteMint,
        tokenQuoteDecimal,
      };
    } else {
      // Default to meme preset
      curveParams = {
        ...JUPITER_PRESETS.MEME,
        quoteMint: selectedQuoteMint,
        tokenQuoteDecimal,
      };
    }

    // Override with custom values if provided
    if (initialMarketCap) {
      curveParams.initialMarketCap = initialMarketCap;
    }
    if (migrationMarketCap) {
      curveParams.migrationMarketCap = migrationMarketCap;
    }

    // ========== CREATE TOKEN ON JUPITER ==========
    console.log(`[JUPITER] Creating token: ${name} (${symbol})`);
    console.log(`[JUPITER] Preset: ${preset}, Quote: ${quoteMint}`);
    console.log(`[JUPITER] Curve: ${curveParams.initialMarketCap} -> ${curveParams.migrationMarketCap}`);

    // Create token via Jupiter Studio API
    const createResult = await createJupiterTokenWithBuy(connection, {
      metadata: {
        name,
        symbol,
        description,
        image: image || 'https://aqua.launchpad/placeholder.png',
        website,
        twitter,
        telegram,
        discord,
      },
      creatorKeypair,
      curveParams,
      feeBps,
      antiSniping,
      isLpLocked,
      initialBuySol,
      slippageBps,
    });

    if (!createResult.success || !createResult.mintAddress) {
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            code: 4000, 
            message: createResult.error || 'Jupiter token creation failed' 
          } 
        },
        { status: 500 }
      );
    }

    // ========== COLLECT PLATFORM FEE (ONLY AFTER SUCCESS) ==========
    // Fee structure:
    // - Fixed creation fee: 0.1 SOL
    // - 2% of initial buy (if any)
    const feeBaseSol = initialBuySol; // 2% only applies to initial buy
    const percentageFeeLamports = calculatePlatformFee(solToLamports(feeBaseSol));
    const totalFeeLamports = percentageFeeLamports + TOKEN_CREATION_FEE_LAMPORTS;

    console.log(`[JUPITER] Collecting fees: ${TOKEN_CREATION_FEE_SOL} SOL (creation) + ${lamportsToSol(percentageFeeLamports)} SOL (2% of ${feeBaseSol} SOL) = ${lamportsToSol(totalFeeLamports)} SOL total`);

    // Check for referrer
    const referrerUserId = userId ? await getReferrer(userId) : null;
    let referrerWallet;

    if (referrerUserId) {
      const { data: referrerData } = await (adminClient
        .from('users') as any)
        .select('main_wallet_address')
        .eq('id', referrerUserId)
        .single();

      if (referrerData?.main_wallet_address) {
        const { PublicKey } = await import('@solana/web3.js');
        referrerWallet = new PublicKey(referrerData.main_wallet_address);
      }
    }

    const feeResult = await collectPlatformFee(
      connection,
      creatorKeypair,
      solToLamports(feeBaseSol), // 2% of this amount
      referrerWallet,
      5000, // priority fee
      TOKEN_CREATION_FEE_LAMPORTS // fixed 0.1 SOL creation fee
    );

    // Add referral earnings
    if (feeResult.success && referrerUserId && feeResult.referralShare) {
      await addReferralEarnings(
        referrerUserId,
        lamportsToSol(feeResult.referralShare),
        userId || 'anonymous',
        'jupiter_create'
      );
    }

    // ========== CREATE DATABASE RECORDS ==========
    
    // Ensure user exists in users table
    let finalUserId: string | null = userId || null;
    if (userId) {
      const { data: existingUserById } = await (adminClient
        .from('users') as any)
        .select('id')
        .eq('id', userId)
        .single();
      
      if (existingUserById) {
        finalUserId = existingUserById.id;
      } else {
        const { data: existingUserByWallet } = await (adminClient
          .from('users') as any)
          .select('id')
          .eq('main_wallet_address', walletAddress)
          .single();
        
        if (existingUserByWallet) {
          finalUserId = existingUserByWallet.id;
        } else {
          const { data: newUser, error: userError } = await (adminClient
            .from('users') as any)
            .insert({
              id: userId,
              main_wallet_address: walletAddress,
            })
            .select('id')
            .single();
          
          if (userError || !newUser) {
            const { data: existingUser } = await (adminClient
              .from('users') as any)
              .select('id')
              .eq('main_wallet_address', walletAddress)
              .single();
            
            if (existingUser) {
              finalUserId = existingUser.id;
            } else {
              console.warn('[JUPITER] Failed to create/find user record, proceeding with NULL creator_id:', userError);
              finalUserId = null;
            }
          } else {
            finalUserId = newUser.id;
          }
        }
      }
    } else {
      finalUserId = null;
    }
    
    // Create token record
    const { data: token, error: insertError } = await (adminClient
      .from('tokens') as any)
      .insert({
        creator_id: finalUserId,
        creator_wallet: walletAddress,
        mint_address: createResult.mintAddress,
        name,
        symbol,
        description,
        image_url: createResult.imageUrl || '',
        metadata_uri: createResult.metadataUri || '',
        total_supply: totalSupply,
        decimals,
        stage: 'bonding',
        migration_threshold: migrationThreshold,
        website,
        twitter,
        telegram,
        discord,
        launch_tx_signature: createResult.txSignature,
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
        // Jupiter specific
        pool_type: 'jupiter',
        dbc_pool_address: createResult.dbcPoolAddress || null,
        // Mark as created on our platform
        is_platform_token: true,
      })
      .select('id')
      .single();

    if (insertError || !token) {
      console.error('[JUPITER] Database insert error:', insertError);
      // Token was created on chain but DB insert failed - log for recovery
      return NextResponse.json({
        success: true,
        data: {
          mintAddress: createResult.mintAddress,
          txSignature: createResult.txSignature,
          dbcPoolAddress: createResult.dbcPoolAddress,
          warning: 'Token created on chain but database record may need recovery',
        },
      });
    }

    // Convert intervals to seconds
    const pourIntervalSeconds = pourInterval === 'hourly' ? 3600 : 86400;
    const claimIntervalSeconds = claimInterval === 'hourly' ? 3600 : claimInterval === 'daily' ? 86400 : 604800;

    // Create token parameters with AQUA settings
    await (adminClient.from('token_parameters') as any).insert({
      token_id: token.id,
      creator_wallet: walletAddress,
      
      // Pour Rate settings
      pour_enabled: pourEnabled,
      pour_rate_percent: pourRate,
      pour_interval_seconds: pourIntervalSeconds,
      pour_source: pourSource,
      pour_max_per_interval_sol: 1.0,
      pour_min_trigger_sol: 0.01,
      
      // Evaporation settings
      evaporation_enabled: evaporationEnabled,
      evaporation_rate_percent: evaporationRate,
      evaporation_interval_seconds: 86400,
      evaporation_source: 'fees',
      
      // Fee distribution
      fee_to_liquidity_percent: feeToLiquidity,
      fee_to_creator_percent: feeToCreator,
      
      // Auto-harvest settings
      auto_claim_enabled: autoClaimEnabled,
      claim_threshold_sol: claimThreshold,
      claim_interval_seconds: claimIntervalSeconds,
      claim_destination_wallet: walletAddress,
      
      // Advanced settings
      migration_target: migrationTarget,
      treasury_wallet: treasuryWallet || walletAddress,
      dev_wallet_address: devWallet || walletAddress,
      dev_wallet_auto_enabled: true,
    });

    // Create tide harvest record
    await (adminClient.from('tide_harvest_logs') as any).insert({
      token_id: token.id,
      creator_id: userId,
      amount_sol: 0,
      destination_wallet: walletAddress,
      status: 'pending',
    });

    // Log platform fee
    await (adminClient.from('platform_fees') as any).insert({
      user_id: userId,
      wallet_address: walletAddress,
      source_tx_signature: createResult.txSignature,
      operation_type: 'jupiter_create',
      transaction_amount_lamports: Number(solToLamports(feeBaseSol)),
      fee_amount_lamports: Number(totalFeeLamports),
      fee_percentage: 2,
      referral_split_lamports: feeResult.referralShare ? Number(feeResult.referralShare) : 0,
      referrer_id: referrerUserId,
      fee_tx_signature: feeResult.signature,
      fee_collected_at: feeResult.success ? new Date().toISOString() : null,
      status: feeResult.success ? 'collected' : 'pending',
    });

    console.log(`[JUPITER] Created successfully: ${createResult.mintAddress}`);

    return NextResponse.json({
      success: true,
      data: {
        tokenId: token.id,
        mintAddress: createResult.mintAddress,
        metadataUri: createResult.metadataUri,
        txSignature: createResult.txSignature,
        dbcPoolAddress: createResult.dbcPoolAddress,
        platformFee: lamportsToSol(totalFeeLamports),
        pool: 'jupiter',
        preset,
        curveParams: {
          quoteMint: quoteMint,
          initialMarketCap: curveParams.initialMarketCap,
          migrationMarketCap: curveParams.migrationMarketCap,
        },
      },
    });

  } catch (error) {
    console.error('[JUPITER] Create error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 4000,
          message: 'Jupiter token creation failed',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
}
