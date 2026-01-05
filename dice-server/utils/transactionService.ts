/**
 * Transaction Processing Service
 * 
 * Handles rapid token transfers for the dice game:
 * - Transfer from user to house (on loss)
 * - Transfer from house to user (on win)
 * - Retry logic for failed transactions
 * - Transaction confirmation tracking
 */

import { 
  Connection, 
  PublicKey, 
  Keypair, 
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  ComputeBudgetProgram,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';
import { 
  getAssociatedTokenAddress, 
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TokenAccountNotFoundError,
  getMint
} from '@solana/spl-token';
import { storage } from '../storage';
import { decryptPrivateKey } from '../fileStorage';
import { getHouseWallet } from './solanaWallet';
import { invalidateCache, invalidateTokenCache } from './balanceService';
import bs58 from 'bs58';

// Transaction configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const CONFIRMATION_TIMEOUT_MS = 30000;
const PRIORITY_FEE_MICROLAMPORTS = 50000; // Priority fee for faster confirmation

interface TransferResult {
  success: boolean;
  signature?: string;
  error?: string;
  attempts: number;
}

type ParsedTokenAccountInfo = {
  pubkey: PublicKey;
  rawAmount: bigint;
  decimals: number;
};

/**
 * Get RPC connection with confirmed commitment
 */
function getConnection(): Connection {
  const heliusApiKey = process.env.HELIUS_API_KEY;
  const rpcUrl = process.env.HELIUS_RPC_URL || 
    (heliusApiKey ? `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}` : null) ||
    process.env.SOLANA_RPC_URLS?.split(',')[0] ||
    'https://api.mainnet-beta.solana.com';
  
  return new Connection(rpcUrl, {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: CONFIRMATION_TIMEOUT_MS
  });
}

/**
 * Get configured token mint
 */
function getTokenMint(): PublicKey | null {
  const mint = process.env.LOCKED_TOKEN_MINT;
  if (!mint) return null;
  return new PublicKey(mint);
}

/**
 * Get token decimals
 */
function getTokenDecimals(): number {
  return parseInt(process.env.TOKEN_DECIMALS || '9', 10);
}

/**
 * Find the best source token account for a given owner+mint.
 * IMPORTANT: Do not assume the source is the ATA; wallets may hold funds in non-ATA accounts.
 */
async function findSourceTokenAccount(
  connection: Connection,
  owner: PublicKey,
  mint: PublicKey,
  requiredRawAmount: bigint,
  fallbackDecimals: number
): Promise<{ source: PublicKey; decimals: number } | null> {
  console.log(`[TX] Finding source token account for owner=${owner.toBase58()}, mint=${mint.toBase58()}, required=${requiredRawAmount.toString()}`);
  
  const resp = await connection.getParsedTokenAccountsByOwner(owner, { mint });
  console.log(`[TX] Found ${resp.value.length} token accounts for owner`);

  const candidates: ParsedTokenAccountInfo[] = [];
  for (const item of resp.value) {
    const parsed = (item.account.data as any)?.parsed;
    const tokenAmount = parsed?.info?.tokenAmount;
    if (!tokenAmount?.amount) continue;

    const rawAmount = BigInt(tokenAmount.amount);
    const decimals = typeof tokenAmount.decimals === 'number' ? tokenAmount.decimals : fallbackDecimals;

    console.log(`[TX] Token account ${item.pubkey.toBase58()}: raw=${rawAmount.toString()}, decimals=${decimals}`);
    
    candidates.push({
      pubkey: item.pubkey,
      rawAmount,
      decimals
    });
  }

  if (candidates.length === 0) {
    console.log(`[TX] No token accounts found for owner=${owner.toBase58()}, mint=${mint.toBase58()}`);
    return null;
  }

  // Prefer an account that can cover the amount. If multiple, choose the largest (reduces chance of dust/close issues).
  const sufficient = candidates
    .filter(c => c.rawAmount >= requiredRawAmount)
    .sort((a, b) => (a.rawAmount > b.rawAmount ? -1 : a.rawAmount < b.rawAmount ? 1 : 0));

  if (sufficient.length > 0) {
    console.log(`[TX] Selected source account: ${sufficient[0].pubkey.toBase58()} with balance ${sufficient[0].rawAmount.toString()}`);
    return { source: sufficient[0].pubkey, decimals: sufficient[0].decimals };
  }

  // No single account covers it (rare, but possible). We don't implement multi-account aggregation transfers here.
  console.log(`[TX] No account with sufficient balance. Required: ${requiredRawAmount.toString()}, max available: ${candidates[0]?.rawAmount.toString() || '0'}`);
  return null;
}

/**
 * Get user's keypair from Aqua's Supabase database
 * Falls back to local file storage if Supabase not available
 */
export async function getUserKeypair(walletAddress: string): Promise<Keypair | null> {
  try {
    // First, try to get from Aqua's Supabase (preferred)
    const { getAquaUserKeypair } = await import('./aquaWalletService');
    const aquaKeypair = await getAquaUserKeypair(walletAddress);
    if (aquaKeypair) {
      console.log(`[TX] Got keypair from Aqua Supabase for ${walletAddress}`);
      return aquaKeypair;
    }
    
    // Fallback to local file storage (for backwards compatibility)
    console.log(`[TX] Falling back to local storage for ${walletAddress}`);
    const storedWallet = await storage.getUserWallet(walletAddress);
    if (!storedWallet) {
      console.error(`[TX] No wallet found for ${walletAddress} in Aqua Supabase or local storage`);
      return null;
    }
    
    const privateKey = decryptPrivateKey(storedWallet.encryptedPrivateKey);
    
    // Try to decode as base58 first
    try {
      const decoded = bs58.decode(privateKey);
      return Keypair.fromSecretKey(decoded);
    } catch {
      // Try as JSON array
      try {
        const parsed = JSON.parse(privateKey);
        return Keypair.fromSecretKey(Uint8Array.from(parsed));
      } catch {
        console.error('[TX] Failed to decode stored private key');
        return null;
      }
    }
  } catch (error) {
    console.error(`[TX] Error getting user keypair for ${walletAddress}:`, error);
    return null;
  }
}

/**
 * Detect if a token uses Token-2022 or standard SPL Token program
 */
async function getTokenProgramId(connection: Connection, mint: PublicKey): Promise<PublicKey> {
  try {
    const mintInfo = await connection.getAccountInfo(mint);
    if (mintInfo && mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
      console.log(`[TX] Token ${mint.toBase58()} uses Token-2022 program`);
      return TOKEN_2022_PROGRAM_ID;
    }
  } catch (error) {
    console.log(`[TX] Error detecting token program, defaulting to SPL Token:`, error);
  }
  return TOKEN_PROGRAM_ID;
}

/**
 * Ensure token account exists, create if not
 * Properly handles both SPL Token and Token-2022 programs
 */
async function ensureTokenAccount(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  owner: PublicKey
): Promise<{ address: PublicKey; instruction?: TransactionInstruction }> {
  // Detect which token program this mint uses
  const tokenProgramId = await getTokenProgramId(connection, mint);
  
  console.log(`[TX] ensureTokenAccount: mint=${mint.toBase58()}, owner=${owner.toBase58()}, program=${tokenProgramId.toBase58()}`);
  
  // Get ATA with correct program - MUST pass both tokenProgramId and ASSOCIATED_TOKEN_PROGRAM_ID
  const tokenAccount = await getAssociatedTokenAddress(
    mint, 
    owner, 
    false, // allowOwnerOffCurve
    tokenProgramId,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  
  console.log(`[TX] Computed ATA: ${tokenAccount.toBase58()}`);
  
  try {
    await getAccount(connection, tokenAccount, 'confirmed', tokenProgramId);
    console.log(`[TX] Token account exists: ${tokenAccount.toBase58()}`);
    return { address: tokenAccount };
  } catch (error) {
    if (error instanceof TokenAccountNotFoundError) {
      // Token account doesn't exist, create instruction with correct program
      console.log(`[TX] Token account does not exist, creating: ${tokenAccount.toBase58()}`);
      const instruction = createAssociatedTokenAccountInstruction(
        payer.publicKey,
        tokenAccount,
        owner,
        mint,
        tokenProgramId,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      return { address: tokenAccount, instruction };
    }
    throw error;
  }
}

/**
 * Build transfer transaction with priority fee
 */
async function buildTransferTransaction(
  connection: Connection,
  fromKeypair: Keypair,
  toAddress: PublicKey,
  amount: number,
  tokenMint: PublicKey,
  decimals: number
): Promise<Transaction> {
  const transaction = new Transaction();
  
  // Add priority fee for faster confirmation
  transaction.add(
    ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: PRIORITY_FEE_MICROLAMPORTS
    })
  );
  
  // Ensure destination token account exists
  const { address: destTokenAccount, instruction: createAccountInstr } = 
    await ensureTokenAccount(connection, fromKeypair, tokenMint, toAddress);
  
  if (createAccountInstr) {
    transaction.add(createAccountInstr);
  }
  
  // Convert amount to raw units
  const rawAmount = BigInt(Math.floor(amount * Math.pow(10, decimals)));

  // Pick a valid source token account (not necessarily the ATA)
  const sourceInfo = await findSourceTokenAccount(
    connection,
    fromKeypair.publicKey,
    tokenMint,
    rawAmount,
    decimals
  );

  if (!sourceInfo) {
    throw new Error(
      `No token account with sufficient balance found for owner=${fromKeypair.publicKey.toBase58()} mint=${tokenMint.toBase58()}`
    );
  }

  const sourceTokenAccount = sourceInfo.source;
  
  // Detect token program for transfer instruction
  const tokenProgramId = await getTokenProgramId(connection, tokenMint);
  
  // Add transfer instruction with correct program
  transaction.add(
    createTransferInstruction(
      sourceTokenAccount,
      destTokenAccount,
      fromKeypair.publicKey,
      rawAmount,
      [], // multiSigners
      tokenProgramId
    )
  );
  
  return transaction;
}

/**
 * Check if wallet has enough SOL for transaction fees
 */
async function checkSolBalance(connection: Connection, wallet: PublicKey): Promise<{ hasSol: boolean; balance: number }> {
  try {
    const balance = await connection.getBalance(wallet);
    const solBalance = balance / LAMPORTS_PER_SOL;
    console.log(`[TX] SOL balance for ${wallet.toBase58()}: ${solBalance} SOL`);
    // Lowered threshold to 0.002 SOL (2,000,000 lamports) - enough for token transfer + priority fee
    return { hasSol: balance > 2000000, balance: solBalance };
  } catch (error) {
    console.error(`[TX] Error checking SOL balance:`, error);
    return { hasSol: false, balance: 0 };
  }
}

/**
 * Send and confirm transaction with retry logic
 */
async function sendWithRetry(
  connection: Connection,
  transaction: Transaction,
  signers: Keypair[],
  maxRetries: number = MAX_RETRIES
): Promise<TransferResult> {
  let lastError: Error | null = null;
  let attempts = 0;
  
  // Check if payer has enough SOL for fees
  const { hasSol, balance } = await checkSolBalance(connection, signers[0].publicKey);
  if (!hasSol) {
    const errorMsg = `Insufficient SOL for transaction fees. Wallet ${signers[0].publicKey.toBase58()} has ${balance} SOL, needs at least 0.002 SOL`;
    console.error(`[TX] ❌ ${errorMsg}`);
    return {
      success: false,
      error: errorMsg,
      attempts: 0
    };
  }
  
  for (let i = 0; i < maxRetries; i++) {
    attempts++;
    try {
      // Get recent blockhash - CRITICAL: Must get fresh blockhash for each attempt
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      
      // CRITICAL: Create a NEW transaction for each retry attempt
      // Solana transactions cannot be reused after signing - they become immutable
      const retryTransaction = new Transaction();
      retryTransaction.recentBlockhash = blockhash;
      retryTransaction.feePayer = signers[0].publicKey;
      
      // Copy all instructions from original transaction
      for (const instruction of transaction.instructions) {
        retryTransaction.add(instruction);
      }
      
      // Sign the new transaction
      retryTransaction.sign(...signers);
      
      // Send transaction
      const signature = await connection.sendRawTransaction(retryTransaction.serialize(), {
        skipPreflight: false,
        maxRetries: 3
      });
      
      console.log(`[TX] Transaction sent: ${signature}`);
      
      // CRITICAL: Wait for confirmation with explicit timeout
      try {
        const confirmation = await connection.confirmTransaction({
          signature,
          blockhash,
          lastValidBlockHeight
        }, 'confirmed');
        
        if (confirmation.value.err) {
          console.error(`[TX] Transaction ${signature} confirmed but has error:`, confirmation.value.err);
          lastError = new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
          continue; // Retry
        }
        
        console.log(`[TX] Transaction confirmed: ${signature}`);
      } catch (confirmError: any) {
        console.error(`[TX] Transaction ${signature} confirmation failed:`, confirmError.message);
        lastError = confirmError;
        continue; // Retry
      }
      
      // Final verification: transaction must exist on-chain AND have no errors
      const txDetails = await connection.getTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0
      });
      
      if (!txDetails || !txDetails.slot) {
        console.error(`[TX] Transaction ${signature} not found on-chain after confirmation!`);
        lastError = new Error(`Transaction not found on chain: ${signature}`);
        continue; // Retry
      }
      
      if (txDetails.meta && txDetails.meta.err) {
        console.error(`[TX] Transaction ${signature} has error in meta:`, txDetails.meta.err);
        lastError = new Error(`Transaction failed: ${JSON.stringify(txDetails.meta.err)}`);
        continue; // Retry
      }
      
      // CRITICAL: Verify the transaction actually executed the transfer
      // Check if pre/post token balances changed as expected
      // NOTE: Some transactions might not have token balance data in meta, but still executed successfully
      // We'll rely on the external balance verification instead
      if (txDetails.meta && txDetails.meta.preTokenBalances && txDetails.meta.postTokenBalances) {
        // Token balance data available - we can do additional verification if needed
        console.log(`[TX] Transaction ${signature} has token balance data for verification`);
      } else {
        // Missing token balance data, but transaction exists and has no errors
        // This is acceptable - we'll verify balance externally
        console.log(`[TX] Transaction ${signature} missing token balance data in meta, but transaction exists. Will verify balance externally.`);
      }
      
      console.log(`[TX] Transaction VERIFIED on-chain: ${signature}, slot: ${txDetails.slot}`);
      
      return {
        success: true,
        signature,
        attempts
      };
    } catch (error: any) {
      lastError = error;
      console.error(`Transaction attempt ${attempts} failed:`, error.message);
      
      // Log more details if available
      if (error.logs) {
        console.error(`Transaction logs:`, error.logs);
      }
      
      // Check if error is retryable
      const isRetryable = 
        error.message?.includes('blockhash') ||
        error.message?.includes('timeout') ||
        error.message?.includes('rate limit');
      
      if (!isRetryable || i === maxRetries - 1) {
        break;
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * (i + 1)));
    }
  }
  
  const errorMsg = lastError?.message || 'Transaction failed after retries';
  console.error(`[TX] ❌ Transaction failed after ${attempts} attempts: ${errorMsg}`);
  if (lastError) {
    console.error(`[TX] Last error details:`, lastError);
  }
  return {
    success: false,
    error: errorMsg,
    attempts
  };
}

