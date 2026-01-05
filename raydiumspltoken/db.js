/**
 * Simple Database Module for Testing
 * Uses JSON file storage instead of SQLite for quick testing
 */

const fs = require('fs');
const path = require('path');

// Data directory
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'bot_data.json');
const USER_DATA_DIR = path.join(__dirname, '..', 'user_data');

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
  wallet_group_members: [],
  bundle_groups: [],
  bundle_group_members: [],
  smart_profit_wallet_overrides: [],
  hsmac_rules: [],
  hsmac_profiles: [],
  audit_logs: [],
  dashboard_selections: []
};

function safeJsonParse(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`[DB] Failed to parse ${filePath}:`, error.message);
    return null;
  }
}

// Load existing data
function loadData() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const fileData = fs.readFileSync(DB_FILE, 'utf8');
      data = JSON.parse(fileData);

      if (!Array.isArray(data.bundle_groups)) {
        data.bundle_groups = [];
      }
      if (!Array.isArray(data.bundle_group_members)) {
        data.bundle_group_members = [];
      }
      if (!Array.isArray(data.smart_profit_wallet_overrides)) {
        data.smart_profit_wallet_overrides = [];
      }
      if (!Array.isArray(data.hsmac_rules)) {
        data.hsmac_rules = [];
      }
      if (!Array.isArray(data.hsmac_profiles)) {
        data.hsmac_profiles = [];
      }
      if (!Array.isArray(data.audit_logs)) {
        data.audit_logs = [];
      }
      if (!Array.isArray(data.dashboard_selections)) {
        data.dashboard_selections = [];
      }
      if (!Array.isArray(data.wallets)) {
        data.wallets = [];
      }
      data.wallets.forEach((wallet) => {
        if (wallet.archived !== true) {
          wallet.archived = false;
        }
        if (wallet.archive_reason === undefined) {
          wallet.archive_reason = null;
        }
        if (wallet.archived_at === undefined) {
          wallet.archived_at = null;
        }
      });
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

function updateUserWalletFileArchiveStatus(wallet, { archived, reason = null } = {}) {
  if (!wallet?.file_path) {
    return;
  }
  try {
    if (!fs.existsSync(wallet.file_path)) {
      return;
    }
    const fileContent = fs.readFileSync(wallet.file_path, 'utf8');
    const userData = JSON.parse(fileContent);
    if (!userData || !Array.isArray(userData.wallets)) {
      return;
    }
    const entry = userData.wallets.find(
      (record) => record.public_key === wallet.wallet_address
    );
    if (!entry) {
      return;
    }
    entry.archived = Boolean(archived);
    entry.archived_at = archived ? new Date().toISOString() : null;
    entry.archive_reason = archived ? reason || null : null;
    fs.writeFileSync(wallet.file_path, JSON.stringify(userData, null, 2), {
      encoding: 'utf8',
      mode: 0o600
    });
  } catch (error) {
    console.warn('[DB] Failed to update user wallet archive tag:', error.message);
  }
}

function normalizeTokenInput(tokenData = {}) {
  const coalesce = (...values) => {
    for (const value of values) {
      if (value !== undefined && value !== null && value !== '') {
        return value;
      }
    }
    return null;
  };

  const normalizeNumber = (value) => {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };

  const normalized = {
    user_id: coalesce(tokenData.user_id, tokenData.userId),
    wallet_id: coalesce(tokenData.wallet_id, tokenData.walletId),
    mint_address: coalesce(
      tokenData.mint_address,
      tokenData.mintAddress,
      tokenData.mint
    ),
    token_name: coalesce(
      tokenData.token_name,
      tokenData.tokenName,
      tokenData.name
    ),
    token_symbol: coalesce(
      tokenData.token_symbol,
      tokenData.tokenSymbol,
      tokenData.symbol
    ),
    decimals: normalizeNumber(tokenData.decimals),
    total_supply: coalesce(tokenData.total_supply, tokenData.totalSupply),
    metadata_uri: coalesce(tokenData.metadata_uri, tokenData.metadataUri),
    description: coalesce(
      tokenData.description,
      tokenData.token_description,
      tokenData.tokenDescription
    ),
    icon_url: coalesce(tokenData.icon_url, tokenData.iconUrl, tokenData.imageUrl),
    platform: coalesce(tokenData.platform, tokenData.launchPlatform),
    state: coalesce(tokenData.state, tokenData.status, tokenData.token_state),
    creator_wallet: coalesce(tokenData.creator_wallet, tokenData.creatorWallet),
    bundle_id: coalesce(tokenData.bundle_id, tokenData.bundleId),
    bundle_endpoint: coalesce(tokenData.bundle_endpoint, tokenData.bundleEndpoint),
    notes: coalesce(tokenData.notes, tokenData.token_notes),
    extra: tokenData.extra ?? null
  };

  return normalized;
}

