/**
 * Solana Utilities Module
 * Core Solana RPC operations, balance checking, and transaction utilities
 */

const { Connection, PublicKey, LAMPORTS_PER_SOL, Transaction, SystemProgram, sendAndConfirmTransaction } = require('@solana/web3.js');
const { getAssociatedTokenAddress, getAccount, getMint, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } = require('@solana/spl-token');
const db = require('./db');

// Solana connection instance (will be initialized by main app)
let connection = null;
let priorityFeeConnection = null;
let priorityFeeConnectionUrl = null;

/**
 * Initialize Solana connection
 * @param {string} rpcUrl - RPC URL
 * @param {string} commitmentLevel - Commitment level
 * @returns {Connection} Solana connection
 */
function initializeConnection(rpcUrl, commitmentLevel = 'confirmed') {
  connection = new Connection(rpcUrl, {
    commitment: commitmentLevel,
    confirmTransactionInitialTimeout: 60000
  });
  return connection;
}

/**
 * Get current connection
 * @returns {Connection} Solana connection
 */
function getConnection() {
  if (!connection) {
    throw new Error('Solana connection not initialized');
  }
  return connection;
}

function getPriorityFeeConnection() {
  const overrideUrl = process.env.PRIORITY_FEE_RPC_URL || process.env.PRIORITY_FEE_RPC;
  const network = (process.env.NETWORK || 'mainnet-beta').toLowerCase();
  const fallbackUrl = network !== 'mainnet-beta' ? 'https://api.mainnet-beta.solana.com' : null;
  const selectedUrl = overrideUrl || fallbackUrl;

  if (!selectedUrl) {
    return null;
  }

  if (priorityFeeConnection && priorityFeeConnectionUrl === selectedUrl) {
    return priorityFeeConnection;
  }

  priorityFeeConnection = new Connection(selectedUrl, {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 60000
  });
  priorityFeeConnectionUrl = selectedUrl;
  return priorityFeeConnection;
}

/**
 * Convert SOL to lamports
 * @param {number|string} sol - Amount in SOL
 * @returns {number} Amount in lamports
 */
function solToLamports(sol) {
  const solNum = parseFloat(sol);
  if (isNaN(solNum) || solNum < 0) {
    throw new Error(`Invalid SOL amount: ${sol}`);
  }
  return Math.floor(solNum * LAMPORTS_PER_SOL);
}

/**
 * Convert lamports to SOL
 * @param {number} lamports - Amount in lamports
 * @returns {number} Amount in SOL
 */
function lamportsToSol(lamports) {
  return lamports / LAMPORTS_PER_SOL;
}

/**
 * Validate Solana public key
 * @param {string} address - Address to validate
 * @returns {boolean} True if valid
 */
function isValidPublicKey(address) {
  try {
    new PublicKey(address);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Get SOL balance for an address
 * @param {string} address - Wallet address
 * @returns {Promise<object>} { lamports, sol }
 */
async function getSOLBalance(address) {
  try {
    const conn = getConnection();
    const publicKey = new PublicKey(address);
    const lamports = await conn.getBalance(publicKey);
    
    return {
      lamports,
      sol: lamportsToSol(lamports)
    };
  } catch (error) {
    console.error('Error getting SOL balance:', error);
    throw new Error('Failed to fetch SOL balance');
  }
}

/**
 * Get token accounts for a wallet
 * Uses both TOKEN_PROGRAM_ID and TOKEN_2022_PROGRAM_ID to find all accounts
 * @param {string} address - Wallet address
 * @param {string} programId - Token program ID (TOKEN_PROGRAM_ID or TOKEN_2022_PROGRAM_ID)
 * @returns {Promise<Array>} Array of token accounts
 */
function normalizeAmountString(value, decimalsHint = null) {
  if (value === null || value === undefined) {
    return '0';
  }

  if (typeof value === 'bigint') {
    return value < 0n ? '0' : value.toString();
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return '0';
    }
    if (Number.isInteger(decimalsHint) && decimalsHint > 0) {
      const scaled = Math.round(value * Math.pow(10, decimalsHint));
      return scaled <= 0 ? '0' : String(scaled);
    }
    return value <= 0 ? '0' : Math.floor(value).toString();
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return '0';
    }
    if (/^-?\d+$/.test(trimmed)) {
      const big = BigInt(trimmed);
      return big < 0n ? '0' : big.toString();
    }
    if (/^-?\d+\.\d+$/.test(trimmed) && Number.isInteger(decimalsHint)) {
      if (trimmed.startsWith('-')) {
        return '0';
      }
      const [whole, rawFraction] = trimmed.split('.');
      const paddedFraction = (rawFraction + '0'.repeat(decimalsHint)).slice(0, decimalsHint);
      const combined = `${whole}${paddedFraction}`.replace(/^0+/, '');
      return combined === '' ? '0' : combined;
    }
    return '0';
  }

  return '0';
}

