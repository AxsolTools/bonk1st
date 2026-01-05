/**
 * Hyper-Smart Metrics Aggregator (HSMAC)
 *
 * Bridges the raw websocket data from `helius_streams` into
 * normalized token state snapshots used by higher-level strategy logic.
 */

const { EventEmitter } = require('events');
const heliusStreams = require('./helius_streams');

const tokenStates = new Map();
const activeSubscriptions = new Map();
const tokenWatchers = new Map();
const emitter = new EventEmitter();

function createInitialState(tokenMint) {
  return {
    tokenMint,
    price: 0,
    reserves: {
      baseAmount: 0,
      quoteAmount: 0,
      baseDecimals: 0,
      quoteDecimals: 0
    },
    lpHealth: {
      solReserve: 0,
      tokenReserve: 0,
      score: 0
    },
    lastTrade: null,
    migrationDetected: false,
    lastUpdate: null
  };
}

function notifyWatchers(tokenMint) {
  const state = tokenStates.get(tokenMint);
  if (!state) return;

  const watchers = tokenWatchers.get(tokenMint);
  if (watchers) {
    watchers.forEach((cb) => {
      try {
        cb(state);
      } catch (err) {
        console.error('[HSMAC_METRICS] Watcher callback error:', err.message);
      }
    });
  }

  emitter.emit('metrics-update', {
    tokenMint,
    state
  });
}

function ensureState(tokenMint) {
  if (!tokenStates.has(tokenMint)) {
    tokenStates.set(tokenMint, createInitialState(tokenMint));
  }
  return tokenStates.get(tokenMint);
}

heliusStreams.on('pool-update', (payload) => {
  const { tokenMint } = payload || {};
  if (!tokenMint || !tokenStates.has(tokenMint)) {
    return;
  }

  const state = tokenStates.get(tokenMint);
  state.reserves = {
    baseAmount: payload.reserves?.baseAmount ?? state.reserves.baseAmount,
    quoteAmount: payload.reserves?.quoteAmount ?? state.reserves.quoteAmount,
    baseDecimals: payload.reserves?.baseDecimals ?? state.reserves.baseDecimals,
    quoteDecimals: payload.reserves?.quoteDecimals ?? state.reserves.quoteDecimals
  };

  if (payload.price && Number.isFinite(payload.price)) {
    state.price = payload.price;
  }

  const solReserve = payload.reserves?.quoteAmount ?? 0;
  const tokenReserve = payload.reserves?.baseAmount ?? 0;
  const depthScore = Math.min(
    solReserve,
    tokenReserve * (state.price || 0)
  );

  state.lpHealth = {
    solReserve,
    tokenReserve,
    score: depthScore
  };

  state.lastUpdate = Date.now();

  notifyWatchers(tokenMint);
});

heliusStreams.on('trade-log', (payload) => {
  const { tokenMint } = payload || {};
  if (!tokenMint || !tokenStates.has(tokenMint)) {
    return;
  }

  const state = tokenStates.get(tokenMint);
  state.lastTrade = {
    classification: payload.classification || 'unknown',
    signature: payload.signature || null,
    slot: payload.slot || null,
    timestamp: Date.now(),
    rawLogs: payload.logs || []
  };

  state.lastUpdate = Date.now();

  notifyWatchers(tokenMint);
});

heliusStreams.on('pumpfun-event', (payload) => {
  const { tokenMint } = payload || {};
  if (!tokenMint || !tokenStates.has(tokenMint)) {
    return;
  }

  const state = tokenStates.get(tokenMint);
  state.migrationDetected = true;
  state.migrationSlot = payload.slot || null;
  state.lastUpdate = Date.now();

  notifyWatchers(tokenMint);
});

async function startTokenMonitoring(tokenMint, options = {}) {
  if (!tokenMint) {
    throw new Error('tokenMint is required');
  }

  ensureState(tokenMint);

  if (!heliusStreams.supportsStreaming) {
    console.warn('[HSMAC_METRICS] Helius Enhanced WebSocket unavailable, realtime metrics disabled');
    return {
      stop: () => {}
    };
  }

  if (activeSubscriptions.has(tokenMint)) {
    const record = activeSubscriptions.get(tokenMint);
    record.config = { ...record.config, ...options };
    return {
      stop: () => stopTokenMonitoring(tokenMint)
    };
  }

  try {
    const unsubscribe = await heliusStreams.subscribeToken(tokenMint, options || {});
    activeSubscriptions.set(tokenMint, {
      unsubscribe,
      config: { ...options }
    });
  } catch (error) {
    console.error('[HSMAC_METRICS] Failed to start monitoring:', error.message);
  }

  return {
    stop: () => stopTokenMonitoring(tokenMint)
  };
}

function stopTokenMonitoring(tokenMint) {
  const record = activeSubscriptions.get(tokenMint);
  if (record && typeof record.unsubscribe === 'function') {
    try {
      record.unsubscribe();
    } catch (error) {
      console.warn('[HSMAC_METRICS] Error during unsubscribe:', error.message);
    }
  }

  activeSubscriptions.delete(tokenMint);
  tokenStates.delete(tokenMint);
  tokenWatchers.delete(tokenMint);
}

function isMonitoring(tokenMint) {
  return activeSubscriptions.has(tokenMint);
}

function getTokenState(tokenMint) {
  return tokenStates.get(tokenMint) || null;
}

function subscribe(tokenMint, callback) {
  if (typeof callback !== 'function') {
    throw new Error('callback must be a function');
  }

  ensureState(tokenMint);

  if (!tokenWatchers.has(tokenMint)) {
    tokenWatchers.set(tokenMint, new Set());
  }

  const watchers = tokenWatchers.get(tokenMint);
  watchers.add(callback);

  const current = tokenStates.get(tokenMint);
  if (current) {
    try {
      callback(current);
    } catch (error) {
      console.error('[HSMAC_METRICS] Initial callback error:', error.message);
    }
  }

  return () => {
    const set = tokenWatchers.get(tokenMint);
    if (!set) return;
    set.delete(callback);
    if (set.size === 0) {
      tokenWatchers.delete(tokenMint);
    }
  };
}

function onMetricsUpdate(callback) {
  emitter.on('metrics-update', callback);
  return () => emitter.off('metrics-update', callback);
}

module.exports = {
  startTokenMonitoring,
  stopTokenMonitoring,
  isMonitoring,
  getTokenState,
  subscribe,
  onMetricsUpdate
};


