/**
 * Jupiter Swap Integration Module
 * Complete DEX aggregator integration for token swaps
 * 
 * Jupiter V6 Swap API provides:
 * - Best price routing across all Solana DEXs
 * - Slippage protection
 * - Direct swap execution
 * - No SDK needed - pure API calls
 */

const axios = require('axios');
const { VersionedTransaction, PublicKey } = require('@solana/web3.js');
const { getConnection, sendAndConfirmTransactionWithRetry } = require('./solana_utils');
const { loadWalletFromDatabase } = require('./wallets');
const db = require('./db');
const { getUserPriorityFeeForJupiter } = require('./fees');

// Jupiter API endpoints
const JUPITER_API_BASE = process.env.JUPITER_API_BASE || 'https://quote-api.jup.ag/v6';
const PRIMARY_JUPITER_QUOTE_BASE = JUPITER_API_BASE;
const DEFAULT_JUPITER_QUOTE_FALLBACKS = [
  'https://jupiter-router.mngo.cloud/v6',
  'https://quote.jup.ag/v6'
];
const JUPITER_QUOTE_ENDPOINTS = Array.from(
  new Set(
    [PRIMARY_JUPITER_QUOTE_BASE, ...(process.env.JUPITER_API_FALLBACKS || '')
      .split(',')
      .map((value) => value && value.trim())
      .filter(Boolean), ...DEFAULT_JUPITER_QUOTE_FALLBACKS]
      .map((url) => (url || '').replace(/\/+$/, ''))
      .filter(Boolean)
  )
);
const JUPITER_PRICE_API = 'https://price.jup.ag/v4';
const JUPITER_PRICE_FALLBACK_API = 'https://lite-api.jup.ag/price/v3';
const JUPITER_QUOTE_TIMEOUT_MS = Number(process.env.JUPITER_QUOTE_TIMEOUT_MS) > 0
  ? Number(process.env.JUPITER_QUOTE_TIMEOUT_MS)
  : 8000;

/**
 * Get quote for a swap
 * @param {object} params - Quote parameters
 * @returns {Promise<object>} Quote data
 */
async function getSwapQuote(params) {
  const {
    inputMint,
    outputMint,
    amount,
    slippageBps = 50 // 0.5% default slippage
  } = params;
  
  const errors = [];

  for (const base of JUPITER_QUOTE_ENDPOINTS) {
    const url = `${base}/quote`;
    try {
      const response = await axios.get(url, {
        params: {
          inputMint,
          outputMint,
          amount,
          slippageBps,
          onlyDirectRoutes: false,
          asLegacyTransaction: false
        },
        timeout: JUPITER_QUOTE_TIMEOUT_MS
      });

      if (!response.data || response.data.error) {
        const message = response.data?.error || 'Failed to get quote';
        throw new Error(message);
      }

      const quote = response.data;
      return {
        inputMint: quote.inputMint,
        outputMint: quote.outputMint,
        inAmount: quote.inAmount,
        outAmount: quote.outAmount,
        otherAmountThreshold: quote.otherAmountThreshold,
        swapMode: quote.swapMode,
        slippageBps: quote.slippageBps,
        priceImpactPct: quote.priceImpactPct,
        routePlan: quote.routePlan,
        timestamp: Date.now()
      };
    } catch (error) {
      const reason = error?.message || 'Unknown error';
      errors.push(`[${base}] ${reason}`);
      continue;
    }
  }

  console.error('[JUPITER] All quote endpoints failed:', errors.join('; '));
  throw new Error(`Failed to get swap quote: ${errors.join('; ')}`);
}

/**
 * Execute swap transaction
 * @param {object} params - Swap parameters
 * @returns {Promise<string>} Transaction signature
 */
