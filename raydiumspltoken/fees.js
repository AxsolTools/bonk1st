/**
 * Fee Collection and Priority Fee Module
 * Handles developer fee collection and priority fee management
 */

const { SystemProgram, Transaction, ComputeBudgetProgram } = require('@solana/web3.js');
const { PublicKey } = require('@solana/web3.js');
const {  getConnection, solToLamports, lamportsToSol, getPriorityFees, sendAndConfirmTransactionWithRetry } = require('./solana_utils');
const { getActiveWalletKeypair } = require('./wallets');
const { getUserSettings } = require('./db');
const { handleError } = require('./errors');

// Lazy load referral manager to avoid circular dependency
let _referralManager = null;
function getReferralManager() {
  if (!_referralManager) {
    try {
      const { referralManager } = require('./services/ReferralManager');
      _referralManager = referralManager;
    } catch (err) {
      console.warn('[FEES] Referral manager not available:', err.message);
    }
  }
  return _referralManager;
}

// Fee configuration from environment
const FEE_CONFIG = {
  developerFeeRecipient: process.env.DEVELOPER_FEE_RECIPIENT_ADDRESS,
  // Platform-specific fees
  pumpfunCreation: solToLamports(process.env.FEE_PUMPFUN_CREATION_SOL || 0.001),
  raydiumCreation: solToLamports(process.env.FEE_RAYDIUM_CREATION_SOL || 0.001),
  raydiumPool: solToLamports(process.env.FEE_RAYDIUM_POOL_SOL || 0.0005),
  // Generic fees (backwards compatible)
  tokenCreation: solToLamports(process.env.FEE_TOKEN_CREATION_SOL || 0.001),
  addLiquidity: solToLamports(process.env.FEE_ADD_LIQUIDITY_SOL || 0.0005),
  removeLiquidity: solToLamports(process.env.FEE_REMOVE_LIQUIDITY_SOL || 0.0005),
  tokenSwap: solToLamports(process.env.FEE_TOKEN_SWAP_SOL || 0.0003),
  walletManagement: solToLamports(process.env.FEE_WALLET_MANAGEMENT_SOL || 0)
};

/**
 * Get fee amount for operation type
 * @param {string} operationType - Type of operation
 * @returns {number} Fee in lamports
 */
function getFeeAmount(operationType) {
  const feeMap = {
    // Platform-specific (preferred)
    'pumpfun_creation': FEE_CONFIG.pumpfunCreation,
    'raydium_creation': FEE_CONFIG.raydiumCreation,
    'raydium_pool': FEE_CONFIG.raydiumPool,
    // Generic (backwards compatible)
    'create_token': FEE_CONFIG.tokenCreation,
    'add_liquidity': FEE_CONFIG.addLiquidity,
    'remove_liquidity': FEE_CONFIG.removeLiquidity,
    'token_swap': FEE_CONFIG.tokenSwap,
    'wallet_management': FEE_CONFIG.walletManagement
  };
  
  const feeAmount = feeMap[operationType] || 0;
  
  // Return 0 if fee is not configured or set to 0 (don't break)
  return feeAmount > 0 ? feeAmount : 0;
}

/**
 * Get priority fee based on user settings
 * @param {number} userId - User ID
 * @returns {Promise<number>} Priority fee in micro-lamports per CU
 */
