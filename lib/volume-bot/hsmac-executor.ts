/**
 * Volume Bot Executor
 * 
 * 🎬 THE EXECUTOR - Actually makes the trades happen
 * 
 * This module is responsible for:
 *  - Executing buy/sell transactions using existing wallet management
 *  - Platform detection (Pump.fun vs Raydium/Jupiter)
 *  - Dust prevention (no worthless leftovers)
 *  - Transaction tracking and reporting
 *  - 2% Platform fee collection on all transactions
 * 
 * 💡 SECURITY GUARANTEES:
 *  - Only executes trades for wallets owned by the specified user
 *  - Wallet ownership is verified via session_id + user_id
 *  - All wallet keys are decrypted only when needed
 *  - No cross-user or cross-token contamination
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import type { ExecutionPlanResult, TransactionEntry } from './hsmac-wae';
import type { VolumeBotExecution, TxStatus } from './types';
import { calculatePlatformFee, solToLamports, lamportsToSol } from '@/lib/precision';
import { collectPlatformFee } from '@/lib/fees';
import { getAdminClient } from '@/lib/supabase/admin';
import { decryptPrivateKey } from '@/lib/crypto/key-manager';
import { getOrCreateServiceSalt } from '@/lib/crypto/vault';

// ============================================================================
// CONSTANTS
// ============================================================================

// Default slippage: 1% (100 basis points)
const DEFAULT_SLIPPAGE_BPS = 100;

// Pump.fun specific settings
const PUMP_PRIORITY_FEE = 0.003; // SOL
const PUMP_SLIPPAGE = 30; // %

// Dust threshold: Don't leave tokens worth less than this
// 🧹 Prevents leaving worthless dust behind
const DUST_THRESHOLD_SOL = 0.0001; // ~$0.02 at $200/SOL

// Platform fee: 2% on all transactions
const PLATFORM_FEE_PERCENT = 2;

// Helius RPC URL
const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com';

// PumpPortal trade endpoint
const PUMPPORTAL_TRADE_URL = 'https://pumpportal.fun/api/trade-local';

// ============================================================================
// TYPES
// ============================================================================

export interface ExecutionOptions {
  userId: string;
  sessionId: string; // REQUIRED: User's session for wallet decryption
  tokenMint: string;
  slippageBps?: number;
  currentPrice?: number | null;
  tokenDecimals?: number;
  platform?: 'pumpfun' | 'jupiter' | 'raydium';
  referredBy?: string | null; // For referral fee splitting
}

// Cached wallet keypairs for this execution session
// Key: walletId, Value: { keypair, publicKey, verified }
interface CachedWallet {
  keypair: Keypair;
  publicKey: string;
  walletId: string;
  userId: string;
  verified: boolean; // Has ownership been verified?
}

/**
 * Load and decrypt a wallet keypair with ownership verification
 * 
 * 🔐 SECURITY: Only loads wallets that belong to the specified user+session
 */
// Wallet record type for database query
interface WalletDbRecord {
  id: string;
  public_key: string;
  encrypted_private_key: string;
  user_id: string | null;
  session_id: string;
}