function migrateExistingTokens() {
  if (!Array.isArray(data.tokens) || data.tokens.length === 0) {
    return 0;
  }

  let updated = 0;

  data.tokens = data.tokens.map((token) => {
    const normalized = normalizeTokenInput(token);
    let mutated = false;

    for (const [key, value] of Object.entries(normalized)) {
      if (value !== null && value !== undefined && token[key] === undefined) {
        token[key] = value;
        mutated = true;
      }
    }

    if (token.mint_address && !token.mintAddress) {
      token.mintAddress = token.mint_address;
      mutated = true;
    }
    if (token.token_name && !token.tokenName) {
      token.tokenName = token.token_name;
      mutated = true;
    }
    if (token.token_symbol && !token.tokenSymbol) {
      token.tokenSymbol = token.token_symbol;
      mutated = true;
    }

    if (mutated) {
      updated += 1;
    }

    return token;
  });

  return updated;
}

function ensureUserForRecovery(telegramId, username = null) {
  if (!Number.isFinite(telegramId)) {
    return null;
  }

  let user = data.users.find((u) => u.telegram_id === telegramId);

  if (!user) {
    user = {
      user_id: getNextId('users'),
      telegram_id: telegramId,
      telegram_username: username || null,
      active_wallet_id: null,
      active_token_mint: null,
      created_at: Math.floor(Date.now() / 1000)
    };
    data.users.push(user);
    return { user, created: true, updated: false };
  }

  let updated = false;

  if (!user.telegram_username && username) {
    user.telegram_username = username;
    updated = true;
  }

  return { user, created: false, updated };
}

function rehydrateWalletsFromUserFiles() {
  if (!fs.existsSync(USER_DATA_DIR)) {
    return { imported: 0, usersAdded: 0, usersUpdated: 0 };
  }

  let imported = 0;
  let usersAdded = 0;
  let usersUpdated = 0;

  const files = fs.readdirSync(USER_DATA_DIR).filter((file) => file.endsWith('.json'));

  for (const fileName of files) {
    const filePath = path.join(USER_DATA_DIR, fileName);
    const payload = safeJsonParse(filePath);

    if (!payload || !Array.isArray(payload.wallets) || payload.wallets.length === 0) {
      continue;
    }

    const telegramId = Number.parseInt(path.parse(fileName).name, 10);
    const defaultUsername = payload.wallets.find((entry) => entry?.username)?.username || null;
    const userInfo = ensureUserForRecovery(telegramId, defaultUsername);
    const userRecord = userInfo?.user || null;

    if (userInfo?.created) {
      usersAdded += 1;
    } else if (userInfo?.updated) {
      usersUpdated += 1;
    }

    payload.wallets.forEach((walletEntry) => {
      const walletAddress = typeof walletEntry.public_key === 'string'
        ? walletEntry.public_key.trim()
        : null;

      if (!walletAddress) {
        return;
      }

      const alreadyStored = data.wallets.some(
        (wallet) => wallet.wallet_address === walletAddress
      );

      if (alreadyStored) {
        return;
      }

      const createdAt = walletEntry.timestamp
        ? Math.floor(new Date(walletEntry.timestamp).getTime() / 1000)
        : Math.floor(Date.now() / 1000);

      const walletRecord = {
        wallet_id: getNextId('wallets'),
        user_id: userRecord ? userRecord.user_id : null,
        wallet_address: walletAddress,
        file_path: filePath,
        wallet_name: walletEntry.wallet_name || null,
        wallet_type: walletEntry.wallet_type || null,
        created_at: createdAt
      };

      data.wallets.push(walletRecord);
      imported += 1;

      if (userRecord && !userRecord.active_wallet_id) {
        userRecord.active_wallet_id = walletRecord.wallet_id;
      }
    });
  }

  return { imported, usersAdded, usersUpdated };
}

