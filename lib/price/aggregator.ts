/**
 * AQUA Launchpad - Multi-Source Price Aggregator
 * 
 * Aggregates prices from multiple sources for reliability:
 * - Binance (SOL/USDT) - Free API, highest weight
 * - CoinGecko (SOL/USD) - Free API, no key required
 * - Jupiter Quote API (token prices)
 * - Helius (real-time token prices)
 * 
 * Features:
 * - Weighted average for accuracy
 * - Automatic fallback on source failure
 * - Health tracking per source
 * - Caching to reduce API calls
 */

// ============================================================================
// TYPES
// ============================================================================

export interface PriceResult {
  price: number;
  source: string;
  timestamp: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface SourceHealth {
  lastSuccess: number;
  lastError: string | null;
  consecutiveFailures: number;
}

interface PriceSource {
  name: string;
  weight: number;
  fetch: () => Promise<number>;
}

// ============================================================================
// CACHE & STATE
// ============================================================================

// Price cache with TTL
const priceCache = new Map<string, { price: number; timestamp: number }>();
const CACHE_TTL_MS = 10_000; // 10 seconds

// Source health tracking
const sourceHealth = new Map<string, SourceHealth>();

// Token decimal cache
const decimalCache = new Map<string, number>();

// SOL mint address
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// ============================================================================
// SOURCE HEALTH TRACKING
// ============================================================================

function recordSourceHealth(source: string, success: boolean, error?: string): void {
  const current = sourceHealth.get(source) || {
    lastSuccess: 0,
    lastError: null,
    consecutiveFailures: 0,
  };
  
  if (success) {
    sourceHealth.set(source, {
      lastSuccess: Date.now(),
      lastError: null,
      consecutiveFailures: 0,
    });
  } else {
    sourceHealth.set(source, {
      ...current,
      lastError: error || 'Unknown error',
      consecutiveFailures: current.consecutiveFailures + 1,
    });
  }
}

export function getSourceHealth(): Record<string, SourceHealth> {
  const result: Record<string, SourceHealth> = {};
  sourceHealth.forEach((health, source) => {
    result[source] = { ...health };
  });
  return result;
}

// ============================================================================
// SOL PRICE SOURCES (Free APIs - No Keys Required)
// ============================================================================

/**
 * Fetch SOL price from Binance (free public API)
 * Note: Binance may return 451 for geo-blocked regions (US, etc.)
 */
async function fetchBinanceSolPrice(): Promise<number> {
  // Create timeout manually for Node.js compatibility
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  
  try {
    const response = await fetch(
      'https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT',
      { 
        next: { revalidate: 10 },
        signal: controller.signal,
        headers: { 'User-Agent': 'AQUA-Launchpad/1.0' }
      }
    );
    
    clearTimeout(timeoutId);
    
    // Binance 451 = geo-blocked, skip to next source
    if (response.status === 451) {
      throw new Error('Binance geo-blocked');
    }
    
    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status}`);
    }
    
    const data = await response.json();
    const price = parseFloat(data.price);
    
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error('Invalid price from Binance');
    }
    
    return price;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Binance API timeout');
    }
    throw error;
  }
}

/**
 * Fetch SOL price from CoinGecko (free public API - no key required)
 * Note: CoinGecko free API has rate limits (~30 calls/minute)
 */
async function fetchCoinGeckoSolPrice(): Promise<number> {
  // Create timeout manually for Node.js compatibility
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
      { 
        next: { revalidate: 30 },
        signal: controller.signal,
        headers: { 'User-Agent': 'AQUA-Launchpad/1.0' }
      }
    );
    
    clearTimeout(timeoutId);
    
    // CoinGecko 429 = rate limited, skip to next source
    if (response.status === 429) {
      throw new Error('CoinGecko rate limited');
    }
    
    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }
    
    const data = await response.json();
    const price = data.solana?.usd;
    
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error('Invalid price from CoinGecko');
    }
    
    return price;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('CoinGecko API timeout');
    }
    throw error;
  }
}

/**
 * Jupiter API disabled - requires paid API key signup
 * Using DexScreener, CoinGecko, Binance instead
 */
async function fetchJupiterSolPrice(): Promise<number> {
  throw new Error('Jupiter API disabled - requires API key signup');
}

/**
 * Fetch SOL price from DexScreener (most reliable - no auth/geo issues)
 */
async function fetchDexScreenerSolPrice(): Promise<number> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  
  try {
    const response = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${SOL_MINT}`,
      { 
        next: { revalidate: 10 },
        signal: controller.signal,
        headers: { 'User-Agent': 'AQUA-Launchpad/1.0' }
      }
    );
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`DexScreener API error: ${response.status}`);
    }
    
    const data = await response.json();
    // Find SOL/USDC or SOL/USDT pair
    const pair = data.pairs?.find((p: { priceUsd?: string; baseToken?: { symbol?: string } }) => 
      p.priceUsd && parseFloat(p.priceUsd) > 0 && 
      (p.baseToken?.symbol === 'SOL' || p.baseToken?.symbol === 'WSOL')
    );
    
    if (!pair) {
      throw new Error('No SOL pair found on DexScreener');
    }
    
    const price = parseFloat(pair.priceUsd);
    
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error('Invalid price from DexScreener');
    }
    
    return price;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('DexScreener API timeout');
    }
    throw error;
  }
}

