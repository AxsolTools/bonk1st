/**
 * AQUA Launchpad - Fee Collection System
 * 
 * Implements the 2% platform fee with:
 * - Pre-transaction balance validation
 * - Fee estimation and breakdown
 * - Referral split (50% to referrer if applicable)
 * - Fee collection ONLY on successful transactions
 * 
 * CRITICAL: Fees are collected AFTER the main transaction succeeds
 */

import { 
  Connection, 
  PublicKey, 
  Transaction, 
  SystemProgram,
  ComputeBudgetProgram,
  Keypair,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { 
  solToLamports, 
  lamportsToSol, 
  calculatePlatformFee,
  calculateReferralShare,
  estimateTotalCost,
  formatSol,
  BASE_TRANSACTION_FEE,
} from '@/lib/precision';

// ============================================================================
// TYPES
// ============================================================================

export interface FeeBreakdown {
  operation: bigint;
  platformFee: bigint;
  priorityFee: bigint;
  networkFee: bigint;
  safetyBuffer: bigint;
  total: bigint;
}

export interface BalanceValidation {
  sufficient: boolean;
  currentBalance: bigint;
  requiredTotal: bigint;
  breakdown: FeeBreakdown;
  shortfall?: bigint;
  error?: string;
}

export interface FeeCollectionResult {
  success: boolean;
  signature?: string;
  feeAmount?: bigint;
  referralShare?: bigint;
  error?: string;
}

export type OperationType = 
  | 'token_create' 
  | 'token_buy' 
  | 'token_sell' 
  | 'add_liquidity' 
  | 'remove_liquidity' 
  | 'claim_rewards'
  | 'jupiter_create'
  | 'pumpfun_create'
  | 'bonk_create';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Fixed platform fee for token creation (0.1 SOL)
 * This is charged on successful token creation for all platforms
 */
export const TOKEN_CREATION_FEE_SOL = 0.1;
export const TOKEN_CREATION_FEE_LAMPORTS = BigInt(Math.floor(TOKEN_CREATION_FEE_SOL * 1e9));

/**
 * Get the developer fee wallet from environment
 */
export function getDeveloperWallet(): PublicKey | null {
  const walletAddress = process.env.DEVELOPER_FEE_WALLET;
  if (!walletAddress) {
    console.warn('[FEES] DEVELOPER_FEE_WALLET not configured');
    return null;
  }
  
  try {
    return new PublicKey(walletAddress);
  } catch {
    console.error('[FEES] Invalid DEVELOPER_FEE_WALLET address');
    return null;
  }
}

/**
 * Check if fee collection is enabled
 */
export function isFeeCollectionEnabled(): boolean {
  return getDeveloperWallet() !== null;
}

// ============================================================================
// BALANCE VALIDATION
// ============================================================================

/**
 * Validate that wallet has sufficient balance for operation + all fees
 * 
 * This MUST be called before any transaction that involves user funds
 * 
 * @param connection - Solana RPC connection
 * @param walletAddress - User's wallet address
 * @param operationLamports - Amount needed for the operation
 * @param priorityFeeLamports - Priority fee (from Helius)
 * @returns Validation result with detailed breakdown
 */
export async function validateBalanceForTransaction(
  connection: Connection,
  walletAddress: string | PublicKey,
  operationLamports: bigint,
  priorityFeeLamports: bigint = 0n
): Promise<BalanceValidation> {
  try {
    const pubkey = typeof walletAddress === 'string' 
      ? new PublicKey(walletAddress) 
      : walletAddress;
    
    // Get current balance
    const balance = await connection.getBalance(pubkey);
    const balanceLamports = BigInt(balance);
    
    // Calculate total required with fee breakdown
    const breakdown = estimateTotalCost(operationLamports, priorityFeeLamports, true);
    
    // Check sufficiency
    const sufficient = balanceLamports >= breakdown.total;
    
    const result: BalanceValidation = {
      sufficient,
      currentBalance: balanceLamports,
      requiredTotal: breakdown.total,
      breakdown,
    };
    
    if (!sufficient) {
      result.shortfall = breakdown.total - balanceLamports;
      result.error = `Insufficient balance. You need ${formatSol(lamportsToSol(breakdown.total))} SOL but only have ${formatSol(lamportsToSol(balanceLamports))} SOL.`;
    }
    
    return result;
    
  } catch (error) {
    return {
      sufficient: false,
      currentBalance: 0n,
      requiredTotal: 0n,
      breakdown: {
        operation: operationLamports,
        platformFee: calculatePlatformFee(operationLamports),
        priorityFee: priorityFeeLamports,
        networkFee: BASE_TRANSACTION_FEE,
        safetyBuffer: 0n,
        total: 0n,
      },
      error: `Failed to check balance: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Re-validate balance immediately before transaction execution
 * Guards against race conditions where balance changed since initial check
 * 
 * @param connection - Solana RPC connection
 * @param walletAddress - User's wallet address
 * @param requiredLamports - Total required amount
 * @returns true if balance is still sufficient
 */
export async function revalidateBalance(
  connection: Connection,
  walletAddress: string | PublicKey,
  requiredLamports: bigint
): Promise<{ valid: boolean; currentBalance: bigint; error?: string }> {
  try {
    const pubkey = typeof walletAddress === 'string' 
      ? new PublicKey(walletAddress) 
      : walletAddress;
    
    const balance = await connection.getBalance(pubkey);
    const balanceLamports = BigInt(balance);
    
    if (balanceLamports < requiredLamports) {
      return {
        valid: false,
        currentBalance: balanceLamports,
        error: 'Balance changed since estimation. Please try again.',
      };
    }
    
    return { valid: true, currentBalance: balanceLamports };
    
  } catch (error) {
    return {
      valid: false,
      currentBalance: 0n,
      error: `Balance check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

// ============================================================================
// FEE COLLECTION
// ============================================================================

/**
 * Collect platform fee from user after successful transaction
 * 
 * IMPORTANT: This should only be called AFTER the main transaction confirms
 * 
 * @param connection - Solana RPC connection
 * @param userKeypair - User's keypair for signing
 * @param transactionLamports - The transaction amount to calculate fee from (2% of this)
 * @param referrerWallet - Optional referrer wallet for split
 * @param priorityFee - Priority fee in microlamports per CU
 * @param fixedFeeLamports - Optional fixed fee to add (e.g., 0.1 SOL creation fee)
 * @returns Collection result
 */
export async function collectPlatformFee(
  connection: Connection,
  userKeypair: Keypair,
  transactionLamports: bigint,
  referrerWallet?: PublicKey,
  priorityFee: number = 5000,
  fixedFeeLamports: bigint = 0n
): Promise<FeeCollectionResult> {
  const developerWallet = getDeveloperWallet();
  
  if (!developerWallet) {
    console.log('[FEES] Fee collection disabled - no developer wallet configured');
    return { success: true, feeAmount: 0n };
  }
  
  // Calculate 2% transaction fee + any fixed fee
  const percentageFee = calculatePlatformFee(transactionLamports);
  const platformFee = percentageFee + fixedFeeLamports;
  
  if (platformFee <= 0n) {
    return { success: true, feeAmount: 0n };
  }
  
  console.log(`[FEES] Collecting: ${formatSol(lamportsToSol(percentageFee))} SOL (2%) + ${formatSol(lamportsToSol(fixedFeeLamports))} SOL (fixed) = ${formatSol(lamportsToSol(platformFee))} SOL total`);
  
  try {
    const transaction = new Transaction();
    
    // Add compute budget for priority fee
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFee })
    );
    
    let devShare = platformFee;
    let referralShare = 0n;
    
    // Split with referrer if applicable
    if (referrerWallet) {
      referralShare = calculateReferralShare(platformFee);
      devShare = platformFee - referralShare;
      
      // Transfer to referrer
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: userKeypair.publicKey,
          toPubkey: referrerWallet,
          lamports: referralShare,
        })
      );
    }
    
    // Transfer to developer
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: userKeypair.publicKey,
        toPubkey: developerWallet,
        lamports: devShare,
      })
    );
    
    // Send and confirm
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [userKeypair],
      {
        skipPreflight: false,
        maxRetries: 3,
      }
    );
    
    console.log(`[FEES] Collected ${formatSol(lamportsToSol(platformFee))} SOL fee (tx: ${signature.slice(0, 8)}...)`);
    
    return {
      success: true,
      signature,
      feeAmount: platformFee,
      referralShare: referralShare > 0n ? referralShare : undefined,
    };
    
  } catch (error) {
    console.error('[FEES] Fee collection failed:', error);
    return {
      success: false,
      feeAmount: platformFee,
      error: error instanceof Error ? error.message : 'Fee collection failed',
    };
  }
}

