/**
 * PNL (Profit and Loss) Tracking Module
 * Tracks user token holdings, entry prices, and calculates PNL
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { getConnection, lamportsToSol } = require('./solana_utils');
const { getTokenAccounts, getMintInfo, getTokenBalance } = require('./solana_utils');
const {
  getEnhancedTransaction,
  getEnhancedTransactionHistory,
  isHeliusAvailable
} = require('./helius');
const hsmacMetrics = require('./hsmac_metrics');
const db = require('./db');
const { getRealtimePriceUSD } = require('./price_pipeline');
const { readBondingCurveData } = require('./pumpfun_impl');

const SOL_MINT_ADDRESS = 'So11111111111111111111111111111111111111112';
let cachedSolPrice = { value: null, fetchedAt: 0 };

const LAST_SELL_PRICE_CACHE = new Map(); // key `${wallet}:${mint}` => { price, updatedAt }
const LAST_SELL_PRICE_TTL_MS = 30 * 60 * 1000;

async function getSolPriceUsdCached() {
  const now = Date.now();
  if (cachedSolPrice.value && (now - cachedSolPrice.fetchedAt) < 60_000) {
    return cachedSolPrice.value;
  }

  try {
    const result = await getRealtimePriceUSD(SOL_MINT_ADDRESS, { preferRealtime: false });
    const price = Number(result?.price);
    if (Number.isFinite(price) && price > 0) {
      cachedSolPrice = { value: price, fetchedAt: now };
      return price;
    }
  } catch (error) {
    console.warn('[PNL] Unable to fetch SOL price:', error.message);
  }

  return cachedSolPrice.value;
}

function cacheLastSellPrice(walletAddress, tokenMint, priceUsd) {
  if (!walletAddress || !tokenMint || !Number.isFinite(priceUsd) || priceUsd <= 0) {
    return;
  }
  const key = `${walletAddress}:${tokenMint}`;
  LAST_SELL_PRICE_CACHE.set(key, { price: priceUsd, updatedAt: Date.now() });
}

function getCachedLastSellPrice(walletAddress, tokenMint) {
  if (!walletAddress || !tokenMint) {
    return null;
  }
  const key = `${walletAddress}:${tokenMint}`;
  const entry = LAST_SELL_PRICE_CACHE.get(key);
  if (!entry) {
    return null;
  }
  if (Date.now() - entry.updatedAt > LAST_SELL_PRICE_TTL_MS) {
    LAST_SELL_PRICE_CACHE.delete(key);
    return null;
  }
  return entry.price;
}

async function getBondingCurvePriceUSD(tokenMint) {
  const curveData = await readBondingCurveData(tokenMint);
  if (!curveData) {
    throw new Error('Bonding curve data unavailable');
  }

  const realSolReserves = Number(curveData.realSolReserves || 0);
  const realTokenReserves = Number(curveData.realTokenReserves || 0);
  const virtualSolReserves = Number(curveData.virtualSolReserves || 0);
  const virtualTokenReserves = Number(curveData.virtualTokenReserves || 0);

  const totalSolLamports = realSolReserves + virtualSolReserves;
  const totalTokenUnits = realTokenReserves + virtualTokenReserves;

  if (totalSolLamports <= 0 || totalTokenUnits <= 0) {
    throw new Error('Bonding curve reserves are zero');
  }

  const totalSol = totalSolLamports / 1_000_000_000;
  const totalTokens = totalTokenUnits / 1_000_000; // Pump.fun uses 6 decimals

  if (!Number.isFinite(totalSol) || !Number.isFinite(totalTokens) || totalTokens <= 0) {
    throw new Error('Invalid bonding curve reserves');
  }

  const solPerToken = totalSol / totalTokens;
  if (!Number.isFinite(solPerToken) || solPerToken <= 0) {
    throw new Error('Unable to derive curve price');
  }

  const solPriceUsd = await getSolPriceUsdCached();
  if (!Number.isFinite(solPriceUsd) || solPriceUsd <= 0) {
    throw new Error('SOL price unavailable for bonding curve conversion');
  }

  return solPerToken * solPriceUsd;
}

async function deriveLastSellPriceUsd(transactions) {
  if (!Array.isArray(transactions) || !transactions.length) {
    return null;
  }
  let latest = null;
  for (const tx of transactions) {
    if (tx?.type === 'sell' && Number.isFinite(tx?.price) && tx.price > 0) {
      const blockTime = Number(tx.blockTime || 0);
      if (!latest || blockTime > latest.blockTime) {
        latest = { priceSol: tx.price, blockTime };
      }
    }
  }
  if (!latest) {
    return null;
  }
  const solPriceUsd = await getSolPriceUsdCached();
  if (!Number.isFinite(solPriceUsd) || solPriceUsd <= 0) {
    return null;
  }
  const priceUsd = latest.priceSol * solPriceUsd;
  return Number.isFinite(priceUsd) && priceUsd > 0 ? priceUsd : null;
}

/**
 * Get current token price from external API (Helius-optimized)
 * @param {string} tokenMint - Token mint address
 * @returns {Promise<number>} Price in USD (or 0 if not found)
 */
