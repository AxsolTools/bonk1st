/**
 * Error Recovery Module
 * Handles partial transaction failures and provides recovery mechanisms
 */

const { saveTransaction, updateTransactionStatus, getUserTransactions } = require('./db');
const { getConnection } = require('./solana_utils');
const { SystemProgram, Transaction, PublicKey } = require('@solana/web3.js');
const { sendAndConfirmTransactionWithRetry } = require('./solana_utils');
const { getActiveWalletKeypair } = require('./wallets');

/**
 * Track fee collection for recovery
 */
const feeCollectionTracker = new Map();

/**
 * Record fee collection before main operation
 * @param {number} userId - User ID
 * @param {string} feeSignature - Fee transaction signature
 * @param {string} operationType - Type of operation
 * @param {object} operationParams - Parameters for the operation
 */
function recordFeeCollection(userId, feeSignature, operationType, operationParams) {
  const key = `${userId}:${Date.now()}`;
  
  feeCollectionTracker.set(key, {
    userId,
    feeSignature,
    operationType,
    operationParams,
    timestamp: Date.now(),
    recovered: false
  });
  
  // Clean up old entries (older than 24 hours)
  const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
  for (const [k, v] of feeCollectionTracker.entries()) {
    if (v.timestamp < oneDayAgo) {
      feeCollectionTracker.delete(k);
    }
  }
  
  return key;
}

/**
 * Mark operation as recovered
 * @param {string} trackingKey - Tracking key from recordFeeCollection
 */
function markAsRecovered(trackingKey) {
  const entry = feeCollectionTracker.get(trackingKey);
  if (entry) {
    entry.recovered = true;
  }
}

/**
 * Get unrecovered fee collections for user
 * @param {number} userId - User ID
 * @returns {Array} Unrecovered fee collections
 */
function getUnrecoveredFees(userId) {
  const unrecovered = [];
  
  for (const [key, value] of feeCollectionTracker.entries()) {
    if (value.userId === userId && !value.recovered) {
      unrecovered.push({
        key,
        ...value
      });
    }
  }
  
  return unrecovered;
}

/**
 * Issue refund for failed operation
 * @param {object} params - Refund parameters
 * @returns {Promise<string>} Refund transaction signature
 */
async function issueRefund(params) {
  const {
    userId,
    amount,
    reason
  } = params;
  
  try {
    console.log(`💸 Issuing refund: ${amount} lamports for ${reason}`);
    
    const conn = getConnection();
    const payer = getActiveWalletKeypair(userId);
    const developerWallet = new PublicKey(process.env.DEVELOPER_FEE_RECIPIENT_ADDRESS);
    
    // Create refund transaction (from developer wallet to user)
    // Note: This requires the developer wallet's private key
    // In practice, refunds should be manual or use a separate admin process
    
    console.log('⚠️  Automatic refunds require developer wallet access');
    console.log('   Please process manual refund for this case');
    
    throw new Error(
      'Automatic refunds not implemented. ' +
      'Please contact admin for manual refund processing.'
    );
  } catch (error) {
    console.error('Error issuing refund:', error);
    throw error;
  }
}

/**
 * Handle operation failure with fee already collected
 * @param {object} params - Failure parameters
 * @returns {Promise<object>} Recovery result
 */
async function handleOperationFailureWithFee(params) {
  const {
    userId,
    trackingKey,
    error,
    shouldRefund = false
  } = params;
  
  try {
    const feeRecord = feeCollectionTracker.get(trackingKey);
    
    if (!feeRecord) {
      throw new Error('Fee collection record not found');
    }
    
    // Log the failure
    console.error('🔴 Operation failed after fee collection:');
    console.error(`   User: ${userId}`);
    console.error(`   Operation: ${feeRecord.operationType}`);
    console.error(`   Fee TX: ${feeRecord.feeSignature}`);
    console.error(`   Error: ${error.message}`);
    
    // Create detailed error record
    const errorDetails = {
      feeSignature: feeRecord.feeSignature,
      operationType: feeRecord.operationType,
      operationParams: feeRecord.operationParams,
      errorMessage: error.message,
      timestamp: new Date().toISOString()
    };
    
    // Save to database for admin review
    saveTransaction(userId, `FAILED_${Date.now()}`, `failed_${feeRecord.operationType}`);
    
    // Determine recovery action
    let recoveryMessage = '';
    
    if (shouldRefund) {
      recoveryMessage = `
⚠️ *Operation Failed After Fee Collection*

The operation failed, but the developer fee was already collected.

Fee Transaction: \`${feeRecord.feeSignature}\`
Operation: ${feeRecord.operationType}
Error: ${error.message}

A refund request has been created. Please contact support with this information.
      `;
    } else {
      recoveryMessage = `
⚠️ *Operation Failed*

The operation failed. Fee Transaction: \`${feeRecord.feeSignature}\`
Error: ${error.message}

You can retry the operation. If the problem persists, contact support.
      `;
    }
    
    return {
      success: false,
      refundNeeded: shouldRefund,
      errorDetails,
      userMessage: recoveryMessage
    };
  } catch (error) {
    console.error('Error in failure handling:', error);
    throw error;
  }
}

/**
 * Retry failed operation
 * @param {string} trackingKey - Tracking key
 * @param {Function} operationFn - Operation function to retry
 * @returns {Promise<object>} Retry result
 */
async function retryFailedOperation(trackingKey, operationFn) {
  try {
    const feeRecord = feeCollectionTracker.get(trackingKey);
    
    if (!feeRecord) {
      throw new Error('Fee collection record not found');
    }
    
    if (feeRecord.recovered) {
      throw new Error('This operation has already been recovered');
    }
    
    console.log('🔄 Retrying failed operation...');
    
    // Retry the operation
    const result = await operationFn();
    
    // Mark as recovered
    markAsRecovered(trackingKey);
    
    return {
      success: true,
      result
    };
  } catch (error) {
    console.error('Error retrying operation:', error);
    throw error;
  }
}

module.exports = {
  recordFeeCollection,
  markAsRecovered,
  getUnrecoveredFees,
  issueRefund,
  handleOperationFailureWithFee,
  retryFailedOperation
};