async function getUserPriorityFeeDetails(userId) {
  try {
    const settings = getUserSettings(userId);
    const priorityFees = await getPriorityFees();

    const level = settings.priority_fee_level || 'medium';
    let microLamports;

    switch (level) {
      case 'high':
        microLamports = priorityFees.high;
        break;
      case 'medium':
        microLamports = priorityFees.medium;
        break;
      case 'low':
        microLamports = priorityFees.low;
        break;
      case 'min':
        microLamports = priorityFees.min || priorityFees.low || priorityFees.medium;
        break;
      case 'custom': {
        const custom = Number(settings.custom_priority_fee);
        microLamports = Number.isFinite(custom) && custom > 0 ? custom : priorityFees.medium;
        break;
      }
      default:
        microLamports = priorityFees.recommended || priorityFees.medium;
    }

    if (!Number.isFinite(microLamports) || microLamports <= 0) {
      const minPriority = Number(process.env.MIN_PRIORITY_FEE_MICROLAMPORTS || '5000');
      microLamports = priorityFees.recommended || priorityFees.medium || minPriority;
    }

    return {
      microLamports,
      level,
      settings,
      fees: priorityFees
    };
  } catch (error) {
    console.error('Error resolving user priority fee details:', error);
    return {
      microLamports: 5000,
      level: 'medium',
      settings: getUserSettings(userId),
      fees: await getPriorityFees().catch(() => ({}))
    };
  }
}

async function getUserPriorityFee(userId) {
  const details = await getUserPriorityFeeDetails(userId);
  return details.microLamports;
}

async function getUserPriorityFeeLamports(userId, fallbackComputeUnits = 600000) {
  const details = await getUserPriorityFeeDetails(userId);
  const computeUnits = details?.fees?.costs?.swap?.computeUnits || fallbackComputeUnits;
  const lamports = Math.max(1, Math.ceil((details.microLamports * computeUnits) / 1_000_000));
  return {
    lamports,
    microLamports: details.microLamports,
    computeUnits
  };
}

async function getUserPriorityFeeForJupiter(userId, fallbackComputeUnits = 600000) {
  const details = await getUserPriorityFeeDetails(userId);
  const computeUnits = details?.fees?.costs?.swap?.computeUnits || fallbackComputeUnits;
  const lamports = Math.max(1, Math.ceil((details.microLamports * computeUnits) / 1_000_000));

  const levelMap = {
    high: 'veryHigh',
    medium: 'medium',
    low: 'medium',
    min: 'medium'
  };

  let prioritizationFeeLamports;

  if (details.level === 'custom') {
    prioritizationFeeLamports = lamports;
  } else {
    const priorityLevel = levelMap[details.level] || 'medium';
    prioritizationFeeLamports = {
      priorityLevelWithMaxLamports: {
        maxLamports: lamports,
        global: false,
        priorityLevel
      }
    };
  }

  return {
    ...details,
    lamports,
    prioritizationFeeLamports,
    computeUnits
  };
}

/**
 * Add priority fee instructions to transaction
 * @param {Transaction} transaction - Transaction object
 * @param {number} priorityFee - Priority fee in micro-lamports per CU
 * @param {number} computeUnits - Compute units (optional)
 * @returns {Transaction} Transaction with priority fee instructions
 */
function addPriorityFeeToTransaction(transaction, priorityFee, computeUnits = 200000) {
  if (priorityFee > 0) {
    // Set compute unit limit
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({
        units: computeUnits
      })
    );
    
    // Set compute unit price
    transaction.add(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: priorityFee
      })
    );
  }
  
  return transaction;
}

/**
 * Check if user has sufficient balance for fee + transaction
 * @param {string} walletAddress - Wallet address
 * @param {number} feeAmount - Fee amount in lamports
 * @param {number} transactionCost - Estimated transaction cost in lamports
 * @returns {Promise<object>} { sufficient: boolean, balance: number, required: number }
 */
async function checkSufficientBalance(walletAddress, feeAmount, transactionCost = 10000) {
  try {
    const conn = getConnection();
    const publicKey = new PublicKey(walletAddress);
    const balance = await conn.getBalance(publicKey);
    
    const required = feeAmount + transactionCost;
    const sufficient = balance >= required;
    
    return {
      sufficient,
      balance,
      required,
      balanceSol: lamportsToSol(balance),
      requiredSol: lamportsToSol(required)
    };
  } catch (error) {
    console.error('Error checking balance:', error);
    throw error;
  }
}

/**
 * Transfer developer fee from user wallet
 * @param {number} userId - User ID
 * @param {number} feeAmount - Fee amount in lamports
 * @param {string} operationType - Type of operation (for logging)
 * @returns {Promise<string>} Transaction signature
 */
