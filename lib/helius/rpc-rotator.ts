/**
 * Helius RPC Rotator
 * 
 * Distributes API calls across multiple Helius API keys to:
 * 1. Avoid hitting rate limits on a single key
 * 2. Maximize throughput across multiple developer plans
 * 3. Provide automatic failover
 * 
 * Usage:
 * - Standard RPC calls use getNextRpcUrl()
 * - WebSocket connections use getNextWsUrl()
 * - All methods automatically rotate and track usage
 */

interface RpcEndpoint {
  url: string
  apiKey: string
  wsUrl: string
  requestCount: number
  errorCount: number
  lastUsed: number
  lastError: number | null
}

class HeliusRpcRotator {
  private endpoints: RpcEndpoint[] = []
  private currentIndex = 0
  private windowStartTime = Date.now()
  
  // Rate limiting config
  private readonly RATE_LIMIT_WINDOW = 60000 // 1 minute
  private readonly MAX_REQUESTS_PER_ENDPOINT = 2500 // Conservative limit per minute per key
  private readonly ERROR_COOLDOWN = 10000 // 10 seconds after error
  private readonly MAX_ERRORS_BEFORE_SKIP = 3 // Skip endpoint after 3 consecutive errors

  constructor(apiKeys: string[]) {
    this.endpoints = apiKeys.map(key => ({
      url: `https://mainnet.helius-rpc.com/?api-key=${key}`,
      apiKey: key,
      wsUrl: `wss://mainnet.helius-rpc.com/?api-key=${key}`,
      requestCount: 0,
      errorCount: 0,
      lastUsed: 0,
      lastError: null,
    }))

    console.log(`[RPC-ROTATOR] Initialized with ${this.endpoints.length} endpoints`)
  }

  /**
   * Get next available RPC URL with automatic rotation
   */
  getNextRpcUrl(): string {
    this.resetWindowIfNeeded()
    
    // Find the best endpoint
    const endpoint = this.selectBestEndpoint()
    
    if (!endpoint) {
      // Fallback to public RPC if all endpoints are exhausted
      console.warn('[RPC-ROTATOR] All endpoints exhausted, using fallback')
      return 'https://api.mainnet-beta.solana.com'
    }

    // Update usage stats
    endpoint.requestCount++
    endpoint.lastUsed = Date.now()
    
    return endpoint.url
  }

  /**
   * Get next available WebSocket URL
   * WebSockets are long-lived, so we use a different strategy
   */
  getNextWsUrl(): string {
    this.resetWindowIfNeeded()
    
    // For WebSockets, prefer the endpoint with lowest active connections (request count)
    const sortedByUsage = [...this.endpoints].sort((a, b) => {
      // Skip endpoints with recent errors
      if (a.errorCount >= this.MAX_ERRORS_BEFORE_SKIP && 
          a.lastError && 
          Date.now() - a.lastError < this.ERROR_COOLDOWN) {
        return 1
      }
      if (b.errorCount >= this.MAX_ERRORS_BEFORE_SKIP && 
          b.lastError && 
          Date.now() - b.lastError < this.ERROR_COOLDOWN) {
        return -1
      }
      
      return a.requestCount - b.requestCount
    })

    const endpoint = sortedByUsage[0]
    endpoint.requestCount++
    endpoint.lastUsed = Date.now()
    
    return endpoint.wsUrl
  }

  /**
   * Record a successful request
   */
  recordSuccess(url: string): void {
    const endpoint = this.endpoints.find(e => e.url === url || e.wsUrl === url)
    if (endpoint) {
      endpoint.errorCount = 0 // Reset error count on success
    }
  }

  /**
   * Record a failed request
   */
  recordError(url: string): void {
    const endpoint = this.endpoints.find(e => e.url === url || e.wsUrl === url)
    if (endpoint) {
      endpoint.errorCount++
      endpoint.lastError = Date.now()
      
      if (endpoint.errorCount >= this.MAX_ERRORS_BEFORE_SKIP) {
        console.warn(`[RPC-ROTATOR] Endpoint ${endpoint.apiKey.slice(0, 8)}... marked as unhealthy after ${endpoint.errorCount} errors`)
      }
    }
  }

