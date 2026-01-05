/**
 * AQUA Launchpad - Harvest Transfer Fees API
 * 
 * Collects withheld transfer fees from Token-2022 tokens
 */

import { type NextRequest, NextResponse } from 'next/server';
import { Connection, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { getAdminClient } from '@/lib/supabase/admin';
import { decryptPrivateKey, getOrCreateServiceSalt } from '@/lib/crypto';
import { completeTransferFeeWithdrawal, getWithheldFeesInfo } from '@/lib/blockchain/transfer-fees';

// ============================================================================
// CONFIGURATION
// ============================================================================

const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com';

// ============================================================================
// GET - Query withheld fees
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mintAddress = searchParams.get('mint');

    if (!mintAddress) {
      return NextResponse.json(
        { success: false, error: { code: 4002, message: 'Mint address is required' } },
        { status: 400 }
      );
    }

    const connection = new Connection(HELIUS_RPC_URL, 'confirmed');

    // Get withheld fees info
    const feesInfo = await getWithheldFeesInfo(connection, mintAddress);

    return NextResponse.json({
      success: true,
      data: {
        mintAddress: feesInfo.mintAddress,
        totalWithheld: feesInfo.totalWithheld,
        accountCount: feesInfo.accountCount,
      },
    });
  } catch (error) {
    console.error('[FEES] Query error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 4000,
          message: 'Failed to query withheld fees',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST - Harvest and withdraw fees
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
      mintAddress,
      destinationWallet, // Optional - defaults to caller's wallet
    } = body;

    // ========== VALIDATION ==========
    if (!mintAddress) {
      return NextResponse.json(
        { success: false, error: { code: 4002, message: 'Mint address is required' } },
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

    // ========== VERIFY AUTHORITY ==========
    // TODO: Verify that the caller is the withdraw authority for this mint
    // This would require fetching the mint account and checking the transfer fee config

    // ========== HARVEST AND WITHDRAW FEES ==========
    console.log(`[FEES] Harvesting transfer fees for ${mintAddress}`);

    const result = await completeTransferFeeWithdrawal({
      connection,
      ownerKeypair,
      mintAddress,
      destinationWallet: destinationWallet || walletAddress,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 4000,
            message: result.error || 'Fee harvest failed',
          },
        },
        { status: 500 }
      );
    }

    console.log(`[FEES] Fees harvested successfully`);
    console.log(`[FEES] Harvest TX: ${result.harvestSignature}`);
    console.log(`[FEES] Withdraw TX: ${result.withdrawSignature}`);

    // Log to database
    await (adminClient.from('platform_fees') as any).insert({
      user_id: userId,
      wallet_address: walletAddress,
      source_tx_signature: result.harvestSignature,
      operation_type: 'transfer_fee_harvest',
      transaction_amount_lamports: 0,
      fee_amount_lamports: 0,
      fee_percentage: 0,
      fee_tx_signature: result.withdrawSignature,
      fee_collected_at: new Date().toISOString(),
      status: 'collected',
    });

    return NextResponse.json({
      success: true,
      data: {
        harvestSignature: result.harvestSignature,
        withdrawSignature: result.withdrawSignature,
        accountsProcessed: result.accountsProcessed,
        totalWithheld: result.totalWithheld,
        destinationWallet: destinationWallet || walletAddress,
      },
    });
  } catch (error) {
    console.error('[FEES] Harvest error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 4000,
          message: 'Fee harvest failed',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
}

