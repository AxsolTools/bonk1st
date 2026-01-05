/**
 * Volume Bot Manager
 * 
 * 🎮 THE CONTROLLER - Your command center for volume operations
 * 
 * This module is the main interface for the Volume Bot:
 *  - Start/stop sessions
 *  - Configure settings
 *  - Monitor status
 *  - Handle emergency stops
 * 
 * 💡 DEGEN TRANSLATION:
 *  - "Session" = One run of the volume bot
 *  - "Settings" = Your config for how the bot trades
 *  - "Manager" = The boss that controls everything
 * 
 * This integrates: ACL, WAE, Executor, and Supabase storage
 */

import { createClient } from '@supabase/supabase-js';
import { 
  engage, 
  disengage, 
  emergencyStop as aclEmergencyStop,
  getStatus,
  onStatusUpdate,
  onEmergencyStop,
  STRATEGIES
} from './hsmac-acl';
import { generateExecutionPlan, planToExecutionPlan, type WalletRecord, type Rules } from './hsmac-wae';
import { executeTransactions, summarizeExecutions, toVolumeBotExecutions } from './hsmac-executor';
import type { 
  VolumeBotSettings, 
  VolumeBotSession, 
  VolumeBotStrategy,
  SessionStatus,
  VolumeBotStatusUpdate,
  VolumeBotEvent
} from './types';
import { DEFAULT_VOLUME_BOT_SETTINGS } from './types';

// ============================================================================
// SUPABASE CLIENT
// ============================================================================

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!url || !key) {
    throw new Error('Supabase credentials not configured');
  }
  
  return createClient(url, key);
}

// ============================================================================
// TYPES
// ============================================================================

export interface StartSessionOptions {
  userId: string;
  tokenMint: string;
  wallets: WalletRecord[];
  settings?: Partial<VolumeBotSettings>;
  platform?: 'pumpfun' | 'jupiter' | 'raydium';
  currentPrice?: number;
}

export interface SessionInfo {
  session: VolumeBotSession;
  settings: VolumeBotSettings;
}

// ============================================================================
// ACTIVE SESSIONS
// ============================================================================

const activeSessions = new Map<string, {
  session: VolumeBotSession;
  settings: VolumeBotSettings;
  intervalId: NodeJS.Timeout | null;
  wallets: WalletRecord[];
}>();

// Event handlers
const eventHandlers = new Map<string, Set<(event: VolumeBotEvent) => void>>();

// ============================================================================
// SETTINGS MANAGEMENT
// ============================================================================

/**
 * Get or create settings for a user's token
 */
export async function getSettings(userId: string, tokenMint: string): Promise<VolumeBotSettings | null> {
  try {
    const supabase = getSupabaseClient();
    
    const { data, error } = await supabase
      .from('volume_bot_settings')
      .select('*')
      .eq('user_id', userId)
      .eq('token_mint', tokenMint)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      console.error('[VOLUME_BOT] Error fetching settings:', error);
      return null;
    }
    
    if (!data) {
      return null;
    }
    
    return mapDbToSettings(data);
  } catch (error) {
    console.error('[VOLUME_BOT] Error in getSettings:', error);
    return null;
  }
}

/**
 * Create or update settings for a user's token
 */