function deriveUiAmountString(amountStr, decimals) {
  if (!Number.isInteger(decimals)) {
    return null;
  }
  const normalizedAmount = amountStr && amountStr !== '' ? BigInt(amountStr) : 0n;
  if (decimals === 0) {
    return normalizedAmount.toString();
  }
  const factor = BigInt(10) ** BigInt(decimals);
  const whole = normalizedAmount / factor;
  const fraction = normalizedAmount % factor;
  if (fraction === 0n) {
    return whole.toString();
  }
  const fractionStr = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');
  return fractionStr.length ? `${whole.toString()}.${fractionStr}` : whole.toString();
}

function safeNumberFromString(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const comparisonTarget = trimmed.startsWith('-') ? trimmed.slice(1) : trimmed;
  const [whole] = comparisonTarget.split('.');
  if (whole.length > 15) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

async function getTokenAccounts(address, programId = TOKEN_PROGRAM_ID) {
  try {
    const conn = getConnection();
    const publicKey = new PublicKey(address);
    
    // Use 'confirmed' commitment to ensure we get fresh data, not cached
    console.log(`[SOLANA] Fetching token accounts with 'confirmed' commitment (bypassing cache) for ${address.substring(0, 8)}...`);
    
    // Fetch from both token programs to ensure we get all accounts
    const allAccounts = [];
    
    for (const pid of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
      try {
        const response = await conn.getParsedTokenAccountsByOwner(publicKey, {
          programId: new PublicKey(pid),
          commitment: 'confirmed'
        });
        
        const accounts = response.value.map((acc) => {
          const parsedInfo = acc.account.data.parsed.info;
          const tokenAmount = parsedInfo.tokenAmount || {};
          const decimals = Number.isInteger(tokenAmount.decimals) ? tokenAmount.decimals : null;

          const amountStr = normalizeAmountString(tokenAmount.amount, decimals);
          const uiAmountString = typeof tokenAmount.uiAmountString === 'string'
            ? tokenAmount.uiAmountString
            : (decimals != null ? deriveUiAmountString(amountStr, decimals) : null);
          const uiAmount = Number.isFinite(tokenAmount.uiAmount)
            ? tokenAmount.uiAmount
            : (uiAmountString ? safeNumberFromString(uiAmountString) : null);

          return {
            address: acc.pubkey.toBase58(),
            mint: parsedInfo.mint,
            owner: parsedInfo.owner,
            amount: amountStr,
            decimals,
            uiAmount,
            uiAmountString
          };
        });
        
        allAccounts.push(...accounts);
      } catch (e) {
        // Continue if one program fails
        console.warn(`[SOLANA] Error fetching accounts for program ${pid.toBase58()}: ${e.message}`);
      }
    }
    
    // Remove duplicates by address
    const uniqueAccounts = Array.from(
      new Map(allAccounts.map(acc => [acc.address, acc])).values()
    );

    uniqueAccounts.sort((a, b) => {
      const amountA = BigInt(a.amount || '0');
      const amountB = BigInt(b.amount || '0');
      if (amountA === amountB) {
        const decimalsA = Number.isInteger(a.decimals) ? a.decimals : -1;
        const decimalsB = Number.isInteger(b.decimals) ? b.decimals : -1;
        return decimalsB - decimalsA;
      }
      return amountB > amountA ? 1 : -1;
    });
    
    console.log(`[SOLANA] Found ${uniqueAccounts.length} unique token accounts for ${address.substring(0, 8)}...`);
    
    return uniqueAccounts;
  } catch (error) {
    console.error('Error getting token accounts:', error);
    throw new Error('Failed to fetch token accounts');
  }
}

/**
 * Get token balance for a specific mint using SPL Token library directly
 * This uses getAccount from @solana/spl-token for accurate balance
 * @param {string} walletAddress - Wallet address
 * @param {string} mintAddress - Token mint address
 * @returns {Promise<object|null>} Token balance info or null
 */
async function getTokenBalance(walletAddress, mintAddress) {
  try {
    const conn = getConnection();
    const walletPubkey = new PublicKey(walletAddress);
    const mintPubkey = new PublicKey(mintAddress);
    
    // Try Token-2022 first, then standard SPL Token
    for (const programId of [TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID]) {
      try {
        const ata = await getAssociatedTokenAddress(
          mintPubkey,
          walletPubkey,
          false,
          programId
        );
        
        // Use 'confirmed' commitment to ensure we get fresh data, not cached
        // Using getAccount from @solana/spl-token for direct account access
        console.log(`[SOLANA] Fetching token balance with 'confirmed' commitment using SPL getAccount (bypassing cache) for ${walletAddress.substring(0, 8)}... / ${mintAddress.substring(0, 8)}...`);
        const accountInfo = await getAccount(conn, ata, 'confirmed', programId);
        
        // Get mint info for decimals
        let decimals = null;
        try {
          const mintInfo = await getMint(conn, mintPubkey, 'confirmed', programId);
          decimals = mintInfo.decimals;
        } catch (mintError) {
          console.warn(`[SOLANA] Could not fetch mint decimals: ${mintError.message}`);
        }
        
        const amountBigInt = accountInfo.amount;
        const uiAmount = decimals !== null ? Number(amountBigInt) / Math.pow(10, decimals) : null;
        
        console.log(`[SOLANA] Token balance: raw=${amountBigInt.toString()}, decimals=${decimals}, uiAmount=${uiAmount}`);
        
        return {
          address: ata.toBase58(),
          mint: mintAddress,
          amount: amountBigInt.toString(),
          decimals: decimals,
          uiAmount: uiAmount,
          programId: programId.toBase58()
        };
      } catch (e) {
        // Account doesn't exist for this program, try next
        if (e.message && !e.message.includes('could not find account')) {
          console.warn(`[SOLANA] Error fetching token account for ${programId.toBase58()}: ${e.message}`);
        }
        continue;
      }
    }
    
    return null; // No token account found
  } catch (error) {
    console.error('Error getting token balance:', error);
    return null;
  }
}

async function getTokenAccountBalanceRaw(accountAddress) {
  try {
    if (!accountAddress) {
      throw new Error('Token account address required');
    }
    const conn = getConnection();
    const accountPubkey = new PublicKey(accountAddress);
    const balanceInfo = await conn.getTokenAccountBalance(accountPubkey, 'confirmed');
    if (!balanceInfo || !balanceInfo.value) {
      return null;
    }
    const { amount, decimals } = balanceInfo.value;
    const normalizedAmount = normalizeAmountString(amount, decimals);
    return {
      amount: normalizedAmount,
      decimals: Number.isInteger(decimals) ? decimals : null
    };
  } catch (error) {
    console.warn(`[SOLANA] Failed to fetch token account balance for ${accountAddress?.substring ? accountAddress.substring(0, 8) : '???'}...: ${error.message}`);
    return null;
  }
}

/**
 * Get mint info for a token
 * @param {string} mintAddress - Token mint address
 * @returns {Promise<object>} Mint info
 */
async function getMintInfo(mintAddress) {
  try {
    const conn = getConnection();
    const mintPubkey = new PublicKey(mintAddress);
    
    // Try Token-2022 first, then standard SPL Token
    let lastError = null;
    for (const programId of [TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID]) {
      try {
        const mintInfo = await getMint(conn, mintPubkey, 'confirmed', programId);
        
        return {
          address: mintAddress,
          decimals: mintInfo.decimals,
          supply: mintInfo.supply.toString(),
          mintAuthority: mintInfo.mintAuthority ? mintInfo.mintAuthority.toBase58() : null,
          freezeAuthority: mintInfo.freezeAuthority ? mintInfo.freezeAuthority.toBase58() : null,
          programId: programId.toBase58()
        };
      } catch (e) {
        lastError = e;
        continue;
      }
    }

    console.warn(`[SOLANA] Mint info not found via RPC for ${mintAddress}: ${lastError?.message || 'unknown error'}`);

    const tokenRecord = db?.getTokenByMint ? db.getTokenByMint(mintAddress) : null;
    const profile = tokenRecord?.profile || {};
    const profileDecimals = Number.isInteger(profile.decimals) ? profile.decimals : null;
    const fallbackDecimals = Number.isInteger(tokenRecord?.decimals)
      ? tokenRecord.decimals
      : (profileDecimals ?? 9);
    const fallbackSupply = tokenRecord?.supply
      ? String(tokenRecord.supply)
      : profile?.supply
        ? String(profile.supply)
        : '0';

    return {
      address: mintAddress,
      decimals: fallbackDecimals,
      supply: fallbackSupply,
      mintAuthority: null,
      freezeAuthority: null,
      programId: TOKEN_PROGRAM_ID.toBase58(),
      fallback: true
    };
  } catch (error) {
    console.error('Error getting mint info:', error);
    throw error;
  }
}

/**
 * Get recent prioritization fees (LIVE from network)
 * @returns {Promise<object>} Fee recommendations with accurate network data
 */
function normalizePriorityFees(result = {}) {
  const toMicroNumber = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) {
      return null;
    }
    return Math.round(num);
  };

  const finalizeMicro = (value, fallback = 0) => {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) {
      return Math.max(0, Math.round(fallback));
    }
    return Math.round(num);
  };

  const convertToSol = (microLamports, computeUnits) => {
    if (!Number.isFinite(microLamports) || microLamports <= 0 || !Number.isFinite(computeUnits) || computeUnits <= 0) {
      return 0;
    }
    const lamports = (microLamports * computeUnits) / 1e6;
    return lamportsToSol(lamports);
  };

  const minPriorityEnv = Number(process.env.MIN_PRIORITY_FEE_MICROLAMPORTS || '5000');
  const minPriority = Number.isFinite(minPriorityEnv) && minPriorityEnv >= 0
    ? Math.round(minPriorityEnv)
    : 0;

  const original = {
    high: toMicroNumber(result.high),
    medium: toMicroNumber(result.medium),
    low: toMicroNumber(result.low),
    min: toMicroNumber(result.min),
    veryHigh: toMicroNumber(result.veryHigh),
    unsafeMax: toMicroNumber(result.unsafeMax),
    priorityFeeEstimate: toMicroNumber(result.priorityFeeEstimate),
    recommended: toMicroNumber(result.recommended)
  };

  let recommended = original.recommended
    || original.priorityFeeEstimate
    || original.medium
    || original.high
    || original.low
    || minPriority;
  recommended = Math.max(recommended || 0, minPriority);

  const normalized = {
    recommended,
    high: original.high,
    medium: original.medium,
    low: original.low,
    min: original.min,
    veryHigh: original.veryHigh,
    unsafeMax: original.unsafeMax
  };

  normalized.medium = finalizeMicro(
    Number.isFinite(normalized.medium) && normalized.medium > 0
      ? Math.max(normalized.medium, normalized.recommended)
      : normalized.recommended,
    normalized.recommended
  );

  normalized.low = finalizeMicro(
    Number.isFinite(normalized.low) && normalized.low > 0
      ? Math.max(normalized.low, minPriority)
      : Math.max(Math.floor(normalized.recommended * 0.7), minPriority),
    Math.max(Math.floor(normalized.recommended * 0.7), minPriority)
  );

  normalized.high = finalizeMicro(
    Number.isFinite(normalized.high) && normalized.high > 0
      ? Math.max(normalized.high, normalized.medium)
      : Math.ceil(normalized.medium * 1.25),
    Math.ceil(normalized.medium * 1.25)
  );

  if (normalized.high < normalized.medium) {
    normalized.high = normalized.medium;
  }

  if (normalized.medium < normalized.low) {
    normalized.medium = normalized.low;
  }

  normalized.min = finalizeMicro(
    Number.isFinite(normalized.min) && normalized.min > 0
      ? Math.max(normalized.min, Math.floor(minPriority * 0.5))
      : Math.max(Math.floor(minPriority * 0.5), 0),
    Math.max(Math.floor(minPriority * 0.5), 0)
  );

  normalized.veryHigh = finalizeMicro(
    Number.isFinite(normalized.veryHigh) && normalized.veryHigh > 0
      ? Math.max(normalized.veryHigh, Math.ceil(normalized.high * 1.3))
      : Math.ceil(normalized.high * 1.7),
    Math.ceil(normalized.high * 1.7)
  );

  normalized.unsafeMax = finalizeMicro(
    Number.isFinite(normalized.unsafeMax) && normalized.unsafeMax > 0
      ? Math.max(normalized.unsafeMax, Math.ceil(normalized.veryHigh * 1.1))
      : Math.ceil(normalized.veryHigh * 1.2),
    Math.ceil(normalized.veryHigh * 1.2)
  );

  const lamportsPerCu = {
    high: normalized.high / 1e6,
    medium: normalized.medium / 1e6,
    low: normalized.low / 1e6,
    min: normalized.min / 1e6,
    recommended: normalized.recommended / 1e6,
    veryHigh: normalized.veryHigh / 1e6,
    unsafeMax: normalized.unsafeMax / 1e6
  };

  const computeProfiles = [
    { key: 'transfer', computeUnits: 200000, label: 'Transfer (~200k CU)' },
    { key: 'swap', computeUnits: 600000, label: 'Swap (~600k CU)' },
    { key: 'raydium', computeUnits: 1400000, label: 'Raydium (~1.4M CU)' },
    { key: 'bundle', computeUnits: 2200000, label: 'Bundle (~2.2M CU)' }
  ];

  const costs = computeProfiles.reduce((acc, profile) => {
    acc[profile.key] = {
      label: profile.label,
      computeUnits: profile.computeUnits,
      high: convertToSol(normalized.high, profile.computeUnits),
      medium: convertToSol(normalized.medium, profile.computeUnits),
      low: convertToSol(normalized.low, profile.computeUnits),
      min: convertToSol(normalized.min, profile.computeUnits),
      recommended: convertToSol(normalized.recommended, profile.computeUnits)
    };
    return acc;
  }, {});

  let networkCongestion = result.networkCongestion;
  if (!networkCongestion) {
    if (lamportsPerCu.medium >= 5) {
      networkCongestion = 'high';
    } else if (lamportsPerCu.medium >= 1) {
      networkCongestion = 'medium';
    } else {
      networkCongestion = 'low';
    }
  }

  normalized.original = {
    high: original.high,
    medium: original.medium,
    low: original.low,
    min: original.min,
    veryHigh: original.veryHigh,
    unsafeMax: original.unsafeMax,
    priorityFeeEstimate: original.priorityFeeEstimate,
    recommended: original.recommended
  };
  normalized.perComputeUnitLamports = lamportsPerCu;
  normalized.costs = costs;
  normalized.samples = Number(result.samples) || 0;
  normalized.source = result.source || 'unknown';
  normalized.timestamp = result.timestamp || Date.now();
  normalized.networkCongestion = networkCongestion;
  normalized.priorityFeeEstimate = original.priorityFeeEstimate || normalized.recommended;

  return normalized;
}

