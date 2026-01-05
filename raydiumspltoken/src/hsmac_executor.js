const db = require('./db');
const { generateExecutionPlan } = require('./hsmac_wae');
const { buyTokenWithSOL, sellTokenForSOL } = require('./jupiter_swap');
const { buyOnPumpfunCurve, sellOnPumpfunCurve } = require('./pumpfun_complete');
const { getTokenAccounts } = require('./solana_utils');

const DEFAULT_SLIPPAGE_BPS = parseInt(process.env.HSMAC_DEFAULT_SLIPPAGE_BPS || '100', 10); // 1%
const PUMP_PRIORITY_FEE = 0.003;
const PUMP_SLIPPAGE = 30;

// Dust threshold: if remaining balance after sell is worth less than this in SOL, sell ALL
// Prevents leaving behind worthless token dust
const DUST_THRESHOLD_SOL = 0.0001; // ~$0.02 at $200/SOL

async function executeTransactions(planResult, options = {}) {
  const {
    userId,
    tokenMint,
    slippageBps = DEFAULT_SLIPPAGE_BPS,
    currentPrice = null
  } = options;

  const executions = [];

  const tokenRecord = tokenMint ? db.getTokenByMint(tokenMint) : null;
  const platform = String(tokenRecord?.platform || '').toLowerCase();
  const isPumpfunToken = platform.includes('pump');
  const normalizedPrice = Number(currentPrice);
  const hasPrice = Number.isFinite(normalizedPrice) && normalizedPrice > 0;

  const walletRecordCache = new Map();
  const tokenAccountCache = new Map();

  const loadWalletRecord = (walletId) => {
    if (!walletRecordCache.has(walletId)) {
      walletRecordCache.set(walletId, db.getWalletById(walletId) || null);
    }
    return walletRecordCache.get(walletId);
  };

  const loadTokenAccount = async (walletId) => {
    const cacheKey = `${walletId}:${tokenMint || ''}`;
    if (tokenAccountCache.has(cacheKey)) {
      return tokenAccountCache.get(cacheKey);
    }

    const walletRecord = loadWalletRecord(walletId);
    if (!walletRecord || !walletRecord.wallet_address) {
      tokenAccountCache.set(cacheKey, null);
      return null;
    }

    try {
      const accounts = await getTokenAccounts(walletRecord.wallet_address);
      const account = accounts.find((acc) => acc.mint === tokenMint) || null;
      if (account) {
        tokenAccountCache.set(cacheKey, { ...account });
      } else {
        tokenAccountCache.set(cacheKey, null);
      }
      return tokenAccountCache.get(cacheKey);
    } catch (error) {
      console.error('[HSMAC] Failed to load token account:', error.message);
      tokenAccountCache.set(cacheKey, null);
      return null;
    }
  };

  const invalidateTokenAccount = (walletId) => {
    const cacheKey = `${walletId}:${tokenMint || ''}`;
    tokenAccountCache.delete(cacheKey);
  };

  for (const entry of planResult.transactions || []) {
    const executionRecord = {
      walletId: entry.walletId,
      publicKey: entry.publicKey,
      role: entry.role,
      intent: entry.intent,
      volume: entry.volume,
      concurrency: entry.concurrency
    };

    try {
      const volumeNumeric = Number(entry.volume);
      if (!Number.isFinite(volumeNumeric) || volumeNumeric <= 0) {
        executionRecord.skipped = true;
        executionRecord.reason = 'invalid_volume';
        executions.push(executionRecord);
        continue;
      }

      if (entry.intent === 'buy') {
        if (isPumpfunToken) {
          const signature = await buyOnPumpfunCurve({
            userId,
            walletId: entry.walletId,
            tokenMint,
            solAmount: volumeNumeric,
            slippage: PUMP_SLIPPAGE,
            priorityFee: PUMP_PRIORITY_FEE
          });
          executionRecord.success = true;
          executionRecord.signature = signature;
          invalidateTokenAccount(entry.walletId);
        } else {
          const signature = await buyTokenWithSOL({
            userId,
            walletId: entry.walletId,
            tokenMint,
            solAmount: volumeNumeric,
            slippageBps
          });
          executionRecord.success = true;
          executionRecord.signature = signature;
          invalidateTokenAccount(entry.walletId);
        }
      } else if (entry.intent === 'sell') {
        const tokenAccount = await loadTokenAccount(entry.walletId);
        if (!tokenAccount || !tokenAccount.uiAmount || tokenAccount.uiAmount <= 0) {
          executionRecord.skipped = true;
          executionRecord.reason = 'wallet_has_no_tokens';
        } else if (!hasPrice) {
          executionRecord.skipped = true;
          executionRecord.reason = 'price_unavailable';
        } else {
          const decimals = Number.isInteger(tokenAccount.decimals) ? tokenAccount.decimals : 9;
          const availableTokens = Number(tokenAccount.uiAmount);
          const desiredTokens = volumeNumeric / normalizedPrice;
          let sellTokens = Math.min(availableTokens, desiredTokens);
          const minUnit = 1 / Math.pow(10, decimals);
          if (sellTokens < minUnit) {
            sellTokens = Math.min(availableTokens, minUnit);
          }

          // DUST PREVENTION: If remaining tokens after sell would be worth less than threshold, sell ALL
          // This ensures we never leave worthless dust behind
          const remainingTokens = availableTokens - sellTokens;
          const remainingValueSOL = remainingTokens * normalizedPrice;
          if (remainingValueSOL < DUST_THRESHOLD_SOL && remainingTokens > 0) {
            console.log(`[HSMAC] Dust prevention: remaining ${remainingTokens} tokens worth ${remainingValueSOL.toFixed(6)} SOL < threshold, selling ALL`);
            sellTokens = availableTokens; // Sell everything to avoid dust
            executionRecord.dustPrevention = true;
          }

          if (sellTokens <= 0) {
            executionRecord.skipped = true;
            executionRecord.reason = 'insufficient_tokens';
          } else if (isPumpfunToken) {
            const precision = Math.min(decimals, 9);
            const amountString = sellTokens.toFixed(precision);
            const signature = await sellOnPumpfunCurve({
              userId,
              walletId: entry.walletId,
              tokenMint,
              tokenAmount: amountString,
              slippage: PUMP_SLIPPAGE,
              priorityFee: PUMP_PRIORITY_FEE,
              forceFullBalance: sellTokens >= availableTokens // Signal to sell 100%
            });
            executionRecord.success = true;
            executionRecord.signature = signature;
            executionRecord.soldTokens = sellTokens;
            executionRecord.soldAll = sellTokens >= availableTokens;
            invalidateTokenAccount(entry.walletId);
          } else {
            const rawAvailable = BigInt(tokenAccount.amount || '0');
            // If selling all, use exact raw amount to prevent rounding dust
            const sellAll = sellTokens >= availableTokens;
            const desiredRaw = sellAll
              ? rawAvailable
              : BigInt(Math.max(1, Math.floor(sellTokens * Math.pow(10, decimals))));
            const rawToSell = desiredRaw > rawAvailable ? rawAvailable : desiredRaw;

            if (rawToSell <= 0n) {
              executionRecord.skipped = true;
              executionRecord.reason = 'unable_to_compute_raw_amount';
            } else {
              const signature = await sellTokenForSOL({
                userId,
                walletId: entry.walletId,
                tokenMint,
                tokenAmount: rawToSell.toString(),
                slippageBps
              });
              executionRecord.success = true;
              executionRecord.signature = signature;
              executionRecord.soldTokens = sellTokens;
              executionRecord.soldAll = sellAll;
              invalidateTokenAccount(entry.walletId);
            }
          }
        }
      } else {
        executionRecord.skipped = true;
        executionRecord.reason = 'unsupported_intent';
      }
    } catch (error) {
      executionRecord.success = false;
      executionRecord.error = error.message || 'Execution failed';
    }

    executions.push(executionRecord);
  }

  return executions;
}

