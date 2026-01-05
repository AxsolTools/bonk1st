/**
 * AQUA Launchpad - Lock LP Tokens API
 * 
 * Locks LP tokens for a specified duration
 */

import { type NextRequest, NextResponse } from 'next/server';
import { Connection, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { getAdminClient } from '@/lib/supabase/admin';
import { decryptPrivateKey, getOrCreateServiceSalt } from '@/lib/crypto';
import { lockLpTokens } from '@/lib/blockchain/raydium-cpmm';

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
      lockDurationDays = 30,
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

    if (lockDurationDays < 1) {
      return NextResponse.json(
        { success: false, error: { code: 4002, message: 'Lock duration must be at least 1 day' } },
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

    // Convert days to seconds
    const lockDurationSeconds = lockDurationDays * 24 * 60 * 60;

    // ========== LOCK LP TOKENS ==========
    console.log(`[LP LOCK] Locking LP tokens in pool ${poolAddress}`);
    console.log(`[LP LOCK] Amount: ${lpTokenAmount}, Duration: ${lockDurationDays} days`);

    const result = await lockLpTokens(
      connection,
      ownerKeypair,
      poolAddress,
      lpTokenAmount,
      lockDurationSeconds
    );

    if (!result.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            code: 4000, 
            message: result.error || 'Lock LP tokens failed' 
          } 
        },
        { status: 500 }
      );
    }

    // Calculate unlock date
    const unlockDate = new Date(Date.now() + lockDurationSeconds * 1000);

    console.log(`[LP LOCK] Locked successfully: ${result.txSignature}`);
    console.log(`[LP LOCK] Unlocks at: ${unlockDate.toISOString()}`);

    return NextResponse.json({
      success: true,
      data: {
        txSignature: result.txSignature,
        lpTokenAmount: result.lpTokenAmount,
        lockDurationDays,
        unlockDate: unlockDate.toISOString(),
      },
    });

  } catch (error) {
    console.error('[LP LOCK] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 4000,
          message: 'Lock LP tokens failed',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
}

