/**
 * BONK1ST SNIPER - Configuration Types & Defaults
 * 
 * DeGEN-grade sniper parameters for the fastest apes on Solana
 * Monitoring BONK LaunchLab (USD1 & SOL pairs) + Pump.fun
 */

// ============================================================================
// OFFICIAL PROGRAM IDs - VERIFIED FOR NEW TOKEN MONITORING
// ============================================================================

export const SNIPER_PROGRAMS = {
  // Raydium LaunchLab - This is what BONK.fun / LetsBonk.fun uses
  // Source: https://docs.raydium.io/raydium/pool-creation/launchlab
  RAYDIUM_LAUNCHLAB: 'LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj',
  
  // Pump.fun program
  PUMP_FUN: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
  
  // Raydium AMM V4 (for standard Raydium pools)
  RAYDIUM_AMM_V4: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
  
  // SPL Token Program
  SPL_TOKEN: 'TokenkegQfeZyiNwAJbNY5vgNBH4DQ3TonLk17nRba62L',
  
  // Quote tokens
  USD1_MINT: 'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB',
  WSOL_MINT: 'So11111111111111111111111111111111111111112',
  
  // BONK platform ID on LaunchLab
  BONK_PLATFORM: '8pCtbn9iatQ8493mDQax4xfEUjhoVBpUWYVQoRU18333',
} as const

// LaunchLab instruction discriminators (first 8 bytes of instruction data)
export const LAUNCHLAB_INSTRUCTIONS = {
  // initialize_v2 - Creates new pool/token
  INITIALIZE_V2: 'initialize_v2',
  // buy - Token purchase
  BUY: 'buy',
  // sell - Token sale
  SELL: 'sell',
} as const

// Pool types the sniper can target
export type TargetPool = 'bonk-usd1' | 'bonk-sol' | 'pump' | 'raydium'

// Sniper status
export type SniperStatus = 'idle' | 'armed' | 'scanning' | 'sniping' | 'paused' | 'error'

// Individual snipe status
export type SnipeStatus = 'pending' | 'executing' | 'success' | 'failed' | 'sold'

// Auto-sell trigger types
export type AutoSellTrigger = 
  | 'take_profit' 
  | 'stop_loss' 
  | 'trailing_stop' 
  | 'time_based' 
  | 'dev_sold' 
  | 'manual'
  | 'emergency'

/**
 * Main Sniper Configuration
 * All the knobs and dials a DeGEN needs
 */
export interface SniperConfig {
  // ===== MASTER SWITCH =====
  enabled: boolean
  
  // ===== TIMING - Be First or Be Last =====
  snipeBlockZero: boolean              // "I want BLOCK 0, fam" - highest risk, highest reward
  maxBlockDelay: number                // Max blocks after creation to still snipe (0 = block 0 only)
  minBlockDelay: number                // Min blocks to wait (for safety, 0 = instant)
  
  // ===== ENTRY FILTERS - Don't Ape Everything =====
  minHolders: number                   // Minimum holder count before sniping
  maxHolders: number                   // Max holders (avoid late entries)
  minDevHoldings: number               // Min % dev must hold (avoid rugs)
  maxDevHoldings: number               // Max % dev can hold (avoid dumps)
  snipeOnDevSell: boolean              // "Ape when dev dumps" - contrarian play
  minTransactionCount: number          // Min txns before snipe (activity filter)
  minLiquidityUsd: number              // Min liquidity in USD
  maxLiquidityUsd: number              // Max liquidity (avoid whale pools)
  minMarketCap: number                 // Min market cap
  maxMarketCap: number                 // Max market cap (micro cap sniper)
  
  // ===== EXECUTION - How Much to Ape =====
  buyAmountSol: number                 // Amount per snipe in SOL
  buyAmountUsd1: number                // Amount per snipe in USD1 (for USD1 pools)
  useUsd1: boolean                     // Prefer USD1 over SOL
  slippageBps: number                  // Slippage tolerance (basis points, 100 = 1%)
  priorityFeeLamports: number          // Jito tip for faster inclusion
  
