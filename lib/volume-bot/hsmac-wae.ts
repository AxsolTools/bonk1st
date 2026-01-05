/**
 * Wallet Allocation Engine (WAE)
 * 
 * 🎯 THE ALLOCATOR - Decides which wallets do what
 * 
 * This module is responsible for:
 *  - Loading user wallets from database
 *  - Allocating volume across wallets based on strategy
 *  - Building transaction execution plans
 *  - Enforcing user rules and safety limits
 * 
 * 💡 HOW IT WORKS:
 *  - "Allocation" = How much each wallet buys/sells
 *  - "Plan" = The list of trades to execute
 *  - "Rules" = Your safety limits (important for protection!)
 */

import { STRATEGIES } from './hsmac-acl';
import type { VolumeBotStrategy, ExecutionPlan, WalletAllocation } from './types';

// ============================================================================
// TYPES
// ============================================================================

export interface WalletRecord {
  wallet_id: string;
  user_id: string;
  wallet_address: string;
  name?: string;
  keypair?: unknown; // The decrypted keypair for signing
  publicKey?: string;
}

export interface AllocationEntry {
  walletId: string;
  publicKey: string;
  role: 'entry' | 'exit' | 'liquidity' | 'arbitrage_buy' | 'arbitrage_sell';
  amount: number;
  concurrency: boolean;
}

export interface TransactionEntry extends AllocationEntry {
  intent: 'buy' | 'sell';
  volume: number;
}

export interface Rules {
  initialWalletCount: number;
  buyPressureVolume: number;
  stabilizationThreshold: number;
  arbitrageProfitFloor: number;
  globalStopLoss: number;
  autoExecute: boolean;
}

export interface ExecutionPlanResult {
  summary: {
    userId: string;
    tokenMint: string | null;
    strategy: VolumeBotStrategy;
    totalVolume: number;
    walletCount: number;
    roles: Record<string, number>;
    rules: Rules;
  };
  allocation: AllocationEntry[];
  transactions: TransactionEntry[];
  error?: string;
  message?: string;
  violations?: Array<{ rule: string; message: string }>;
}

export interface PlanOptions {
  userId: string;
  tokenMint?: string | null;
  strategy: VolumeBotStrategy;
  totalVolume?: number | null;
  walletGroupId?: string | null;
  walletIds?: string[] | null;
  expectedProfitPercent?: number | null;
  currentLossPercent?: number | null;
  rulesOverride?: Partial<Rules> | null;
  wallets?: WalletRecord[]; // Pre-loaded wallets (for web app integration)
}

// ============================================================================
// DEFAULT RULES
// ============================================================================

/**
 * Default rules for HSMAC operations
 * 
 * 💡 These are your safety limits:
 * - initialWalletCount: Max wallets per operation
 * - buyPressureVolume: Max SOL to spend in one go
 * - globalStopLoss: Stop if losses exceed this %
 */
export const DEFAULT_RULES: Rules = Object.freeze({
  initialWalletCount: 5,          // 👛 Max 5 wallets per operation
  buyPressureVolume: 0.5,         // 💰 Max 0.5 SOL per cycle
  stabilizationThreshold: 5,      // 📉 Trigger defense at 5% drop
  arbitrageProfitFloor: 0.2,      // 💎 Min 0.2% profit for arb
  globalStopLoss: 15,             // 🚨 Stop at 15% total loss
  autoExecute: true               // ⚡ Auto-execute plans
});

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Fisher-Yates shuffle
 * 
 * 🎲 Randomizes wallet order to avoid detection patterns
 */
