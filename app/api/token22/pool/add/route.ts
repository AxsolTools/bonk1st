/**
 * AQUA Launchpad - Add Liquidity API
 * 
 * Adds liquidity to an existing Raydium CPMM pool
 */

import { type NextRequest, NextResponse } from 'next/server';
import { Connection, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { getAdminClient } from '@/lib/supabase/admin';
import { decryptPrivateKey, getOrCreateServiceSalt } from '@/lib/crypto';
import { validateBalanceForTransaction, collectPlatformFee } from '@/lib/fees';
import { solToLamports, lamportsToSol, calculatePlatformFee } from '@/lib/precision';
import { addLiquidity } from '@/lib/blockchain/raydium-cpmm';

// ============================================================================
// CONFIGURATION
// ============================================================================

const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com';

// ============================================================================
// HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    // Get auth headers
    const sessionId = request.headers.get('x-session-id');
    const walletAddress = request.headers.get('x-wallet-address');

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
      poolAddress,
      tokenMint,
      tokenAmount,
      solAmount,
      tokenDecimals = 6,
      slippageBps = 100,
    } = body;

    // ========== VALIDATION ==========
    if (!poolAddress || !tokenMint) {
      return NextResponse.json(
        { success: false, error: { code: 4002, message: 'Pool address and token mint are required' } },
        { status: 400 }
      );
    }

    if (!tokenAmount || parseFloat(tokenAmount) <= 0) {
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
    const solAmountNum = parseFloat(solAmount) || 0;
    const estimatedCostSol = solAmountNum + 0.01;
    const operationLamports = solToLamports(estimatedCostSol);
    const priorityFeeLamports = solToLamports(0.005);

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
          },
        },
        { status: 400 }
      );
    }

    // ========== ADD LIQUIDITY ==========
    console.log(`[LIQUIDITY] Adding to pool ${poolAddress}`);

    const result = await addLiquidity({
      connection,
      ownerKeypair,
      poolAddress,
      tokenMint,
      tokenAmount,
      solAmount,
      tokenDecimals,
      slippageBps,
    });

    if (!result.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            code: 4000, 
            message: result.error || 'Add liquidity failed' 
          } 
        },
        { status: 500 }
      );
    }

    console.log(`[LIQUIDITY] Added successfully: ${result.txSignature}`);

    // ========== COLLECT PLATFORM FEE (2%) ==========
    // Fee based on the SOL amount added to liquidity
    const platformFeeLamports = calculatePlatformFee(solToLamports(solAmountNum));
    
    const feeResult = await collectPlatformFee(
      connection,
      ownerKeypair,
      platformFeeLamports
    );

    if (feeResult.success) {
      console.log(`[LIQUIDITY] Platform fee collected: ${lamportsToSol(platformFeeLamports)} SOL`);
      
      // Record fee in database
      await (adminClient.from('platform_fees') as any).insert({
        session_id: sessionId,
        wallet_address: walletAddress,
        operation_type: 'add_liquidity',
        transaction_signature: result.txSignature,
        fee_amount_lamports: Number(platformFeeLamports),
        fee_amount_sol: lamportsToSol(platformFeeLamports),
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        txSignature: result.txSignature,
        tokenAmount: result.tokenAmount,
        solAmount: result.solAmount,
        platformFee: lamportsToSol(platformFeeLamports),
      },
    });

  } catch (error) {
    console.error('[LIQUIDITY] Add error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 4000,
          message: 'Add liquidity failed',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
}