  /**
   * Get current rotation stats for monitoring
   */
  getStats() {
    return {
      endpoints: this.endpoints.map(e => ({
        apiKey: `${e.apiKey.slice(0, 8)}...${e.apiKey.slice(-4)}`,
        requestCount: e.requestCount,
        errorCount: e.errorCount,
        lastUsed: e.lastUsed,
        isHealthy: e.errorCount < this.MAX_ERRORS_BEFORE_SKIP,
      })),
      windowStartTime: this.windowStartTime,
      windowAge: Date.now() - this.windowStartTime,
    }
  }

  // ============ PRIVATE METHODS ============

  private selectBestEndpoint(): RpcEndpoint | null {
    const now = Date.now()

    // Filter out endpoints that are in cooldown or over limit
    const available = this.endpoints.filter(e => {
      // Skip if too many errors and still in cooldown
      if (e.errorCount >= this.MAX_ERRORS_BEFORE_SKIP && 
          e.lastError && 
          now - e.lastError < this.ERROR_COOLDOWN) {
        return false
      }

      // Skip if over rate limit
      if (e.requestCount >= this.MAX_REQUESTS_PER_ENDPOINT) {
        return false
      }

      return true
    })

    if (available.length === 0) {
      return null
    }

    // Use round-robin among available endpoints
    // This distributes load evenly
    this.currentIndex = (this.currentIndex + 1) % available.length
    return available[this.currentIndex]
  }

  private resetWindowIfNeeded(): void {
    const now = Date.now()
    
    if (now - this.windowStartTime >= this.RATE_LIMIT_WINDOW) {
      // Reset all counters
      this.endpoints.forEach(e => {
        e.requestCount = 0
        // Don't reset error count - let successful requests do that
      })
      
      this.windowStartTime = now
      console.log('[RPC-ROTATOR] Rate limit window reset')
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let rotatorInstance: HeliusRpcRotator | null = null

/**
 * Initialize the RPC rotator with API keys
 * Call this once on app startup
 */
export function initializeRpcRotator(apiKeys: string[]): void {
  if (rotatorInstance) {
    console.warn('[RPC-ROTATOR] Already initialized')
    return
  }

  if (apiKeys.length === 0) {
    console.warn('[RPC-ROTATOR] No API keys provided')
    return
  }

  rotatorInstance = new HeliusRpcRotator(apiKeys)
}

/**
 * Get the next RPC URL
 */
export function getNextRpcUrl(): string {
  if (!rotatorInstance) {
    // Fallback to single key or public RPC
    const fallbackKey = process.env.HELIUS_API_KEY || process.env.NEXT_PUBLIC_HELIUS_API_KEY
    if (fallbackKey) {
      return `https://mainnet.helius-rpc.com/?api-key=${fallbackKey}`
    }
    return 'https://api.mainnet-beta.solana.com'
  }

  return rotatorInstance.getNextRpcUrl()
}

/**
 * Get the next WebSocket URL
 */
export function getNextWsUrl(): string {
  if (!rotatorInstance) {
    const fallbackKey = process.env.HELIUS_API_KEY || process.env.NEXT_PUBLIC_HELIUS_API_KEY
    if (fallbackKey) {
      return `wss://mainnet.helius-rpc.com/?api-key=${fallbackKey}`
    }
    throw new Error('No Helius API keys configured for WebSocket')
  }

  return rotatorInstance.getNextWsUrl()
}

/**
 * Record request outcome for adaptive routing
 */
export function recordRequestOutcome(url: string, success: boolean): void {
  if (!rotatorInstance) return
  
  if (success) {
    rotatorInstance.recordSuccess(url)
  } else {
    rotatorInstance.recordError(url)
  }
}

/**
 * Get rotation statistics
 */
export function getRpcStats() {
  return rotatorInstance?.getStats() || null
}

/**
 * Check if rotator is initialized
 */
export function isRotatorInitialized(): boolean {
  return rotatorInstance !== null
}

export type { RpcEndpoint }
