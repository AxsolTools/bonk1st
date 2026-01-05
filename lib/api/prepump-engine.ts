/**
 * ============================================================================
 * PRE-PUMP DETECTION ENGINE
 * ============================================================================
 * 
 * Detects tokens about to pump BEFORE the price moves.
 * Based on manual trading patterns:
 * 
 * 1. Fresh Wallet Influx Rate - New wallets entering a token
 * 2. Wallet Velocity Pattern - Same wallets cycling across tokens
 * 3. Transaction Clustering - Buys happening in rapid succession
 * 4. Bonding Curve Velocity - Rate of SOL entering bonding curve
 * 5. Sell Absence - No sells on active token = pressure building
 * 6. Buy Size Distribution - Average buy size increasing
 * 
 * This engine processes data from:
 * - Helius webhooks (real-time transactions)
 * - DexScreener (token data)
 * - Pump.fun API (bonding curve state)
 */

// ============================================================================
// TYPES
// ============================================================================

export interface PrePumpSignal {
  tokenAddress: string
  score: number // 0-100 composite score
  signals: {
    freshWalletInflux: number      // 0-100
    walletVelocity: number         // 0-100
    txClustering: number           // 0-100
    bondingVelocity: number        // 0-100 (pre-migration only)
    sellAbsence: number            // 0-100
    buySizeShift: number           // 0-100
  }
  metrics: {
    freshWalletsLast60s: number
    totalTxnsLast60s: number
    freshWalletRate: number        // % of txns from fresh wallets
    avgBuySizeLast5m: number
    avgBuySizeBaseline: number
    timeSinceLastSell: number      // seconds
    normalSellGap: number          // seconds
    bondingCurveSOL: number
    bondingCurveVelocity: number   // SOL/min entering curve
    coordinatedWallets: number     // wallets following same pattern
  }
  stage: 'bonding' | 'migrated'
  timestamp: number
  alerts: string[]
}

export interface WalletActivity {
  wallet: string
  firstSeen: number
  tokensTouched: Map<string, number[]> // token -> timestamps
  totalTxns: number
  isNew: boolean // Created in last 24h
}

export interface TokenTxHistory {
  tokenAddress: string
  transactions: TxRecord[]
  lastSellTime: number
  buyCount60s: number
  sellCount60s: number
  freshWalletBuys60s: number
  avgBuySize5m: number
  avgBuySize1h: number
  bondingCurveSOL: number
  lastBondingUpdate: number
}

export interface TxRecord {
  signature: string
  wallet: string
  type: 'buy' | 'sell'
  amountSOL: number
  timestamp: number
  isNewWallet: boolean
}

// ============================================================================
// IN-MEMORY STORES
// ============================================================================

// Wallet activity tracker - tracks wallets across ALL tokens
const WALLET_STORE = new Map<string, WalletActivity>()

// Token transaction history - rolling window per token
const TOKEN_TX_STORE = new Map<string, TokenTxHistory>()

// Pre-pump signals cache
const SIGNAL_CACHE = new Map<string, PrePumpSignal>()