async function getCurrentTokenPrice(tokenMint) {
  const normalizedMint = typeof tokenMint === 'string' ? tokenMint.trim() : '';
  if (!normalizedMint || normalizedMint.toLowerCase() === 'null') {
    throw new Error('Token mint is required for price lookup');
  }

  let realtimeError = null;
  const realtimeState = hsmacMetrics.getTokenState
    ? hsmacMetrics.getTokenState(normalizedMint)
    : null;

  if (realtimeState && Number.isFinite(realtimeState.price) && realtimeState.price > 0) {
    return realtimeState.price;
  }

  try {
    const { price } = await getRealtimePriceUSD(normalizedMint, { preferRealtime: false });
    if (Number.isFinite(price) && price > 0) {
      return price;
    }
    realtimeError = new Error('Price pipeline returned invalid value');
  } catch (error) {
    realtimeError = error instanceof Error ? error : new Error(String(error));
  }

  let bondingCurveError = null;
  try {
    const curvePrice = await getBondingCurvePriceUSD(normalizedMint);
    if (Number.isFinite(curvePrice) && curvePrice > 0) {
      return curvePrice;
    }
  } catch (curveErr) {
    bondingCurveError = curveErr instanceof Error ? curveErr : new Error(String(curveErr));
  }

  const errorParts = [];
  if (realtimeError) {
    errorParts.push(realtimeError.message || 'Realtime price unavailable');
  }
  if (bondingCurveError) {
    errorParts.push(`Bonding curve fallback failed: ${bondingCurveError.message}`);
  }

  const detail = errorParts.length ? errorParts.join(' | ') : 'Unknown error';
  throw new Error(`Failed to resolve current price: ${detail}`);
}

/**
 * Fetch user's transaction history for a token (Helius-optimized)
 * @param {string} walletAddress - Wallet address
 * @param {string} tokenMint - Token mint address
 * @param {number} limit - Max transactions to fetch
 * @returns {Promise<Array>} Array of transactions
 */
