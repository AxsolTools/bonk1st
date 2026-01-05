/**
 * Pump.fun Implementation
 * On-chain interaction with Pump.fun bonding curve program
 * 
 * NOTE: Pump.fun does not have an official public API for token launches.
 * This implementation uses:
 * 1. On-chain program interaction for reading bonding curve data
 * 2. Third-party data APIs for price/market data
 * 3. Placeholder structures for launch operations
 */

const { Connection, PublicKey, Transaction, SystemProgram, TransactionInstruction } = require('@solana/web3.js');
const { getConnection } = require('./solana_utils');
const { getActiveWalletKeypair } = require('./wallets');
const { updateTokenState, updateTokenPlatform, getTokenByMint } = require('./db');
const axios = require('axios');
const BN = require('bn.js');

// Pump.fun Program ID (mainnet)
const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

// Pump.fun States
const PUMPFUN_STATES = {
  BONDING_CURVE: 'bonding_curve',
  MIGRATION_PENDING: 'migration_pending',
  MIGRATED_TO_RAYDIUM: 'raydium_pool'
};

// Migration threshold (typically 85 SOL in bonding curve)
const MIGRATION_THRESHOLD_SOL = 85;

/**
 * Get bonding curve account address for a token
 * @param {string} tokenMint - Token mint address
 * @returns {PublicKey} Bonding curve PDA
 */
function getBondingCurvePDA(tokenMint) {
  if (typeof tokenMint !== 'string' || tokenMint.length < 32) {
    throw new Error('Invalid Pump.fun mint address');
  }

  const mintPubkey = new PublicKey(tokenMint);
  
  // Derive PDA for bonding curve
  const [bondingCurvePDA] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('bonding-curve'),
      mintPubkey.toBuffer()
    ],
    PUMPFUN_PROGRAM_ID
  );
  
  return bondingCurvePDA;
}

// ============================================================================
// BONDING CURVE CACHING
// ============================================================================
// Cache bonding curve data with 5-second TTL to reduce RPC load
// Bonding curve data changes frequently during active trading
const bondingCurveCache = new Map();
const BONDING_CURVE_CACHE_TTL_MS = 5000; // 5 seconds

function getCachedBondingCurve(tokenMint) {
  const cached = bondingCurveCache.get(tokenMint);
  if (!cached) return null;
  
  const age = Date.now() - cached.timestamp;
  if (age > BONDING_CURVE_CACHE_TTL_MS) {
    bondingCurveCache.delete(tokenMint);
    return null;
  }
  
  return cached.data;
}

function setCachedBondingCurve(tokenMint, data) {
  bondingCurveCache.set(tokenMint, {
    data,
    timestamp: Date.now()
  });
  
  // Cleanup old entries (keep max 100)
  if (bondingCurveCache.size > 100) {
    const oldestKey = Array.from(bondingCurveCache.keys())[0];
    bondingCurveCache.delete(oldestKey);
  }
}

/**
 * Read bonding curve data from on-chain account (with caching)
 * @param {string} tokenMint - Token mint address
 * @param {boolean} forceRefresh - Skip cache and fetch fresh data
 * @returns {Promise<object|null>} Bonding curve data
 */
