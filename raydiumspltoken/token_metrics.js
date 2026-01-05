/**
 * Token Metrics Module
 * Real-time token analytics using multiple data sources
 * 
 * Data Sources:
 * - Jupiter API: Real-time price data
 * - Helius DAS API: Holder count, supply info
 * - Helius Transaction API: Volume calculations
 * - Raydium/Solana RPC: Liquidity data
 * 
 * Features:
 * - 5-second cache for performance
 * - Multi-source aggregation
 * - Market cap calculation
 * - Volume tracking (5m, 1h, 24h)
 */

const { getConnection } = require('./solana_utils');
const { PublicKey } = require('@solana/web3.js');
const axios = require('axios');
const hsmacMetrics = require('./hsmac_metrics');
const heliusStreams = require('./helius_streams');
const { getRealtimePriceUSD } = require('./price_pipeline');

// Cache for metrics (5-second TTL)
const metricsCache = new Map();
const CACHE_TTL = 5000; // 5 seconds
const supplyCache = new Map();
const SUPPLY_TTL = 5 * 60 * 1000; // 5 minutes
const realtimeConfigs = new Map();
const realtimePromises = new Map();

// Price history for change calculation
const priceHistory = new Map();

function registerRealtimeTokenConfig(tokenMint, config = {}) {
  if (!tokenMint) return;
  realtimeConfigs.set(tokenMint, { ...config });
}

function unregisterRealtimeTokenConfig(tokenMint) {
  if (!tokenMint) return;
  realtimeConfigs.delete(tokenMint);
  hsmacMetrics.stopTokenMonitoring(tokenMint);
}

async function ensureRealtimeMonitoring(tokenMint) {
  if (!tokenMint || !heliusStreams.supportsStreaming) {
    return;
  }

  if (hsmacMetrics.isMonitoring(tokenMint)) {
    return;
  }

  if (realtimePromises.has(tokenMint)) {
    await realtimePromises.get(tokenMint);
    return;
  }

  const config = realtimeConfigs.get(tokenMint) || {};
  const promise = hsmacMetrics
    .startTokenMonitoring(tokenMint, config)
    .catch((error) => {
      console.warn('[TOKEN_METRICS] Failed to initialize realtime monitoring:', error.message);
    })
    .finally(() => {
      realtimePromises.delete(tokenMint);
    });

  realtimePromises.set(tokenMint, promise);
  await promise;
}

function getRealtimeSnapshot(tokenMint) {
  if (!tokenMint) return null;
  return hsmacMetrics.getTokenState(tokenMint);
}

/**
 * Get comprehensive token metrics
 * @param {string} tokenMint - Token mint address
 * @param {boolean} forceRefresh - Bypass cache
 * @returns {Promise<object>} Complete token metrics
 */
async function resolvePrice(tokenMint, realtimeState) {
  if (realtimeState && Number.isFinite(realtimeState.price) && realtimeState.price > 0) {
    return {
      current: realtimeState.price,
      source: 'helius_websocket'
    };
  }

  const { price, source } = await getRealtimePriceUSD(tokenMint, { preferRealtime: false });
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error('Failed to resolve token price');
  }
  return {
    current: price,
    source
  };
}

function buildLiquidityFromRealtime(tokenMint, realtimeState) {
  if (!realtimeState || !realtimeState.lpHealth) {
    return null;
  }

  const config = realtimeConfigs.get(tokenMint) || {};
  return {
    sol: realtimeState.lpHealth.solReserve,
    token: realtimeState.lpHealth.tokenReserve,
    poolAddress: config.poolAddress || null,
    score: realtimeState.lpHealth.score,
    source: 'helius_websocket'
  };
}

