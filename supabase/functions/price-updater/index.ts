/**
 * AQUA Launchpad - Price Updater Edge Function
 * 
 * Supabase Edge Function for automated price updates
 * Runs via pg_cron every 30 seconds to keep token prices fresh
 * 
 * Updates:
 * - price_sol: Token price in SOL
 * - price_usd: Token price in USD
 * - market_cap: Fully diluted market cap in USD
 * 
 * Only processes active tokens (market_cap > $1000 or recent trades)
 */

// @ts-ignore - Deno imports
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

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

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const SOL_MINT = 'So11111111111111111111111111111111111111112';

// Minimum market cap to process (saves API credits)
const MIN_MARKET_CAP_USD = 1000;

// Maximum tokens per batch
const BATCH_SIZE = 50;

// ============================================================================
// TYPES
// ============================================================================

interface TokenToUpdate {
  id: string;
  mint_address: string;
  total_supply: number;
  decimals: number;
  symbol: string;
}

interface PriceUpdateResult {
  tokenId: string;
  success: boolean;
  priceUsd?: number;
  priceSol?: number;
  marketCap?: number;
  error?: string;
}

// ============================================================================
// PRICE FETCHING
// ============================================================================

/**
 * Fetch SOL price in USD from DexScreener or Binance
 */
async function fetchSolPrice(): Promise<number> {
  // DexScreener first (no auth required)
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${SOL_MINT}`);
    if (response.ok) {
      const data = await response.json();
      const pair = data.pairs?.find((p: { priceUsd?: string; baseToken?: { symbol?: string } }) => 
        p.priceUsd && parseFloat(p.priceUsd) > 0 && 
        (p.baseToken?.symbol === 'SOL' || p.baseToken?.symbol === 'WSOL')
      );
      if (pair) {
        const price = parseFloat(pair.priceUsd);
        console.log(`[PRICE-UPDATER] SOL price: $${price.toFixed(2)}`);
        return price;
      }
    }
  } catch (error) {
    console.warn('[PRICE-UPDATER] DexScreener SOL price failed:', error);
  }

  // Fallback to Binance
  try {
    const response = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT');
    if (response.ok) {
      const data = await response.json();
      const price = parseFloat(data.price);
      if (Number.isFinite(price) && price > 0) {
        console.log(`[PRICE-UPDATER] SOL price (Binance): $${price.toFixed(2)}`);
        return price;
      }
    }
  } catch (error) {
    console.warn('[PRICE-UPDATER] Binance SOL price failed:', error);
  }

  // Ultimate fallback
  return 150;
}

/**
 * Batch fetch token prices from DexScreener
 */
async function fetchTokenPrices(
  mints: string[]
): Promise<Map<string, number>> {
  const priceMap = new Map<string, number>();

  if (mints.length === 0) return priceMap;

  // DexScreener doesn't support batch - fetch individually (with limit)
  const limitedMints = mints.slice(0, 20); // Limit to avoid rate limits
  
  for (const mint of limitedMints) {
    try {
      const price = await fetchDexScreenerPrice(mint);
      if (price > 0) {
        priceMap.set(mint, price);
      }
    } catch {
      // Skip failed fetches
    }
  }

  console.log(`[PRICE-UPDATER] DexScreener: ${priceMap.size}/${limitedMints.length} prices found`);
  return priceMap;
}

/**
 * Fallback: Fetch price from DexScreener for tokens not in Jupiter
 */
async function fetchDexScreenerPrice(mint: string): Promise<number> {
  try {
    const response = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${mint}`
    );

    if (response.ok) {
      const data = await response.json();
      const pair = data.pairs?.find(
        (p: { priceUsd?: string }) => p.priceUsd && parseFloat(p.priceUsd) > 0
      );
      if (pair) {
        return parseFloat(pair.priceUsd);
      }
    }
  } catch (error) {
    // Silently fail
  }

  return 0;
}

// ============================================================================
// TOKEN FETCHING
// ============================================================================

/**
 * Get active tokens that need price updates
 */
async function getActiveTokens(): Promise<TokenToUpdate[]> {
  // Get tokens with significant market cap or recent trades
  const { data: tokens, error } = await supabase
    .from('tokens')
    .select('id, mint_address, total_supply, decimals, symbol')
    .or(`market_cap.gte.${MIN_MARKET_CAP_USD}`)
    .order('market_cap', { ascending: false })
    .limit(BATCH_SIZE);

  if (error) {
    console.error('[PRICE-UPDATER] Failed to fetch tokens:', error);
    return [];
  }

  console.log(`[PRICE-UPDATER] Found ${tokens?.length || 0} active tokens`);
  return tokens || [];
}

// ============================================================================
// UPDATE LOGIC
// ============================================================================

/**
 * Update prices for all active tokens
 */
async function updateAllPrices(): Promise<{
  processed: number;
  updated: number;
  failed: number;
}> {
  const startTime = Date.now();
  let processed = 0;
  let updated = 0;
  let failed = 0;

  // Get active tokens
  const tokens = await getActiveTokens();
  if (tokens.length === 0) {
    console.log('[PRICE-UPDATER] No tokens to update');
    return { processed: 0, updated: 0, failed: 0 };
  }

  // Fetch SOL price
  const solPriceUsd = await fetchSolPrice();

  // Batch fetch token prices from Jupiter
  const mints = tokens.map(t => t.mint_address);
  const jupiterPrices = await fetchTokenPrices(mints);

  // Process each token
  const updates: Array<{
    id: string;
    price_sol: number;
    price_usd: number;
    market_cap: number;
  }> = [];

  for (const token of tokens) {
    processed++;

    try {
      let priceUsd = jupiterPrices.get(token.mint_address) || 0;

      // Fallback to DexScreener if Jupiter didn't have the price
      if (priceUsd === 0) {
        priceUsd = await fetchDexScreenerPrice(token.mint_address);
      }

      if (priceUsd > 0) {
        // Calculate price in SOL
        const priceSol = solPriceUsd > 0 ? priceUsd / solPriceUsd : 0;

        // Calculate market cap
        const supply = (token.total_supply || 1_000_000_000) / Math.pow(10, token.decimals || 6);
        const marketCap = priceUsd * supply;

        updates.push({
          id: token.id,
          price_sol: priceSol,
          price_usd: priceUsd,
          market_cap: marketCap,
        });

        updated++;
      } else {
        failed++;
      }
    } catch (error) {
      console.warn(`[PRICE-UPDATER] Failed to process ${token.symbol}:`, error);
      failed++;
    }
  }

  // Batch update the database
  if (updates.length > 0) {
    for (const update of updates) {
      const { error } = await supabase
        .from('tokens')
        .update({
          price_sol: update.price_sol,
          price_usd: update.price_usd,
          market_cap: update.market_cap,
          updated_at: new Date().toISOString(),
        })
        .eq('id', update.id);

      if (error) {
        console.warn(`[PRICE-UPDATER] DB update failed for ${update.id}:`, error);
      }
    }

    console.log(`[PRICE-UPDATER] Updated ${updates.length} tokens in DB`);
  }

  const duration = Date.now() - startTime;
  console.log(`[PRICE-UPDATER] Completed in ${duration}ms: ${processed} processed, ${updated} updated, ${failed} failed`);

  return { processed, updated, failed };
}

// ============================================================================
// HANDLER
// ============================================================================

Deno.serve(async (req: Request) => {
  // Allow both POST (cron trigger) and GET (manual trigger)
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
  }

  console.log('[PRICE-UPDATER] Starting price update job...');

  try {
    const result = await updateAllPrices();

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Price update completed',
        ...result,
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[PRICE-UPDATER] Fatal error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