// Initialize
function initializeDatabase() {
  loadData();
  const walletRecovery = rehydrateWalletsFromUserFiles();
  const tokenFixes = migrateExistingTokens();

  if (
    walletRecovery.imported > 0 ||
    walletRecovery.usersAdded > 0 ||
    walletRecovery.usersUpdated > 0 ||
    tokenFixes > 0
  ) {
    saveData();
    console.log(
      `🩹 Database repairs — wallets imported: ${walletRecovery.imported}, ` +
      `users added: ${walletRecovery.usersAdded}, users updated: ${walletRecovery.usersUpdated}, ` +
      `tokens normalized: ${tokenFixes}`
    );
  }

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

function getUserById(userId) {
  return data.users.find((u) => u.user_id === userId) || null;
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
    created_at: Math.floor(Date.now() / 1000),
    archived: false,
    archive_reason: null,
    archived_at: null
  };
  data.wallets.push(wallet);
  saveData();
  return wallet;
}

function getUserWallets(userId, options = {}) {
  const includeArchived = options.includeArchived === true;
  const onlyArchived = options.onlyArchived === true;
  return data.wallets.filter((w) => {
    if (w.user_id !== userId) {
      return false;
    }
    if (onlyArchived) {
      return w.archived === true;
    }
    if (includeArchived) {
      return true;
    }
    return w.archived !== true;
  });
}

function getWalletById(walletId) {
  return data.wallets.find(w => w.wallet_id === walletId) || null;
}

function updateWalletName(walletId, walletName) {
  const wallet = data.wallets.find(w => w.wallet_id === walletId);
  if (!wallet) {
    return null;
  }

  wallet.wallet_name = walletName;
  wallet.updated_at = Math.floor(Date.now() / 1000);
  saveData();
  return wallet;
}

function getWalletByAddress(address) {
  return data.wallets.find(w => w.wallet_address === address) || null;
}

function getActiveWallet(userId) {
  const user = data.users.find(u => u.user_id === userId);
  if (!user || !user.active_wallet_id) return null;
  return getWalletById(user.active_wallet_id);
}

function getUserWalletCount(userId, options = {}) {
  const includeArchived = options.includeArchived === true;
  const onlyArchived = options.onlyArchived === true;
  return data.wallets.filter((w) => {
    if (w.user_id !== userId) {
      return false;
    }
    if (onlyArchived) {
      return w.archived === true;
    }
    if (includeArchived) {
      return true;
    }
    return w.archived !== true;
  }).length;
}

function archiveWallet(walletId, options = {}) {
  const wallet = getWalletById(walletId);
  if (!wallet) {
    return { success: false, reason: 'not_found' };
  }
  if (wallet.archived) {
    return { success: false, reason: 'already_archived' };
  }

  wallet.archived = true;
  wallet.archive_reason = options.reason || null;
  wallet.archived_at = Math.floor(Date.now() / 1000);
  updateUserWalletFileArchiveStatus(wallet, {
    archived: true,
    reason: wallet.archive_reason
  });

  // Remove from wallet groups and bundle groups
  data.wallet_group_members = data.wallet_group_members.filter((member) => member.wallet_id !== walletId);
  data.bundle_group_members = data.bundle_group_members.filter((member) => member.wallet_id !== walletId);

  // Update active wallet if necessary
  const user = data.users.find((u) => u.user_id === wallet.user_id);
  if (user && user.active_wallet_id === walletId) {
    const replacement = data.wallets.find(
      (candidate) => candidate.user_id === wallet.user_id && candidate.wallet_id !== walletId && candidate.archived !== true
    );
    user.active_wallet_id = replacement ? replacement.wallet_id : null;
  }

  if (!options.skipSave) {
    saveData();
  }
  return { success: true };
}

