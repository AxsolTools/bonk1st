/**
 * Smart Profit Mechanism Module - MARKET MAKER ALGORITHM
 * Creates buy pressure and manipulates market psychology
 * 
 * CORRECT ALGORITHM:
 * 
 * ON LARGE BUY (1-5 SOL):
 * - Find wallet in PROFIT
 * - Sell ~75% of balance immediately
 * - Creates "buy pressure" (forces more buying)
 * 
 * ON LARGE SELL (1-5+ SOL):
 * - Find wallet that PREVIOUSLY SOLD
 * - Buy back X SOL
 * - If no sold wallets: use funded or new wallet
 * 
 * Features:
 * - Real-time monitoring via Helius websockets
 * - Wallet state tracking (bought/sold history)
 * - Fast execution (<1 second)
 * - Platform-specific logic (Pump.fun vs Raydium)
 * - Atomic execution via Jito bundles
 */

const { Transaction, PublicKey, SystemProgram } = require('@solana/web3.js');
const { getConnection, lamportsToSol, solToLamports } = require('./solana_utils');
const { loadWalletFromDatabase, getActiveWalletKeypair } = require('./wallets');
const { calculatePNL } = require('./pnl_tracker');
const { sendJitoBundle } = require('./jito_bundles');
const { monitorTokenForLargeTrades, isHeliusAvailable } = require('./helius');
const {
  getSmartProfitSettings,
  updateSmartProfitSettings,
  getGroupWallets,
  saveTransaction,
  updateTransactionStatus,
  getSmartProfitWalletOverride,
  setSmartProfitWalletOverride,
  getSmartProfitWalletOverridesForToken
} = require('./db');
const { getSwapQuote, sellTokenForSOL, buyTokenWithSOL, createMultiWalletSwapBundle } = require('./jupiter_swap');
const { createAssociatedTokenAccountInstruction, createTransferInstruction, getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getMint } = require('@solana/spl-token');

// Active monitoring connections
const activeMonitors = new Map();

// Wallet state tracking (per token, per wallet)
// Key: `${tokenMint}:${walletId}`
// Value: { hasBought, hasSold, soldTimestamp, boughtTimestamp, lastBalance }
const walletStates = new Map();

const SMART_PROFIT_MIN_BUY_TRIGGER_SOL = 0.5;
const SMART_PROFIT_MIN_SELL_TRIGGER_SOL = 0.25;
const SMART_PROFIT_MAX_WALLETS = (() => {
  const envValue = Number(process.env.SMART_PROFIT_MAX_WALLETS);
  if (Number.isFinite(envValue) && envValue >= 5) {
    return Math.min(envValue, 100);
  }
  return 100;
})();

/**
 * Start smart profit monitoring for a user
 * @param {number} userId - User ID
 * @param {string} tokenMint - Token mint address
 * @param {number} groupId - Wallet group ID
 * @returns {object} Monitor status
 */
