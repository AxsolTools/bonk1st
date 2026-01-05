/**
 * State Management Module (FSM)
 * Finite State Machine for managing multi-step user interactions
 */

const { saveUserState, getUserState, clearUserState } = require('./db');

// State definitions
const STATES = {
  IDLE: 'idle',
  // Wallet states
  IMPORT_WALLET_AWAITING_INPUT: 'import_wallet_awaiting_input',
  WALLET_RENAME_AWAITING_NAME: 'wallet_rename_awaiting_name',
  WALLET_GROUP_CREATE_AWAITING_NAME: 'wallet_group_create_awaiting_name',
  WALLET_GROUP_RENAME_AWAITING_NAME: 'wallet_group_rename_awaiting_name',
  WALLET_GROUP_SELECT_WALLETS: 'wallet_group_select_wallets',
  WALLET_BULK_ARCHIVE: 'wallet_bulk_archive',
  COLLECT_SOL_SELECT: 'collect_sol_select',
  COLLECT_SOL_ADDRESS: 'collect_sol_address',
  // Token creation states
  CREATE_TOKEN_AWAITING_TYPE: 'create_token_awaiting_type',
  CREATE_TOKEN_AWAITING_NAME: 'create_token_awaiting_name',
  CREATE_TOKEN_AWAITING_SYMBOL: 'create_token_awaiting_symbol',
  CREATE_TOKEN_AWAITING_DECIMALS: 'create_token_awaiting_decimals',
  CREATE_TOKEN_AWAITING_SUPPLY: 'create_token_awaiting_supply',
  CREATE_TOKEN_AWAITING_DESCRIPTION: 'create_token_awaiting_description',
  CREATE_TOKEN_AWAITING_IMAGE: 'create_token_awaiting_image',
  CREATE_TOKEN_AWAITING_FEE_CONFIG: 'create_token_awaiting_fee_config',
  CREATE_TOKEN_AWAITING_CONFIRMATION: 'create_token_awaiting_confirmation',
  // Pool creation states
  CREATE_POOL_AWAITING_TOKEN_SELECT: 'create_pool_awaiting_token_select',
  CREATE_POOL_AWAITING_TOKEN_AMOUNT: 'create_pool_awaiting_token_amount',
  CREATE_POOL_AWAITING_SOL_AMOUNT: 'create_pool_awaiting_sol_amount',
  CREATE_POOL_AWAITING_CONFIRMATION: 'create_pool_awaiting_confirmation',
  RAYDIUM_BUNDLE_AWAITING_AMOUNTS: 'raydium_bundle_awaiting_amounts',
  RAYDIUM_BUNDLE_CONFIRMATION: 'raydium_bundle_confirmation',
  SMART_PROFIT_AWAITING_TOKEN: 'smart_profit_awaiting_token',
  SMART_PROFIT_AWAITING_GROUP: 'smart_profit_awaiting_group',
  SMART_PROFIT_AWAITING_THRESHOLD: 'smart_profit_awaiting_threshold',
  SMART_PROFIT_AWAITING_BUY_TRIGGER: 'smart_profit_awaiting_buy_trigger',
  SMART_PROFIT_AWAITING_SELL_TRIGGER: 'smart_profit_awaiting_sell_trigger',
  SMART_PROFIT_AWAITING_BUY_AMOUNT: 'smart_profit_awaiting_buy_amount',
  HSMAC_AWAITING_TOKEN: 'hsmac_awaiting_token',
  HSMAC_AWAITING_RULE_VALUE: 'hsmac_awaiting_rule_value',
  SWAP_AWAITING_BUY_SOL: 'swap_awaiting_buy_sol',
  SWAP_AWAITING_SELL_AMOUNT: 'swap_awaiting_sell_amount',
  // Liquidity states
  ADD_LIQUIDITY_AWAITING_POOL_SELECT: 'add_liquidity_awaiting_pool_select',
  ADD_LIQUIDITY_AWAITING_AMOUNTS: 'add_liquidity_awaiting_amounts',
  REMOVE_LIQUIDITY_AWAITING_POOL_SELECT: 'remove_liquidity_awaiting_pool_select',
  REMOVE_LIQUIDITY_AWAITING_PERCENTAGE: 'remove_liquidity_awaiting_percentage',
  AWAITING_ADD_LIQ_AMOUNTS: 'awaiting_add_liq_amounts',
  AWAITING_REMOVE_LIQ_AMOUNT: 'awaiting_remove_liq_amount',
  // Withdrawal states
  WITHDRAW_AWAITING_TOKEN_SELECT: 'withdraw_awaiting_token_select',
  WITHDRAW_AWAITING_AMOUNT: 'withdraw_awaiting_amount',
  WITHDRAW_AWAITING_ADDRESS: 'withdraw_awaiting_address',
  WITHDRAW_AWAITING_CONFIRMATION: 'withdraw_awaiting_confirmation',
  LUT_EXTEND_AWAITING_ADDRESSES: 'lut_extend_awaiting_addresses'
};

