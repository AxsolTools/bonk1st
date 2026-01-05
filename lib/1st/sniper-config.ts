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
 * Log patterns vary but typically include the mint address
 */
export function parselaunchLabLog(logs: string[]): { 
  isNewPool: boolean
  tokenMint: string | null
  quoteMint: string | null
  creator: string | null
} {
  let isNewPool = false
  let tokenMint: string | null = null
  let quoteMint: string | null = null
  let creator: string | null = null
  
  const fullLog = logs.join(' ')
  
  // Check for various initialize instruction patterns
  const initPatterns = [
    'Instruction: Initialize',
    'initialize_v2',
    'Program log: initialize',
    'InitializePool',
    'CreatePool',
    'Program log: Instruction: Create',
  ]
  
  for (const pattern of initPatterns) {
    if (fullLog.includes(pattern)) {
      isNewPool = true
      break
    }
  }
  
  // If no init pattern found, check if this is a LaunchLab program invocation with token creation
  if (!isNewPool) {
    // Check if LaunchLab program was invoked successfully
    const hasLaunchLabInvoke = fullLog.includes(SNIPER_PROGRAMS.RAYDIUM_LAUNCHLAB)
    const hasSuccess = fullLog.includes('Program log: Instruction:') || fullLog.includes('success')
    if (hasLaunchLabInvoke && hasSuccess) {
      isNewPool = true
    }
  }
  
  // Extract all potential Solana addresses (base58, 32-44 chars)
  const addressRegex = /[1-9A-HJ-NP-Za-km-z]{32,44}/g
  const allAddresses = fullLog.match(addressRegex) || []
  
  // Filter out known addresses to find the new token mint
  const knownAddresses = [
    SNIPER_PROGRAMS.RAYDIUM_LAUNCHLAB,
    SNIPER_PROGRAMS.USD1_MINT,
    SNIPER_PROGRAMS.WSOL_MINT,
    SNIPER_PROGRAMS.SPL_TOKEN,
    SNIPER_PROGRAMS.BONK_PLATFORM,
    'TokenkegQfeZyiNwAJbNY5vgNBH4DQ3TonLk17nRba62L', // Token Program
    '11111111111111111111111111111111', // System Program
    'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL', // Associated Token
  ]
  
  for (const addr of allAddresses) {
    if (!knownAddresses.includes(addr) && !tokenMint) {
      // This could be the new token mint
      tokenMint = addr
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
    const creatorMatch = log.match(/(?:creator|authority|owner|signer)[:\s]+([1-9A-HJ-NP-Za-km-z]{32,44})/i)
    if (creatorMatch && !creator) {
      creator = creatorMatch[1]
    }
  }
  
  return { isNewPool, tokenMint, quoteMint, creator }
}

/**
 * Parse Pump.fun log to detect new token creation
 */
export function parsePumpFunLog(logs: string[]): {
  isNewToken: boolean
  tokenMint: string | null
  creator: string | null
} {
  let isNewToken = false
  let tokenMint: string | null = null
  let creator: string | null = null
  
  const fullLog = logs.join(' ')
  
  // Check for Create instruction patterns
  const createPatterns = [
    'Instruction: Create',
    'Program log: create',
    'CreateToken',
    'Program log: Instruction: Create',
    'create_token',
  ]
  
  for (const pattern of createPatterns) {
    if (fullLog.toLowerCase().includes(pattern.toLowerCase())) {
      isNewToken = true
      break
    }
  }
  
  // If Pump.fun program invoked, likely a token operation
  if (!isNewToken && fullLog.includes(SNIPER_PROGRAMS.PUMP_FUN)) {
    // Check for successful execution
    if (fullLog.includes('Program log:') && !fullLog.includes('Error')) {
      isNewToken = true
    }
  }
  
  // Extract all potential addresses
  const addressRegex = /[1-9A-HJ-NP-Za-km-z]{32,44}/g
  const allAddresses = fullLog.match(addressRegex) || []
  
  const knownAddresses = [
    SNIPER_PROGRAMS.PUMP_FUN,
    SNIPER_PROGRAMS.WSOL_MINT,
    SNIPER_PROGRAMS.SPL_TOKEN,
    'TokenkegQfeZyiNwAJbNY5vgNBH4DQ3TonLk17nRba62L',
    '11111111111111111111111111111111',
    'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
  ]
  
  for (const addr of allAddresses) {
    if (!knownAddresses.includes(addr) && !tokenMint) {
      tokenMint = addr
    }
  }
  
  // Extract creator
  for (const log of logs) {
    const creatorMatch = log.match(/(?:creator|user|owner)[:\s]+([1-9A-HJ-NP-Za-km-z]{32,44})/i)
    if (creatorMatch && !creator) {
      creator = creatorMatch[1]
    }
  }
  
  return { isNewToken, tokenMint, creator }
}