async function loadWalletKeypair(
  walletId: string,
  userId: string,
  sessionId: string
): Promise<CachedWallet | null> {
  try {
    const adminClient = getAdminClient();
    
    // CRITICAL: Verify wallet belongs to this user AND session
    const { data, error } = await adminClient
      .from('wallets')
      .select('id, public_key, encrypted_private_key, user_id, session_id')
      .eq('id', walletId)
      .single();

    if (error || !data) {
      console.error(`[VOLUME_BOT] Wallet ${walletId} not found`);
      return null;
    }

    // Type assertion for wallet data
    const wallet = data as unknown as WalletDbRecord;

    // 🔒 OWNERSHIP VERIFICATION
    // The wallet must belong to the user's session
    if (wallet.session_id !== sessionId) {
      console.error(`[VOLUME_BOT] ❌ SECURITY: Wallet ${walletId} does not belong to session ${sessionId.slice(0, 8)}...`);
      return null;
    }

    // Optional: Also verify user_id if set
    if (wallet.user_id && wallet.user_id !== userId) {
      console.error(`[VOLUME_BOT] ❌ SECURITY: Wallet ${walletId} does not belong to user ${userId.slice(0, 8)}...`);
      return null;
    }

    // Decrypt the private key
    const serviceSalt = await getOrCreateServiceSalt(adminClient);
    const privateKeyBase58 = decryptPrivateKey(wallet.encrypted_private_key, sessionId, serviceSalt);
    const keypair = Keypair.fromSecretKey(bs58.decode(privateKeyBase58));

    // Verify the public key matches
    if (keypair.publicKey.toBase58() !== wallet.public_key) {
      console.error(`[VOLUME_BOT] ❌ SECURITY: Decrypted key mismatch for wallet ${walletId}`);
      return null;
    }

    console.log(`[VOLUME_BOT] ✅ Loaded wallet ${wallet.public_key.slice(0, 8)}... for user ${userId.slice(0, 8)}...`);

    return {
      keypair,
      publicKey: wallet.public_key,
      walletId: wallet.id,
      userId,
      verified: true
    };
  } catch (error) {
    console.error(`[VOLUME_BOT] Failed to load wallet ${walletId}:`, error);
    return null;
  }
}

/**
 * Get token account for a wallet
 */
async function getTokenAccountForWallet(
  connection: Connection,
  walletAddress: string,
  tokenMint: string
): Promise<{
  mint: string;
  amount: string;
  uiAmount: number;
  decimals: number;
} | null> {
  try {
    const walletPubkey = new PublicKey(walletAddress);
    const mintPubkey = new PublicKey(tokenMint);
    
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(walletPubkey, {
      mint: mintPubkey
    });

    if (tokenAccounts.value.length === 0) {
      return null;
    }

    const account = tokenAccounts.value[0];
    const parsed = account.account.data.parsed.info;

    return {
      mint: parsed.mint,
      amount: parsed.tokenAmount.amount,
      uiAmount: parsed.tokenAmount.uiAmount,
      decimals: parsed.tokenAmount.decimals
    };
  } catch (error) {
    console.error(`[VOLUME_BOT] Failed to get token account:`, error);
    return null;
  }
}

export interface ExecutionRecord {
  walletId: string;
  publicKey: string;
  role: string;
  intent: 'buy' | 'sell';
  volume: number;
  concurrency: boolean;
  success?: boolean;
  skipped?: boolean;
  reason?: string;
  signature?: string;
  soldTokens?: number;
  soldAll?: boolean;
  dustPrevention?: boolean;
  error?: string;
  // Platform fee tracking
  platformFeeSol?: number;
  platformFeeCollected?: boolean;
}

export interface ExecutionSummary {
  total: number;
  success: number;
  skipped: number;
  failed: number;
  sellsCompleted: number;
  buysCompleted: number;
  walletsWithNoTokens: number;
  totalSellIntents: number;
  allWalletsEmpty: boolean;
}

export interface StrategyExecutionResult {
  success?: boolean;
  error?: string;
  message?: string;
  summary?: ExecutionSummary;
  allocations?: unknown[];
  plan?: ExecutionPlanResult;
  executions?: ExecutionRecord[];
  violations?: Array<{ rule: string; message: string }>;
  timestamp: number;
}

// ============================================================================
// TRADE EXECUTION FUNCTIONS
// ============================================================================

/**
 * Execute buy on Pump.fun bonding curve via PumpPortal
 */