async function collectDeveloperFee(userId, feeAmount, operationType) {
  try {
    // Skip if no recipient configured (don't break)
    if (!FEE_CONFIG.developerFeeRecipient) {
      console.log('⚠️ Developer fee recipient not configured, skipping fee collection');
      return null;
    }
    
    // Skip if fee is zero or negative (don't break)
    if (feeAmount <= 0) {
      console.log(`⚠️ Fee amount is ${feeAmount}, skipping fee collection for ${operationType}`);
      return null;
    }
    
    // Get user's active wallet
    const userKeypair = getActiveWalletKeypair(userId);
    if (!userKeypair) {
      // For wallet_management operations, skip fee if no active wallet (wallet was just created)
      if (operationType === 'wallet_management') {
        console.log('⚠️ No active wallet found after wallet creation, skipping fee collection');
        return null;
      }
      throw new Error('No active wallet found. Please create or import a wallet first.');
    }
    
    const userAddress = userKeypair.publicKey.toBase58();
    
    // Check balance
    const balanceCheck = await checkSufficientBalance(userAddress, feeAmount, 10000);
    if (!balanceCheck.sufficient) {
      throw new Error(
        `Insufficient balance. You need ${balanceCheck.requiredSol.toFixed(4)} SOL ` +
        `(${lamportsToSol(feeAmount).toFixed(4)} SOL fee + transaction costs) ` +
        `but only have ${balanceCheck.balanceSol.toFixed(4)} SOL.`
      );
    }
    
    // Check for referral fee split
    let devShareLamports = feeAmount;
    let referrerShareSol = 0;
    let referrerId = null;
    
    const refManager = getReferralManager();
    if (refManager && refManager.isEnabled()) {
      referrerId = refManager.getReferrer(userId);
      if (referrerId) {
        // Calculate referrer share
        const feeSol = lamportsToSol(feeAmount);
        referrerShareSol = refManager.calculateReferrerShare(feeSol);
        const devShareSol = feeSol - referrerShareSol;
        devShareLamports = solToLamports(devShareSol);
        
        console.log(`[REFERRAL SPLIT] Fee: ${feeSol} SOL | Dev: ${devShareSol.toFixed(6)} SOL | Referrer: ${referrerShareSol.toFixed(6)} SOL`);
      }
    }
    
    // Create transfer transaction
    const conn = getConnection();
    const transaction = new Transaction();
    
    // Add priority fee FIRST (ComputeBudget instructions must be first in transaction)
    const priorityFee = await getUserPriorityFee(userId);
    addPriorityFeeToTransaction(transaction, priorityFee, 200000); // Standard CU limit for transfer
    
    // Add transfer instruction AFTER compute budget (dev share only if referral split, else full fee)
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: userKeypair.publicKey,
        toPubkey: new PublicKey(FEE_CONFIG.developerFeeRecipient),
        lamports: devShareLamports
      })
    );
    
    // Send and confirm
    const signature = await sendAndConfirmTransactionWithRetry(transaction, [userKeypair], {
      skipPreflight: false,
      maxRetries: 2
    });
    
    // Add referrer earnings to pending balance (after successful fee collection)
    if (referrerId && referrerShareSol > 0 && refManager) {
      await refManager.addEarnings(referrerId, referrerShareSol, userId, operationType);
    }
    
    const totalFeeSol = lamportsToSol(feeAmount);
    if (referrerId && referrerShareSol > 0) {
      console.log(`✅ Fee collected: ${totalFeeSol} SOL for ${operationType} (dev: ${lamportsToSol(devShareLamports).toFixed(6)}, referrer: ${referrerShareSol.toFixed(6)}) (tx: ${signature})`);
    } else {
      console.log(`✅ Fee collected: ${totalFeeSol} SOL for ${operationType} (tx: ${signature})`);
    }
    
    return signature;
  } catch (error) {
    console.error('Error collecting developer fee:', error);
    throw error;
  }
}