async function fetchTokenTransactionHistory(walletAddress, tokenMint, limit = 100) {
  try {
    const conn = getConnection();
    const walletPubkey = new PublicKey(walletAddress);

    const transactions = [];

    // Use Helius enhanced transactions if available
    const useHelius = isHeliusAvailable();
    const effectiveLimit = Math.max(1, Math.min(Number(limit) || 25, 25));

    let heliusHistory = null;
    if (useHelius) {
      try {
        heliusHistory = await getEnhancedTransactionHistory(walletAddress, {
          limit: effectiveLimit,
          commitment: 'confirmed'
        });
      } catch (historyError) {
        console.warn('[PNL] Helius history fetch failed, falling back to per-transaction lookups:', historyError.message);
        heliusHistory = null;
      }
    }

    if (Array.isArray(heliusHistory) && heliusHistory.length) {
      for (const enhancedTx of heliusHistory) {
        try {
          const tokenTransfers = Array.isArray(enhancedTx.tokenTransfers)
            ? enhancedTx.tokenTransfers.filter(t => t?.mint === tokenMint)
            : [];

          if (!tokenTransfers.length) {
            continue;
          }

          let change = 0;

          for (const transfer of tokenTransfers) {
            const decimals =
              typeof transfer.decimals === 'number' && Number.isFinite(transfer.decimals)
                ? transfer.decimals
                : (transfer.tokenAmount && typeof transfer.tokenAmount.decimals === 'number'
                    ? transfer.tokenAmount.decimals
                    : 0);

            const rawAmountCandidate =
              transfer?.tokenAmount?.amount ??
              transfer?.tokenAmount?.raw ??
              transfer?.tokenAmount ??
              transfer?.amount ??
              0;

            const rawAmount = Number(rawAmountCandidate);

            if (!Number.isFinite(rawAmount) || decimals < 0) {
              continue;
            }

            const uiAmount = rawAmount / Math.pow(10, decimals);

            if (transfer.toUserAccount === walletAddress) {
              change += uiAmount;
            }

            if (transfer.fromUserAccount === walletAddress) {
              change -= uiAmount;
            }
          }

          if (change !== 0) {
            let nativeLamportsChange = null;

            if (Array.isArray(enhancedTx.accountBalanceChanges)) {
              const accountChange = enhancedTx.accountBalanceChanges.find(
                (entry) => entry?.account === walletAddress
              );
              if (
                accountChange &&
                typeof accountChange.nativeBalanceChange === 'number' &&
                Number.isFinite(accountChange.nativeBalanceChange)
              ) {
                nativeLamportsChange = accountChange.nativeBalanceChange;
              }
            }

            if (nativeLamportsChange === null && Array.isArray(enhancedTx.nativeTransfers)) {
              let netLamports = 0;
              for (const transfer of enhancedTx.nativeTransfers) {
                const amountLamports = Number(transfer?.amount ?? 0);
                if (!Number.isFinite(amountLamports) || amountLamports === 0) {
                  continue;
                }
                if (transfer?.fromUserAccount === walletAddress) {
                  netLamports -= amountLamports;
                }
                if (transfer?.toUserAccount === walletAddress) {
                  netLamports += amountLamports;
                }
              }
              if (netLamports !== 0) {
                nativeLamportsChange = netLamports;
              }
            }

            const solChange =
              nativeLamportsChange !== null ? lamportsToSol(nativeLamportsChange) : null;

            let unitPrice = null;
            if (solChange !== null && Number.isFinite(solChange) && change !== 0) {
              const spentSol = -solChange;
              const ratio = spentSol / change;
              if (change > 0 && ratio > 0) {
                unitPrice = ratio;
              } else if (change < 0 && solChange > 0) {
                const sellRatio = solChange / Math.abs(change);
                if (sellRatio > 0) {
                  unitPrice = sellRatio;
                }
              }
            }

            transactions.push({
              signature: enhancedTx.signature,
              blockTime: enhancedTx.timestamp || null,
              change,
              type: change > 0 ? 'buy' : 'sell',
              solChange,
              price: unitPrice
            });
          }
        } catch (entryError) {
          console.warn('[PNL] Failed to process Helius enhanced transaction entry:', entryError.message);
          continue;
        }
      }

      console.log(`✅ Processed ${transactions.length} relevant transactions via Helius history (limit ${heliusHistory.length})`);
      return transactions;
    }

    // Fallback: Get transaction signatures (Helius or standard) and fetch individually
    const signatures = await conn.getSignaturesForAddress(walletPubkey, {
      limit: effectiveLimit
    });

    for (const sig of signatures) {
      try {
        let tx;

        if (useHelius) {
          // Use Helius enhanced transaction API
          tx = await getEnhancedTransaction(sig.signature);
        } else {
          // Standard RPC
          tx = await conn.getTransaction(sig.signature, {
            maxSupportedTransactionVersion: 0
          });
        }

        if (!tx || !tx.meta) continue;

        // Check if transaction involves the token
        const preBalances = tx.meta.preTokenBalances || [];
        const postBalances = tx.meta.postTokenBalances || [];

        const relevantBalances = [...preBalances, ...postBalances].filter(
          b => b.mint === tokenMint && b.owner === walletAddress
        );

        if (relevantBalances.length > 0) {
          // This transaction involved the token
          const preAmount = preBalances.find(b => b.mint === tokenMint)?.uiTokenAmount?.uiAmount || 0;
          const postAmount = postBalances.find(b => b.mint === tokenMint)?.uiTokenAmount?.uiAmount || 0;
          const change = postAmount - preAmount;

          let solChange = null;
          try {
            const accountKeys = tx.transaction?.message?.accountKeys || [];
            const walletIndex = accountKeys.findIndex((key) => {
              const keyString = typeof key === 'string' ? key : key?.toBase58?.();
              return keyString === walletAddress;
            });
            if (
              walletIndex >= 0 &&
              Array.isArray(tx.meta?.preBalances) &&
              Array.isArray(tx.meta?.postBalances) &&
              Number.isFinite(tx.meta.preBalances[walletIndex]) &&
              Number.isFinite(tx.meta.postBalances[walletIndex])
            ) {
              const preLamports = tx.meta.preBalances[walletIndex];
              const postLamports = tx.meta.postBalances[walletIndex];
              solChange = lamportsToSol(postLamports - preLamports);
            }
          } catch (nativeError) {
            console.warn('[PNL] Unable to derive SOL change from legacy transaction:', nativeError.message);
          }

          let unitPrice = null;
          if (solChange !== null && Number.isFinite(solChange) && change !== 0) {
            const spentSol = -solChange;
            const ratio = spentSol / change;
            if (change > 0 && ratio > 0) {
              unitPrice = ratio;
            } else if (change < 0 && solChange > 0) {
              const sellRatio = solChange / Math.abs(change);
              if (sellRatio > 0) {
                unitPrice = sellRatio;
              }
            }
          }

          transactions.push({
            signature: sig.signature,
            blockTime: sig.blockTime,
            change,
            type: change > 0 ? 'buy' : change < 0 ? 'sell' : 'transfer',
            solChange,
            price: unitPrice
          });
        }
      } catch (e) {
        // Skip failed transaction fetches
        continue;
      }
    }

    console.log(`✅ Fetched ${transactions.length} transactions ${useHelius ? '(via Helius lookup fallback)' : ''}`);

    return transactions;
  } catch (error) {
    console.error('Error fetching transaction history:', error);
    return [];
  }
}

