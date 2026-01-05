/**
 * PROPEL Earn - Deposit API
 * 
 * POST /api/earn/deposit
 * Creates a deposit transaction for Jupiter Earn vaults
 */

import { NextRequest, NextResponse } from 'next/server';
import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { getDepositTransaction, EARN_ASSETS } from '@/lib/blockchain/jupiter-earn';
import { createClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { decryptPrivateKey, getOrCreateServiceSalt } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

const RPC_URL = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { asset, amount, walletAddress, signOnly } = body;
    
    // Validate required fields
    if (!asset || !amount || !walletAddress) {
      return NextResponse.json(
        { success: false, error: { message: 'Missing required fields: asset, amount, walletAddress', code: 2003 } },
        { status: 400 }
      );
    }
    
    // Auth validation
    const sessionId = request.headers.get('x-session-id');
    
    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: { message: 'Authentication required', code: 1001 } },
        { status: 401 }
      );
    }
    
    // Verify wallet belongs to session
    const supabase = await createClient();
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('*')
      .eq('session_id', sessionId)
      .eq('public_key', walletAddress)
      .single();
    
    if (walletError || !wallet) {
      return NextResponse.json(
        { success: false, error: { message: 'Wallet not found or unauthorized', code: 1003 } },
        { status: 403 }
      );
    }
    
    // Get asset mint
    const assetMint = asset.toUpperCase() === 'USDC' ? EARN_ASSETS.USDC : EARN_ASSETS.SOL;
    
    console.log(`[API/EARN/DEPOSIT] Creating deposit: ${amount} ${asset} from ${walletAddress.slice(0, 8)}...`);
    
    // Get deposit transaction
    const result = await getDepositTransaction(walletAddress, assetMint, amount);
    
    if (!result.success || !result.transaction) {
      return NextResponse.json(
        { success: false, error: { message: result.error || 'Failed to create deposit transaction', code: 3001 } },
        { status: 500 }
      );
    }
    
    // If signOnly is true, return unsigned transaction
    if (signOnly) {
      return NextResponse.json({
        success: true,
        data: {
          transaction: result.transaction,
          asset,
          amount,
          walletAddress,
        },
      });
    }
    
    // Sign and send transaction
    const connection = new Connection(RPC_URL, 'confirmed');
    
    // Decrypt private key using the proper key derivation
    const adminClient = getAdminClient();
    const serviceSalt = await getOrCreateServiceSalt(adminClient);
    
    let keypair: Keypair;
    try {
      const privateKeyBase58 = decryptPrivateKey(wallet.encrypted_private_key, sessionId, serviceSalt);
      keypair = Keypair.fromSecretKey(bs58.decode(privateKeyBase58));
    } catch (decryptError) {
      console.error('[API/EARN/DEPOSIT] Failed to decrypt private key:', decryptError);
      return NextResponse.json(
        { success: false, error: { message: 'Failed to access wallet', code: 1003 } },
        { status: 500 }
      );
    }
    
    // Deserialize, sign, and send
    const txBuffer = Buffer.from(result.transaction, 'base64');
    const tx = VersionedTransaction.deserialize(txBuffer);
    tx.sign([keypair]);
    
    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
      preflightCommitment: 'confirmed',
    });
    
    console.log(`[API/EARN/DEPOSIT] Transaction sent: ${signature}`);
    
    // Wait for confirmation
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');
    
    if (confirmation.value.err) {
      console.error('[API/EARN/DEPOSIT] Transaction failed:', confirmation.value.err);
      return NextResponse.json(
        { success: false, error: { message: 'Transaction failed on-chain', code: 3001 } },
        { status: 500 }
      );
    }
    
    console.log(`[API/EARN/DEPOSIT] ✅ Deposit confirmed: ${signature}`);
    
    // Log activity for the ticker/feed
    try {
      const assetMint = EARN_ASSETS[asset.toUpperCase() as keyof typeof EARN_ASSETS];
      const userId = request.headers.get('x-user-id');
      
      // Get approximate USD value (you could fetch live price here)
      const usdValue = asset === 'USDC' ? amount : amount * 200; // Rough SOL price estimate
      
      // Cast to any to bypass strict Supabase typing (table schema not in generated types)
      await (adminClient.from('earn_activity') as any).insert({
        user_id: userId || null,
        wallet_address: walletAddress,
        activity_type: 'deposit',
        vault_symbol: `jl${asset.toUpperCase()}`,
        vault_address: assetMint || null,
        asset_symbol: asset,
        propel_amount: 0, // Direct deposit, no PROPEL swap
        underlying_amount: amount,
        shares_amount: 0, // Could calculate from result
        usd_value: usdValue,
        tx_signature: signature,
      });
      
      console.log('[API/EARN/DEPOSIT] Activity logged');
    } catch (activityError) {
      console.warn('[API/EARN/DEPOSIT] Failed to log activity:', activityError);
      // Don't fail the request if activity logging fails
    }
    
    return NextResponse.json({
      success: true,
      data: {
        signature,
        asset,
        amount,
        walletAddress,
        explorerUrl: `https://solscan.io/tx/${signature}`,
      },
    });
    
  } catch (error) {
    console.error('[API/EARN/DEPOSIT] Error:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Deposit failed',
          code: 'DEPOSIT_ERROR',
        },
      },
      { status: 500 }
    );
  }
}

