/**
 * Volume Bot Smart Profit Mechanism
 * 
 * 💰 PRODUCTION-READY Automated Profit Taking & Loss Prevention
 * 
 * This module handles:
 * - Take profit targets (auto-sell when profit target hit)
 * - Stop loss protection (auto-sell when loss threshold exceeded)
 * - Trailing stop loss (dynamic stop that follows price up)
 * - Emergency stop (instant sell all positions)
 * - Price monitoring using Helius WebSocket
 * 
 * RELIES ON:
 * - Helius Enhanced WebSockets for real-time price monitoring
 * - User-defined thresholds stored in Supabase
 * - Platform fee collection (2%) on all executions
 * 
 * ⚠️ CRITICAL: This handles user funds - all logic must be bulletproof
 */

import { EventEmitter } from 'events';
import { getAdminClient } from '@/lib/supabase/admin';
import { 
  VolumeBotStreamManager, 
  createVolumeBotStream,
  TransactionEvent,
  PriceChangeEvent 
} from './volume-bot-stream';
import { executeTransactions, ExecutionOptions } from './hsmac-executor';
import { generateExecutionPlan } from './hsmac-wae';
import type { VolumeBotStrategy } from './types';

// ============================================================================
// TYPES
// ============================================================================

export interface SmartProfitSettings {
  // Core settings
  enabled: boolean;
  tokenMint: string;
  userId: string;
  sessionId: string;
  
  // Wallet configuration
  walletIds: string[];
  walletAddresses: string[];
  
  // Entry price tracking
  averageEntryPrice: number; // SOL per token
  totalTokensHeld: number;
  totalSolInvested: number;
  
  // Take profit settings
  takeProfitEnabled: boolean;
  takeProfitPercent: number; // e.g., 50 = sell at 50% profit
  takeProfitSellPercent: number; // How much to sell (e.g., 50 = sell 50% of position)
  
  // Stop loss settings
  stopLossEnabled: boolean;
  stopLossPercent: number; // e.g., 20 = sell if down 20%
  
  // Trailing stop loss
  trailingStopEnabled: boolean;
  trailingStopPercent: number; // e.g., 10 = stop follows 10% below highest price
  trailingStopActivationPercent: number; // Only activate after X% profit
  
  // Emergency settings
  emergencyStopEnabled: boolean;
  emergencyStopLossPercent: number; // e.g., 50 = emergency sell if down 50%
  
  // Execution settings
  slippageBps: number;
  platform: 'pumpfun' | 'jupiter' | 'raydium';
}

export interface SmartProfitState {
  isMonitoring: boolean;
  currentPrice: number;
  highestPrice: number;
  lowestPrice: number;
  currentProfitPercent: number;
  trailingStopPrice: number | null;
  lastUpdated: number;
  triggersExecuted: {
    takeProfit: boolean;
    stopLoss: boolean;
    trailingStop: boolean;
    emergencyStop: boolean;
  };
}

export interface SmartProfitExecution {
  type: 'take_profit' | 'stop_loss' | 'trailing_stop' | 'emergency_stop';
  timestamp: number;
  triggerPrice: number;
  executionPrice: number;
  tokensSold: number;
  solReceived: number;
  profitPercent: number;
  signatures: string[];
  success: boolean;
  error?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Minimum time between executions to prevent rapid-fire sells
const MIN_EXECUTION_INTERVAL = 5000; // 5 seconds

// Price staleness threshold
const PRICE_STALE_THRESHOLD = 60_000; // 1 minute

// ============================================================================
// SMART PROFIT MANAGER CLASS
// ============================================================================

export class SmartProfitManager extends EventEmitter {
  private settings: SmartProfitSettings;
  private state: SmartProfitState;
  private stream: VolumeBotStreamManager | null = null;
  private lastExecutionTime = 0;
  private isExecuting = false;

  constructor(settings: SmartProfitSettings) {
    super();
    this.settings = settings;
    this.state = {
      isMonitoring: false,
      currentPrice: settings.averageEntryPrice,
      highestPrice: settings.averageEntryPrice,
      lowestPrice: settings.averageEntryPrice,
      currentProfitPercent: 0,
      trailingStopPrice: null,
      lastUpdated: Date.now(),
      triggersExecuted: {
        takeProfit: false,
        stopLoss: false,
        trailingStop: false,
        emergencyStop: false
      }
    };
  }