/**
 * Calculate entry price (Weighted Average Entry Price)
 * @param {Array} transactions - Array of transactions
 * @returns {number} Average entry price
 */
function calculateEntryPrice(transactions) {
  let totalCost = 0;
  let totalTokens = 0;

  for (const tx of transactions) {
    if (tx.type === 'buy' && tx.change > 0) {
      let estimatedPrice = null;

      if (Number.isFinite(tx.price) && tx.price > 0) {
        estimatedPrice = tx.price;
      } else if (Number.isFinite(tx.solChange) && tx.solChange < 0) {
        const impliedPrice = Math.abs(tx.solChange) / tx.change;
        if (Number.isFinite(impliedPrice) && impliedPrice > 0) {
          estimatedPrice = impliedPrice;
        }
      }

      if (Number.isFinite(estimatedPrice) && estimatedPrice > 0) {
        totalCost += tx.change * estimatedPrice;
        totalTokens += tx.change;
      }
    }
  }

  if (totalTokens === 0) return null;

  return totalCost / totalTokens;
}

/**
 * Calculate PNL for a token holding
 * @param {object} params - PNL parameters
 * @returns {Promise<object>} PNL data
 */
async function calculatePNL(params) {
  const {
    walletAddress,
    tokenMint,
    currentBalance,
    currentPrice: currentPriceOverride
  } = params;
  
  try {
    const transactions = await fetchTokenTransactionHistory(walletAddress, tokenMint);
    let cachedLastSellPriceUsd = null;
    try {
      cachedLastSellPriceUsd = await deriveLastSellPriceUsd(transactions);
      if (cachedLastSellPriceUsd) {
        cacheLastSellPrice(walletAddress, tokenMint, cachedLastSellPriceUsd);
      }
    } catch (lastSellErr) {
      console.warn('[PNL] Unable to derive last sell price:', lastSellErr.message);
    }

    let priceError = null;
    let resolvedPrice = Number.isFinite(currentPriceOverride) && currentPriceOverride > 0
      ? currentPriceOverride
      : null;

    if (!resolvedPrice) {
      try {
        resolvedPrice = await getCurrentTokenPrice(tokenMint);
      } catch (error) {
        priceError = error;
      }
    }

    if (!Number.isFinite(resolvedPrice) || resolvedPrice <= 0) {
      const message = priceError?.message || 'Price unavailable';
      console.warn(`[PNL] Price unavailable for ${tokenMint.substring(0, 8)}...: ${message}`);
      const cachedPrice = getCachedLastSellPrice(walletAddress, tokenMint) || cachedLastSellPriceUsd;
      if (Number.isFinite(cachedPrice) && cachedPrice > 0) {
        resolvedPrice = cachedPrice;
      } else {
        return {
          tokenMint,
          currentBalance,
          entryPrice: null,
          currentPrice: null,
          entryValue: 0,
          currentValue: 0,
          pnl: 0,
          pnlPercentage: 0,
          transactionCount: transactions.length,
          entryPriceSource: 'price_unavailable',
          priceUnavailable: true,
          priceError: message
        };
      }
    }

    const entryPriceRaw = calculateEntryPrice(transactions);
    const entryPriceSource = Number.isFinite(entryPriceRaw) && entryPriceRaw > 0 ? 'historical' : 'fallback';
    const entryPrice = entryPriceSource === 'historical' ? entryPriceRaw : resolvedPrice;
    const entryValue = currentBalance * entryPrice;
    const currentValue = currentBalance * resolvedPrice;
    const pnl = currentValue - entryValue;
    const pnlPercentage = entryValue > 0 ? (pnl / entryValue) * 100 : 0;

    return {
      tokenMint,
      currentBalance,
      entryPrice,
      currentPrice: resolvedPrice,
      entryValue,
      currentValue,
      pnl,
      pnlPercentage,
      transactionCount: transactions.length,
      entryPriceSource
    };
  } catch (error) {
    console.error('Error calculating PNL:', error);
    throw error;
  }
}