  // ===== AUTO-SELL - Secure the Bag =====
  autoSellEnabled: boolean
  takeProfitPercent: number            // "2x and I'm out" (e.g., 100 = 2x)
  stopLossPercent: number              // "Cut losses at -50%" (e.g., 50)
  trailingStopEnabled: boolean         // Enable trailing stop
  trailingStopPercent: number          // Trailing stop distance (e.g., 20 = 20% from peak)
  sellAfterBlocks: number              // Time-based exit (0 = disabled)
  sellAfterSeconds: number             // Time-based exit in seconds
  sellOnDevSell: boolean               // "If dev sells, I sell"
  sellPercentOnTrigger: number         // What % to sell when triggered (100 = all)
  
  // ===== SAFETY - Don't Get Rekt =====
  maxConcurrentSnipes: number          // Don't overextend
  dailyBudgetSol: number               // Daily spending limit
  maxSingleSnipeSol: number            // Max per single snipe
  emergencyStopEnabled: boolean        // Master kill switch
  cooldownBetweenSnipes: number        // Seconds between snipes
  blacklistTokens: string[]            // Token mints to never snipe
  blacklistCreators: string[]          // Creator wallets to avoid
  
  // ===== TARGETING - What to Hunt =====
  targetPools: TargetPool[]            // Which pool types to monitor
  onlyVerifiedDevs: boolean            // Only snipe verified creators
  requireSocialLinks: boolean          // Must have twitter/telegram
  requireWebsite: boolean              // Must have website
  
  // ===== ADVANCED - For the True DeGENs =====
  antiRugEnabled: boolean              // Enable anti-rug detection
  antiRugMaxDevSellPercent: number     // Max % dev can sell before we exit
  antiRugMinLiquidityPercent: number   // Min liquidity remaining before exit
  bundleEnabled: boolean               // Use Jito bundles for MEV protection
  retryOnFail: boolean                 // Retry failed snipes
  maxRetries: number                   // Max retry attempts
}

/**
 * Default configuration - Balanced for safety
 */
export const DEFAULT_SNIPER_CONFIG: SniperConfig = {
  // Master switch
  enabled: false,
  
  // Timing
  snipeBlockZero: false,
  maxBlockDelay: 5,
  minBlockDelay: 0,
  
  // Entry filters
  minHolders: 0,
  maxHolders: 1000,
  minDevHoldings: 0,
  maxDevHoldings: 90,
  snipeOnDevSell: false,
  minTransactionCount: 0,
  minLiquidityUsd: 1000,
  maxLiquidityUsd: 1000000,
  minMarketCap: 0,
  maxMarketCap: 500000,
  
  // Execution
  buyAmountSol: 0.1,
  buyAmountUsd1: 10,
  useUsd1: true,
  slippageBps: 1500, // 15% default for volatile new tokens
  priorityFeeLamports: 100000, // 0.0001 SOL
  
  // Auto-sell
  autoSellEnabled: true,
  takeProfitPercent: 100, // 2x
  stopLossPercent: 50, // -50%
  trailingStopEnabled: false,
  trailingStopPercent: 20,
  sellAfterBlocks: 0,
  sellAfterSeconds: 0,
  sellOnDevSell: false,
  sellPercentOnTrigger: 100,
  
  // Safety
  maxConcurrentSnipes: 3,
  dailyBudgetSol: 1,
  maxSingleSnipeSol: 0.5,
  emergencyStopEnabled: true,
  cooldownBetweenSnipes: 5,
  blacklistTokens: [],
  blacklistCreators: [],
  
  // Targeting
  targetPools: ['bonk-usd1', 'bonk-sol'],
  onlyVerifiedDevs: false,
  requireSocialLinks: false,
  requireWebsite: false,
  
  // Advanced
  antiRugEnabled: true,
  antiRugMaxDevSellPercent: 50,
  antiRugMinLiquidityPercent: 30,
  bundleEnabled: false,
  retryOnFail: true,
  maxRetries: 2,
}

/**
 * Aggressive preset - For the true DeGENs
 * "I'm here to make money or lose it all trying"
 */
export const AGGRESSIVE_SNIPER_CONFIG: Partial<SniperConfig> = {
  snipeBlockZero: true,
  maxBlockDelay: 2,
  minHolders: 0,
  minLiquidityUsd: 500,
  buyAmountSol: 0.5,
  slippageBps: 2500, // 25%
  takeProfitPercent: 200, // 3x
  stopLossPercent: 70, // -70%
  maxConcurrentSnipes: 5,
  dailyBudgetSol: 5,
}

/**
 * Conservative preset - For the cautious apes
 * "I want gains but I also want to sleep at night"
 */
