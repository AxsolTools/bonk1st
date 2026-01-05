const db = require('./db');
const { loadWalletFromDatabase } = require('./wallets');
const { STRATEGIES } = require('./hsmac_acl');
const { getRules } = require('./hsmac_rules');
const { checkUserRules, RuleCheckError } = require('./hsmac_rules_guard');

function shuffle(array) {
  const copy = array.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function splitVolumeRandom(totalVolume, slices) {
  if (!Number.isFinite(totalVolume) || totalVolume <= 0 || slices <= 0) {
    return [];
  }

  if (slices === 1) {
    return [totalVolume];
  }

  const randomPoints = Array.from({ length: slices - 1 }, () => Math.random()).sort((a, b) => a - b);
  const allocations = [];
  let prev = 0;
  randomPoints.forEach((point) => {
    const sliceVolume = totalVolume * (point - prev);
    allocations.push(sliceVolume);
    prev = point;
  });
  allocations.push(totalVolume * (1 - prev));

  return allocations;
}

function splitVolumeEven(totalVolume, slices) {
  if (!Number.isFinite(totalVolume) || totalVolume <= 0 || slices <= 0) {
    return [];
  }
  const base = totalVolume / slices;
  return Array.from({ length: slices }, () => base);
}

function getWalletPool(userId, { walletGroupId = null, walletIds = [] } = {}) {
  let wallets = [];

  if (walletGroupId) {
    wallets = db.getGroupWallets(walletGroupId) || [];
  } else if (Array.isArray(walletIds) && walletIds.length > 0) {
    wallets = walletIds
      .map((id) => db.getWalletById(id))
      .filter(Boolean);
  } else {
    wallets = db.getUserWallets(userId) || [];
  }

  return wallets.filter((wallet) => wallet.user_id === userId);
}

function attachKeypairs(wallets) {
  return wallets.map((wallet) => {
    try {
      const keypair = loadWalletFromDatabase(wallet.wallet_id);
      return {
        ...wallet,
        keypair,
        publicKey: keypair.publicKey.toBase58()
      };
    } catch (error) {
      return null;
    }
  }).filter(Boolean);
}

function buildDbpmPlan(wallets, totalVolume) {
  const randomized = shuffle(wallets);
  const slices = splitVolumeRandom(totalVolume, randomized.length || 1);
  return randomized.map((wallet, idx) => ({
    walletId: wallet.wallet_id,
    publicKey: wallet.publicKey,
    role: idx % 2 === 0 ? 'entry' : 'exit',
    amount: slices[idx] || 0,
    concurrency: false
  }));
}

function buildPldPlan(wallets, totalVolume) {
  const slices = splitVolumeEven(totalVolume, wallets.length || 1);
  return wallets.map((wallet, idx) => ({
    walletId: wallet.wallet_id,
    publicKey: wallet.publicKey,
    role: 'liquidity',
    amount: slices[idx] || 0,
    concurrency: true
  }));
}

function buildCmwaPlan(wallets, totalVolume) {
  const slices = splitVolumeEven(totalVolume, wallets.length || 1);
  return wallets.map((wallet, idx) => ({
    walletId: wallet.wallet_id,
    publicKey: wallet.publicKey,
    role: idx % 2 === 0 ? 'arbitrage_buy' : 'arbitrage_sell',
    amount: slices[idx] || 0,
    concurrency: true
  }));
}

function buildAllocation(strategy, wallets, totalVolume) {
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

function normalizeVolume(strategy, totalVolume, rules) {
  if (Number.isFinite(totalVolume) && totalVolume > 0) {
    return totalVolume;
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

function validateWalletPool(wallets) {
  if (!wallets || wallets.length === 0) {
    throw new Error('No wallets available for allocation');
  }
}

function preparePlan(options = {}) {
  const {
    userId,
    tokenMint = null,
    strategy,
    totalVolume = null,
    walletGroupId = null,
    walletIds = null,
    expectedProfitPercent = null,
    currentLossPercent = null,
    rulesOverride = null
  } = options;

  if (!userId) {
    throw new Error('userId is required to prepare allocation plan');
  }

  if (!strategy) {
    throw new Error('strategy is required to prepare allocation plan');
  }

  const baseWallets = getWalletPool(userId, { walletGroupId, walletIds });
  validateWalletPool(baseWallets);

  const keypairedWallets = attachKeypairs(baseWallets);
  validateWalletPool(keypairedWallets);

  const rules = rulesOverride || getRules(userId, tokenMint);
  const resolvedVolume = normalizeVolume(strategy, totalVolume, rules);

  checkUserRules({
    userId,
    tokenMint,
    totalVolume: resolvedVolume,
    requestedWallets: keypairedWallets,
    expectedProfitPercent,
    currentLossPercent,
    rulesOverride: rules
  });

  const allocation = buildAllocation(strategy, keypairedWallets, resolvedVolume);

  const summary = {
    userId,
    tokenMint,
    strategy,
    totalVolume: resolvedVolume,
    walletCount: allocation.length,
    roles: allocation.reduce((acc, entry) => {
      acc[entry.role] = (acc[entry.role] || 0) + 1;
      return acc;
    }, {}),
    rules
  };

  return {
    summary,
    allocation
  };
}

function buildTransactionPlans(plan) {
  return plan.allocation.map((entry, idx) => {
    // Determine intent based on role with proper algorithmic mapping
    let intent;

    // Explicit sell indicators: 'exit' (DBPM) or any role containing 'sell' (CMWA)
    if (entry.role === 'exit' || entry.role.includes('sell')) {
      intent = 'sell';
    }
    // PLD strategy: 'liquidity' role - alternate buy/sell to maintain volume balance
    // This ensures the volume bot never just buys; it creates balanced trading activity
    else if (entry.role === 'liquidity') {
      intent = idx % 2 === 0 ? 'buy' : 'sell';
    }
    // Default: 'entry' (DBPM), 'arbitrage_buy' (CMWA), or any buy-indicating role
    else {
      intent = 'buy';
    }

    return {
      walletId: entry.walletId,
      publicKey: entry.publicKey,
      role: entry.role,
      volume: entry.amount,
      concurrency: entry.concurrency,
      intent
    };
  });
}

function generateExecutionPlan(options = {}) {
  try {
    const plan = preparePlan(options);
    return {
      ...plan,
      transactions: buildTransactionPlans(plan)
    };
  } catch (error) {
    if (error instanceof RuleCheckError) {
      return {
        error: 'rule_violation',
        message: error.message,
        violations: error.violations
      };
    }

    return {
      error: 'allocation_failed',
      message: error.message
    };
  }
}

module.exports = {
  preparePlan,
  generateExecutionPlan,
  STRATEGIES
};


