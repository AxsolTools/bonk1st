/**
 * AQUA Launchpad - Cache Module
 * 
 * Exports caching utilities for metrics
 */

export {
  // Types
  type CachedMetrics,
  
  // Full metrics cache
  getCachedMetrics,
  setCachedMetrics,
  invalidateMetrics,
  invalidateAllMetrics,
  
  // Individual caches
  getCachedLiquidity,
  setCachedLiquidity,
  getCachedBurn,
  setCachedBurn,
  getCachedVaultBalance,
  setCachedVaultBalance,
  getCachedPrice,
  setCachedPrice,
  
  // Batch operations
  getBatchCachedMetrics,
  setBatchCachedMetrics,
  
  // Statistics
  getCacheStats,
  resetCacheStats,
} from './metrics-cache';

