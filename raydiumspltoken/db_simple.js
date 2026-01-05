/**
 * Simple Database Module for Testing
 * Uses JSON file storage instead of SQLite for quick testing
 */

const fs = require('fs');
const path = require('path');

// Data directory
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'bot_data.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// In-memory data store
let data = {
  users: [],
  wallets: [],
  tokens: [],
  pools: [],
  transactions: [],
  user_states: [],
  user_settings: [],
  smart_profit_settings: [],
  wallet_groups: [],
  wallet_group_members: []
};

// Load existing data
function loadData() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const fileData = fs.readFileSync(DB_FILE, 'utf8');
      data = JSON.parse(fileData);
    }
  } catch (error) {
    console.warn('Could not load database, starting fresh');
  }
}

// Save data
function saveData() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving database:', error);
  }
}

// Auto-save every 10 seconds
setInterval(saveData, 10000);

// Initialize
function initializeDatabase() {
  loadData();
  console.log('✅ Database initialized (JSON mode for testing)');
}

// Helper to get next ID
function getNextId(collection) {
  if (data[collection].length === 0) return 1;
  return Math.max(...data[collection].map(item => {
    const keys = Object.keys(item);
    const idKey = keys.find(k => k.endsWith('_id'));
    return idKey ? item[idKey] : 0;
  })) + 1;
}

// User operations
function createOrGetUser(telegramId, username = null) {
  let user = data.users.find(u => u.telegram_id === telegramId);
  
  if (!user) {
    user = {
      user_id: getNextId('users'),
      telegram_id: telegramId,
      telegram_username: username,
      active_wallet_id: null,
      active_token_mint: null,
      created_at: Math.floor(Date.now() / 1000)
    };
    data.users.push(user);
    saveData();
  }
  
  return user;
}

function getUserByTelegramId(telegramId) {
  return data.users.find(u => u.telegram_id === telegramId) || null;
}

function setActiveWallet(userId, walletId) {
  const user = data.users.find(u => u.user_id === userId);
  if (user) {
    user.active_wallet_id = walletId;
    saveData();
  }
}

function setActiveToken(userId, tokenMint) {
  const user = data.users.find(u => u.user_id === userId);
  if (user) {
    user.active_token_mint = tokenMint;
    saveData();
  }
}

// Wallet operations
function saveWallet(userId, address, filePath, walletType, walletName = null) {
  const wallet = {
    wallet_id: getNextId('wallets'),
    user_id: userId,
    wallet_address: address,
    file_path: filePath,
    wallet_name: walletName,
    wallet_type: walletType,
    created_at: Math.floor(Date.now() / 1000)
  };
  data.wallets.push(wallet);
  saveData();
  return wallet;
}

function getUserWallets(userId) {
  return data.wallets.filter(w => w.user_id === userId);
}

function getWalletById(walletId) {
  return data.wallets.find(w => w.wallet_id === walletId) || null;
}

function getWalletByAddress(address) {
  return data.wallets.find(w => w.wallet_address === address) || null;
}

function getActiveWallet(userId) {
  const user = data.users.find(u => u.user_id === userId);
  if (!user || !user.active_wallet_id) return null;
  return getWalletById(user.active_wallet_id);
}

function getUserWalletCount(userId) {
  return data.wallets.filter(w => w.user_id === userId).length;
}

// Token operations
function saveToken(tokenData) {
  const token = {
    token_id: getNextId('tokens'),
    ...tokenData,
    created_at: Math.floor(Date.now() / 1000)
  };
  data.tokens.push(token);
  saveData();
  return token;
}

// Alias for compatibility
function createToken(tokenData) {
  return saveToken(tokenData);
}

function getUserTokens(userId) {
  return data.tokens.filter(t => t.user_id === userId);
}

function getTokenByMint(mintAddress) {
  return data.tokens.find(t => t.mint_address === mintAddress) || null;
}

function getTokenById(tokenId) {
  return data.tokens.find(t => t.token_id === tokenId) || null;
}

function updateTokenState(mintAddress, newState) {
  const token = data.tokens.find(t => t.mint_address === mintAddress);
  if (token) {
    token.state = newState;
    saveData();
  }
}

function updateTokenPlatform(mintAddress, platform) {
  const token = data.tokens.find(t => t.mint_address === mintAddress);
  if (token) {
    token.platform = platform;
    saveData();
  }
}

// Pool operations
function savePool(poolData) {
  const pool = {
    pool_id: getNextId('pools'),
    ...poolData,
    created_at: Math.floor(Date.now() / 1000)
  };
  data.pools.push(pool);
  saveData();
  return pool;
}

// Alias for compatibility
function createPool(poolData) {
  return savePool(poolData);
}

function getPoolByAddress(poolAddress) {
  return data.pools.find(p => p.pool_address === poolAddress) || null;
}

function getTokenPools(tokenId) {
  return data.pools.filter(p => p.token_id === tokenId);
}

function getUserPools(userId) {
  return data.pools.filter(p => {
    const token = data.tokens.find(t => t.token_id === p.token_id);
    return token && token.user_id === userId;
  });
}

// Transaction operations
function saveTransaction(userId, txHash, txType) {
  const transaction = {
    transaction_id: getNextId('transactions'),
    user_id: userId,
    tx_hash: txHash,
    tx_type: txType,
    status: 'pending',
    created_at: Math.floor(Date.now() / 1000)
  };
  data.transactions.push(transaction);
  saveData();
  return transaction;
}

