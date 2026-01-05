/**
 * Complete UI Menu System
 * Organized button-based access to ALL 21 modules
 */

function escapeMarkdown(text) {
  if (text === null || text === undefined) {
    return '';
  }
  return String(text).replace(/[_*\[\]()~`>#+=|{}!-]/g, '\\$&');
}

function md(value) {
  return escapeMarkdown(value);
}

function formatRelativeTimestamp(timestamp) {
  if (!Number.isFinite(timestamp)) {
    return '';
  }
  const diff = Date.now() - timestamp;
  if (diff < 0) {
    return '';
  }
  if (diff < 1000) {
    return 'just now';
  }
  if (diff < 60000) {
    return `${Math.round(diff / 1000)}s ago`;
  }
  if (diff < 3600000) {
    return `${Math.round(diff / 60000)}m ago`;
  }
  if (diff < 86400000) {
    return `${Math.round(diff / 3600000)}h ago`;
  }
  try {
    return new Date(timestamp).toLocaleString();
  } catch (_) {
    return '';
  }
}

function shortenSignature(signature = '') {
  if (typeof signature !== 'string') {
    return '';
  }
  if (signature.length <= 10) {
    return signature;
  }
  return `${signature.slice(0, 4)}...${signature.slice(-4)}`;
}

// ============================================================================
// MAIN MENU
// ============================================================================

function getMainMenu() {
  return {
    text: `☂️ *PARASOL \\- Main Menu*\n\nChoose a category:`,
    keyboard: {
      inline_keyboard: [
        [
          { text: '💼 Wallets', callback_data: 'menu_wallets' },
          { text: '🪙 Tokens', callback_data: 'menu_tokens' }
        ],
        [
          { text: '✨ Create Token', callback_data: 'token_wizard_start' },
          { text: '🚀 Launch', callback_data: 'menu_launch' }
        ],
        [
          { text: '💧 Liquidity', callback_data: 'menu_liquidity' },
          { text: '🤖 Trading', callback_data: 'menu_trading' }
        ],
        [
          { text: '📊 Analytics', callback_data: 'menu_analytics' },
          { text: '⚙️ Settings', callback_data: 'menu_settings' }
        ],
        [
          { text: '🔗 Referrals', callback_data: 'menu_referral' },
          { text: '👑 Admin', callback_data: 'menu_admin' }
        ]
      ]
    }
  };
}

// ============================================================================
// WALLET SUBMENU
// ============================================================================

function getWalletMenu() {
  return {
    text: `💼 *Wallet Management*\n\nManage your Solana wallets:`,
    keyboard: {
      inline_keyboard: [
        [
          { text: '🔐 Create Wallet', callback_data: 'wallet_create' },
          { text: '📥 Import Wallet', callback_data: 'wallet_import' }
        ],
        [
          { text: '💼 My Wallets', callback_data: 'wallet_list' },
          { text: '💰 Check Balance', callback_data: 'wallet_balance' }
        ],
        [
          { text: '👥 Wallet Groups', callback_data: 'wallet_groups_menu' },
          { text: '💰 Collect SOL', callback_data: 'wallet_collect_sol' }
        ],
        [
          { text: '📤 Export Wallet', callback_data: 'wallet_export' }
        ],
        [{ text: '🏠 Main Menu', callback_data: 'menu_main' }]
      ]
    }
  };
}

// ============================================================================
// TOKEN SUBMENU
// ============================================================================

function getTokenMenu() {
  return {
    text: `🪙 *Token Management*\n\nCreate, launch, and manage tokens:`,
    keyboard: {
      inline_keyboard: [
        [
          { text: '✨ Create Token (Wizard)', callback_data: 'token_wizard_start' },
          { text: '📋 My Tokens', callback_data: 'token_list' }
        ],
        [
          { text: '🚀 Launch Options', callback_data: 'menu_launch' },
          { text: '🔍 Token Profile', callback_data: 'token_profile_select' }
        ],
        [
          { text: '💸 Claim Transfer Fees', callback_data: 'token_claim_fees' },
          { text: '💰 Claim Creator Fees', callback_data: 'pumpfun_claim_creator' }
        ],
        [
          { text: '🎨 Update Metadata', callback_data: 'token_metadata' },
          { text: '🔧 Token Settings', callback_data: 'token_settings' }
        ],
        [{ text: '🏠 Main Menu', callback_data: 'menu_main' }]
      ]
    }
  };
}

// ============================================================================
// LIQUIDITY SUBMENU
// ============================================================================

function getLiquidityMenu() {
  return {
    text: `💧 *Liquidity Management*\n\nManage pools and liquidity:`,
    keyboard: {
      inline_keyboard: [
        [
          { text: '🏊 Create Pool', callback_data: 'liquidity_create_pool' },
          { text: '📋 My Pools', callback_data: 'liquidity_my_pools' }
        ],
        [
          { text: '➕ Add Liquidity', callback_data: 'liquidity_add' },
          { text: '➖ Remove Liquidity', callback_data: 'liquidity_remove' }
        ],
        [
          { text: '📊 Pool Stats', callback_data: 'liquidity_stats' },
          { text: '💰 LP Tokens', callback_data: 'liquidity_lp_tokens' }
        ],
        [{ text: '🏠 Main Menu', callback_data: 'menu_main' }]
      ]
    }
  };
}

// ============================================================================
// LAUNCH SUBMENU
// ============================================================================

function getLaunchMenu() {
  return {
    text: `🚀 *Token Launch*\n\nSelect your saved token and launch method:`,
    keyboard: {
      inline_keyboard: [
        [
          { text: '🎪 Launch Pump.fun', callback_data: 'launch_pumpfun' },
          { text: '🎪⚡ Pump.fun + Bundle', callback_data: 'launch_pumpfun_bundle' }
        ],
        [
          { text: '🌊 Launch Raydium', callback_data: 'launch_raydium' },
          { text: '🌊⚡ Raydium + Bundle', callback_data: 'launch_raydium_bundle' }
        ],
        [
          { text: '💧 Add Pool (Existing)', callback_data: 'launch_add_pool' },
          { text: '⚡ Bundle Buy (Existing)', callback_data: 'launch_bundle_buy' }
        ],
        [{ text: '⚡ Manage Bundle Wallets', callback_data: 'bundle_menu' }],
        [{ text: '❓ Which to choose?', callback_data: 'launch_help' }],
        [{ text: '🏠 Main Menu', callback_data: 'menu_main' }]
      ]
    }
  };
}

// ============================================================================
// TRADING SUBMENU
// ============================================================================

function getTradingMenu() {
  return {
    text: `🤖 *Trading*\n\nAutomated and manual trading:`,
    keyboard: {
      inline_keyboard: [
        [
          { text: '🤖 Smart Profit', callback_data: 'trading_smart_profit' },
          { text: '📊 SP Dashboard', callback_data: 'trading_sp_dashboard' }
        ],
        [
          { text: '🧠 HSMAS', callback_data: 'hsmac_dashboard' }
        ],
        [
          { text: '🔄 Swap Tokens', callback_data: 'trading_swap' },
          { text: '💹 Buy/Sell', callback_data: 'trading_buysell' }
        ],
        [
          { text: '📈 Trade History', callback_data: 'trading_history' },
          { text: '⚙️ Trading Settings', callback_data: 'trading_settings' }
        ],
        [{ text: '🏠 Main Menu', callback_data: 'menu_main' }]
      ]
    }
  };
}

// ============================================================================
// ANALYTICS SUBMENU
// ============================================================================

function getAnalyticsMenu() {
  return {
    text: `📊 *Analytics*\n\nTrack performance:`,
    keyboard: {
      inline_keyboard: [
        [
          { text: '💰 Portfolio PNL', callback_data: 'analytics_pnl' },
          { text: '📈 Performance', callback_data: 'analytics_performance' }
        ],
        [
          { text: '📜 Transaction History', callback_data: 'analytics_history' },
          { text: '💸 Fee History', callback_data: 'analytics_fees' }
        ],
        [
          { text: '🎯 Token Details', callback_data: 'analytics_token_details' },
          { text: '📊 Pool Analytics', callback_data: 'analytics_pool' }
        ],
        [{ text: '🏠 Main Menu', callback_data: 'menu_main' }]
      ]
    }
  };
}

// ============================================================================
// SETTINGS SUBMENU
// ============================================================================

function getSettingsMenu() {
  return {
    text: `⚙️ *Settings*\n\nConfigure bot settings:`,
    keyboard: {
      inline_keyboard: [
        [
          { text: '⚡ Priority Fees', callback_data: 'settings_priority' },
          { text: '📉 Slippage', callback_data: 'settings_slippage' }
        ],
        [
          { text: '🤖 Smart Profit', callback_data: 'settings_smart_profit' },
          { text: '💵 View Fees', callback_data: 'settings_fees' }
        ],
        [
          { text: '🔔 Notifications', callback_data: 'settings_notifications' },
          { text: '🌐 Network', callback_data: 'settings_network' }
        ],
        [
          { text: '📊 Rate Limits', callback_data: 'settings_limits' }
        ],
        [{ text: '🏠 Main Menu', callback_data: 'menu_main' }]
      ]
    }
  };
}

// ============================================================================
// SMART PROFIT SETTINGS
// ============================================================================

function getSmartProfitSettingsScreen(currentSettings) {
  const enabled = currentSettings && (currentSettings.enabled === 1 || currentSettings.enabled === true);
  const threshold = currentSettings?.profit_threshold_percent ?? 50;
  const buyTrigger = currentSettings?.large_buy_sol_trigger ?? 5;
  const sellTrigger = currentSettings?.large_sell_sol_trigger ?? 2;
  const buyAmount = currentSettings?.buy_amount_sol ?? 0.1;
  const groupId = currentSettings?.wallet_group_id || null;
  const tokenMint = currentSettings?.token_mint ? `${currentSettings.token_mint.substring(0, 8)}...` : 'Not set';
  
  return {
    text: `🤖 *Smart Profit Settings*\n\n` +
          `${enabled ? '✅' : '❌'} Status: ${enabled ? 'Enabled' : 'Disabled'}\n\n` +
          `*Current Configuration:*\n` +
          `🪙 Token: ${tokenMint}\n` +
          `💰 Take Profit: ${threshold}%\n` +
          `📈 Buy Trigger: ${buyTrigger} SOL\n` +
          `📉 Sell Trigger: ${sellTrigger} SOL\n` +
          `🛒 Buy Amount: ${buyAmount} SOL\n` +
          `👥 Wallet Group: ${groupId ? `Group ${groupId}` : 'Not set'}\n\n` +
          `Configure your Smart Profit automation:`,
    keyboard: {
      inline_keyboard: [
        [{ text: enabled ? '❌ Disable' : '✅ Enable', callback_data: 'sp_toggle' }],
        [
          { text: '🪙 Set Token', callback_data: 'sp_set_token' },
          { text: '👥 Set Wallet Group', callback_data: 'sp_set_group' }
        ],
        [
          { text: '💰 Take Profit %', callback_data: 'sp_set_threshold' },
          { text: '🛒 Buy Amount', callback_data: 'sp_set_buy_amount' }
        ],
        [
          { text: '📈 Buy Trigger', callback_data: 'sp_set_buy' },
          { text: '📉 Sell Trigger', callback_data: 'sp_set_sell' }
        ],
        [{ text: '🔙 Back to Settings', callback_data: 'menu_settings' }]
      ]
    }
  };
}

/**
 * Smart Profit activation menu
 */
function getSmartProfitActivationScreen() {
  return {
    text: `🤖 *Smart Profit Activation*\n\n` +
          `Select platform to activate Smart Profit:\n\n` +
          `💡 Smart Profit will monitor the token and execute trades based on your settings.`,
    keyboard: {
      inline_keyboard: [
        [
          { text: '🚀 Pump.fun', callback_data: 'sp_activate_pumpfun' },
          { text: '💧 Raydium', callback_data: 'sp_activate_raydium' }
        ],
        [{ text: '🔙 Back', callback_data: 'menu_tokens' }]
      ]
    }
  };
}

/**
 * Wallet management screen for Smart Profit
 */
function getSmartProfitWalletManagementScreen(walletInfo) {
  const { totalWallets, maxWallets, wallets, enabledCount } = walletInfo;
  
  let text = `👥 *Wallet Management*\n\n` +
             `Total: ${totalWallets}/${maxWallets}\n` +
             `Enabled: ${enabledCount}\n\n` +
             `*Wallets:*\n`;
  
  const buttons = [];
  
  wallets.forEach((wallet, idx) => {
    const shortAddr = `${wallet.address.substring(0, 4)}...${wallet.address.substring(wallet.address.length - 4)}`;
    const status = wallet.enabled ? '✅' : '❌';
    const bought = wallet.hasBought ? '📈' : '';
    const sold = wallet.hasSold ? '📉' : '';
    
    text += `${idx + 1}. ${status} ${shortAddr} ${bought}${sold}\n`;
    
    buttons.push([{
      text: `${status} Wallet ${idx + 1}`,
      callback_data: `sp_toggle_wallet_${wallet.walletId}`
    }]);
  });
  
  buttons.push([{ text: '🔙 Back', callback_data: 'menu_settings' }]);
  
  return {
    text,
    keyboard: { inline_keyboard: buttons }
  };
}

// ============================================================================
// ADMIN SUBMENU
// ============================================================================

function getAdminMenu() {
  return {
    text: `👑 *Admin Dashboard*\n\nSystem management:`,
    keyboard: {
      inline_keyboard: [
        [
          { text: '📊 System Stats', callback_data: 'admin_stats' },
          { text: '👥 User Management', callback_data: 'admin_users' }
        ],
        [
          { text: '📜 Audit Logs', callback_data: 'admin_audit' },
          { text: '❌ Error Logs', callback_data: 'admin_errors' }
        ],
        [
          { text: '📢 Broadcast', callback_data: 'admin_broadcast' },
          { text: '🔄 Reset Limits', callback_data: 'admin_reset' }
        ],
        [
          { text: '🔔 Test Group Notify', callback_data: 'admin_test_group_notify' }
        ],
        [{ text: '🏠 Main Menu', callback_data: 'menu_main' }]
      ]
    }
  };
}

// ============================================================================
// TOKEN WIZARD SCREENS
// ============================================================================

function getWizardPlatformScreen() {
  return {
    text: `✨ *Token Creation Wizard* (Step 1/8)\n\n` +
          `Choose your launch platform:\n\n` +
          `🎪 *Pump.fun*: Bonding curve, viral marketing\n` +
          `🚀 *Raydium*: Direct pool, professional\n` +
          `⚡ *Bundle*: Multi-wallet coordinated launch`,
    keyboard: {
      inline_keyboard: [
        [{ text: '🎪 Pump.fun Launch', callback_data: 'wizard_platform_pumpfun' }],
        [{ text: '🚀 Raydium Direct', callback_data: 'wizard_platform_raydium' }],
        [{ text: '⚡ Multi Wallet Bundle', callback_data: 'wizard_platform_bundle' }],
        [{ text: '❌ Cancel', callback_data: 'wizard_cancel' }]
      ]
    }
  };
}

function getWizardDecimalsScreen() {
  return {
    text: `✨ *Token Creation Wizard* (Step 4/8)\n\n` +
          `Select decimals:\n\n` +
          `6 = Standard (USDC style)\n` +
          `9 = Most common (SOL style)`,
    keyboard: {
      inline_keyboard: [
        [
          { text: '6', callback_data: 'wizard_decimals_6' },
          { text: '9', callback_data: 'wizard_decimals_9' }
        ],
        [{ text: '✏️ Custom', callback_data: 'wizard_decimals_custom' }],
        [{ text: '🔙 Back', callback_data: 'wizard_back' }]
      ]
    }
  };
}

function getWizardSupplyScreen() {
  return {
    text: `✨ *Token Creation Wizard* (Step 5/8)\n\n` +
          `Select total supply:`,
    keyboard: {
      inline_keyboard: [
        [
          { text: '1M', callback_data: 'wizard_supply_1000000' },
          { text: '10M', callback_data: 'wizard_supply_10000000' }
        ],
        [
          { text: '100M', callback_data: 'wizard_supply_100000000' },
          { text: '1B', callback_data: 'wizard_supply_1000000000' }
        ],
        [{ text: '✏️ Custom', callback_data: 'wizard_supply_custom' }],
        [{ text: '🔙 Back', callback_data: 'wizard_back' }]
      ]
    }
  };
}

function getWizardPoolScreen() {
  return {
    text: `✨ *Token Creation Wizard* (Step 6/8)\n\n` +
          `Auto-create liquidity pool?\n\n` +
          `This will create a Raydium pool immediately after token creation.`,
    keyboard: {
      inline_keyboard: [
        [{ text: '✅ Yes', callback_data: 'wizard_pool_yes' }],
        [{ text: '⏭️ Skip', callback_data: 'wizard_pool_skip' }],
        [{ text: '🔙 Back', callback_data: 'wizard_back' }]
      ]
    }
  };
}

function getWizardPoolAmountsScreen() {
  return {
    text: `💧 *Pool Configuration*\n\n` +
          `Token amount for pool:`,
    keyboard: {
      inline_keyboard: [
        [
          { text: '10%', callback_data: 'wizard_pool_token_10' },
          { text: '25%', callback_data: 'wizard_pool_token_25' }
        ],
        [
          { text: '50%', callback_data: 'wizard_pool_token_50' },
          { text: '75%', callback_data: 'wizard_pool_token_75' }
        ],
        [{ text: '✏️ Custom', callback_data: 'wizard_pool_token_custom' }],
        [{ text: '🔙 Back', callback_data: 'wizard_back' }]
      ]
    }
  };
}

function getWizardPoolSolScreen() {
  return {
    text: `💧 *Pool Configuration*\n\n` +
          `SOL amount for pool:`,
    keyboard: {
      inline_keyboard: [
        [
          { text: '0.5 SOL', callback_data: 'wizard_pool_sol_0.5' },
          { text: '1 SOL', callback_data: 'wizard_pool_sol_1' }
        ],
        [
          { text: '5 SOL', callback_data: 'wizard_pool_sol_5' },
          { text: '10 SOL', callback_data: 'wizard_pool_sol_10' }
        ],
        [{ text: '✏️ Custom', callback_data: 'wizard_pool_sol_custom' }],
        [{ text: '🔙 Back', callback_data: 'wizard_back' }]
      ]
    }
  };
}

function getWizardBundleScreen() {
  return {
    text: `⚡ *Bundle Configuration*\n\n` +
          `Use multi-wallet atomic bundle?\n\n` +
          `This coordinates multiple wallets for simultaneous action.`,
    keyboard: {
      inline_keyboard: [
        [{ text: '✅ Yes', callback_data: 'wizard_bundle_yes' }],
        [{ text: '⏭️ No', callback_data: 'wizard_bundle_no' }],
        [{ text: '🔙 Back', callback_data: 'wizard_back' }]
      ]
    }
  };
}

function getWizardBundleWalletScreen() {
  return {
    text: `⚡ *Bundle Configuration*\n\n` +
          `How many wallets to coordinate?\n\n` +
          `(Max 25, recommended 5-10)`,
    keyboard: {
      inline_keyboard: [
        [
          { text: '1', callback_data: 'wizard_bundle_count_1' },
          { text: '2', callback_data: 'wizard_bundle_count_2' },
          { text: '3', callback_data: 'wizard_bundle_count_3' }
        ],
        [
          { text: '5', callback_data: 'wizard_bundle_count_5' },
          { text: '10', callback_data: 'wizard_bundle_count_10' },
          { text: '15', callback_data: 'wizard_bundle_count_15' }
        ],
        [
          { text: '20', callback_data: 'wizard_bundle_count_20' },
          { text: '25', callback_data: 'wizard_bundle_count_25' }
        ],
        [{ text: '🔙 Back', callback_data: 'wizard_back' }]
      ]
    }
  };
}

function getWizardSmartProfitScreen() {
  return {
    text: `🤖 *Smart Profit Setup*\n\n` +
          `Enable automated trading for this token?\n\n` +
          `Smart Profit will automatically:\n` +
          `• Take profits on pumps\n` +
          `• Buy dips on dumps`,
    keyboard: {
      inline_keyboard: [
        [{ text: '✅ Enable Smart Profit', callback_data: 'wizard_sp_yes' }],
        [{ text: '⏭️ Skip', callback_data: 'wizard_sp_skip' }],
        [{ text: '🔙 Back', callback_data: 'wizard_back' }]
      ]
    }
  };
}

function getHsmacDashboardScreen(context) {
  const manualStrategy = context?.manualStrategy || 'auto';
  const strategyLabel = manualStrategy !== 'auto'
    ? `${context?.strategy || manualStrategy} (Manual)`
    : context?.strategy || 'DBPM';
  const autoExecuteEnabled = (context?.rules?.autoExecute ?? true);

  const lines = [
    '🧠 *Hyper-Smart Strategy Dashboard*',
    '',
    `Token: ${md(context?.tokenLabel || 'Not linked')}`,
    `Status: ${md(context?.phase || 'Idle')} • ROI: ${md(context?.roiText || 'N/A')}`,
    `Capital: ${md(context?.capitalStatus || 'Nominal')}`,
    `Strategy: ${md(strategyLabel)}`,
    `Wallets: ${md(context?.walletSummary || 'Not linked')}`,
  ];

  if (Array.isArray(context?.walletDetailLines) && context.walletDetailLines.length) {
    lines.push(...context.walletDetailLines.map((line) => md(line)));
  }

  lines.push(
    `Auto Execute: ${autoExecuteEnabled ? 'Enabled' : 'Disabled'}`,
    '',
    '*How to Use:*',
    '1. From the token dashboard, tap *Hyper Smart* to link the current token.',
    '2. Select wallets on the token dashboard, then choose *Sync Wallets* here.',
    '3. Review *Strategy* and tweak *Rules* if needed.',
    '4. Tap *Engage* for autonomous mode or *Force Execute* for an instant manual run.',
    '5. Use *Emergency* for an immediate stop and capital preserve.',
    '',
    '*Rule Snapshot:*',
    `• Initial Wallet Count: ${md(String(context?.rules?.initialWalletCount ?? '—'))}`,
    `• Buy Pressure Volume: ${md(String(context?.rules?.buyPressureVolume ?? '—'))} SOL`,
    `• Stabilization Threshold: ${md(String(context?.rules?.stabilizationThreshold ?? '—'))}%`,
    `• Arbitrage Profit Floor: ${md(String(context?.rules?.arbitrageProfitFloor ?? '—'))}%`,
    `• Global Stop-Loss: ${md(String(context?.rules?.globalStopLoss ?? '—'))}%`,
    '',
    `Deployment Plan: ${md(context?.walletDeployment || 'Not planned')}`,
    '',
    '_Tip: After adjusting wallets on the token dashboard, tap **Sync Wallets** to refresh this strategy._'
  );

  const text = lines.join('\n');

  return {
    text,
    keyboard: {
      inline_keyboard: [
        [
          { text: '🔗 Link Token', callback_data: 'hsmac_set_token' },
          { text: '🔄 Sync Wallets', callback_data: 'hsmac_sync_wallets' }
        ],
        [
          { text: '🎯 Strategy', callback_data: 'hsmac_strategy' },
          { text: '⚙️ Rules', callback_data: 'hsmac_rules' }
        ],
        [
          { text: '▶️ Engage', callback_data: 'hsmac_engage' },
          { text: '⏹️ Disengage', callback_data: 'hsmac_disengage' }
        ],
        [
          { text: '⚡ Force Execute', callback_data: 'hsmac_execute' },
          { text: '📋 Plan Preview', callback_data: 'hsmac_plan' }
        ],
        [
          { text: '🤖 Auto Execute', callback_data: 'hsmac_toggle_auto' },
          { text: '🚨 Emergency', callback_data: 'hsmac_emergency' }
        ],
        [
          { text: '🔄 Refresh', callback_data: 'hsmac_refresh' },
          { text: '🏠 Main Menu', callback_data: 'menu_main' }
        ]
      ]
    }
  };
}

function getHsmacRulesScreen(context) {
  const tokenMint = context?.tokenMint || null;
  const scopeLabel = tokenMint ? 'Token-Specific Rules' : 'Global Rules';
  const displayMint = tokenMint
    ? `\`${tokenMint.substring(0, 8)}...${tokenMint.substring(tokenMint.length - 8)}\``
    : 'All Tokens';
  const rules = context?.rules || {};

  const lines = [
    '⚙️ *HSMAS Rules Configuration*',
    '',
    `Scope: *${scopeLabel}*`,
    `Target: ${displayMint}`,
    '',
    `• Initial Wallet Count: ${rules.initialWalletCount ?? '—'}`,
    `• Buy Pressure Volume: ${rules.buyPressureVolume ?? '—'} SOL`,
    `• Stabilization Threshold: ${rules.stabilizationThreshold ?? '—'}%`,
    `• Arbitrage Profit Floor: ${rules.arbitrageProfitFloor ?? '—'}%`,
    `• Global Stop-Loss: ${rules.globalStopLoss ?? '—'}%`,
    `• Auto Execute: ${(rules.autoExecute ?? true) ? 'Enabled' : 'Disabled'}`
  ];

  if (context?.note) {
    lines.push('', context.note);
  }

  const text = lines.join('\n');

  const buttons = [
    [
      { text: '👥 Wallet Count', callback_data: 'hsmac_rule_initial_wallets' },
      { text: '💧 BP Volume', callback_data: 'hsmac_rule_bpv' }
    ],
    [
      { text: '📉 Stabilization %', callback_data: 'hsmac_rule_st' },
      { text: '💹 Arbitrage %', callback_data: 'hsmac_rule_apf' }
    ],
    [
      { text: '🛡️ Stop-Loss %', callback_data: 'hsmac_rule_gsl' }
    ],
    [
      { text: '⚡ Auto Execute', callback_data: 'hsmac_rule_autoExecute' }
    ]
  ];

  if (tokenMint) {
    buttons.push([{ text: '♻️ Reset Token Rules', callback_data: 'hsmac_rules_reset' }]);
  }

  buttons.push([{ text: '🔙 Dashboard', callback_data: 'hsmac_dashboard' }]);

  return {
    text,
    keyboard: {
      inline_keyboard: buttons
    }
  };
}

function getHsmacStrategyScreen(currentStrategy = 'auto') {
  const textLines = [
    '🎯 *Select HSMAS Strategy*',
    '',
    'Choose how wallet allocations are generated:'
  ];

  const buttons = [
    [{ text: `${currentStrategy === 'auto' ? '✅ ' : ''}Auto (Adaptive)`, callback_data: 'hsmac_strategy_auto' }],
    [{ text: `${currentStrategy === 'dbpm' ? '✅ ' : ''}DBPM – Buy Pressure`, callback_data: 'hsmac_strategy_dbpm' }],
    [{ text: `${currentStrategy === 'pld' ? '✅ ' : ''}PLD – Stabilization`, callback_data: 'hsmac_strategy_pld' }],
    [{ text: `${currentStrategy === 'cmwa' ? '✅ ' : ''}CMWA – Arbitrage`, callback_data: 'hsmac_strategy_cmwa' }],
    [{ text: '🔙 Dashboard', callback_data: 'hsmac_dashboard' }]
  ];

  return {
    text: textLines.join('\n'),
    keyboard: {
      inline_keyboard: buttons
    }
  };
}

function getHsmacPlanScreen(context) {
  if (context?.error) {
    const text = `⚠️ *Unable to Generate Plan*\n\nReason: ${context.message || 'Unknown error'}`;
    return {
      text,
      keyboard: {
        inline_keyboard: [
          [{ text: '🔙 Dashboard', callback_data: 'hsmac_dashboard' }]
        ]
      }
    };
  }

  const summary = context?.summary || {};
  const lines = [
    '📋 *HSMAS Plan Preview*',
    '',
    `Strategy: ${summary.strategy || 'DBPM'}`,
    `Total Volume: ${(summary.totalVolume ?? 0).toFixed(4)} SOL`,
    `Wallets: ${summary.walletCount ?? 0}`
  ];

  if (summary.roles) {
    lines.push('', '*Roles:*');
    Object.entries(summary.roles).forEach(([role, count]) => {
      lines.push(`• ${role}: ${count}`);
    });
  }

  let text = lines.join('\n');

  const allocationPreview = (context.allocation || []).slice(0, 6).map((entry, idx) => (
    `${idx + 1}. ${entry.role} – ${(entry.amount ?? 0).toFixed(4)} SOL`
  ));

  if (allocationPreview.length > 0) {
    text = `${text}\n\n*Sample Allocation:*\n${allocationPreview.join('\n')}${context.allocation.length > allocationPreview.length ? '\n…' : ''}`;
  }

  return {
    text,
    keyboard: {
      inline_keyboard: [
        [{ text: '🔙 Dashboard', callback_data: 'hsmac_dashboard' }]
      ]
    }
  };
}

function getWizardSmartProfitThresholdScreen() {
  return {
    text: `🤖 *Smart Profit Threshold*\n\n` +
          `When to take profit?`,
    keyboard: {
      inline_keyboard: [
        [
          { text: '20% (Aggressive)', callback_data: 'wizard_sp_threshold_20' },
          { text: '50% (Balanced)', callback_data: 'wizard_sp_threshold_50' }
        ],
        [
          { text: '100% (Conservative)', callback_data: 'wizard_sp_threshold_100' },
          { text: '200% (HODL)', callback_data: 'wizard_sp_threshold_200' }
        ],
        [{ text: '✏️ Custom', callback_data: 'wizard_sp_threshold_custom' }],
        [{ text: '🔙 Back', callback_data: 'wizard_back' }]
      ]
    }
  };
}

function getWizardTransferFeeScreen() {
  return {
    text: `💰 *Token-2022 Transfer Fee*\n\n` +
          `Enable creator rewards on every transfer?\n\n` +
          `*How it works:*\n` +
          `• Small fee taken on each token transfer\n` +
          `• Fees accumulate automatically\n` +
          `• Harvest anytime via dashboard\n\n` +
          `*Choose your fee percentage:*`,
    keyboard: {
      inline_keyboard: [
        [
          { text: '1% Fee', callback_data: 'wizard_fee_100' },
          { text: '0.5% Fee', callback_data: 'wizard_fee_50' }
        ],
        [
          { text: '0.1% Fee', callback_data: 'wizard_fee_10' },
          { text: '🔢 Custom %', callback_data: 'wizard_fee_custom' }
        ],
        [{ text: '⏭️ Skip (No Fees)', callback_data: 'wizard_fee_skip' }],
        [{ text: '🔙 Back', callback_data: 'wizard_back' }]
      ]
    }
  };
}

function getWizardAuthorityFlagsScreen() {
  return {
    text: `🔒 *Token Authority Settings*\n\n` +
          `Configure token permissions (Raydium only):\n\n` +
          `*Disable Mint Authority:*\n` +
          `✅ Recommended - Fixed supply\n` +
          `❌ Required by most DEXs\n\n` +
          `*Disable Freeze Authority:*\n` +
          `✅ Community trust\n` +
          `⚠️ Cannot freeze wallets\n\n` +
          `Select options:`,
    keyboard: {
      inline_keyboard: [
        [{ text: '✅ Disable Mint (Recommended)', callback_data: 'wizard_flag_mint_yes' }],
        [{ text: '✅ Disable Freeze (Recommended)', callback_data: 'wizard_flag_freeze_yes' }],
        [{ text: '🔐 Keep All Authorities', callback_data: 'wizard_flag_keep_all' }],
        [{ text: '➡️ Continue', callback_data: 'wizard_flags_done' }],
        [{ text: '🔙 Back', callback_data: 'wizard_back' }]
      ]
    }
  };
}

// ============================================================================
// LIQUIDITY SCREENS
// ============================================================================

function getAddLiquidityScreen() {
  return {
    text: `➕ *Add Liquidity*\n\n` +
          `Select pool to add liquidity:`,
    keyboard: {
      inline_keyboard: [
        // Will be populated with user's pools
        [{ text: '🔙 Back', callback_data: 'menu_liquidity' }]
      ]
    }
  };
}

function getRemoveLiquidityScreen() {
  return {
    text: `➖ *Remove Liquidity*\n\n` +
          `Select pool to remove liquidity:`,
    keyboard: {
      inline_keyboard: [
        // Will be populated with user's pools
        [{ text: '🔙 Back', callback_data: 'menu_liquidity' }]
      ]
    }
  };
}

function getLiquidityAmountScreen() {
  return {
    text: `💧 *Liquidity Amount*\n\n` +
          `How much to add?`,
    keyboard: {
      inline_keyboard: [
        [
          { text: '25%', callback_data: 'liq_amount_25' },
          { text: '50%', callback_data: 'liq_amount_50' }
        ],
        [
          { text: '75%', callback_data: 'liq_amount_75' },
          { text: '100%', callback_data: 'liq_amount_100' }
        ],
        [{ text: '✏️ Custom', callback_data: 'liq_amount_custom' }],
        [{ text: '🔙 Back', callback_data: 'wizard_back' }]
      ]
    }
  };
}

// ============================================================================
// SWAP/TRADING SCREENS
// ============================================================================

function getSwapScreen() {
  return {
    text: `🔄 *Swap Tokens*\n\n` +
          `Powered by Jupiter (best rates)`,
    keyboard: {
      inline_keyboard: [
        [{ text: '💹 Sell Token → SOL', callback_data: 'swap_sell' }],
        [{ text: '💰 Buy Token ← SOL', callback_data: 'swap_buy' }],
        [{ text: '🔄 Token ↔ Token', callback_data: 'swap_token' }],
        [{ text: '💸 Quick Sell All', callback_data: 'swap_sell_all' }],
        [{ text: '🔙 Back', callback_data: 'menu_trading' }]
      ]
    }
  };
}

// ============================================================================
// TOKEN PROFILE SCREEN
// ============================================================================

function getTokenProfileScreen(token, poolInfo, smartProfitStatus, holders, pnl, groupRoi, pendingRewards, bondingCurveData, bondingCurveError, marketCapUsd, selectionContext = null, mintStatus = null) {
  const hasPool = poolInfo !== null;
  const spEnabled = smartProfitStatus?.enabled || false;
  const hasMintAddress = typeof token.mint_address === 'string' && token.mint_address.length > 0;
  const mintPreview = hasMintAddress
    ? `\`${token.mint_address.substring(0, 12)}...\``
    : '_Not launched yet_';
  
  // Build bonding curve progress bar (for Pump.fun tokens)
  const sanitizeMessage = (value) => {
    if (!value) return '';
    return String(value).replace(/([_*`])/g, '\\$1');
  };

  const shortenAddress = (address = '') => {
    if (typeof address !== 'string' || address.length <= 12) {
      return address || 'N/A';
    }
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  const mintConfidenceLabel = mintStatus?.resolution?.confidence
    ? mintStatus.resolution.confidence.toUpperCase()
    : 'UNKNOWN';
  const mintSourceLabel = mintStatus?.resolution?.source || 'unknown';
  const mintSourceDisplay = sanitizeMessage(mintSourceLabel);

  const tokenSymbolDisplay = sanitizeMessage(token.token_symbol || token.token_name || 'Token');
  const tokenNameDisplay = sanitizeMessage(token.token_name || token.token_symbol || 'Unknown');
  const tokenPlatformDisplay = sanitizeMessage(token.platform || 'N/A');
  const decimalsDisplay = Number.isFinite(token.decimals) ? token.decimals : 'N/A';
  const profileData = token && typeof token.profile === 'object' ? token.profile : {};
  const autoSellEnabled = !!profileData.devAutoSell;
  const autoSellDelaySeconds = Number.isFinite(profileData.devAutoSellDelaySeconds)
    ? profileData.devAutoSellDelaySeconds
    : 0;

  const formatTokenCount = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric === 0) {
      return '0';
    }
    const absValue = Math.abs(numeric);
    if (absValue >= 1_000_000) {
      return `${(numeric / 1_000_000).toFixed(2)}M`;
    }
    if (absValue >= 1_000) {
      return `${(numeric / 1_000).toFixed(2)}K`;
    }
    if (absValue >= 1) {
      return numeric.toFixed(2);
    }
    return numeric.toFixed(4);
  };

  let mintWarningText = '';
  if (mintStatus) {
    const resolution = mintStatus.resolution || null;
    const duplicates = Array.isArray(mintStatus.duplicates) ? mintStatus.duplicates : [];
    const cachedMint = mintStatus.cachedMint || null;
    const currentMint = mintStatus.currentMint || token.mint_address || null;
    const resolvedMint = resolution?.mintAddress || currentMint || null;

    if (!resolvedMint) {
      mintWarningText += `\n⚠️ _Mint address not resolved from live data._\n`;
    }

    if (cachedMint && resolvedMint && cachedMint !== resolvedMint) {
      mintWarningText += `\n⚠️ Cached mint ${sanitizeMessage(shortenAddress(cachedMint))} updated to ${sanitizeMessage(shortenAddress(resolvedMint))}\n`;
    }

    if (resolution && (!resolution.confidence || ['none', 'low', 'unverified', 'db-only', 'db-cache'].includes(resolution.confidence))) {
      mintWarningText += `\n⚠️ _Mint not yet verified on-chain (source: ${sanitizeMessage(mintSourceLabel)})._`;
      mintWarningText += '\n';
    }

    if (Array.isArray(resolution?.candidates) && resolution.candidates.length > 1) {
      const candidatePreview = resolution.candidates
        .slice(0, 3)
        .map((candidate) => sanitizeMessage(shortenAddress(candidate.mint)))
        .join(', ');
      mintWarningText += `\n⚠️ Multiple mint candidates detected: ${candidatePreview}\n`;
    }

    if (duplicates.length > 0) {
      const duplicatePreview = duplicates
        .slice(0, 3)
        .map((dup) => {
          const label = dup.token_symbol || dup.token_name || dup.mint_address;
          return sanitizeMessage(label ? `${label} (${shortenAddress(dup.mint_address)})` : shortenAddress(dup.mint_address));
        })
        .join(', ');
      mintWarningText += `\n⚠️ ${duplicates.length} other token(s) share this mint${duplicatePreview ? `: ${duplicatePreview}` : ''}\n`;
    }
  }

  let bondingCurveText = '';
  if ((token.platform === 'pumpfun' || token.platform === 'Pump.fun') && bondingCurveData) {
    const progress = bondingCurveData.progress || 0;
    const solRaised = bondingCurveData.solRaised || 0;
    const migrated = bondingCurveData.migrated || false;
    
    // Progress bar visualization (20 blocks)
    const filledBlocks = Math.floor((progress / 100) * 20);
    const emptyBlocks = 20 - filledBlocks;
    const progressBar = '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks);
    
    bondingCurveText = `\n📊 *Bonding Curve Progress:*\n`;
    bondingCurveText += `${progressBar} ${progress.toFixed(1)}%\n`;
    bondingCurveText += `SOL Raised: ${solRaised.toFixed(2)} / 85 SOL\n`;
    if (migrated) {
      bondingCurveText += `✅ *MIGRATED TO RAYDIUM*\n`;
    }
  } else if ((token.platform === 'pumpfun' || token.platform === 'Pump.fun') && bondingCurveError) {
    bondingCurveText = `\n📊 *Bonding Curve:* _${sanitizeMessage(bondingCurveError)}_\n`;
  }
  
  // ============================================================================
  // MARKET CAP PROGRESS BAR
  // ============================================================================
  // Purpose: Help users track token maturity through psychological price milestones
  // - Shows progress toward next milestone ($10K → $50K → $100K → $500K → $1M)
  // - Helps traders understand token growth stage
  // - Based on Jupiter price feed × total supply = market cap
  // ============================================================================
  let marketCapText = '';
  if (marketCapUsd && marketCapUsd > 0) {
    // Market cap milestones (psychological price targets for retail traders)
    const milestones = [
      { value: 10000, label: '$10K' },     // Micro cap - early stage
      { value: 50000, label: '$50K' },     // Small cap - gaining traction
      { value: 100000, label: '$100K' },   // Mid cap - established
      { value: 500000, label: '$500K' },   // Large cap - mature
      { value: 1000000, label: '$1M' }     // Mega cap - moonshot territory
    ];
    
    // Find next milestone target
    let currentMilestone = milestones[0];
    for (let i = 0; i < milestones.length; i++) {
      if (marketCapUsd < milestones[i].value) {
        currentMilestone = milestones[i];
        break;
      }
      // If above all milestones, set dynamic target
      if (i === milestones.length - 1) {
        currentMilestone = { value: marketCapUsd * 2, label: 'MOON 🚀' };
      }
    }
    
    // Calculate progress to next milestone (0-100%)
    const mcProgress = Math.min(100, (marketCapUsd / currentMilestone.value) * 100);
    const mcFilledBlocks = Math.floor((mcProgress / 100) * 20);
    const mcEmptyBlocks = 20 - mcFilledBlocks;
    const mcProgressBar = '█'.repeat(mcFilledBlocks) + '░'.repeat(mcEmptyBlocks);
    
    marketCapText = `\n💰 *Market Cap Progress:*\n`;
    marketCapText += `${mcProgressBar} ${mcProgress.toFixed(1)}%\n`;
    marketCapText += `Current: $${(marketCapUsd / 1000).toFixed(1)}K → Target: ${currentMilestone.label}\n`;
  }

  
  // Build holders text
  let holdersText = '';
  if (hasMintAddress && Array.isArray(holders) && holders.length > 0) {
    holdersText = `\n*👥 Top Holders:*\n`;
    holders.slice(0, 5).forEach((holder, idx) => {
      const rawAddress = holder?.address || holder?.tokenAccount || 'Unknown';
      const safeAddress = rawAddress.length > 8
        ? `${rawAddress.substring(0, 4)}...${rawAddress.substring(rawAddress.length - 4)}`
        : rawAddress;
      holdersText += `${idx + 1}. ${safeAddress}: ${holder?.percentage ?? '0'}%\n`;
    });
  }
  
  // Build PNL text
  let pnlText = '';
  if (pnl) {
    const pnlSign = pnl.pnlPercentage >= 0 ? '+' : '';
    const pnlEmoji = pnl.pnlPercentage >= 0 ? '📈' : '📉';
    pnlText = `\n${pnlEmoji} *Active Wallet:* ${pnlSign}${pnl.pnlPercentage.toFixed(2)}% (${pnlSign}$${pnl.pnl.toFixed(2)})\n`;
  }
  
  let groupPnlText = '';
  if (groupRoi && groupRoi.walletCount > 0) {
    if (groupRoi.priceUnavailable) {
      const reason = Array.isArray(groupRoi.priceErrors) && groupRoi.priceErrors.length
        ? ` (${sanitizeMessage(groupRoi.priceErrors[0])})`
        : '';
      groupPnlText = `\n⚠️ *All Wallets (${groupRoi.walletCount}):* Price unavailable${reason}\n`;
    } else {
      const roi = Number(groupRoi.roiPercentage);
      const aggregateValue = Number(groupRoi.totalCurrentValue || 0);
      if (Number.isFinite(roi)) {
        const roiSign = roi >= 0 ? '+' : '';
        const roiEmoji = roi >= 0 ? '🟢' : '🔴';
        const valueDisplay = Number.isFinite(aggregateValue) && aggregateValue > 0
          ? ` • $${aggregateValue.toFixed(2)}`
          : '';
        groupPnlText = `\n${roiEmoji} *All Wallets (${groupRoi.walletCount}):* ${roiSign}${roi.toFixed(2)}%${valueDisplay}\n`;
      }
    }
  }

  let selectionSummaryText = '';
  const normalizedPlatform = String(token.platform || '').toLowerCase();
  const isPumpfunToken = normalizedPlatform === 'pumpfun' || normalizedPlatform === 'pump.fun';
  if (isPumpfunToken && selectionContext && Array.isArray(selectionContext.wallets) && selectionContext.wallets.length) {
    const selectedIds = Array.isArray(selectionContext.selectedWalletIds)
      ? new Set(selectionContext.selectedWalletIds)
      : new Set();
    let buyDisplay = Number.isFinite(selectionContext.buyAmount) && selectionContext.buyAmount > 0
      ? `${selectionContext.buyAmount.toFixed(3)} SOL`
      : null;
    if (!buyDisplay) {
      buyDisplay = '⚠️ Not set — configure a buy amount';
    }

    const sellPlanTokens = Number(selectionContext.snapshot?.sellPlanTokens ?? 0);
    const sellUsdDisplay = selectionContext.snapshot?.sellUsd || null;
    let sellPlanSummary = null;
    if (selectionContext.sellMode === 'percentage' && Number.isFinite(selectionContext.sellValue)) {
      sellPlanSummary = `${selectionContext.sellValue}% of holdings`;
    } else if (selectionContext.sellMode === 'tokens' && Number.isFinite(selectionContext.sellValue)) {
      sellPlanSummary = `${selectionContext.sellValue} tokens per wallet`;
    } else if (selectionContext.sellMode === 'all') {
      sellPlanSummary = 'Sell 100% of holdings';
    }

    if (sellPlanSummary && sellPlanTokens > 0) {
      let suffix = ` (~${formatTokenCount(sellPlanTokens)} tokens`;
      if (sellUsdDisplay && sellUsdDisplay !== 'Not set' && sellUsdDisplay !== 'N/A (price unavailable)') {
        suffix += ` ≈ ${sellUsdDisplay}`;
      }
      suffix += ')';
      sellPlanSummary += suffix;
    } else if (sellPlanSummary && sellPlanTokens === 0) {
      sellPlanSummary += ' (insufficient balance detected)';
    }
    if (!sellPlanSummary) {
      sellPlanSummary = '⚠️ Not set — configure a sell percentage or token amount';
    }

    // Manual Trading Configuration (different from Smart Profit automation)
    selectionSummaryText =
      `\n📊 *Manual Trading Setup:*\n` +
      `Buy Amount: ${sanitizeMessage(buyDisplay)}\n` +
      `Sell Plan: ${sanitizeMessage(sellPlanSummary)}\n`;
    if (selectionContext.group && selectionContext.group.name) {
      selectionSummaryText += `Group: ${sanitizeMessage(selectionContext.group.name)}\n`;
    }

    const autoManaged = selectionContext.autoManaged !== false;
    selectionSummaryText += `Mode: ${autoManaged ? 'Auto (balances)' : 'Manual'}\n`;
    if (!autoManaged) {
      selectionSummaryText += 'Wallet selection stays fixed until Auto Mode is re-enabled.\n';
    }

    const walletSummaries = Array.isArray(selectionContext.walletSummaries)
      ? selectionContext.walletSummaries
      : [];
    if (walletSummaries.length) {
      const selectedWallets = walletSummaries.filter((summary) => summary.selected);
      selectionSummaryText += `Armed Wallets: ${selectedWallets.length}/${walletSummaries.length}\n`;
      const selectedBalance = Number(selectionContext.selectedWalletBalance || 0);
      if (selectedBalance > 0) {
        selectionSummaryText += `Selected Balance: ${formatTokenCount(selectedBalance)} tokens\n`;
      }
      
      // Enhanced wallet display with PNL - show up to 10 wallets with pagination
      const maxWalletsToShow = 10;
      const currentPrice = selectionContext.snapshot?.priceUsd || null;
      const showPnl = Number.isFinite(currentPrice) && currentPrice > 0;
      
      const walletsToDisplay = walletSummaries.slice(0, maxWalletsToShow);
      const walletPreview = walletsToDisplay.map((summary) => {
        const icon = summary.selected ? '🟢' : '⚪️';
        const solPreview = summary.solBalanceShort ? ` • ${summary.solBalanceShort}` : '';
        let walletLine = `${icon} ${sanitizeMessage(summary.label)} • ${summary.balanceDisplay} tokens${solPreview}`;
        
        // Add real-time PNL if price is available
        if (showPnl && summary.balance > 0) {
          const currentValue = summary.balance * currentPrice;
          const pnlUsd = summary.pnl || 0;
          const pnlPercent = summary.pnlPercent || 0;
          
          if (Number.isFinite(currentValue) && currentValue > 0) {
            const pnlSign = pnlPercent >= 0 ? '+' : '';
            const pnlEmoji = pnlPercent >= 0 ? '💰' : '📉';
            walletLine += `\n   ${pnlEmoji} $${currentValue.toFixed(2)} (${pnlSign}${pnlPercent.toFixed(1)}%)`;
          }
        }
        
        return walletLine;
      });
      
      if (walletPreview.length) {
        selectionSummaryText += `${walletPreview.join('\n')}\n`;
      }
      
      // Show pagination info if there are more wallets
      if (walletSummaries.length > maxWalletsToShow) {
        selectionSummaryText += `… ${walletSummaries.length - maxWalletsToShow} more wallet(s) • Swipe for full list\n`;
      }
    }

    // Removed redundant ROI Source display (internal implementation detail)
    // Users don't need to know if data comes from cache vs RPC

    if (selectionContext.execution && Array.isArray(selectionContext.execution.results) && selectionContext.execution.results.length) {
      const execution = selectionContext.execution;
      const typeTitle = typeof execution.type === 'string'
        ? `${execution.type.charAt(0).toUpperCase()}${execution.type.slice(1)}`
        : 'Execution';
      const relativeTime = formatRelativeTimestamp(execution.timestamp);
      const timingDisplay = relativeTime ? ` (${sanitizeMessage(relativeTime)})` : '';
      selectionSummaryText += `Last ${sanitizeMessage(typeTitle)}${timingDisplay}:\n`;

      const rendered = execution.results.slice(0, 3).map((entry) => {
        const statusEmoji = entry.status === 'success'
          ? '✅'
          : entry.status === 'error'
            ? '❌'
            : '⚠️';

        let labelText = '';
        if (entry.label) {
          labelText = sanitizeMessage(entry.label);
        } else if (entry.walletId) {
          const wallet = selectionContext.wallets.find((w) => w.wallet_id === entry.walletId);
          if (wallet) {
            labelText = sanitizeMessage(wallet.wallet_name && wallet.wallet_name.trim().length
              ? wallet.wallet_name.trim()
              : shortenAddress(wallet.wallet_address));
          } else {
            labelText = `Wallet ${entry.walletId}`;
          }
        } else if (typeof entry.offset === 'number') {
          labelText = `Offset ${entry.offset}`;
        } else {
          labelText = 'Entry';
        }

        let detail = '';
        if (entry.signature) {
          detail = shortenSignature(entry.signature);
        } else if (entry.bundleId) {
          detail = shortenSignature(entry.bundleId);
          if (entry.bundleStatus?.status) {
            detail += ` • ${entry.bundleStatus.status}`;
          }
        } else if (entry.error) {
          detail = entry.error;
        }
        const detailDisplay = detail ? ` • ${sanitizeMessage(detail)}` : '';
        return `${statusEmoji} ${labelText}${detailDisplay}`;
      });

      selectionSummaryText += `${rendered.join('\n')}\n`;
      if (execution.results.length > rendered.length) {
        selectionSummaryText += `… ${execution.results.length - rendered.length} more\n`;
      }
    }
  }

  // Warning block removed to reduce dashboard clutter
  
  // Build pending rewards text - only show if there are actual rewards
  let rewardsText = '';
  if (pendingRewards) {
    if (token.platform === 'pumpfun' || token.platform === 'Pump.fun') {
      const preMigration = Number(pendingRewards.preMigration || 0);
      const postMigration = Number(pendingRewards.postMigration || 0);
      const totalRewards = preMigration + postMigration;
      
      // Only show if there are actual rewards to claim
      if (Number.isFinite(totalRewards) && totalRewards > 0) {
        rewardsText = `\n💰 *Creator Rewards:* ${totalRewards.toFixed(4)} SOL\n`;
      }
    } else {
      const fees = typeof pendingRewards === 'number'
        ? pendingRewards
        : Number(pendingRewards.totalFees || 0);

      // Only show if there are actual fees to claim
      if (Number.isFinite(fees) && fees > 0) {
        rewardsText = `\n💰 *Trading Fees:* ${fees.toFixed(4)} SOL\n`;
      }
    }
  }
  
  let statsText = '';
  if (selectionContext && selectionContext.snapshot) {
    const stats = selectionContext.snapshot;
    const priceUnavailable = Boolean(stats.priceUnavailable);
    const priceNote = priceUnavailable
      ? `• Price: N/A (market price unavailable)\n`
      : '';
    const priceErrorNote = priceUnavailable && Array.isArray(stats.priceErrors) && stats.priceErrors.length
      ? `   ${sanitizeMessage(stats.priceErrors[0])}\n`
      : '';
    statsText =
      `\n📊 *Stats:*\n` +
      `• B: ${stats.buyUsd ?? '$0.00'} | S: ${stats.sellUsd ?? '$0.00'}\n` +
      `• HOLD: ${stats.holdPercent ?? '0.00%'} | WORTH: ${stats.worthUsd ?? '$0.00'}\n` +
      `• PROFIT: ${stats.profitIndicator ?? '🟢'} ${stats.profitUsd ?? '$0.00'}\n` +
      `• Liquidity: ${stats.liquidityUsd ?? '$0.00'}\n` +
      priceNote +
      priceErrorNote;
  }
  
  return {
    text: `📊 *Token Dashboard: ${tokenSymbolDisplay}*\n\n` +
          `*Details:*\n` +
          `Name: ${tokenNameDisplay}\n` +
          `Mint: ${mintPreview}\n` +
          `Platform: ${tokenPlatformDisplay}\n` +
          `\n*Status:*\n` +
          `Pool: ${hasPool ? '✅ Active' : '⚠️ Not created'}\n` +
          `Smart Profit: ${spEnabled ? '✅ Active' : '⚪️ Inactive'}\n` +
          `Auto-Sell: ${autoSellEnabled ? `✅ Enabled (${autoSellDelaySeconds}s delay)` : '⚪️ Disabled'}` +
          bondingCurveText +
          marketCapText +
          pnlText +
          groupPnlText +
          statsText +
          selectionSummaryText +
          rewardsText +
          holdersText,
    keyboard: {
      inline_keyboard: (() => {
        const rows = [];

        if (isPumpfunToken && hasMintAddress) {
          rows.push([
            { text: '🔥 Dev Sell All', callback_data: `dev_sell_all_${token.mint_address}` },
            { text: '💸 Dev Sell Amount', callback_data: `dev_sell_${token.mint_address}` },
            { text: '💰 Dev Buy More', callback_data: `dev_buy_${token.mint_address}` }
          ]);

          if (selectionContext && Array.isArray(selectionContext.wallets) && selectionContext.wallets.length) {
            const selectedIds = Array.isArray(selectionContext.selectedWalletIds)
              ? new Set(selectionContext.selectedWalletIds)
              : new Set();
            const creatorWalletId = token.wallet_id || null;
            const walletSummaryMap = new Map(
              Array.isArray(selectionContext.walletSummaries)
                ? selectionContext.walletSummaries.map((summary) => [summary.wallet_id, summary])
                : []
            );
            const buttons = [];
            let walletCounter = 1;

            selectionContext.wallets.forEach((wallet) => {
              const isSelected = selectedIds.has(wallet.wallet_id);
              const isDevWallet = creatorWalletId && wallet.wallet_id === creatorWalletId;
              const labelBase = isDevWallet ? 'D' : `W${walletCounter++}`;
              const statusEmoji = isSelected ? '🟢' : '🔴';
              const summary = walletSummaryMap.get(wallet.wallet_id);
              let balanceSuffix = '';
              if (summary?.solBalanceShort) {
                balanceSuffix = ` ${summary.solBalanceShort}`;
              } else if (summary?.solBalanceError) {
                balanceSuffix = ' ⚠️';
              }

              buttons.push({
                text: `${statusEmoji} ${labelBase}${balanceSuffix}`,
                callback_data: `profile_wallet_toggle_${token.token_id}_${wallet.wallet_id}`
              });
            });

            const chunkSize = 4;
            for (let i = 0; i < buttons.length; i += chunkSize) {
              const chunk = buttons.slice(i, i + chunkSize);
              rows.push(chunk);
            }

            rows.push([
            { text: '🌐 Select All', callback_data: `profile_wallet_select_all_${token.token_id}` },
            { text: '📈 Wallets w/ Balance', callback_data: `profile_wallet_select_balance_${token.token_id}` }
          ]);

          const autoManaged = selectionContext.autoManaged !== false;
          rows.push([
            {
              text: autoManaged ? '🤖 Auto Mode: ON' : '🛠 Auto Mode: OFF',
              callback_data: `profile_wallet_auto_toggle_${token.token_id}`
            },
              { text: '🔁 Reset Selection', callback_data: `profile_wallet_reset_${token.token_id}` }
            ]);
          }

          rows.push([
            { text: '🛒 Set Buy Amount', callback_data: `profile_buy_custom_${token.token_id}` },
            { text: '🧮 Set Sell Amount', callback_data: `profile_sell_custom_${token.token_id}` }
          ]);

        rows.push([
          { text: '0.05 SOL', callback_data: `profile_buy_amount_${token.token_id}_0.05` },
          { text: '0.10 SOL', callback_data: `profile_buy_amount_${token.token_id}_0.1` },
          { text: '0.25 SOL', callback_data: `profile_buy_amount_${token.token_id}_0.25` }
        ]);
        rows.push([
          { text: '🧹 Clear Buy', callback_data: `profile_buy_clear_${token.token_id}` }
        ]);

        rows.push([
          { text: '10k tokens', callback_data: `profile_sell_tokens_${token.token_id}_10000` },
          { text: '25k tokens', callback_data: `profile_sell_tokens_${token.token_id}_25000` },
          { text: '50k tokens', callback_data: `profile_sell_tokens_${token.token_id}_50000` }
          ]);

          rows.push([
            { text: 'Sell 25%', callback_data: `profile_sell_percent_${token.token_id}_25` },
            { text: 'Sell 50%', callback_data: `profile_sell_percent_${token.token_id}_50` },
            { text: 'Sell 75%', callback_data: `profile_sell_percent_${token.token_id}_75` }
          ]);

          rows.push([
            { text: 'Sell 100%', callback_data: `profile_sell_all_${token.token_id}` }
          ]);
        rows.push([
          { text: '🚨 DUMP ALL', callback_data: `profile_dump_all_${token.token_id}` }
        ]);
        rows.push([
          { text: '🧹 Clear Sell Plan', callback_data: `profile_sell_clear_${token.token_id}` }
          ]);

          rows.push([
            { text: '✅ Execute Buy', callback_data: `profile_buy_execute_${token.token_id}` },
            { text: '✅ Execute Sell', callback_data: `profile_sell_execute_${token.token_id}` }
          ]);

        rows.push([
          { text: '📜 Execution History', callback_data: `profile_execution_history_${token.token_id}` }
          ]);

          rows.push([
            { text: '📦 Send Bundle', callback_data: `profile_send_bundle_${token.token_id}` },
            { text: '⏱ Block Stagger', callback_data: `profile_bundle_stagger_${token.token_id}` }
          ]);

          rows.push([
            { text: '🔄 Swap', callback_data: `profile_swap_${token.token_id}` },
            { text: '💸 Claim Fees', callback_data: `profile_claim_${token.token_id}` }
          ]);
        } else {
          rows.push([
            { text: '🔄 Swap', callback_data: `profile_swap_${token.token_id}` },
            { text: '💸 Claim Fees', callback_data: `profile_claim_${token.token_id}` }
          ]);
        }

        rows.push([
            { text: '➕ Add Liquidity', callback_data: `profile_add_liq_${token.token_id}` },
            { text: '➖ Remove Liquidity', callback_data: `profile_remove_liq_${token.token_id}` }
        ]);
        
        if (hasPool && poolInfo?.lpTokenMint) {
          rows.push([
            { text: '🧺 Withdraw All Liquidity', callback_data: `profile_withdraw_all_${token.token_id}` }
          ]);
        }
        
        // Add "Harvest Transfer Fees" button for Token-2022 tokens with transfer fees
        if (token.platform === 'raydium' && token.mint_address && token.mint_address !== 'pending') {
          rows.push([
            { text: '💰 Harvest Transfer Fees', callback_data: `profile_harvest_fees_${token.token_id}` }
          ]);
        }

        rows.push([
          { text: '🤖 Smart Profit', callback_data: `profile_sp_${token.token_id}` },
          { text: '📊 Full Analytics', callback_data: `profile_analytics_${token.token_id}` }
        ]);

        rows.push([
          { text: '🧠 Hyper Smart', callback_data: `profile_hsmac_dashboard_${token.token_id}` },
          { text: '⚙️ HS Rules', callback_data: `profile_hsmac_rules_${token.token_id}` }
        ]);

        rows.push([
          { text: '⚙️ Settings', callback_data: `profile_settings_${token.token_id}` },
          { text: '🔄 Refresh', callback_data: `profile_refresh_${token.token_id}` }
          ]);

        rows.push([{ text: '🔙 Back', callback_data: 'token_menu_home' }]);

        return rows;
      })()
    }
  };
}

module.exports = {
  // Main menus
  getMainMenu,
  getSmartProfitActivationScreen,
  getSmartProfitWalletManagementScreen,
  getWalletMenu,
  getTokenMenu,
  getLiquidityMenu,
  getLaunchMenu,
  getTradingMenu,
  getAnalyticsMenu,
  getSettingsMenu,
  getSmartProfitSettingsScreen,
  getAdminMenu,
  
  // Wizard screens
  getWizardPlatformScreen,
  getWizardDecimalsScreen,
  getWizardSupplyScreen,
  getWizardPoolScreen,
  getWizardPoolAmountsScreen,
  getWizardPoolSolScreen,
  getWizardBundleScreen,
  getWizardBundleWalletScreen,
  getWizardSmartProfitScreen,
  getWizardSmartProfitThresholdScreen,
  getWizardTransferFeeScreen,
  getWizardAuthorityFlagsScreen,
  
  // Feature screens
  getAddLiquidityScreen,
  getRemoveLiquidityScreen,
  getLiquidityAmountScreen,
  getSwapScreen,
  getTokenProfileScreen,
  getHsmacStrategyScreen,
  getHsmacDashboardScreen,
  getHsmacRulesScreen,
  getHsmacPlanScreen
};