/**
 * State manager class
 */
class StateManager {
  /**
   * Get user's current state
   * @param {number} userId - User ID
   * @returns {object} State object
   */
  static getState(userId) {
    const stateRecord = getUserState(userId);
    
    if (!stateRecord || !stateRecord.current_state) {
      return {
        state: STATES.IDLE,
        data: {}
      };
    }
    
    // Check if state is expired (30 minutes)
    const STATE_EXPIRATION = 30 * 60 * 1000; // 30 minutes in milliseconds
    if (stateRecord.updated_at) {
      const age = Date.now() - (stateRecord.updated_at * 1000);
      if (age > STATE_EXPIRATION) {
        console.log(`[STATE] Expired state for user ${userId}, clearing`);
        clearUserState(userId);
        return {
          state: STATES.IDLE,
          data: {}
        };
      }
    }
    
    return {
      state: stateRecord.current_state,
      data: stateRecord.state_data || {}
    };
  }
  
  /**
   * Set user's state
   * @param {number} userId - User ID
   * @param {string} state - State name
   * @param {object} data - State data
   */
  static setState(userId, state, data = {}) {
    // Merge with existing data
    const currentState = this.getState(userId);
    const mergedData = { ...currentState.data, ...data };
    
    saveUserState(userId, state, mergedData);
  }
  
  /**
   * Update state data without changing state
   * @param {number} userId - User ID
   * @param {object} data - Data to merge
   */
  static updateData(userId, data) {
    const currentState = this.getState(userId);
    this.setState(userId, currentState.state, data);
  }
  
  /**
   * Clear user's state
   * @param {number} userId - User ID
   */
  static clearState(userId) {
    clearUserState(userId);
  }
  
  /**
   * Check if user is in a specific state
   * @param {number} userId - User ID
   * @param {string} state - State to check
   * @returns {boolean}
   */
  static isInState(userId, state) {
    const currentState = this.getState(userId);
    return currentState.state === state;
  }
  
  /**
   * Check if user is idle
   * @param {number} userId - User ID
   * @returns {boolean}
   */
  static isIdle(userId) {
    return this.isInState(userId, STATES.IDLE);
  }
  
  /**
   * Check if user is in any active state
   * @param {number} userId - User ID
   * @returns {boolean}
   */
  static hasActiveState(userId) {
    return !this.isIdle(userId);
  }
  
  /**
   * Get state data value
   * @param {number} userId - User ID
   * @param {string} key - Data key
   * @param {*} defaultValue - Default value if key doesn't exist
   * @returns {*} Value
   */
  static getData(userId, key, defaultValue = null) {
    const currentState = this.getState(userId);
    return currentState.data[key] !== undefined ? currentState.data[key] : defaultValue;
  }
  
  /**
   * Reset to idle state
   * @param {number} userId - User ID
   */
  static resetToIdle(userId) {
    this.setState(userId, STATES.IDLE, {});
  }
}

/**
 * Token creation flow helper
 */
class TokenCreationFlow {
  static start(userId) {
    StateManager.setState(userId, STATES.CREATE_TOKEN_AWAITING_TYPE, {
      step: 'type'
    });
  }
  
  static setType(userId, tokenType) {
    StateManager.setState(userId, STATES.CREATE_TOKEN_AWAITING_NAME, {
      tokenType,
      step: 'name'
    });
  }
  
  static setName(userId, name) {
    StateManager.updateData(userId, { name });
    StateManager.setState(userId, STATES.CREATE_TOKEN_AWAITING_SYMBOL, {
      ...StateManager.getData(userId),
      step: 'symbol'
    });
  }
  
  static setSymbol(userId, symbol) {
    StateManager.updateData(userId, { symbol });
    StateManager.setState(userId, STATES.CREATE_TOKEN_AWAITING_DECIMALS, {
      ...StateManager.getData(userId),
      step: 'decimals'
    });
  }
  
  static setDecimals(userId, decimals) {
    StateManager.updateData(userId, { decimals });
    StateManager.setState(userId, STATES.CREATE_TOKEN_AWAITING_SUPPLY, {
      ...StateManager.getData(userId),
      step: 'supply'
    });
  }
  
  static setSupply(userId, supply) {
    StateManager.updateData(userId, { supply });
    
    // If Token-2022 with fees, ask for fee config
    const tokenType = StateManager.getData(userId, 'tokenType');
    if (tokenType === 'token2022_fees') {
      StateManager.setState(userId, STATES.CREATE_TOKEN_AWAITING_FEE_CONFIG, {
        ...StateManager.getData(userId),
        step: 'fee_config'
      });
    } else {
      StateManager.setState(userId, STATES.CREATE_TOKEN_AWAITING_DESCRIPTION, {
        ...StateManager.getData(userId),
        step: 'description'
      });
    }
  }
  
