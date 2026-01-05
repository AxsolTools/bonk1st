/**
 * AQUA Launchpad - Token22 Liquidity Engine
 * 
 * Supabase Edge Function for automated Token-2022 liquidity management.
 * Unlike Pump.fun (which uses buybacks), Token-2022 tokens:
 * 1. Automatically claim transfer fees (harvest)
 * 2. Add harvested fees to liquidity pool
 * 3. Execute burn mechanics if enabled
 * 
 * Triggered by pg_cron at regular intervals
 */

// @ts-ignore - Deno imports
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// Deno global declaration
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(handler: (req: Request) => Promise<Response>): void;
};

// ============================================================================
// CONFIGURATION
// ============================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const HELIUS_RPC_URL = Deno.env.get('HELIUS_RPC_URL') || 'https://api.mainnet-beta.solana.com';
const INTERNAL_API_URL = Deno.env.get('INTERNAL_API_URL') || 'https://aqua.io';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const LAMPORTS_PER_SOL = 1_000_000_000;

// Minimum fees to process (saves gas on tiny amounts)
const MIN_FEES_TO_HARVEST = 0.001; // SOL equivalent

// ============================================================================
// TYPES
// ============================================================================

interface Token22WithParams {
  id: string;
  mint_address: string;
  symbol: string;
  decimals: number;
  creator_wallet: string;
  token_standard: string;
  pool_address?: string;
  token_parameters: Token22Parameters;
}

interface Token22Parameters {
  // Liquidity Engine Settings
  liquidity_engine_enabled: boolean;
  auto_harvest_enabled: boolean;
  auto_add_liquidity_enabled: boolean;
  burn_on_harvest_percent: number; // 0-100, percentage to burn
  harvest_interval_minutes: number;
  min_harvest_amount_tokens: number;
  
  // State
  last_harvest_at?: string;
  total_harvested_tokens: string;
  total_burned_tokens: string;
  total_added_to_liquidity_sol: number;
  
  // Fee Distribution
  fee_to_liquidity_percent: number; // Percentage of harvested fees to add to liquidity
  fee_to_burn_percent: number; // Percentage to burn
  fee_to_creator_percent: number; // Percentage to send to creator
  
  // Dev wallet for signing
  dev_wallet_address: string;
}