export async function saveSettings(
  userId: string, 
  tokenMint: string, 
  settings: Partial<VolumeBotSettings>
): Promise<VolumeBotSettings> {
  const supabase = getSupabaseClient();
  
  const dbSettings = {
    user_id: userId,
    token_mint: tokenMint,
    strategy: settings.strategy ?? DEFAULT_VOLUME_BOT_SETTINGS.strategy,
    target_volume_sol: settings.targetVolumeSol ?? DEFAULT_VOLUME_BOT_SETTINGS.targetVolumeSol,
    min_tx_sol: settings.minTxSol ?? DEFAULT_VOLUME_BOT_SETTINGS.minTxSol,
    max_tx_sol: settings.maxTxSol ?? DEFAULT_VOLUME_BOT_SETTINGS.maxTxSol,
    trade_interval_ms: settings.tradeIntervalMs ?? DEFAULT_VOLUME_BOT_SETTINGS.tradeIntervalMs,
    buy_pressure_percent: settings.buyPressurePercent ?? DEFAULT_VOLUME_BOT_SETTINGS.buyPressurePercent,
    active_wallet_count: settings.activeWalletCount ?? DEFAULT_VOLUME_BOT_SETTINGS.activeWalletCount,
    wallet_rotation_mode: settings.walletRotationMode ?? DEFAULT_VOLUME_BOT_SETTINGS.walletRotationMode,
    emergency_stop_enabled: settings.emergencyStopEnabled ?? DEFAULT_VOLUME_BOT_SETTINGS.emergencyStopEnabled,
    min_sol_balance: settings.minSolBalance ?? DEFAULT_VOLUME_BOT_SETTINGS.minSolBalance,
    max_session_loss_sol: settings.maxSessionLossSol ?? DEFAULT_VOLUME_BOT_SETTINGS.maxSessionLossSol,
    max_price_drop_percent: settings.maxPriceDropPercent ?? DEFAULT_VOLUME_BOT_SETTINGS.maxPriceDropPercent,
    smart_profit_enabled: settings.smartProfitEnabled ?? DEFAULT_VOLUME_BOT_SETTINGS.smartProfitEnabled,
    take_profit_percent: settings.takeProfitPercent ?? DEFAULT_VOLUME_BOT_SETTINGS.takeProfitPercent,
    trailing_stop_percent: settings.trailingStopPercent ?? DEFAULT_VOLUME_BOT_SETTINGS.trailingStopPercent,
    randomize_timing: settings.randomizeTiming ?? DEFAULT_VOLUME_BOT_SETTINGS.randomizeTiming,
    randomize_amounts: settings.randomizeAmounts ?? DEFAULT_VOLUME_BOT_SETTINGS.randomizeAmounts,
    amount_variance_percent: settings.amountVariancePercent ?? DEFAULT_VOLUME_BOT_SETTINGS.amountVariancePercent,
    use_jito_bundles: settings.useJitoBundles ?? DEFAULT_VOLUME_BOT_SETTINGS.useJitoBundles,
    priority_fee_mode: settings.priorityFeeMode ?? DEFAULT_VOLUME_BOT_SETTINGS.priorityFeeMode,
    is_active: settings.isActive ?? DEFAULT_VOLUME_BOT_SETTINGS.isActive,
    auto_restart: settings.autoRestart ?? DEFAULT_VOLUME_BOT_SETTINGS.autoRestart,
    updated_at: new Date().toISOString()
  };
  
  const { data, error } = await supabase
    .from('volume_bot_settings')
    .upsert(dbSettings, { 
      onConflict: 'user_id,token_mint',
      ignoreDuplicates: false 
    })
    .select()
    .single();
  
  if (error) {
    throw new Error(`Failed to save settings: ${error.message}`);
  }
  
  return mapDbToSettings(data);
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/**
 * Start a new volume bot session
 * 
 * 🚀 THE BIG BUTTON - Starts your money printer
 */
export async function startSession(options: StartSessionOptions): Promise<SessionInfo> {
  const { userId, tokenMint, wallets, settings: settingsOverride, platform, currentPrice } = options;
  
  if (!userId || !tokenMint) {
    throw new Error('userId and tokenMint are required');
  }
  
  if (!wallets || wallets.length === 0) {
    throw new Error('At least one wallet is required - add some wallets first! 👛');
  }
  
  // Check if already running
  const existingKey = `${userId}:${tokenMint}`;
  if (activeSessions.has(existingKey)) {
    throw new Error('Session already running for this token. Stop it first! 🛑');
  }
  
  const supabase = getSupabaseClient();
  
  // Get or create settings
  let settings = await getSettings(userId, tokenMint);
  if (!settings) {
    settings = await saveSettings(userId, tokenMint, settingsOverride || {});
  } else if (settingsOverride) {
    settings = await saveSettings(userId, tokenMint, { ...settings, ...settingsOverride });
  }
  
  // Create session in database
  const sessionData = {
    user_id: userId,
    settings_id: settings.id,
    token_mint: tokenMint,
    status: 'pending' as SessionStatus,
    target_volume_sol: settings.targetVolumeSol,
    executed_volume_sol: 0,
    start_price: currentPrice || null,
    current_price: currentPrice || null,
    peak_price: currentPrice || null,
    lowest_price: currentPrice || null
  };
  
  const { data: sessionRow, error: sessionError } = await supabase
    .from('volume_bot_sessions')
    .insert(sessionData)
    .select()
    .single();
  
  if (sessionError) {
    throw new Error(`Failed to create session: ${sessionError.message}`);
  }
  
  const session = mapDbToSession(sessionRow);
  
  // Engage ACL (the brain)
  await engage(tokenMint, {
    userId,
    autoExecute: true,
    emitIntervalMs: settings.tradeIntervalMs
  });
  
  // Update session to running
  await supabase
    .from('volume_bot_sessions')
    .update({ 
      status: 'running',
      started_at: new Date().toISOString()
    })
    .eq('id', session.id);
  
  session.status = 'running';
  session.startedAt = new Date();
  
  // Start execution loop
  const intervalId = setInterval(async () => {
    await executeSessionCycle(session.id, tokenMint, wallets, settings!, platform, currentPrice);
  }, settings.tradeIntervalMs);
  
  // Store active session
  activeSessions.set(existingKey, {
    session,
    settings,
    intervalId,
    wallets
  });
  
  // Emit session started event
  emitEvent(tokenMint, {
    type: 'session_started',
    data: { sessionId: session.id }
  });
  
  console.log(`[VOLUME_BOT] 🚀 Session started: ${session.id}`);
  console.log(`   Token: ${tokenMint}`);
  console.log(`   Strategy: ${settings.strategy}`);
  console.log(`   Target Volume: ${settings.targetVolumeSol} SOL`);
  console.log(`   Wallets: ${wallets.length}`);
  
  return { session, settings };
}

/**
 * Stop a running session
 * 
 * 🛑 THE STOP BUTTON - Gracefully stops your bot
 */
export async function stopSession(userId: string, tokenMint: string, reason = 'manual'): Promise<boolean> {
  const key = `${userId}:${tokenMint}`;
  const activeSession = activeSessions.get(key);
  
  if (!activeSession) {
    console.warn('[VOLUME_BOT] No active session found');
    return false;
  }
  
  // Stop the execution loop
  if (activeSession.intervalId) {
    clearInterval(activeSession.intervalId);
  }
  
  // Disengage ACL
  disengage(tokenMint, reason);
  
  // Update session in database
  const supabase = getSupabaseClient();
  await supabase
    .from('volume_bot_sessions')
    .update({
      status: reason === 'emergency' ? 'emergency_stopped' : 'stopped',
      stop_reason: reason,
      stopped_at: new Date().toISOString()
    })
    .eq('id', activeSession.session.id);
  
  // Remove from active sessions
  activeSessions.delete(key);
  
  // Emit event
  emitEvent(tokenMint, {
    type: 'session_stopped',
    data: { sessionId: activeSession.session.id, reason }
  });
  
  console.log(`[VOLUME_BOT] 🛑 Session stopped: ${activeSession.session.id} (${reason})`);
  
  return true;
}

/**
 * Emergency stop - stops immediately and marks as emergency
 * 
 * 🚨 THE PANIC BUTTON - Use when things go wrong!
 */
export async function emergencyStop(userId: string, tokenMint: string, context = {}): Promise<boolean> {
  // Trigger ACL emergency stop
  aclEmergencyStop(tokenMint, context);
  
  // Stop the session
  return stopSession(userId, tokenMint, 'emergency');
}

/**
 * Get current session status
 */
export function getSessionStatus(userId: string, tokenMint: string): SessionInfo | null {
  const key = `${userId}:${tokenMint}`;
  const activeSession = activeSessions.get(key);
  
  if (!activeSession) {
    return null;
  }
  
  return {
    session: activeSession.session,
    settings: activeSession.settings
  };
}

/**
 * List all active sessions for a user
 */
export function listActiveSessions(userId: string): SessionInfo[] {
  const sessions: SessionInfo[] = [];
  
  for (const [key, value] of activeSessions) {
    if (key.startsWith(`${userId}:`)) {
      sessions.push({
        session: value.session,
        settings: value.settings
      });
    }
  }
  
  return sessions;
}

// ============================================================================
// EXECUTION CYCLE
// ============================================================================

/**
 * Execute one cycle of the volume bot
 * 
 * 🔄 This runs every tradeIntervalMs
 */
async function executeSessionCycle(
  sessionId: string,
  tokenMint: string,
  wallets: WalletRecord[],
  settings: VolumeBotSettings,
  platform?: 'pumpfun' | 'jupiter' | 'raydium',
  currentPrice?: number
): Promise<void> {
  try {
    // Get ACL status for strategy recommendation
    const aclStatus = getStatus(tokenMint);
    const strategy = aclStatus?.strategy || settings.strategy;
    
    // Build rules from settings
    const rules: Rules = {
      initialWalletCount: settings.activeWalletCount,
      buyPressureVolume: settings.maxTxSol,
      stabilizationThreshold: 5,
      arbitrageProfitFloor: 0.2,
      globalStopLoss: settings.maxPriceDropPercent,
      autoExecute: true
    };
    
    // Generate execution plan
    const planResult = generateExecutionPlan({
      userId: settings.userId,
      tokenMint,
      strategy,
      wallets,
      rulesOverride: rules
    });
    
    if (planResult.error) {
      console.warn(`[VOLUME_BOT] Plan generation failed: ${planResult.message}`);
      
      // Check for rule violations
      if (planResult.violations && planResult.violations.length > 0) {
        emitEvent(tokenMint, {
          type: 'error',
          data: { sessionId, error: planResult.message || 'Rule violation' }
        });
      }
      return;
    }
    
    // Execute transactions
    const executions = await executeTransactions(planResult, {
      userId: settings.userId,
      sessionId,
      tokenMint,
      platform: platform || 'jupiter',
      currentPrice: currentPrice || undefined
    });
    
    // Summarize results
    const summary = summarizeExecutions(executions);
    
    // Update session metrics
    const supabase = getSupabaseClient();
    const volumeExecuted = executions
      .filter(e => e.success)
      .reduce((sum, e) => sum + e.volume, 0);
    
    await supabase
      .from('volume_bot_sessions')
      .update({
        executed_volume_sol: volumeExecuted,
        total_trades: summary.total,
        successful_trades: summary.success,
        failed_trades: summary.failed,
        buy_count: summary.buysCompleted,
        sell_count: summary.sellsCompleted,
        current_price: currentPrice || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', sessionId);
    
    // Log executions to database
    const executionRecords = toVolumeBotExecutions(executions, sessionId, settings.userId);
    if (executionRecords.length > 0) {
      await supabase
        .from('volume_bot_executions')
        .insert(executionRecords.map(e => ({
          session_id: e.sessionId,
          user_id: e.userId,
          trade_type: e.tradeType,
          wallet_id: e.walletId,
          wallet_address: e.walletAddress,
          sol_amount: e.solAmount,
          token_amount: e.tokenAmount,
          tx_signature: e.txSignature,
          tx_status: e.txStatus,
          execution_method: e.executionMethod,
          error_code: e.errorCode,
          error_message: e.errorMessage
        })));
    }
    
    // Emit status update
    emitEvent(tokenMint, {
      type: 'status_update',
      data: {
        sessionId,
        status: 'running',
        executedVolumeSol: volumeExecuted,
        progressPercent: (volumeExecuted / settings.targetVolumeSol) * 100,
        lastTradeType: executions.length > 0 ? executions[executions.length - 1].intent : null,
        lastTradeSol: executions.length > 0 ? executions[executions.length - 1].volume : null,
        lastTradeSignature: executions.find(e => e.signature)?.signature || null,
        currentPrice: currentPrice || null,
        priceChangePercent: null,
        isHealthy: summary.failed === 0,
        warningMessage: summary.failed > 0 ? `${summary.failed} trades failed` : null,
        timestamp: new Date()
      }
    });
    
    // Check if target reached
    if (volumeExecuted >= settings.targetVolumeSol) {
      console.log(`[VOLUME_BOT] 🎉 Target volume reached! Session complete.`);
      // Find and stop the session
      for (const [key, value] of activeSessions) {
        if (value.session.id === sessionId) {
          const [userId] = key.split(':');
          await stopSession(userId, tokenMint, 'completed');
          break;
        }
      }
    }
    
  } catch (error) {
    console.error('[VOLUME_BOT] Execution cycle error:', error);
    emitEvent(tokenMint, {
      type: 'error',
      data: { sessionId, error: error instanceof Error ? error.message : 'Unknown error' }
    });
  }
}

// ============================================================================
// EVENT SYSTEM
// ============================================================================

/**
 * Subscribe to events for a token
 */
export function subscribeToEvents(
  tokenMint: string, 
  handler: (event: VolumeBotEvent) => void
): () => void {
  if (!eventHandlers.has(tokenMint)) {
    eventHandlers.set(tokenMint, new Set());
  }
  
  eventHandlers.get(tokenMint)!.add(handler);
  
  return () => {
    eventHandlers.get(tokenMint)?.delete(handler);
  };
}

/**
 * Emit an event
 */
function emitEvent(tokenMint: string, event: VolumeBotEvent): void {
  const handlers = eventHandlers.get(tokenMint);
  if (handlers) {
    handlers.forEach(handler => {
      try {
        handler(event);
      } catch (error) {
        console.error('[VOLUME_BOT] Event handler error:', error);
      }
    });
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Map database row to VolumeBotSettings
 */
function mapDbToSettings(row: Record<string, unknown>): VolumeBotSettings {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    tokenMint: row.token_mint as string,
    strategy: row.strategy as VolumeBotStrategy,
    targetVolumeSol: row.target_volume_sol as number,
    minTxSol: row.min_tx_sol as number,
    maxTxSol: row.max_tx_sol as number,
    tradeIntervalMs: row.trade_interval_ms as number,
    buyPressurePercent: row.buy_pressure_percent as number,
    activeWalletCount: row.active_wallet_count as number,
    walletRotationMode: row.wallet_rotation_mode as VolumeBotSettings['walletRotationMode'],
    emergencyStopEnabled: row.emergency_stop_enabled as boolean,
    minSolBalance: row.min_sol_balance as number,
    maxSessionLossSol: row.max_session_loss_sol as number,
    maxPriceDropPercent: row.max_price_drop_percent as number,
    smartProfitEnabled: row.smart_profit_enabled as boolean,
    takeProfitPercent: row.take_profit_percent as number | null,
    trailingStopPercent: row.trailing_stop_percent as number | null,
    randomizeTiming: row.randomize_timing as boolean,
    randomizeAmounts: row.randomize_amounts as boolean,
    amountVariancePercent: row.amount_variance_percent as number,
    useJitoBundles: row.use_jito_bundles as boolean,
    priorityFeeMode: row.priority_fee_mode as VolumeBotSettings['priorityFeeMode'],
    isActive: row.is_active as boolean,
    autoRestart: row.auto_restart as boolean,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
    lastExecutedAt: row.last_executed_at ? new Date(row.last_executed_at as string) : null
  };
}

/**
 * Map database row to VolumeBotSession
 */
function mapDbToSession(row: Record<string, unknown>): VolumeBotSession {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    settingsId: row.settings_id as string,
    tokenMint: row.token_mint as string,
    status: row.status as SessionStatus,
    targetVolumeSol: row.target_volume_sol as number,
    executedVolumeSol: row.executed_volume_sol as number,
    totalTrades: row.total_trades as number,
    successfulTrades: row.successful_trades as number,
    failedTrades: row.failed_trades as number,
    buyCount: row.buy_count as number,
    sellCount: row.sell_count as number,
    totalSolSpent: row.total_sol_spent as number,
    totalSolReceived: row.total_sol_received as number,
    totalFeesPaid: row.total_fees_paid as number,
    netPnlSol: row.net_pnl_sol as number,
    tokensBought: row.tokens_bought as number,
    tokensSold: row.tokens_sold as number,
    averageBuyPrice: row.average_buy_price as number | null,
    averageSellPrice: row.average_sell_price as number | null,
    startPrice: row.start_price as number | null,
    currentPrice: row.current_price as number | null,
    peakPrice: row.peak_price as number | null,
    lowestPrice: row.lowest_price as number | null,
    stopReason: row.stop_reason as string | null,
    errorMessage: row.error_message as string | null,
    errorDetails: row.error_details as Record<string, unknown> | null,
    createdAt: new Date(row.created_at as string),
    startedAt: row.started_at ? new Date(row.started_at as string) : null,
    pausedAt: row.paused_at ? new Date(row.paused_at as string) : null,
    stoppedAt: row.stopped_at ? new Date(row.stopped_at as string) : null,
    updatedAt: new Date(row.updated_at as string)
  };
}

// Setup ACL event listeners
onStatusUpdate((status) => {
  emitEvent(status.tokenMint, {
    type: 'status_update',
    data: {
      sessionId: '',
      status: 'running',
      executedVolumeSol: 0,
      progressPercent: 0,
      lastTradeType: null,
      lastTradeSol: null,
      lastTradeSignature: null,
      currentPrice: status.metricsSnapshot.price.current,
      priceChangePercent: status.metricsSnapshot.price.change5m,
      isHealthy: true,
      warningMessage: null,
      timestamp: new Date()
    }
  });
});

onEmergencyStop((event) => {
  emitEvent(event.tokenMint, {
    type: 'emergency_stop',
    data: {
      sessionId: '',
      reason: JSON.stringify(event.context)
    }
  });
});