async function executePumpfunBuy(
  keypair: Keypair,
  tokenMint: string,
  solAmount: number,
  slippage: number,
  priorityFee: number,
  connection: Connection
): Promise<string> {
  console.log(`[VOLUME_BOT] 🛒 Pump.fun BUY: ${solAmount} SOL on ${tokenMint.slice(0, 8)}...`);
  
  // Build transaction via PumpPortal local trade API
  const response = await fetch(PUMPPORTAL_TRADE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      publicKey: keypair.publicKey.toBase58(),
      action: 'buy',
      mint: tokenMint,
      denominatedInSol: 'true',
      amount: solAmount,
      slippage,
      priorityFee,
      pool: 'pump'
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`PumpPortal API error: ${response.status} - ${errorText}`);
  }

  // Get the unsigned transaction
  const txBuffer = await response.arrayBuffer();
  const { VersionedTransaction } = await import('@solana/web3.js');
  const tx = VersionedTransaction.deserialize(new Uint8Array(txBuffer));
  
  // Sign with the wallet keypair
  tx.sign([keypair]);
  
  // Send the transaction
  const signature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
    preflightCommitment: 'confirmed'
  });

  // Confirm
  await connection.confirmTransaction(signature, 'confirmed');
  
  console.log(`[VOLUME_BOT] ✅ Pump.fun BUY confirmed: ${signature.slice(0, 8)}...`);
  return signature;
}

/**
 * Execute sell on Pump.fun bonding curve via PumpPortal
 */
async function executePumpfunSell(
  keypair: Keypair,
  tokenMint: string,
  tokenAmount: string,
  slippage: number,
  priorityFee: number,
  connection: Connection
): Promise<string> {
  console.log(`[VOLUME_BOT] 💰 Pump.fun SELL: ${tokenAmount} tokens of ${tokenMint.slice(0, 8)}...`);
  
  const response = await fetch(PUMPPORTAL_TRADE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      publicKey: keypair.publicKey.toBase58(),
      action: 'sell',
      mint: tokenMint,
      denominatedInSol: 'false',
      amount: tokenAmount,
      slippage,
      priorityFee,
      pool: 'pump'
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`PumpPortal API error: ${response.status} - ${errorText}`);
  }

  const txBuffer = await response.arrayBuffer();
  const { VersionedTransaction } = await import('@solana/web3.js');
  const tx = VersionedTransaction.deserialize(new Uint8Array(txBuffer));
  tx.sign([keypair]);
  
  const signature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
    preflightCommitment: 'confirmed'
  });

  await connection.confirmTransaction(signature, 'confirmed');
  
  console.log(`[VOLUME_BOT] ✅ Pump.fun SELL confirmed: ${signature.slice(0, 8)}...`);
  return signature;
}

/**
 * Execute buy via Jupiter aggregator
 */
async function executeJupiterBuy(
  keypair: Keypair,
  tokenMint: string,
  solAmount: number,
  slippageBps: number,
  connection: Connection
): Promise<string> {
  console.log(`[VOLUME_BOT] 🛒 Jupiter BUY: ${solAmount} SOL on ${tokenMint.slice(0, 8)}...`);
  
  const lamports = Math.floor(solAmount * 1e9);
  const SOL_MINT = 'So11111111111111111111111111111111111111112';

  // Get quote from Jupiter
  const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${SOL_MINT}&outputMint=${tokenMint}&amount=${lamports}&slippageBps=${slippageBps}`;
  const quoteResponse = await fetch(quoteUrl);
  
  if (!quoteResponse.ok) {
    throw new Error(`Jupiter quote failed: ${quoteResponse.status}`);
  }
  
  const quoteData = await quoteResponse.json();

  // Get swap transaction
  const swapResponse = await fetch('https://quote-api.jup.ag/v6/swap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: quoteData,
      userPublicKey: keypair.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 100000 // 0.0001 SOL
    })
  });

  if (!swapResponse.ok) {
    throw new Error(`Jupiter swap failed: ${swapResponse.status}`);
  }

  const { swapTransaction } = await swapResponse.json();
  const { VersionedTransaction } = await import('@solana/web3.js');
  const txBuffer = Buffer.from(swapTransaction, 'base64');
  const tx = VersionedTransaction.deserialize(txBuffer);
  tx.sign([keypair]);

  const signature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
    preflightCommitment: 'confirmed'
  });

  await connection.confirmTransaction(signature, 'confirmed');
  
  console.log(`[VOLUME_BOT] ✅ Jupiter BUY confirmed: ${signature.slice(0, 8)}...`);
  return signature;
}

/**
 * Execute sell via Jupiter aggregator
 */
async function executeJupiterSell(
  keypair: Keypair,
  tokenMint: string,
  tokenAmount: string,
  slippageBps: number,
  connection: Connection
): Promise<string> {
  console.log(`[VOLUME_BOT] 💰 Jupiter SELL: ${tokenAmount} tokens of ${tokenMint.slice(0, 8)}...`);
  
  const SOL_MINT = 'So11111111111111111111111111111111111111112';

  // Get quote from Jupiter
  const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${tokenMint}&outputMint=${SOL_MINT}&amount=${tokenAmount}&slippageBps=${slippageBps}`;
  const quoteResponse = await fetch(quoteUrl);
  
  if (!quoteResponse.ok) {
    throw new Error(`Jupiter quote failed: ${quoteResponse.status}`);
  }
  
  const quoteData = await quoteResponse.json();

  // Get swap transaction
  const swapResponse = await fetch('https://quote-api.jup.ag/v6/swap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: quoteData,
      userPublicKey: keypair.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 100000
    })
  });

  if (!swapResponse.ok) {
    throw new Error(`Jupiter swap failed: ${swapResponse.status}`);
  }

  const { swapTransaction } = await swapResponse.json();
  const { VersionedTransaction } = await import('@solana/web3.js');
  const txBuffer = Buffer.from(swapTransaction, 'base64');
  const tx = VersionedTransaction.deserialize(txBuffer);
  tx.sign([keypair]);

  const signature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
    preflightCommitment: 'confirmed'
  });

  await connection.confirmTransaction(signature, 'confirmed');
  
  console.log(`[VOLUME_BOT] ✅ Jupiter SELL confirmed: ${signature.slice(0, 8)}...`);
  return signature;
}