// ============================================================================
// AGGREGATED SOL PRICE
// ============================================================================

/**
 * Get SOL/USD price aggregated from multiple sources
 * Uses weighted average for accuracy
 * Order: DexScreener (reliable) -> CoinGecko -> Binance -> Jupiter
 * 
 * @returns Aggregated price result
 */
export async function getSolPrice(): Promise<PriceResult> {
  // Check cache first
  const cached = priceCache.get('SOL');
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return {
      price: cached.price,
      source: 'cache',
      timestamp: cached.timestamp,
      confidence: 'high',
    };
  }
  
  // Sources ordered by reliability:
  // DexScreener: No auth/geo issues, reliable
  // CoinGecko: Rate limited but stable
  // Binance: Geo-blocked in many regions (451)
  // Jupiter: May require auth (401)
  const sources: PriceSource[] = [
    { name: 'dexscreener', weight: 3, fetch: fetchDexScreenerSolPrice },
    { name: 'coingecko', weight: 2, fetch: fetchCoinGeckoSolPrice },
    { name: 'binance', weight: 2, fetch: fetchBinanceSolPrice },
    { name: 'jupiter', weight: 1, fetch: fetchJupiterSolPrice },
  ];
  
  const results = await Promise.allSettled(
    sources.map(async (source) => {
      try {
        const price = await source.fetch();
        recordSourceHealth(source.name, true);
        return { source: source.name, price, weight: source.weight };
      } catch (error) {
        recordSourceHealth(source.name, false, error instanceof Error ? error.message : 'Unknown');
        throw error;
      }
    })
  );
  
  // Collect successful results with weights
  const validPrices: number[] = [];
  let successSource = '';
  
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      const { price, weight, source } = result.value;
      // Add price multiple times based on weight
      for (let i = 0; i < weight; i++) {
        validPrices.push(price);
      }
      if (!successSource) successSource = source;
    }
  });
  
  if (validPrices.length === 0) {
    // Fallback to a reasonable default price if all sources fail
    // This prevents complete failure - USD conversion will use this fallback
    const fallbackPrice = 150; // Approximate SOL price fallback
    console.warn('[PRICE] All SOL price sources failed, using fallback price:', fallbackPrice);
    
    // Cache the fallback with low confidence
    priceCache.set('SOL', { price: fallbackPrice, timestamp: Date.now() });
    
    return {
      price: fallbackPrice,
      source: 'fallback',
      timestamp: Date.now(),
      confidence: 'low',
    };
  }
  
  // Calculate weighted average
  const avgPrice = validPrices.reduce((a, b) => a + b, 0) / validPrices.length;
  
  // Determine confidence based on number of successful sources
  const successCount = results.filter(r => r.status === 'fulfilled').length;
  const confidence: PriceResult['confidence'] = 
    successCount >= 3 ? 'high' : 
    successCount >= 2 ? 'medium' : 'low';
  
  // Cache the result
  priceCache.set('SOL', { price: avgPrice, timestamp: Date.now() });
  
  return {
    price: avgPrice,
    source: successCount > 1 ? 'aggregated' : successSource,
    timestamp: Date.now(),
    confidence,
  };
}