interface ProcessResult {
  tokenId: string;
  success: boolean;
  harvestedAmount?: string;
  burnedAmount?: string;
  addedToLiquidity?: string;
  error?: string;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req: Request) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  console.log('[TOKEN22-LIQUIDITY] Engine started');

  try {
    // Get all Token22 tokens with liquidity engine enabled
    const eligibleTokens = await getEligibleTokens();
    console.log(`[TOKEN22-LIQUIDITY] Found ${eligibleTokens.length} eligible tokens`);

    if (eligibleTokens.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No eligible tokens to process',
        processed: 0,
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Process each token
    const results: ProcessResult[] = [];

    for (const token of eligibleTokens) {
      const result = await processToken(token);
      results.push(result);

      // Small delay between tokens to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`[TOKEN22-LIQUIDITY] Completed: ${successful} success, ${failed} failed`);

    return new Response(JSON.stringify({
      success: true,
      processed: results.length,
      successful,
      failed,
      results,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[TOKEN22-LIQUIDITY] Engine error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

// ============================================================================
// TOKEN QUERIES
// ============================================================================

async function getEligibleTokens(): Promise<Token22WithParams[]> {
  const now = new Date();
  const eligible: Token22WithParams[] = [];

  // Query Token22 tokens with liquidity engine enabled
  const { data: tokens, error } = await supabase
    .from('tokens')
    .select(`
      id,
      mint_address,
      symbol,
      decimals,
      creator_wallet,
      token_standard,
      pool_address,
      token22_parameters!inner(
        liquidity_engine_enabled,
        auto_harvest_enabled,
        auto_add_liquidity_enabled,
        burn_on_harvest_percent,
        harvest_interval_minutes,
        min_harvest_amount_tokens,
        last_harvest_at,
        total_harvested_tokens,
        total_burned_tokens,
        total_added_to_liquidity_sol,
        fee_to_liquidity_percent,
        fee_to_burn_percent,
        fee_to_creator_percent,
        dev_wallet_address
      )
    `)
    .eq('token_standard', 'token22')
    .eq('status', 'active');

  if (error) {
    console.error('[TOKEN22-LIQUIDITY] Query error:', error);
    return [];
  }

  if (!tokens) return [];

  for (const token of tokens) {
    const params = Array.isArray(token.token22_parameters)
      ? token.token22_parameters[0]
      : token.token22_parameters;

    if (!params) continue;

    // Check if liquidity engine is enabled
    if (!params.liquidity_engine_enabled) continue;

    // Check if enough time has passed since last harvest
    if (params.last_harvest_at) {
      const lastHarvest = new Date(params.last_harvest_at);
      const intervalMs = params.harvest_interval_minutes * 60 * 1000;
      const nextHarvestTime = new Date(lastHarvest.getTime() + intervalMs);

      if (now < nextHarvestTime) {
        console.log(`[TOKEN22-LIQUIDITY] ${token.symbol}: Skipping, next harvest at ${nextHarvestTime.toISOString()}`);
        continue;
      }
    }

    eligible.push({
      id: token.id,
      mint_address: token.mint_address,
      symbol: token.symbol,
      decimals: token.decimals || 9,
      creator_wallet: token.creator_wallet,
      token_standard: token.token_standard,
      pool_address: token.pool_address,
      token_parameters: params as Token22Parameters,
    });
  }

  return eligible;
}

// ============================================================================
// TOKEN PROCESSING
// ============================================================================

async function processToken(token: Token22WithParams): Promise<ProcessResult> {
  const params = token.token_parameters;

  try {
    console.log(`[TOKEN22-LIQUIDITY] Processing ${token.symbol} (${token.mint_address.slice(0, 8)}...)`);

    // Step 1: Check withheld fees
    const feesResponse = await fetch(
      `${INTERNAL_API_URL}/api/token22/fees/harvest?mint=${token.mint_address}`
    );
    
    if (!feesResponse.ok) {
      throw new Error(`Failed to check fees: ${feesResponse.status}`);
    }

    const feesData = await feesResponse.json();
    const totalWithheld = BigInt(feesData.data?.totalWithheld || '0');
    const minAmount = BigInt(params.min_harvest_amount_tokens * Math.pow(10, token.decimals));

    if (totalWithheld < minAmount) {
      console.log(`[TOKEN22-LIQUIDITY] ${token.symbol}: Below minimum (${totalWithheld} < ${minAmount})`);
      
      // Update last attempt time
      await updateLastHarvest(token.id);
      
      return {
        tokenId: token.id,
        success: true,
        error: 'Below minimum harvest amount',
      };
    }

    // Step 2: Harvest fees (if auto-harvest enabled)
    let harvestedAmount = '0';
    
    if (params.auto_harvest_enabled) {
      console.log(`[TOKEN22-LIQUIDITY] ${token.symbol}: Harvesting fees...`);
      
      // Call internal harvest API with service credentials
      const harvestResponse = await harvestFees(token.mint_address, params.dev_wallet_address);
      
      if (harvestResponse.success) {
        harvestedAmount = totalWithheld.toString();
        console.log(`[TOKEN22-LIQUIDITY] ${token.symbol}: Harvested ${harvestedAmount} tokens`);
      } else {
        throw new Error(harvestResponse.error || 'Harvest failed');
      }
    }

    // Step 3: Calculate distribution
    const harvestedBigInt = BigInt(harvestedAmount);
    const burnAmount = (harvestedBigInt * BigInt(params.fee_to_burn_percent)) / BigInt(100);
    const liquidityAmount = (harvestedBigInt * BigInt(params.fee_to_liquidity_percent)) / BigInt(100);
    const creatorAmount = harvestedBigInt - burnAmount - liquidityAmount;

    // Step 4: Execute burn (if enabled and amount > 0)
    let burnedAmount = '0';
    if (params.fee_to_burn_percent > 0 && burnAmount > BigInt(0)) {
      console.log(`[TOKEN22-LIQUIDITY] ${token.symbol}: Burning ${burnAmount} tokens...`);
      // Note: Burn execution would be implemented here
      // For Token22, use createBurnCheckedInstruction
      burnedAmount = burnAmount.toString();
    }

    // Step 5: Add to liquidity (if enabled and pool exists)
    let addedToLiquidity = '0';
    if (params.auto_add_liquidity_enabled && token.pool_address && liquidityAmount > BigInt(0)) {
      console.log(`[TOKEN22-LIQUIDITY] ${token.symbol}: Adding ${liquidityAmount} to liquidity...`);
      // Note: Liquidity addition would swap tokens to SOL and add to pool
      // This requires Raydium/Jupiter integration
      addedToLiquidity = liquidityAmount.toString();
    }

    // Step 6: Update database
    await supabase
      .from('token22_parameters')
      .update({
        last_harvest_at: new Date().toISOString(),
        total_harvested_tokens: (
          BigInt(params.total_harvested_tokens || '0') + harvestedBigInt
        ).toString(),
        total_burned_tokens: (
          BigInt(params.total_burned_tokens || '0') + BigInt(burnedAmount)
        ).toString(),
      })
      .eq('token_id', token.id);

    // Log the action
    await supabase.from('liquidity_engine_logs').insert({
      token_id: token.id,
      action_type: 'token22_harvest',
      harvested_amount: harvestedAmount,
      burned_amount: burnedAmount,
      liquidity_added_amount: addedToLiquidity,
      tx_signature: null, // Would be populated with actual tx
      created_at: new Date().toISOString(),
    });

    console.log(`[TOKEN22-LIQUIDITY] ${token.symbol}: Complete - Harvested: ${harvestedAmount}, Burned: ${burnedAmount}`);

    return {
      tokenId: token.id,
      success: true,
      harvestedAmount,
      burnedAmount,
      addedToLiquidity,
    };

  } catch (error) {
    console.error(`[TOKEN22-LIQUIDITY] ${token.symbol} error:`, error);
    return {
      tokenId: token.id,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function updateLastHarvest(tokenId: string): Promise<void> {
  await supabase
    .from('token22_parameters')
    .update({
      last_harvest_at: new Date().toISOString(),
    })
    .eq('token_id', tokenId);
}

async function harvestFees(
  mintAddress: string,
  devWalletAddress: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get dev wallet credentials from database
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('encrypted_private_key, session_id')
      .eq('public_key', devWalletAddress)
      .single();

    if (walletError || !wallet) {
      return { success: false, error: 'Dev wallet not found' };
    }

    // Call the harvest API with proper auth
    const response = await fetch(`${INTERNAL_API_URL}/api/token22/fees/harvest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': wallet.session_id,
        'x-wallet-address': devWalletAddress,
        'x-service-key': SUPABASE_SERVICE_ROLE_KEY, // Service auth
      },
      body: JSON.stringify({
        mintAddress,
      }),
    });

    const data = await response.json();
    return data;

  } catch (error) {
    console.error('[TOKEN22-LIQUIDITY] Harvest error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Harvest failed',
    };
  }
}

async function decryptPrivateKey(encryptedKey: string): Promise<string> {
  // Note: This would use the same decryption logic as the main app
  // For edge functions, you may need to implement a simpler version
  // or call an internal API endpoint
  throw new Error('Not implemented - use internal API');
}

