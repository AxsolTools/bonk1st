/**
 * Helius Priority Fee API
 * Calculate optimal priority fees for Solana transactions
 * 
 * CREDIT COSTS: 1 credit per call
 * RATE LIMIT: 50 req/s on Developer plan
 * 
 * Benefits:
 * - Improves transaction landing rate during congestion
 * - Provides fee estimates based on real-time network conditions
 * - Multiple priority levels (low, medium, high, very high)
 */

const HELIUS_API_KEY = process.env.HELIUS_API_KEY || process.env.NEXT_PUBLIC_HELIUS_API_KEY

interface PriorityFeeEstimate {
  priorityFeeEstimate: number
  priorityFeeLevels?: {
    min: number
    low: number
    medium: number
    high: number
    veryHigh: number
    unsafeMax: number
  }
}

interface PriorityFeeOptions {
  /**
   * Transaction to analyze for fee estimation
   * Base64 encoded serialized transaction
   */
  transaction?: string
  /**
   * Account keys involved in the transaction
   * Alternative to providing full transaction
   */
  accountKeys?: string[]
  /**
   * Include all priority levels in response
   */
  includeAllPriorityFeeLevels?: boolean
  /**
   * Priority level for the estimate
   */
  priorityLevel?: 'Min' | 'Low' | 'Medium' | 'High' | 'VeryHigh' | 'UnsafeMax'
  /**
   * Add a small buffer to the estimate for safety
   */
  evaluateEmptySlotAsZero?: boolean
  /**
   * Lookback slots for fee calculation
   */
  lookbackSlots?: number
}

// Cache for priority fee estimates (short TTL due to network volatility)
const feeCache = new Map<string, { data: PriorityFeeEstimate; timestamp: number }>()
const CACHE_TTL = 5000 // 5 seconds - fees change quickly

function getCached(key: string): PriorityFeeEstimate | null {
  const cached = feeCache.get(key)
  if (!cached) return null
  if (Date.now() - cached.timestamp > CACHE_TTL) {
    feeCache.delete(key)
    return null
  }
  return cached.data
}

function setCache(key: string, data: PriorityFeeEstimate): void {
  feeCache.set(key, { data, timestamp: Date.now() })
}

/**
 * Get priority fee estimate for a transaction or set of accounts
 * 
 * @param options - Configuration for fee estimation
 * @returns PriorityFeeEstimate with recommended fees
 * 
 * @example
 * // Using account keys
 * const fee = await getPriorityFeeEstimate({
 *   accountKeys: ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'So11111111111111111111111111111111111111112'],
 *   includeAllPriorityFeeLevels: true,
 * })
 * 
 * @example
 * // Using serialized transaction
 * const fee = await getPriorityFeeEstimate({
 *   transaction: base64SerializedTx,
 *   priorityLevel: 'High',
 * })
 */
export async function getPriorityFeeEstimate(
  options: PriorityFeeOptions = {}
): Promise<PriorityFeeEstimate | null> {
  const apiKey = HELIUS_API_KEY
  if (!apiKey) {
    console.warn('[PRIORITY-FEE] No Helius API key configured')
    return null
  }

  // Create cache key based on options
  const cacheKey = options.transaction 
    ? `tx-${options.transaction.slice(0, 20)}`
    : `accounts-${(options.accountKeys || []).join('-').slice(0, 50)}`

  const cached = getCached(cacheKey)
  if (cached) return cached

  try {
    const params: Record<string, unknown> = {}

    if (options.transaction) {
      params.transaction = options.transaction
    } else if (options.accountKeys && options.accountKeys.length > 0) {
      params.accountKeys = options.accountKeys
    } else {
      // Default to common program accounts for general estimate
      params.accountKeys = [
        'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // Token Program
        'So11111111111111111111111111111111111111112', // Wrapped SOL
      ]
    }

    if (options.includeAllPriorityFeeLevels !== undefined) {
      params.options = params.options || {}
      ;(params.options as Record<string, unknown>).includeAllPriorityFeeLevels = options.includeAllPriorityFeeLevels
    }

    if (options.priorityLevel) {
      params.options = params.options || {}
      ;(params.options as Record<string, unknown>).priorityLevel = options.priorityLevel
    }

    if (options.evaluateEmptySlotAsZero !== undefined) {
      params.options = params.options || {}
      ;(params.options as Record<string, unknown>).evaluateEmptySlotAsZero = options.evaluateEmptySlotAsZero
    }

    if (options.lookbackSlots) {
      params.options = params.options || {}
      ;(params.options as Record<string, unknown>).lookbackSlots = options.lookbackSlots
    }

    const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'getPriorityFeeEstimate',
        method: 'getPriorityFeeEstimate',
        params: [params],
      }),
    })

    if (!response.ok) {
      console.warn('[PRIORITY-FEE] API error:', response.status)
      return null
    }

    const data = await response.json()
    
    if (data.error) {
      console.warn('[PRIORITY-FEE] RPC error:', data.error)
      return null
    }

    const result: PriorityFeeEstimate = data.result

    setCache(cacheKey, result)
    return result
  } catch (error) {
    console.error('[PRIORITY-FEE] Error:', error)
    return null
  }
}

