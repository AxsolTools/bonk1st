/**
 * Error Handling Module
 * Comprehensive error handling and user-friendly error messages
 */

/**
 * Custom error class for bot-specific errors
 */
class BotError extends Error {
  constructor(message, code = 'BOT_ERROR', userMessage = null) {
    super(message);
    this.name = 'BotError';
    this.code = code;
    this.userMessage = userMessage || message;
  }
}

/**
 * Parse Solana RPC error and return user-friendly message
 * @param {Error} error - Error object
 * @returns {string} User-friendly error message
 */
function parseSolanaError(error) {
  const errorMsg = error.message || error.toString();
  
  // Insufficient funds
  if (errorMsg.includes('insufficient funds') || errorMsg.includes('Attempt to debit an account but found no record of a prior credit')) {
    return '❌ Insufficient SOL balance. Please add more SOL to your wallet to cover the transaction fee.';
  }
  
  // Blockhash not found
  if (errorMsg.includes('Blockhash not found') || errorMsg.includes('BlockhashNotFound')) {
    return '❌ Transaction expired. Please try again.';
  }
  
  // Account not found
  if (errorMsg.includes('AccountNotFound') || errorMsg.includes('could not find account')) {
    return '❌ Account not found. The address may be invalid or the account does not exist.';
  }
  
  // Invalid account owner
  if (errorMsg.includes('InvalidAccountOwner')) {
    return '❌ Invalid account owner. This operation cannot be performed on this account.';
  }
  
  // Already in use
  if (errorMsg.includes('already in use') || errorMsg.includes('AlreadyInUse')) {
    return '❌ Account already exists. This operation has already been completed.';
  }
  
  // Slippage
  if (errorMsg.includes('slippage') || errorMsg.includes('Price impact too high')) {
    return '❌ Transaction failed due to slippage. The price moved too much. Please try again or increase your slippage tolerance.';
  }
  
  // Timeout
  if (errorMsg.includes('timeout') || errorMsg.includes('timed out')) {
    return '❌ Transaction timed out. The network may be congested. Please try again.';
  }
  
  // Simulation failed
  if (errorMsg.includes('Transaction simulation failed')) {
    return '❌ Transaction simulation failed. The transaction would fail if executed. Please check your inputs.';
  }
  
  // Mint authority
  if (errorMsg.includes('MintMismatch') || errorMsg.includes('mint')) {
    return '❌ Token mint error. Please verify the token address is correct.';
  }
  
  // Freeze authority
  if (errorMsg.includes('AccountFrozen')) {
    return '❌ This token account is frozen and cannot be used for transactions.';
  }
  
  // Owner mismatch
  if (errorMsg.includes('OwnerMismatch')) {
    return '❌ You do not have permission to perform this operation.';
  }
  
  // Custom program errors
  if (errorMsg.includes('custom program error')) {
    const match = errorMsg.match(/custom program error: 0x([0-9a-f]+)/i);
    if (match) {
      const errorCode = parseInt(match[1], 16);
      return `❌ Program error (code: ${errorCode}). The transaction failed. Please contact support if this persists.`;
    }
  }
  
  // Network errors
  if (errorMsg.includes('fetch failed') || errorMsg.includes('ECONNREFUSED') || errorMsg.includes('ETIMEDOUT')) {
    return '❌ Network error. Unable to connect to Solana RPC. Please try again in a moment.';
  }
  
  // Rate limiting
  if (errorMsg.includes('429') || errorMsg.includes('Too Many Requests')) {
    return '❌ Rate limit exceeded. Please wait a moment and try again.';
  }
  
  // Default error
  return `❌ Transaction failed: ${errorMsg.slice(0, 200)}${errorMsg.length > 200 ? '...' : ''}`;
}

/**
 * Parse wallet error and return user-friendly message
 * @param {Error} error - Error object
 * @returns {string} User-friendly error message
 */
function parseWalletError(error) {
  const errorMsg = error.message || error.toString();
  
  if (errorMsg.includes('Invalid mnemonic')) {
    return '❌ Invalid recovery phrase. Please check your words and try again.';
  }
  
  if (errorMsg.includes('Invalid private key')) {
    return '❌ Invalid private key format. Please check your input and try again.';
  }
  
  if (errorMsg.includes('Wallet not found')) {
    return '❌ Wallet not found. Please create or import a wallet first.';
  }
  
  if (errorMsg.includes('Maximum wallet limit')) {
    return `❌ ${errorMsg}`;
  }
  
  if (errorMsg.includes('already imported')) {
    return '❌ This wallet is already imported. Use /my_wallets to view your wallets.';
  }
  
  if (errorMsg.includes('Decryption failed')) {
    return '❌ Failed to decrypt wallet. The database may be corrupted. Please contact support.';
  }
  
  return `❌ Wallet error: ${errorMsg}`;
}

/**
 * Parse database error and return user-friendly message
 * @param {Error} error - Error object
 * @returns {string} User-friendly error message
 */