// ============================================================================
// EXECUTION FUNCTIONS
// ============================================================================

/**
 * Execute all transactions in a plan
 * 
 * 🎬 THE MAIN EVENT - Executes all trades in the plan
 * 
 * SECURITY GUARANTEES:
 * - Each wallet is verified to belong to the user+session before use
 * - No cross-user wallet access is possible
 * - All trades are for the specified token only
 * - 2% platform fee is collected on all transactions
 */
export async function executeTransactions(
  planResult: ExecutionPlanResult,
  options: ExecutionOptions
): Promise<ExecutionRecord[]> {
  const {
    userId,
    sessionId,
    tokenMint,
    slippageBps = DEFAULT_SLIPPAGE_BPS,
    currentPrice = null,
    platform = 'jupiter',
    referredBy = null
  } = options;

  // Validate required parameters
  if (!sessionId) {
    throw new Error('sessionId is required for secure wallet access');
  }
  if (!tokenMint) {
    throw new Error('tokenMint is required');
  }

  const executions: ExecutionRecord[] = [];
  const isPumpfunToken = platform === 'pumpfun';
  const normalizedPrice = Number(currentPrice);
  const hasPrice = Number.isFinite(normalizedPrice) && normalizedPrice > 0;
  
  // Initialize connection and admin client
  const connection = new Connection(HELIUS_RPC_URL, 'confirmed');
  const adminClient = getAdminClient();

  // Cache for loaded wallet keypairs (verified)
  const walletCache = new Map<string, CachedWallet | null>();

  // Cache for token accounts
  const tokenAccountCache = new Map<string, {
    mint: string;
    amount: string;
    uiAmount: number;
    decimals: number;
  } | null>();

  // Securely load and cache wallet keypair
  const getWalletKeypair = async (walletId: string): Promise<CachedWallet | null> => {
    if (walletCache.has(walletId)) {
      return walletCache.get(walletId) || null;
    }

    const wallet = await loadWalletKeypair(walletId, userId, sessionId);
    walletCache.set(walletId, wallet);
    return wallet;
  };

  // Load token account for a wallet
  const loadTokenAccount = async (walletAddress: string) => {
    const cacheKey = `${walletAddress}:${tokenMint}`;
    if (tokenAccountCache.has(cacheKey)) {
      return tokenAccountCache.get(cacheKey);
    }

    const account = await getTokenAccountForWallet(connection, walletAddress, tokenMint);
    tokenAccountCache.set(cacheKey, account);
    return account;
  };

  console.log(`[VOLUME_BOT] Starting execution for ${planResult.transactions?.length || 0} transactions`);
  console.log(`[VOLUME_BOT] User: ${userId.slice(0, 8)}..., Token: ${tokenMint.slice(0, 8)}..., Platform: ${platform}`);

  // Process each transaction in the plan
  for (const entry of planResult.transactions || []) {
    const executionRecord: ExecutionRecord = {
      walletId: entry.walletId,
      publicKey: entry.publicKey,
      role: entry.role,
      intent: entry.intent,
      volume: entry.volume,
      concurrency: entry.concurrency
    };

    try {
      // 🔐 CRITICAL: Load and verify wallet ownership
      const wallet = await getWalletKeypair(entry.walletId);
      if (!wallet || !wallet.verified) {
        console.error(`[VOLUME_BOT] ❌ Wallet ${entry.walletId} not authorized for this user`);
        executionRecord.skipped = true;
        executionRecord.reason = 'wallet_not_authorized';
        executions.push(executionRecord);
        continue;
      }

      // Verify public key matches the plan entry
      if (wallet.publicKey !== entry.publicKey) {
        console.error(`[VOLUME_BOT] ❌ Wallet public key mismatch: expected ${entry.publicKey.slice(0, 8)}..., got ${wallet.publicKey.slice(0, 8)}...`);
        executionRecord.skipped = true;
        executionRecord.reason = 'wallet_pubkey_mismatch';
        executions.push(executionRecord);
        continue;
      }

      const volumeNumeric = Number(entry.volume);
      if (!Number.isFinite(volumeNumeric) || volumeNumeric <= 0) {
        executionRecord.skipped = true;
        executionRecord.reason = 'invalid_volume';
        executions.push(executionRecord);
        continue;
      }

      if (entry.intent === 'buy') {
        // Calculate 2% platform fee
        const platformFeeLamports = calculatePlatformFee(solToLamports(volumeNumeric));
        const platformFeeSol = lamportsToSol(platformFeeLamports);
        executionRecord.platformFeeSol = platformFeeSol;
        
        // Execute buy with the verified wallet keypair
        let signature: string;
        if (isPumpfunToken) {
          signature = await executePumpfunBuy(
            wallet.keypair,
            tokenMint,
            volumeNumeric,
            PUMP_SLIPPAGE,
            PUMP_PRIORITY_FEE,
            connection
          );
        } else {
          signature = await executeJupiterBuy(
            wallet.keypair,
            tokenMint,
            volumeNumeric,
            slippageBps,
            connection
          );
        }
        
        executionRecord.success = true;
        executionRecord.signature = signature;
        
        // Collect 2% platform fee after successful buy
        if (executionRecord.success && signature) {
          try {
            // Collect fee using the actual fee collector
            const feeResult = await collectPlatformFee(
              connection,
              wallet.keypair,
              solToLamports(volumeNumeric),
              referredBy ? new PublicKey(referredBy) : undefined
            );
            executionRecord.platformFeeCollected = feeResult.success;
            
            // Log fee to database
            if (feeResult.success) {
              await (adminClient.from('platform_fees') as unknown as { insert: (data: Record<string, unknown>) => Promise<unknown> }).insert({
                user_id: userId,
                transaction_signature: signature,
                operation_type: 'volume_bot_buy',
                transaction_amount_lamports: Number(solToLamports(volumeNumeric)),
                fee_amount_lamports: Number(platformFeeLamports),
                fee_amount_sol: platformFeeSol,
                status: 'collected',
                metadata: { tokenMint, walletId: entry.walletId, platform, sessionId: sessionId.slice(0, 8) }
              });
            }
          } catch (feeError) {
            console.error('[VOLUME_BOT] Platform fee collection failed:', feeError);
            executionRecord.platformFeeCollected = false;
          }
        }
      } else if (entry.intent === 'sell') {
        // Execute sell
        const tokenAccount = await loadTokenAccount(wallet.publicKey);
        
        if (!tokenAccount || !tokenAccount.uiAmount || tokenAccount.uiAmount <= 0) {
          executionRecord.skipped = true;
          executionRecord.reason = 'wallet_has_no_tokens';
        } else if (!hasPrice) {
          executionRecord.skipped = true;
          executionRecord.reason = 'price_unavailable';
        } else {
          const decimals = Number.isInteger(tokenAccount.decimals) ? tokenAccount.decimals : 9;
          const availableTokens = Number(tokenAccount.uiAmount);
          const desiredTokens = volumeNumeric / normalizedPrice;
          let sellTokens = Math.min(availableTokens, desiredTokens);
          const minUnit = 1 / Math.pow(10, decimals);
          
          if (sellTokens < minUnit) {
            sellTokens = Math.min(availableTokens, minUnit);
          }

          // 🧹 DUST PREVENTION
          const remainingTokens = availableTokens - sellTokens;
          const remainingValueSOL = remainingTokens * normalizedPrice;
          if (remainingValueSOL < DUST_THRESHOLD_SOL && remainingTokens > 0) {
            console.log(`[VOLUME_BOT] 🧹 Dust prevention: selling ALL to avoid ${remainingValueSOL.toFixed(6)} SOL dust`);
            sellTokens = availableTokens;
            executionRecord.dustPrevention = true;
          }

          if (sellTokens <= 0) {
            executionRecord.skipped = true;
            executionRecord.reason = 'insufficient_tokens';
          } else {
            // Calculate SOL value for fee
            const estimatedSolValue = sellTokens * normalizedPrice;
            const platformFeeLamports = calculatePlatformFee(solToLamports(estimatedSolValue));
            const platformFeeSol = lamportsToSol(platformFeeLamports);
            executionRecord.platformFeeSol = platformFeeSol;

            let signature: string;
            if (isPumpfunToken) {
              const precision = Math.min(decimals, 9);
              const amountString = sellTokens.toFixed(precision);
              signature = await executePumpfunSell(
                wallet.keypair,
                tokenMint,
                amountString,
                PUMP_SLIPPAGE,
                PUMP_PRIORITY_FEE,
                connection
              );
            } else {
              const rawAvailable = BigInt(tokenAccount.amount || '0');
              const sellAll = sellTokens >= availableTokens;
              const desiredRaw = sellAll
                ? rawAvailable
                : BigInt(Math.max(1, Math.floor(sellTokens * Math.pow(10, decimals))));
              const rawToSell = desiredRaw > rawAvailable ? rawAvailable : desiredRaw;

              if (rawToSell <= BigInt(0)) {
                executionRecord.skipped = true;
                executionRecord.reason = 'unable_to_compute_raw_amount';
                executions.push(executionRecord);
                continue;
              }

              signature = await executeJupiterSell(
                wallet.keypair,
                tokenMint,
                rawToSell.toString(),
                slippageBps,
                connection
              );
            }
            
            executionRecord.success = true;
            executionRecord.signature = signature;
            executionRecord.soldTokens = sellTokens;
            executionRecord.soldAll = sellTokens >= availableTokens;

            // Collect 2% platform fee after successful sell
            if (signature) {
              try {
                const feeResult = await collectPlatformFee(
                  connection,
                  wallet.keypair,
                  solToLamports(estimatedSolValue),
                  referredBy ? new PublicKey(referredBy) : undefined
                );
                executionRecord.platformFeeCollected = feeResult.success;
                
                if (feeResult.success) {
                  await (adminClient.from('platform_fees') as unknown as { insert: (data: Record<string, unknown>) => Promise<unknown> }).insert({
                    user_id: userId,
                    transaction_signature: signature,
                    operation_type: 'volume_bot_sell',
                    transaction_amount_lamports: Number(solToLamports(estimatedSolValue)),
                    fee_amount_lamports: Number(platformFeeLamports),
                    fee_amount_sol: platformFeeSol,
                    status: 'collected',
                    metadata: { tokenMint, walletId: entry.walletId, platform, sessionId: sessionId.slice(0, 8) }
                  });
                }
              } catch (feeError) {
                console.error('[VOLUME_BOT] Platform fee collection failed:', feeError);
                executionRecord.platformFeeCollected = false;
              }
            }
          }
        }
      } else {
        executionRecord.skipped = true;
        executionRecord.reason = 'unsupported_intent';
      }
    } catch (error) {
      executionRecord.success = false;
      executionRecord.error = error instanceof Error ? error.message : 'Execution failed';
      console.error(`[VOLUME_BOT] Execution error for wallet ${entry.publicKey.slice(0, 8)}...:`, error);
    }

    executions.push(executionRecord);
  }

  // Log summary
  const successful = executions.filter(e => e.success).length;
  const failed = executions.filter(e => !e.success && !e.skipped).length;
  const skipped = executions.filter(e => e.skipped).length;
  console.log(`[VOLUME_BOT] Execution complete: ${successful} success, ${failed} failed, ${skipped} skipped`);

  return executions;
}