function summarizeExecutions(executions) {
  if (!Array.isArray(executions) || executions.length === 0) {
    return {
      total: 0,
      success: 0,
      skipped: 0,
      failed: 0,
      allWalletsEmpty: false,
      sellsCompleted: 0,
      buysCompleted: 0
    };
  }

  let success = 0;
  let skipped = 0;
  let failed = 0;
  let sellsCompleted = 0;
  let buysCompleted = 0;
  let walletsWithNoTokens = 0;
  let totalSellIntents = 0;

  executions.forEach((execution) => {
    if (execution.skipped) {
      skipped += 1;
      // Track wallets that had no tokens (for exit condition detection)
      if (execution.reason === 'wallet_has_no_tokens' && execution.intent === 'sell') {
        walletsWithNoTokens += 1;
      }
    } else if (execution.success) {
      success += 1;
      if (execution.intent === 'sell') {
        sellsCompleted += 1;
      } else if (execution.intent === 'buy') {
        buysCompleted += 1;
      }
    } else {
      failed += 1;
    }

    // Count total sell intents to determine if all wallets are empty
    if (execution.intent === 'sell') {
      totalSellIntents += 1;
    }
  });

  // ALL WALLETS EMPTY: All sell intents were skipped due to 'wallet_has_no_tokens'
  // This signals that monitoring should stop - position is fully exited
  const allWalletsEmpty = totalSellIntents > 0 && walletsWithNoTokens === totalSellIntents;

  if (allWalletsEmpty) {
    console.log('[HSMAC] ✅ EXIT COMPLETE: All wallets have 0 tokens - position fully exited');
  }

  return {
    total: executions.length,
    success,
    skipped,
    failed,
    sellsCompleted,
    buysCompleted,
    walletsWithNoTokens,
    totalSellIntents,
    allWalletsEmpty // Signal to stop monitoring
  };
}

async function executeStrategy(options = {}) {
  const {
    userId,
    tokenMint,
    strategy,
    walletGroupId = null,
    walletIds = null,
    totalVolume = null,
    expectedProfitPercent = null,
    currentLossPercent = null,
    rulesOverride = null,
    slippageBps = DEFAULT_SLIPPAGE_BPS,
    currentPrice = null
  } = options;

  try {
    const planResult = generateExecutionPlan({
      userId,
      tokenMint,
      strategy,
      walletGroupId,
      walletIds,
      totalVolume,
      expectedProfitPercent,
      currentLossPercent,
      rulesOverride
    });

    if (planResult.error) {
      return {
        error: planResult.error,
        message: planResult.message,
        violations: planResult.violations || [],
        timestamp: Date.now()
      };
    }

    const executions = await executeTransactions(planResult, {
      userId,
      tokenMint,
      slippageBps,
      currentPrice
    });

    const summary = summarizeExecutions(executions);

    return {
      success: summary.failed === 0,
      summary,
      allocations: planResult.allocation,
      plan: planResult,
      executions,
      timestamp: Date.now()
    };
  } catch (error) {
    return {
      error: 'execution_failed',
      message: error.message || 'Failed to execute HSMAS plan',
      timestamp: Date.now()
    };
  }
}

module.exports = {
  executeStrategy
};