/**
 * Get platform fee percentage from config
 */
function getPlatformFeePercent(): number {
  return parseFloat(process.env.PLATFORM_FEE_PERCENT || '2');
}

/**
 * Get platform fee wallet address
 */
function getFeeWalletAddress(): PublicKey | null {
  const feeWallet = process.env.FEE_WALLET_ADDRESS;
  if (!feeWallet) return null;
  try {
    return new PublicKey(feeWallet);
  } catch {
    console.error('[TX] Invalid FEE_WALLET_ADDRESS configured');
    return null;
  }
}

/**
 * Build transfer transaction with fee split (two transfers in one tx)
 * Sends platformFee% to fee wallet and remainder to main destination
 */
async function buildTransferWithFeeTransaction(
  connection: Connection,
  fromKeypair: Keypair,
  mainDestination: PublicKey,
  feeDestination: PublicKey,
  totalAmount: number,
  feePercent: number,
  tokenMint: PublicKey,
  decimals: number
): Promise<{ transaction: Transaction; feeAmount: number; mainAmount: number }> {
  const transaction = new Transaction();
  
  // Add priority fee for faster confirmation
  transaction.add(
    ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: PRIORITY_FEE_MICROLAMPORTS
    })
  );
  
  // Calculate fee split
  const feeAmount = totalAmount * (feePercent / 100);
  const mainAmount = totalAmount - feeAmount;
  
  console.log(`[TX] Fee split: total=${totalAmount}, fee=${feeAmount} (${feePercent}%), main=${mainAmount}`);
  
  // Convert amounts to raw units
  const rawFeeAmount = BigInt(Math.floor(feeAmount * Math.pow(10, decimals)));
  const rawMainAmount = BigInt(Math.floor(mainAmount * Math.pow(10, decimals)));
  
  // Get token program
  const tokenProgramId = await getTokenProgramId(connection, tokenMint);
  
  // Find source token account
  const totalRawAmount = rawFeeAmount + rawMainAmount;
  const sourceInfo = await findSourceTokenAccount(
    connection,
    fromKeypair.publicKey,
    tokenMint,
    totalRawAmount,
    decimals
  );
  
  if (!sourceInfo) {
    throw new Error(
      `No token account with sufficient balance found for owner=${fromKeypair.publicKey.toBase58()}`
    );
  }
  
  // Ensure fee destination token account exists
  const { address: feeTokenAccount, instruction: createFeeAccountInstr } = 
    await ensureTokenAccount(connection, fromKeypair, tokenMint, feeDestination);
  
  if (createFeeAccountInstr) {
    transaction.add(createFeeAccountInstr);
  }
  
  // Ensure main destination token account exists
  const { address: mainTokenAccount, instruction: createMainAccountInstr } = 
    await ensureTokenAccount(connection, fromKeypair, tokenMint, mainDestination);
  
  if (createMainAccountInstr) {
    transaction.add(createMainAccountInstr);
  }
  
  // Add transfer to fee wallet (if fee > 0)
  if (rawFeeAmount > 0n) {
    transaction.add(
      createTransferInstruction(
        sourceInfo.source,
        feeTokenAccount,
        fromKeypair.publicKey,
        rawFeeAmount,
        [],
        tokenProgramId
      )
    );
  }
  
  // Add transfer to main destination
  transaction.add(
    createTransferInstruction(
      sourceInfo.source,
      mainTokenAccount,
      fromKeypair.publicKey,
      rawMainAmount,
      [],
      tokenProgramId
    )
  );
  
  return { transaction, feeAmount, mainAmount };
}