/**
 * Wrapper function to execute operation with fee collection
 * @param {number} userId - User ID
 * @param {string} operationType - Type of operation
 * @param {Function} operationFn - Function to execute after fee collection
 * @returns {Promise<object>} { feeSignature, operationResult }
 */
async function executeWithFee(userId, operationType, operationFn) {
  try {
    const feeAmount = getFeeAmount(operationType);
    
    if (feeAmount > 0) {
      // For wallet_management operations, skip pre-check (wallet is created during operation)
      const isWalletOperation = operationType === 'wallet_management';
      
      if (!isWalletOperation) {
        // Step 1: Check balance BEFORE operation (to ensure user has enough for fee + operation)
        const userKeypair = getActiveWalletKeypair(userId);
        if (!userKeypair) {
          throw new Error('No active wallet found. Please create or import a wallet first.');
        }
        const userAddress = userKeypair.publicKey.toBase58();
        const balanceCheck = await checkSufficientBalance(userAddress, feeAmount, 10000);
        if (!balanceCheck.sufficient) {
          throw new Error(
            `Insufficient balance. You need ${balanceCheck.requiredSol.toFixed(4)} SOL ` +
            `(${lamportsToSol(feeAmount).toFixed(4)} SOL fee + transaction costs) ` +
            `but only have ${balanceCheck.balanceSol.toFixed(4)} SOL.`
          );
        }
      }
      
      // Step 2: Execute main operation FIRST
      const operationResult = await operationFn();
      
      // Step 3: Collect fee AFTER successful operation (wallet now exists for wallet_management)
      const feeSignature = await collectDeveloperFee(userId, feeAmount, operationType);
      
      return {
        success: true,
        feeSignature,
        operationResult
      };
    } else {
      // No fee required, execute directly
      const operationResult = await operationFn();
      return {
        success: true,
        feeSignature: null,
        operationResult
      };
    }
  } catch (error) {
    throw error;
  }
}

/**
 * Calculate total launch cost with all components
 * @param {object} params - Cost calculation parameters
 * @returns {object} Detailed cost breakdown
 */
async function calculateLaunchCost(params) {
  const {
    platform,          // 'Pump.fun' or 'Raydium'
    initialBuySOL = 0, // Initial buy amount for Pump.fun
    poolTokenAmount = 0,
    poolSolAmount = 0,
    useBundle = false,
    bundleWalletCount = 0,
    bundleBuyAmounts = [],
    userId
  } = params;
  
  try {
    let developerFee = 0;
    let initialBuy = initialBuySOL;
    let poolCreation = 0;
    let estimatedGas = 0.005; // Conservative estimate
    
    // Calculate developer fee based on platform
    if (platform === 'Pump.fun') {
      developerFee = lamportsToSol(getFeeAmount('pumpfun_creation'));
      estimatedGas = useBundle ? 0.01 : 0.005; // Bundles need more gas
    } else if (platform === 'Raydium') {
      developerFee = lamportsToSol(getFeeAmount('raydium_creation'));
      
      // Add pool creation fee if applicable
      if (poolSolAmount > 0) {
        const poolFee = lamportsToSol(getFeeAmount('raydium_pool'));
        developerFee += poolFee;
        poolCreation = parseFloat(poolSolAmount);
        estimatedGas = 0.01; // More gas for token + pool
      }
    }
    
    // Bundle costs
    let bundleCost = 0;
    if (useBundle) {
      const normalizedAmounts = Array.isArray(bundleBuyAmounts)
        ? bundleBuyAmounts.map(amount => {
            const value = Number(amount);
            return Number.isFinite(value) && value > 0 ? value : 0;
          })
        : [];

      const effectiveCount = bundleWalletCount || normalizedAmounts.length;

      if (normalizedAmounts.length) {
        bundleCost = normalizedAmounts
          .slice(0, effectiveCount || normalizedAmounts.length)
          .reduce((sum, value) => sum + value, 0);
      } else if (effectiveCount > 0) {
        bundleCost = effectiveCount * 0.01; // Fallback default per wallet
      }
    }
    
    const totalCost = developerFee + initialBuy + poolCreation + estimatedGas + bundleCost;
    
    return {
      developerFee,
      initialBuy,
      poolCreation,
      estimatedGas,
      bundleCost,
      totalCost,
      breakdown: {
        'Developer Fee': developerFee,
        'Initial Buy (Dev Wallet)': initialBuy,
        'Pool Liquidity': poolCreation,
        'Bundle Wallets': bundleCost,
        'Estimated Gas': estimatedGas
      }
    };
  } catch (error) {
    console.error('Error calculating launch cost:', error);
    throw error;
  }
}

