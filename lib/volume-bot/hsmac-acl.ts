/**
 * Volume Bot - Algorithmic Control Layer (ACL)
 * 
 * 🧠 THE BRAIN OF YOUR VOLUME BOT
 * 
 * This module is responsible for:
 *  - Tracking token phase (Bonding Curve vs AMM Pool)
 *  - Classifying market status (momentum, stabilization, spread capture)
 *  - Selecting the active trading strategy (DBPM, PLD, CMWA)
 *  - Broadcasting status updates to downstream components (UI, WAE)
 * 
 * 💡 HOW IT WORKS:
 *  - Phase = Is your token still on Pump.fun or migrated to Raydium?
 *  - Status = Is the chart rising, falling, or consolidating?
 *  - Strategy = Which trading pattern should the bot use?
 */

import { EventEmitter } from 'events';
import type { VolumeBotStrategy } from './types';

// ============================================================================
// CONSTANTS
// ============================================================================

export const STRATEGIES = Object.freeze({
  DBPM: 'DBPM' as const,   // Dynamic Buy-Pressure Maintenance - 🐂 BULLISH MODE
  PLD: 'PLD' as const,     // Predictive Liquidity-Depth counter-buy - 🛡️ DEFENSE MODE  
  CMWA: 'CMWA' as const    // Concurrent Multi-Wallet Arbitrage - 🧠 GALAXY BRAIN
});

export const PHASES = Object.freeze({
  BONDING: 'Bonding Curve',  // 🎰 Still on Pump.fun bonding curve
  AMM: 'AMM Pool'            // 🏊 Migrated to Raydium/Jupiter AMM
});

export const PROTOCOL_STATES = Object.freeze({
  MOMENTUM: 'Building Momentum',   // 📈 Price going up, volume increasing
  STABILIZING: 'Stabilizing Price', // 📊 Price dropping or low liquidity
  CAPTURING: 'Capturing Spread'    // 💰 Good liquidity, capturing bid/ask spread
});

/**
 * Default thresholds for strategy switching
 * 
 * 💡 These control when the bot changes strategies:
 * - momentumChangePct: Price must increase by this % in 5min to be "momentum"
 * - stabilizationDropPct: Price must drop by this % to trigger defensive mode
 * - lpHealthFloor: Minimum liquidity score to be considered healthy
 * - volumeSpikeMultiplier: Volume spike detection threshold
 */
export const DEFAULT_THRESHOLDS = Object.freeze({
  momentumChangePct: 5,           // 📈 5% price increase = momentum
  stabilizationDropPct: -4,       // 📉 4% drop = stabilization mode
  lpHealthFloor: 5,               // 💧 Minimum liquidity health
  volumeSpikeMultiplier: 1.5      // 📊 1.5x volume = spike detected
});

// ============================================================================
// TYPES
// ============================================================================

export type Phase = typeof PHASES[keyof typeof PHASES];
export type ProtocolState = typeof PROTOCOL_STATES[keyof typeof PROTOCOL_STATES];

export interface ACLThresholds {
  momentumChangePct: number;
  stabilizationDropPct: number;
  lpHealthFloor: number;
  volumeSpikeMultiplier: number;
}

export interface MetricsSnapshot {
  price: {
    current: number;
    change1m: number;
    change5m: number;
    change1h: number;
  };
  volume: {
    vol5m: number;
  };
  liquidity: {
    sol: number;
    score: number;
  };
  supply: {
    circulating: number;
  };
  holders: number;
}

export interface ACLStatus {
  tokenMint: string;
  phase: Phase;
  protocolStatus: ProtocolState;
  strategy: VolumeBotStrategy;
  metricsSnapshot: MetricsSnapshot;
  config: SessionConfig;
  updatedAt: number;
}

export interface SessionConfig {
  userId: string | null;
  walletGroupId: string | null;
  rules: Record<string, unknown> | null;
  metricsConfig: Record<string, unknown>;
  forceBonding: boolean;
  forceAMM: boolean;
  autoExecute: boolean;
  emitIntervalMs: number;
}

interface ACLSession {
  tokenMint: string;
  startedAt: number;
  config: SessionConfig;
  thresholds: ACLThresholds;
  metricsAdapter: (state: unknown) => MetricsSnapshot;
  metricsUnsubscribe: (() => void) | null;
  currentStatus: ACLStatus | null;
  emergencyStop: boolean;
  lastEmitAt: number;
}

// ============================================================================
// STATE
// ============================================================================

const sessions = new Map<string, ACLSession>();
const emitter = new EventEmitter();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Determine if token is on bonding curve or AMM pool
 * 
 * 🎰 Bonding = Still on Pump.fun, price determined by bonding curve
 * 🏊 AMM = Migrated to Raydium, price determined by pool reserves
 */
function determinePhase(
  metricsState: { migrationDetected?: boolean } = {}, 
  sessionConfig: { forceAMM?: boolean; forceBonding?: boolean } = {}
): Phase {
  if (metricsState.migrationDetected || sessionConfig?.forceAMM) {
    return PHASES.AMM;
  }
  if (sessionConfig?.forceBonding) {
    return PHASES.BONDING;
  }
  return PHASES.BONDING;
}