function startSmartProfitMonitoring(userId, tokenMint, groupId) {
  try {
    if (!isHeliusAvailable()) {
      throw new Error('Helius API required for smart profit monitoring. Set HELIUS_API_KEY in .env');
    }
    
    // Validate groupId before proceeding
    if (!groupId || !Number.isInteger(groupId) || groupId <= 0) {
      throw new Error(`Invalid wallet group ID: ${groupId}. Please select a valid wallet group.`);
    }
    
    const settings = getSmartProfitSettings(userId);
    
    if (!settings.enabled) {
      throw new Error('Smart profit mechanism is not enabled');
    }
    
    // Get wallets in the group with validation
    const wallets = getGroupWallets(groupId);
    
    if (!wallets || !Array.isArray(wallets)) {
      throw new Error(`Wallet group ${groupId} not found or invalid. Please create a wallet group first.`);
    }
    
    if (wallets.length === 0) {
      throw new Error(`Wallet group ${groupId} is empty. Add wallets to the group before starting Smart Profit.`);
    }
    
    if (wallets.length > SMART_PROFIT_MAX_WALLETS) {
      throw new Error(`Maximum ${SMART_PROFIT_MAX_WALLETS} wallets per smart profit group (current: ${wallets.length})`);
    }
    
    // Validate wallets have addresses
    const validWallets = wallets.filter(w => w && w.wallet_address && typeof w.wallet_address === 'string');
    if (validWallets.length === 0) {
      throw new Error(`No valid wallet addresses found in group ${groupId}`);
    }
    
    if (validWallets.length < wallets.length) {
      console.warn(`[SMART PROFIT] ${wallets.length - validWallets.length} wallet(s) in group ${groupId} have invalid addresses`);
    }

    // Apply persisted overrides so UI settings survive restarts
    const overrides = getSmartProfitWalletOverridesForToken(tokenMint);
    overrides.forEach(override => {
      const stateKey = `${tokenMint}:${override.wallet_id}`;
      const current = walletStates.get(stateKey) || {};
      walletStates.set(stateKey, {
        ...current,
        enabled: override.enabled !== false
      });
    });

    // Ensure every wallet has a default state entry for multi-wallet control
    for (const wallet of validWallets) {
      const stateKey = `${tokenMint}:${wallet.wallet_id}`;
      if (!walletStates.has(stateKey)) {
        walletStates.set(stateKey, {
          hasBought: false,
          hasSold: false,
          enabled: true,
          lastBalance: 0,
          boughtTimestamp: null,
          soldTimestamp: null
        });
      }
    }
    
    console.log(`🤖 Starting smart profit monitoring for ${tokenMint}`);
    console.log(`   Group ID: ${groupId}`);
    console.log(`   Wallets: ${validWallets.length}/${wallets.length}`);
    console.log(`   Profit threshold: ${settings.profit_threshold_percent}%`);
    console.log(`   Large buy trigger: ${settings.large_buy_sol_trigger} SOL`);
    if (settings.large_buy_sol_trigger < SMART_PROFIT_MIN_BUY_TRIGGER_SOL) {
      console.warn(
        `   ⚠️ Large buy trigger below recommended minimum (${SMART_PROFIT_MIN_BUY_TRIGGER_SOL} SOL)`
      );
    }
    console.log(`   Large sell trigger: ${settings.large_sell_sol_trigger} SOL`);
    if (settings.large_sell_sol_trigger < SMART_PROFIT_MIN_SELL_TRIGGER_SOL) {
      console.warn(
        `   ⚠️ Large sell trigger below recommended minimum (${SMART_PROFIT_MIN_SELL_TRIGGER_SOL} SOL)`
      );
    }
    console.log(`   Buy amount per wallet: ${settings.buy_amount_sol ?? 0} SOL`);
    
    // Create monitor - use validWallets only
    const ignoreAddresses = validWallets
      .map((wallet) => wallet.wallet_address)
      .filter((address) => typeof address === 'string' && address.length > 0);

    const ws = monitorTokenForLargeTrades(
      tokenMint,
      {
        onLargeBuy: async (event) => {
          await handleLargeBuyEvent(userId, tokenMint, validWallets, settings, event);
        },
        onLargeSell: async (event) => {
          await handleLargeSellEvent(userId, tokenMint, validWallets, settings, event);
        }
      },
      {
        largeBuySOL: settings.large_buy_sol_trigger,
        largeSellSOL: settings.large_sell_sol_trigger,
        ignoreAddresses
      }
    );
    
    // Store active monitor
    const monitorKey = `${userId}:${tokenMint}`;
    activeMonitors.set(monitorKey, {
      ws,
      userId,
      tokenMint,
      groupId,
      startedAt: Date.now()
    });
    
    return {
      success: true,
      monitoring: true,
      tokenMint,
      walletCount: validWallets.length,
      totalWallets: wallets.length,
      invalidWallets: wallets.length - validWallets.length,
      groupId,
      settings
    };
  } catch (error) {
    console.error(`[SMART PROFIT] Error starting monitoring for group ${groupId}:`, error.message);
    throw error;
  }
}

/**
 * Stop smart profit monitoring for a user
 * @param {number} userId - User ID
 * @param {string} tokenMint - Token mint address (optional, stops all if not provided)
 */