/**
 * Estimate total cost for an operation
 * @param {string} operationType - Type of operation
 * @param {number} computeUnits - Estimated compute units
 * @param {number} priorityFee - Priority fee per CU
 * @returns {object} Cost breakdown
 */
function estimateOperationCost(operationType, computeUnits = 200000, priorityFee = 5000) {
  const developerFee = getFeeAmount(operationType);
  const baseFee = 5000; // 5000 lamports per signature
  const priorityFeeCost = Math.ceil((computeUnits * priorityFee) / 1000000);
  
  const totalLamports = developerFee + baseFee + priorityFeeCost;
  
  return {
    developerFee,
    developerFeeSol: lamportsToSol(developerFee),
    baseFee,
    priorityFeeCost,
    totalLamports,
    totalSol: lamportsToSol(totalLamports),
    breakdown: {
      'Developer Fee': `${lamportsToSol(developerFee).toFixed(4)} SOL`,
      'Base Transaction Fee': `${lamportsToSol(baseFee).toFixed(6)} SOL`,
      'Priority Fee': `${lamportsToSol(priorityFeeCost).toFixed(6)} SOL`,
      'Total': `${lamportsToSol(totalLamports).toFixed(4)} SOL`
    }
  };
}

/**
 * Format cost estimation for display
 * @param {object} costEstimate - Cost estimate object
 * @returns {string} Formatted string
 */
function formatCostEstimate(costEstimate) {
  let msg = '💰 *Cost Estimate:*\n\n';
  
  for (const [key, value] of Object.entries(costEstimate.breakdown)) {
    const padding = key === 'Total' ? '\n' : '';
    msg += `${padding}${key}: \`${value}\`\n`;
  }
  
  return msg;
}

/**
 * Get priority fee recommendations
 * @returns {Promise<object>} Fee recommendations with estimates
 */
async function getPriorityFeeRecommendations() {
  try {
    const fees = await getPriorityFees();
    
    return {
      high: {
        microLamports: fees.high,
        description: 'Fast confirmation (~1-2 seconds)',
        costPer200kCU: lamportsToSol(Math.ceil((200000 * fees.high) / 1000000))
      },
      medium: {
        microLamports: fees.medium,
        description: 'Normal confirmation (~5-10 seconds)',
        costPer200kCU: lamportsToSol(Math.ceil((200000 * fees.medium) / 1000000))
      },
      low: {
        microLamports: fees.low,
        description: 'Slow confirmation (~30+ seconds)',
        costPer200kCU: lamportsToSol(Math.ceil((200000 * fees.low) / 1000000))
      },
      recommended: {
        microLamports: fees.recommended,
        description: 'Balanced baseline (auto)',
        costPer200kCU: lamportsToSol(Math.ceil((200000 * fees.recommended) / 1000000))
      },
      source: fees.source,
      samples: fees.samples,
      original: fees.original
    };
  } catch (error) {
    console.error('Error getting fee recommendations:', error);
    throw error;
  }
}

module.exports = {
  FEE_CONFIG,
  getFeeAmount,
  getUserPriorityFee,
  getUserPriorityFeeDetails,
  getUserPriorityFeeLamports,
  getUserPriorityFeeForJupiter,
  addPriorityFeeToTransaction,
  checkSufficientBalance,
  collectDeveloperFee,
  executeWithFee,
  calculateLaunchCost,
  estimateOperationCost,
  formatCostEstimate,
  getPriorityFeeRecommendations
};