async function buildMetrics(tokenMint, { forceRefresh = false } = {}) {
  if (!tokenMint) {
    throw new Error('tokenMint is required');
  }

  if (!forceRefresh && metricsCache.has(tokenMint)) {
    const cached = metricsCache.get(tokenMint);
    if (Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
  }

  if (heliusStreams.supportsStreaming) {
    await ensureRealtimeMonitoring(tokenMint);
  }

  const realtimeState = getRealtimeSnapshot(tokenMint);

  const price = await resolvePrice(tokenMint, realtimeState);
  const [holders, volume, supplyInfo] = await Promise.all([
    getHolderCount(tokenMint),
    getVolumeMetrics(tokenMint),
    getSupplyInfo(tokenMint, { forceRefresh }),
  ]);

  let liquidity = buildLiquidityFromRealtime(tokenMint, realtimeState);
  if (!liquidity) {
    liquidity = await getLiquidityData(tokenMint);
  }

  const marketCap = price.current * (supplyInfo?.circulating || 0);
  const priceChanges = calculatePriceChanges(tokenMint, price.current);

  const metrics = {
    mint: tokenMint,
    timestamp: Date.now(),
    price: {
      current: price.current,
      change1m: priceChanges.change1m || 0,
      change5m: priceChanges.change5m || 0,
      change1h: priceChanges.change1h || 0,
      peak1h: priceChanges.peak1h || price.current,
      source: price.source
    },
    volume: {
      vol5m: volume.vol5m || 0,
      vol1h: volume.vol1h || 0,
      vol24h: volume.vol24h || 0
    },
    marketCap,
    holders: holders || 0,
    liquidity: {
      sol: liquidity.sol || 0,
      token: liquidity.token || 0,
      poolAddress: liquidity.poolAddress || null,
      score: liquidity.score || null,
      source: liquidity.source || 'fallback'
    },
    supply: {
      total: supplyInfo?.total || 0,
      circulating: supplyInfo?.circulating || 0
    },
    realtime: {
      lastTrade: realtimeState?.lastTrade || null,
      migrationDetected: realtimeState?.migrationDetected || false
    }
  };

  metricsCache.set(tokenMint, {
    data: metrics,
    timestamp: Date.now()
  });

  updatePriceHistory(tokenMint, price.current);

  return metrics;
}

async function getTokenMetrics(tokenMint, forceRefresh = false) {
  try {
    return await buildMetrics(tokenMint, { forceRefresh });
  } catch (error) {
    console.error('Error fetching token metrics:', error);
    throw error;
  }
}

/**
 * Get token holder count from Helius DAS API
 * @param {string} tokenMint - Token mint address
 * @returns {Promise<number>} Holder count
 */
async function getHolderCount(tokenMint) {
  try {
    const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
    
    if (!HELIUS_API_KEY) {
      console.warn('Helius API key not set, skipping holder count');
      return 0;
    }
    
    const conn = getConnection();
    
    // Use getTokenLargestAccounts as approximation for holder count
    // This gives us the distribution, from which we can estimate holders
    const response = await conn.getTokenLargestAccounts(
      new PublicKey(tokenMint)
    );
    
    // Return the number of accounts that hold the token
    // Note: This is an approximation. For exact count, use getProgramAccounts (slower)
    return response.value.length;
    
  } catch (error) {
    console.error('Error getting holder count:', error.message);
    return 0;
  }
}

/**
 * Get volume metrics from transaction history
 * @param {string} tokenMint - Token mint address
 * @returns {Promise<object>} Volume data
 */
async function getVolumeMetrics(tokenMint) {
  try {
    const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
    
    if (!HELIUS_API_KEY) {
      console.warn('Helius API key not set, skipping volume');
      return { vol5m: 0, vol1h: 0, vol24h: 0 };
    }
    
    const now = Date.now();
    const time5m = Math.floor((now - 5 * 60 * 1000) / 1000);
    const time1h = Math.floor((now - 60 * 60 * 1000) / 1000);
    const time24h = Math.floor((now - 24 * 60 * 60 * 1000) / 1000);
    
    // Get transactions for this token in the last 24 hours
    const url = `https://api.helius.xyz/v0/addresses/${tokenMint}/transactions`;
    
    const response = await axios.get(url, {
      params: {
        'api-key': HELIUS_API_KEY,
        limit: 100,
        type: 'SWAP'
      }
    });
    
    if (!response.data || !Array.isArray(response.data)) {
      return { vol5m: 0, vol1h: 0, vol24h: 0 };
    }
    
    let vol5m = 0, vol1h = 0, vol24h = 0;
    
    for (const tx of response.data) {
      const txTime = tx.timestamp;
      
      // Extract SOL volume from transaction
      // This is a simplified calculation
      const solAmount = extractSOLAmount(tx);
      
      if (txTime >= time5m) {
        vol5m += solAmount;
      }
      if (txTime >= time1h) {
        vol1h += solAmount;
      }
      if (txTime >= time24h) {
        vol24h += solAmount;
      }
    }
    
    return { vol5m, vol1h, vol24h };
    
  } catch (error) {
    console.error('Error getting volume metrics:', error.message);
    return { vol5m: 0, vol1h: 0, vol24h: 0 };
  }
}

/**
 * Extract SOL amount from transaction
 * @param {object} tx - Transaction data
 * @returns {number} SOL amount
 */
function extractSOLAmount(tx) {
  try {
    if (!tx.nativeTransfers || !Array.isArray(tx.nativeTransfers)) {
      return 0;
    }
    
    // Sum all SOL transfers
    return tx.nativeTransfers.reduce((sum, transfer) => {
      return sum + (transfer.amount || 0) / 1e9; // Convert lamports to SOL
    }, 0);
  } catch (error) {
    return 0;
  }
}

/**
 * Get liquidity data from pool
 * @param {string} tokenMint - Token mint address
 * @returns {Promise<object>} Liquidity data
 */
async function getLiquidityData(tokenMint) {
  try {
    // This would need to query Raydium or Jupiter for pool info
    // For now, return placeholder
    // TODO: Implement actual pool liquidity fetching
    
    return {
      sol: 0,
      token: 0,
      poolAddress: null
    };
    
  } catch (error) {
    console.error('Error getting liquidity data:', error.message);
    return {
      sol: 0,
      token: 0,
      poolAddress: null
    };
  }
}

/**
 * Get supply information
 * @param {string} tokenMint - Token mint address
 * @returns {Promise<object>} Supply data
 */
async function getSupplyInfo(tokenMint, { forceRefresh = false } = {}) {
  try {
    if (!forceRefresh && supplyCache.has(tokenMint)) {
      const cached = supplyCache.get(tokenMint);
      if (Date.now() - cached.timestamp < SUPPLY_TTL) {
        return cached.data;
      }
    }

    const conn = getConnection();
    const supply = await conn.getTokenSupply(new PublicKey(tokenMint));
    
    const result = {
      total: supply.value.uiAmount || 0,
      circulating: supply.value.uiAmount || 0 // Assume all circulating for now
    };
    
    supplyCache.set(tokenMint, {
      data: result,
      timestamp: Date.now()
    });
    
    return result;
    
  } catch (error) {
    console.error('Error getting supply info:', error.message);
    return {
      total: 0,
      circulating: 0
    };
  }
}

/**
 * Update price history for change calculation
 * @param {string} tokenMint - Token mint address
 * @param {number} currentPrice - Current price
 */
function updatePriceHistory(tokenMint, currentPrice) {
  if (!priceHistory.has(tokenMint)) {
    priceHistory.set(tokenMint, {
      prices: [],
      timestamps: [],
      peak1h: currentPrice
    });
  }
  
  const history = priceHistory.get(tokenMint);
  const now = Date.now();
  
  // Add current price
  history.prices.push(currentPrice);
  history.timestamps.push(now);
  
  // Update peak
  if (currentPrice > history.peak1h) {
    history.peak1h = currentPrice;
  }
  
  // Keep only last hour of data
  const oneHourAgo = now - 60 * 60 * 1000;
  while (history.timestamps.length > 0 && history.timestamps[0] < oneHourAgo) {
    history.prices.shift();
    history.timestamps.shift();
  }
}

/**
 * Calculate price changes over time
 * @param {string} tokenMint - Token mint address
 * @param {number} currentPrice - Current price
 * @returns {object} Price changes
 */
function calculatePriceChanges(tokenMint, currentPrice) {
  if (!priceHistory.has(tokenMint)) {
    return {
      change1m: 0,
      change5m: 0,
      change1h: 0,
      peak1h: currentPrice
    };
  }
  
  const history = priceHistory.get(tokenMint);
  const now = Date.now();
  
  const price1mAgo = getPriceAtTime(history, now - 60 * 1000);
  const price5mAgo = getPriceAtTime(history, now - 5 * 60 * 1000);
  const price1hAgo = getPriceAtTime(history, now - 60 * 60 * 1000);
  
  return {
    change1m: price1mAgo ? ((currentPrice - price1mAgo) / price1mAgo) * 100 : 0,
    change5m: price5mAgo ? ((currentPrice - price5mAgo) / price5mAgo) * 100 : 0,
    change1h: price1hAgo ? ((currentPrice - price1hAgo) / price1hAgo) * 100 : 0,
    peak1h: history.peak1h
  };
}

/**
 * Get price at specific time from history
 * @param {object} history - Price history
 * @param {number} targetTime - Target timestamp
 * @returns {number|null} Price at that time
 */
function getPriceAtTime(history, targetTime) {
  if (history.timestamps.length === 0) return null;
  
  // Find closest timestamp
  let closestIndex = 0;
  let closestDiff = Math.abs(history.timestamps[0] - targetTime);
  
  for (let i = 1; i < history.timestamps.length; i++) {
    const diff = Math.abs(history.timestamps[i] - targetTime);
    if (diff < closestDiff) {
      closestDiff = diff;
      closestIndex = i;
    }
  }
  
  // Only return if within 30 seconds
  if (closestDiff < 30000) {
    return history.prices[closestIndex];
  }
  
  return null;
}

/**
 * Clear cache for a specific token or all tokens
 * @param {string} tokenMint - Token mint address (optional)
 */
function clearCache(tokenMint = null) {
  if (tokenMint) {
    metricsCache.delete(tokenMint);
  } else {
    metricsCache.clear();
  }
}

/**
 * Get real-time metrics stream
 * Continuously fetches and updates metrics every 5 seconds
 * @param {string} tokenMint - Token mint address
 * @param {function} callback - Callback function for updates
 * @returns {object} Control object with stop() method
 */
function streamMetrics(tokenMint, callback, options = {}) {
  let running = true;
  let intervalId = null;
  let realtimeUnsub = null;
  let debounceTimer = null;
  let realtimePending = false;

  const triggerUpdate = async (forceRefresh = false) => {
    if (!running) return;
    try {
      const metrics = await buildMetrics(tokenMint, { forceRefresh });
      callback(metrics);
    } catch (error) {
      console.error('Error in metrics stream:', error.message);
    }
  };

  // Initial fetch (force refresh)
  triggerUpdate(true);

  if (heliusStreams.supportsStreaming) {
    ensureRealtimeMonitoring(tokenMint).catch(() => {});

    realtimeUnsub = hsmacMetrics.subscribe(tokenMint, () => {
      if (realtimePending) {
        return;
      }
      realtimePending = true;
      debounceTimer = setTimeout(async () => {
        realtimePending = false;
        await triggerUpdate(false);
      }, options.debounceMs || 750);
    });

    // Periodic refresh for slower data sources (holders/volume)
    const refreshInterval = options.refreshIntervalMs || 15000;
    intervalId = setInterval(() => {
      triggerUpdate(true);
    }, refreshInterval);
  } else {
    const pollInterval = options.pollIntervalMs || 5000;
    intervalId = setInterval(() => {
      triggerUpdate(true);
    }, pollInterval);
  }

  return {
    stop: () => {
      running = false;
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      if (typeof realtimeUnsub === 'function') {
        realtimeUnsub();
        realtimeUnsub = null;
      }
    }
  };
}

module.exports = {
  getTokenMetrics,
  fetchPriceFromJupiter,
  getCurrentPrice: fetchPriceFromJupiter,
  getHolderCount,
  getVolumeMetrics,
  getLiquidityData,
  getSupplyInfo,
  clearCache,
  streamMetrics,
  registerRealtimeTokenConfig,
  unregisterRealtimeTokenConfig,
  getRealtimeSnapshot
};

