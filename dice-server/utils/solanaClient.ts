/**
 * Solana Client - Multi-RPC Connection Manager
 * 
 * Provides load balancing and failover across multiple RPC endpoints
 * for high availability and scalability.
 */

import { Connection, Commitment } from '@solana/web3.js';

// Parse RPC endpoints from environment
const getRpcEndpoints = (): string[] => {
  const urls = process.env.SOLANA_RPC_URLS;
  if (!urls) {
    console.warn('[SOLANA] No RPC URLs configured, using default mainnet');
    return ['https://api.mainnet-beta.solana.com'];
  }
  return urls.split(',').map(url => url.trim()).filter(url => url.length > 0);
};

// Health tracking for endpoints
interface EndpointHealth {
  failures: number;
  lastFailure: number;
  lastSuccess: number;
  avgResponseTime: number;
}

const endpointHealth: Map<string, EndpointHealth> = new Map();
let currentRpcIndex = 0;
let connectionCache: Map<string, Connection> = new Map();

// Constants
const FAILURE_COOLDOWN_MS = 60000; // 60 seconds cooldown after failure
const MAX_FAILURES_BEFORE_SKIP = 3;
const HEALTH_CHECK_INTERVAL_MS = 30000; // 30 seconds

/**
 * Initialize endpoint health tracking
 */
const initializeEndpointHealth = () => {
  const endpoints = getRpcEndpoints();
  endpoints.forEach(endpoint => {
    if (!endpointHealth.has(endpoint)) {
      endpointHealth.set(endpoint, {
        failures: 0,
        lastFailure: 0,
        lastSuccess: Date.now(),
        avgResponseTime: 0
      });
    }
  });
};

/**
 * Check if an endpoint is healthy (not in cooldown)
 */
const isEndpointHealthy = (endpoint: string): boolean => {
  const health = endpointHealth.get(endpoint);
  if (!health) return true;
  
  // Check if in cooldown period
  if (health.failures >= MAX_FAILURES_BEFORE_SKIP) {
    const timeSinceFailure = Date.now() - health.lastFailure;
    if (timeSinceFailure < FAILURE_COOLDOWN_MS) {
      return false;
    }
    // Reset failures after cooldown
    health.failures = 0;
  }
  
  return true;
};

/**
 * Record a successful request
 */
export const recordSuccess = (endpoint: string, responseTimeMs: number) => {
  const health = endpointHealth.get(endpoint);
  if (health) {
    health.lastSuccess = Date.now();
    health.failures = Math.max(0, health.failures - 1); // Gradually recover
    // Update rolling average
    health.avgResponseTime = health.avgResponseTime === 0 
      ? responseTimeMs 
      : (health.avgResponseTime * 0.8 + responseTimeMs * 0.2);
  }
};

/**
 * Record a failed request
 */
export const recordFailure = (endpoint: string, error?: Error) => {
  const health = endpointHealth.get(endpoint);
  if (health) {
    health.failures++;
    health.lastFailure = Date.now();
    console.error(`[SOLANA] Endpoint ${endpoint} failed (${health.failures} failures):`, error?.message);
  }
};

/**
 * Get the next healthy RPC endpoint (round-robin with health check)
 */
export const getNextEndpoint = (): string => {
  const endpoints = getRpcEndpoints();
  const startIndex = currentRpcIndex;
  
  // Try to find a healthy endpoint
  do {
    currentRpcIndex = (currentRpcIndex + 1) % endpoints.length;
    const endpoint = endpoints[currentRpcIndex];
    
    if (isEndpointHealthy(endpoint)) {
      return endpoint;
    }
  } while (currentRpcIndex !== startIndex);
  
  // All endpoints unhealthy, return current one anyway
  console.warn('[SOLANA] All endpoints unhealthy, using fallback');
  return endpoints[currentRpcIndex];
};

/**
 * Get a Solana connection with the next healthy endpoint
 */