/**
 * Summarize execution results
 * 
 * 📊 Get a quick overview of how the trades went
 */
export function summarizeExecutions(executions: ExecutionRecord[]): ExecutionSummary {
  if (!Array.isArray(executions) || executions.length === 0) {
    return {
      total: 0,
      success: 0,
      skipped: 0,
      failed: 0,
      sellsCompleted: 0,
      buysCompleted: 0,
      walletsWithNoTokens: 0,
      totalSellIntents: 0,
      allWalletsEmpty: false
    };
  }

  let success = 0;
  let skipped = 0;
  let failed = 0;
  let sellsCompleted = 0;
  let buysCompleted = 0;
  let walletsWithNoTokens = 0;
  let totalSellIntents = 0;

  executions.forEach((execution) => {
    if (execution.skipped) {
      skipped += 1;
      if (execution.reason === 'wallet_has_no_tokens' && execution.intent === 'sell') {
        walletsWithNoTokens += 1;
      }
    } else if (execution.success) {
      success += 1;
      if (execution.intent === 'sell') {
        sellsCompleted += 1;
      } else if (execution.intent === 'buy') {
        buysCompleted += 1;
      }
    } else {
      failed += 1;
    }

    if (execution.intent === 'sell') {
      totalSellIntents += 1;
    }
  });

  // All wallets empty = position fully exited
  const allWalletsEmpty = totalSellIntents > 0 && walletsWithNoTokens === totalSellIntents;

  if (allWalletsEmpty) {
    console.log('[HSMAC] ✅ EXIT COMPLETE: All wallets have 0 tokens');
  }

  return {
    total: executions.length,
    success,
    skipped,
    failed,
    sellsCompleted,
    buysCompleted,
    walletsWithNoTokens,
    totalSellIntents,
    allWalletsEmpty
  };
}

/**
 * Convert execution records to VolumeBotExecution format
 */
export function toVolumeBotExecutions(
  executions: ExecutionRecord[],
  sessionId: string,
  userId: string
): VolumeBotExecution[] {
  return executions.map((exec) => ({
    id: `exec_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    sessionId,
    userId,
    tradeType: exec.intent,
    walletId: exec.walletId,
    walletAddress: exec.publicKey,
    solAmount: exec.volume,
    tokenAmount: exec.soldTokens ?? null,
    pricePerToken: null,
    txSignature: exec.signature ?? null,
    txStatus: (exec.success ? 'confirmed' : exec.skipped ? 'timeout' : 'failed') as TxStatus,
    executionMethod: 'jupiter' as const,
    bundleId: null,
    bundleIndex: null,
    priorityFeeLamports: null,
    jitoTipLamports: null,
    plannedAt: new Date(),
    submittedAt: exec.signature ? new Date() : null,
    confirmedAt: exec.success ? new Date() : null,
    errorCode: exec.reason ?? null,
    errorMessage: exec.error ?? null,
    retryCount: 0,
    createdAt: new Date()
  }));
}

