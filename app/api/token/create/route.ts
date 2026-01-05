/**
 * AQUA Launchpad - Token Creation API
 * 
 * Creates a new token on Pump.fun or Bonk.fun via PumpPortal
 * Includes:
 * - IPFS metadata upload (pump.fun or bonk.fun)
 * - Token creation on bonding curve
 * - Optional initial buy (for USD1 pairs, PumpPortal handles SOL->USD1 conversion internally)
 * - Fee collection
 * - Database record creation
 */

import { type NextRequest, NextResponse } from 'next/server';
import { Connection, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { createClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { decryptPrivateKey, getOrCreateServiceSalt } from '@/lib/crypto';
import { validateBalanceForTransaction, collectPlatformFee, TOKEN_CREATION_FEE_LAMPORTS, TOKEN_CREATION_FEE_SOL } from '@/lib/fees';
import { solToLamports, lamportsToSol, calculatePlatformFee } from '@/lib/precision';
import { 
  createToken, 
  uploadToIPFS, 
  type TokenMetadata,
  type PoolType,
  type QuoteMint,
  POOL_TYPES,
  QUOTE_MINTS,
  swapSolToUsd1,
  solToUsd1Amount,
} from '@/lib/blockchain';
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
      decimals = 9,
      
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
      
      // Advanced settings
      migrationThreshold = 85,
      migrationTarget = 'raydium',
      treasuryWallet,
      devWallet,
      
      // Launch options
      initialBuySol = 0,
      slippageBps = 500,
      
      // Pre-generated mint keypair from frontend
      mintSecretKey,
      mintAddress: preGeneratedMintAddress,
      
      // Pool selection (pump or bonk)
      pool = 'pump',
      quoteMint = QUOTE_MINTS.WSOL, // WSOL or USD1 for bonk pools
      autoConvertToUsd1 = false, // Auto-swap SOL to USD1 before creation (for USD1 pairs)
    } = body;

    // Validate required fields
    if (!name || !symbol || !description) {
      return NextResponse.json(
        { success: false, error: { code: 4002, message: 'Name, symbol, and description are required' } },
        { status: 400 }
      );
    }

    if (symbol.length > 10) {
      return NextResponse.json(
        { success: false, error: { code: 4002, message: 'Symbol must be 10 characters or less' } },
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
    const estimatedCostSol = MIN_CREATE_BALANCE_SOL + initialBuySol;
    const operationLamports = solToLamports(estimatedCostSol);
    const priorityFeeLamports = solToLamports(0.001);

    const validation = await validateBalanceForTransaction(
      connection,
      walletAddress,
      operationLamports,
      priorityFeeLamports
    );

    if (!validation.sufficient) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 2001,
            message: validation.error || 'Insufficient balance',
            breakdown: {
              currentBalance: lamportsToSol(validation.currentBalance).toFixed(9),
              required: lamportsToSol(validation.requiredTotal).toFixed(9),
              shortfall: validation.shortfall ? lamportsToSol(validation.shortfall).toFixed(9) : undefined,
            },
          },
        },
        { status: 400 }
      );
    }

    // ========== CREATE TOKEN ON CHAIN ==========
    const poolType = (pool === 'bonk' ? POOL_TYPES.BONK : POOL_TYPES.PUMP) as PoolType;
    const quoteType = (quoteMint === QUOTE_MINTS.USD1 ? QUOTE_MINTS.USD1 : QUOTE_MINTS.WSOL) as QuoteMint;
    
    console.log(`[TOKEN] Creating token: ${name} (${symbol}) on ${poolType} pool${poolType === 'bonk' ? ` (quote: ${quoteType === QUOTE_MINTS.USD1 ? 'USD1' : 'SOL'})` : ''}`);

    // Decode pre-generated mint keypair from frontend if provided
    let mintKeypair: Keypair | undefined;
    if (mintSecretKey) {
      try {
        mintKeypair = Keypair.fromSecretKey(bs58.decode(mintSecretKey));
        console.log(`[TOKEN] Using pre-generated mint: ${mintKeypair.publicKey.toBase58()}`);
        
        // Verify it matches the claimed address
        if (preGeneratedMintAddress && mintKeypair.publicKey.toBase58() !== preGeneratedMintAddress) {
          console.warn(`[TOKEN] Mint address mismatch! Frontend: ${preGeneratedMintAddress}, Decoded: ${mintKeypair.publicKey.toBase58()}`);
        }
      } catch (decodeError) {
        console.warn('[TOKEN] Failed to decode mint keypair, will generate new one');
        mintKeypair = undefined;
      }
    }

    // ========== AUTO-SWAP SOL TO USD1 (for Bonk USD1 pairs) ==========
    let actualInitialBuy = initialBuySol;
    let swapTxSignature: string | undefined;
    
    if (poolType === POOL_TYPES.BONK && quoteType === QUOTE_MINTS.USD1 && autoConvertToUsd1 && initialBuySol > 0) {
      console.log(`[TOKEN] Auto-converting ${initialBuySol} SOL to USD1 for initial buy...`);
      
      const swapResult = await swapSolToUsd1(connection, creatorKeypair, initialBuySol);
      
      if (!swapResult.success) {
        return NextResponse.json(
          { 
            success: false, 
            error: { 
              code: 4001, 
              message: `SOL to USD1 conversion failed: ${swapResult.error}` 
            } 
          },
          { status: 500 }
        );
      }
      
      // For USD1 pairs, the initial buy amount is now in USD1 terms
      actualInitialBuy = swapResult.outputAmount;
      swapTxSignature = swapResult.txSignature;
      console.log(`[TOKEN] ✅ Converted to ${actualInitialBuy.toFixed(2)} USD1`);
      
      // Wait for swap to confirm before proceeding (the USD1 needs to be in the wallet)
      console.log(`[TOKEN] Waiting for swap confirmation...`);
      await connection.confirmTransaction(swapTxSignature, 'confirmed');
      console.log(`[TOKEN] ✅ Swap confirmed, proceeding with token creation`);
    }

    // Prepare metadata
    const metadata: TokenMetadata = {
      name,
      symbol,
      description,
      image: image || 'https://aqua.launchpad/placeholder.png',
      website,
      twitter,
      telegram,
      showName: true,
    };

    // Create token via PumpPortal or Raydium LaunchLab
    // For BONK USD1 pairs, pass initialBuyQuote (USD1 amount after swap)
    // For all other pools, pass initialBuySol (SOL amount)
    const isUsd1Pair = poolType === POOL_TYPES.BONK && quoteType === QUOTE_MINTS.USD1;
    
    const createResult = await createToken(connection, {
      metadata,
      creatorKeypair,
      initialBuySol: isUsd1Pair ? 0 : initialBuySol, // SOL amount for non-USD1 pairs
      initialBuyQuote: isUsd1Pair ? actualInitialBuy : undefined, // USD1 amount (from swap) for USD1 pairs
      slippageBps,
      priorityFee: 0.001,
      mintKeypair,
      pool: poolType,
      quoteMint: quoteType,
    });

    if (!createResult.success || !createResult.mintAddress) {
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            code: 4000, 
            message: createResult.error || 'Token creation failed on chain' 
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

    console.log(`[TOKEN] Collecting fees: ${TOKEN_CREATION_FEE_SOL} SOL (creation) + ${lamportsToSol(percentageFeeLamports)} SOL (2% of ${feeBaseSol} SOL) = ${lamportsToSol(totalFeeLamports)} SOL total`);

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
        'token_create'
      );
    }

    // ========== CREATE DATABASE RECORDS ==========
    
    // Ensure user exists in users table (upsert by wallet address)
    let finalUserId: string | null = userId || null;
    if (userId) {
      // First check if user exists by ID
      const { data: existingUserById } = await (adminClient
        .from('users') as any)
        .select('id')
        .eq('id', userId)
        .single();
      
      if (existingUserById) {
        finalUserId = existingUserById.id;
      } else {
        // User doesn't exist by ID, check by wallet address
        const { data: existingUserByWallet } = await (adminClient
          .from('users') as any)
          .select('id')
          .eq('main_wallet_address', walletAddress)
          .single();
        
        if (existingUserByWallet) {
          // User exists with this wallet, use that ID
          finalUserId = existingUserByWallet.id;
        } else {
          // Create new user with the provided userId
          const { data: newUser, error: userError } = await (adminClient
            .from('users') as any)
            .insert({
              id: userId,
              main_wallet_address: walletAddress,
            })
            .select('id')
            .single();
          
          if (userError || !newUser) {
            // If insert fails (e.g., duplicate wallet), try to get existing user
            const { data: existingUser } = await (adminClient
              .from('users') as any)
              .select('id')
              .eq('main_wallet_address', walletAddress)
              .single();
            
            if (existingUser) {
              finalUserId = existingUser.id;
            } else {
              console.warn('[TOKEN] Failed to create/find user record, proceeding with NULL creator_id:', userError);
              finalUserId = null; // Set to null if user creation fails
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
        creator_id: finalUserId, // Use finalUserId which may be null
        creator_wallet: walletAddress,
        mint_address: createResult.mintAddress,
        name,
        symbol,
        description,
        image_url: metadata.image,
        metadata_uri: createResult.metadataUri,
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
        // Pool type (pump or bonk)
        pool_type: poolType,
        quote_mint: quoteType,
        // Mark as created on our platform
        is_platform_token: true,
      })
      .select('id')
      .single();

    if (insertError || !token) {
      console.error('[TOKEN] Database insert error:', insertError);
      // Token was created on chain but DB insert failed - log for recovery
      return NextResponse.json({
        success: true,
        data: {
          mintAddress: createResult.mintAddress,
          txSignature: createResult.txSignature,
          warning: 'Token created on chain but database record may need recovery',
        },
      });
    }

    // Convert intervals to seconds
    const pourIntervalSeconds = pourInterval === 'hourly' ? 3600 : 86400; // 1 hour or 1 day
    const claimIntervalSeconds = claimInterval === 'hourly' ? 3600 : claimInterval === 'daily' ? 86400 : 604800; // 1 hour, 1 day, or 1 week

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
      operation_type: 'token_create',
      transaction_amount_lamports: Number(solToLamports(feeBaseSol)),
      fee_amount_lamports: Number(totalFeeLamports),
      fee_percentage: 2,
      referral_split_lamports: feeResult.referralShare ? Number(feeResult.referralShare) : 0,
      referrer_id: referrerUserId,
      fee_tx_signature: feeResult.signature,
      fee_collected_at: feeResult.success ? new Date().toISOString() : null,
      status: feeResult.success ? 'collected' : 'pending',
    });

    console.log(`[TOKEN] Created successfully: ${createResult.mintAddress} (pool: ${poolType})`);

    return NextResponse.json({
      success: true,
      data: {
        tokenId: token.id,
        mintAddress: createResult.mintAddress,
        metadataUri: createResult.metadataUri,
        txSignature: createResult.txSignature,
        platformFee: lamportsToSol(totalFeeLamports),
        // Pool info
        pool: poolType,
        quoteMint: quoteType,
        // USD1 swap info (if applicable)
        ...(swapTxSignature && {
          swapTxSignature,
          convertedUsd1Amount: actualInitialBuy,
        }),
      },
    });

  } catch (error) {
    console.error('[TOKEN] Create error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 4000,
          message: 'Token creation failed',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
}
