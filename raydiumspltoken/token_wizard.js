/**
 * Token Creation Wizard Module
 * Complete guided token creation with profiles, pool setup, and bundle options
 */

const { StateManager } = require('./state');
const { getUserTokens, saveToken, updateSmartProfitSettings } = require('./db');

const TOTAL_WIZARD_STEPS = 10;

// Token wizard states
const WIZARD_STATES = {
  PLATFORM_SELECT: 'wizard_platform',
  DEV_WALLET_SELECT: 'wizard_dev_wallet',
  NAME_INPUT: 'wizard_name',
  SYMBOL_INPUT: 'wizard_symbol',
  DECIMALS_INPUT: 'wizard_decimals',
  SUPPLY_INPUT: 'wizard_supply',
  DESCRIPTION_INPUT: 'wizard_description',
  IMAGE_UPLOAD: 'wizard_image',
  POOL_OPTION: 'wizard_pool_option',
  POOL_TOKEN_AMOUNT: 'wizard_pool_token',
  POOL_SOL_AMOUNT: 'wizard_pool_sol',
  BUNDLE_OPTION: 'wizard_bundle',
  BUNDLE_WALLET_COUNT: 'wizard_bundle_count',
  SMART_PROFIT_OPTION: 'wizard_smart_profit',
  SMART_PROFIT_CONFIG: 'wizard_sp_config',
  DEV_AUTO_SELL: 'wizard_dev_auto_sell',
  FINAL_REVIEW: 'wizard_review'
};

const buildDefaultWizardData = () => ({
    step: 1,
  totalSteps: TOTAL_WIZARD_STEPS,
  platform: null,
    name: null,
    symbol: null,
    decimals: 9,
    supply: null,
    description: '',
    imageUrl: null,
  imageBuffer: null,
  imageMimeType: null,
  twitter: '',
  telegram: '',
  website: '',
  initialBuySOL: 0,

  // Wallet selection
  devWalletId: null,
  devWalletName: null,
  devWalletAddress: null,
  devAutoSell: false,
  devAutoSellDelaySeconds: 0,
    
    // Pool options
    autoCreatePool: false,
    poolTokenAmount: null,
    poolSolAmount: null,
    
    // Bundle options
    useBundle: false,
    bundleWalletCount: 1,
  bundleWalletIds: [],
  bundleBuyAmounts: [],
    
    // Smart Profit options
    enableSmartProfit: false,
    smartProfitThreshold: 50,
    smartProfitBuyTrigger: 5,
    smartProfitSellTrigger: 2,
    vanityWallet: null,
  
  // Token-2022 Extensions
  enableTransferFee: false,
  transferFeeBasisPoints: 0,
  maxTransferFee: 10000000000,  // 10 tokens max fee (as number, converted to BigInt in createToken2022)
  revokeMintAuthority: true,
  revokeFreezeAuthority: false
});

/**
 * Start token creation wizard
 * @param {number} userId - User ID
 * @returns {object} Wizard initialization data
 */
function startTokenWizard(userId) {
  const wizardData = buildDefaultWizardData();
  
  StateManager.setState(userId, WIZARD_STATES.PLATFORM_SELECT, wizardData);
  
  return wizardData;
}

function hydrateTokenWizard(userId, state, overrides = {}) {
  const wizardData = {
    ...buildDefaultWizardData(),
    ...overrides
  };

  StateManager.setState(userId, state, wizardData);
  return wizardData;
}

/**
 * Get wizard data
 * @param {number} userId - User ID
 * @returns {object} Current wizard state data
 */
function getWizardData(userId) {
  const state = StateManager.getState(userId);
  return state.data || {};
}

/**
 * Update wizard data
 * @param {number} userId - User ID
 * @param {object} updates - Data to update
 */
function updateWizardData(userId, updates) {
  StateManager.updateData(userId, updates);
}

/**
 * Advance wizard step
 * @param {number} userId - User ID
 * @param {string} nextState - Next state
 */
function advanceWizard(userId, nextState) {
  const data = getWizardData(userId);
  data.step = (data.step || 0) + 1;
  StateManager.setState(userId, nextState, data);
}

/**
 * Get platform selection keyboard
 * @returns {object} Inline keyboard
 */
function getPlatformSelectionKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🎪 Pump.fun Launch', callback_data: 'wizard_platform_pumpfun' }],
      [{ text: '🚀 Raydium Direct', callback_data: 'wizard_platform_raydium' }],
      [{ text: '⚡ Multi-Wallet Bundle', callback_data: 'wizard_platform_bundle' }],
      [{ text: '❌ Cancel', callback_data: 'wizard_cancel' }]
    ]
  };
}

/**
 * Get pool option keyboard
 * @returns {object} Inline keyboard
 */
function getPoolOptionKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '✅ Yes - Auto-create pool', callback_data: 'wizard_pool_yes' }],
      [{ text: '⏭️ Skip - I\'ll add later', callback_data: 'wizard_pool_skip' }],
      [{ text: '🔙 Back', callback_data: 'wizard_back' }]
    ]
  };
}

