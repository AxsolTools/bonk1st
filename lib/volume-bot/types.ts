/**
 * Volume Bot Type Definitions
 * 
 * 📚 GLOSSARY:
 * - Volume Bot: Automated system that creates trading activity
 * - Buy Pressure: More buys than sells = upward price movement
 * - Emergency Stop: Safety feature that halts all trading immediately
 */

// ============================================================================
// STRATEGY TYPES
// ============================================================================

/**
 * Trading Strategies - Pick your poison! 🎯
 * 
 * DBPM (Dynamic Buy-Pressure Maintenance):
 *   - Default strategy for most degens
 *   - Focuses on maintaining buy pressure
 *   - Good for: Pumping your bags
 * 
 * PLD (Predictive Liquidity-Depth counter-buy):
 *   - Defensive strategy
 *   - Counters sells with strategic buys
 *   - Good for: Protecting against dumps
 * 
 * CMWA (Concurrent Multi-Wallet Arbitrage):
 *   - Galaxy brain mode
 *   - Uses multiple wallets for complex plays
 *   - Good for: When you know what you're doing
 */
export type VolumeBotStrategy = 'DBPM' | 'PLD' | 'CMWA';

/**
 * Session Status - Where's your bot at? 👀
 */
export type SessionStatus = 
  | 'pending'           // 😴 Waiting to start
  | 'running'           // 🚀 ACTIVE! Making trades
  | 'paused'            // ⏸️ Taking a breather
  | 'stopped'           // 🛑 You stopped it
  | 'completed'         // ✅ Hit target volume
  | 'emergency_stopped' // 🚨 Safety triggered - check what happened!
  | 'error';            // ❌ Something broke

/**
 * Transaction Status - Did the trade go through?
 */
export type TxStatus = 
  | 'pending'    // ⏳ Waiting
  | 'submitted'  // 📤 Sent to network
  | 'confirmed'  // ✅ Confirmed
  | 'finalized'  // 🔒 Finalized (can't be reversed)
  | 'failed'     // ❌ Failed
  | 'timeout';   // ⏰ Took too long

/**
 * Execution Method - How we're trading
 */
export type ExecutionMethod = 'jupiter' | 'pumpfun' | 'raydium' | 'jito_bundle';

/**
 * Wallet Rotation Mode - How wallets are selected
 * 
 * random: 🎲 Pick randomly (harder to track)
 * round-robin: 🔄 One after another
 * weighted: ⚖️ Based on assigned weights
 */
export type WalletRotationMode = 'random' | 'round-robin' | 'weighted';

/**
 * Priority Fee Mode - How much to tip validators
 * 
 * low: 🐢 Save SOL, might be slower
 * medium: 🚗 Balanced (recommended)
 * high: 🏎️ Fast execution
 * turbo: 🚀 MAXIMUM SPEED (expensive!)
 */
export type PriorityFeeMode = 'low' | 'medium' | 'high' | 'turbo';

/**
 * Wallet Role - What each wallet does
 * 
 * trader: 🔄 Both buys and sells
 * accumulator: 📈 Only buys (diamond hands)
 * seller: 📉 Only sells (paper hands)
 */
export type WalletRole = 'trader' | 'accumulator' | 'seller';

/**
 * Rule Type - What triggers the rule
 */
export type RuleType = 
  | 'price_trigger'    // 💰 Price hits a level
  | 'volume_trigger'   // 📊 Volume threshold
  | 'time_trigger'     // ⏰ At specific time
  | 'balance_trigger'  // 👛 Wallet balance change
  | 'custom';          // 🔧 Custom logic

// ============================================================================
// SETTINGS & CONFIGURATION
// ============================================================================

/**
 * Volume Bot Settings - Your main configuration
 * 
 * 💡 Pro Tips:
 * - Start with small target_volume_sol to test
 * - Keep emergency_stop_enabled = true ALWAYS
 * - Higher buy_pressure_percent = more bullish
 * - randomize_timing helps avoid detection
 */
export interface VolumeBotSettings {
  id: string;
  userId: string;
  tokenMint: string;
  
  // Strategy Selection
  strategy: VolumeBotStrategy;
  
  // Core Volume Settings
  targetVolumeSol: number;        // 💰 How much volume to generate
  minTxSol: number;               // 📉 Minimum per trade
  maxTxSol: number;               // 📈 Maximum per trade
  tradeIntervalMs: number;        // ⏱️ Time between trades
  buyPressurePercent: number;     // 📊 % of trades that are buys (0-100)
  
  // Wallet Configuration
  activeWalletCount: number;      // 👛 How many wallets to use
  walletRotationMode: WalletRotationMode;
  