  /**
   * Start monitoring - connects to Helius WebSocket and watches for price changes
   */
  async startMonitoring(): Promise<void> {
    if (this.state.isMonitoring) {
      console.log('[SMART_PROFIT] Already monitoring');
      return;
    }

    console.log(`[SMART_PROFIT] 🚀 Starting monitoring for ${this.settings.tokenMint.slice(0, 8)}...`);
    console.log(`[SMART_PROFIT] Entry: ${this.settings.averageEntryPrice.toFixed(9)} SOL/token`);
    console.log(`[SMART_PROFIT] Take Profit: ${this.settings.takeProfitEnabled ? `${this.settings.takeProfitPercent}%` : 'Disabled'}`);
    console.log(`[SMART_PROFIT] Stop Loss: ${this.settings.stopLossEnabled ? `${this.settings.stopLossPercent}%` : 'Disabled'}`);
    console.log(`[SMART_PROFIT] Trailing Stop: ${this.settings.trailingStopEnabled ? `${this.settings.trailingStopPercent}%` : 'Disabled'}`);

    try {
      // Create WebSocket stream for real-time monitoring
      this.stream = await createVolumeBotStream({
        tokenMint: this.settings.tokenMint,
        userId: this.settings.userId,
        sessionId: this.settings.sessionId,
        walletAddresses: this.settings.walletAddresses,
        onTransaction: (tx) => this.handleTransaction(tx),
        onPriceChange: (price) => this.handlePriceChange(price),
        onError: (error) => this.handleStreamError(error)
      });

      this.state.isMonitoring = true;
      this.emit('started', { settings: this.settings, state: this.state });

      console.log('[SMART_PROFIT] ✅ Monitoring started');
    } catch (error) {
      console.error('[SMART_PROFIT] ❌ Failed to start monitoring:', error);
      throw error;
    }
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (!this.state.isMonitoring) return;

    console.log('[SMART_PROFIT] Stopping monitoring...');
    
    if (this.stream) {
      this.stream.disconnect();
      this.stream = null;
    }

    this.state.isMonitoring = false;
    this.emit('stopped', { state: this.state });
  }

  /**
   * Handle price change from WebSocket
   */
  private handlePriceChange(priceEvent: PriceChangeEvent): void {
    const newPrice = priceEvent.newPrice;
    const oldPrice = this.state.currentPrice;

    // Update state
    this.state.currentPrice = newPrice;
    this.state.lastUpdated = Date.now();

    // Track highest price for trailing stop
    if (newPrice > this.state.highestPrice) {
      this.state.highestPrice = newPrice;
      console.log(`[SMART_PROFIT] 📈 New high: ${newPrice.toFixed(9)} SOL/token`);
    }

    // Track lowest price
    if (newPrice < this.state.lowestPrice) {
      this.state.lowestPrice = newPrice;
    }

    // Calculate current profit/loss
    this.state.currentProfitPercent = 
      ((newPrice - this.settings.averageEntryPrice) / this.settings.averageEntryPrice) * 100;

    // Update trailing stop price if active
    if (this.settings.trailingStopEnabled && 
        this.state.currentProfitPercent >= this.settings.trailingStopActivationPercent) {
      const newTrailingStop = newPrice * (1 - this.settings.trailingStopPercent / 100);
      if (this.state.trailingStopPrice === null || newTrailingStop > this.state.trailingStopPrice) {
        this.state.trailingStopPrice = newTrailingStop;
        console.log(`[SMART_PROFIT] 📊 Trailing stop updated: ${newTrailingStop.toFixed(9)} SOL/token`);
      }
    }

    // Emit state update
    this.emit('priceUpdate', { 
      price: newPrice, 
      profitPercent: this.state.currentProfitPercent,
      state: this.state 
    });

    // Check triggers
    this.checkTriggers();
  }

