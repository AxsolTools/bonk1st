/**
 * Balance Validation Module
 * Validates wallet has sufficient balance before operations
 */

const { getConnection } = require('./solana_utils');
const { LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { getAccount } = require('@solana/spl-token');

/**
 * Check if wallet has sufficient SOL balance
 * @param {string} walletAddress - Wallet public key
 * @param {number} requiredLamports - Required amount in lamports
 * @param {number} bufferLamports - Additional buffer for fees (default 50000)
 * @returns {Promise<object>} { sufficient: boolean, balance: number, required: number }
 */
async function validateSolBalance(walletAddress, requiredLamports, bufferLamports = 50000) {
  try {
    const conn = getConnection();
    const balance = await conn.getBalance(walletAddress);
    
    const totalRequired = requiredLamports + bufferLamports;
    const sufficient = balance >= totalRequired;
    
    return {
      sufficient,
      balance,
      required: totalRequired,
      balanceSOL: balance / LAMPORTS_PER_SOL,
      requiredSOL: totalRequired / LAMPORTS_PER_SOL
    };
  } catch (error) {
    console.error('[BALANCE] Error checking SOL balance:', error);
    throw new Error(`Failed to check balance: ${error.message}`);
  }
}

/**
 * Check if wallet has sufficient token balance
 * @param {string} tokenAccount - Token account address
 * @param {number} requiredAmount - Required amount (raw with decimals)
 * @returns {Promise<object>} { sufficient: boolean, balance: number, required: number }
 */
async function validateTokenBalance(tokenAccount, requiredAmount) {
  try {
    const conn = getConnection();
    const accountInfo = await getAccount(conn, tokenAccount);
    
    const balance = Number(accountInfo.amount);
    const sufficient = balance >= requiredAmount;
    
    return {
      sufficient,
      balance,
      required: requiredAmount
    };
  } catch (error) {
    console.error('[BALANCE] Error checking token balance:', error);
    throw new Error(`Failed to check token balance: ${error.message}`);
  }
}

/**
 * Require sufficient SOL balance or throw
 * @param {string} walletAddress - Wallet public key
 * @param {number} requiredLamports - Required amount in lamports
 * @param {number} bufferLamports - Additional buffer for fees
 * @throws {Error} If insufficient balance
 */
async function requireSolBalance(walletAddress, requiredLamports, bufferLamports = 50000) {
  const validation = await validateSolBalance(walletAddress, requiredLamports, bufferLamports);
  
  if (!validation.sufficient) {
    throw new Error(
      `Insufficient SOL balance. ` +
      `Required: ${validation.requiredSOL.toFixed(4)} SOL, ` +
      `Available: ${validation.balanceSOL.toFixed(4)} SOL`
    );
  }
  
  return validation;
}

/**
 * Require sufficient token balance or throw
 * @param {string} tokenAccount - Token account address
 * @param {number} requiredAmount - Required amount (raw with decimals)
 * @throws {Error} If insufficient balance
 */
async function requireTokenBalance(tokenAccount, requiredAmount) {
  const validation = await validateTokenBalance(tokenAccount, requiredAmount);
  
  if (!validation.sufficient) {
    throw new Error(
      `Insufficient token balance. ` +
      `Required: ${requiredAmount}, ` +
      `Available: ${validation.balance}`
    );
  }
  
  return validation;
}

module.exports = {
  validateSolBalance,
  validateTokenBalance,
  requireSolBalance,
  requireTokenBalance
};

