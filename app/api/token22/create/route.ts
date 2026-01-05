/**
 * AQUA Launchpad - Token-2022 Creation API
 * 
 * Creates a new Token-2022 token with advanced features:
 * - Transfer fee extension (optional)
 * - MetadataPointer extension
 * - Authority revocation options
 * - IPFS metadata upload
 * - Optional Raydium pool creation (Phase 3)
 */

import { type NextRequest, NextResponse } from 'next/server';
import { Connection, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { getAdminClient } from '@/lib/supabase/admin';
import { decryptPrivateKey, getOrCreateServiceSalt } from '@/lib/crypto';
import { validateBalanceForTransaction, collectPlatformFee } from '@/lib/fees';
import { solToLamports, lamportsToSol, calculatePlatformFee } from '@/lib/precision';
import { createToken22, validateToken22Params } from '@/lib/blockchain/token22';
import { getReferrer, addReferralEarnings } from '@/lib/referral';

// ============================================================================
// CONFIGURATION
// ============================================================================

const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com';
const TOKEN22_PLATFORM_FEE_SOL = 0.2; // Platform fee for Token-2022 creation
const MIN_CREATE_BALANCE_SOL = 0.03; // Minimum SOL needed for rent/transaction fees

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
      totalSupply = '1000000000',
      decimals = 6,
      
      // Token-2022 Extensions
      enableTransferFee = false,
      transferFeeBasisPoints = 0, // 0-500 (5%)
      maxTransferFee = 0, // Max fee per transfer in raw units
      
      // Authority options
      revokeMintAuthority = true, // Default true for DEX compatibility
      revokeFreezeAuthority = false,
      
      // Distribution (for Phase 2)
      teamAllocation = 0, // percentage kept by team
      lpAllocation = 100, // percentage for LP
      lockedAllocation = 0, // percentage to lock
      lockDurationDays = 0,
      
      // Pool options (for Phase 3)
      autoCreatePool = false,
      poolSolAmount = '0',
      lockLpTokens = false,
      lpLockDurationDays = 0,
      
      // Pre-generated mint keypair from frontend
      mintSecretKey,
      mintAddress: preGeneratedMintAddress,
      
      // Anti-sniper configuration
      antiSniper,
      
      // Bundle configuration
      launchWithBundle = false,
      bundleWallets = [],
    } = body;

    // ========== VALIDATION ==========
    const validation = validateToken22Params({
      name,
      symbol,
      decimals,
      totalSupply,
      transferFeeBasisPoints: enableTransferFee ? transferFeeBasisPoints : 0,
    });

    // Log warnings (non-blocking)
    if (validation.warnings && validation.warnings.length > 0) {
      console.log('[TOKEN22] Validation warnings:', validation.warnings);
    }

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

    // ========== GET WALLET KEYPAIR ==========
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
    // Total cost = platform fee (0.2 SOL) + rent/tx fees + optional pool SOL
    const estimatedCostSol = TOKEN22_PLATFORM_FEE_SOL + MIN_CREATE_BALANCE_SOL + (autoCreatePool ? parseFloat(poolSolAmount) : 0);
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
              platformFee: TOKEN22_PLATFORM_FEE_SOL.toFixed(2),
              rentAndFees: MIN_CREATE_BALANCE_SOL.toFixed(4),
            },
          },
        },
        { status: 400 }
      );
    }

    // ========== CREATE TOKEN-2022 ON CHAIN ==========
    console.log(`[TOKEN22] Creating token: ${name} (${symbol})`);
    console.log(`[TOKEN22] Transfer fee: ${enableTransferFee ? `${transferFeeBasisPoints} bps` : 'disabled'}`);

    // Decode pre-generated mint keypair from frontend if provided
    let mintKeypair: Keypair | undefined;
    if (mintSecretKey) {
      try {
        mintKeypair = Keypair.fromSecretKey(bs58.decode(mintSecretKey));
        console.log(`[TOKEN22] Using pre-generated mint: ${mintKeypair.publicKey.toBase58()}`);
        
        // Verify it matches the claimed address
        if (preGeneratedMintAddress && mintKeypair.publicKey.toBase58() !== preGeneratedMintAddress) {
          console.warn(`[TOKEN22] Mint address mismatch! Frontend: ${preGeneratedMintAddress}, Decoded: ${mintKeypair.publicKey.toBase58()}`);
        }
      } catch (decodeError) {
        console.warn('[TOKEN22] Failed to decode mint keypair, will generate new one');
        mintKeypair = undefined;
      }
    }

    // Calculate max transfer fee in raw units
    const maxTransferFeeRaw = maxTransferFee 
      ? BigInt(Math.floor(parseFloat(String(maxTransferFee)) * Math.pow(10, decimals)))
      : BigInt(0);

    // Create Token-2022
    const createResult = await createToken22(connection, {
      name,
      symbol,
      description,
      decimals,
      totalSupply,
      image,
      website,
      twitter,
      telegram,
      enableTransferFee,
      transferFeeBasisPoints,
      maxTransferFee: maxTransferFeeRaw,
      revokeMintAuthority,
      revokeFreezeAuthority,
      creatorKeypair,
      mintKeypair,
    });

    if (!createResult.success || !createResult.mintAddress) {
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            code: 4000, 
            message: createResult.error || 'Token-2022 creation failed on chain' 
          } 
        },
        { status: 500 }
      );
    }

    // ========== COLLECT PLATFORM FEE (0.2 SOL) ==========
    // Platform fee is charged AFTER successful token creation
    const platformFeeSol = TOKEN22_PLATFORM_FEE_SOL;
    const platformFeeLamports = solToLamports(platformFeeSol);

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
      platformFeeLamports,
      referrerWallet
    );

    // Add referral earnings
    if (feeResult.success && referrerUserId && feeResult.referralShare) {
      await addReferralEarnings(
        referrerUserId,
        lamportsToSol(feeResult.referralShare),
        userId || 'anonymous',
        'token22_create'
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
            console.warn('[TOKEN22] Failed to create user record, proceeding with NULL creator_id');
            finalUserId = null;
          } else {
            finalUserId = newUser.id;
          }
        }
      }
    } else {
      finalUserId = null;
    }
    
    // Create token record with token_standard = 'token22'
    const { data: token, error: insertError } = await (adminClient
      .from('tokens') as any)
      .insert({
        creator_id: finalUserId,
        creator_wallet: walletAddress,
        mint_address: createResult.mintAddress,
        name,
        symbol,
        description,
        image_url: image || '',
        metadata_uri: createResult.metadataUri || '',
        total_supply: parseFloat(totalSupply),
        decimals,
        stage: autoCreatePool ? 'live' : 'pending_lp', // If pool auto-created, it's live
        website,
        twitter,
        telegram,
        discord,
        launch_tx_signature: createResult.txSignature,
        initial_buy_sol: 0,
        price_sol: 0,
        price_usd: 0,
        market_cap: 0,
        current_liquidity: 0,
        volume_24h: 0,
        change_24h: 0,
        holders: 1,
        water_level: 50,
        constellation_strength: 50,
        // Token-2022 specific fields
        pool_type: 'token22',
        // Mark as created on our platform
        is_platform_token: true,
      })
      .select('id')
      .single();

    if (insertError || !token) {
      console.error('[TOKEN22] Database insert error:', insertError);
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

    // Log platform fee
    await (adminClient.from('platform_fees') as any).insert({
      user_id: userId,
      wallet_address: walletAddress,
      source_tx_signature: createResult.txSignature,
      operation_type: 'token22_create',
      transaction_amount_lamports: Number(platformFeeLamports),
      fee_amount_lamports: Number(platformFeeLamports),
      fee_percentage: 100, // Full 0.2 SOL is the platform fee
      referral_split_lamports: feeResult.referralShare ? Number(feeResult.referralShare) : 0,
      referrer_id: referrerUserId,
      fee_tx_signature: feeResult.signature,
      fee_collected_at: feeResult.success ? new Date().toISOString() : null,
      status: feeResult.success ? 'collected' : 'pending',
    });

    console.log(`[TOKEN22] Created successfully: ${createResult.mintAddress}`);

    // ========== ANTI-SNIPER MONITORING ==========
    let antiSniperMonitor = null;
    
    if (antiSniper?.enabled && launchWithBundle && bundleWallets?.length > 0) {
      console.log(`[TOKEN22] Starting anti-sniper monitoring for ${createResult.mintAddress}`);
      
      try {
        // Get current slot for monitoring window
        const currentSlot = await connection.getSlot('confirmed');
        
        // Get all user wallet addresses for ignore list
        const { data: userWallets } = await (adminClient
          .from('wallets') as any)
          .select('public_key')
          .eq('session_id', sessionId);
        
        const userWalletAddresses = (userWallets || []).map((w: any) => w.public_key);
        
        // Store anti-sniper config in database
        await (adminClient.from('anti_sniper_monitors') as any).insert({
          token_mint: createResult.mintAddress,
          session_id: sessionId,
          config: antiSniper,
          launch_slot: currentSlot,
          user_wallets: userWalletAddresses,
          total_supply: parseFloat(totalSupply),
          decimals,
          status: 'active',
          triggered: false,
          started_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + (antiSniper.monitorBlocksWindow + 5) * 400).toISOString(),
        });
        
        antiSniperMonitor = {
          enabled: true,
          status: 'active',
          launchSlot: currentSlot,
          windowBlocks: antiSniper.monitorBlocksWindow,
          maxSupplyPercent: antiSniper.maxSupplyPercentThreshold,
          maxSolAmount: antiSniper.maxSolAmountThreshold,
          autoSellWallets: antiSniper.autoSellWalletIds?.length || 0,
          sellPercentage: antiSniper.sellPercentage,
        };
        
        console.log(`[TOKEN22] Anti-sniper monitor started:`, antiSniperMonitor);
      } catch (antiSniperError) {
        console.error(`[TOKEN22] Failed to start anti-sniper monitor:`, antiSniperError);
        antiSniperMonitor = {
          enabled: true,
          status: 'error',
          error: antiSniperError instanceof Error ? antiSniperError.message : 'Failed to start',
        };
      }
    }

    // ========== RESPONSE ==========
    return NextResponse.json({
      success: true,
      data: {
        tokenId: token.id,
        mintAddress: createResult.mintAddress,
        metadataUri: createResult.metadataUri,
        txSignature: createResult.txSignature,
        mintSignature: createResult.mintSignature,
        disableMintSignature: createResult.disableMintSignature,
        disableFreezeSignature: createResult.disableFreezeSignature,
        platformFee: lamportsToSol(platformFeeLamports),
        // Token-2022 specific
        tokenStandard: 'token22',
        transferFeeEnabled: enableTransferFee,
        transferFeeBasisPoints: enableTransferFee ? transferFeeBasisPoints : 0,
        transferFeeConfigAuthority: createResult.transferFeeConfigAuthority,
        withdrawWithheldAuthority: createResult.withdrawWithheldAuthority,
        // Next steps
        needsLiquidityPool: !autoCreatePool,
        poolCreationUrl: `/api/token22/pool/create`,
        // Anti-sniper status
        antiSniper: antiSniperMonitor,
        // Validation warnings (e.g., transfer fee implications)
        warnings: validation.warnings,
      },
    });

  } catch (error) {
    console.error('[TOKEN22] Create error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 4000,
          message: 'Token-2022 creation failed',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
}

