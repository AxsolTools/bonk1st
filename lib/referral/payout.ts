/**
 * AQUA Launchpad - Referral Payout System
 * 
 * CRITICAL: This module handles SOL transfers for referral claim payouts.
 * Uses a dedicated payout wallet separate from the developer fee wallet.
 * 
 * Environment Variables Required:
 * - REFERRAL_PAYOUT_WALLET: Public key of the payout wallet
 * - REFERRAL_PAYOUT_PRIVATE_KEY: Base58-encoded private key (stored securely in Digital Ocean)
 * 
 * Security Features:
 * - Dedicated wallet isolation
 * - Amount validation and limits
 * - Transaction verification
 * - Comprehensive logging
 * - Automatic balance checks
 */

import { 
  Connection, 
  PublicKey, 
  Transaction, 
  SystemProgram,
  ComputeBudgetProgram,
  Keypair,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import bs58 from 'bs58';

// ============================================================================
// CONFIGURATION
// ============================================================================

const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com';

// Safety limits
const MAX_SINGLE_PAYOUT_SOL = 10; // Maximum single payout: 10 SOL
const MIN_PAYOUT_SOL = 0.001; // Minimum payout: 0.001 SOL
const MIN_WALLET_RESERVE_SOL = 0.01; // Keep at least 0.01 SOL in payout wallet for fees

// Priority fee for faster confirmation
const PRIORITY_FEE_MICROLAMPORTS = 10000;

// ============================================================================
// TYPES
// ============================================================================

export interface PayoutResult {
  success: boolean;
  txSignature?: string;
  amountSol?: number;
  destinationWallet?: string;
  error?: string;
  errorCode?: string;
}

export interface PayoutWalletStatus {
  configured: boolean;
  publicKey?: string;
  balanceSol?: number;
  canProcessPayouts: boolean;
  error?: string;
}

// ============================================================================
// PAYOUT WALLET MANAGEMENT
// ============================================================================

/**
 * Get the payout wallet public key from environment
 */
export function getPayoutWalletPublicKey(): PublicKey | null {
  const walletAddress = process.env.REFERRAL_PAYOUT_WALLET;
  
  if (!walletAddress) {
    console.warn('[REFERRAL_PAYOUT] REFERRAL_PAYOUT_WALLET not configured');
    return null;
  }
  
  try {
    return new PublicKey(walletAddress);
  } catch (error) {
    console.error('[REFERRAL_PAYOUT] Invalid REFERRAL_PAYOUT_WALLET address:', error);
    return null;
  }
}

/**
 * Get the payout wallet keypair from environment
 * CRITICAL: The private key must be stored securely in environment variables
 */
function getPayoutWalletKeypair(): Keypair | null {
  const privateKeyBase58 = process.env.REFERRAL_PAYOUT_PRIVATE_KEY;
  
  if (!privateKeyBase58) {
    console.error('[REFERRAL_PAYOUT] REFERRAL_PAYOUT_PRIVATE_KEY not configured');
    return null;
  }
  
  try {
    const privateKeyBytes = bs58.decode(privateKeyBase58);
    const keypair = Keypair.fromSecretKey(privateKeyBytes);
    
    // Verify the keypair matches the configured public key
    const expectedPubkey = getPayoutWalletPublicKey();
    if (expectedPubkey && !keypair.publicKey.equals(expectedPubkey)) {
      console.error('[REFERRAL_PAYOUT] Private key does not match REFERRAL_PAYOUT_WALLET public key!');
      return null;
    }
    
    return keypair;
  } catch (error) {
    console.error('[REFERRAL_PAYOUT] Failed to decode private key:', error);
    return null;
  }
}

/**
 * Check the status of the payout wallet
 */
export async function getPayoutWalletStatus(): Promise<PayoutWalletStatus> {
  const publicKey = getPayoutWalletPublicKey();
  
  if (!publicKey) {
    return {
      configured: false,
      canProcessPayouts: false,
      error: 'Payout wallet not configured',
    };
  }
  
  // Check if private key is available
  const keypair = getPayoutWalletKeypair();
  if (!keypair) {
    return {
      configured: true,
      publicKey: publicKey.toBase58(),
      canProcessPayouts: false,
      error: 'Payout wallet private key not configured or invalid',
    };
  }
  
  try {
    const connection = new Connection(HELIUS_RPC_URL, 'confirmed');
    const balance = await connection.getBalance(publicKey);
    const balanceSol = balance / LAMPORTS_PER_SOL;
    
    return {
      configured: true,
      publicKey: publicKey.toBase58(),
      balanceSol,
      canProcessPayouts: balanceSol > MIN_WALLET_RESERVE_SOL,
      error: balanceSol <= MIN_WALLET_RESERVE_SOL 
        ? `Insufficient payout wallet balance: ${balanceSol.toFixed(4)} SOL` 
        : undefined,
    };
  } catch (error) {
    return {
      configured: true,
      publicKey: publicKey.toBase58(),
      canProcessPayouts: false,
      error: `Failed to check balance: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

// ============================================================================
// PAYOUT EXECUTION
// ============================================================================

/**
 * Execute a referral payout
 * 
 * CRITICAL: This function transfers SOL from the payout wallet to the user.
 * All safety checks must pass before execution.
 * 
 * @param destinationWallet - User's wallet to receive the payout
 * @param amountSol - Amount to transfer in SOL
 * @param claimId - Unique claim identifier for logging
 * @returns Payout result with transaction signature or error
 */
export async function executeReferralPayout(
  destinationWallet: string,
  amountSol: number,
  claimId: string
): Promise<PayoutResult> {
  console.log(`[REFERRAL_PAYOUT] Starting payout: ${amountSol} SOL to ${destinationWallet.slice(0, 8)}... (claim: ${claimId})`);
  
  // ========== VALIDATION CHECKS ==========
  
  // 1. Validate amount is within safe limits
  if (amountSol < MIN_PAYOUT_SOL) {
    console.warn(`[REFERRAL_PAYOUT] Amount too small: ${amountSol} SOL`);
    return {
      success: false,
      error: `Payout amount too small. Minimum: ${MIN_PAYOUT_SOL} SOL`,
      errorCode: 'AMOUNT_TOO_SMALL',
    };
  }
  
  if (amountSol > MAX_SINGLE_PAYOUT_SOL) {
    console.error(`[REFERRAL_PAYOUT] SECURITY: Attempted payout exceeds limit: ${amountSol} SOL`);
    return {
      success: false,
      error: `Payout amount exceeds maximum single payout limit`,
      errorCode: 'AMOUNT_EXCEEDS_LIMIT',
    };
  }
  
  // 2. Validate destination wallet address
  let destinationPubkey: PublicKey;
  try {
    destinationPubkey = new PublicKey(destinationWallet);
  } catch (error) {
    console.error(`[REFERRAL_PAYOUT] Invalid destination wallet: ${destinationWallet}`);
    return {
      success: false,
      error: 'Invalid destination wallet address',
      errorCode: 'INVALID_DESTINATION',
    };
  }
  
  // 3. Get payout wallet keypair
  const payoutKeypair = getPayoutWalletKeypair();
  if (!payoutKeypair) {
    console.error('[REFERRAL_PAYOUT] Payout wallet not available');
    return {
      success: false,
      error: 'Payout system temporarily unavailable',
      errorCode: 'WALLET_NOT_CONFIGURED',
    };
  }
  
  // 4. Check payout wallet balance
  const connection = new Connection(HELIUS_RPC_URL, 'confirmed');
  
  let payoutWalletBalance: number;
  try {
    payoutWalletBalance = await connection.getBalance(payoutKeypair.publicKey);
  } catch (error) {
    console.error('[REFERRAL_PAYOUT] Failed to check payout wallet balance:', error);
    return {
      success: false,
      error: 'Failed to verify payout wallet balance',
      errorCode: 'BALANCE_CHECK_FAILED',
    };
  }
  
  const payoutWalletBalanceSol = payoutWalletBalance / LAMPORTS_PER_SOL;
  const requiredBalance = amountSol + MIN_WALLET_RESERVE_SOL;
  
  if (payoutWalletBalanceSol < requiredBalance) {
    console.error(`[REFERRAL_PAYOUT] CRITICAL: Insufficient payout wallet balance. Has: ${payoutWalletBalanceSol} SOL, Needs: ${requiredBalance} SOL`);
    return {
      success: false,
      error: 'Payout system temporarily unavailable. Please try again later.',
      errorCode: 'INSUFFICIENT_PAYOUT_BALANCE',
    };
  }
  
  // ========== EXECUTE TRANSFER ==========
  
  const lamportsToSend = Math.floor(amountSol * LAMPORTS_PER_SOL);
  
  try {
    // Build transaction with priority fee for faster confirmation
    const transaction = new Transaction();
    
    // Add compute budget for priority
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_FEE_MICROLAMPORTS })
    );
    
    // Add SOL transfer instruction
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: payoutKeypair.publicKey,
        toPubkey: destinationPubkey,
        lamports: lamportsToSend,
      })
    );
    
    // Send and confirm transaction
    const txSignature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [payoutKeypair],
      {
        skipPreflight: false,
        maxRetries: 3,
        commitment: 'confirmed',
      }
    );
    
    console.log(`[REFERRAL_PAYOUT] SUCCESS: ${amountSol} SOL to ${destinationWallet.slice(0, 8)}... | TX: ${txSignature}`);
    
    // ========== VERIFY TRANSFER ==========
    
    // Double-check the transaction was successful
    try {
      const txInfo = await connection.getTransaction(txSignature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });
      
      if (!txInfo || txInfo.meta?.err) {
        console.error(`[REFERRAL_PAYOUT] Transaction verification failed for ${txSignature}`);
        return {
          success: false,
          txSignature,
          error: 'Transaction verification failed',
          errorCode: 'VERIFICATION_FAILED',
        };
      }
    } catch (verifyError) {
      // Log but don't fail - the transaction was confirmed
      console.warn(`[REFERRAL_PAYOUT] Could not verify transaction ${txSignature}:`, verifyError);
    }
    
    return {
      success: true,
      txSignature,
      amountSol,
      destinationWallet,
    };
    
  } catch (error) {
    console.error(`[REFERRAL_PAYOUT] Transfer failed:`, error);
    
    // Parse error for better messaging
    let errorMessage = 'Transfer failed';
    let errorCode = 'TRANSFER_FAILED';
    
    if (error instanceof Error) {
      if (error.message.includes('insufficient')) {
        errorMessage = 'Insufficient balance for transfer';
        errorCode = 'INSUFFICIENT_BALANCE';
      } else if (error.message.includes('blockhash')) {
        errorMessage = 'Network congestion. Please try again.';
        errorCode = 'NETWORK_CONGESTION';
      } else if (error.message.includes('timeout')) {
        errorMessage = 'Transaction timed out. Please try again.';
        errorCode = 'TIMEOUT';
      } else {
        errorMessage = error.message;
      }
    }
    
    return {
      success: false,
      error: errorMessage,
      errorCode,
    };
  }
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * Health check for the payout system
 * Call this periodically to ensure the system is operational
 */
export async function healthCheck(): Promise<{
  healthy: boolean;
  status: PayoutWalletStatus;
  timestamp: string;
}> {
  const status = await getPayoutWalletStatus();
  
  return {
    healthy: status.canProcessPayouts,
    status,
    timestamp: new Date().toISOString(),
  };
}