/**
 * Classify current market conditions
 * 
 * 📈 MOMENTUM: Chart is pumping, volume is up, holders increasing
 * 📊 STABILIZING: Chart is dumping or liquidity is low  
 * 💰 CAPTURING: Market is stable, good for spread capture
 */
function classifyProtocolStatus(
  metrics: MetricsSnapshot, 
  thresholds: ACLThresholds
): ProtocolState {
  const priceChange = metrics?.price?.change5m ?? 0;
  const liquidityScore = metrics?.liquidity?.score ?? metrics?.liquidity?.sol ?? 0;
  const volume = metrics?.volume?.vol5m ?? 0;
  const holderCount = metrics?.holders ?? 0;
  const supply = metrics?.supply?.circulating ?? 0;

  // 📈 MOMENTUM: Price up, volume exists, holders growing
  if (priceChange >= thresholds.momentumChangePct && volume > 0 && holderCount > 10) {
    return PROTOCOL_STATES.MOMENTUM;
  }

  // 📉 STABILIZING: Price dumping or low liquidity
  if (priceChange <= thresholds.stabilizationDropPct || liquidityScore < thresholds.lpHealthFloor) {
    return PROTOCOL_STATES.STABILIZING;
  }

  // 💰 CAPTURING: Good liquidity and supply
  if (supply > 0 && liquidityScore >= thresholds.lpHealthFloor) {
    return PROTOCOL_STATES.CAPTURING;
  }

  return PROTOCOL_STATES.STABILIZING;
}

/**
 * Select the best strategy based on phase and status
 * 
 * 🐂 DBPM: Use when pumping (bonding curve or momentum)
 * 🛡️ PLD: Use when defending (price dropping)
 * 🧠 CMWA: Use when capturing spreads (stable market)
 */
function selectStrategy(phase: Phase, protocolStatus: ProtocolState): VolumeBotStrategy {
  // On bonding curve = always use DBPM for maximum buy pressure
  if (phase === PHASES.BONDING) {
    return STRATEGIES.DBPM;
  }

  // Price dropping = defensive PLD mode
  if (protocolStatus === PROTOCOL_STATES.STABILIZING) {
    return STRATEGIES.PLD;
  }

  // Stable market = arbitrage mode
  if (protocolStatus === PROTOCOL_STATES.CAPTURING) {
    return STRATEGIES.CMWA;
  }

  // Default to DBPM
  return STRATEGIES.DBPM;
}

/**
 * Build status object for emission
 */
function buildStatus(params: {
  tokenMint: string;
  phase: Phase;
  protocolStatus: ProtocolState;
  strategy: VolumeBotStrategy;
  metrics: MetricsSnapshot;
  config: SessionConfig;
}): ACLStatus {
  return {
    tokenMint: params.tokenMint,
    phase: params.phase,
    protocolStatus: params.protocolStatus,
    strategy: params.strategy,
    metricsSnapshot: params.metrics,
    config: params.config,
    updatedAt: Date.now()
  };
}

/**
 * Default metrics adapter - normalizes raw state to MetricsSnapshot
 */
function defaultMetricsAdapter(metricsState: unknown): MetricsSnapshot {
  if (!metricsState || typeof metricsState !== 'object') {
    return {
      price: { current: 0, change1m: 0, change5m: 0, change1h: 0 },
      volume: { vol5m: 0 },
      liquidity: { sol: 0, score: 0 },
      supply: { circulating: 0 },
      holders: 0
    };
  }

  const state = metricsState as Record<string, unknown>;
  const priceData = state.price as Record<string, number> | undefined;
  const volumeData = state.volume as Record<string, number> | undefined;
  const lpHealth = state.lpHealth as Record<string, number> | undefined;
  const reserves = state.reserves as Record<string, number> | undefined;
  const supplyData = state.supply as Record<string, number> | undefined;

  return {
    price: {
      current: priceData?.current ?? (typeof state.price === 'number' ? state.price : 0),
      change1m: priceData?.change1m ?? 0,
      change5m: priceData?.change5m ?? 0,
      change1h: priceData?.change1h ?? 0
    },
    volume: {
      vol5m: volumeData?.vol5m ?? 0
    },
    liquidity: {
      sol: lpHealth?.solReserve ?? reserves?.quoteAmount ?? 0,
      score: lpHealth?.score ?? 0
    },
    supply: {
      circulating: supplyData?.circulating ?? 0
    },
    holders: typeof state.holders === 'number' ? state.holders : 0
  };
}

/**
 * Evaluate session and emit status updates
 */