function updateTransactionStatus(txHash, status, errorMessage = null) {
  const tx = data.transactions.find(t => t.tx_hash === txHash);
  if (tx) {
    tx.status = status;
    tx.error_message = errorMessage;
    tx.confirmed_at = status === 'confirmed' ? Math.floor(Date.now() / 1000) : null;
    saveData();
  }
}

function getUserTransactions(userId, limit = 20) {
  return data.transactions
    .filter(t => t.user_id === userId)
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, limit);
}

// State operations
function saveUserState(userId, state, stateData = {}) {
  const existing = data.user_states.findIndex(s => s.user_id === userId);
  const stateObj = {
    user_id: userId,
    current_state: state,
    state_data: JSON.stringify(stateData),
    updated_at: Math.floor(Date.now() / 1000)
  };
  
  if (existing >= 0) {
    data.user_states[existing] = stateObj;
  } else {
    data.user_states.push(stateObj);
  }
  saveData();
}

function getUserState(userId) {
  const state = data.user_states.find(s => s.user_id === userId);
  if (state && state.state_data) {
    try {
      state.state_data = JSON.parse(state.state_data);
    } catch (e) {
      state.state_data = {};
    }
  }
  return state || null;
}

function clearUserState(userId) {
  data.user_states = data.user_states.filter(s => s.user_id !== userId);
  saveData();
}

// Settings operations
function getUserSettings(userId) {
  let settings = data.user_settings.find(s => s.user_id === userId);
  if (!settings) {
    settings = {
      setting_id: getNextId('user_settings'),
      user_id: userId,
      priority_fee_level: 'medium',
      custom_priority_fee: null,
      slippage_tolerance: 100
    };
    data.user_settings.push(settings);
    saveData();
  }

  return settings;
}

function updateUserSettings(userId, updates) {
  const settings = getUserSettings(userId);
  Object.assign(settings, updates);
  saveData();
}

// Smart Profit operations
function getSmartProfitSettings(userId) {
  let settings = data.smart_profit_settings.find(s => s.user_id === userId);
  if (!settings) {
    settings = {
      setting_id: getNextId('smart_profit_settings'),
      user_id: userId,
      enabled: 0,
      token_mint: null,
      profit_threshold_percent: 50.0,
      large_buy_sol_trigger: 5.0,
      large_sell_sol_trigger: 2.0,
      profit_strategy: 'full',
      partial_sell_percent: 50.0,
      trailing_stop_percent: 10.0,
      buy_amount_sol: 0.1
    };
    data.smart_profit_settings.push(settings);
    saveData();
  }
  return settings;
}

function updateSmartProfitSettings(userId, updates) {
  const settings = getSmartProfitSettings(userId);
  Object.assign(settings, updates);
  saveData();
}

// Wallet Group operations
function createWalletGroup(userId, groupName) {
  const group = {
    group_id: getNextId('wallet_groups'),
    user_id: userId,
    group_name: groupName,
    created_at: Math.floor(Date.now() / 1000)
  };
  data.wallet_groups.push(group);
  saveData();
  return group;
}

function getUserWalletGroups(userId) {
  return data.wallet_groups.filter(g => g.user_id === userId);
}

function getWalletGroup(groupId) {
  return data.wallet_groups.find(g => g.group_id === groupId) || null;
}

function addWalletToGroup(groupId, walletId) {
  const existing = data.wallet_group_members.find(
    m => m.group_id === groupId && m.wallet_id === walletId
  );
  if (!existing) {
    data.wallet_group_members.push({
      member_id: getNextId('wallet_group_members'),
      group_id: groupId,
      wallet_id: walletId
    });
    saveData();
  }
}

function removeWalletFromGroup(groupId, walletId) {
  data.wallet_group_members = data.wallet_group_members.filter(
    m => !(m.group_id === groupId && m.wallet_id === walletId)
  );
  saveData();
}

function getGroupWallets(groupId) {
  const members = data.wallet_group_members.filter(m => m.group_id === groupId);
  return members.map(m => getWalletById(m.wallet_id)).filter(w => w !== null);
}

function deleteWalletGroup(groupId) {
  data.wallet_groups = data.wallet_groups.filter(g => g.group_id !== groupId);
  data.wallet_group_members = data.wallet_group_members.filter(m => m.group_id !== groupId);
  saveData();
}

// Dummy db export for compatibility
const db = {
  prepare: () => ({
    run: () => {},
    get: () => null,
    all: () => []
  })
};

module.exports = {
  initializeDatabase,
  db,
  createOrGetUser,
  getUserByTelegramId,
  setActiveWallet,
  setActiveToken,
  saveWallet,
  getUserWallets,
  getWalletById,
  getWalletByAddress,
  getActiveWallet,
  getUserWalletCount,
  saveToken,
  createToken,
  getUserTokens,
  getTokenByMint,
  getTokenById,
  updateTokenState,
  updateTokenPlatform,
  savePool,
  createPool,
  getPoolByAddress,
  getTokenPools,
  getUserPools,
  saveTransaction,
  updateTransactionStatus,
  getUserTransactions,
  saveUserState,
  getUserState,
  clearUserState,
  getUserSettings,
  updateUserSettings,
  getSmartProfitSettings,
  updateSmartProfitSettings,
  createWalletGroup,
  getUserWalletGroups,
  getWalletGroup,
  addWalletToGroup,
  removeWalletFromGroup,
  getGroupWallets,
  deleteWalletGroup
};

