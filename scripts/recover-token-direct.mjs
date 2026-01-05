/**
 * Direct token recovery script using Supabase admin client
 * Run: node scripts/recover-token-direct.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { Connection, PublicKey } from '@solana/web3.js';

const MINT_ADDRESS = 'CcfMa6QfJ57VzQgE8tfDnvEb3mYj1wqHh8pr5Amvvhnk';
const HELIUS_RPC_URL = 'https://api.mainnet-beta.solana.com';

const tokenData = {
  name: 'CHADDEVTESTING',
  symbol: 'CHADDEV',
  description: 'CHADDEVTESTING',
  metadataUri: 'https://ipfs.io/ipfs/QmdvoSjjoLHNE5rm5UdbmrC6aXVrajnQTe5e7k8qMeycUe',
  imageUrl: 'https://ipfs.io/ipfs/QmbNm6Q66pRPsMRSiYBzQv2LiVNZxjkYpRu2N7haiR6REX',
  txSignature: '2SWMB4GnrqhZncbtZxnb6RZfDkE2hbd68PNQRywhYB4eAFXVqSrn389YuM3Zc28NXFJWj8DDwZP7gN8CAWmCKGd1',
};

async function recoverToken() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('❌ Missing Supabase configuration');
    console.error('Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    console.error('Make sure to set these in your environment or .env.local file');
    process.exit(1);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const connection = new Connection(HELIUS_RPC_URL, 'confirmed');

  try {
    console.log('🔍 Checking if token exists...');
    
    // Check if token already exists
    const { data: existingToken, error: checkError } = await adminClient
      .from('tokens')
      .select('id, mint_address, name, symbol')
      .eq('mint_address', MINT_ADDRESS)
      .single();

    if (existingToken && !checkError) {
      console.log('✅ Token already exists in database:');
      console.log('  ID:', existingToken.id);
      console.log('  Name:', existingToken.name);
      console.log('  Symbol:', existingToken.symbol);
      return;
    }

    console.log('❌ Token not found. Recovering...');

    // Try to get creator wallet from transaction
    let creatorWallet = null;
    try {
      console.log('📡 Fetching transaction to extract creator wallet...');
      const tx = await connection.getTransaction(tokenData.txSignature, {
        maxSupportedTransactionVersion: 0,
      });
      if (tx?.transaction?.message?.staticAccountKeys?.length > 0) {
        creatorWallet = tx.transaction.message.staticAccountKeys[0]?.toBase58() || null;
        console.log('✅ Extracted creator wallet:', creatorWallet?.slice(0, 8) + '...');
      }
    } catch (error) {
      console.warn('⚠️ Could not extract creator wallet from transaction:', error.message);
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
        console.log('✅ Found existing user');
      } else {
        console.log('👤 Creating user record...');
        const { data: newUser, error: userError } = await adminClient
          .from('users')
          .insert({
            main_wallet_address: creatorWallet,
          })
          .select('id')
          .single();
        
        if (newUser) {
          creatorId = newUser.id;
          console.log('✅ Created user record');
        } else if (userError) {
          console.warn('⚠️ User creation error (continuing anyway):', userError.message);
        }
      }
    }

    // Insert token record
    console.log('💾 Inserting token record...');
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
        total_supply: '1000000000',
        decimals: 6, // pump.fun tokens use 6 decimals
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
      if (insertError?.code === '23505') {
        console.log('ℹ️ Token may already exist (unique constraint violation)');
      }
      return;
    }

    console.log('✅ Token inserted successfully!');
    console.log('  Token ID:', token.id);

    // Create default token parameters
    console.log('⚙️ Creating token parameters...');
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
      console.warn('⚠️ Failed to create token parameters:', paramsError.message);
    } else {
      console.log('✅ Token parameters created');
    }

    console.log('\n✅ Token recovery complete!');
    console.log(`Token should now be visible at: /token/${MINT_ADDRESS}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
}

recoverToken();