async function getPriorityFees() {
  try {
    // Try Helius advanced API first (if available)
    try {
      const { getHeliusPriorityFeeEstimate, isHeliusAvailable } = require('./helius');
      
      if (isHeliusAvailable()) {
        console.log('[PRIORITY FEES] Trying Helius advanced API...');
        const heliusEstimate = await getHeliusPriorityFeeEstimate();
        
        if (heliusEstimate && heliusEstimate.priorityFeeLevels) {
          const levels = heliusEstimate.priorityFeeLevels;
          console.log('[PRIORITY FEES] Using Helius data ✅');
          return normalizePriorityFees({
            high: levels.high,
            medium: levels.medium,
            low: levels.low,
            min: levels.min,
            veryHigh: levels.veryHigh,
            unsafeMax: levels.unsafeMax,
            priorityFeeEstimate: heliusEstimate.priorityFeeEstimate,
            samples: heliusEstimate?.samples ?? 0,
            timestamp: Date.now(),
            source: 'helius',
            networkCongestion: levels.high > 100000 ? 'high' : levels.high > 50000 ? 'medium' : 'low'
          });
        }
      }
    } catch (heliusError) {
      console.log('[PRIORITY FEES] Helius unavailable, using RPC fallback...');
    }
    
    // Fallback to standard RPC method
    const feeConn = getPriorityFeeConnection() || getConnection();
    const feeSourceLabel = feeConn === connection ? 'rpc' : 'rpc(mainnet)';
    
    console.log(`[PRIORITY FEES] Fetching from Solana RPC (${feeSourceLabel})...`);
    
    // Get recent prioritization fees from last 150 slots
    const recentFees = await feeConn.getRecentPrioritizationFees({
      locksHash: null
    });
    
    console.log(`[PRIORITY FEES] Received ${recentFees?.length || 0} fee samples`);
    
    if (!recentFees || recentFees.length === 0) {
      console.warn('[PRIORITY FEES] No data available, using defaults');
      return normalizePriorityFees({
        high: 100000,
        medium: 50000,
        low: 10000,
        min: 0,
        timestamp: Date.now(),
        samples: 0,
        source: 'default'
      });
    }
    
    // Extract and sort fees
    const fees = recentFees
      .map(f => f.prioritizationFee)
      .filter(f => f > 0)
      .sort((a, b) => a - b);
    
    console.log(`[PRIORITY FEES] Valid fee samples: ${fees.length}`);
    
    if (fees.length === 0) {
      console.warn('[PRIORITY FEES] All fees are zero, using defaults');
      return normalizePriorityFees({
        high: 100000,
        medium: 50000,
        low: 10000,
        min: 0,
        timestamp: Date.now(),
        samples: 0,
        source: 'default'
      });
    }
    
    // Calculate percentiles for accurate recommendations
    const p90 = fees[Math.floor(fees.length * 0.90)] || fees[fees.length - 1];
    const p75 = fees[Math.floor(fees.length * 0.75)] || fees[Math.floor(fees.length * 0.7)];
    const p50 = fees[Math.floor(fees.length * 0.50)] || fees[Math.floor(fees.length * 0.4)];
    const p25 = fees[Math.floor(fees.length * 0.25)] || fees[Math.floor(fees.length * 0.2)];
    const min = fees[0] || 0;
    
    const result = {
      high: p90,
      medium: p50,
      low: p25,
      min: min,
      timestamp: Date.now(),
      samples: fees.length,
      source: feeSourceLabel,
      networkCongestion: p90 > 100000 ? 'high' : p90 > 50000 ? 'medium' : 'low'
    };
    
    console.log('[PRIORITY FEES] Calculated (RPC):', result);
    
    return normalizePriorityFees(result);
  } catch (error) {
    console.error('[PRIORITY FEES ERROR]', error.message);
    // Return safe defaults on error
    return normalizePriorityFees({
      high: 100000,
      medium: 50000,
      low: 10000,
      min: 0,
      timestamp: Date.now(),
      samples: 0,
      source: 'fallback',
      error: error.message
    });
  }
}

