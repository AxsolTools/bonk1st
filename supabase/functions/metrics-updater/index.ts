/// <reference lib="deno.ns" />
/// <reference lib="deno.window" />

/**
 * AQUA Launchpad - Metrics Updater Edge Function
 * 
 * Background job that runs every 30 seconds to sync on-chain metrics
 * with the database. This ensures consistency for all 100+ simultaneous users.
 * 
 * Metrics Updated:
 * 1. Water Level (Liquidity Depth)
 * 2. Evaporation (Burned Tokens)
 * 3. Constellation Strength (Health Score)
 * 4. Market Cap
 * 5. Current Price
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================================
// CONFIGURATION
// ============================================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const HELIUS_API_KEY = Deno.env.get("HELIUS_API_KEY") || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Batch size for processing tokens
const BATCH_SIZE = 20;

// ============================================================================
// TYPES
// ============================================================================

interface TokenMetrics {
  id: string;
  mint_address: string;
  symbol: string;
  total_supply: number;
  decimals: number;
  water_level: number;
  constellation_strength: number;
  total_evaporated: number;
  market_cap: number;
  current_liquidity: number;
  price_sol: number;
}

interface UpdateResult {
  tokenId: string;
  symbol: string;
  success: boolean;
  error?: string;
  metrics?: {
    waterLevel: number;
    constellation: number;
    evaporated: number;
    marketCap: number;
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Fetch token price from DexScreener (no auth required)
 */
async function fetchPrice(mintAddress: string): Promise<number> {
  try {
    const dexResponse = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${mintAddress}`,
      { headers: { "Content-Type": "application/json" } }
    );
    
    if (dexResponse.ok) {
      const data = await dexResponse.json();
      const pair = data.pairs?.find((p: { priceUsd?: string }) => 
        p.priceUsd && parseFloat(p.priceUsd) > 0
      );
      if (pair) {
        return parseFloat(pair.priceUsd);
      }
    }
  } catch (error) {
    console.warn(`[METRICS-UPDATER] DexScreener price fetch failed for ${mintAddress}:`, getErrorMessage(error));
  }
  
  return 0;
}

/**
 * Fetch liquidity from Birdeye or estimate from trading volume
 */
async function fetchLiquidity(mintAddress: string): Promise<number> {
  try {
    // Try Birdeye API if available
    const birdeyeKey = Deno.env.get("BIRDEYE_API_KEY");
    if (birdeyeKey) {
      const response = await fetch(
        `https://public-api.birdeye.so/public/token_overview?address=${mintAddress}`,
        { headers: { "X-API-KEY": birdeyeKey } }
      );
      
      if (response.ok) {
        const data = await response.json();
        return data.data?.liquidity || 0;
      }
    }
    
    // Fallback: Estimate from price impact
    return 0;
  } catch (error) {
    console.warn(`[METRICS-UPDATER] Liquidity fetch failed for ${mintAddress}:`, getErrorMessage(error));
  }
  return 0;
}

/**
 * Fetch burned tokens using Helius Transaction History
 */
async function fetchBurnedTokens(mintAddress: string): Promise<number> {
  if (!HELIUS_API_KEY) return 0;
  
  try {
    const response = await fetch(
      `https://api.helius.xyz/v0/addresses/${mintAddress}/transactions?api-key=${HELIUS_API_KEY}&type=BURN`,
      { method: "GET" }
    );
    
    if (!response.ok) return 0;
    
    const transactions = await response.json();
    let totalBurned = 0;
    
    for (const tx of transactions) {
      if (tx.tokenTransfers) {
        for (const transfer of tx.tokenTransfers) {
          if (transfer.mint === mintAddress && !transfer.toUserAccount) {
            totalBurned += transfer.tokenAmount || 0;
          }
        }
      }
    }
    
    return totalBurned;
  } catch (error) {
    console.warn(`[METRICS-UPDATER] Burn fetch failed for ${mintAddress}:`, getErrorMessage(error));
  }
  return 0;
}

/**
 * Update metrics for a single token
 */