function shuffle<T>(array: T[]): T[] {
  const copy = array.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Split volume randomly across slices
 * 
 * 🎲 Makes each wallet trade different amounts
 * Harder to detect as a coordinated operation
 */
function splitVolumeRandom(totalVolume: number, slices: number): number[] {
  if (!Number.isFinite(totalVolume) || totalVolume <= 0 || slices <= 0) {
    return [];
  }

  if (slices === 1) {
    return [totalVolume];
  }

  const randomPoints = Array.from({ length: slices - 1 }, () => Math.random()).sort((a, b) => a - b);
  const allocations: number[] = [];
  let prev = 0;
  
  randomPoints.forEach((point) => {
    const sliceVolume = totalVolume * (point - prev);
    allocations.push(sliceVolume);
    prev = point;
  });
  allocations.push(totalVolume * (1 - prev));

  return allocations;
}

/**
 * Split volume evenly across slices
 * 
 * ➗ Equal amounts per wallet
 */
function splitVolumeEven(totalVolume: number, slices: number): number[] {
  if (!Number.isFinite(totalVolume) || totalVolume <= 0 || slices <= 0) {
    return [];
  }
  const base = totalVolume / slices;
  return Array.from({ length: slices }, () => base);
}

// ============================================================================
// PLAN BUILDERS
// ============================================================================

/**
 * Build DBPM (Dynamic Buy-Pressure Maintenance) plan
 * 
 * 🐂 BULLISH MODE:
 * - Randomizes wallet order
 * - Alternates entry/exit roles
 * - Random volume distribution (harder to detect)
 */
function buildDbpmPlan(wallets: WalletRecord[], totalVolume: number): AllocationEntry[] {
  const randomized = shuffle(wallets);
  const slices = splitVolumeRandom(totalVolume, randomized.length || 1);
  
  return randomized.map((wallet, idx) => ({
    walletId: wallet.wallet_id,
    publicKey: wallet.wallet_address,
    role: (idx % 2 === 0 ? 'entry' : 'exit') as 'entry' | 'exit',
    amount: slices[idx] || 0,
    concurrency: false
  }));
}

/**
 * Build PLD (Predictive Liquidity-Depth) plan
 * 
 * 🛡️ DEFENSIVE MODE:
 * - Even volume distribution
 * - All wallets in "liquidity" role
 * - Concurrent execution for faster response
 */
function buildPldPlan(wallets: WalletRecord[], totalVolume: number): AllocationEntry[] {
  const slices = splitVolumeEven(totalVolume, wallets.length || 1);
  
  return wallets.map((wallet, idx) => ({
    walletId: wallet.wallet_id,
    publicKey: wallet.wallet_address,
    role: 'liquidity' as const,
    amount: slices[idx] || 0,
    concurrency: true
  }));
}

/**
 * Build CMWA (Concurrent Multi-Wallet Arbitrage) plan
 * 
 * 🧠 GALAXY BRAIN MODE:
 * - Even volume distribution
 * - Alternates buy/sell for arbitrage
 * - Concurrent execution for speed
 */
function buildCmwaPlan(wallets: WalletRecord[], totalVolume: number): AllocationEntry[] {
  const slices = splitVolumeEven(totalVolume, wallets.length || 1);
  
  return wallets.map((wallet, idx) => ({
    walletId: wallet.wallet_id,
    publicKey: wallet.wallet_address,
    role: (idx % 2 === 0 ? 'arbitrage_buy' : 'arbitrage_sell') as 'arbitrage_buy' | 'arbitrage_sell',
    amount: slices[idx] || 0,
    concurrency: true
  }));
}

/**
 * Build allocation based on strategy
 */
function buildAllocation(
  strategy: VolumeBotStrategy, 
  wallets: WalletRecord[], 
  totalVolume: number
): AllocationEntry[] {
  switch (strategy) {
    case STRATEGIES.PLD:
      return buildPldPlan(wallets, totalVolume);
    case STRATEGIES.CMWA:
      return buildCmwaPlan(wallets, totalVolume);
    case STRATEGIES.DBPM:
    default:
      return buildDbpmPlan(wallets, totalVolume);
  }
}

/**
 * Normalize volume based on strategy and rules
 */
function normalizeVolume(
  strategy: VolumeBotStrategy, 
  totalVolume: number | null | undefined, 
  rules: Rules
): number {
  if (Number.isFinite(totalVolume) && totalVolume! > 0) {
    return totalVolume!;
  }

  if (strategy === STRATEGIES.DBPM) {
    return rules.buyPressureVolume;
  }

  if (strategy === STRATEGIES.PLD) {
    return rules.buyPressureVolume * 1.5;
  }

  if (strategy === STRATEGIES.CMWA) {
    return rules.buyPressureVolume * 2;
  }

  return rules.buyPressureVolume;
}

/**
 * Merge rules with defaults
 */
function mergeRules(base: Rules, override: Partial<Rules> | null): Rules {
  if (!override) return base;
  
  return {
    initialWalletCount: override.initialWalletCount ?? base.initialWalletCount,
    buyPressureVolume: override.buyPressureVolume ?? base.buyPressureVolume,
    stabilizationThreshold: override.stabilizationThreshold ?? base.stabilizationThreshold,
    arbitrageProfitFloor: override.arbitrageProfitFloor ?? base.arbitrageProfitFloor,
    globalStopLoss: override.globalStopLoss ?? base.globalStopLoss,
    autoExecute: override.autoExecute ?? base.autoExecute
  };
}

// ============================================================================
// RULE CHECKING
// ============================================================================

export class RuleCheckError extends Error {
  violations: Array<{ rule: string; message: string }>;
  
  constructor(message: string, violations: Array<{ rule: string; message: string }> = []) {
    super(message);
    this.name = 'RuleCheckError';
    this.violations = violations;
  }
}

/**
 * Check if operation violates any rules
 * 
 * 🚨 SAFETY CHECK - Don't skip this!
 */
function checkRules(
  wallets: WalletRecord[],
  totalVolume: number,
  rules: Rules,
  expectedProfitPercent: number | null,
  currentLossPercent: number | null
): void {
  const violations: Array<{ rule: string; message: string }> = [];

  // Check wallet count
  if (wallets.length > rules.initialWalletCount) {
    violations.push({
      rule: 'initialWalletCount',
      message: `Wallet count ${wallets.length} exceeds limit ${rules.initialWalletCount}`
    });
  }

  // Check volume
  if (totalVolume > rules.buyPressureVolume) {
    violations.push({
      rule: 'buyPressureVolume',
      message: `Volume ${totalVolume} SOL exceeds cap ${rules.buyPressureVolume} SOL`
    });
  }

  // Check profit floor
  if (expectedProfitPercent !== null && expectedProfitPercent < rules.arbitrageProfitFloor) {
    violations.push({
      rule: 'arbitrageProfitFloor',
      message: `Expected profit ${expectedProfitPercent}% below floor ${rules.arbitrageProfitFloor}%`
    });
  }

  // Check stop loss
  if (currentLossPercent !== null && currentLossPercent > rules.globalStopLoss) {
    violations.push({
      rule: 'globalStopLoss',
      message: `Loss ${currentLossPercent}% exceeds stop-loss ${rules.globalStopLoss}%`
    });
  }

  if (violations.length > 0) {
    throw new RuleCheckError('🚨 HSMAC rules violated - check your settings!', violations);
  }
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Prepare execution plan
 * 
 * 📝 This creates the "plan" - a list of what each wallet should do
 */
function preparePlan(options: PlanOptions): {
  summary: ExecutionPlanResult['summary'];
  allocation: AllocationEntry[];
} {
  const {
    userId,
    tokenMint = null,
    strategy,
    totalVolume = null,
    expectedProfitPercent = null,
    currentLossPercent = null,
    rulesOverride = null,
    wallets = []
  } = options;

  if (!userId) {
    throw new Error('userId is required to prepare allocation plan');
  }

  if (!strategy) {
    throw new Error('strategy is required to prepare allocation plan');
  }

  if (!wallets || wallets.length === 0) {
    throw new Error('No wallets available for allocation - add some wallets first! 👛');
  }

  const rules = mergeRules(DEFAULT_RULES, rulesOverride);
  const resolvedVolume = normalizeVolume(strategy, totalVolume, rules);

  // Check rules
  checkRules(
    wallets,
    resolvedVolume,
    rules,
    expectedProfitPercent,
    currentLossPercent
  );

  const allocation = buildAllocation(strategy, wallets, resolvedVolume);

  const summary = {
    userId,
    tokenMint,
    strategy,
    totalVolume: resolvedVolume,
    walletCount: allocation.length,
    roles: allocation.reduce((acc, entry) => {
      acc[entry.role] = (acc[entry.role] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    rules
  };

  return {
    summary,
    allocation
  };
}

/**
 * Build transaction plans from allocation
 * 
 * 🔄 Converts allocation entries into buy/sell intents
 */
function buildTransactionPlans(allocation: AllocationEntry[]): TransactionEntry[] {
  return allocation.map((entry, idx) => {
    let intent: 'buy' | 'sell';

    // Determine intent based on role
    if (entry.role === 'exit' || entry.role.includes('sell')) {
      intent = 'sell';
    } else if (entry.role === 'liquidity') {
      // PLD: Alternate buy/sell to maintain volume balance
      intent = idx % 2 === 0 ? 'buy' : 'sell';
    } else {
      intent = 'buy';
    }

    return {
      ...entry,
      volume: entry.amount,
      intent
    };
  });
}

/**
 * Generate complete execution plan
 * 
 * 🚀 THE MAIN FUNCTION - Call this to get your trading plan
 * 
 * @param options - Plan configuration
 * @returns Execution plan with allocations and transactions
 */
export function generateExecutionPlan(options: PlanOptions): ExecutionPlanResult {
  try {
    const plan = preparePlan(options);
    return {
      ...plan,
      transactions: buildTransactionPlans(plan.allocation)
    };
  } catch (error) {
    if (error instanceof RuleCheckError) {
      return {
        error: 'rule_violation',
        message: error.message,
        violations: error.violations,
        summary: {
          userId: options.userId,
          tokenMint: options.tokenMint || null,
          strategy: options.strategy,
          totalVolume: 0,
          walletCount: 0,
          roles: {},
          rules: DEFAULT_RULES
        },
        allocation: [],
        transactions: []
      };
    }

    return {
      error: 'allocation_failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      summary: {
        userId: options.userId,
        tokenMint: options.tokenMint || null,
        strategy: options.strategy,
        totalVolume: 0,
        walletCount: 0,
        roles: {},
        rules: DEFAULT_RULES
      },
      allocation: [],
      transactions: []
    };
  }
}

/**
 * Convert execution plan to the format expected by the UI
 */
export function planToExecutionPlan(
  planResult: ExecutionPlanResult,
  sessionId: string
): ExecutionPlan | null {
  if (planResult.error) {
    return null;
  }

  const allocations: WalletAllocation[] = planResult.transactions.map((tx) => ({
    walletId: tx.walletId,
    walletAddress: tx.publicKey,
    tradeType: tx.intent,
    solAmount: tx.volume,
    executeAt: new Date(),
    priorityFee: 100000, // Default 0.0001 SOL
    useJito: true
  }));

  const totalBuySol = allocations
    .filter(a => a.tradeType === 'buy')
    .reduce((sum, a) => sum + a.solAmount, 0);
    
  const totalSellSol = allocations
    .filter(a => a.tradeType === 'sell')
    .reduce((sum, a) => sum + a.solAmount, 0);

  return {
    sessionId,
    tokenMint: planResult.summary.tokenMint || '',
    strategy: planResult.summary.strategy,
    allocations,
    totalBuySol,
    totalSellSol,
    estimatedVolume: planResult.summary.totalVolume,
    plannedAt: new Date(),
    expiresAt: new Date(Date.now() + 60000) // 1 minute expiry
  };
}

