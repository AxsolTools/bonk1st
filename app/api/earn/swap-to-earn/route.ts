/**
 * PROPEL Earn - Swap-to-Earn API
 * 
 * POST /api/earn/swap-to-earn
 * Creates an atomic Swap-to-Earn transaction
 * Swaps PROPEL (or any token) directly into yield-bearing jlTokens
 */

import { NextRequest, NextResponse } from 'next/server';
import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { 
  buildSwapToEarnTransaction, 
  getSwapToEarnQuote,
  getPropelMint,
  EARN_ASSETS,
} from '@/lib/blockchain/jupiter-earn';
import { createClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { decryptPrivateKey, getOrCreateServiceSalt } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

const RPC_URL = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      inputMint, // Token to swap from (defaults to PROPEL)
      amount, // Amount in base units
      targetAsset, // 'USDC' or 'SOL'
      walletAddress,
      slippageBps = 100, // 1% default
      signOnly = false,
    } = body;
    
    // Validate required fields
    if (!amount || !targetAsset || !walletAddress) {
      return NextResponse.json(
        { success: false, error: { message: 'Missing required fields: amount, targetAsset, walletAddress', code: 2003 } },
        { status: 400 }
      );
    }
    
    // Validate target asset
    if (!['USDC', 'SOL'].includes(targetAsset.toUpperCase())) {
      return NextResponse.json(
        { success: false, error: { message: 'Invalid targetAsset. Must be USDC or SOL', code: 2003 } },
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
    
    // Use PROPEL token by default, or specified input mint
    const effectiveInputMint = inputMint || getPropelMint();
    
    if (!effectiveInputMint) {
      return NextResponse.json(
        { success: false, error: { message: 'PROPEL token mint not configured', code: 5001 } },
        { status: 500 }
      );
    }
    
    const normalizedTargetAsset = targetAsset.toUpperCase() as 'USDC' | 'SOL';
    
    console.log(`[API/EARN/SWAP-TO-EARN] Creating swap: ${amount} of ${effectiveInputMint.slice(0, 8)} → jl${normalizedTargetAsset} for ${walletAddress.slice(0, 8)}...`);
    
    // Build the swap-to-earn transaction
    const result = await buildSwapToEarnTransaction(
      effectiveInputMint,
      amount,
      normalizedTargetAsset,
      walletAddress,
      slippageBps
    );
    
    if (!result.success || !result.transaction) {
      return NextResponse.json(
        { success: false, error: { message: result.error || 'Failed to create swap-to-earn transaction', code: 3001 } },
        { status: 500 }
      );
    }
    
    // If signOnly is true, return unsigned transaction with quote
    if (signOnly) {
      // Get quote for display
      const quote = await getSwapToEarnQuote(
        effectiveInputMint,
        amount,
        normalizedTargetAsset,
        walletAddress,
        slippageBps
      );
      
      return NextResponse.json({
        success: true,
        data: {
          transaction: result.transaction,
          quote: quote ? {
            inputAmount: quote.inputAmountFormatted,
            outputAmount: quote.outputAmountFormatted,
            intermediateAmount: quote.intermediateAmount,
            priceImpact: quote.priceImpact,
            estimatedApy: quote.estimatedApy,
            targetVault: quote.targetVault.symbol,
          } : null,
          inputMint: effectiveInputMint,
          targetAsset: normalizedTargetAsset,
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
      console.error('[API/EARN/SWAP-TO-EARN] Failed to decrypt private key:', decryptError);
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
    
    console.log(`[API/EARN/SWAP-TO-EARN] Transaction sent: ${signature}`);
    
    // Wait for confirmation
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');
    
    if (confirmation.value.err) {
      console.error('[API/EARN/SWAP-TO-EARN] Transaction failed:', confirmation.value.err);
      return NextResponse.json(
        { success: false, error: { message: 'Transaction failed on-chain', code: 3001 } },
        { status: 500 }
      );
    }
    
    console.log(`[API/EARN/SWAP-TO-EARN] ✅ Swap-to-Earn confirmed: ${signature}`);
    
    // Log activity for the ticker/feed - this is the main PROPEL swap-to-earn flow
    try {
      const userId = request.headers.get('x-user-id');
      const vaultSymbol = normalizedTargetAsset === 'SOL' ? 'jlSOL' : 'jlUSDC';
      
      // Get estimated USD value from the result details if available
      const estimatedUsd = (result.details as any)?.estimatedOutputUsd || 
        (normalizedTargetAsset === 'SOL' ? amount * 200 : amount);
      
      // Cast to any to bypass strict Supabase typing (table schema not in generated types)
      await (adminClient.from('earn_activity') as any).insert({
        user_id: userId || null,
        wallet_address: walletAddress,
        activity_type: 'deposit',
        vault_symbol: vaultSymbol,
        vault_address: null,
        asset_symbol: normalizedTargetAsset,
        propel_amount: amount, // PROPEL tokens being swapped
        underlying_amount: (result.details as any)?.estimatedOutput || amount,
        shares_amount: 0,
        usd_value: estimatedUsd,
        tx_signature: signature,
      });
      
      console.log('[API/EARN/SWAP-TO-EARN] Activity logged');
    } catch (activityError) {
      console.warn('[API/EARN/SWAP-TO-EARN] Failed to log activity:', activityError);
      // Don't fail the request if activity logging fails
    }
    
    return NextResponse.json({
      success: true,
      data: {
        signature,
        inputMint: effectiveInputMint,
        targetAsset: normalizedTargetAsset,
        amount,
        details: result.details,
        walletAddress,
        explorerUrl: `https://solscan.io/tx/${signature}`,
      },
    });
    
  } catch (error) {
    console.error('[API/EARN/SWAP-TO-EARN] Error:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Swap-to-Earn failed',
          code: 'SWAP_TO_EARN_ERROR',
        },
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/earn/swap-to-earn?inputMint=...&amount=...&targetAsset=...&wallet=...
 * Get a quote for Swap-to-Earn without executing
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const inputMint = searchParams.get('inputMint') || getPropelMint();
    const amount = searchParams.get('amount');
    const targetAsset = searchParams.get('targetAsset');
    const walletAddress = searchParams.get('wallet');
    const slippageBps = parseInt(searchParams.get('slippage') || '100');
    
    if (!inputMint || !amount || !targetAsset || !walletAddress) {
      return NextResponse.json(
        { success: false, error: { message: 'Missing required parameters', code: 2003 } },
        { status: 400 }
      );
    }
    
    const normalizedTargetAsset = targetAsset.toUpperCase() as 'USDC' | 'SOL';
    
    if (!['USDC', 'SOL'].includes(normalizedTargetAsset)) {
      return NextResponse.json(
        { success: false, error: { message: 'Invalid targetAsset', code: 2003 } },
        { status: 400 }
      );
    }
    
    const quote = await getSwapToEarnQuote(
      inputMint,
      amount,
      normalizedTargetAsset,
      walletAddress,
      slippageBps
    );
    
    if (!quote) {
      return NextResponse.json(
        { success: false, error: { message: 'Failed to get quote', code: 3001 } },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      data: {
        inputMint: quote.inputMint,
        inputAmount: quote.inputAmount,
        inputAmountFormatted: quote.inputAmountFormatted,
        outputMint: quote.outputMint,
        outputAmount: quote.outputAmount,
        outputAmountFormatted: quote.outputAmountFormatted,
        intermediateAmount: quote.intermediateAmount,
        priceImpact: quote.priceImpact,
        estimatedApy: quote.estimatedApy,
        targetVault: {
          symbol: quote.targetVault.symbol,
          name: quote.targetVault.name,
          apy: quote.targetVault.apy,
          tvlUsd: quote.targetVault.tvlUsd,
        },
      },
      timestamp: Date.now(),
    });
    
  } catch (error) {
    console.error('[API/EARN/SWAP-TO-EARN] Quote error:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Failed to get quote',
          code: 'QUOTE_ERROR',
        },
      },
      { status: 500 }
    );
  }
}