/**
 * Get recommended priority fee for swap transactions
 * Pre-configured for common DEX interactions
 * 
 * @param priorityLevel - Desired priority level
 * @returns Fee in micro-lamports
 */
export async function getSwapPriorityFee(
  priorityLevel: 'Low' | 'Medium' | 'High' | 'VeryHigh' = 'Medium'
): Promise<number> {
  const estimate = await getPriorityFeeEstimate({
    accountKeys: [
      // Common DEX programs
      'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', // Jupiter
      'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // Token Program
      'So11111111111111111111111111111111111111112', // Wrapped SOL
      '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P', // Pump.fun
    ],
    priorityLevel,
    includeAllPriorityFeeLevels: true,
  })

  if (!estimate) {
    // Return sensible defaults if API fails
    const defaults: Record<string, number> = {
      Low: 1000,
      Medium: 10000,
      High: 100000,
      VeryHigh: 500000,
    }
    return defaults[priorityLevel] || 10000
  }

  // If we have all levels, use the specific one
  if (estimate.priorityFeeLevels) {
    const levelMap: Record<string, keyof typeof estimate.priorityFeeLevels> = {
      Low: 'low',
      Medium: 'medium',
      High: 'high',
      VeryHigh: 'veryHigh',
    }
    return estimate.priorityFeeLevels[levelMap[priorityLevel]] || estimate.priorityFeeEstimate
  }

  return estimate.priorityFeeEstimate
}

/**
 * Get priority fee estimate for token transfer
 * 
 * @param tokenMint - Token mint address
 * @param priorityLevel - Desired priority level
 * @returns Fee in micro-lamports
 */
export async function getTransferPriorityFee(
  tokenMint: string,
  priorityLevel: 'Low' | 'Medium' | 'High' = 'Medium'
): Promise<number> {
  const estimate = await getPriorityFeeEstimate({
    accountKeys: [
      'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // Token Program
      tokenMint,
    ],
    priorityLevel,
  })

  return estimate?.priorityFeeEstimate || 5000
}

/**
 * Calculate compute unit price from total fee
 * Solana transactions specify priority fee as micro-lamports per compute unit
 * 
 * @param totalFeeEstimate - Total fee in micro-lamports from API
 * @param estimatedComputeUnits - Estimated compute units for transaction (default 200,000)
 * @returns Compute unit price in micro-lamports
 */
export function calculateComputeUnitPrice(
  totalFeeEstimate: number,
  estimatedComputeUnits = 200000
): number {
  // The API returns the total priority fee
  // Compute unit price = total fee / compute units
  return Math.ceil(totalFeeEstimate / estimatedComputeUnits)
}

/**
 * Get all priority fee levels for display in UI
 * Useful for letting users choose their priority level
 * 
 * @returns Object with all fee levels in SOL and micro-lamports
 */
export async function getAllPriorityFeeLevels(): Promise<{
  min: { microLamports: number; sol: number }
  low: { microLamports: number; sol: number }
  medium: { microLamports: number; sol: number }
  high: { microLamports: number; sol: number }
  veryHigh: { microLamports: number; sol: number }
} | null> {
  const estimate = await getPriorityFeeEstimate({
    includeAllPriorityFeeLevels: true,
  })

  if (!estimate?.priorityFeeLevels) {
    return null
  }

  const levels = estimate.priorityFeeLevels
  const toSol = (microLamports: number) => microLamports / 1_000_000_000

  return {
    min: { microLamports: levels.min, sol: toSol(levels.min) },
    low: { microLamports: levels.low, sol: toSol(levels.low) },
    medium: { microLamports: levels.medium, sol: toSol(levels.medium) },
    high: { microLamports: levels.high, sol: toSol(levels.high) },
    veryHigh: { microLamports: levels.veryHigh, sol: toSol(levels.veryHigh) },
  }
}

export type { PriorityFeeEstimate, PriorityFeeOptions }