async function executeSwap(params) {
  const {
    walletId,
    quote,
    priorityFee = 'auto', // auto, low, medium, high, or specific microlamports
    userId: explicitUserId,
    computeUnits: computeUnitsOverride
  } = params;
  
  try {
    const conn = getConnection();
    const userKeypair = loadWalletFromDatabase(walletId);
    
    if (!userKeypair) {
      throw new Error('Wallet not found');
    }

    const walletRecord = db.getWalletById ? db.getWalletById(walletId) : null;
    const resolvedUserId = explicitUserId || walletRecord?.user_id || null;
    const computeUnitsHint = computeUnitsOverride
      || quote?.computeUnitLimit
      || quote?.computeEstimatedUnits
      || quote?.computeUnitEstimate
      || 600000;
    
    // Validate quote freshness (30 second max age)
    if (quote.timestamp) {
      const age = Date.now() - quote.timestamp;
      if (age > 30000) {
        throw new Error(`Quote is stale (${Math.floor(age/1000)}s old). Get a fresh quote.`);
      }
      console.log(`✓ Quote age: ${Math.floor(age/1000)}s`);
    }
    
    console.log(`🔄 Executing swap via Jupiter...`);
    console.log(`   Input: ${quote.inAmount} of ${quote.inputMint}`);
    console.log(`   Expected Output: ${quote.outAmount} of ${quote.outputMint}`);
    console.log(`   Price Impact: ${quote.priceImpactPct}%`);
    
    // Get swap transaction from Jupiter API (V6 format)
    const swapRequest = {
      quoteResponse: quote,
      userPublicKey: userKeypair.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      useSharedAccounts: true,
      asLegacyTransaction: false,
      dynamicComputeUnitLimit: true,
      skipUserAccountsRpcCalls: false
    };
    
    // Jupiter V6 uses simplified priority fee format
    let prioritizationFeeSetting = 'auto';

    if (priorityFee !== 'auto' && typeof priorityFee === 'number') {
      prioritizationFeeSetting = priorityFee;
    } else if (priorityFee === 'high' || priorityFee === 'medium' || priorityFee === 'low') {
      const feeLamports = priorityFee === 'high' ? 100000 : priorityFee === 'medium' ? 50000 : 10000;
      prioritizationFeeSetting = feeLamports;
    } else if (resolvedUserId) {
      try {
        const priorityConfig = await getUserPriorityFeeForJupiter(resolvedUserId, computeUnitsHint);
        prioritizationFeeSetting = priorityConfig.prioritizationFeeLamports;
        console.log(`   Priority fee (user ${resolvedUserId}): ${priorityConfig.lamports} lamports (level: ${priorityConfig.level})`);
      } catch (priorityError) {
        console.warn('[SWAP] Falling back to auto priority fee:', priorityError.message);
        prioritizationFeeSetting = 'auto';
      }
    }

    swapRequest.prioritizationFeeLamports = prioritizationFeeSetting;
    
    const swapResponse = await axios.post(`${PRIMARY_JUPITER_QUOTE_BASE}/swap`, swapRequest);
    
    if (!swapResponse.data || swapResponse.data.error) {
      throw new Error(swapResponse.data?.error || 'Failed to get swap transaction');
    }
    
    // Deserialize the transaction
    const swapTransactionBuf = Buffer.from(swapResponse.data.swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
    
    // Sign the transaction
    transaction.sign([userKeypair]);
    
    // Send transaction
    const signature = await conn.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      maxRetries: 3
    });
    
    console.log(`⏳ Confirming swap transaction: ${signature}`);
    
    // Confirm transaction with timeout
    const { confirmTransactionWithTimeout } = require('./confirmation_wrapper');
    const latestBlockhash = await conn.getLatestBlockhash();
    await confirmTransactionWithTimeout(conn, signature, latestBlockhash, 60000);
    
    console.log(`✅ Swap executed successfully: ${signature}`);
    
    return signature;
  } catch (error) {
    console.error('Error executing swap:', error);
    throw new Error(`Swap failed: ${error.message}`);
  }
}

/**
 * Sell tokens for SOL (convenience wrapper)
 * @param {object} params - Sell parameters
 * @returns {Promise<string>} Transaction signature
 */
async function sellTokenForSOL(params) {
  const {
    walletId,
    tokenMint,
    tokenAmount,
    slippageBps: providedSlippageBps,
    slippage,
    userId
  } = params;
  
  try {
    // WSOL mint (wrapped SOL)
    const WSOL_MINT = 'So11111111111111111111111111111111111111112';

    let amountRaw;
    if (typeof tokenAmount === 'bigint') {
      amountRaw = tokenAmount.toString();
    } else if (typeof tokenAmount === 'string') {
      amountRaw = tokenAmount;
    } else if (typeof tokenAmount === 'number') {
      if (!Number.isFinite(tokenAmount) || tokenAmount <= 0) {
        throw new Error('Invalid token amount');
      }
      amountRaw = Math.floor(tokenAmount).toString();
    } else {
      throw new Error('Unsupported token amount format');
    }

    const resolvedSlippageBps = Number.isFinite(providedSlippageBps)
      ? providedSlippageBps
      : Number.isFinite(slippage)
        ? Math.max(1, Math.round(Number(slippage) * 100))
        : 50;
    
    // Get quote
    const quote = await getSwapQuote({
      inputMint: tokenMint,
      outputMint: WSOL_MINT,
      amount: amountRaw,
      slippageBps: resolvedSlippageBps
    });
    
    // Execute swap
    const signature = await executeSwap({
      walletId,
      quote,
      priorityFee: 'auto',
      userId
    });
    
    return signature;
  } catch (error) {
    console.error('Error selling token:', error);
    throw error;
  }
}