async function readBondingCurveData(tokenMint, forceRefresh = false) {
  if (typeof tokenMint !== 'string' || tokenMint.length < 32) {
    console.warn('[PUMP] Skipping bonding curve lookup for invalid mint:', tokenMint);
    return null;
  }

  // Check cache first
  if (!forceRefresh) {
    const cached = getCachedBondingCurve(tokenMint);
    if (cached) {
      return cached;
    }
  }

  try {
    const conn = getConnection();
    let bondingCurvePDA;

    try {
      bondingCurvePDA = getBondingCurvePDA(tokenMint);
    } catch (error) {
      console.warn('[PUMP] Failed to derive bonding curve PDA:', error.message);
      return null;
    }
    
    const accountInfo = await conn.getAccountInfo(bondingCurvePDA);
    
    if (!accountInfo) {
      // Cache null result to avoid repeated failed lookups
      setCachedBondingCurve(tokenMint, null);
      return null; // Not a Pump.fun token or curve doesn't exist
    }
    
    // Parse bonding curve data
    const data = accountInfo.data;
    
    // Pump.fun bonding curve structure:
    // Verified against Pump Portal implementation
    // Offset 0-8: discriminator
    // Offset 8-16: virtualTokenReserves (u64)
    // Offset 16-24: virtualSolReserves (u64)
    // Offset 24-32: realTokenReserves (u64)
    // Offset 32-40: realSolReserves (u64)
    // Offset 40-48: tokenTotalSupply (u64)
    // Offset 48: complete (bool)
    
    let parsed = {
      address: bondingCurvePDA.toBase58(),
      exists: true,
      dataLength: data.length,
      owner: accountInfo.owner.toBase58(),
      migrated: false,
      progress: 0,
      realSolReserves: 0,
      realTokenReserves: 0,
      cachedAt: Date.now()
    };
    
    // Try to parse if data is long enough
    if (data.length >= 49) {
      try {
        // Read u64 values as BigInt
        const virtualTokenReserves = data.readBigUInt64LE(8);
        const virtualSolReserves = data.readBigUInt64LE(16);
        const realTokenReserves = data.readBigUInt64LE(24);
        const realSolReserves = data.readBigUInt64LE(32);
        const tokenTotalSupply = data.readBigUInt64LE(40);
        const complete = data[48] === 1;
        
        // Calculate progress (0-100%)
        // Pump.fun migration threshold: 85 SOL raised
        // This matches Pump Portal's calculation
        const TARGET_SOL_LAMPORTS = BigInt(85 * 1_000_000_000);
        const progress = Math.min(100, Number((realSolReserves * BigInt(100)) / TARGET_SOL_LAMPORTS));
        
        parsed = {
          ...parsed,
          virtualTokenReserves: Number(virtualTokenReserves),
          virtualSolReserves: Number(virtualSolReserves),
          realTokenReserves: Number(realTokenReserves),
          realSolReserves: Number(realSolReserves),
          tokenTotalSupply: Number(tokenTotalSupply),
          migrated: complete,
          progress: progress,
          solRaised: Number(realSolReserves) / 1_000_000_000,
          solTarget: 85,
          percentToMigration: progress.toFixed(2)
        };
        
        console.log(`[PUMP] Bonding curve: ${tokenMint.substring(0, 8)}... - ${parsed.solRaised.toFixed(2)}/${parsed.solTarget} SOL (${parsed.percentToMigration}%)`);
      } catch (parseError) {
        console.warn('[PUMP] Could not parse bonding curve data:', parseError.message);
      }
    }
    
    // Cache the result
    setCachedBondingCurve(tokenMint, parsed);
    
    return parsed;
  } catch (error) {
    console.error(`[PUMP] Error reading bonding curve for ${tokenMint.substring(0, 8)}...:`, error.message);
    return null;
  }
}

/**
 * Check if token is on Pump.fun
 * @param {string} tokenMint - Token mint address
 * @returns {Promise<boolean>} True if on Pump.fun
 */
async function isTokenOnPumpfun(tokenMint) {
  const curveData = await readBondingCurveData(tokenMint);
  return curveData !== null;
}

/**
 * Get token data from third-party API (DexScreener, Birdeye, etc.)
 * @param {string} tokenMint - Token mint address
 * @returns {Promise<object>} Token data
 */
