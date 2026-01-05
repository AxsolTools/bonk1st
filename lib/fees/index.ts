/**
 * AQUA Launchpad - Fees Module
 * 
 * Exports all fee-related functionality
 */

export {
  // Types
  type FeeBreakdown,
  type BalanceValidation,
  type FeeCollectionResult,
  type OperationType,
  
  // Configuration
  getDeveloperWallet,
  isFeeCollectionEnabled,
  TOKEN_CREATION_FEE_SOL,
  TOKEN_CREATION_FEE_LAMPORTS,
  
  // Validation
  validateBalanceForTransaction,
  revalidateBalance,
  
  // Collection
  collectPlatformFee,
  executeWithFeeCollection,
  
  // Display helpers
  getEstimatedFeesForDisplay,
} from './collector';