  // Emergency Stop Settings (DON'T DISABLE THESE!)
  emergencyStopEnabled: boolean;
  minSolBalance: number;          // 🚨 Stop if wallet drops below this
  maxSessionLossSol: number;      // 🚨 Stop if session loses this much
  maxPriceDropPercent: number;    // 🚨 Stop if price drops this %
  
  // Smart Profit Settings
  smartProfitEnabled: boolean;
  takeProfitPercent: number | null;    // 💰 Take profit at this %
  trailingStopPercent: number | null;  // 📈 Trailing stop %
  
  // Anti-Detection Settings
  randomizeTiming: boolean;       // 🎲 Random delays
  randomizeAmounts: boolean;      // 🎲 Random amounts
  amountVariancePercent: number;  // 📊 Amount variation %
  useJitoBundles: boolean;        // ⚡ Use Jito for atomicity
  priorityFeeMode: PriorityFeeMode;
  
  // Session Control
  isActive: boolean;
  autoRestart: boolean;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  lastExecutedAt: Date | null;
}

/**
 * Default settings for new volume bots
 * Optimized for safety while still being effective
 */
export const DEFAULT_VOLUME_BOT_SETTINGS: Omit<VolumeBotSettings, 'id' | 'userId' | 'tokenMint' | 'createdAt' | 'updatedAt' | 'lastExecutedAt'> = {
  strategy: 'DBPM',
  targetVolumeSol: 1.0,
  minTxSol: 0.01,
  maxTxSol: 0.1,
  tradeIntervalMs: 5000,
  buyPressurePercent: 70,
  activeWalletCount: 3,
  walletRotationMode: 'random',
  emergencyStopEnabled: true,
  minSolBalance: 0.05,
  maxSessionLossSol: 0.5,
  maxPriceDropPercent: 20.0,
  smartProfitEnabled: false,
  takeProfitPercent: 10.0,
  trailingStopPercent: 5.0,
  randomizeTiming: true,
  randomizeAmounts: true,
  amountVariancePercent: 20,
  useJitoBundles: true,
  priorityFeeMode: 'medium',
  isActive: false,
  autoRestart: false,
};

// ============================================================================
// SESSION & EXECUTION
// ============================================================================

/**
 * Volume Bot Session - A single run of the bot
 * 
 * 📊 Track your pumps here. Every session has:
 * - How much volume you wanted vs. how much you got
 * - Trade counts and success rates
 * - PnL (are you making or losing money?)
 * - Price tracking (did it actually pump?)
 */
export interface VolumeBotSession {
  id: string;
  userId: string;
  settingsId: string;
  tokenMint: string;
  
  // Status
  status: SessionStatus;
  
  // Volume Metrics
  targetVolumeSol: number;
  executedVolumeSol: number;
  
  // Trade Counts
  totalTrades: number;
  successfulTrades: number;
  failedTrades: number;
  buyCount: number;
  sellCount: number;
  
  // Financial Metrics (in SOL)
  totalSolSpent: number;
  totalSolReceived: number;
  totalFeesPaid: number;
  netPnlSol: number;
  
  // Token Metrics
  tokensBought: number;
  tokensSold: number;
  averageBuyPrice: number | null;
  averageSellPrice: number | null;
  
  // Price Tracking
  startPrice: number | null;
  currentPrice: number | null;
  peakPrice: number | null;
  lowestPrice: number | null;
  
  // Stop Info
  stopReason: string | null;
  errorMessage: string | null;
  errorDetails: Record<string, unknown> | null;
  
  // Timestamps
  createdAt: Date;
  startedAt: Date | null;
  pausedAt: Date | null;
  stoppedAt: Date | null;
  updatedAt: Date;
}

/**
 * Individual trade execution
 */
export interface VolumeBotExecution {
  id: string;
  sessionId: string;
  userId: string;
  
  // Trade Details
  tradeType: 'buy' | 'sell';
  walletId: string;
  walletAddress: string;
  
  // Amounts
  solAmount: number;
  tokenAmount: number | null;
  pricePerToken: number | null;
  
  // Transaction Details
  txSignature: string | null;
  txStatus: TxStatus;
  executionMethod: ExecutionMethod;
  
  // Jito Bundle Info
  bundleId: string | null;
  bundleIndex: number | null;
  
  // Fees
  priorityFeeLamports: number | null;
  jitoTipLamports: number | null;
  
  // Timing
  plannedAt: Date;
  submittedAt: Date | null;
  confirmedAt: Date | null;
  
  // Error Info
  errorCode: string | null;
  errorMessage: string | null;
  retryCount: number;
  