// ============================================================================
// TRANSACTION WRAPPER
// ============================================================================

/**
 * Execute a transaction with automatic fee collection
 * 
 * This is the main entry point for any operation that requires fees.
 * It handles:
 * 1. Pre-validation of balance
 * 2. Re-validation before execution
 * 3. Main transaction execution
 * 4. Fee collection (only on success)
 * 
 * @param params - Transaction parameters
 * @returns Operation result
 */
export async function executeWithFeeCollection<T>(params: {
  connection: Connection;
  userKeypair: Keypair;
  operationLamports: bigint;
  priorityFeeLamports: bigint;
  referrerWallet?: PublicKey;
  operationType: OperationType;
  execute: () => Promise<T>;
}): Promise<{
  success: boolean;
  result?: T;
  feeResult?: FeeCollectionResult;
  error?: string;
}> {
  const {
    connection,
    userKeypair,
    operationLamports,
    priorityFeeLamports,
    referrerWallet,
    execute,
  } = params;
  
  // Step 1: Validate balance
  const validation = await validateBalanceForTransaction(
    connection,
    userKeypair.publicKey,
    operationLamports,
    priorityFeeLamports
  );
  
  if (!validation.sufficient) {
    return {
      success: false,
      error: validation.error || 'Insufficient balance',
    };
  }
  
  // Step 2: Re-validate balance (race condition protection)
  const revalidation = await revalidateBalance(
    connection,
    userKeypair.publicKey,
    validation.requiredTotal
  );
  
  if (!revalidation.valid) {
    return {
      success: false,
      error: revalidation.error || 'Balance changed',
    };
  }
  
  // Step 3: Execute main operation
  let result: T;
  try {
    result = await execute();
  } catch (error) {
    // Main operation failed - DO NOT collect fee
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Operation failed',
    };
  }
  
  // Step 4: Collect fee (only after successful main operation)
  const feeResult = await collectPlatformFee(
    connection,
    userKeypair,
    operationLamports,
    referrerWallet,
    Number(priorityFeeLamports) / 1000 // Convert to microlamports per CU
  );
  
  return {
    success: true,
    result,
    feeResult,
  };
}

// ============================================================================
// ESTIMATION HELPERS
// ============================================================================

/**
 * Get estimated fees for display to user before transaction
 * 
 * @param operationLamports - Operation amount
 * @param priorityFeeLamports - Priority fee
 * @returns Human-readable fee breakdown
 */
export function getEstimatedFeesForDisplay(
  operationLamports: bigint,
  priorityFeeLamports: bigint = 0n
): {
  operation: string;
  platformFee: string;
  platformFeePercent: string;
  priorityFee: string;
  networkFee: string;
  total: string;
} {
  const breakdown = estimateTotalCost(operationLamports, priorityFeeLamports, false);
  
  return {
    operation: `${formatSol(lamportsToSol(breakdown.operation))} SOL`,
    platformFee: `${formatSol(lamportsToSol(breakdown.platformFee))} SOL`,
    platformFeePercent: '2%',
    priorityFee: `${formatSol(lamportsToSol(breakdown.priorityFee))} SOL`,
    networkFee: `${formatSol(lamportsToSol(breakdown.networkFee))} SOL`,
    total: `${formatSol(lamportsToSol(breakdown.total))} SOL`,
  };
}

