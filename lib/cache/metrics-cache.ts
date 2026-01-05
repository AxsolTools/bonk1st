/**
 * AQUA Launchpad - Metrics Cache
 * 
 * In-memory cache for token metrics to handle 100+ simultaneous users
 * Prevents redundant API calls and ensures consistent data
 */

// ============================================================================
// TYPES
// ============================================================================

export interface CachedMetrics {
  waterLevel: number;
  evaporated: number;
  evaporationRate: number;
  constellationStrength: number;
  tideHarvest: number;
  pourRateTotal: number;
  pourRateLast24h: number;
  liquidity: number;
  marketCap: number;
  totalSupply: number;
  timestamp: number;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

// ============================================================================
// CACHE CONFIGURATION
// ============================================================================

const DEFAULT_TTL_MS = 10_000; // 10 seconds for metrics
const EXTENDED_TTL_MS = 60_000; // 1 minute for less volatile data
const MAX_CACHE_SIZE = 1000; // Maximum number of tokens to cache

// ============================================================================
// CACHE STORAGE
// ============================================================================

// Main metrics cache
const metricsCache = new Map<string, CacheEntry<CachedMetrics>>();

// Individual value caches for specific lookups
const liquidityCache = new Map<string, CacheEntry<number>>();
const burnCache = new Map<string, CacheEntry<{ total: number; rate: number }>>();
const vaultCache = new Map<string, CacheEntry<number>>();
const priceCache = new Map<string, CacheEntry<{ price: number; marketCap: number }>>();

// Cache statistics
let cacheStats = {
  hits: 0,
  misses: 0,
  evictions: 0,
  lastCleanup: Date.now(),
};

// ============================================================================
// CACHE OPERATIONS
// ============================================================================

/**
 * Get cached metrics for a token
 */
export function getCachedMetrics(mintAddress: string): CachedMetrics | null {
  const entry = metricsCache.get(mintAddress);
  
  if (!entry) {
    cacheStats.misses++;
    return null;
  }
  
  // Check if expired
  if (Date.now() > entry.expiresAt) {
    metricsCache.delete(mintAddress);
    cacheStats.misses++;
    return null;
  }
  
  cacheStats.hits++;
  return entry.data;
}

/**
 * Set cached metrics for a token
 */
export function setCachedMetrics(
  mintAddress: string,
  metrics: CachedMetrics,
  ttlMs: number = DEFAULT_TTL_MS
): void {
  // Cleanup if cache is getting large
  if (metricsCache.size >= MAX_CACHE_SIZE) {
    cleanupCache();
  }
  
  metricsCache.set(mintAddress, {
    data: metrics,
    timestamp: Date.now(),
    expiresAt: Date.now() + ttlMs,
  });
}

/**
 * Invalidate cached metrics for a token
 */
export function invalidateMetrics(mintAddress: string): void {
  metricsCache.delete(mintAddress);
  liquidityCache.delete(mintAddress);
  burnCache.delete(mintAddress);
  vaultCache.delete(mintAddress);
  priceCache.delete(mintAddress);
}

/**
 * Invalidate all cached metrics
 */
export function invalidateAllMetrics(): void {
  metricsCache.clear();
  liquidityCache.clear();
  burnCache.clear();
  vaultCache.clear();
  priceCache.clear();
  cacheStats.evictions++;
}

// ============================================================================
// INDIVIDUAL VALUE CACHES
// ============================================================================

/**
 * Get/Set liquidity cache
 */
export function getCachedLiquidity(mintAddress: string): number | null {
  const entry = liquidityCache.get(mintAddress);
  if (!entry || Date.now() > entry.expiresAt) {
    if (entry) liquidityCache.delete(mintAddress);
    return null;
  }
  return entry.data;
}

export function setCachedLiquidity(mintAddress: string, liquidity: number): void {
  liquidityCache.set(mintAddress, {
    data: liquidity,
    timestamp: Date.now(),
    expiresAt: Date.now() + DEFAULT_TTL_MS,
  });
}

/**
 * Get/Set burn cache
 */
export function getCachedBurn(mintAddress: string): { total: number; rate: number } | null {
  const entry = burnCache.get(mintAddress);
  if (!entry || Date.now() > entry.expiresAt) {
    if (entry) burnCache.delete(mintAddress);
    return null;
  }
  return entry.data;
}

export function setCachedBurn(mintAddress: string, data: { total: number; rate: number }): void {
  burnCache.set(mintAddress, {
    data,
    timestamp: Date.now(),
    expiresAt: Date.now() + EXTENDED_TTL_MS, // Burns change less frequently
  });
}

/**
 * Get/Set vault balance cache
 */
export function getCachedVaultBalance(mintAddress: string): number | null {
  const entry = vaultCache.get(mintAddress);
  if (!entry || Date.now() > entry.expiresAt) {
    if (entry) vaultCache.delete(mintAddress);
    return null;
  }
  return entry.data;
}

export function setCachedVaultBalance(mintAddress: string, balance: number): void {
  vaultCache.set(mintAddress, {
    data: balance,
    timestamp: Date.now(),
    expiresAt: Date.now() + DEFAULT_TTL_MS,
  });
}

/**
 * Get/Set price cache
 */
export function getCachedPrice(mintAddress: string): { price: number; marketCap: number } | null {
  const entry = priceCache.get(mintAddress);
  if (!entry || Date.now() > entry.expiresAt) {
    if (entry) priceCache.delete(mintAddress);
    return null;
  }
  return entry.data;
}

export function setCachedPrice(mintAddress: string, data: { price: number; marketCap: number }): void {
  priceCache.set(mintAddress, {
    data,
    timestamp: Date.now(),
    expiresAt: Date.now() + DEFAULT_TTL_MS,
  });
}

// ============================================================================
// CACHE MAINTENANCE
// ============================================================================

/**
 * Cleanup expired entries
 */
function cleanupCache(): void {
  const now = Date.now();
  let cleaned = 0;
  
  // Cleanup main metrics cache
  for (const [key, entry] of metricsCache) {
    if (now > entry.expiresAt) {
      metricsCache.delete(key);
      cleaned++;
    }
  }
  
  // Cleanup individual caches
  for (const cache of [liquidityCache, burnCache, vaultCache, priceCache]) {
    for (const [key, entry] of cache) {
      if (now > entry.expiresAt) {
        cache.delete(key);
        cleaned++;
      }
    }
  }
  
  cacheStats.evictions += cleaned;
  cacheStats.lastCleanup = now;
  
  if (cleaned > 0) {
    console.log(`[CACHE] Cleaned ${cleaned} expired entries`);
  }
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
  hits: number;
  misses: number;
  hitRate: number;
  size: number;
  evictions: number;
  lastCleanup: number;
} {
  const total = cacheStats.hits + cacheStats.misses;
  const hitRate = total > 0 ? (cacheStats.hits / total) * 100 : 0;
  
  return {
    hits: cacheStats.hits,
    misses: cacheStats.misses,
    hitRate: Math.round(hitRate * 100) / 100,
    size: metricsCache.size,
    evictions: cacheStats.evictions,
    lastCleanup: cacheStats.lastCleanup,
  };
}

/**
 * Reset cache statistics
 */
export function resetCacheStats(): void {
  cacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    lastCleanup: Date.now(),
  };
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Get metrics for multiple tokens at once
 */
export function getBatchCachedMetrics(mintAddresses: string[]): Map<string, CachedMetrics | null> {
  const results = new Map<string, CachedMetrics | null>();
  
  for (const address of mintAddresses) {
    results.set(address, getCachedMetrics(address));
  }
  
  return results;
}

/**
 * Set metrics for multiple tokens at once
 */
export function setBatchCachedMetrics(
  metrics: Map<string, CachedMetrics>,
  ttlMs: number = DEFAULT_TTL_MS
): void {
  for (const [address, data] of metrics) {
    setCachedMetrics(address, data, ttlMs);
  }
}

// ============================================================================
// SCHEDULED CLEANUP
// ============================================================================

// Run cleanup every 30 seconds
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    cleanupCache();
  }, 30_000);
}