  /**
   * Handle transaction from WebSocket
   */
  private handleTransaction(tx: TransactionEvent): void {
    // If it's our wallet making a trade, update position tracking
    if (tx.isOurWallet && tx.tokenAmount) {
      if (tx.type === 'buy') {
        // Update average entry price
        const newTokens = tx.tokenAmount;
        const newSol = tx.solAmount || 0;
        const totalTokens = this.settings.totalTokensHeld + newTokens;
        const totalSol = this.settings.totalSolInvested + newSol;
        
        this.settings.averageEntryPrice = totalSol / totalTokens;
        this.settings.totalTokensHeld = totalTokens;
        this.settings.totalSolInvested = totalSol;
        
        console.log(`[SMART_PROFIT] 📥 Position updated: ${totalTokens} tokens @ ${this.settings.averageEntryPrice.toFixed(9)} avg`);
      } else if (tx.type === 'sell') {
        // Reduce position
        this.settings.totalTokensHeld = Math.max(0, this.settings.totalTokensHeld - tx.tokenAmount);
        
        console.log(`[SMART_PROFIT] 📤 Position reduced: ${this.settings.totalTokensHeld} tokens remaining`);
        
        // If position is fully closed, stop monitoring
        if (this.settings.totalTokensHeld <= 0) {
          console.log('[SMART_PROFIT] Position fully closed, stopping monitoring');
          this.stopMonitoring();
        }
      }
    }

    this.emit('transaction', tx);
  }

  /**
   * Handle stream error
   */
  private handleStreamError(error: Error): void {
    console.error('[SMART_PROFIT] Stream error:', error);
    this.emit('error', error);
  }

  /**
   * Check all triggers and execute if conditions met
   */
  private async checkTriggers(): Promise<void> {
    // Don't check if already executing or price is stale
    if (this.isExecuting) return;
    if (Date.now() - this.state.lastUpdated > PRICE_STALE_THRESHOLD) {
      console.warn('[SMART_PROFIT] ⚠️ Price data is stale, skipping trigger check');
      return;
    }

    // Prevent rapid-fire executions
    if (Date.now() - this.lastExecutionTime < MIN_EXECUTION_INTERVAL) return;

    const profitPercent = this.state.currentProfitPercent;
    const currentPrice = this.state.currentPrice;

    // 1. EMERGENCY STOP - Highest priority
    if (this.settings.emergencyStopEnabled && 
        profitPercent <= -this.settings.emergencyStopLossPercent &&
        !this.state.triggersExecuted.emergencyStop) {
      console.log(`[SMART_PROFIT] 🚨 EMERGENCY STOP triggered at ${profitPercent.toFixed(2)}% loss`);
      await this.executeEmergencyStop(currentPrice);
      return;
    }

    // 2. STOP LOSS
    if (this.settings.stopLossEnabled && 
        profitPercent <= -this.settings.stopLossPercent &&
        !this.state.triggersExecuted.stopLoss) {
      console.log(`[SMART_PROFIT] 🛑 STOP LOSS triggered at ${profitPercent.toFixed(2)}%`);
      await this.executeStopLoss(currentPrice);
      return;
    }

    // 3. TRAILING STOP
    if (this.settings.trailingStopEnabled && 
        this.state.trailingStopPrice !== null &&
        currentPrice <= this.state.trailingStopPrice &&
        !this.state.triggersExecuted.trailingStop) {
      console.log(`[SMART_PROFIT] 📉 TRAILING STOP triggered at ${currentPrice.toFixed(9)}`);
      await this.executeTrailingStop(currentPrice);
      return;
    }

    // 4. TAKE PROFIT
    if (this.settings.takeProfitEnabled && 
        profitPercent >= this.settings.takeProfitPercent &&
        !this.state.triggersExecuted.takeProfit) {
      console.log(`[SMART_PROFIT] 💰 TAKE PROFIT triggered at ${profitPercent.toFixed(2)}%`);
      await this.executeTakeProfit(currentPrice);
      return;
    }
  }

  /**
   * Execute take profit - sell a percentage of position
   */
  private async executeTakeProfit(triggerPrice: number): Promise<void> {
    await this.executeSell('take_profit', triggerPrice, this.settings.takeProfitSellPercent);
    this.state.triggersExecuted.takeProfit = true;
  }

  /**
   * Execute stop loss - sell all
   */
  private async executeStopLoss(triggerPrice: number): Promise<void> {
    await this.executeSell('stop_loss', triggerPrice, 100);
    this.state.triggersExecuted.stopLoss = true;
  }

  /**
   * Execute trailing stop - sell all
   */
  private async executeTrailingStop(triggerPrice: number): Promise<void> {
    await this.executeSell('trailing_stop', triggerPrice, 100);
    this.state.triggersExecuted.trailingStop = true;
  }