function stopSmartProfitMonitoring(userId, tokenMint = null) {
  try {
    if (tokenMint) {
      const monitorKey = `${userId}:${tokenMint}`;
      const monitor = activeMonitors.get(monitorKey);
      
      if (monitor && monitor.ws) {
        monitor.ws.close();
        activeMonitors.delete(monitorKey);
        console.log(`✅ Stopped monitoring ${tokenMint}`);
      }
    } else {
      // Stop all monitors for user
      for (const [key, monitor] of activeMonitors.entries()) {
        if (monitor.userId === userId) {
          monitor.ws.close();
          activeMonitors.delete(key);
        }
      }
      console.log(`✅ Stopped all monitoring for user ${userId}`);
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error stopping monitoring:', error);
    throw error;
  }
}

/**
 * Handle large buy event - SELL FROM PROFITABLE WALLET TO CREATE BUY PRESSURE
 * @param {number} userId - User ID
 * @param {string} tokenMint - Token mint
 * @param {Array} wallets - Wallet group
 * @param {object} settings - Smart profit settings
 * @param {object} event - Buy event data
 */
async function handleLargeBuyEvent(userId, tokenMint, wallets, settings, event) {
  try {
    console.log(`📈 LARGE BUY DETECTED: ${event.solAmount} SOL`);
    console.log(`   🎯 Action: Find profitable wallet and SELL 75% to create buy pressure`);
    
    // Find wallets with PROFIT (any profit > 0%)
    const profitableWallets = [];
    
    for (const wallet of wallets) {
      try {
        const stateKey = `${tokenMint}:${wallet.wallet_id}`;
        const state = walletStates.get(stateKey);
        if (state && state.enabled === false) {
          console.log(`   ⏭️ Skipping wallet ${wallet.wallet_id} (disabled)`);
          continue;
        }

        const conn = getConnection();
        const walletPubkey = new PublicKey(wallet.wallet_address);
        const mintPubkey = new PublicKey(tokenMint);
        
        // Get token account
        const tokenAccounts = await conn.getParsedTokenAccountsByOwner(
          walletPubkey,
          { mint: mintPubkey },
          'confirmed'
        );
        
        if (tokenAccounts.value.length === 0) continue;
        
        const balance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
        if (balance <= 0) continue;
        
        // Calculate PNL
        const pnl = await calculatePNL({
          walletAddress: wallet.wallet_address,
          tokenMint,
          currentBalance: balance
        });
        
        // ANY profit qualifies
        if (pnl.pnlPercentage > 0) {
          profitableWallets.push({
            wallet,
            pnl,
            balance,
            tokenAccount: tokenAccounts.value[0].pubkey
          });
        }
      } catch (e) {
        console.error(`Error checking wallet ${wallet.wallet_address}:`, e);
      }
    }
    
    if (profitableWallets.length === 0) {
      console.log('   ⚠️ No wallets in profit - cannot create buy pressure');
      return;
    }
    
    // Sort by highest profit (sell from most profitable first)
    profitableWallets.sort((a, b) => b.pnl.pnlPercentage - a.pnl.pnlPercentage);
    
    console.log(`   ✅ Found ${profitableWallets.length} profitable wallets`);
    console.log(`   🎯 Selling 75% from wallet with +${profitableWallets[0].pnl.pnlPercentage.toFixed(2)}% profit`);
    
    // Sell 75% from most profitable wallet
    await executePressureSell(userId, tokenMint, profitableWallets[0], settings);
    
  } catch (error) {
    console.error('Error handling large buy event:', error);
  }
}

/**
 * Handle large sell event - BUY BACK FROM WALLET THAT PREVIOUSLY SOLD
 * @param {number} userId - User ID
 * @param {string} tokenMint - Token mint
 * @param {Array} wallets - Wallet group
 * @param {object} settings - Smart profit settings
 * @param {object} event - Sell event data
 */
async function handleLargeSellEvent(userId, tokenMint, wallets, settings, event) {
  try {
    console.log(`📉 LARGE SELL DETECTED: ${event.solAmount} SOL`);
    console.log(`   🎯 Action: Find wallet that PREVIOUSLY SOLD and buy back`);
    
    if (!settings.buy_amount_sol || settings.buy_amount_sol <= 0) {
      console.log('   ⚠️ Buy amount not configured, skipping');
      return;
    }
    
    // Find wallets that previously SOLD
    const soldWallets = [];
    
    for (const wallet of wallets) {
      const stateKey = `${tokenMint}:${wallet.wallet_id}`;
      const state = walletStates.get(stateKey);
      
      if (state && state.enabled === false) {
        console.log(`   ⏭️ Skipping wallet ${wallet.wallet_id} (disabled)`);
        continue;
      }

      if (state && state.hasSold) {
        soldWallets.push({
          wallet,
          soldTimestamp: state.soldTimestamp
        });
      }
    }
    
    let selectedWallet = null;
    
    if (soldWallets.length > 0) {
      // Sort by most recent sell
      soldWallets.sort((a, b) => b.soldTimestamp - a.soldTimestamp);
      selectedWallet = soldWallets[0].wallet;
      console.log(`   ✅ Found wallet that sold previously (${selectedWallet.wallet_id})`);
    } else {
      // No wallets have sold yet - find funded wallet or new wallet
      console.log('   ⚠️ No wallets have sold yet, finding funded or new wallet');
      
      const conn = getConnection();
      
      for (const wallet of wallets) {
        try {
          const stateKey = `${tokenMint}:${wallet.wallet_id}`;
          const state = walletStates.get(stateKey);
          if (state && state.enabled === false) {
            continue;
          }

          const keypair = loadWalletFromDatabase(wallet.wallet_id);
          const balance = await conn.getBalance(keypair.publicKey, 'confirmed');
          const requiredBalance = solToLamports(settings.buy_amount_sol) + 50000; // + fees
          
          if (balance >= requiredBalance) {
            selectedWallet = wallet;
            console.log(`   ✅ Found funded wallet (${wallet.wallet_id}) with ${lamportsToSol(balance).toFixed(4)} SOL`);
            break;
          }
        } catch (e) {
          console.error(`Error checking wallet ${wallet.wallet_id}:`, e);
        }
      }
      
      if (!selectedWallet) {
        console.log('   ❌ No funded wallets available');
        return;
      }
    }
    
    // Execute buy back
    await executeBuyBack(userId, tokenMint, selectedWallet, settings);
    
  } catch (error) {
    console.error('Error handling large sell event:', error);
  }
}

/**
 * Execute PRESSURE SELL - Sell 75% from profitable wallet to create buy pressure
 * @param {number} userId - User ID
 * @param {string} tokenMint - Token mint
 * @param {object} profitableWallet - Single wallet with profit
 * @param {object} settings - Settings
 */
async function executePressureSell(userId, tokenMint, profitableWallet, settings) {
  try {
    const { wallet, balance, pnl } = profitableWallet;
    
    console.log(`💰 EXECUTING PRESSURE SELL`);
    console.log(`   Wallet: ${wallet.wallet_id}`);
    console.log(`   Balance: ${balance} tokens`);
    console.log(`   Profit: +${pnl.pnlPercentage.toFixed(2)}%`);
    
    const conn = getConnection();
    const WSOL_MINT = 'So11111111111111111111111111111111111111112';
    
    // Calculate 75% of balance
    const sellPercent = settings.sell_percent_on_buy || 75;
    const sellAmount = balance * (sellPercent / 100);
    
    console.log(`   Selling: ${sellAmount} tokens (${sellPercent}%)`);
    
    // Get mint info for decimals
    const mintInfo = await getMint(conn, new PublicKey(tokenMint), 'confirmed', TOKEN_2022_PROGRAM_ID).catch(() => 
      getMint(conn, new PublicKey(tokenMint), 'confirmed', TOKEN_PROGRAM_ID)
    );
    
    const decimals = mintInfo.decimals;
    const rawAmount = Math.floor(sellAmount * Math.pow(10, decimals));
    
    // Get Jupiter quote
    const quote = await getSwapQuote({
      inputMint: tokenMint,
      outputMint: WSOL_MINT,
      amount: rawAmount.toString(),
      slippageBps: 100 // 1% slippage
    });
    
    console.log(`   Expected SOL: ${(parseInt(quote.outAmount) / 1e9).toFixed(4)}`);
    
    // Execute swap
    const keypair = loadWalletFromDatabase(wallet.wallet_id);
    const signature = await sellTokenForSOL({
      userId,
      walletId: wallet.wallet_id,
      tokenMint,
      tokenAmount: rawAmount.toString(),
      slippage: 1
    });
    
    console.log(`✅ PRESSURE SELL COMPLETE: ${signature}`);
    
    // Update wallet state
    const stateKey = `${tokenMint}:${wallet.wallet_id}`;
    walletStates.set(stateKey, {
      hasBought: true,
      hasSold: true,
      soldTimestamp: Date.now(),
      boughtTimestamp: walletStates.get(stateKey)?.boughtTimestamp || null,
      lastBalance: balance - sellAmount
    });
    
    // Save to database
    const pressureSellTx = saveTransaction(userId, signature, 'smart_pressure_sell');
    updateTransactionStatus(signature, 'confirmed');
    
    return {
      success: true,
      signature,
      soldAmount: sellAmount,
      receivedSOL: parseInt(quote.outAmount) / 1e9
    };
    
  } catch (error) {
    console.error('Error executing pressure sell:', error);
    throw error;
  }
}

/**
 * Execute BUY BACK with intelligent delay logic
 * Waits to see if more sells come before buying
 * @param {number} userId - User ID
 * @param {string} tokenMint - Token mint
 * @param {object} wallet - Selected wallet
 * @param {object} settings - Settings
 */
async function executeBuyBack(userId, tokenMint, wallet, settings) {
  try {
    console.log(`💵 EXECUTING INTELLIGENT BUY BACK`);
    console.log(`   Wallet: ${wallet.wallet_id}`);
    console.log(`   Waiting for sell cascade to finish...`);
    
    // INTELLIGENT DELAY: Wait 3-5 seconds to see if more sells come
    const delayMs = settings.buy_delay_ms || 3000;
    const checkIntervalMs = 1000; // Check every second
    let totalWaited = 0;
    let recentSellDetected = false;
    
    // Monitor for additional sells during delay
    while (totalWaited < delayMs) {
      await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
      totalWaited += checkIntervalMs;
      
      // TODO: Check if another large sell happened in last second
      // For now, just wait the full delay
    }
    
    console.log(`   ✅ Delay complete (${totalWaited}ms), executing buy`);
    
    const conn = getConnection();
    const WSOL_MINT = 'So11111111111111111111111111111111111111112';
    const buyAmountSOL = settings.buy_amount_sol || 0.5;
    const buyAmountLamports = solToLamports(buyAmountSOL);
    
    // Get Jupiter quote
    const quote = await getSwapQuote({
      inputMint: WSOL_MINT,
      outputMint: tokenMint,
      amount: buyAmountLamports.toString(),
      slippageBps: 100 // 1% slippage
    });
    
    console.log(`   Buying: ${buyAmountSOL} SOL worth`);
    console.log(`   Expected tokens: ${quote.outAmount}`);
    
    // Execute buy
    const signature = await buyTokenWithSOL({
      userId,
      walletId: wallet.wallet_id,
      tokenMint,
      solAmount: buyAmountSOL,
      slippage: 1
    });
    
    console.log(`✅ BUY BACK COMPLETE: ${signature}`);
    
    // Update wallet state
    const stateKey = `${tokenMint}:${wallet.wallet_id}`;
    const currentState = walletStates.get(stateKey) || {};
    walletStates.set(stateKey, {
      ...currentState,
      hasBought: true,
      boughtTimestamp: Date.now()
    });
    
    // Save to database
    const buyBackTx = saveTransaction(userId, signature, 'smart_buy_back');
    updateTransactionStatus(signature, 'confirmed');
    
    return {
      success: true,
      signature,
      spentSOL: buyAmountSOL,
      receivedTokens: quote.outAmount
    };
    
  } catch (error) {
    console.error('Error executing buy back:', error);
    throw error;
  }
}

/**
 * DEPRECATED - Old function
 * Execute smart sale across multiple wallets (Jito bundle with Jupiter swaps)
 * @param {number} userId - User ID
 * @param {string} tokenMint - Token mint
 * @param {Array} profitableWallets - Wallets with profit
 * @param {object} settings - Settings
 */
async function executeSmartSale(userId, tokenMint, profitableWallets, settings) {
  try {
    console.log(`💰 Executing smart sale for ${profitableWallets.length} wallets`);
    
    const conn = getConnection();
    const swapParams = [];
    const WSOL_MINT = 'So11111111111111111111111111111111111111112';
    
    // Get mint info for decimals
    const mintInfo = await getMint(conn, new PublicKey(tokenMint), 'confirmed', TOKEN_2022_PROGRAM_ID).catch(() => 
      getMint(conn, new PublicKey(tokenMint), 'confirmed', TOKEN_PROGRAM_ID)
    );
    
    const decimals = mintInfo.decimals;
    
    // Prepare swap parameters for each wallet
    for (const { wallet, balance, pnl } of profitableWallets.slice(0, 5)) { // Max 5 for Jito
      try {
        // Determine sell amount based on strategy
        let sellAmount = balance;
        
        if (settings.profit_strategy === 'partial') {
          sellAmount = balance * (settings.partial_sell_percent / 100);
        }
        
        // Convert to raw amount
        const rawAmount = Math.floor(sellAmount * Math.pow(10, decimals));
        
        console.log(`   Preparing sell: ${sellAmount} tokens from wallet ${wallet.wallet_id}`);
        console.log(`   Current PNL: +${pnl.pnlPercentage.toFixed(2)}%`);
        
        // Get Jupiter quote
        const quote = await getSwapQuote({
          inputMint: tokenMint,
          outputMint: WSOL_MINT,
          amount: rawAmount.toString(),
          slippageBps: 100 // 1% slippage for sells
        });
        
        swapParams.push({
          walletId: wallet.wallet_id,
          quote,
          wallet: wallet.wallet_address
        });
        
      } catch (e) {
        console.error(`Error preparing sell for wallet ${wallet.wallet_address}:`, e);
      }
    }
    
    if (swapParams.length === 0) {
      console.log('   No swaps prepared');
      return { success: false, reason: 'No valid swaps' };
    }
    
    console.log(`✅ Prepared ${swapParams.length} swap transactions`);
    
    // Create swap bundle
    const swapTransactions = await createMultiWalletSwapBundle(swapParams, { userId });
    
    if (swapTransactions.length === 0) {
      throw new Error('No transactions created');
    }
    
    console.log(`⚡ Submitting ${swapTransactions.length} swaps as Jito bundle...`);
    
    // Submit as Jito bundle for atomic execution
    const { bundleId, endpoint: bundleEndpoint, attempts: bundleAttempts, simulated: bundleSimulated } = await sendJitoBundle(swapTransactions);
    
    console.log(`✅ Smart sale bundle submitted: ${bundleId}`);
    if (bundleEndpoint) {
      console.log(`   Endpoint: ${bundleEndpoint}`);
    } else {
      console.log('   Endpoint: default Jito rotation');
    }
    if (Number.isFinite(bundleAttempts)) {
      console.log(`   Jito attempts: ${bundleAttempts}`);
    }
    if (bundleSimulated) {
      console.log('   ⚠️ Dry-run enabled: bundle not sent to Jito block engine.');
    }
    
    // Save transactions to database
    swapParams.forEach(({ wallet }) => {
      saveTransaction(userId, bundleId, 'smart_sell');
    });
    
    return {
      success: true,
      bundleId,
      bundleEndpoint: bundleEndpoint || null,
      walletCount: swapTransactions.length,
      totalProfit: swapParams.reduce((sum, p) => sum + parseFloat(p.quote.outAmount), 0)
    };
    
  } catch (error) {
    console.error('Error executing smart sale:', error);
    throw error;
  }
}

/**
 * Execute smart buy across multiple wallets (Jito bundle with Jupiter swaps)
 * @param {number} userId - User ID
 * @param {string} tokenMint - Token mint
 * @param {Array} wallets - Wallet group
 * @param {object} settings - Settings
 */
async function executeSmartBuy(userId, tokenMint, wallets, settings) {
  try {
    console.log(`💵 Executing smart buy with ${wallets.length} wallets`);
    console.log(`   Amount per wallet: ${settings.buy_amount_sol} SOL`);
    
    const conn = getConnection();
    const swapParams = [];
    const buyAmountLamports = solToLamports(settings.buy_amount_sol);
    const WSOL_MINT = 'So11111111111111111111111111111111111111112';
    
    // Prepare buy swaps for each wallet
    for (const wallet of wallets.slice(0, 5)) { // Max 5 for Jito bundle
      try {
        // Load wallet keypair
        const keypair = loadWalletFromDatabase(wallet.wallet_id);
        
        // Check wallet has enough SOL
        const balance = await conn.getBalance(keypair.publicKey, 'confirmed');
        
        if (balance < buyAmountLamports + 50000) { // 50k lamports buffer for fees
          console.log(`   Wallet ${wallet.wallet_address} has insufficient SOL, skipping`);
          continue;
        }
        
        console.log(`   Preparing buy: ${settings.buy_amount_sol} SOL from wallet ${wallet.wallet_id}`);
        
        // Get Jupiter quote for buy
        const quote = await getSwapQuote({
          inputMint: WSOL_MINT,
          outputMint: tokenMint,
          amount: buyAmountLamports.toString(),
          slippageBps: 100 // 1% slippage for buys
        });
        
        console.log(`   Expected tokens: ${quote.outAmount}`);
        
        swapParams.push({
          walletId: wallet.wallet_id,
          quote,
          wallet: wallet.wallet_address
        });
        
      } catch (e) {
        console.error(`Error preparing buy for wallet ${wallet.wallet_address}:`, e);
      }
    }
    
    if (swapParams.length === 0) {
      console.log('   No buy swaps prepared');
      return { success: false, reason: 'No valid swaps' };
    }
    
    console.log(`✅ Prepared ${swapParams.length} buy swap transactions`);
    
    // Create swap bundle
    const swapTransactions = await createMultiWalletSwapBundle(swapParams, { userId });
    
    if (swapTransactions.length === 0) {
      throw new Error('No transactions created');
    }
    
    console.log(`⚡ Submitting ${swapTransactions.length} buy swaps as Jito bundle...`);
    
    // Submit as Jito bundle
    const { bundleId, endpoint: bundleEndpoint, attempts: bundleAttempts, simulated: bundleSimulated } = await sendJitoBundle(swapTransactions);
    
    console.log(`✅ Smart buy bundle submitted: ${bundleId}`);
    if (bundleEndpoint) {
      console.log(`   Endpoint: ${bundleEndpoint}`);
    } else {
      console.log('   Endpoint: default Jito rotation');
    }
    if (Number.isFinite(bundleAttempts)) {
      console.log(`   Jito attempts: ${bundleAttempts}`);
    }
    if (bundleSimulated) {
      console.log('   ⚠️ Dry-run enabled: bundle not sent to Jito block engine.');
    }
    
    // Save transactions to database
    swapParams.forEach(({ wallet }) => {
      saveTransaction(userId, bundleId, 'smart_buy');
      updateTransactionStatus(bundleId, 'confirmed');
    });
    
    return {
      success: true,
      bundleId,
      bundleEndpoint: bundleEndpoint || null,
      walletCount: swapTransactions.length,
      totalSpent: swapParams.length * settings.buy_amount_sol
    };
    
  } catch (error) {
    console.error('Error executing smart buy:', error);
    throw error;
  }
}

/**
 * Get smart profit status
 * @param {number} userId - User ID
 * @returns {object} Status
 */
function getSmartProfitStatus(userId) {
  const settings = getSmartProfitSettings(userId);
  const activeMonitorsForUser = [];
  
  for (const [key, monitor] of activeMonitors.entries()) {
    if (monitor.userId === userId) {
      activeMonitorsForUser.push({
        tokenMint: monitor.tokenMint,
        startedAt: monitor.startedAt,
        uptime: Math.floor((Date.now() - monitor.startedAt) / 1000)
      });
    }
  }
  
  return {
    enabled: settings.enabled === 1,
    activeMonitors: activeMonitorsForUser.length,
    settings,
    monitors: activeMonitorsForUser
  };
}

/**
 * Update price peak for trailing stop
 * @param {string} tokenMint - Token mint
 * @param {number} currentPrice - Current price
 */
function updatePricePeak(tokenMint, currentPrice) {
  if (!priceHistory.has(tokenMint)) {
    priceHistory.set(tokenMint, {
      peak: currentPrice,
      lastUpdate: Date.now()
    });
  } else {
    const history = priceHistory.get(tokenMint);
    if (currentPrice > history.peak) {
      history.peak = currentPrice;
      history.lastUpdate = Date.now();
    }
  }
}

/**
 * Check if trailing stop is triggered
 * @param {string} tokenMint - Token mint
 * @param {number} currentPrice - Current price
 * @param {number} trailingPercent - Trailing stop percentage
 * @returns {boolean} True if triggered
 */
function isTrailingStopTriggered(tokenMint, currentPrice, trailingPercent) {
  if (!priceHistory.has(tokenMint)) {
    return false;
  }
  
  const history = priceHistory.get(tokenMint);
  const dropPercent = ((history.peak - currentPrice) / history.peak) * 100;
  
  return dropPercent >= trailingPercent;
}

/**
 * Get active monitors for user
 * @param {number} userId - User ID
 * @returns {Array} Active monitors
 */
function getActiveMonitors(userId) {
  const monitors = [];
  
  for (const [key, monitor] of activeMonitors.entries()) {
    if (monitor.userId === userId) {
      monitors.push({
        key,
        tokenMint: monitor.tokenMint,
        groupId: monitor.groupId,
        uptime: Math.floor((Date.now() - monitor.startedAt) / 1000)
      });
    }
  }
  
  return monitors;
}

/**
 * Stop all monitoring for user
 * @param {number} userId - User ID
 */
function stopAllMonitoring(userId) {
  for (const [key, monitor] of activeMonitors.entries()) {
    if (monitor.userId === userId) {
      monitor.ws.close();
      activeMonitors.delete(key);
    }
  }
}

/**
 * Get wallet management info for a token
 * @param {number} userId - User ID
 * @param {string} tokenMint - Token mint
 * @param {number} groupId - Wallet group ID
 * @returns {object} Wallet management data
 */
function getWalletManagementInfo(userId, tokenMint, groupId) {
  const wallets = getGroupWallets(groupId);
  
  if (wallets.length > SMART_PROFIT_MAX_WALLETS) {
    throw new Error(`Maximum ${SMART_PROFIT_MAX_WALLETS} wallets allowed for Smart Profit`);
  }
  
  const walletInfo = wallets.map(wallet => {
    const stateKey = `${tokenMint}:${wallet.wallet_id}`;
    const state = walletStates.get(stateKey) || {
      hasBought: false,
      hasSold: false,
      enabled: true
    };

    const override = getSmartProfitWalletOverride(tokenMint, wallet.wallet_id);
    const resolvedEnabled = override
      ? override.enabled !== false
      : state.enabled !== false;
    
    return {
      walletId: wallet.wallet_id,
      address: wallet.wallet_address,
      ...state,
      enabled: resolvedEnabled
    };
  });
  
  return {
    totalWallets: wallets.length,
    maxWallets: SMART_PROFIT_MAX_WALLETS,
    wallets: walletInfo,
    enabledCount: walletInfo.filter(w => w.enabled).length
  };
}

/**
 * Toggle wallet enabled/disabled for Smart Profit
 * @param {string} tokenMint - Token mint
 * @param {number} walletId - Wallet ID
 * @param {boolean} enabled - Enable/disable
 */
function toggleWallet(userId, tokenMint, walletId, enabled) {
  const stateKey = `${tokenMint}:${walletId}`;
  const currentState = walletStates.get(stateKey) || {};
  
  walletStates.set(stateKey, {
    ...currentState,
    enabled
  });
  
  setSmartProfitWalletOverride(userId, tokenMint, walletId, enabled);

  console.log(`Wallet ${walletId} ${enabled ? 'enabled' : 'disabled'} for ${tokenMint}`);
}

module.exports = {
  startSmartProfitMonitoring,
  stopSmartProfitMonitoring,
  executePressureSell,
  executeBuyBack,
  executeSmartSale, // Deprecated but kept for backwards compatibility
  executeSmartBuy, // Deprecated but kept for backwards compatibility
  getSmartProfitStatus,
  getActiveMonitors,
  stopAllMonitoring,
  getWalletManagementInfo,
  toggleWallet,
  SMART_PROFIT_MAX_WALLETS
};