/**
 * Buy tokens with SOL (convenience wrapper)
 * @param {object} params - Buy parameters
 * @returns {Promise<string>} Transaction signature
 */
async function buyTokenWithSOL(params) {
  const {
    walletId,
    tokenMint,
    solAmount,
    slippageBps: providedSlippageBps,
    slippage,
    userId
  } = params;
  
  try {
    const SOL_LAMPORTS = 1_000_000_000n;

    const normalizeSolAmount = (amount) => {
      if (typeof amount === 'bigint') {
        return amount;
      }
      if (typeof amount === 'string') {
        if (!amount.trim()) {
          throw new Error('SOL amount cannot be empty');
        }
        if (amount.includes('.')) {
          const numeric = Number(amount);
          if (!Number.isFinite(numeric) || numeric <= 0) {
            throw new Error('Invalid SOL amount');
          }
          return BigInt(Math.round(numeric * Number(SOL_LAMPORTS)));
        }
        return BigInt(amount);
      }
      if (typeof amount === 'number') {
        if (!Number.isFinite(amount) || amount <= 0) {
          throw new Error('Invalid SOL amount');
        }
        if (Number.isInteger(amount) && amount >= 10_000_000) {
          return BigInt(Math.round(amount));
        }
        return BigInt(Math.round(amount * Number(SOL_LAMPORTS)));
      }
      throw new Error('Unsupported SOL amount format');
    };

    const lamportsBigInt = normalizeSolAmount(solAmount);
    if (lamportsBigInt <= 0n) {
      throw new Error('SOL amount must be greater than 0');
    }

    if (lamportsBigInt > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('SOL amount exceeds supported range');
    }

    const lamportsNumeric = Number(lamportsBigInt);

    // Validate balance BEFORE attempting swap
    const { loadWalletFromDatabase } = require('./wallets');
    const { requireSolBalance } = require('./balance_validator');
    
    const userKeypair = loadWalletFromDatabase(walletId);
    await requireSolBalance(userKeypair.publicKey.toBase58(), lamportsNumeric, 100000);
    
    // WSOL mint (wrapped SOL)
    const WSOL_MINT = 'So11111111111111111111111111111111111111112';
    
    const resolvedSlippageBps = Number.isFinite(providedSlippageBps)
      ? providedSlippageBps
      : Number.isFinite(slippage)
        ? Math.max(1, Math.round(Number(slippage) * 100))
        : 50;
    
    // Get quote (SOL → Token)
    const quote = await getSwapQuote({
      inputMint: WSOL_MINT,
      outputMint: tokenMint,
      amount: lamportsBigInt.toString(),
      slippageBps: resolvedSlippageBps
    });
    
    // Execute swap
    const signature = await executeSwap({
      walletId,
      quote,
      priorityFee: 'auto',
      userId
    });
    
    return signature;
  } catch (error) {
    console.error('Error buying token:', error);
    throw error;
  }
}

/**
 * Get current token price from Jupiter
 * @param {string} tokenMint - Token mint address
 * @returns {Promise<number>} Price in USD
 */
async function getJupiterPrice(tokenMint) {
  if (!tokenMint) {
    return 0;
  }

  const endpoints = [
    {
      url: `${JUPITER_PRICE_API}/price`,
      params: { ids: tokenMint },
      extract: (data) => data?.data?.[tokenMint]?.price
    },
    {
      url: JUPITER_PRICE_FALLBACK_API,
      params: { ids: tokenMint },
      extract: (data) => data?.[tokenMint]?.usdPrice
    }
  ];

  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      const response = await axios.get(endpoint.url, {
        params: endpoint.params,
        timeout: 5000
      });

      const price = endpoint.extract(response.data);
      if (typeof price === 'number' && price > 0) {
        return price;
      }

      // Keep searching other endpoints if available
    } catch (error) {
      lastError = error;
      continue;
    }
  }

  if (lastError) {
    console.warn(`[JUPITER PRICE] Unable to fetch price for ${tokenMint}: ${lastError.message}`);
  }

  return 0;
}