function archiveWallets(walletIds = [], options = {}) {
  if (!Array.isArray(walletIds) || walletIds.length === 0) {
    return { archived: 0, skipped: 0 };
  }
  let archived = 0;
  let skipped = 0;
  walletIds.forEach((walletId) => {
    const result = archiveWallet(walletId, { ...options, skipSave: true });
    if (result.success) {
      archived += 1;
    } else {
      skipped += 1;
    }
  });
  saveData();
  return { archived, skipped };
}

function restoreWallet(walletId, options = {}) {
  const wallet = getWalletById(walletId);
  if (!wallet) {
    return { success: false, reason: 'not_found' };
  }
  if (!wallet.archived) {
    return { success: false, reason: 'not_archived' };
  }

  wallet.archived = false;
  wallet.archive_reason = null;
  wallet.archived_at = null;
  updateUserWalletFileArchiveStatus(wallet, { archived: false });

  const user = data.users.find((u) => u.user_id === wallet.user_id);
  if (user && !user.active_wallet_id) {
    user.active_wallet_id = wallet.wallet_id;
  }

  if (!options.skipSave) {
    saveData();
  }
  return { success: true };
}

// Token operations
function saveToken(tokenData = {}) {
  const normalized = normalizeTokenInput(tokenData);
  const { user_id, wallet_id, mint_address } = normalized;
  
  if (user_id && !data.users.find(u => u.user_id === user_id)) {
    throw new Error(`User ${user_id} not found`);
  }
  if (wallet_id && !data.wallets.find(w => w.wallet_id === wallet_id)) {
    throw new Error(`Wallet ${wallet_id} not found`);
  }
  if (mint_address && data.tokens.find(t => t.mint_address === mint_address)) {
    throw new Error(`Token ${mint_address} already exists`);
  }
  
  const timestamp = Math.floor(Date.now() / 1000);
  const token = {
    token_id: getNextId('tokens'),
    ...tokenData,
    ...normalized,
    created_at: timestamp
  };

  if (!token.mintAddress && token.mint_address) {
    token.mintAddress = token.mint_address;
  }
  if (!token.tokenName && token.token_name) {
    token.tokenName = token.token_name;
  }
  if (!token.tokenSymbol && token.token_symbol) {
    token.tokenSymbol = token.token_symbol;
  }
  
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

function updateToken(tokenId, updates) {
  const token = data.tokens.find(t => t.token_id === tokenId);
  if (!token) {
    return null;
  }
  Object.assign(token, updates);
  token.updated_at = Math.floor(Date.now() / 1000);
  saveData();
  return token;
}

function getAllUsers() {
  return Array.isArray(data.users) ? data.users.slice() : [];
}

function getAllWallets() {
  return Array.isArray(data.wallets) ? data.wallets.slice() : [];
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

// Alias for compatibility
function getPoolsByToken(tokenId) {
  return getTokenPools(tokenId);
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
  if (!state) return null;
  
  // CRITICAL FIX: Don't mutate the original object, create a copy
  const stateCopy = { ...state };
  
  if (stateCopy.state_data) {
    try {
      // Only parse if it's a string (not already parsed)
      if (typeof stateCopy.state_data === 'string') {
        stateCopy.state_data = JSON.parse(stateCopy.state_data);
      }
    } catch (e) {
      console.error('[getUserState] JSON parse error:', e);
      stateCopy.state_data = {};
    }
  } else {
    stateCopy.state_data = {};
  }
  
  return stateCopy;
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

// Dashboard selection persistence
function ensureDashboardSelectionStorage() {
  if (!Array.isArray(data.dashboard_selections)) {
    data.dashboard_selections = [];
  }
}

function getDashboardSelectionState(userId, tokenId) {
  ensureDashboardSelectionStorage();
  const record = data.dashboard_selections.find(
    (entry) => entry.user_id === userId && entry.token_id === tokenId
  );

  if (!record) {
    return null;
  }

  return {
    selectedWalletIds: Array.isArray(record.selected_wallet_ids)
      ? record.selected_wallet_ids.slice()
      : [],
    buyAmount: Number.isFinite(record.buy_amount) ? record.buy_amount : null,
    sellMode: record.sell_mode ?? null,
    sellValue: Number.isFinite(record.sell_value) ? record.sell_value : null,
    updatedAt: record.updated_at || null,
    autoManagedSelection: record.auto_managed_selection === false || record.auto_managed_selection === 0
      ? false
      : true,
    executionHistory: Array.isArray(record.execution_history)
      ? record.execution_history.slice()
      : []
  };
}

function saveDashboardSelectionState(userId, tokenId, updates = {}) {
  ensureDashboardSelectionStorage();

  let record = data.dashboard_selections.find(
    (entry) => entry.user_id === userId && entry.token_id === tokenId
  );

  if (!record) {
    record = {
      selection_id: getNextId('dashboard_selections'),
      user_id: userId,
      token_id: tokenId,
      selected_wallet_ids: [],
      buy_amount: null,
      sell_mode: null,
      sell_value: null,
      auto_managed_selection: true,
      execution_history: [],
      updated_at: Math.floor(Date.now() / 1000)
    };
    data.dashboard_selections.push(record);
  }

  if (updates.selectedWalletIds !== undefined) {
    const normalizedIds = Array.isArray(updates.selectedWalletIds)
      ? updates.selectedWalletIds
          .map((value) => Number.parseInt(value, 10))
          .filter((value) => Number.isInteger(value) && value > 0)
      : [];
    record.selected_wallet_ids = [...new Set(normalizedIds)];
  }

  if (updates.buyAmount !== undefined) {
    const numeric = Number(updates.buyAmount);
    record.buy_amount = Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  }

  if (updates.sellMode !== undefined) {
    record.sell_mode = updates.sellMode ?? null;
  }

  if (updates.sellValue !== undefined) {
    const numeric = Number(updates.sellValue);
    record.sell_value = Number.isFinite(numeric) ? numeric : null;
  }

  if (updates.autoManagedSelection !== undefined) {
    record.auto_managed_selection = updates.autoManagedSelection ? true : false;
  }

  if (updates.executionHistory !== undefined) {
    record.execution_history = Array.isArray(updates.executionHistory)
      ? updates.executionHistory.slice(0, 10)
      : [];
  }

  record.updated_at = Math.floor(Date.now() / 1000);
  saveData();
  return getDashboardSelectionState(userId, tokenId);
}

function clearDashboardSelectionState(userId, tokenId) {
  ensureDashboardSelectionStorage();
  const previousLength = data.dashboard_selections.length;
  data.dashboard_selections = data.dashboard_selections.filter(
    (entry) => !(entry.user_id === userId && entry.token_id === tokenId)
  );

  if (data.dashboard_selections.length !== previousLength) {
    saveData();
    return true;
  }

  return false;
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
      buy_amount_sol: 0.1,
      wallet_group_id: null,
      last_group_id: null,
      buy_delay_ms: 3000
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

function getSmartProfitWalletOverride(tokenMint, walletId) {
  return data.smart_profit_wallet_overrides.find(
    entry => entry.token_mint === tokenMint && entry.wallet_id === walletId
  ) || null;
}

function setSmartProfitWalletOverride(userId, tokenMint, walletId, enabled) {
  let entry = data.smart_profit_wallet_overrides.find(
    item => item.token_mint === tokenMint && item.wallet_id === walletId
  );

  if (!entry) {
    entry = {
      override_id: getNextId('smart_profit_wallet_overrides'),
      user_id: userId,
      token_mint: tokenMint,
      wallet_id: walletId,
      enabled: enabled !== false,
      updated_at: Math.floor(Date.now() / 1000)
    };
    data.smart_profit_wallet_overrides.push(entry);
  } else {
    entry.enabled = enabled !== false;
    entry.updated_at = Math.floor(Date.now() / 1000);
  }

  saveData();
  return entry;
}

function getSmartProfitWalletOverridesForToken(tokenMint) {
  return data.smart_profit_wallet_overrides.filter(entry => entry.token_mint === tokenMint);
}

// HSMAS Rules operations
function upsertHsmacRules(userId, tokenMint = null, rules = {}) {
  if (!userId) {
    throw new Error('userId is required to save HSMAS rules');
  }

  const normalizedMint = tokenMint || null;
  const existing = data.hsmac_rules.find((entry) => entry.user_id === userId && entry.token_mint === normalizedMint);
  const timestamp = Math.floor(Date.now() / 1000);

  if (existing) {
    Object.assign(existing, rules, {
      updated_at: timestamp
    });
    saveData();
    return existing;
  }

  const record = {
    rule_id: getNextId('hsmac_rules'),
    user_id: userId,
    token_mint: normalizedMint,
    created_at: timestamp,
    updated_at: timestamp,
    ...rules
  };

  data.hsmac_rules.push(record);
  saveData();
  return record;
}

function getHsmacRules(userId, tokenMint = null) {
  if (!userId) return null;
  const normalizedMint = tokenMint || null;
  return data.hsmac_rules.find((entry) => entry.user_id === userId && entry.token_mint === normalizedMint) || null;
}

function deleteHsmacRules(userId, tokenMint = null) {
  const normalizedMint = tokenMint || null;
  const initialLength = data.hsmac_rules.length;
  data.hsmac_rules = data.hsmac_rules.filter(
    (entry) => !(entry.user_id === userId && entry.token_mint === normalizedMint)
  );
  if (data.hsmac_rules.length !== initialLength) {
    saveData();
    return true;
  }
  return false;
}

// HSMAS profile operations
function getHsmacProfile(userId) {
  if (!userId) {
    throw new Error('userId is required to get HSMAS profile');
  }

  let profile = data.hsmac_profiles.find((entry) => entry.user_id === userId);
  if (!profile) {
    profile = {
      profile_id: getNextId('hsmac_profiles'),
      user_id: userId,
      token_mint: null,
      token_id: null,
      wallet_group_id: null,
      strategy: 'auto',
      custom_wallet_ids: [],
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000)
    };
    data.hsmac_profiles.push(profile);
    saveData();
  }
  return profile;
}

function updateHsmacProfile(userId, updates = {}) {
  const profile = getHsmacProfile(userId);
  if (updates.custom_wallet_ids !== undefined) {
    if (Array.isArray(updates.custom_wallet_ids)) {
      profile.custom_wallet_ids = Array.from(new Set(
        updates.custom_wallet_ids
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value > 0)
      ));
    } else if (updates.custom_wallet_ids === null) {
      profile.custom_wallet_ids = [];
    }
  }

  if (updates.token_id !== undefined) {
    profile.token_id = Number.isInteger(updates.token_id) ? updates.token_id : null;
  }

  Object.assign(profile, Object.fromEntries(
    Object.entries(updates).filter(([key]) => key !== 'custom_wallet_ids' && key !== 'token_id')
  ), {
    updated_at: Math.floor(Date.now() / 1000)
  });
  saveData();
  return profile;
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

function renameWalletGroup(groupId, groupName) {
  const group = getWalletGroup(groupId);
  if (group) {
    group.group_name = groupName;
    group.updated_at = Math.floor(Date.now() / 1000);
    saveData();
  }
  return group;
}

function getGroupWallets(groupId) {
  const members = data.wallet_group_members.filter(m => m.group_id === groupId);
  return members
    .map(m => getWalletById(m.wallet_id))
    .filter(w => w !== null && w.archived !== true);
}

function deleteWalletGroup(groupId) {
  data.wallet_groups = data.wallet_groups.filter(g => g.group_id !== groupId);
  data.wallet_group_members = data.wallet_group_members.filter(m => m.group_id !== groupId);
  saveData();
}

// Bundle wallet group operations
function createBundleGroup(userId, groupName, options = {}) {
  const group = {
    bundle_group_id: getNextId('bundle_groups'),
    user_id: userId,
    group_name: groupName,
    buy_amount_sol: options.buy_amount_sol ?? 0.01,
    tip_lamports: options.tip_lamports ?? 1000,
    notes: options.notes ?? null,
    created_at: Math.floor(Date.now() / 1000)
  };
  data.bundle_groups.push(group);
  saveData();
  return group;
}

function updateBundleGroup(groupId, updates) {
  const group = getBundleGroup(groupId);
  if (group) {
    Object.assign(group, updates);
    saveData();
  }
  return group;
}

function deleteBundleGroup(groupId) {
  data.bundle_groups = data.bundle_groups.filter(g => g.bundle_group_id !== groupId);
  data.bundle_group_members = data.bundle_group_members.filter(m => m.bundle_group_id !== groupId);
  saveData();
}

function getBundleGroup(groupId) {
  return data.bundle_groups.find(g => g.bundle_group_id === groupId) || null;
}

function getUserBundleGroups(userId) {
  return data.bundle_groups.filter(g => g.user_id === userId);
}

function addWalletToBundleGroup(groupId, walletId) {
  const group = getBundleGroup(groupId);
  const wallet = getWalletById(walletId);
  if (!group || !wallet) {
    throw new Error('Bundle group or wallet not found');
  }
  if (group.user_id !== wallet.user_id) {
    throw new Error('Wallet does not belong to bundle group owner');
  }
  const exists = data.bundle_group_members.some(m => m.bundle_group_id === groupId && m.wallet_id === walletId);
  if (exists) {
    return false;
  }
  data.bundle_group_members.push({
    bundle_member_id: getNextId('bundle_group_members'),
    bundle_group_id: groupId,
    wallet_id: walletId,
    created_at: Math.floor(Date.now() / 1000)
  });
  saveData();
  return true;
}

function removeWalletFromBundleGroup(groupId, walletId) {
  const prevLength = data.bundle_group_members.length;
  data.bundle_group_members = data.bundle_group_members.filter(m => !(m.bundle_group_id === groupId && m.wallet_id === walletId));
  if (data.bundle_group_members.length !== prevLength) {
    saveData();
    return true;
  }
  return false;
}

function getBundleGroupWallets(groupId) {
  const memberWalletIds = data.bundle_group_members
    .filter(m => m.bundle_group_id === groupId)
    .map(m => m.wallet_id);
  return memberWalletIds
    .map(id => getWalletById(id))
    .filter((wallet) => wallet && wallet.archived !== true);
}

function getBundleGroupWalletIds(groupId) {
  return data.bundle_group_members
    .filter(m => m.bundle_group_id === groupId)
    .map(m => m.wallet_id);
}

function appendAuditLog({ userId, action, details = null, ipAddress = null }) {
  const log = {
    log_id: getNextId('audit_logs'),
    user_id: userId,
    action,
    details: details == null ? null : details,
    ip_address: ipAddress,
    created_at: Math.floor(Date.now() / 1000)
  };
  data.audit_logs.push(log);
  saveData();
  return log;
}

function getAuditLogEntries(limit = 50) {
  if (!Array.isArray(data.audit_logs) || data.audit_logs.length === 0) {
    return [];
  }
  return data.audit_logs.slice(-limit).reverse();
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
  getUserById,
  setActiveWallet,
  setActiveToken,
  saveWallet,
  getUserWallets,
  getWalletById,
  updateWalletName,
  getWalletByAddress,
  getActiveWallet,
  getUserWalletCount,
  archiveWallet,
  archiveWallets,
  restoreWallet,
  saveToken,
  createToken,
  getUserTokens,
  getTokenByMint,
  getTokenById,
  updateTokenState,
  updateTokenPlatform,
  updateToken,
  getAllUsers,
  getAllWallets,
  savePool,
  createPool,
  getPoolByAddress,
  getTokenPools,
  getPoolsByToken,
  getUserPools,
  saveTransaction,
  updateTransactionStatus,
  getUserTransactions,
  saveUserState,
  getUserState,
  clearUserState,
  getUserSettings,
  updateUserSettings,
  getDashboardSelectionState,
  saveDashboardSelectionState,
  clearDashboardSelectionState,
  getSmartProfitSettings,
  updateSmartProfitSettings,
  getSmartProfitWalletOverride,
  setSmartProfitWalletOverride,
  getSmartProfitWalletOverridesForToken,
  upsertHsmacRules,
  getHsmacRules,
  deleteHsmacRules,
  getHsmacProfile,
  updateHsmacProfile,
  createWalletGroup,
  getUserWalletGroups,
  getWalletGroup,
  addWalletToGroup,
  removeWalletFromGroup,
  renameWalletGroup,
  getGroupWallets,
  deleteWalletGroup,
  createBundleGroup,
  updateBundleGroup,
  deleteBundleGroup,
  getBundleGroup,
  getUserBundleGroups,
  addWalletToBundleGroup,
  removeWalletFromBundleGroup,
  getBundleGroupWallets,
  getBundleGroupWalletIds,
  appendAuditLog,
  getAuditLogEntries
};