/**
 * Estimate transaction cost
 * @param {number} computeUnits - Estimated compute units
 * @param {number} priorityFee - Priority fee per CU
 * @returns {object} Cost estimation
 */
function estimateTransactionCost(computeUnits, priorityFee = 0) {
  // Base transaction fee (5000 lamports per signature)
  const baseFee = 5000;
  
  // Priority fee cost
  const priorityFeeCost = Math.ceil((computeUnits * priorityFee) / 1000000);
  
  const totalLamports = baseFee + priorityFeeCost;
  
  return {
    baseFee,
    priorityFeeCost,
    totalLamports,
    totalSol: lamportsToSol(totalLamports),
    computeUnits,
    priorityFeePerCU: priorityFee
  };
}

/**
 * Simulate transaction before sending
 * @param {Transaction} transaction - Transaction to simulate
 * @param {Keypair} signers - Transaction signers
 * @returns {Promise<object>} Simulation result
 */
async function simulateTransaction(transaction, signers) {
  try {
    const conn = getConnection();
    
    // Get recent blockhash
    const { blockhash } = await conn.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = signers[0].publicKey;
    
    // Sign transaction
    transaction.sign(...signers);
    
    // Simulate
    const simulation = await conn.simulateTransaction(transaction);
    
    if (simulation.value.err) {
      return {
        success: false,
        error: simulation.value.err,
        logs: simulation.value.logs
      };
    }
    
    return {
      success: true,
      logs: simulation.value.logs,
      unitsConsumed: simulation.value.unitsConsumed
    };
  } catch (error) {
    console.error('Error simulating transaction:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Send and confirm transaction with retries
 * @param {Transaction} transaction - Transaction to send
 * @param {Keypair[]} signers - Transaction signers
 * @param {object} options - Send options
 * @returns {Promise<string>} Transaction signature
 */
async function sendAndConfirmTransactionWithRetry(transaction, signers, options = {}) {
  const conn = getConnection();
  const maxRetries = options.maxRetries || 3;
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Get fresh blockhash for each attempt
      const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.lastValidBlockHeight = lastValidBlockHeight;
      transaction.feePayer = signers[0].publicKey;
      
      // Sign transaction
      transaction.sign(...signers);
      
      // Send transaction
      const signature = await conn.sendRawTransaction(transaction.serialize(), {
        skipPreflight: options.skipPreflight || false,
        maxRetries: 0 // We handle retries ourselves
      });
      
      // Confirm transaction
      const confirmation = await conn.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight
      });
      
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }
      
      return signature;
    } catch (error) {
      lastError = error;
      console.error(`Transaction attempt ${attempt} failed:`, error.message);
      
      if (attempt < maxRetries) {
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }
  
  throw lastError;
}