async function updateTokenMetrics(token: TokenMetrics): Promise<UpdateResult> {
  try {
    // Fetch all metrics in parallel
    const [price, liquidity, burned] = await Promise.all([
      fetchPrice(token.mint_address),
      fetchLiquidity(token.mint_address),
      fetchBurnedTokens(token.mint_address),
    ]);
    
    // Calculate derived metrics
    const totalSupply = token.total_supply || 1_000_000_000;
    const decimals = token.decimals || 9;
    const adjustedSupply = totalSupply / Math.pow(10, decimals);
    
    // Market Cap = Price * Supply
    const marketCap = price > 0 ? price * adjustedSupply : token.market_cap || 0;
    
    // Water Level = (Liquidity / 100 SOL baseline) * 100, normalized to 0-100
    // Using a simplified baseline where 100 SOL liquidity = 100%
    const waterLevel = Math.min(100, Math.max(0, 
      liquidity > 0 ? (liquidity / 100) * 100 : token.water_level || 50
    ));
    
    // Constellation Strength = (Liquidity / Market Cap) * 100
    const constellationStrength = Math.min(100, Math.max(0,
      marketCap > 0 && liquidity > 0 
        ? (liquidity / marketCap) * 100 
        : token.constellation_strength || 50
    ));
    
    // Use on-chain burned tokens or keep existing
    const totalEvaporated = burned > 0 ? burned : token.total_evaporated || 0;
    
    // Update database
    const { error } = await supabase
      .from("tokens")
      .update({
        water_level: waterLevel,
        constellation_strength: constellationStrength,
        total_evaporated: totalEvaporated,
        market_cap: marketCap,
        current_liquidity: liquidity > 0 ? liquidity : token.current_liquidity,
        price_sol: price > 0 ? price : token.price_sol,
        updated_at: new Date().toISOString(),
      })
      .eq("id", token.id);
    
    if (error) {
      return {
        tokenId: token.id,
        symbol: token.symbol,
        success: false,
        error: error.message,
      };
    }
    
    return {
      tokenId: token.id,
      symbol: token.symbol,
      success: true,
      metrics: {
        waterLevel,
        constellation: constellationStrength,
        evaporated: totalEvaporated,
        marketCap,
      },
    };
    
  } catch (error) {
    return {
      tokenId: token.id,
      symbol: token.symbol,
      success: false,
      error: getErrorMessage(error),
    };
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req: Request) => {
  try {
    console.log("[METRICS-UPDATER] Starting metrics sync cycle");
    
    // Verify request (optional auth)
    const authHeader = req.headers.get("Authorization");
    if (authHeader !== `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`) {
      console.log("[METRICS-UPDATER] Running as cron job (no auth)");
    }
    
    // Fetch all active tokens (bonding or migrated)
    const { data: tokens, error: fetchError } = await supabase
      .from("tokens")
      .select("id, mint_address, symbol, total_supply, decimals, water_level, constellation_strength, total_evaporated, market_cap, current_liquidity, price_sol")
      .in("stage", ["bonding", "migrated"])
      .limit(100);
    
    if (fetchError) {
      console.error("[METRICS-UPDATER] Failed to fetch tokens:", fetchError);
      return new Response(
        JSON.stringify({ success: false, error: fetchError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
    
    if (!tokens || tokens.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No active tokens to update", processed: 0 }),
        { headers: { "Content-Type": "application/json" } }
      );
    }
    
    console.log(`[METRICS-UPDATER] Found ${tokens.length} active tokens`);
    
    // Process in batches to avoid rate limits
    const results: UpdateResult[] = [];
    
    for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
      const batch = tokens.slice(i, i + BATCH_SIZE);
      
      // Process batch in parallel
      const batchResults = await Promise.all(
        batch.map(token => updateTokenMetrics(token as TokenMetrics))
      );
      
      results.push(...batchResults);
      
      // Small delay between batches
      if (i + BATCH_SIZE < tokens.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    // Summary
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success);
    
    console.log(`[METRICS-UPDATER] Cycle complete: ${successful}/${results.length} successful`);
    
    if (failed.length > 0) {
      console.warn("[METRICS-UPDATER] Failed tokens:", failed.map(f => `${f.symbol}: ${f.error}`));
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        successful,
        failed: failed.length,
        results: results.slice(0, 10), // Return first 10 for debugging
      }),
      { headers: { "Content-Type": "application/json" } }
    );
    
  } catch (error) {
    const errorMsg = getErrorMessage(error);
    console.error("[METRICS-UPDATER] Engine error:", errorMsg);
    return new Response(
      JSON.stringify({ success: false, error: errorMsg }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