  createdAt: Date;
}

/**
 * Wallet override configuration
 */
export interface VolumeBotWalletOverride {
  id: string;
  userId: string;
  settingsId: string;
  walletId: string;
  
  isEnabled: boolean;
  weight: number;
  maxSolPerTrade: number | null;
  maxSolTotal: number | null;
  role: WalletRole;
  
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Custom rule definition
 */
export interface VolumeBotRule {
  id: string;
  userId: string;
  settingsId: string;
  
  ruleName: string;
  ruleType: RuleType;
  condition: RuleCondition;
  action: RuleAction;
  
  isEnabled: boolean;
  lastTriggeredAt: Date | null;
  triggerCount: number;
  priority: number;
  
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Rule condition - What triggers the rule
 * 
 * Examples:
 * - Price >= 0.00001: { field: 'price', operator: '>=', value: 0.00001 }
 * - Volume > 100 SOL: { field: 'volume', operator: '>', value: 100 }
 */
export interface RuleCondition {
  field: 'price' | 'volume' | 'pnl' | 'balance' | 'trade_count';
  operator: '>' | '>=' | '<' | '<=' | '==' | '!=';
  value: number;
}

/**
 * Rule action - What to do when triggered
 * 
 * Examples:
 * - Pause: { action: 'pause' }
 * - Stop: { action: 'stop' }
 * - Change strategy: { action: 'change_strategy', params: { strategy: 'PLD' } }
 */
export interface RuleAction {
  action: 'pause' | 'stop' | 'resume' | 'change_strategy' | 'adjust_pressure' | 'notify';
  params?: Record<string, unknown>;
}

// ============================================================================
// EXECUTION PLAN
// ============================================================================

/**
 * Execution plan generated by the Wallet Allocation Engine (WAE)
 * This is what the bot actually executes
 */
export interface ExecutionPlan {
  sessionId: string;
  tokenMint: string;
  strategy: VolumeBotStrategy;
  
  // Allocations for each wallet
  allocations: WalletAllocation[];
  
  // Overall plan metrics
  totalBuySol: number;
  totalSellSol: number;
  estimatedVolume: number;
  
  // Timing
  plannedAt: Date;
  expiresAt: Date;
}

/**
 * Single wallet allocation in the plan
 */
export interface WalletAllocation {
  walletId: string;
  walletAddress: string;
  
  tradeType: 'buy' | 'sell';
  solAmount: number;
  
  // Timing
  executeAt: Date;
  
  // Options
  priorityFee: number;
  useJito: boolean;
}

// ============================================================================
// REAL-TIME UPDATES
// ============================================================================

/**
 * Real-time status update from the bot
 * Used for live dashboard updates
 */
export interface VolumeBotStatusUpdate {
  sessionId: string;
  status: SessionStatus;
  
  // Current metrics
  executedVolumeSol: number;
  progressPercent: number;
  
  // Trade info
  lastTradeType: 'buy' | 'sell' | null;
  lastTradeSol: number | null;
  lastTradeSignature: string | null;
  
  // Price info
  currentPrice: number | null;
  priceChangePercent: number | null;
  
  // Health
  isHealthy: boolean;
  warningMessage: string | null;
  
  timestamp: Date;
}

/**
 * Event types for real-time updates
 */
export type VolumeBotEvent = 
  | { type: 'status_update'; data: VolumeBotStatusUpdate }
  | { type: 'trade_executed'; data: VolumeBotExecution }
  | { type: 'session_started'; data: { sessionId: string } }
  | { type: 'session_stopped'; data: { sessionId: string; reason: string } }
  | { type: 'emergency_stop'; data: { sessionId: string; reason: string } }
  | { type: 'rule_triggered'; data: { ruleId: string; ruleName: string; action: RuleAction } }
  | { type: 'error'; data: { sessionId: string; error: string } };

// ============================================================================
// API TYPES
// ============================================================================

/**
 * Request to start a volume bot session
 */
export interface StartSessionRequest {
  tokenMint: string;
  targetVolumeSol?: number;
  overrideSettings?: Partial<VolumeBotSettings>;
}

/**
 * Response from starting a session
 */
export interface StartSessionResponse {
  success: boolean;
  sessionId?: string;
  message?: string;
  estimatedDuration?: number;
}

/**
 * Request to update session settings on the fly
 */
export interface UpdateSessionRequest {
  sessionId: string;
  updates: Partial<Pick<VolumeBotSettings, 
    | 'buyPressurePercent'
    | 'tradeIntervalMs'
    | 'minTxSol'
    | 'maxTxSol'
    | 'priorityFeeMode'
  >>;
}