/**
 * Get PNL for all token holdings
 * @param {string} walletAddress - Wallet address
 * @returns {Promise<Array>} Array of PNL data for each token
 */
async function getAllTokensPNL(walletAddress) {
  try {
    // Get all token accounts
    const tokenAccounts = await getTokenAccounts(walletAddress);
    
    const pnlData = [];
    
    for (const account of tokenAccounts) {
      if (account.uiAmount && account.uiAmount > 0) {
        try {
          const pnl = await calculatePNL({
            walletAddress,
            tokenMint: account.mint,
            currentBalance: account.uiAmount
          });
          
          pnlData.push(pnl);
        } catch (e) {
          console.error(`Error calculating PNL for ${account.mint}:`, e);
        }
      }
    }
    
    return pnlData;
  } catch (error) {
    console.error('Error getting all tokens PNL:', error);
    throw error;
  }
}

async function calculateGroupROI({ walletAddresses = [], tokenMint, currentPrice = null, freshBalanceMap = null }) {
  if (!Array.isArray(walletAddresses) || walletAddresses.length === 0) {
    return {
      walletCount: 0,
      totalEntryValue: 0,
      totalCurrentValue: 0,
      roiPercentage: null,
      totalTokenBalance: 0,
      breakdown: [],
      usedPrice: currentPrice || 0
    };
  }

  if (!tokenMint) {
    throw new Error('tokenMint is required for ROI calculation');
  }

  const normalizedWallets = walletAddresses.filter(Boolean);

  let resolvedPrice = Number.isFinite(currentPrice) && currentPrice > 0 ? currentPrice : null;
  let priceResolutionError = null;
  if (!resolvedPrice) {
    const realtimeState = hsmacMetrics.getTokenState ? hsmacMetrics.getTokenState(tokenMint) : null;
    if (realtimeState && Number.isFinite(realtimeState.price) && realtimeState.price > 0) {
      resolvedPrice = realtimeState.price;
    }
  }

  if (!Number.isFinite(resolvedPrice) || resolvedPrice <= 0) {
    try {
      resolvedPrice = await getCurrentTokenPrice(tokenMint);
    } catch (error) {
      priceResolutionError = error;
    }
  }

  if (!Number.isFinite(resolvedPrice) || resolvedPrice <= 0) {
    for (const address of normalizedWallets) {
      const cachedPrice = getCachedLastSellPrice(address, tokenMint);
      if (Number.isFinite(cachedPrice) && cachedPrice > 0) {
        resolvedPrice = cachedPrice;
        break;
      }
    }
  }

  if (!Number.isFinite(resolvedPrice) || resolvedPrice <= 0) {
    const message = priceResolutionError?.message || 'Price unavailable';
    console.warn(`[PNL] Group ROI price unavailable for ${tokenMint.substring(0, 8)}...: ${message}`);
    return {
      walletCount: 0,
      totalEntryValue: 0,
      totalCurrentValue: 0,
      roiPercentage: 0,
      totalTokenBalance: 0,
      breakdown: [],
      usedPrice: null,
      freshWallets: 0,
      fallbackWallets: 0,
      omittedWallets: normalizedWallets.length,
      fallbackEntryPriceCount: 0,
      attemptedWallets: normalizedWallets.length,
      usedFreshBalances: false,
      priceUnavailable: true,
      priceUnavailableWallets: 0,
      priceErrors: [message]
    };
  }

  const breakdown = [];
  let totalTokenBalance = 0;
  const useFreshBalances = freshBalanceMap && freshBalanceMap instanceof Map && freshBalanceMap.size > 0;
  let freshWallets = 0;
  let fallbackWallets = 0;
  let omittedWallets = 0;
  let fallbackEntryPriceCount = 0;
  let priceUnavailableWallets = 0;
  const priceErrors = new Set();

  if (useFreshBalances) {
    const freshCount = Array.from(freshBalanceMap.values()).filter(r => r.tokenAccount !== null).length;
    console.log(`[PNL] ✅ Using ${freshCount} fresh balances from dashboard (bypassing cache) for ROI calculation`);
  } else {
    console.log('[PNL] ⚠️ No fresh balances provided, fetching from RPC (may use cached data)');
  }

  for (const address of normalizedWallets) {
    try {
      let tokenAccount = null;
      
      // Use fresh balance if available
      if (useFreshBalances && freshBalanceMap.has(address)) {
        const freshData = freshBalanceMap.get(address);
        if (freshData && freshData.tokenAccount) {
          tokenAccount = freshData.tokenAccount;
          console.log(`[PNL] ✅ Using FRESH balance for ${address.substring(0, 8)}...: ${tokenAccount.uiAmount} tokens`);
          freshWallets += 1;
        } else {
          // Fresh balance map says no balance - skip without RPC call
          omittedWallets += 1;
          continue;
        }
      } else if (!useFreshBalances) {
        // Only fetch from RPC if we weren't given fresh balances
        const balanceInfo = await getTokenBalance(address, tokenMint);
        if (balanceInfo && balanceInfo.uiAmount !== null) {
          tokenAccount = {
            uiAmount: balanceInfo.uiAmount,
            mint: tokenMint
          };
          fallbackWallets += 1;
        }
      } else {
        // Fresh balance map doesn't have this wallet - skip
        omittedWallets += 1;
        continue;
      }
      
      if (!tokenAccount || !tokenAccount.uiAmount || tokenAccount.uiAmount <= 0) {
        omittedWallets += 1;
        continue;
      }

      const tokenBalance = tokenAccount.uiAmount || 0;

      const pnl = await calculatePNL({
        walletAddress: address,
        tokenMint,
        currentBalance: tokenAccount.uiAmount,
        currentPrice: resolvedPrice
      });
      if (pnl && pnl.priceUnavailable) {
        priceUnavailableWallets += 1;
        if (pnl.priceError) {
          priceErrors.add(pnl.priceError);
        }
        breakdown.push({
          walletAddress: address,
          tokenBalance,
          entryValue: 0,
          currentValue: 0,
          pnl: 0,
          pnlPercentage: 0,
          entryPriceSource: 'price_unavailable',
          priceUnavailable: true
        });
        continue;
      }

      totalTokenBalance += tokenBalance;

      const usedFallbackPrice = pnl.entryPriceSource !== 'historical';
      if (usedFallbackPrice) {
        fallbackEntryPriceCount += 1;
      }

      breakdown.push({
        walletAddress: address,
        tokenBalance,
        entryValue: pnl.entryValue,
        currentValue: pnl.currentValue,
        pnl: pnl.pnl,
        pnlPercentage: pnl.pnlPercentage,
        entryPriceSource: pnl.entryPriceSource
      });
    } catch (error) {
      console.error('[PNL] ROI calculation error for wallet', address, error.message);
    }
  }

  const totalEntryValue = breakdown.reduce((sum, item) => sum + item.entryValue, 0);
  const totalCurrentValue = breakdown.reduce((sum, item) => sum + item.currentValue, 0);
  const roiPercentage = totalEntryValue > 0
    ? ((totalCurrentValue - totalEntryValue) / totalEntryValue) * 100
    : null;

  return {
    walletCount: breakdown.length,
    totalEntryValue,
    totalCurrentValue,
    roiPercentage,
    totalTokenBalance,
    breakdown,
    usedPrice: resolvedPrice,
    freshWallets,
    fallbackWallets,
    omittedWallets,
    fallbackEntryPriceCount,
    attemptedWallets: normalizedWallets.length,
    usedFreshBalances: freshWallets > 0,
    priceUnavailable: priceUnavailableWallets > 0,
    priceUnavailableWallets,
    priceErrors: priceErrors.size ? Array.from(priceErrors) : undefined
  };
}

