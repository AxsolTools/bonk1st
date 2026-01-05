/**
 * AQUA Launchpad - Raydium CPMM Creator Fees API
 * 
 * Query and collect creator fees from Raydium CPMM pools
 * Similar to Pump.fun creator rewards, but for post-migration pools
 */

import { type NextRequest, NextResponse } from 'next/server';
import { Connection, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { getAdminClient } from '@/lib/supabase/admin';
import { decryptPrivateKey, getOrCreateServiceSalt } from '@/lib/crypto';
import { 
  getCreatorFees, 
  collectCreatorFee, 
  collectAllCreatorFees 
} from '@/lib/blockchain/raydium-cpmm';

// ============================================================================
// CONFIGURATION
// ============================================================================

const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com';

// ============================================================================
// GET - Query pending creator fees
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const walletAddress = searchParams.get('wallet');

    if (!walletAddress) {
      return NextResponse.json(
        { success: false, error: { code: 4002, message: 'Wallet address is required' } },
        { status: 400 }
      );
    }

    // Fetch pending creator fees from Raydium API
    const feesResult = await getCreatorFees(walletAddress, false);

    if (!feesResult.success) {
      return NextResponse.json(
        { success: false, error: { code: 4000, message: feesResult.error } },
        { status: 500 }
      );
    }

    // Format response
    const formattedPools = feesResult.pools.map((pool) => ({
      poolId: pool.poolId,
      poolName: pool.poolName,
      pendingFees: {
        tokenA: {
          address: pool.mintA.address,
          symbol: pool.mintA.symbol,
          amount: pool.feeAmountA,
          amountFormatted: (
            parseFloat(pool.feeAmountA) / Math.pow(10, pool.mintA.decimals)
          ).toFixed(pool.mintA.decimals > 6 ? 6 : pool.mintA.decimals),
        },
        tokenB: {
          address: pool.mintB.address,
          symbol: pool.mintB.symbol,
          amount: pool.feeAmountB,
          amountFormatted: (
            parseFloat(pool.feeAmountB) / Math.pow(10, pool.mintB.decimals)
          ).toFixed(pool.mintB.decimals > 6 ? 6 : pool.mintB.decimals),
        },
      },
    }));

    return NextResponse.json({
      success: true,
      data: {
        wallet: walletAddress,
        totalPools: feesResult.totalPools,
        poolsWithFees: feesResult.pools.length,
        pools: formattedPools,
      },
    });
  } catch (error) {
    console.error('[CREATOR-FEES] Query error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 4000,
          message: 'Failed to query creator fees',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST - Collect creator fees
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
      poolAddress, // Optional - if not provided, collects from all pools
      collectAll = false,
    } = body;

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

    // ========== COLLECT CREATOR FEES ==========
    let result;

    if (collectAll || !poolAddress) {
      // Collect from all pools
      console.log(`[CREATOR-FEES] Collecting fees from all pools for ${walletAddress}`);
      result = await collectAllCreatorFees(connection, ownerKeypair, false);
    } else {
      // Collect from specific pool
      console.log(`[CREATOR-FEES] Collecting fees from pool ${poolAddress}`);
      result = await collectCreatorFee(connection, ownerKeypair, poolAddress);
    }

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 4000,
            message: result.error || 'Failed to collect creator fees',
          },
        },
        { status: 500 }
      );
    }

    // Log to database
    await (adminClient.from('platform_fees') as any).insert({
      user_id: userId,
      wallet_address: walletAddress,
      source_tx_signature: result.txSignature,
      operation_type: 'raydium_creator_fee_collect',
      transaction_amount_lamports: 0,
      fee_amount_lamports: 0,
      fee_percentage: 0,
      fee_tx_signature: result.txSignature,
      fee_collected_at: new Date().toISOString(),
      status: 'collected',
    });

    console.log(`[CREATOR-FEES] Collected from ${result.poolsProcessed} pools`);

    return NextResponse.json({
      success: true,
      data: {
        txSignature: result.txSignature,
        allSignatures: result.allSignatures,
        poolsProcessed: result.poolsProcessed,
        collectAll: collectAll || !poolAddress,
      },
    });
  } catch (error) {
    console.error('[CREATOR-FEES] Collect error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 4000,
          message: 'Failed to collect creator fees',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
}

