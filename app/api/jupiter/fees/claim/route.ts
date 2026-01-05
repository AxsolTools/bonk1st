/**
 * Jupiter Fee Claim API
 * 
 * Claim accumulated fees from a Jupiter DBC pool
 */

import { type NextRequest, NextResponse } from 'next/server';
import { Connection, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { getAdminClient } from '@/lib/supabase/admin';
import { decryptPrivateKey, getOrCreateServiceSalt } from '@/lib/crypto';
import { claimJupiterFees, getJupiterPoolAddress, getJupiterFeeInfo } from '@/lib/blockchain/jupiter-studio';

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
    const { mintAddress, poolAddress, maxQuoteAmount } = body;

    if (!mintAddress && !poolAddress) {
      return NextResponse.json(
        { success: false, error: { code: 4002, message: 'Either mint or pool address is required' } },
        { status: 400 }
      );
    }

    // Resolve pool address if needed
    let resolvedPoolAddress = poolAddress;
    if (!resolvedPoolAddress && mintAddress) {
      try {
        resolvedPoolAddress = await getJupiterPoolAddress(mintAddress);
      } catch (error) {
        return NextResponse.json(
          { 
            success: false, 
            error: { 
              code: 4004, 
              message: 'Could not find DBC pool for this token',
              details: error instanceof Error ? error.message : 'Unknown error'
            } 
          },
          { status: 404 }
        );
      }
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

    // Verify wallet is the creator (optional: could check against token record)
    console.log(`[JUPITER-CLAIM] Claiming fees for pool: ${resolvedPoolAddress}`);
    console.log(`[JUPITER-CLAIM] Creator wallet: ${walletAddress}`);

    // Get current fee info before claiming
    const feeInfoBefore = await getJupiterFeeInfo(resolvedPoolAddress);
    console.log(`[JUPITER-CLAIM] Unclaimed fees before: ${feeInfoBefore.unclaimedFees}`);

    if (feeInfoBefore.unclaimedFees <= 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            code: 4005, 
            message: 'No fees available to claim' 
          } 
        },
        { status: 400 }
      );
    }

    // Claim fees
    const claimResult = await claimJupiterFees(
      connection,
      creatorKeypair,
      resolvedPoolAddress,
      maxQuoteAmount
    );

    if (!claimResult.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            code: 5001, 
            message: claimResult.error || 'Fee claim failed' 
          } 
        },
        { status: 500 }
      );
    }

    // Log the claim in database
    if (mintAddress) {
      try {
        // Find the token record
        const { data: token } = await (adminClient
          .from('tokens') as any)
          .select('id')
          .eq('mint_address', mintAddress)
          .single();

        if (token) {
          // Log the claim
          await (adminClient.from('jupiter_fee_claims') as any).insert({
            token_id: token.id,
            mint_address: mintAddress,
            pool_address: resolvedPoolAddress,
            creator_wallet: walletAddress,
            claimed_amount: feeInfoBefore.unclaimedFees,
            tx_signature: claimResult.txSignature,
          });
        }
      } catch (dbError) {
        console.warn('[JUPITER-CLAIM] Failed to log claim to database:', dbError);
        // Don't fail the request, claim was successful
      }
    }

    console.log(`[JUPITER-CLAIM] ✅ Fees claimed successfully: ${claimResult.txSignature}`);

    return NextResponse.json({
      success: true,
      data: {
        txSignature: claimResult.txSignature,
        claimedAmount: feeInfoBefore.unclaimedFees,
        poolAddress: resolvedPoolAddress,
        mintAddress: mintAddress || null,
      },
    });

  } catch (error) {
    console.error('[JUPITER-CLAIM] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 5000,
          message: 'Fee claim failed',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
}