function parseDatabaseError(error) {
  const errorMsg = error.message || error.toString();
  
  if (errorMsg.includes('UNIQUE constraint failed')) {
    return '❌ This record already exists in the database.';
  }
  
  if (errorMsg.includes('FOREIGN KEY constraint failed')) {
    return '❌ Database constraint error. The related record does not exist.';
  }
  
  if (errorMsg.includes('NOT NULL constraint failed')) {
    return '❌ Missing required information. Please provide all required fields.';
  }
  
  return `❌ Database error: ${errorMsg}`;
}

/**
 * Parse token creation error and return user-friendly message
 * @param {Error} error - Error object
 * @returns {string} User-friendly error message
 */
function parseTokenError(error) {
  const errorMsg = error.message || error.toString();
  
  if (errorMsg.includes('Invalid token name') || errorMsg.includes('Invalid token symbol')) {
    return '❌ Invalid token name or symbol. Please use only letters, numbers, and spaces.';
  }
  
  if (errorMsg.includes('Token already exists')) {
    return '❌ A token with this address already exists.';
  }
  
  if (errorMsg.includes('Metadata upload failed')) {
    return '❌ Failed to upload token metadata to Arweave/IPFS. Please try again.';
  }
  
  if (errorMsg.includes('mint authority')) {
    return '❌ Mint authority error. The mint authority may already be disabled.';
  }
  
  return parseSolanaError(error);
}

/**
 * Parse pool/liquidity error and return user-friendly message
 * @param {Error} error - Error object
 * @returns {string} User-friendly error message
 */
function parsePoolError(error) {
  const errorMsg = error.message || error.toString();
  
  if (errorMsg.includes('Pool already exists')) {
    return '❌ A liquidity pool for this token pair already exists.';
  }
  
  if (errorMsg.includes('Insufficient liquidity')) {
    return '❌ Insufficient liquidity in the pool for this operation.';
  }
  
  if (errorMsg.includes('Invalid pool')) {
    return '❌ Invalid pool address. Please verify the pool exists.';
  }
  
  if (errorMsg.includes('Slippage')) {
    return '❌ Price slippage too high. Please increase your slippage tolerance or try with a smaller amount.';
  }
  
  if (errorMsg.includes('LP token')) {
    return '❌ LP token error. You may not have enough LP tokens for this operation.';
  }
  
  return parseSolanaError(error);
}

/**
 * Log error with context
 * @param {string} context - Error context (e.g., 'wallet_creation', 'token_mint')
 * @param {Error} error - Error object
 * @param {object} metadata - Additional metadata
 */
function logError(context, error, metadata = {}) {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] [${context}] ERROR:`, {
    message: error.message,
    stack: error.stack,
    code: error.code,
    metadata
  });
}

/**
 * Handle error and return appropriate message for user
 * @param {Error} error - Error object
 * @param {string} context - Error context
 * @returns {string} User-friendly error message
 */
function handleError(error, context = 'general') {
  // Log the error
  logError(context, error);
  
  // Return user-friendly message based on context
  switch (context) {
    case 'wallet':
      return parseWalletError(error);
    case 'token':
      return parseTokenError(error);
    case 'pool':
    case 'liquidity':
      return parsePoolError(error);
    case 'database':
      return parseDatabaseError(error);
    case 'solana':
    case 'transaction':
      return parseSolanaError(error);
    default:
      return parseSolanaError(error);
  }
}

/**
 * Validate transaction parameters before execution
 * @param {object} params - Transaction parameters
 * @returns {object} { valid: boolean, error: string|null }
 */
function validateTransactionParams(params) {
  const { amount, address, balance } = params;
  
  // Check if amount is valid
  if (amount !== undefined) {
    if (isNaN(amount) || amount <= 0) {
      return { valid: false, error: '❌ Invalid amount. Please enter a positive number.' };
    }
  }
  
  // Check if address is valid
  if (address !== undefined) {
    if (!address || address.length < 32) {
      return { valid: false, error: '❌ Invalid address format.' };
    }
  }
  
  // Check if user has sufficient balance
  if (balance !== undefined && amount !== undefined) {
    if (amount > balance) {
      return { valid: false, error: '❌ Insufficient balance for this transaction.' };
    }
  }
  
  return { valid: true, error: null };
}

/**
 * Wrap async function with error handling
 * @param {Function} fn - Async function to wrap
 * @param {string} context - Error context
 * @returns {Function} Wrapped function
 */
function withErrorHandling(fn, context) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      const userMessage = handleError(error, context);
      throw new BotError(error.message, error.code || 'UNKNOWN_ERROR', userMessage);
    }
  };
}

module.exports = {
  BotError,
  parseSolanaError,
  parseWalletError,
  parseDatabaseError,
  parseTokenError,
  parsePoolError,
  logError,
  handleError,
  validateTransactionParams,
  withErrorHandling
};