export const getConnection = (commitment: Commitment = 'confirmed'): Connection => {
  const endpoint = getNextEndpoint();
  
  // Check cache first
  const cacheKey = `${endpoint}-${commitment}`;
  if (connectionCache.has(cacheKey)) {
    return connectionCache.get(cacheKey)!;
  }
  
  // Create new connection
  const connection = new Connection(endpoint, {
    commitment,
    confirmTransactionInitialTimeout: 60000,
    wsEndpoint: process.env.SOLANA_WS_URL || undefined
  });
  
  // Cache it
  connectionCache.set(cacheKey, connection);
  
  return connection;
};

/**
 * Execute a Solana RPC call with automatic failover
 */
export const executeWithFailover = async <T>(
  operation: (connection: Connection) => Promise<T>,
  maxRetries: number = 3
): Promise<T> => {
  const endpoints = getRpcEndpoints();
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const endpoint = getNextEndpoint();
    const connection = new Connection(endpoint, 'confirmed');
    const startTime = Date.now();
    
    try {
      const result = await operation(connection);
      recordSuccess(endpoint, Date.now() - startTime);
      return result;
    } catch (error: any) {
      lastError = error;
      recordFailure(endpoint, error);
      
      // Check for rate limiting
      if (error.message?.includes('429') || error.message?.includes('rate limit')) {
        console.warn(`[SOLANA] Rate limited on ${endpoint}, switching endpoint`);
        continue;
      }
      
      // Check for timeout
      if (error.message?.includes('timeout') || error.code === 'ETIMEDOUT') {
        console.warn(`[SOLANA] Timeout on ${endpoint}, switching endpoint`);
        continue;
      }
      
      // For other errors, still try next endpoint
      console.warn(`[SOLANA] Error on ${endpoint}:`, error.message);
    }
  }
  
  throw lastError || new Error('All RPC endpoints failed');
};

/**
 * Get current endpoint status for monitoring
 */
export const getEndpointStatus = (): { endpoint: string; health: EndpointHealth }[] => {
  const endpoints = getRpcEndpoints();
  return endpoints.map(endpoint => ({
    endpoint,
    health: endpointHealth.get(endpoint) || {
      failures: 0,
      lastFailure: 0,
      lastSuccess: 0,
      avgResponseTime: 0
    }
  }));
};

/**
 * Health check - ping all endpoints
 */
export const healthCheck = async (): Promise<void> => {
  const endpoints = getRpcEndpoints();
  console.log('[SOLANA] Running health check on', endpoints.length, 'endpoints');
  
  await Promise.all(endpoints.map(async (endpoint) => {
    const connection = new Connection(endpoint, 'confirmed');
    const startTime = Date.now();
    
    try {
      await connection.getSlot();
      recordSuccess(endpoint, Date.now() - startTime);
      console.log(`[SOLANA] ✓ ${endpoint} (${Date.now() - startTime}ms)`);
    } catch (error: any) {
      recordFailure(endpoint, error);
      console.log(`[SOLANA] ✗ ${endpoint}: ${error.message}`);
    }
  }));
};

/**
 * Initialize the Solana client
 */
export const initializeSolanaClient = async (): Promise<void> => {
  console.log('[SOLANA] Initializing Solana client...');
  initializeEndpointHealth();
  
  // Run initial health check
  await healthCheck();
  
  // Schedule periodic health checks
  setInterval(() => {
    healthCheck().catch(err => console.error('[SOLANA] Health check error:', err));
  }, HEALTH_CHECK_INTERVAL_MS);
  
  console.log('[SOLANA] Solana client initialized');
};

/**
 * Clear connection cache (useful for testing)
 */
export const clearConnectionCache = (): void => {
  connectionCache.clear();
};

export default {
  getConnection,
  executeWithFailover,
  getEndpointStatus,
  healthCheck,
  initializeSolanaClient,
  recordSuccess,
  recordFailure
};