/**
 * Transfer tokens from user to house wallet (when user loses bet)
 * Includes 2% platform fee split: fee% to fee wallet, rest to house
 */
export async function transferFromUser(
  userWalletAddress: string,
  amount: number,
  tokenMint?: string
): Promise<TransferResult> {
  console.log(`[TX] transferFromUser CALLED: user=${userWalletAddress}, amount=${amount}, mint=${tokenMint || 'default'}`);
  
  try {
    const connection = getConnection();
    const mint = tokenMint ? new PublicKey(tokenMint) : getTokenMint();
    const decimals = getTokenDecimals();
    const feePercent = getPlatformFeePercent();
    const feeWallet = getFeeWalletAddress();
    
    console.log(`[TX] transferFromUser: mint=${mint?.toBase58()}, decimals=${decimals}, feePercent=${feePercent}%`);
    
    if (!mint) {
      return { success: false, error: 'Token mint not configured', attempts: 0 };
    }
    
    // Get user's keypair
    const userKeypair = await getUserKeypair(userWalletAddress);
    if (!userKeypair) {
      return { success: false, error: 'User wallet not registered', attempts: 0 };
    }
    
    // Get house wallet address
    const houseKeypair = getHouseWallet();
    if (!houseKeypair) {
      return { success: false, error: 'House wallet not initialized', attempts: 0 };
    }
    
    // Get balance BEFORE transfer to verify it actually happened
    const { getTokenBalance } = await import('./balanceService');
    invalidateTokenCache(houseKeypair.publicKey.toBase58(), mint.toBase58());
    const houseBalanceBefore = await getTokenBalance(houseKeypair.publicKey.toBase58(), mint.toBase58());
    
    let transaction: Transaction;
    let feeAmount = 0;
    let houseAmount = amount;
    
    // Build transaction with fee split if fee wallet is configured
    if (feeWallet && feePercent > 0) {
      const result = await buildTransferWithFeeTransaction(
        connection,
        userKeypair,
        houseKeypair.publicKey,
        feeWallet,
        amount,
        feePercent,
        mint,
        decimals
      );
      transaction = result.transaction;
      feeAmount = result.feeAmount;
      houseAmount = result.mainAmount;
      console.log(`[TX] LOSE: User pays ${amount} → Fee wallet: ${feeAmount} (${feePercent}%), House: ${houseAmount}`);
    } else {
      // No fee wallet configured, send all to house
      transaction = await buildTransferTransaction(
        connection,
        userKeypair,
        houseKeypair.publicKey,
        amount,
        mint,
        decimals
      );
      console.log(`[TX] LOSE: User pays ${amount} → House (no fee wallet configured)`);
    }
    
    // Send with retry
    const result = await sendWithRetry(connection, transaction, [userKeypair]);
    
    // CRITICAL: If transaction failed to send, return immediately
    if (!result.success || !result.signature) {
      console.error(`[TX] ❌ Transaction failed to send: ${result.error}`);
      return {
        success: false,
        error: result.error || 'Transaction failed to send',
        attempts: result.attempts,
        signature: result.signature
      };
    }
    
    // CRITICAL: Verify balance actually changed (transaction was sent, now verify it executed)
    console.log(`[TX] Starting balance verification for transferFromUser: user pays house ${houseAmount}`);
    console.log(`[TX] House balance before: ${houseBalanceBefore.balance}`);
    console.log(`[TX] Transaction signature: ${result.signature}`);
    
    // Wait for balance to propagate
    let balanceVerified = false;
    for (let balanceCheck = 0; balanceCheck < 5; balanceCheck++) {
      if (balanceCheck > 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      invalidateTokenCache(houseKeypair.publicKey.toBase58(), mint.toBase58());
      const houseBalanceAfter = await getTokenBalance(houseKeypair.publicKey.toBase58(), mint.toBase58());
      const balanceIncrease = houseBalanceAfter.balance - houseBalanceBefore.balance;
      
      console.log(`[TX] Balance check ${balanceCheck + 1}/5: ${houseBalanceAfter.balance} (increase: +${balanceIncrease}, expected: +${houseAmount})`);
      
      const tolerance = 0.000001;
      if (balanceIncrease >= (houseAmount - tolerance)) {
        console.log(`[TX] ✅ Balance verified: +${balanceIncrease} (expected +${houseAmount})`);
        balanceVerified = true;
        break;
      }
    }
    
    if (!balanceVerified) {
      invalidateTokenCache(houseKeypair.publicKey.toBase58(), mint.toBase58());
      const finalBalance = await getTokenBalance(houseKeypair.publicKey.toBase58(), mint.toBase58());
      const finalIncrease = finalBalance.balance - houseBalanceBefore.balance;
      
      console.error(`[TX] ❌ CRITICAL: Balance verification FAILED for transferFromUser!`);
      console.error(`[TX] Expected: +${houseAmount}, Got: +${finalIncrease}`);
      console.error(`[TX] House balance before: ${houseBalanceBefore.balance}, after: ${finalBalance.balance}`);
      console.error(`[TX] Transaction signature: ${result.signature}`);
      
      return {
        success: false,
        error: `Transaction did not execute - house balance did not increase. Expected +${houseAmount}, got +${finalIncrease}. Signature: ${result.signature}`,
        attempts: result.attempts,
        signature: result.signature
      };
    }
    
    // Invalidate caches
    if (result.success) {
      invalidateTokenCache(userWalletAddress, mint.toBase58());
      invalidateTokenCache(houseKeypair.publicKey.toBase58(), mint.toBase58());
      if (feeWallet) {
        invalidateTokenCache(feeWallet.toBase58(), mint.toBase58());
      }
      
      // Update wallet last used
      await storage.updateWalletLastUsed(userWalletAddress);
    }
    
    return result;
  } catch (error: any) {
    console.error('Error in transferFromUser:', error);
    return { success: false, error: error.message, attempts: 0 };
  }
}

/**
 * Transfer tokens from house to user wallet (when user wins bet)
 * Includes 2% platform fee split: fee% to fee wallet, rest to user
 * 
 * IMPORTANT: The 'amount' passed here is the PROFIT (winnings - bet).
 * For fee calculation, we apply fee to the profit amount.
 * User receives: profit - (profit * feePercent)
 * Fee wallet receives: profit * feePercent
 */
export async function transferToUser(
  userWalletAddress: string,
  amount: number,
  tokenMint?: string
): Promise<TransferResult> {
  try {
    const connection = getConnection();
    const mint = tokenMint ? new PublicKey(tokenMint) : getTokenMint();
    const decimals = getTokenDecimals();
    const feePercent = getPlatformFeePercent();
    const feeWallet = getFeeWalletAddress();
    
    console.log(`[TX] transferToUser CALLED: user=${userWalletAddress}, amount=${amount}, feePercent=${feePercent}%`);
    
    if (!mint) {
      return { success: false, error: 'Token mint not configured', attempts: 0 };
    }
    
    // Get house keypair
    const houseKeypair = getHouseWallet();
    if (!houseKeypair) {
      return { success: false, error: 'House wallet not initialized', attempts: 0 };
    }
    
    const userPubkey = new PublicKey(userWalletAddress);
    
    // Calculate fee split
    let feeAmount = 0;
    let userAmount = amount;
    
    if (feeWallet && feePercent > 0) {
      feeAmount = amount * (feePercent / 100);
      userAmount = amount - feeAmount;
      console.log(`[TX] WIN: House pays ${amount} → Fee wallet: ${feeAmount} (${feePercent}%), User: ${userAmount}`);
    } else {
      console.log(`[TX] WIN: House pays ${amount} → User (no fee wallet configured)`);
    }
    
    // Get balance BEFORE transfer to verify it actually happened
    const { getTokenBalance } = await import('./balanceService');
    invalidateTokenCache(userWalletAddress, mint.toBase58());
    const balanceBefore = await getTokenBalance(userWalletAddress, mint.toBase58());
    
    let transaction: Transaction;
    
    // Build transaction with fee split if fee wallet is configured
    if (feeWallet && feePercent > 0 && feeAmount > 0) {
      const result = await buildTransferWithFeeTransaction(
        connection,
        houseKeypair,
        userPubkey,
        feeWallet,
        amount,
        feePercent,
        mint,
        decimals
      );
      transaction = result.transaction;
    } else {
      // No fee wallet configured, send all to user
      transaction = await buildTransferTransaction(
        connection,
        houseKeypair,
        userPubkey,
        amount,
        mint,
        decimals
      );
    }
    
    // Send with retry
    const result = await sendWithRetry(connection, transaction, [houseKeypair]);
    
    // CRITICAL: If transaction failed to send, return immediately
    if (!result.success || !result.signature) {
      console.error(`[TX] ❌ Transaction failed to send: ${result.error}`);
      return {
        success: false,
        error: result.error || 'Transaction failed to send',
        attempts: result.attempts,
        signature: result.signature
      };
    }
    
    // CRITICAL: Verify balance actually changed (transaction was sent, now verify it executed)
    console.log(`[TX] Starting balance verification for transferToUser: ${userWalletAddress}, amount: ${userAmount}`);
    console.log(`[TX] Balance before transfer: ${balanceBefore.balance}`);
    console.log(`[TX] Transaction signature: ${result.signature}`);
    
    // Wait for balance to propagate (transaction might be confirmed but balance not updated yet)
    let balanceVerified = false;
    for (let balanceCheck = 0; balanceCheck < 5; balanceCheck++) {
      if (balanceCheck > 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      invalidateTokenCache(userWalletAddress, mint.toBase58());
      const balanceAfter = await getTokenBalance(userWalletAddress, mint.toBase58());
      const balanceIncrease = balanceAfter.balance - balanceBefore.balance;
      
      console.log(`[TX] Balance check ${balanceCheck + 1}/5: ${balanceAfter.balance} (increase: +${balanceIncrease}, expected: +${userAmount})`);
      
      // Check if balance increased by expected amount (allow small rounding differences)
      const tolerance = 0.000001;
      if (balanceIncrease >= (userAmount - tolerance)) {
        console.log(`[TX] ✅ Balance verified: +${balanceIncrease} (expected +${userAmount})`);
        balanceVerified = true;
        break;
      }
    }
    
    if (!balanceVerified) {
      invalidateTokenCache(userWalletAddress, mint.toBase58());
      const finalBalance = await getTokenBalance(userWalletAddress, mint.toBase58());
      const finalIncrease = finalBalance.balance - balanceBefore.balance;
      
      console.error(`[TX] ❌ CRITICAL: Balance verification FAILED after 5 attempts!`);
      console.error(`[TX] Expected: +${userAmount}, Got: +${finalIncrease}`);
      console.error(`[TX] Balance before: ${balanceBefore.balance}, after: ${finalBalance.balance}`);
      console.error(`[TX] Transaction signature: ${result.signature}`);
      
      // Transaction was sent but balance didn't change - transaction must have failed
      return {
        success: false,
        error: `Transaction did not execute - balance did not increase. Expected +${userAmount}, got +${finalIncrease}. Signature: ${result.signature}`,
        attempts: result.attempts,
        signature: result.signature
      };
    }
    
    // Invalidate caches
    if (result.success) {
      invalidateTokenCache(userWalletAddress, mint.toBase58());
      invalidateTokenCache(houseKeypair.publicKey.toBase58(), mint.toBase58());
      if (feeWallet) {
        invalidateTokenCache(feeWallet.toBase58(), mint.toBase58());
      }
    }
    
    return result;
  } catch (error: any) {
    console.error('Error in transferToUser:', error);
    return { success: false, error: error.message, attempts: 0 };
  }
}

/**
 * Transfer tokens to any destination address (for withdrawals)
 */
export async function transferToDestination(
  fromWalletAddress: string,
  destinationAddress: string,
  amount: number,
  tokenMint?: string
): Promise<TransferResult> {
  try {
    const connection = getConnection();
    const mint = tokenMint ? new PublicKey(tokenMint) : getTokenMint();
    const decimals = getTokenDecimals();
    
    if (!mint) {
      return { success: false, error: 'Token mint not configured', attempts: 0 };
    }
    
    // Validate destination address
    let destPubkey: PublicKey;
    try {
      destPubkey = new PublicKey(destinationAddress);
    } catch {
      return { success: false, error: 'Invalid destination address', attempts: 0 };
    }
    
    // Get user's keypair
    const userKeypair = await getUserKeypair(fromWalletAddress);
    if (!userKeypair) {
      return { success: false, error: 'User wallet not registered', attempts: 0 };
    }
    
    // Build transaction
    const transaction = await buildTransferTransaction(
      connection,
      userKeypair,
      destPubkey,
      amount,
      mint,
      decimals
    );
    
    // Send with retry
    const result = await sendWithRetry(connection, transaction, [userKeypair]);
    
    // Invalidate caches
    if (result.success) {
      invalidateTokenCache(fromWalletAddress, mint.toBase58());
      invalidateTokenCache(destinationAddress, mint.toBase58());
      
      // Update wallet last used
      await storage.updateWalletLastUsed(fromWalletAddress);
    }
    
    return result;
  } catch (error: any) {
    console.error('Error in transferToDestination:', error);
    return { success: false, error: error.message, attempts: 0 };
  }
}

/**
 * Get transaction status
 */
export async function getTransactionStatus(signature: string): Promise<{
  confirmed: boolean;
  slot?: number;
  error?: string;
}> {
  try {
    const connection = getConnection();
    const status = await connection.getSignatureStatus(signature);
    
    if (!status.value) {
      return { confirmed: false };
    }
    
    if (status.value.err) {
      return { 
        confirmed: false, 
        error: JSON.stringify(status.value.err) 
      };
    }
    
    const confirmed = status.value.confirmationStatus === 'confirmed' ||
                      status.value.confirmationStatus === 'finalized';
    
    return { 
      confirmed, 
      slot: status.value.slot 
    };
  } catch (error: any) {
    console.error('Error getting transaction status:', error);
    return { confirmed: false, error: error.message };
  }
}

/**
 * Get house wallet balance
 * Uses the same approach as balanceService - sum all token accounts for the mint
 */
export async function getHouseBalance(tokenMint?: string): Promise<number> {
  try {
    const houseKeypair = getHouseWallet();
    if (!houseKeypair) {
      console.log('[TX] House wallet not initialized for balance check');
      return 0;
    }
    
    const connection = getConnection();
    const mint = tokenMint ? new PublicKey(tokenMint) : getTokenMint();
    
    if (!mint) {
      console.log('[TX] Token mint not configured for house balance check');
      return 0;
    }
    
    // Use getParsedTokenAccountsByOwner to find ALL token accounts for this mint
    // This handles both standard SPL Token and Token-2022 accounts
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      houseKeypair.publicKey,
      { mint }
    );
    
    let rawSum = 0n;
    let decimalsOnChain: number | null = null;
    
    for (const acc of tokenAccounts.value) {
      const parsed = (acc.account.data as any)?.parsed;
      const tokenAmount = parsed?.info?.tokenAmount;
      if (!tokenAmount?.amount) continue;
      rawSum += BigInt(tokenAmount.amount);
      if (typeof tokenAmount.decimals === 'number') {
        decimalsOnChain = tokenAmount.decimals;
      }
    }
    
    const finalDecimals = decimalsOnChain ?? getTokenDecimals();
    const balance = Number(rawSum.toString()) / Math.pow(10, finalDecimals);
    
    console.log(`[TX] House balance: ${balance} (${tokenAccounts.value.length} accounts, raw=${rawSum.toString()})`);
    
    return balance;
  } catch (error) {
    console.error('Error getting house balance:', error);
    return 0;
  }
}

/**
 * Check if house has sufficient balance for a payout
 */
export async function householdHasSufficientBalance(amount: number): Promise<boolean> {
  const balance = await getHouseBalance();
  return balance >= amount;
}

