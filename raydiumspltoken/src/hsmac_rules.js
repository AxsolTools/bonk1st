const db = require('./db');

const DEFAULT_RULES = Object.freeze({
  initialWalletCount: 5,
  buyPressureVolume: 0.5, // SOL
  stabilizationThreshold: 5, // percent drop required to trigger PLD
  arbitrageProfitFloor: 0.2, // percent
  globalStopLoss: 15, // optional future use
  autoExecute: true
});

function sanitizeNumber(value, fallback = null) {
  if (value === undefined || value === null) {
    return fallback;
  }
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return num;
}

function normalizeRules(input = {}) {
  return {
    initialWalletCount: sanitizeNumber(input.initialWalletCount, DEFAULT_RULES.initialWalletCount),
    buyPressureVolume: sanitizeNumber(input.buyPressureVolume, DEFAULT_RULES.buyPressureVolume),
    stabilizationThreshold: sanitizeNumber(input.stabilizationThreshold, DEFAULT_RULES.stabilizationThreshold),
    arbitrageProfitFloor: sanitizeNumber(input.arbitrageProfitFloor, DEFAULT_RULES.arbitrageProfitFloor),
    globalStopLoss: sanitizeNumber(input.globalStopLoss, DEFAULT_RULES.globalStopLoss),
    autoExecute: input.autoExecute === undefined ? DEFAULT_RULES.autoExecute : Boolean(input.autoExecute)
  };
}

function mergeRules(base, override) {
  return {
    initialWalletCount: override.initialWalletCount ?? base.initialWalletCount,
    buyPressureVolume: override.buyPressureVolume ?? base.buyPressureVolume,
    stabilizationThreshold: override.stabilizationThreshold ?? base.stabilizationThreshold,
    arbitrageProfitFloor: override.arbitrageProfitFloor ?? base.arbitrageProfitFloor,
    globalStopLoss: override.globalStopLoss ?? base.globalStopLoss,
    autoExecute: override.autoExecute ?? base.autoExecute
  };
}

function getRules(userId, tokenMint = null) {
  if (!userId) {
    throw new Error('userId is required to get rules');
  }

  const defaultRecord = db.getHsmacRules(userId, null);
  const tokenRecord = tokenMint ? db.getHsmacRules(userId, tokenMint) : null;

  const merged = mergeRules(
    DEFAULT_RULES,
    normalizeRules(defaultRecord || {})
  );

  if (tokenRecord) {
    return mergeRules(merged, normalizeRules(tokenRecord));
  }

  return merged;
}

function setRules(userId, rules = {}, tokenMint = null) {
  if (!userId) {
    throw new Error('userId is required to set rules');
  }

  const payload = normalizeRules(rules);

  db.upsertHsmacRules(userId, tokenMint, payload);

  return getRules(userId, tokenMint);
}

function deleteRules(userId, tokenMint = null) {
  if (!userId) {
    throw new Error('userId is required to delete rules');
  }
  return db.deleteHsmacRules(userId, tokenMint);
}

module.exports = {
  DEFAULT_RULES,
  getRules,
  setRules,
  deleteRules,
  normalizeRules
};


