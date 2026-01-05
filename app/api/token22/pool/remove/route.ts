/**
 * AQUA Launchpad - Remove Liquidity API
 * 
 * Removes liquidity from a Raydium CPMM pool
 */

import { type NextRequest, NextResponse } from 'next/server';
import { Connection, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { getAdminClient } from '@/lib/supabase/admin';
import { decryptPrivateKey, getOrCreateServiceSalt } from '@/lib/crypto';
import { collectPlatformFee } from '@/lib/fees';
import { solToLamports, lamportsToSol, calculatePlatformFee } from '@/lib/precision';
import { removeLiquidity } from '@/lib/blockchain/raydium-cpmm';

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
      lpTokenAmount,
      slippageBps = 100,
    } = body;

    // ========== VALIDATION ==========
    if (!poolAddress) {
      return NextResponse.json(
        { success: false, error: { code: 4002, message: 'Pool address is required' } },
        { status: 400 }
      );
    }

    if (!lpTokenAmount || parseFloat(lpTokenAmount) <= 0) {
      return NextResponse.json(
        { success: false, error: { code: 4002, message: 'LP token amount must be greater than 0' } },
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

    // ========== REMOVE LIQUIDITY ==========
    console.log(`[LIQUIDITY] Removing from pool ${poolAddress}`);
    console.log(`[LIQUIDITY] LP amount: ${lpTokenAmount}`);

    const result = await removeLiquidity({
      connection,
      ownerKeypair,
      poolAddress,
      lpTokenAmount,
      slippageBps,
    });

    if (!result.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            code: 4000, 
            message: result.error || 'Remove liquidity failed' 
          } 
        },
        { status: 500 }
      );
    }

    console.log(`[LIQUIDITY] Removed successfully: ${result.txSignature}`);

    // ========== COLLECT PLATFORM FEE (2%) ==========
    // Fee based on the SOL amount received from removing liquidity
    const solReceived = parseFloat(result.solAmount || '0');
    const platformFeeLamports = calculatePlatformFee(solToLamports(solReceived));
    
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
        operation_type: 'remove_liquidity',
        transaction_signature: result.txSignature,
        fee_amount_lamports: Number(platformFeeLamports),
        fee_amount_sol: lamportsToSol(platformFeeLamports),
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        txSignature: result.txSignature,
        lpTokenAmount: result.lpTokenAmount,
        tokenAmount: result.tokenAmount,
        solAmount: result.solAmount,
        platformFee: lamportsToSol(platformFeeLamports),
      },
    });

  } catch (error) {
    console.error('[LIQUIDITY] Remove error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 4000,
          message: 'Remove liquidity failed',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
}

