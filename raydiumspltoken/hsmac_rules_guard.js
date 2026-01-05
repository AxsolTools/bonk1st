const { getRules } = require('./hsmac_rules');

class RuleCheckError extends Error {
  constructor(message, violations = []) {
    super(message);
    this.name = 'RuleCheckError';
    this.violations = violations;
  }
}

function validateOptions(options = {}) {
  const {
    userId,
    tokenMint = null,
    totalVolume = 0,
    requestedWallets = [],
    expectedProfitPercent = null,
    currentLossPercent = null,
    rulesOverride = null
  } = options;

  if (!userId) {
    throw new Error('userId is required for rule validation');
  }

  return {
    userId,
    tokenMint,
    totalVolume: Number.isFinite(totalVolume) ? totalVolume : 0,
    requestedWallets: Array.isArray(requestedWallets) ? requestedWallets : [],
    expectedProfitPercent: Number.isFinite(expectedProfitPercent) ? expectedProfitPercent : null,
    currentLossPercent: Number.isFinite(currentLossPercent) ? currentLossPercent : null,
    rulesOverride
  };
}

function enforceRule(rule, condition, message, violations) {
  if (!condition) {
    violations.push({ rule, message });
    return false;
  }
  return true;
}

function checkUserRules(options = {}) {
  const normalized = validateOptions(options);
  const {
    userId,
    tokenMint,
    totalVolume,
    requestedWallets,
    expectedProfitPercent,
    currentLossPercent,
    rulesOverride
  } = normalized;

  const effectiveRules = rulesOverride
    ? rulesOverride
    : getRules(userId, tokenMint);

  const violations = [];

  enforceRule(
    'initialWalletCount',
    requestedWallets.length <= effectiveRules.initialWalletCount,
    `Wallet count ${requestedWallets.length} exceeds configured limit ${effectiveRules.initialWalletCount}`,
    violations
  );

  if (totalVolume > 0) {
    enforceRule(
      'buyPressureVolume',
      totalVolume <= effectiveRules.buyPressureVolume,
      `Requested volume ${totalVolume} SOL exceeds buy-pressure cap ${effectiveRules.buyPressureVolume} SOL`,
      violations
    );
  }

  if (expectedProfitPercent !== null) {
    enforceRule(
      'arbitrageProfitFloor',
      expectedProfitPercent >= effectiveRules.arbitrageProfitFloor,
      `Expected profit ${expectedProfitPercent}% below floor ${effectiveRules.arbitrageProfitFloor}%`,
      violations
    );
  }

  if (currentLossPercent !== null && effectiveRules.globalStopLoss !== null) {
    enforceRule(
      'globalStopLoss',
      currentLossPercent <= effectiveRules.globalStopLoss,
      `Loss ${currentLossPercent}% breaches global stop-loss ${effectiveRules.globalStopLoss}%`,
      violations
    );
  }

  if (violations.length > 0) {
    throw new RuleCheckError('HSMAS rules violated', violations);
  }

  return {
    allowed: true,
    rules: effectiveRules
  };
}

module.exports = {
  checkUserRules,
  RuleCheckError
};