/**
 * Create multi-wallet swap bundle for Smart Profit
 * @param {Array} swapParams - Array of swap parameters for each wallet
 * @returns {Promise<Array>} Array of signed transactions
 */
async function createMultiWalletSwapBundle(swapParams, options = {}) {
  const transactions = [];
  const errors = [];
  const { userId: defaultUserId } = options;
  let sharedPriorityConfig = null;
  if (defaultUserId) {
    try {
      sharedPriorityConfig = await getUserPriorityFeeForJupiter(defaultUserId);
    } catch (error) {
      console.warn('[BUNDLE] Unable to resolve user priority fee, using auto:', error.message);
      sharedPriorityConfig = null;
    }
  }
  
  try {
    for (const params of swapParams.slice(0, 5)) { // Max 5 for Jito bundle
      const { walletId, quote, userId: entryUserId, priorityFee: entryPriorityFee } = params;
      
      try {
        // Get user keypair
        const userKeypair = loadWalletFromDatabase(walletId);
        
        if (!userKeypair) {
          throw new Error(`Wallet ${walletId} not found`);
        }
        
        // Get swap transaction from Jupiter
        let prioritizationSetting = 'auto';
        if (entryPriorityFee !== undefined) {
          prioritizationSetting = entryPriorityFee;
        } else if (entryUserId) {
          try {
            const entryConfig = await getUserPriorityFeeForJupiter(entryUserId);
            prioritizationSetting = entryConfig.prioritizationFeeLamports;
          } catch (priorityError) {
            console.warn('[BUNDLE] Falling back to default priority fee:', priorityError.message);
            prioritizationSetting = sharedPriorityConfig?.prioritizationFeeLamports || 'auto';
          }
        } else if (sharedPriorityConfig) {
          prioritizationSetting = sharedPriorityConfig.prioritizationFeeLamports;
        }

        const swapResponse = await axios.post(`${JUPITER_API_BASE}/swap`, {
          quoteResponse: quote,
          userPublicKey: userKeypair.publicKey.toBase58(),
          wrapAndUnwrapSol: true,
          useSharedAccounts: true,
          prioritizationFeeLamports: prioritizationSetting,
          asLegacyTransaction: false,
          dynamicComputeUnitLimit: true
        });
        
        if (!swapResponse.data || swapResponse.data.error) {
          throw new Error(`Failed to get swap tx: ${swapResponse.data?.error || 'Unknown error'}`);
        }
        
        // Deserialize and sign
        const swapTransactionBuf = Buffer.from(swapResponse.data.swapTransaction, 'base64');
        const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
        transaction.sign([userKeypair]);
        
        transactions.push(transaction);
        
      } catch (walletError) {
        errors.push({ walletId, error: walletError.message });
        console.error(`Failed to prepare swap for wallet ${walletId}:`, walletError.message);
      }
    }
    
    // Validate that we have at least some successful transactions
    if (transactions.length === 0) {
      throw new Error(`Failed to create any valid swap transactions. Errors: ${JSON.stringify(errors)}`);
    }
    
    if (errors.length > 0) {
      console.warn(`⚠️ Created ${transactions.length} transactions with ${errors.length} failures`);
    }
    
    return transactions;
  } catch (error) {
    console.error('Error creating multi-wallet swap bundle:', error);
    throw error;
  }
}

/**
 * Validate swap parameters
 * @param {object} params - Swap parameters
 * @returns {object} Validation result
 */
function validateSwapParams(params) {
  const { inputMint, outputMint, amount } = params;
  
  const errors = [];
  
  if (!inputMint || inputMint.length < 32) {
    errors.push('Invalid input mint address');
  }
  
  if (!outputMint || outputMint.length < 32) {
    errors.push('Invalid output mint address');
  }
  
  if (!amount || amount <= 0) {
    errors.push('Amount must be greater than 0');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  getSwapQuote,
  executeSwap,
  sellTokenForSOL,
  buyTokenWithSOL,
  getJupiterPrice,
  createMultiWalletSwapBundle,
  validateSwapParams,
  JUPITER_API_BASE,
  JUPITER_PRICE_API,
  JUPITER_PRICE_FALLBACK_API
};