function evaluateSession(session: ACLSession, metricsState: unknown): void {
  const metricsSnapshot = session.metricsAdapter(metricsState);
  const phase = determinePhase(
    metricsState as { migrationDetected?: boolean }, 
    session.config
  );
  const protocolStatus = classifyProtocolStatus(metricsSnapshot, session.thresholds);
  const strategy = selectStrategy(phase, protocolStatus);

  const status = buildStatus({
    tokenMint: session.tokenMint,
    phase,
    protocolStatus,
    strategy,
    metrics: metricsSnapshot,
    config: session.config
  });

  const previousStatus = session.currentStatus;
  const now = Date.now();
  const hasMeaningfulChange = !previousStatus
    || previousStatus.phase !== phase
    || previousStatus.protocolStatus !== protocolStatus
    || previousStatus.strategy !== strategy;
  const emitInterval = session.config?.emitIntervalMs || 5000;
  const intervalExceeded = !session.lastEmitAt || (now - session.lastEmitAt) >= emitInterval;

  session.currentStatus = status;
  if (hasMeaningfulChange || intervalExceeded) {
    session.lastEmitAt = now;
    emitter.emit('status-update', status);
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Start HSMAC session for a token
 * 
 * 🚀 Call this to start the brain of your volume bot
 * 
 * @param tokenMint - The token to monitor
 * @param options - Configuration options
 * @returns The session object
 */
export async function engage(
  tokenMint: string, 
  options: Partial<SessionConfig & { thresholds?: Partial<ACLThresholds>; metricsAdapter?: (state: unknown) => MetricsSnapshot }> = {}
): Promise<ACLSession> {
  if (!tokenMint) {
    throw new Error('tokenMint is required');
  }

  if (sessions.has(tokenMint)) {
    return sessions.get(tokenMint)!;
  }

  const session: ACLSession = {
    tokenMint,
    startedAt: Date.now(),
    config: {
      userId: options.userId || null,
      walletGroupId: options.walletGroupId || null,
      rules: options.rules || null,
      metricsConfig: options.metricsConfig || {},
      forceBonding: options.forceBonding || false,
      forceAMM: options.forceAMM || false,
      autoExecute: options.autoExecute !== undefined ? options.autoExecute : true,
      emitIntervalMs: options.emitIntervalMs || 5000
    },
    thresholds: {
      ...DEFAULT_THRESHOLDS,
      ...(options.thresholds || {})
    },
    metricsAdapter: options.metricsAdapter || defaultMetricsAdapter,
    metricsUnsubscribe: null,
    currentStatus: null,
    emergencyStop: false,
    lastEmitAt: 0
  };

  // TODO: Integrate with hsmac-metrics for real-time updates
  // For now, we'll rely on manual updates via updateMetrics()

  sessions.set(tokenMint, session);

  return session;
}

/**
 * Stop HSMAC session for a token
 * 
 * 🛑 Call this to stop monitoring
 */
export function disengage(tokenMint: string, reason = 'manual'): boolean {
  const session = sessions.get(tokenMint);
  if (!session) {
    return false;
  }

  if (typeof session.metricsUnsubscribe === 'function') {
    try {
      session.metricsUnsubscribe();
    } catch (error) {
      console.warn('[HSMAC_ACL] Failed to remove metrics watcher:', error);
    }
  }

  sessions.delete(tokenMint);

  emitter.emit('session-ended', {
    tokenMint,
    reason,
    endedAt: Date.now()
  });

  return true;
}

/**
 * Trigger emergency stop for a token
 * 
 * 🚨 THE "OH SHIT" BUTTON - stops all trading immediately
 */
export function emergencyStop(tokenMint: string, context: Record<string, unknown> = {}): boolean {
  const session = sessions.get(tokenMint);
  if (!session) {
    return false;
  }

  session.emergencyStop = true;
  emitter.emit('emergency-stop', {
    tokenMint,
    context,
    timestamp: Date.now()
  });

  return true;
}

/**
 * Get current status for a token
 */
export function getStatus(tokenMint: string): ACLStatus | null {
  const session = sessions.get(tokenMint);
  if (!session) {
    return null;
  }

  return session.currentStatus;
}

/**
 * Update metrics for a session (for manual updates)
 */
export function updateMetrics(tokenMint: string, metricsState: unknown): void {
  const session = sessions.get(tokenMint);
  if (session) {
    evaluateSession(session, metricsState);
  }
}

/**
 * List all active sessions
 */
export function listSessions(): Array<{
  tokenMint: string;
  startedAt: number;
  config: SessionConfig;
  emergencyStop: boolean;
  currentStatus: ACLStatus | null;
}> {
  return Array.from(sessions.values()).map((session) => ({
    tokenMint: session.tokenMint,
    startedAt: session.startedAt,
    config: session.config,
    emergencyStop: session.emergencyStop,
    currentStatus: session.currentStatus
  }));
}

/**
 * Subscribe to status updates
 */
export function onStatusUpdate(callback: (status: ACLStatus) => void): () => void {
  emitter.on('status-update', callback);
  return () => emitter.off('status-update', callback);
}

/**
 * Subscribe to emergency stop events
 */
export function onEmergencyStop(
  callback: (event: { tokenMint: string; context: Record<string, unknown>; timestamp: number }) => void
): () => void {
  emitter.on('emergency-stop', callback);
  return () => emitter.off('emergency-stop', callback);
}

/**
 * Check if a session is in emergency stop state
 */
export function isEmergencyStopped(tokenMint: string): boolean {
  const session = sessions.get(tokenMint);
  return session?.emergencyStop ?? false;
}