// ============================================================================
// TOKEN PRICE
// ============================================================================

/**
 * Jupiter Price API v2 - uses API key for authenticated requests
 */
async function fetchJupiterTokenPrice(mint: string): Promise<number> {
  const jupiterApiKey = process.env.JUPITER_API_KEY;
  
  if (!jupiterApiKey) {
    throw new Error('Jupiter API key not configured');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  
  try {
    const response = await fetch(
      `https://api.jup.ag/price/v2?ids=${mint}`,
      { 
        next: { revalidate: 10 },
        signal: controller.signal,
        headers: { 
          'Accept': 'application/json',
          'x-api-key': jupiterApiKey 
        }
      }
    );
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`Jupiter Price API error: ${response.status}`);
    }
    
    const data = await response.json();
    const price = data.data?.[mint]?.price;
    
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error('Invalid price from Jupiter Price API');
    }
    
    return price;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Jupiter Price API timeout');
    }
    throw error;
  }
}

/**
 * Fetch token price using Jupiter Metis Quote API with API key
 * Fallback to v6 if API key not available
 */
async function fetchJupiterQuotePrice(mint: string): Promise<number> {
  // Get token decimals (assume 9 if unknown)
  const decimals = decimalCache.get(mint) ?? 9;
  const inputAmount = BigInt(Math.pow(10, decimals));
  const jupiterApiKey = process.env.JUPITER_API_KEY || '';
  
  // Try endpoints in order
  const endpoints = [
    { 
      url: `https://api.jup.ag/swap/v1/quote?inputMint=${mint}&outputMint=${USDC_MINT}&amount=${inputAmount}&slippageBps=50`, 
      useApiKey: true 
    },
    { 
      url: `https://quote-api.jup.ag/v6/quote?inputMint=${mint}&outputMint=${USDC_MINT}&amount=${inputAmount}&slippageBps=50`, 
      useApiKey: false 
    }
  ];
  
  let lastError: Error | null = null;
  
  for (const endpoint of endpoints) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    try {
      const headers: Record<string, string> = { 'Accept': 'application/json' };
      if (endpoint.useApiKey && jupiterApiKey) {
        headers['x-api-key'] = jupiterApiKey;
      }
      
      const response = await fetch(endpoint.url, { 
        next: { revalidate: 10 },
        signal: controller.signal,
        headers
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Jupiter Quote API error: ${response.status}`);
      }
      
      const data = await response.json();
      const outAmount = data.outAmount;
      
      if (!outAmount) {
        throw new Error('No quote available');
      }
      
      // Calculate price (USDC has 6 decimals)
      const price = Number(outAmount) / 1_000_000;
      
      if (!Number.isFinite(price) || price <= 0) {
        throw new Error('Invalid quote price');
      }
      
      return price;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        lastError = new Error('Jupiter Quote API timeout');
      } else {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
      continue;
    }
  }
  
  throw lastError || new Error('All Jupiter quote endpoints failed');
}

/**
 * Fetch token price from DexScreener (backup source)
 */
async function fetchDexScreenerPrice(mint: string): Promise<number> {
  // Create timeout manually for Node.js compatibility
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  
  try {
    const response = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${mint}`,
      { 
        next: { revalidate: 30 },
        signal: controller.signal,
      }
    );
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`DexScreener API error: ${response.status}`);
    }
    
    const data = await response.json();
    const pair = data.pairs?.find((p: any) => 
      Number.isFinite(parseFloat(p.priceUsd)) && parseFloat(p.priceUsd) > 0
    );
    
    if (!pair) {
      throw new Error('No pair found on DexScreener');
    }
    
    return parseFloat(pair.priceUsd);
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('DexScreener API timeout');
    }
    throw error;
  }
}