export const CONSERVATIVE_SNIPER_CONFIG: Partial<SniperConfig> = {
  snipeBlockZero: false,
  maxBlockDelay: 10,
  minBlockDelay: 3,
  minHolders: 10,
  minLiquidityUsd: 5000,
  minTransactionCount: 5,
  buyAmountSol: 0.05,
  slippageBps: 1000, // 10%
  takeProfitPercent: 50, // 1.5x
  stopLossPercent: 30, // -30%
  trailingStopEnabled: true,
  trailingStopPercent: 15,
  maxConcurrentSnipes: 2,
  dailyBudgetSol: 0.5,
  onlyVerifiedDevs: true,
  requireSocialLinks: true,
}

/**
 * Active snipe record
 */
export interface ActiveSnipe {
  id: string
  tokenMint: string
  tokenSymbol: string
  tokenName: string
  tokenLogo?: string
  pool: TargetPool
  
  // Entry details
  entryBlock: number
  entryTimestamp: number
  entryPriceSol: number
  entryPriceUsd: number
  amountSol: number
  amountTokens: number
  txSignature: string
  
  // Current state
  status: SnipeStatus
  currentPriceSol: number
  currentPriceUsd: number
  currentValueSol: number
  currentValueUsd: number
  pnlSol: number
  pnlPercent: number
  peakPriceSol: number // For trailing stop
  
  // Auto-sell tracking
  takeProfitPrice: number
  stopLossPrice: number
  trailingStopPrice?: number
  sellAfterTimestamp?: number
  
  // Exit details (if sold)
  exitTimestamp?: number
  exitPriceSol?: number
  exitPriceUsd?: number
  exitTxSignature?: string
  exitTrigger?: AutoSellTrigger
  realizedPnlSol?: number
  realizedPnlPercent?: number
}

/**
 * Snipe history record
 */
export interface SnipeHistory {
  id: string
  tokenMint: string
  tokenSymbol: string
  tokenName: string
  pool: TargetPool
  
  entryBlock: number
  entryTimestamp: number
  entryPriceSol: number
  amountSol: number
  amountTokens: number
  entryTxSignature: string
  
  exitTimestamp: number
  exitPriceSol: number
  exitTxSignature: string
  exitTrigger: AutoSellTrigger
  
  realizedPnlSol: number
  realizedPnlPercent: number
  holdDurationSeconds: number
}

/**
 * New token detection event
 */
export interface NewTokenEvent {
  tokenMint: string
  tokenSymbol?: string
  tokenName?: string
  tokenLogo?: string
  
  pool: TargetPool
  quoteMint: string
  
  creationBlock: number
  creationTimestamp: number
  creationTxSignature: string
  
  creatorWallet: string
  initialLiquidityUsd: number
  initialMarketCap: number
  
  // Metadata
  hasWebsite: boolean
  hasTwitter: boolean
  hasTelegram: boolean
  
  // Computed
  passesFilters: boolean
  filterResults: {
    filter: string
    passed: boolean
    value: number | string | boolean
    threshold: number | string | boolean
  }[]
}

/**
 * Terminal log entry
 */
export interface TerminalLogEntry {
  id: string
  timestamp: number
  type: 'info' | 'success' | 'warning' | 'error' | 'snipe' | 'sell' | 'detection'
  message: string
  details?: Record<string, unknown>
  tokenMint?: string
  txSignature?: string
}

/**
 * Sniper session stats
 */
export interface SniperSessionStats {
  sessionStartTime: number
  totalSnipes: number
  successfulSnipes: number
  failedSnipes: number
  totalSolSpent: number
  totalSolReturned: number
  realizedPnlSol: number
  unrealizedPnlSol: number
  bestSnipePnlPercent: number
  worstSnipePnlPercent: number
  avgHoldTimeSeconds: number
  tokensDetected: number
  tokensFiltered: number
}

/**
 * Helper to merge config with defaults
 */
export function mergeConfig(partial: Partial<SniperConfig>): SniperConfig {
  return { ...DEFAULT_SNIPER_CONFIG, ...partial }
}

/**
 * Validate config values
 */