async function getTokenDataFromAPI(tokenMint) {
  try {
    // Option 1: DexScreener (free, no API key needed)
    try {
      const response = await axios.get(
        `https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`
      );
      
      if (response.data && response.data.pairs && response.data.pairs.length > 0) {
        const pair = response.data.pairs[0];
        
        return {
          mint: tokenMint,
          name: pair.baseToken.name,
          symbol: pair.baseToken.symbol,
          priceUsd: parseFloat(pair.priceUsd),
          priceNative: parseFloat(pair.priceNative),
          liquidity: pair.liquidity?.usd || 0,
          volume24h: pair.volume?.h24 || 0,
          marketCap: pair.fdv || 0,
          source: 'dexscreener'
        };
      }
    } catch (e) {
      console.log('DexScreener not available for this token');
    }
    
    // Option 2: Birdeye (requires API key)
    if (process.env.BIRDEYE_API_KEY) {
      try {
        const response = await axios.get(
          `https://public-api.birdeye.so/defi/token_overview?address=${tokenMint}`,
          {
            headers: { 'X-API-KEY': process.env.BIRDEYE_API_KEY }
          }
        );
        
        if (response.data && response.data.data) {
          const data = response.data.data;
          return {
            mint: tokenMint,
            name: data.name,
            symbol: data.symbol,
            priceUsd: data.price,
            liquidity: data.liquidity,
            volume24h: data.v24hUSD,
            marketCap: data.mc,
            source: 'birdeye'
          };
        }
      } catch (e) {
        console.log('Birdeye API not available');
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching token data:', error);
    return null;
  }
}

/**
 * Monitor bonding curve progress
 * @param {string} tokenMint - Token mint address
 * @returns {Promise<object>} Progress data
 */
async function monitorBondingCurveProgress(tokenMint) {
  try {
    const curveData = await readBondingCurveData(tokenMint);
    
    if (!curveData) {
      throw new Error('Token is not on Pump.fun or bonding curve not found');
    }
    
    const tokenData = await getTokenDataFromAPI(tokenMint);
    
    // Calculate progress based on liquidity
    // Pump.fun typically migrates at ~85 SOL in bonding curve
    const currentLiquidity = tokenData?.liquidity || 0;
    const progress = Math.min((currentLiquidity / MIGRATION_THRESHOLD_SOL) * 100, 100);
    
    const migrationEligible = progress >= 100;
    
    return {
      tokenMint,
      bondingCurveAddress: curveData.address,
      progress: progress.toFixed(2),
      currentLiquidity,
      migrationThreshold: MIGRATION_THRESHOLD_SOL,
      migrationEligible,
      state: migrationEligible ? PUMPFUN_STATES.MIGRATION_PENDING : PUMPFUN_STATES.BONDING_CURVE
    };
  } catch (error) {
    console.error('Error monitoring bonding curve:', error);
    throw error;
  }
}

/**
 * Buy token on Pump.fun bonding curve
 * @param {object} params - Buy parameters
 * @returns {Promise<string>} Transaction signature
 */
async function buyOnPumpfun(params) {
  const {
    userId,
    tokenMint,
    solAmount,
    slippageBps = 500  // 5% slippage
  } = params;
  
  try {
    console.log('⚠️  Pump.fun Buy Operation');
    console.log('   This requires Pump.fun program instruction building');
    console.log('   Current implementation is a placeholder');
    
    // To implement this, you would need:
    // 1. Pump.fun program IDL (Interface Definition)
    // 2. Instruction builders for swap operations
    // 3. Bonding curve calculation logic
    
    throw new Error(
      'Pump.fun buy operation requires Pump.fun program IDL. ' +
      'This is not publicly documented. ' +
      'Use the Pump.fun website UI for trading.'
    );
  } catch (error) {
    console.error('Error buying on Pump.fun:', error);
    throw error;
  }
}

/**
 * Sell token on Pump.fun bonding curve
 * @param {object} params - Sell parameters
 * @returns {Promise<string>} Transaction signature
 */
async function sellOnPumpfun(params) {
  const {
    userId,
    tokenMint,
    tokenAmount,
    slippageBps = 500
  } = params;
  
  try {
    console.log('⚠️  Pump.fun Sell Operation');
    console.log('   This requires Pump.fun program instruction building');
    
    throw new Error(
      'Pump.fun sell operation requires Pump.fun program IDL. ' +
      'Use the Pump.fun website UI for trading.'
    );
  } catch (error) {
    console.error('Error selling on Pump.fun:', error);
    throw error;
  }
}

/**
 * Launch token on Pump.fun
 * @param {object} params - Launch parameters
 * @returns {Promise<object>} Launch result
 */
async function launchOnPumpfun(params) {
  const {
    userId,
    tokenName,
    tokenSymbol,
    description,
    imageUrl,
    initialBuy = 0
  } = params;
  
  try {
    console.log('⚠️  Pump.fun Token Launch');
    console.log('   Pump.fun does not provide a public API for launches');
    console.log('   Tokens must be launched via the Pump.fun website');
    console.log('');
    console.log('   Alternative: Use the bot to create a Token-2022 token,');
    console.log('   then create a Raydium CP-Swap pool directly.');
    
    throw new Error(
      'Pump.fun does not provide a public API for token launches. ' +
      'Please use the Pump.fun website: https://pump.fun/ ' +
      'Or create a token with /create_token and pool with /create_pool instead.'
    );
  } catch (error) {
    console.error('Error launching on Pump.fun:', error);
    throw error;
  }
}

/**
 * Claim creator rewards (if applicable)
 * @param {object} params - Claim parameters
 * @returns {Promise<string>} Transaction signature
 */
async function claimPumpfunRewards(params) {
  const {
    userId,
    tokenMint
  } = params;
  
  try {
    console.log('⚠️  Pump.fun Rewards Claim');
    console.log('   This requires Pump.fun program instruction building');
    
    throw new Error(
      'Claiming Pump.fun rewards requires knowledge of the program structure. ' +
      'This is not publicly documented.'
    );
  } catch (error) {
    console.error('Error claiming Pump.fun rewards:', error);
    throw error;
  }
}

/**
 * Handle liquidity operation based on token state (State-aware router)
 * @param {string} tokenMint - Token mint address
 * @param {string} operation - Operation type
 * @param {object} params - Operation parameters
 * @returns {Promise<object>} Operation result
 */
async function handleLiquidityOperation(tokenMint, operation, params) {
  try {
    // Check if token is on Pump.fun
    const isPumpfun = await isTokenOnPumpfun(tokenMint);
    
    if (isPumpfun) {
      // Check bonding curve progress
      const progress = await monitorBondingCurveProgress(tokenMint);
      
      if (progress.migrationEligible) {
        console.log('✅ Token has reached migration threshold');
        console.log('   Switching to Raydium operations');
        
        // Update token state
        updateTokenState(tokenMint, PUMPFUN_STATES.MIGRATED_TO_RAYDIUM);
        
        // Use Raydium operations
        const raydium = require('./raydium_impl');
        
        switch (operation) {
          case 'add':
            return await raydium.addLiquidityToPool(params);
          case 'remove':
            return await raydium.removeLiquidityFromPool(params);
          default:
            throw new Error('Invalid operation');
        }
      } else {
        // Still in bonding curve phase
        console.log(`Token is at ${progress.progress}% of bonding curve`);
        console.log('Use Pump.fun website for trading until migration');
        
        throw new Error(
          `Token is still in Pump.fun bonding curve phase (${progress.progress}% complete). ` +
          'Trading must be done on https://pump.fun/ until migration threshold is reached.'
        );
      }
    } else {
      // Not a Pump.fun token, use Raydium directly
      const raydium = require('./raydium_impl');
      
      switch (operation) {
        case 'add':
          return await raydium.addLiquidityToPool(params);
        case 'remove':
          return await raydium.removeLiquidityFromPool(params);
        default:
          throw new Error('Invalid operation');
      }
    }
  } catch (error) {
    console.error('Error handling liquidity operation:', error);
    throw error;
  }
}

/**
 * Check token state and update database
 * @param {string} tokenMint - Token mint address
 * @returns {Promise<object>} Token state
 */
async function checkAndUpdateTokenState(tokenMint) {
  try {
    const isPumpfun = await isTokenOnPumpfun(tokenMint);
    
    if (isPumpfun) {
      const progress = await monitorBondingCurveProgress(tokenMint);
      
      // Update database
      updateTokenPlatform(tokenMint, 'pumpfun');
      updateTokenState(tokenMint, progress.state);
      
      return {
        platform: 'pumpfun',
        state: progress.state,
        progress: progress.progress,
        migrationEligible: progress.migrationEligible
      };
    } else {
      // Check if it's a Raydium token
      const token = getTokenByMint(tokenMint);
      
      return {
        platform: token?.platform || 'standard',
        state: token?.state || 'created',
        progress: null,
        migrationEligible: false
      };
    }
  } catch (error) {
    console.error('Error checking token state:', error);
    throw error;
  }
}

/**
 * Implementation notes for developers
 */
const IMPLEMENTATION_NOTES = `
Pump.fun Integration - Current Status
======================================

WHAT'S IMPLEMENTED:
✅ On-chain bonding curve detection
✅ Progress monitoring via third-party APIs (DexScreener, Birdeye)
✅ State-aware routing (Pump.fun vs Raydium)
✅ Migration threshold detection
✅ Automatic state updates

WHAT'S NOT IMPLEMENTED (Requires Pump.fun Program Knowledge):
❌ Token launch via Pump.fun
❌ Buy/Sell operations on bonding curve
❌ Creator reward claiming
❌ Direct program interaction

WHY:
Pump.fun does not provide:
1. Official public API documentation
2. Program IDL (Interface Definition Language)
3. Instruction builders
4. Launch endpoints

ALTERNATIVES:
1. **For Launching**: Use the Pump.fun website UI
2. **For Trading**: Use the Pump.fun website UI
3. **For Bot**: Create Token-2022 + Raydium pool directly

STATE-AWARE ROUTING:
The bot CAN detect if a token was launched on Pump.fun and:
- Monitor its bonding curve progress
- Detect when it migrates to Raydium
- Automatically switch to Raydium operations after migration

This provides a seamless experience for users who launch on Pump.fun
manually and then want to manage liquidity via the bot.

TO COMPLETE FULL INTEGRATION:
1. Obtain Pump.fun program IDL (if/when available)
2. Implement instruction builders for program interactions
3. Or wait for official Pump.fun API release
`;

module.exports = {
  getBondingCurvePDA,
  readBondingCurveData,
  isTokenOnPumpfun,
  getTokenDataFromAPI,
  monitorBondingCurveProgress,
  buyOnPumpfun,
  sellOnPumpfun,
  launchOnPumpfun,
  claimPumpfunRewards,
  handleLiquidityOperation,
  checkAndUpdateTokenState,
  PUMPFUN_PROGRAM_ID,
  PUMPFUN_STATES,
  IMPLEMENTATION_NOTES
};