// Configuration
const CONFIG = {
  // Time windows
  FRESH_WALLET_WINDOW_MS: 60 * 1000,      // 60 seconds for fresh wallet rate
  TX_CLUSTER_WINDOW_MS: 30 * 1000,         // 30 seconds for clustering
  BUY_SIZE_WINDOW_5M: 5 * 60 * 1000,       // 5 min for recent buy size
  BUY_SIZE_WINDOW_1H: 60 * 60 * 1000,      // 1 hour baseline
  SELL_GAP_BASELINE_WINDOW: 60 * 60 * 1000, // 1 hour for normal sell gap
  WALLET_NEW_THRESHOLD_MS: 24 * 60 * 60 * 1000, // 24h = "new" wallet
  
  // Thresholds
  FRESH_WALLET_RATE_HIGH: 0.15,   // 15%+ fresh wallets = signal
  COORDINATED_WALLET_MIN: 8,      // 8+ wallets same pattern = coordinated
  TX_CLUSTER_THRESHOLD: 10,       // 10+ txns in 30s = clustering
  SELL_ABSENCE_MULTIPLIER: 3,     // 3x normal sell gap = signal
  BUY_SIZE_SHIFT_MULTIPLIER: 2,   // 2x baseline = signal
  BONDING_VELOCITY_HIGH: 0.5,     // 0.5 SOL/min = high velocity
  
  // Cleanup
  MAX_TX_HISTORY: 500,            // Max transactions to keep per token
  CLEANUP_INTERVAL_MS: 60 * 1000, // Cleanup every minute
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Record a transaction from webhook
 * Call this from the Helius webhook handler
 */
export function recordTransaction(data: {
  tokenAddress: string
  wallet: string
  type: 'buy' | 'sell'
  amountSOL: number
  signature: string
  timestamp?: number
}): void {
  const now = data.timestamp || Date.now()
  
  // Update wallet activity
  let walletActivity = WALLET_STORE.get(data.wallet)
  if (!walletActivity) {
    walletActivity = {
      wallet: data.wallet,
      firstSeen: now,
      tokensTouched: new Map(),
      totalTxns: 0,
      isNew: true, // Assume new until we can verify
    }
    WALLET_STORE.set(data.wallet, walletActivity)
  }
  
  // Track which tokens this wallet has touched
  const tokenTimestamps = walletActivity.tokensTouched.get(data.tokenAddress) || []
  tokenTimestamps.push(now)
  walletActivity.tokensTouched.set(data.tokenAddress, tokenTimestamps)
  walletActivity.totalTxns++
  
  // Update token transaction history
  let tokenHistory = TOKEN_TX_STORE.get(data.tokenAddress)
  if (!tokenHistory) {
    tokenHistory = {
      tokenAddress: data.tokenAddress,
      transactions: [],
      lastSellTime: 0,
      buyCount60s: 0,
      sellCount60s: 0,
      freshWalletBuys60s: 0,
      avgBuySize5m: 0,
      avgBuySize1h: 0,
      bondingCurveSOL: 0,
      lastBondingUpdate: 0,
    }
    TOKEN_TX_STORE.set(data.tokenAddress, tokenHistory)
  }
  
  // Determine if wallet is "fresh" (new to this token or new overall)
  const isNewWallet = walletActivity.firstSeen > now - CONFIG.WALLET_NEW_THRESHOLD_MS
  const isFirstTimeOnToken = (walletActivity.tokensTouched.get(data.tokenAddress)?.length || 0) <= 1
  
  const txRecord: TxRecord = {
    signature: data.signature,
    wallet: data.wallet,
    type: data.type,
    amountSOL: data.amountSOL,
    timestamp: now,
    isNewWallet: isNewWallet || isFirstTimeOnToken,
  }
  
  tokenHistory.transactions.push(txRecord)
  
  // Update sell time
  if (data.type === 'sell') {
    tokenHistory.lastSellTime = now
  }
  
  // Trim history if too large
  if (tokenHistory.transactions.length > CONFIG.MAX_TX_HISTORY) {
    tokenHistory.transactions = tokenHistory.transactions.slice(-CONFIG.MAX_TX_HISTORY)
  }
  
  // Recalculate rolling metrics
  updateRollingMetrics(tokenHistory, now)
}

/**
 * Update bonding curve state
 * Call this when you get bonding curve data from Pump.fun
 */
export function updateBondingCurve(tokenAddress: string, solBalance: number): void {
  const tokenHistory = TOKEN_TX_STORE.get(tokenAddress)
  if (tokenHistory) {
    const now = Date.now()
    const timeDelta = now - tokenHistory.lastBondingUpdate
    
    if (tokenHistory.lastBondingUpdate > 0 && timeDelta > 0) {
      // Calculate velocity (SOL per minute)
      const solDelta = solBalance - tokenHistory.bondingCurveSOL
      const velocity = (solDelta / timeDelta) * 60000 // Convert to per minute
      
      // Store in a way we can access
      // We'll use avgBuySize1h temporarily to store velocity (hacky but avoids adding fields)
      // Actually let's be clean and add a proper field
    }
    
    tokenHistory.bondingCurveSOL = solBalance
    tokenHistory.lastBondingUpdate = now
  }
}

/**
 * Calculate pre-pump signal for a token
 */
export function calculatePrePumpSignal(tokenAddress: string, stage: 'bonding' | 'migrated' = 'migrated'): PrePumpSignal | null {
  const tokenHistory = TOKEN_TX_STORE.get(tokenAddress)
  if (!tokenHistory || tokenHistory.transactions.length < 5) {
    return null
  }
  
  const now = Date.now()
  const alerts: string[] = []
  
  // Get recent transactions
  const txns60s = tokenHistory.transactions.filter(t => t.timestamp > now - CONFIG.FRESH_WALLET_WINDOW_MS)
  const txns30s = tokenHistory.transactions.filter(t => t.timestamp > now - CONFIG.TX_CLUSTER_WINDOW_MS)
  const txns5m = tokenHistory.transactions.filter(t => t.timestamp > now - CONFIG.BUY_SIZE_WINDOW_5M)
  const txns1h = tokenHistory.transactions.filter(t => t.timestamp > now - CONFIG.BUY_SIZE_WINDOW_1H)
  
  // ============ Signal 1: Fresh Wallet Influx ============
  const freshWalletBuys = txns60s.filter(t => t.type === 'buy' && t.isNewWallet).length
  const totalBuys60s = txns60s.filter(t => t.type === 'buy').length
  const freshWalletRate = totalBuys60s > 0 ? freshWalletBuys / totalBuys60s : 0
  
  let freshWalletScore = 0
  if (freshWalletRate > 0.3) {
    freshWalletScore = 100
    alerts.push(`🆕 ${(freshWalletRate * 100).toFixed(0)}% fresh wallets entering`)
  } else if (freshWalletRate > 0.2) {
    freshWalletScore = 80
  } else if (freshWalletRate > CONFIG.FRESH_WALLET_RATE_HIGH) {
    freshWalletScore = 60
  } else if (freshWalletRate > 0.1) {
    freshWalletScore = 40
  } else if (freshWalletRate > 0.05) {
    freshWalletScore = 20
  }
  
  // ============ Signal 2: Wallet Velocity Pattern ============
  // Find wallets that have touched multiple tokens recently
  const coordinatedWallets = findCoordinatedWallets(tokenAddress, now)
  
  let walletVelocityScore = 0
  if (coordinatedWallets >= 20) {
    walletVelocityScore = 100
    alerts.push(`🔄 ${coordinatedWallets} coordinated wallets detected`)
  } else if (coordinatedWallets >= 15) {
    walletVelocityScore = 80
  } else if (coordinatedWallets >= CONFIG.COORDINATED_WALLET_MIN) {
    walletVelocityScore = 60
  } else if (coordinatedWallets >= 5) {
    walletVelocityScore = 30
  }
  
  // ============ Signal 3: Transaction Clustering ============
  const txCount30s = txns30s.length
  
  let txClusteringScore = 0
  if (txCount30s >= 30) {
    txClusteringScore = 100
    alerts.push(`⚡ ${txCount30s} txns in 30s - heavy activity`)
  } else if (txCount30s >= 20) {
    txClusteringScore = 80
  } else if (txCount30s >= CONFIG.TX_CLUSTER_THRESHOLD) {
    txClusteringScore = 60
  } else if (txCount30s >= 5) {
    txClusteringScore = 30
  }
  
  // ============ Signal 4: Bonding Curve Velocity ============
  let bondingVelocityScore = 0
  let bondingVelocity = 0
  
  if (stage === 'bonding' && tokenHistory.bondingCurveSOL > 0) {
    // Calculate velocity from recent buys
    const recentBuyVolume = txns60s
      .filter(t => t.type === 'buy')
      .reduce((sum, t) => sum + t.amountSOL, 0)
    bondingVelocity = recentBuyVolume // SOL per minute (since window is 60s)
    
    if (bondingVelocity > 2) {
      bondingVelocityScore = 100
      alerts.push(`🚀 ${bondingVelocity.toFixed(2)} SOL/min entering curve`)
    } else if (bondingVelocity > 1) {
      bondingVelocityScore = 80
    } else if (bondingVelocity > CONFIG.BONDING_VELOCITY_HIGH) {
      bondingVelocityScore = 60
    } else if (bondingVelocity > 0.2) {
      bondingVelocityScore = 30
    }
  }
  
  // ============ Signal 5: Sell Absence ============
  const timeSinceLastSell = tokenHistory.lastSellTime > 0 
    ? (now - tokenHistory.lastSellTime) / 1000 
    : 999999
  
  // Calculate normal sell gap from history
  const sells1h = txns1h.filter(t => t.type === 'sell')
  let normalSellGap = 60 // Default 60 seconds
  if (sells1h.length >= 2) {
    const sellGaps: number[] = []
    for (let i = 1; i < sells1h.length; i++) {
      sellGaps.push((sells1h[i].timestamp - sells1h[i-1].timestamp) / 1000)
    }
    normalSellGap = sellGaps.reduce((a, b) => a + b, 0) / sellGaps.length
  }
  
  let sellAbsenceScore = 0
  const sellAbsenceRatio = timeSinceLastSell / normalSellGap
  
  if (sellAbsenceRatio > 5 && txCount30s > 5) {
    sellAbsenceScore = 100
    alerts.push(`🔒 No sells for ${Math.floor(timeSinceLastSell)}s - holders locked`)
  } else if (sellAbsenceRatio > CONFIG.SELL_ABSENCE_MULTIPLIER && txCount30s > 3) {
    sellAbsenceScore = 70
  } else if (sellAbsenceRatio > 2) {
    sellAbsenceScore = 40
  }
  
  // ============ Signal 6: Buy Size Distribution Shift ============
  const buys5m = txns5m.filter(t => t.type === 'buy')
  const buys1h = txns1h.filter(t => t.type === 'buy')
  
  const avgBuySize5m = buys5m.length > 0 
    ? buys5m.reduce((sum, t) => sum + t.amountSOL, 0) / buys5m.length 
    : 0
  const avgBuySize1h = buys1h.length > 0 
    ? buys1h.reduce((sum, t) => sum + t.amountSOL, 0) / buys1h.length 
    : avgBuySize5m
  
  let buySizeShiftScore = 0
  const buySizeRatio = avgBuySize1h > 0 ? avgBuySize5m / avgBuySize1h : 1
  
  if (buySizeRatio > 4) {
    buySizeShiftScore = 100
    alerts.push(`💰 Avg buy size ${buySizeRatio.toFixed(1)}x baseline - bigger players`)
  } else if (buySizeRatio > 3) {
    buySizeShiftScore = 80
  } else if (buySizeRatio > CONFIG.BUY_SIZE_SHIFT_MULTIPLIER) {
    buySizeShiftScore = 60
  } else if (buySizeRatio > 1.5) {
    buySizeShiftScore = 30
  }
  
  // ============ Composite Score ============
  // Weight the signals based on importance
  const weights = {
    freshWalletInflux: 0.25,
    walletVelocity: 0.20,
    txClustering: 0.20,
    bondingVelocity: stage === 'bonding' ? 0.15 : 0,
    sellAbsence: 0.10,
    buySizeShift: stage === 'bonding' ? 0.10 : 0.25,
  }
  
  const compositeScore = Math.round(
    freshWalletScore * weights.freshWalletInflux +
    walletVelocityScore * weights.walletVelocity +
    txClusteringScore * weights.txClustering +
    bondingVelocityScore * weights.bondingVelocity +
    sellAbsenceScore * weights.sellAbsence +
    buySizeShiftScore * weights.buySizeShift
  )
  
  const signal: PrePumpSignal = {
    tokenAddress,
    score: compositeScore,
    signals: {
      freshWalletInflux: freshWalletScore,
      walletVelocity: walletVelocityScore,
      txClustering: txClusteringScore,
      bondingVelocity: bondingVelocityScore,
      sellAbsence: sellAbsenceScore,
      buySizeShift: buySizeShiftScore,
    },
    metrics: {
      freshWalletsLast60s: freshWalletBuys,
      totalTxnsLast60s: txns60s.length,
      freshWalletRate,
      avgBuySizeLast5m: avgBuySize5m,
      avgBuySizeBaseline: avgBuySize1h,
      timeSinceLastSell,
      normalSellGap,
      bondingCurveSOL: tokenHistory.bondingCurveSOL,
      bondingCurveVelocity: bondingVelocity,
      coordinatedWallets,
    },
    stage,
    timestamp: now,
    alerts,
  }
  
  // Cache the signal
  SIGNAL_CACHE.set(tokenAddress, signal)
  
  return signal
}

/**
 * Get all tokens with high pre-pump signals
 */
export function getHighSignalTokens(minScore: number = 50): PrePumpSignal[] {
  const signals: PrePumpSignal[] = []
  const now = Date.now()
  
  for (const [tokenAddress] of TOKEN_TX_STORE) {
    // Recalculate signal
    const signal = calculatePrePumpSignal(tokenAddress)
    if (signal && signal.score >= minScore) {
      signals.push(signal)
    }
  }
  
  // Sort by score descending
  signals.sort((a, b) => b.score - a.score)
  
  return signals
}

/**
 * Get cached signal for a token (fast, no recalculation)
 */
export function getCachedSignal(tokenAddress: string): PrePumpSignal | null {
  return SIGNAL_CACHE.get(tokenAddress) || null
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function updateRollingMetrics(history: TokenTxHistory, now: number): void {
  const txns60s = history.transactions.filter(t => t.timestamp > now - CONFIG.FRESH_WALLET_WINDOW_MS)
  
  history.buyCount60s = txns60s.filter(t => t.type === 'buy').length
  history.sellCount60s = txns60s.filter(t => t.type === 'sell').length
  history.freshWalletBuys60s = txns60s.filter(t => t.type === 'buy' && t.isNewWallet).length
  
  // Calculate average buy sizes
  const buys5m = history.transactions
    .filter(t => t.type === 'buy' && t.timestamp > now - CONFIG.BUY_SIZE_WINDOW_5M)
  const buys1h = history.transactions
    .filter(t => t.type === 'buy' && t.timestamp > now - CONFIG.BUY_SIZE_WINDOW_1H)
  
  history.avgBuySize5m = buys5m.length > 0 
    ? buys5m.reduce((sum, t) => sum + t.amountSOL, 0) / buys5m.length 
    : 0
  history.avgBuySize1h = buys1h.length > 0 
    ? buys1h.reduce((sum, t) => sum + t.amountSOL, 0) / buys1h.length 
    : history.avgBuySize5m
}

function findCoordinatedWallets(tokenAddress: string, now: number): number {
  const recentWindow = 5 * 60 * 1000 // 5 minutes
  let coordinatedCount = 0
  
  // Get wallets that recently touched this token
  const tokenHistory = TOKEN_TX_STORE.get(tokenAddress)
  if (!tokenHistory) return 0
  
  const recentWallets = new Set(
    tokenHistory.transactions
      .filter(t => t.timestamp > now - recentWindow)
      .map(t => t.wallet)
  )
  
  // Check how many of these wallets have touched 3+ tokens recently
  for (const wallet of recentWallets) {
    const activity = WALLET_STORE.get(wallet)
    if (!activity) continue
    
    let tokensInWindow = 0
    for (const [, timestamps] of activity.tokensTouched) {
      if (timestamps.some(t => t > now - recentWindow)) {
        tokensInWindow++
      }
    }
    
    // Wallet touched 3+ tokens in last 5 min = potentially coordinated
    if (tokensInWindow >= 3) {
      coordinatedCount++
    }
  }
  
  return coordinatedCount
}

// ============================================================================
// CLEANUP
// ============================================================================

let cleanupInterval: ReturnType<typeof setInterval> | null = null

export function startCleanup(): void {
  if (cleanupInterval) return
  
  cleanupInterval = setInterval(() => {
    const now = Date.now()
    const cutoff = now - 2 * 60 * 60 * 1000 // 2 hours
    
    // Clean old wallet data
    for (const [wallet, activity] of WALLET_STORE) {
      // Remove old token timestamps
      for (const [token, timestamps] of activity.tokensTouched) {
        const filtered = timestamps.filter(t => t > cutoff)
        if (filtered.length === 0) {
          activity.tokensTouched.delete(token)
        } else {
          activity.tokensTouched.set(token, filtered)
        }
      }
      
      // Remove wallet if no recent activity
      if (activity.tokensTouched.size === 0) {
        WALLET_STORE.delete(wallet)
      }
    }
    
    // Clean old token transaction history
    for (const [token, history] of TOKEN_TX_STORE) {
      history.transactions = history.transactions.filter(t => t.timestamp > cutoff)
      
      if (history.transactions.length === 0) {
        TOKEN_TX_STORE.delete(token)
        SIGNAL_CACHE.delete(token)
      }
    }
    
    console.log(`[PREPUMP] Cleanup: ${WALLET_STORE.size} wallets, ${TOKEN_TX_STORE.size} tokens tracked`)
  }, CONFIG.CLEANUP_INTERVAL_MS)
}

export function stopCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval)
    cleanupInterval = null
  }
}

// ============================================================================
// STATS
// ============================================================================

export function getEngineStats(): {
  walletsTracked: number
  tokensTracked: number
  signalsCached: number
} {
  return {
    walletsTracked: WALLET_STORE.size,
    tokensTracked: TOKEN_TX_STORE.size,
    signalsCached: SIGNAL_CACHE.size,
  }
}