/**
 * Check if an account exists
 * @param {string} address - Account address
 * @returns {Promise<boolean>} True if account exists
 */
async function accountExists(address) {
  try {
    const conn = getConnection();
    const publicKey = new PublicKey(address);
    const accountInfo = await conn.getAccountInfo(publicKey);
    return accountInfo !== null;
  } catch (error) {
    return false;
  }
}

/**
 * Get transaction details
 * @param {string} signature - Transaction signature
 * @returns {Promise<object|null>} Transaction details
 */
async function getTransactionDetails(signature) {
  try {
    const conn = getConnection();
    const tx = await conn.getTransaction(signature, {
      maxSupportedTransactionVersion: 0
    });
    
    if (!tx) return null;
    
    return {
      signature,
      slot: tx.slot,
      blockTime: tx.blockTime,
      meta: tx.meta,
      transaction: tx.transaction
    };
  } catch (error) {
    console.error('Error getting transaction details:', error);
    return null;
  }
}

/**
 * Request airdrop (devnet/testnet only)
 * @param {string} address - Wallet address
 * @param {number} amount - Amount in SOL
 * @returns {Promise<string>} Transaction signature
 */
async function requestAirdrop(address, amount = 1) {
  try {
    const conn = getConnection();
    const publicKey = new PublicKey(address);
    const signature = await conn.requestAirdrop(publicKey, solToLamports(amount));
    await conn.confirmTransaction(signature);
    return signature;
  } catch (error) {
    console.error('Error requesting airdrop:', error);
    throw new Error('Airdrop failed. Make sure you are on devnet/testnet.');
  }
}

module.exports = {
  initializeConnection,
  getConnection,
  solToLamports,
  lamportsToSol,
  isValidPublicKey,
  getSOLBalance,
  getTokenAccounts,
  getTokenBalance,
  getTokenAccountBalanceRaw,
  getMintInfo,
  getPriorityFees,
  estimateTransactionCost,
  simulateTransaction,
  sendAndConfirmTransactionWithRetry,
  accountExists,
  getTransactionDetails,
  requestAirdrop
};