  /**
   * Execute emergency stop - sell all immediately
   */
  private async executeEmergencyStop(triggerPrice: number): Promise<void> {
    await this.executeSell('emergency_stop', triggerPrice, 100);
    this.state.triggersExecuted.emergencyStop = true;
    this.stopMonitoring();
  }

  /**
   * Execute a sell order
   */
  private async executeSell(
    type: SmartProfitExecution['type'],
    triggerPrice: number,
    sellPercent: number
  ): Promise<void> {
    if (this.isExecuting) return;
    this.isExecuting = true;
    this.lastExecutionTime = Date.now();

    const execution: SmartProfitExecution = {
      type,
      timestamp: Date.now(),
      triggerPrice,
      executionPrice: 0,
      tokensSold: 0,
      solReceived: 0,
      profitPercent: this.state.currentProfitPercent,
      signatures: [],
      success: false
    };

    try {
      console.log(`[SMART_PROFIT] 🔄 Executing ${type}: selling ${sellPercent}% of position`);

      // Calculate tokens to sell
      const tokensToSell = this.settings.totalTokensHeld * (sellPercent / 100);
      const solValue = tokensToSell * triggerPrice;

      // Generate execution plan using PLD strategy (liquidation mode)
      const wallets = this.settings.walletIds.map((id, idx) => ({
        wallet_id: id,
        user_id: this.settings.userId,
        wallet_address: this.settings.walletAddresses[idx],
      }));

      const plan = generateExecutionPlan({
        userId: this.settings.userId,
        tokenMint: this.settings.tokenMint,
        strategy: 'predictive_liquidity_depth' as VolumeBotStrategy,
        totalVolume: solValue,
        wallets
      });

      if (plan.error) {
        throw new Error(plan.message || 'Failed to generate execution plan');
      }

      // Execute the plan
      const options: ExecutionOptions = {
        userId: this.settings.userId,
        sessionId: this.settings.sessionId,
        tokenMint: this.settings.tokenMint,
        slippageBps: this.settings.slippageBps,
        currentPrice: triggerPrice,
        platform: this.settings.platform
      };

      const executions = await executeTransactions(plan, options);

      // Collect signatures
      execution.signatures = executions
        .filter(e => e.success && e.signature)
        .map(e => e.signature!);

      execution.tokensSold = executions
        .filter(e => e.success && e.soldTokens)
        .reduce((sum, e) => sum + (e.soldTokens || 0), 0);

      execution.solReceived = execution.tokensSold * triggerPrice;
      execution.executionPrice = triggerPrice;
      execution.success = execution.signatures.length > 0;

      // Log to database
      await this.logExecution(execution);

      console.log(`[SMART_PROFIT] ✅ ${type} executed: sold ${execution.tokensSold} tokens for ~${execution.solReceived.toFixed(4)} SOL`);

      this.emit('execution', execution);
    } catch (error) {
      execution.success = false;
      execution.error = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[SMART_PROFIT] ❌ ${type} execution failed:`, error);
      this.emit('executionError', { type, error });
    } finally {
      this.isExecuting = false;
    }
  }

  /**
   * Log execution to Supabase
   */
  private async logExecution(execution: SmartProfitExecution): Promise<void> {
    try {
      const adminClient = getAdminClient();
      
      // Cast to any to bypass strict Supabase typing (table schema not in generated types)
      await (adminClient.from('volume_bot_executions') as any).insert({
        user_id: this.settings.userId,
        session_id: this.settings.sessionId,
        token_mint: this.settings.tokenMint,
        execution_type: execution.type,
        trigger_price: execution.triggerPrice,
        execution_price: execution.executionPrice,
        tokens_sold: execution.tokensSold,
        sol_received: execution.solReceived,
        profit_percent: execution.profitPercent,
        signatures: execution.signatures,
        success: execution.success,
        error: execution.error,
        metadata: {
          settings: {
            takeProfitPercent: this.settings.takeProfitPercent,
            stopLossPercent: this.settings.stopLossPercent,
            trailingStopPercent: this.settings.trailingStopPercent
          },
          state: this.state
        }
      });
    } catch (error) {
      console.error('[SMART_PROFIT] Failed to log execution:', error);
    }
  }

  /**
   * Update settings dynamically
   */
  updateSettings(updates: Partial<SmartProfitSettings>): void {
    this.settings = { ...this.settings, ...updates };
    console.log('[SMART_PROFIT] Settings updated');
    this.emit('settingsUpdated', this.settings);
  }

  /**
   * Get current state
   */
  getState(): SmartProfitState {
    return { ...this.state };
  }

  /**
   * Get current settings
   */
  getSettings(): SmartProfitSettings {
    return { ...this.settings };
  }

  /**
   * Manual emergency stop
   */
  async triggerEmergencyStop(): Promise<void> {
    console.log('[SMART_PROFIT] 🚨 MANUAL EMERGENCY STOP TRIGGERED');
    await this.executeEmergencyStop(this.state.currentPrice);
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create and start a Smart Profit manager
 */
export async function createSmartProfitManager(
  settings: SmartProfitSettings
): Promise<SmartProfitManager> {
  const manager = new SmartProfitManager(settings);
  
  if (settings.enabled) {
    await manager.startMonitoring();
  }
  
  return manager;
}

/**
 * Load settings from database
 */
export async function loadSmartProfitSettings(
  userId: string,
  tokenMint: string
): Promise<SmartProfitSettings | null> {
  try {
    const adminClient = getAdminClient();
    
    // Cast to any to bypass strict Supabase typing (table schema not in generated types)
    const { data, error } = await (adminClient
      .from('volume_bot_settings') as any)
      .select('*')
      .eq('user_id', userId)
      .eq('token_mint', tokenMint)
      .single();

    if (error || !data) {
      return null;
    }

    // Convert database format to SmartProfitSettings
    return {
      enabled: data.smart_profit_enabled ?? false,
      tokenMint: data.token_mint,
      userId: data.user_id,
      sessionId: data.session_id || '',
      walletIds: data.wallet_ids || [],
      walletAddresses: data.wallet_addresses || [],
      averageEntryPrice: data.average_entry_price || 0,
      totalTokensHeld: data.total_tokens_held || 0,
      totalSolInvested: data.total_sol_invested || 0,
      takeProfitEnabled: data.take_profit_enabled ?? true,
      takeProfitPercent: data.take_profit_percent ?? 50,
      takeProfitSellPercent: data.take_profit_sell_percent ?? 50,
      stopLossEnabled: data.stop_loss_enabled ?? true,
      stopLossPercent: data.stop_loss_percent ?? 20,
      trailingStopEnabled: data.trailing_stop_enabled ?? false,
      trailingStopPercent: data.trailing_stop_percent ?? 10,
      trailingStopActivationPercent: data.trailing_stop_activation_percent ?? 20,
      emergencyStopEnabled: data.emergency_stop_enabled ?? true,
      emergencyStopLossPercent: data.emergency_stop_loss_percent ?? 50,
      slippageBps: data.slippage_bps ?? 500,
      platform: data.platform ?? 'jupiter'
    };
  } catch (error) {
    console.error('[SMART_PROFIT] Failed to load settings:', error);
    return null;
  }
}

/**
 * Save settings to database
 */
export async function saveSmartProfitSettings(
  settings: SmartProfitSettings
): Promise<boolean> {
  try {
    const adminClient = getAdminClient();
    
    // Cast to any to bypass strict Supabase typing (table schema not in generated types)
    await (adminClient
      .from('volume_bot_settings') as any)
      .upsert({
        user_id: settings.userId,
        token_mint: settings.tokenMint,
        session_id: settings.sessionId,
        wallet_ids: settings.walletIds,
        wallet_addresses: settings.walletAddresses,
        smart_profit_enabled: settings.enabled,
        average_entry_price: settings.averageEntryPrice,
        total_tokens_held: settings.totalTokensHeld,
        total_sol_invested: settings.totalSolInvested,
        take_profit_enabled: settings.takeProfitEnabled,
        take_profit_percent: settings.takeProfitPercent,
        take_profit_sell_percent: settings.takeProfitSellPercent,
        stop_loss_enabled: settings.stopLossEnabled,
        stop_loss_percent: settings.stopLossPercent,
        trailing_stop_enabled: settings.trailingStopEnabled,
        trailing_stop_percent: settings.trailingStopPercent,
        trailing_stop_activation_percent: settings.trailingStopActivationPercent,
        emergency_stop_enabled: settings.emergencyStopEnabled,
        emergency_stop_loss_percent: settings.emergencyStopLossPercent,
        slippage_bps: settings.slippageBps,
        platform: settings.platform,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,token_mint'
      });

    return true;
  } catch (error) {
    console.error('[SMART_PROFIT] Failed to save settings:', error);
    return false;
  }
}

