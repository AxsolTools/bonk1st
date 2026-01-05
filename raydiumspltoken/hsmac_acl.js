/**
 * Hyper-Smart Multi-Algorithm Strategy (HSMAS) - Algorithmic Control Layer
 *
 * Responsible for:
 *  - Tracking token phase (Bonding Curve vs AMM Pool)
 *  - Classifying protocol status (momentum, stabilization, spread capture)
 *  - Selecting the active algorithm (DBPM, PLD, CMWA)
 *  - Broadcasting status updates to downstream components (UI, WAE)
 */

const { EventEmitter } = require('events');
const hsmacMetrics = require('./hsmac_metrics');

const STRATEGIES = Object.freeze({
  DBPM: 'dbpm', // Dynamic Buy-Pressure Maintenance
  PLD: 'pld',   // Predictive Liquidity-Depth counter-buy
  CMWA: 'cmwa'  // Concurrent Multi-Wallet Arbitrage
});

const PHASES = Object.freeze({
  BONDING: 'Bonding Curve',
  AMM: 'AMM Pool'
});

const PROTOCOL_STATES = Object.freeze({
  MOMENTUM: 'Building Momentum',
  STABILIZING: 'Stabilizing Price',
  CAPTURING: 'Capturing Spread'
});

const DEFAULT_THRESHOLDS = Object.freeze({
  momentumChangePct: 5,
  stabilizationDropPct: -4,
  lpHealthFloor: 5,
  volumeSpikeMultiplier: 1.5
});

const sessions = new Map();
const emitter = new EventEmitter();

function ensureMetrics(tokenMint, metricsConfig = {}) {
  if (!tokenMint) {
    throw new Error('tokenMint is required');
  }

  return hsmacMetrics.startTokenMonitoring(tokenMint, metricsConfig).catch((error) => {
    console.error('[HSMAC_ACL] Failed to initialise metrics monitoring:', error.message);
    throw error;
  });
}

function determinePhase(metricsState = {}, sessionConfig = {}) {
  if (metricsState.migrationDetected || sessionConfig?.forceAMM) {
    return PHASES.AMM;
  }
  if (sessionConfig?.forceBonding) {
    return PHASES.BONDING;
  }
  return PHASES.BONDING;
}

function classifyProtocolStatus(metrics, thresholds) {
  const priceChange = metrics?.price?.change5m ?? 0;
  const liquidityScore = metrics?.liquidity?.score ?? metrics?.liquidity?.sol ?? 0;
  const volume = metrics?.volume?.vol5m ?? 0;
  const holderCount = metrics?.holders ?? 0;
  const supply = metrics?.supply?.circulating ?? 0;

  if (priceChange >= thresholds.momentumChangePct && volume > 0 && holderCount > 10) {
    return PROTOCOL_STATES.MOMENTUM;
  }

  if (priceChange <= thresholds.stabilizationDropPct || liquidityScore < thresholds.lpHealthFloor) {
    return PROTOCOL_STATES.STABILIZING;
  }

  if (supply > 0 && liquidityScore >= thresholds.lpHealthFloor) {
    return PROTOCOL_STATES.CAPTURING;
  }

  return PROTOCOL_STATES.STABILIZING;
}

function selectStrategy(phase, protocolStatus) {
  if (phase === PHASES.BONDING) {
    return STRATEGIES.DBPM;
  }

  if (protocolStatus === PROTOCOL_STATES.STABILIZING) {
    return STRATEGIES.PLD;
  }

  if (protocolStatus === PROTOCOL_STATES.CAPTURING) {
    return STRATEGIES.CMWA;
  }

  return STRATEGIES.DBPM;
}

function buildStatus({ tokenMint, phase, protocolStatus, strategy, metrics, config }) {
  return {
    tokenMint,
    phase,
    protocolStatus,
    strategy,
    metricsSnapshot: metrics,
    config,
    updatedAt: Date.now()
  };
}

function attachMetricsWatcher(session) {
  const { tokenMint } = session;

  session.metricsUnsubscribe = hsmacMetrics.subscribe(tokenMint, (metricsState) => {
    evaluateSession(session, metricsState);
  });
}

function evaluateSession(session, metricsState) {
  const metricsSnapshot = session.metricsAdapter(metricsState);
  const phase = determinePhase(metricsState, session.config);
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

function defaultMetricsAdapter(metricsState) {
  if (!metricsState) {
    return {
      price: { current: 0, change1m: 0, change5m: 0, change1h: 0 },
      volume: { vol5m: 0 },
      liquidity: { sol: 0, score: 0 },
      supply: { circulating: 0 },
      holders: 0
    };
  }

  const priceChanges = metricsState.price || {};
  return {
    price: {
      current: metricsState.price?.current ?? metricsState.price ?? 0,
      change1m: priceChanges.change1m ?? 0,
      change5m: priceChanges.change5m ?? 0,
      change1h: priceChanges.change1h ?? 0
    },
    volume: {
      vol5m: metricsState.volume?.vol5m ?? 0
    },
    liquidity: {
      sol: metricsState.lpHealth?.solReserve ?? metricsState.reserves?.quoteAmount ?? 0,
      score: metricsState.lpHealth?.score ?? 0
    },
    supply: {
      circulating: metricsState.supply?.circulating ?? 0
    },
    holders: metricsState.holders ?? 0
  };
}

async function engage(tokenMint, options = {}) {
  if (!tokenMint) {
    throw new Error('tokenMint is required');
  }

  if (sessions.has(tokenMint)) {
    return sessions.get(tokenMint);
  }

  const session = {
    tokenMint,
    startedAt: Date.now(),
    config: {
      userId: options.userId || null,
      walletGroupId: options.walletGroupId || null,
      rules: options.rules || null,
      metricsConfig: options.metricsConfig || {},
      forceBonding: options.forceBonding || false,
      forceAMM: options.forceAMM || false,
      chatId: options.chatId || null,
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

  await ensureMetrics(tokenMint, session.config.metricsConfig);

  attachMetricsWatcher(session);

  sessions.set(tokenMint, session);

  const initialState = hsmacMetrics.getTokenState(tokenMint);
  if (initialState) {
    evaluateSession(session, initialState);
  }

  return session;
}

function disengage(tokenMint, reason = 'manual') {
  const session = sessions.get(tokenMint);
  if (!session) {
    return false;
  }

  if (typeof session.metricsUnsubscribe === 'function') {
    try {
      session.metricsUnsubscribe();
    } catch (error) {
      console.warn('[HSMAC_ACL] Failed to remove metrics watcher:', error.message);
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

function emergencyStop(tokenMint, context = {}) {
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

function getStatus(tokenMint) {
  const session = sessions.get(tokenMint);
  if (!session) {
    return null;
  }

  return session.currentStatus;
}

function listSessions() {
  return Array.from(sessions.values()).map((session) => ({
    tokenMint: session.tokenMint,
    startedAt: session.startedAt,
    config: session.config,
    emergencyStop: session.emergencyStop,
    currentStatus: session.currentStatus
  }));
}

function onStatusUpdate(callback) {
  emitter.on('status-update', callback);
  return () => emitter.off('status-update', callback);
}

function onEmergencyStop(callback) {
  emitter.on('emergency-stop', callback);
  return () => emitter.off('emergency-stop', callback);
}

module.exports = {
  STRATEGIES,
  PHASES,
  PROTOCOL_STATES,
  engage,
  disengage,
  emergencyStop,
  getStatus,
  listSessions,
  onStatusUpdate,
  onEmergencyStop
};