  static setFeeConfig(userId, feeBasisPoints, maxFee) {
    StateManager.updateData(userId, { feeBasisPoints, maxFee });
    StateManager.setState(userId, STATES.CREATE_TOKEN_AWAITING_DESCRIPTION, {
      ...StateManager.getData(userId),
      step: 'description'
    });
  }
  
  static setDescription(userId, description) {
    StateManager.updateData(userId, { description });
    StateManager.setState(userId, STATES.CREATE_TOKEN_AWAITING_IMAGE, {
      ...StateManager.getData(userId),
      step: 'image'
    });
  }
  
  static setImage(userId, imageUrl) {
    StateManager.updateData(userId, { imageUrl });
    StateManager.setState(userId, STATES.CREATE_TOKEN_AWAITING_CONFIRMATION, {
      ...StateManager.getData(userId),
      step: 'confirmation'
    });
  }
  
  static getData(userId) {
    return StateManager.getState(userId).data;
  }
  
  static cancel(userId) {
    StateManager.resetToIdle(userId);
  }
}

/**
 * Pool creation flow helper
 */
class PoolCreationFlow {
  static start(userId, tokenId = null) {
    if (tokenId) {
      StateManager.setState(userId, STATES.CREATE_POOL_AWAITING_TOKEN_AMOUNT, {
        tokenId,
        step: 'token_amount'
      });
    } else {
      StateManager.setState(userId, STATES.CREATE_POOL_AWAITING_TOKEN_SELECT, {
        step: 'token_select'
      });
    }
  }
  
  static setToken(userId, tokenId) {
    StateManager.setState(userId, STATES.CREATE_POOL_AWAITING_TOKEN_AMOUNT, {
      tokenId,
      step: 'token_amount'
    });
  }
  
  static setTokenAmount(userId, tokenAmount) {
    StateManager.updateData(userId, { tokenAmount });
    StateManager.setState(userId, STATES.CREATE_POOL_AWAITING_SOL_AMOUNT, {
      ...StateManager.getData(userId),
      step: 'sol_amount'
    });
  }
  
  static setSolAmount(userId, solAmount) {
    StateManager.updateData(userId, { solAmount });
    StateManager.setState(userId, STATES.CREATE_POOL_AWAITING_CONFIRMATION, {
      ...StateManager.getData(userId),
      step: 'confirmation'
    });
  }
  
  static getData(userId) {
    return StateManager.getState(userId).data;
  }
  
  static cancel(userId) {
    StateManager.resetToIdle(userId);
  }
}

/**
 * Liquidity management flow helper
 */
class LiquidityFlow {
  static startAdd(userId) {
    StateManager.setState(userId, STATES.ADD_LIQUIDITY_AWAITING_POOL_SELECT, {
      action: 'add',
      step: 'pool_select'
    });
  }
  
  static startRemove(userId) {
    StateManager.setState(userId, STATES.REMOVE_LIQUIDITY_AWAITING_POOL_SELECT, {
      action: 'remove',
      step: 'pool_select'
    });
  }
  
  static setPool(userId, poolId) {
    const action = StateManager.getData(userId, 'action');
    
    if (action === 'add') {
      StateManager.setState(userId, STATES.ADD_LIQUIDITY_AWAITING_AMOUNTS, {
        ...StateManager.getData(userId),
        poolId,
        step: 'amounts'
      });
    } else {
      StateManager.setState(userId, STATES.REMOVE_LIQUIDITY_AWAITING_PERCENTAGE, {
        ...StateManager.getData(userId),
        poolId,
        step: 'percentage'
      });
    }
  }
  
  static getData(userId) {
    return StateManager.getState(userId).data;
  }
  
  static cancel(userId) {
    StateManager.resetToIdle(userId);
  }
}

/**
 * Withdrawal flow helper
 */
class WithdrawalFlow {
  static start(userId) {
    StateManager.setState(userId, STATES.WITHDRAW_AWAITING_TOKEN_SELECT, {
      step: 'token_select'
    });
  }
  
  static setToken(userId, tokenMint) {
    StateManager.setState(userId, STATES.WITHDRAW_AWAITING_AMOUNT, {
      ...StateManager.getData(userId),
      tokenMint,
      step: 'amount'
    });
  }
  
  static setAmount(userId, amount) {
    StateManager.updateData(userId, { amount });
    StateManager.setState(userId, STATES.WITHDRAW_AWAITING_ADDRESS, {
      ...StateManager.getData(userId),
      step: 'address'
    });
  }
  
  static setAddress(userId, address) {
    StateManager.updateData(userId, { address });
    StateManager.setState(userId, STATES.WITHDRAW_AWAITING_CONFIRMATION, {
      ...StateManager.getData(userId),
      step: 'confirmation'
    });
  }
  
  static getData(userId) {
    return StateManager.getState(userId).data;
  }
  
  static cancel(userId) {
    StateManager.resetToIdle(userId);
  }
}

module.exports = {
  STATES,
  StateManager,
  TokenCreationFlow,
  PoolCreationFlow,
  LiquidityFlow,
  WithdrawalFlow
};

