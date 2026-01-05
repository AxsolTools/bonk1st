/**
 * AQUA Launchpad - Token Recovery API
 * 
 * Recovers a token that was created on-chain but failed to insert into database
 */

import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { getAdminClient } from '@/lib/supabase/admin';

const HELIUS_RPC_URL = 'https://api.mainnet-beta.solana.com';

export async function POST(request: NextRequest) {
  try {
    const { mintAddress, creatorWallet, name, symbol, description, metadataUri, imageUrl, txSignature } = await request.json();

    if (!mintAddress) {
      return NextResponse.json(
        { success: false, error: 'Mint address is required' },
        { status: 400 }
      );
    }

    const adminClient = getAdminClient();
    const connection = new Connection(HELIUS_RPC_URL, 'confirmed');

    // Check if token already exists
    // Cast to any to bypass strict Supabase typing (table schema not in generated types)
    const { data: existingToken } = await (adminClient
      .from('tokens') as any)
      .select('id, mint_address')
      .eq('mint_address', mintAddress)
      .single();

    if (existingToken) {
      return NextResponse.json({
        success: true,
        message: 'Token already exists in database',
        data: { tokenId: existingToken.id, mintAddress: existingToken.mint_address }
      });
    }

    // Fetch on-chain data (optional - will use defaults if fails)
    let mintInfo: { supply?: bigint; decimals?: number } | null = null;
    try {
      const mintPubkey = new PublicKey(mintAddress);
      // Try to get account info to verify mint exists
      const accountInfo = await connection.getAccountInfo(mintPubkey);
      if (accountInfo) {
        // For pump.fun tokens, decimals are always 6
        mintInfo = {
          decimals: 6,
          supply: undefined, // Will use default
        };
      }
    } catch (error) {
      console.error('[RECOVER] Failed to fetch mint info, using defaults:', error);
    }

    // Try to get creator wallet from transaction if not provided
    let finalCreatorWallet = creatorWallet;
    if (!finalCreatorWallet && txSignature) {
      try {
        const tx = await connection.getTransaction(txSignature, {
          maxSupportedTransactionVersion: 0,
        });
        if (tx?.transaction?.message?.staticAccountKeys && tx.transaction.message.staticAccountKeys.length > 0) {
          // The first signer is usually the creator/fee payer
          finalCreatorWallet = tx.transaction.message.staticAccountKeys[0]?.toBase58() || null;
          console.log('[RECOVER] Extracted creator wallet from transaction:', finalCreatorWallet?.slice(0, 8) + '...');
        }
      } catch (error) {
        console.warn('[RECOVER] Could not extract creator wallet from transaction:', error);
      }
    }

    // Get or create user
    let creatorId = null;
    if (finalCreatorWallet) {
      const { data: existingUser } = await (adminClient
        .from('users') as any)
        .select('id')
        .eq('main_wallet_address', finalCreatorWallet)
        .single();

      if (existingUser) {
        creatorId = existingUser.id;
      } else {
        // Create user if doesn't exist
        const { data: newUser } = await (adminClient
          .from('users') as any)
          .insert({
            main_wallet_address: finalCreatorWallet,
          })
          .select('id')
          .single();
        
        if (newUser) {
          creatorId = newUser.id;
        }
      }
    }

    // Insert token record
    const { data: token, error: insertError } = await (adminClient
      .from('tokens') as any)
      .insert({
        creator_id: creatorId,
        creator_wallet: finalCreatorWallet || null,
        mint_address: mintAddress,
        name: name || 'Unknown Token',
        symbol: symbol || 'UNKNOWN',
        description: description || null,
        image_url: imageUrl || null,
        metadata_uri: metadataUri || null,
        total_supply: '1000000000', // Default for pump.fun tokens
        decimals: mintInfo?.decimals || 6, // pump.fun tokens use 6 decimals
        stage: 'bonding',
        migration_threshold: 85,
        launch_tx_signature: txSignature || null,
        initial_buy_sol: 0,
        price_sol: 0,
        price_usd: 0,
        market_cap: 0,
        current_liquidity: 0,
        volume_24h: 0,
        change_24h: 0,
        holders: 0,
        water_level: 50,
        constellation_strength: 50,
      })
      .select('id')
      .single();

    if (insertError || !token) {
      console.error('[RECOVER] Database insert error:', insertError);
      return NextResponse.json(
        { success: false, error: insertError?.message || 'Failed to insert token' },
        { status: 500 }
      );
    }

    // Create default token parameters
    await (adminClient.from('token_parameters') as any).insert({
      token_id: token.id,
      creator_wallet: creatorWallet || null,
      pour_enabled: true,
      pour_rate_percent: 1,
      pour_interval_seconds: 3600,
      pour_source: 'fees',
      evaporation_enabled: false,
      evaporation_rate_percent: 0,
      fee_to_liquidity_percent: 25,
      fee_to_creator_percent: 75,
      migration_target: 'raydium',
      dev_wallet_address: creatorWallet || null,
      dev_wallet_auto_enabled: true,
    });

    return NextResponse.json({
      success: true,
      message: 'Token recovered successfully',
      data: {
        tokenId: token.id,
        mintAddress: mintAddress,
      },
    });

  } catch (error) {
    console.error('[RECOVER] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

