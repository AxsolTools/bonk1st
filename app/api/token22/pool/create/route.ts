/**
 * AQUA Launchpad - Raydium CPMM Pool Creation API
 * 
 * Creates a Raydium CPMM pool for Token-2022 tokens
 */

import { type NextRequest, NextResponse } from 'next/server';
import { Connection, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { getAdminClient } from '@/lib/supabase/admin';
import { decryptPrivateKey, getOrCreateServiceSalt } from '@/lib/crypto';
import { validateBalanceForTransaction, collectPlatformFee } from '@/lib/fees';
import { solToLamports, lamportsToSol, calculatePlatformFee } from '@/lib/precision';
import { createCPMMPool } from '@/lib/blockchain/raydium-cpmm';

// ============================================================================
// CONFIGURATION
// ============================================================================

const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com';
const MIN_POOL_SOL = 0.1; // Minimum SOL for pool creation

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
      tokenMint,
      tokenAmount,
      solAmount,
      tokenDecimals = 6,
      feePercent = '0.25%',
      openTime = 0,
    } = body;

    // ========== VALIDATION ==========
    if (!tokenMint) {
      return NextResponse.json(
        { success: false, error: { code: 4002, message: 'Token mint address is required' } },
        { status: 400 }
      );
    }

    const solAmountNum = parseFloat(solAmount);
    if (!solAmount || solAmountNum < MIN_POOL_SOL) {
      return NextResponse.json(
        { success: false, error: { code: 4002, message: `Minimum ${MIN_POOL_SOL} SOL required for pool creation` } },
        { status: 400 }
      );
    }

    const tokenAmountNum = parseFloat(tokenAmount);
    if (!tokenAmount || tokenAmountNum <= 0) {
      return NextResponse.json(
        { success: false, error: { code: 4002, message: 'Token amount must be greater than 0' } },
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
    const ownerKeypair = Keypair.fromSecretKey(bs58.decode(privateKeyBase58));

    // ========== BALANCE VALIDATION ==========
    // Need SOL for pool + gas + platform fee
    const estimatedCostSol = solAmountNum + 0.05;
    const operationLamports = solToLamports(estimatedCostSol);
    const priorityFeeLamports = solToLamports(0.01);

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

    // ========== CREATE POOL ==========
    console.log(`[POOL] Creating Raydium CPMM pool for ${tokenMint}`);
    console.log(`[POOL] Token amount: ${tokenAmount}, SOL amount: ${solAmount}`);

    const poolResult = await createCPMMPool({
      connection,
      ownerKeypair,
      tokenMint,
      tokenAmount,
      solAmount,
      tokenDecimals,
      openTime,
      feePercent,
    });

    if (!poolResult.success || !poolResult.poolAddress) {
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            code: 4000, 
            message: poolResult.error || 'Pool creation failed' 
          } 
        },
        { status: 500 }
      );
    }

    // ========== COLLECT PLATFORM FEE ==========
    const feeBaseSol = solAmountNum * 0.02; // 2% of SOL amount
    const platformFeeLamports = calculatePlatformFee(solToLamports(solAmountNum));

    const feeResult = await collectPlatformFee(
      connection,
      ownerKeypair,
      solToLamports(solAmountNum)
    );

    // ========== UPDATE DATABASE ==========
    // Update token record with pool info
    const { error: updateError } = await (adminClient
      .from('tokens') as any)
      .update({
        stage: 'live',
        current_liquidity: solAmountNum,
        // pool_address: poolResult.poolAddress,
        // lp_token_mint: poolResult.lpMint,
      })
      .eq('mint_address', tokenMint);

    if (updateError) {
      console.warn('[POOL] Failed to update token record:', updateError);
    }

    // Log platform fee
    await (adminClient.from('platform_fees') as any).insert({
      user_id: userId,
      wallet_address: walletAddress,
      source_tx_signature: poolResult.txSignature,
      operation_type: 'pool_create',
      transaction_amount_lamports: Number(solToLamports(solAmountNum)),
      fee_amount_lamports: Number(platformFeeLamports),
      fee_percentage: 2,
      fee_tx_signature: feeResult.signature,
      fee_collected_at: feeResult.success ? new Date().toISOString() : null,
      status: feeResult.success ? 'collected' : 'pending',
    });

    console.log(`[POOL] Pool created successfully: ${poolResult.poolAddress}`);

    return NextResponse.json({
      success: true,
      data: {
        poolAddress: poolResult.poolAddress,
        lpMint: poolResult.lpMint,
        txSignature: poolResult.txSignature,
        allSignatures: poolResult.allSignatures,
        tokenAmount,
        solAmount,
        platformFee: lamportsToSol(platformFeeLamports),
      },
    });

  } catch (error) {
    console.error('[POOL] Create error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 4000,
          message: 'Pool creation failed',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
}