/**
 * Get bundle wallet count keyboard
 * @returns {object} Inline keyboard
 */
function getBundleWalletKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '1', callback_data: 'wizard_wallets_1' },
        { text: '2', callback_data: 'wizard_wallets_2' },
        { text: '3', callback_data: 'wizard_wallets_3' }
      ],
      [
        { text: '5', callback_data: 'wizard_wallets_5' },
        { text: '10', callback_data: 'wizard_wallets_10' },
        { text: '15', callback_data: 'wizard_wallets_15' }
      ],
      [
        { text: '20', callback_data: 'wizard_wallets_20' },
        { text: '25', callback_data: 'wizard_wallets_25' }
      ],
      [{ text: '🔙 Back', callback_data: 'wizard_back' }]
    ]
  };
}

/**
 * Get Smart Profit option keyboard
 * @returns {object} Inline keyboard
 */
function getSmartProfitOptionKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '✅ Enable Smart Profit', callback_data: 'wizard_sp_yes' }],
      [{ text: '⏭️ Skip for now', callback_data: 'wizard_sp_skip' }],
      [{ text: '🔙 Back', callback_data: 'wizard_back' }]
    ]
  };
}

/**
 * Get Smart Profit threshold keyboard
 * @returns {object} Inline keyboard
 */
function getSmartProfitThresholdKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '20%', callback_data: 'wizard_sp_threshold_20' },
        { text: '50%', callback_data: 'wizard_sp_threshold_50' },
        { text: '100%', callback_data: 'wizard_sp_threshold_100' }
      ],
      [
        { text: '200%', callback_data: 'wizard_sp_threshold_200' },
        { text: '500%', callback_data: 'wizard_sp_threshold_500' }
      ],
      [{ text: '🔙 Back', callback_data: 'wizard_back' }]
    ]
  };
}

/**
 * Format wizard review message
 * @param {object} wizardData - Wizard data
 * @returns {string} Formatted review message
 */
function formatWizardReview(wizardData) {
  let msg = `🎯 *Token Creation Review*\n\n`;
  msg += `*Platform:* ${wizardData.platform}\n`;
  msg += `*Name:* ${wizardData.name}\n`;
  msg += `*Symbol:* ${wizardData.symbol}\n`;
  msg += `*Decimals:* ${wizardData.decimals}\n`;
  msg += `*Supply:* ${wizardData.supply}\n\n`;

  if (wizardData.devWalletAddress) {
    const label = wizardData.devWalletName
      ? `${wizardData.devWalletName} • `
      : '';
    msg += `*Dev Wallet:* ${label}\`${wizardData.devWalletAddress}\`\n\n`;
  }
  if (wizardData.devAutoSell) {
    const delaySeconds = Number.isFinite(wizardData.devAutoSellDelaySeconds)
      ? wizardData.devAutoSellDelaySeconds
      : 0;
    msg += `*Dev Auto-Sell:* Enabled (delay ${delaySeconds}s)\n\n`;
  } else {
    msg += `*Dev Auto-Sell:* Disabled\n\n`;
  }
  
  if (wizardData.autoCreatePool) {
    msg += `*Pool:* ✅ Auto-create\n`;
    msg += `  Token Amount: ${wizardData.poolTokenAmount}\n`;
    msg += `  SOL Amount: ${wizardData.poolSolAmount}\n\n`;
  }
  
  if (wizardData.useBundle) {
    msg += `*Bundle:* ✅ ${wizardData.bundleWalletCount} wallets\n\n`;
  }
  
  if (wizardData.enableSmartProfit) {
    msg += `*Smart Profit:* ✅ Enabled\n`;
    msg += `  Threshold: ${wizardData.smartProfitThreshold}%\n\n`;
  }

  msg += `Ready to save?`;

  return msg;
}

/**
 * Get final review keyboard
 * @returns {object} Inline keyboard
 */
function getFinalReviewKeyboard(wizardData = {}) {
  const hasVanity = Boolean(wizardData?.vanityWallet);
  const rows = [];

  if (hasVanity) {
    rows.push([{ text: '♻️ Release Vanity Mint', callback_data: 'wizard_vanity_release' }]);
  } else {
    rows.push([{ text: '🎭 Reserve Vanity Mint', callback_data: 'wizard_vanity_request' }]);
  }

  rows.push([{ text: '📋 Progress', callback_data: 'wizard_edit_progress' }]);
  rows.push(
      [{ text: '✅ Save Profile', callback_data: 'wizard_profile_save' }],
      [{ text: '✏️ Edit Settings', callback_data: 'wizard_edit' }],
      [{ text: '❌ Cancel', callback_data: 'wizard_cancel' }]
  );

  return { inline_keyboard: rows };
}

module.exports = {
  WIZARD_STATES,
  startTokenWizard,
  hydrateTokenWizard,
  getWizardData,
  updateWizardData,
  advanceWizard,
  getPlatformSelectionKeyboard,
  getPoolOptionKeyboard,
  getBundleWalletKeyboard,
  getSmartProfitOptionKeyboard,
  getSmartProfitThresholdKeyboard,
  formatWizardReview,
  getFinalReviewKeyboard
};