export function validateConfig(config: SniperConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  
  if (config.buyAmountSol <= 0 && config.buyAmountUsd1 <= 0) {
    errors.push('Buy amount must be greater than 0')
  }
  
  if (config.slippageBps < 100 || config.slippageBps > 5000) {
    errors.push('Slippage must be between 1% and 50%')
  }
  
  if (config.takeProfitPercent <= 0) {
    errors.push('Take profit must be greater than 0%')
  }
  
  if (config.stopLossPercent <= 0 || config.stopLossPercent > 100) {
    errors.push('Stop loss must be between 1% and 100%')
  }
  
  if (config.maxConcurrentSnipes < 1) {
    errors.push('Max concurrent snipes must be at least 1')
  }
  
  if (config.dailyBudgetSol <= 0) {
    errors.push('Daily budget must be greater than 0')
  }
  
  if (config.targetPools.length === 0) {
    errors.push('At least one target pool must be selected')
  }
  
  return { valid: errors.length === 0, errors }
}

/**
 * Format SOL amount for display
 */
export function formatSol(amount: number): string {
  if (amount >= 1000) return `${(amount / 1000).toFixed(2)}K`
  if (amount >= 1) return amount.toFixed(2)
  if (amount >= 0.01) return amount.toFixed(3)
  return amount.toFixed(4)
}

/**
 * Format USD amount for display
 */
