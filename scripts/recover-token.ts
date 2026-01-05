/**
 * Recover token that was created on-chain but failed database insert
 * Run with: npx tsx scripts/recover-token.ts
 */

import { getAdminClient } from '../lib/supabase/admin';
import { Connection, PublicKey } from '@solana/web3.js';
import { getMint } from '@solana/spl-token';

const MINT_ADDRESS = 'CcfMa6QfJ57VzQgE8tfDnvEb3mYj1wqHh8pr5Amvvhnk';
const HELIUS_RPC_URL = 'https://api.mainnet-beta.solana.com';

async function recoverToken() {
  const adminClient = getAdminClient();
  const connection = new Connection(HELIUS_RPC_URL, 'confirmed');

  try {
    // Check if token already exists
    const { data: existingToken } = await adminClient
      .from('tokens')
      .select('id, mint_address, name, symbol')
      .eq('mint_address', MINT_ADDRESS)
      .single();

    if (existingToken) {
      console.log('✅ Token already exists in database:');
      console.log('  ID:', existingToken.id);
      console.log('  Name:', existingToken.name);
      console.log('  Symbol:', existingToken.symbol);
      return;
    }

    console.log('❌ Token not found. Recovering...');

    // Fetch on-chain mint info
    let mintInfo: { supply?: bigint; decimals?: number } | null = null;
    try {
      const mintPubkey = new PublicKey(MINT_ADDRESS);
      const mint = await getMint(connection, mintPubkey);
      mintInfo = {
        supply: mint.supply,
        decimals: mint.decimals,
      };
      console.log('✅ Fetched mint info:', {
        supply: mintInfo.supply?.toString(),
        decimals: mintInfo.decimals,
      });
    } catch (error) {
      console.warn('⚠️ Could not fetch mint info, using defaults:', error);
    }

    // Token metadata from IPFS
    const tokenData = {
      name: 'CHADDEVTESTING',
      symbol: 'CHADDEV',
      description: 'CHADDEVTESTING',
      imageUrl: 'https://ipfs.io/ipfs/QmbNm6Q66pRPsMRSiYBzQv2LiVNZxjkYpRu2N7haiR6REX',
      metadataUri: 'https://ipfs.io/ipfs/QmdvoSjjoLHNE5rm5UdbmrC6aXVrajnQTe5e7k8qMeycUe',
      txSignature: '2SWMB4GnrqhZncbtZxnb6RZfDkE2hbd68PNQRywhYB4eAFXVqSrn389YuM3Zc28NXFJWj8DDwZP7gN8CAWmCKGd1',
    };

    // Try to get creator wallet from transaction
    // For now, we'll set it to null and it can be updated later
    let creatorWallet: string | null = null;
    try {
      const tx = await connection.getTransaction(tokenData.txSignature, {
        maxSupportedTransactionVersion: 0,
      });
      if (tx?.transaction.message.staticAccountKeys) {
        // The first signer is usually the creator
        creatorWallet = tx.transaction.message.staticAccountKeys[0]?.toBase58() || null;
        console.log('✅ Found creator wallet from transaction:', creatorWallet?.slice(0, 8) + '...');
      }
    } catch (error) {
      console.warn('⚠️ Could not fetch transaction, creator wallet will be null');
    }

    // Get or create user
    let creatorId = null;
    if (creatorWallet) {
      const { data: existingUser } = await adminClient
        .from('users')
        .select('id')
        .eq('main_wallet_address', creatorWallet)
        .single();

      if (existingUser) {
        creatorId = existingUser.id;
      } else {
        // Create user if doesn't exist
        const { data: newUser } = await adminClient
          .from('users')
          .insert({
            main_wallet_address: creatorWallet,
          })
          .select('id')
          .single();
        
        if (newUser) {
          creatorId = newUser.id;
          console.log('✅ Created user record');
        }
      }
    }

    // Insert token record
    const { data: token, error: insertError } = await adminClient
      .from('tokens')
      .insert({
        creator_id: creatorId,
        creator_wallet: creatorWallet,
        mint_address: MINT_ADDRESS,
        name: tokenData.name,
        symbol: tokenData.symbol,
        description: tokenData.description,
        image_url: tokenData.imageUrl,
        metadata_uri: tokenData.metadataUri,
        total_supply: mintInfo?.supply ? mintInfo.supply.toString() : '1000000000',
        decimals: mintInfo?.decimals || 6,
        stage: 'bonding',
        migration_threshold: 85,
        launch_tx_signature: tokenData.txSignature,
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
      console.error('❌ Failed to insert token:', insertError);
      return;
    }

    console.log('✅ Token inserted successfully!');
    console.log('  Token ID:', token.id);

    // Create default token parameters
    const { error: paramsError } = await adminClient.from('token_parameters').insert({
      token_id: token.id,
      creator_wallet: creatorWallet,
      pour_enabled: true,
      pour_rate_percent: 1,
      pour_interval_seconds: 3600,
      pour_source: 'fees',
      evaporation_enabled: false,
      evaporation_rate_percent: 0,
      fee_to_liquidity_percent: 25,
      fee_to_creator_percent: 75,
      migration_target: 'raydium',
      dev_wallet_address: creatorWallet,
      dev_wallet_auto_enabled: true,
    });

    if (paramsError) {
      console.warn('⚠️ Failed to create token parameters:', paramsError);
    } else {
      console.log('✅ Token parameters created');
    }

    console.log('\n✅ Token recovery complete!');
    console.log(`Token should now be visible at: /token/${MINT_ADDRESS}`);

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

recoverToken();