/**
 * Get token price in USD
 * Order: DexScreener (reliable) -> Jupiter Quote -> Jupiter Price
 * 
 * @param mint - Token mint address
 * @returns Price result
 */
export async function getTokenPrice(mint: string): Promise<PriceResult> {
  // Check cache first
  const cached = priceCache.get(mint);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return {
      price: cached.price,
      source: 'cache',
      timestamp: cached.timestamp,
      confidence: 'high',
    };
  }
  
  // Special case: SOL
  if (mint === SOL_MINT || mint.toLowerCase() === 'sol') {
    return getSolPrice();
  }
  
  // Try sources in order - DexScreener first (most reliable, no auth/geo issues)
  const sources: Array<{ name: string; fetch: () => Promise<number> }> = [
    { name: 'dexscreener', fetch: () => fetchDexScreenerPrice(mint) },
    { name: 'jupiter_quote', fetch: () => fetchJupiterQuotePrice(mint) },
    { name: 'jupiter_price', fetch: () => fetchJupiterTokenPrice(mint) },
  ];
  
  for (const source of sources) {
    try {
      const price = await source.fetch();
      recordSourceHealth(source.name, true);
      
      // Cache the result
      priceCache.set(mint, { price, timestamp: Date.now() });
      
      return {
        price,
        source: source.name,
        timestamp: Date.now(),
        confidence: source.name === 'jupiter_price' ? 'high' : 'medium',
      };
    } catch (error) {
      recordSourceHealth(source.name, false, error instanceof Error ? error.message : 'Unknown');
      continue;
    }
  }
  
  throw new Error(`Could not fetch price for ${mint} from any source`);
}

/**
 * Get token price in SOL
 * 
 * @param mint - Token mint address
 * @returns Price in SOL
 */
export async function getTokenPriceInSol(mint: string): Promise<PriceResult> {
  const [tokenPrice, solPrice] = await Promise.all([
    getTokenPrice(mint),
    getSolPrice(),
  ]);
  
  const priceInSol = tokenPrice.price / solPrice.price;
  
  return {
    price: priceInSol,
    source: `${tokenPrice.source}+sol`,
    timestamp: Date.now(),
    confidence: tokenPrice.confidence === 'high' && solPrice.confidence === 'high' 
      ? 'high' 
      : 'medium',
  };
}

// ============================================================================
// BATCH PRICE FETCHING
// ============================================================================

/**
 * Get prices for multiple tokens efficiently
 * 
 * @param mints - Array of token mint addresses
 * @returns Map of mint to price result
 */
export async function getTokenPrices(
  mints: string[]
): Promise<Map<string, PriceResult | null>> {
  const results = await Promise.allSettled(
    mints.map(mint => getTokenPrice(mint))
  );
  
  const priceMap = new Map<string, PriceResult | null>();
  
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      priceMap.set(mints[index], result.value);
    } else {
      priceMap.set(mints[index], null);
    }
  });
  
  return priceMap;
}

// ============================================================================
// UTILITY
// ============================================================================

/**
 * Set token decimals in cache (for accurate quote pricing)
 */
export function setTokenDecimals(mint: string, decimals: number): void {
  decimalCache.set(mint, decimals);
}

/**
 * Clear all price caches
 */
export function clearPriceCache(): void {
  priceCache.clear();
}