/**
 * Format PNL data for display
 * @param {object} pnlData - PNL data
 * @returns {string} Formatted string
 */
function formatPNLDisplay(pnlData) {
  if (pnlData?.priceUnavailable) {
    const mint = typeof pnlData.tokenMint === 'string'
      ? `${pnlData.tokenMint.substring(0, 8)}...`
      : 'unknown';
    const reason = pnlData.priceError || 'Price data unavailable';
    return [
      '⚠️ *PNL Unavailable*',
      '',
      `Mint: \`${mint}\``,
      `Reason: ${reason}`
    ].join('\n');
  }

  const {
    currentBalance,
    entryPrice,
    currentPrice,
    pnl,
    pnlPercentage
  } = pnlData;
  
  const pnlSign = pnl >= 0 ? '+' : '';
  const pnlEmoji = pnl >= 0 ? '📈' : '📉';
  
  let display = `${pnlEmoji} *PNL Summary*\n\n`;
  display += `Balance: ${currentBalance.toFixed(4)}\n`;
  display += `Entry Price: $${entryPrice.toFixed(6)}\n`;
  display += `Current Price: $${currentPrice.toFixed(6)}\n\n`;
  display += `*PNL: ${pnlSign}$${pnl.toFixed(2)} (${pnlSign}${pnlPercentage.toFixed(2)}%)*`;
  
  return display;
}

/**
 * Save entry transaction for future PNL tracking
 * @param {object} params - Transaction params
 */
function saveEntryTransaction(params) {
  const {
    userId,
    tokenMint,
    amount,
    price,
    signature
  } = params;
  
  try {
    // Could be stored in database for more accurate tracking
    db.saveTransaction(userId, signature, 'buy');
  } catch (error) {
    console.error('Error saving entry transaction:', error);
  }
}

module.exports = {
  getCurrentTokenPrice,
  fetchTokenTransactionHistory,
  calculateEntryPrice,
  calculatePNL,
  getAllTokensPNL,
  calculateGroupROI,
  formatPNLDisplay,
  saveEntryTransaction
};