export function formatUsd(amount: number): string {
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(2)}M`
  if (amount >= 1000) return `$${(amount / 1000).toFixed(2)}K`
  return `$${amount.toFixed(2)}`
}

/**
 * Format percentage for display
 */
export function formatPercent(percent: number): string {
  const sign = percent >= 0 ? '+' : ''
  return `${sign}${percent.toFixed(2)}%`
}

/**
 * Format time ago
 */
export function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

/**
 * Parse LaunchLab log to detect new token creation
 * Returns token mint if this is a new pool creation, null otherwise
 * 
 * LaunchLab creates pools with initialize/initialize_v2 instructions
 * We look for specific patterns that indicate actual pool creation, not just any transaction
 */
export function parselaunchLabLog(logs: string[] | undefined | null): { 
  isNewPool: boolean
  tokenMint: string | null
  quoteMint: string | null
  creator: string | null
} {
  let isNewPool = false
  let tokenMint: string | null = null
  let quoteMint: string | null = null
  let creator: string | null = null
  
  // Handle undefined/null logs
  if (!logs || !Array.isArray(logs) || logs.length === 0) {
    return { isNewPool, tokenMint, quoteMint, creator }
  }
  
  const fullLog = logs.join('\n')
  
  // Known system/program addresses to EXCLUDE from token mint detection
  // These are NOT token mints - they are Solana programs and system addresses
  const SYSTEM_ADDRESSES = new Set([
    // Compute Budget
    'ComputeBudget111111111111111111111111111111',
    // System Program
    '11111111111111111111111111111111',
    // Token Programs
    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    'TokenkegQfeZyiNwAJbNY5vgNBH4DQ3TonLk17nRba62L',
    'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
    // Associated Token Program
    'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
    // Metaplex
    'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
    // Rent
    'SysvarRent111111111111111111111111111111111',
    // Clock
    'SysvarC1ock11111111111111111111111111111111',
    // Stake
    'Stake11111111111111111111111111111111111111',
    // Config
    'Config1111111111111111111111111111111111111',
    // Vote
    'Vote111111111111111111111111111111111111111',
    // BPF Loader
    'BPFLoader2111111111111111111111111111111111',
    'BPFLoaderUpgradeab1e11111111111111111111111',
    // Serum/OpenBook
    'srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX',
    '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin',
    // Raydium programs
    'routeUGWgWzqBWFcrCfv8tritsqukccJPu3q5GPP3xS',
    '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
    '5quBtoiQqxF9Jv6KYKctB59NT3gtJD2Y65kdnB1Uev3h',
    '27haf8L6oxUeXrHrgEgsexjSY5hbVUWEmvv9Nyxg8vQv',
    'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK',
    // LaunchLab
    'LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj',
    // Quote mints
    SNIPER_PROGRAMS.USD1_MINT,
    SNIPER_PROGRAMS.WSOL_MINT,
    // BONK platform
    SNIPER_PROGRAMS.BONK_PLATFORM,
    // Jupiter
    'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
    'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB',
    // Flash loan programs
    'FLASHX8DrLbgeR8FcfNV1F5krxYcYMUdBkrP1EPBtxB9',
    'FL1Xhi3FakNPUgKwn2EPkf1Bqg3YPXAE8NwBCfkF6d7o',
    // Pump.fun
    '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
    // Memo
    'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',
    'Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo',
    // Native loader
    'NativeLoader1111111111111111111111111111111',
  ])
  
  // Check for SPECIFIC LaunchLab pool creation patterns
  // LaunchLab logs "Instruction: Initialize" or similar when creating a new pool
  const isInitializeInstruction = logs.some(log => {
    // Must be a LaunchLab program log with Initialize instruction
    return (
      log.includes('Program log: Instruction: Initialize') ||
      log.includes('Program log: initialize_v2') ||
      log.includes('Program log: InitializePool') ||
      log.includes('Program log: CreatePool') ||
      // LaunchLab specific pattern
      (log.includes('LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj') && 
       log.includes('Instruction: Initialize'))
    )
  })
  
  // Also check for successful pool creation completion
  const hasPoolCreationSuccess = logs.some(log => 
    log.includes('Program LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj success') ||
    log.includes('Program log: Pool initialized')
  )
  
  // Must have BOTH the initialize instruction AND successful completion
  // to avoid false positives from failed transactions or other operations
  if (isInitializeInstruction && hasPoolCreationSuccess) {
    isNewPool = true
  }
  
  // If not a new pool, return early - don't waste time parsing
  if (!isNewPool) {
    return { isNewPool, tokenMint, quoteMint, creator }
  }
  
  // Extract addresses from logs - look for specific patterns
  // Token mints are typically logged in specific formats
  const addressRegex = /[1-9A-HJ-NP-Za-km-z]{32,44}/g
  
  // Look for token mint in specific log patterns first
  for (const log of logs) {
    // Pattern: "mint: <address>" or "token_mint: <address>"
    const mintMatch = log.match(/(?:mint|token_mint|token|base_mint)[:\s]+([1-9A-HJ-NP-Za-km-z]{32,44})/i)
    if (mintMatch && !SYSTEM_ADDRESSES.has(mintMatch[1])) {
      tokenMint = mintMatch[1]
      break
    }
    
    // Pattern: "Program log: <address>" where address is the mint
    // LaunchLab often logs the mint address directly
    if (log.startsWith('Program log: ') && !log.includes('Instruction')) {
      const addresses = log.match(addressRegex) || []
      for (const addr of addresses) {
        if (!SYSTEM_ADDRESSES.has(addr) && addr.length >= 32 && addr.length <= 44) {
          // Validate it looks like a proper Solana address (not a truncated one)
          // Skip addresses that are obviously wrong (all 1s, all As, etc.)
          if (!/^[1A]{30,}/.test(addr) && !/^[1-9]{30,}/.test(addr)) {
            tokenMint = addr
            break
          }
        }
      }
      if (tokenMint) break
    }
  }
  
  // If still no token mint found, scan all logs but be more selective
  if (!tokenMint) {
    const allAddresses = fullLog.match(addressRegex) || []
    const uniqueAddresses = [...new Set(allAddresses)]
    
    for (const addr of uniqueAddresses) {
      // Skip system addresses
      if (SYSTEM_ADDRESSES.has(addr)) continue
      
      // Skip addresses that look like programs (end in specific patterns)
      if (addr.endsWith('11111111111111111111111')) continue
      if (addr.startsWith('111111111')) continue
      
      // Skip very short or malformed addresses
      if (addr.length < 32) continue
      
      // This is likely the token mint
      tokenMint = addr
      break
    }
  }
  
  // Validate token mint - must be a valid Solana address format
  if (tokenMint) {
    // Final validation - ensure it's not a system address that we missed
    if (SYSTEM_ADDRESSES.has(tokenMint) || 
        tokenMint.includes('1111111111') ||
        tokenMint.startsWith('ComputeBudget') ||
        tokenMint.startsWith('Token') ||
        tokenMint.startsWith('FLASH')) {
      tokenMint = null
      isNewPool = false // If we can't find a valid token mint, it's not a valid pool creation
    }
  }
  
  // Check for USD1 quote mint
  if (fullLog.includes(SNIPER_PROGRAMS.USD1_MINT)) {
    quoteMint = SNIPER_PROGRAMS.USD1_MINT
  }
  
  // Check for SOL quote mint  
  if (fullLog.includes(SNIPER_PROGRAMS.WSOL_MINT)) {
    quoteMint = SNIPER_PROGRAMS.WSOL_MINT
  }
  
  // Default to SOL if no quote mint found
  if (!quoteMint && isNewPool) {
    quoteMint = SNIPER_PROGRAMS.WSOL_MINT
  }
  
  // Try to extract creator from logs
  for (const log of logs) {
    const creatorMatch = log.match(/(?:creator|authority|payer|user)[:\s]+([1-9A-HJ-NP-Za-km-z]{32,44})/i)
    if (creatorMatch && !creator && !SYSTEM_ADDRESSES.has(creatorMatch[1])) {
      creator = creatorMatch[1]
    }
  }
  
  return { isNewPool, tokenMint, quoteMint, creator }
}

/**
 * Parse Pump.fun log to detect new token creation
 * Only returns true for actual token CREATION events, not trades/buys/sells
 */
export function parsePumpFunLog(logs: string[] | undefined | null): {
  isNewToken: boolean
  tokenMint: string | null
  creator: string | null
} {
  let isNewToken = false
  let tokenMint: string | null = null
  let creator: string | null = null
  
  // Handle undefined/null logs
  if (!logs || !Array.isArray(logs) || logs.length === 0) {
    return { isNewToken, tokenMint, creator }
  }
  
  const fullLog = logs.join('\n')
  
  // Known system/program addresses to EXCLUDE
  const SYSTEM_ADDRESSES = new Set([
    'ComputeBudget111111111111111111111111111111',
    '11111111111111111111111111111111',
    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    'TokenkegQfeZyiNwAJbNY5vgNBH4DQ3TonLk17nRba62L',
    'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
    'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
    'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
    SNIPER_PROGRAMS.PUMP_FUN,
    SNIPER_PROGRAMS.WSOL_MINT,
    'SysvarRent111111111111111111111111111111111',
    'SysvarC1ock11111111111111111111111111111111',
    'FLASHX8DrLbgeR8FcfNV1F5krxYcYMUdBkrP1EPBtxB9',
    'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',
    'Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo',
  ])
  
  // Check for SPECIFIC Pump.fun token creation patterns
  // Must have "create" instruction AND successful completion
  const hasCreateInstruction = logs.some(log => 
    log.includes('Program log: Instruction: Create') ||
    log.includes('Program log: create_token') ||
    log.includes('Program log: CreateToken')
  )
  
  const hasSuccess = logs.some(log => 
    log.includes(`Program ${SNIPER_PROGRAMS.PUMP_FUN} success`)
  )
  
  // Both conditions must be met
  if (hasCreateInstruction && hasSuccess) {
    isNewToken = true
  }
  
  // If not a new token, return early
  if (!isNewToken) {
    return { isNewToken, tokenMint, creator }
  }
  
  // Extract token mint from logs
  const addressRegex = /[1-9A-HJ-NP-Za-km-z]{32,44}/g
  
  // Look for mint in specific patterns first
  for (const log of logs) {
    const mintMatch = log.match(/(?:mint|token)[:\s]+([1-9A-HJ-NP-Za-km-z]{32,44})/i)
    if (mintMatch && !SYSTEM_ADDRESSES.has(mintMatch[1])) {
      tokenMint = mintMatch[1]
      break
    }
  }
  
  // If no specific mint found, scan all addresses
  if (!tokenMint) {
    const allAddresses = fullLog.match(addressRegex) || []
    const uniqueAddresses = [...new Set(allAddresses)]
    
    for (const addr of uniqueAddresses) {
      if (SYSTEM_ADDRESSES.has(addr)) continue
      if (addr.includes('1111111111')) continue
      if (addr.length < 32) continue
      if (addr.startsWith('ComputeBudget')) continue
      if (addr.startsWith('Token')) continue
      if (addr.startsWith('FLASH')) continue
      
      tokenMint = addr
      break
    }
  }
  
  // Validate token mint
  if (tokenMint && (SYSTEM_ADDRESSES.has(tokenMint) || tokenMint.includes('1111111111'))) {
    tokenMint = null
    isNewToken = false
  }
  
  // Extract creator
  for (const log of logs) {
    const creatorMatch = log.match(/(?:creator|user|payer)[:\s]+([1-9A-HJ-NP-Za-km-z]{32,44})/i)
    if (creatorMatch && !creator && !SYSTEM_ADDRESSES.has(creatorMatch[1])) {
      creator = creatorMatch[1]
    }
  }
  
  return { isNewToken, tokenMint, creator }
}
