/**
 * Solana Wallet Service
 * 
 * Handles house wallet operations including:
 * - Loading house wallet from environment
 * - SPL token transfers for payouts and deposits
 * - Transaction signing and submission
 */

import {
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
  TransactionInstruction,
  ComputeBudgetProgram,
  Connection
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import bs58 from 'bs58';
import { getConnection, executeWithFailover } from './solanaClient';

// House wallet singleton
let houseWallet: Keypair | null = null;

// Token mint address from environment
const getTokenMint = (): PublicKey => {
  const mint = process.env.LOCKED_TOKEN_MINT;
  if (!mint) {
    throw new Error('LOCKED_TOKEN_MINT not configured in environment');
  }
  return new PublicKey(mint);
};

/**
 * Initialize the house wallet from environment
 */
export const initializeHouseWallet = (): Keypair => {
  if (houseWallet) {
    return houseWallet;
  }

  const secretKey = process.env.HOUSE_WALLET_SECRET;
  
  // DEBUG: Log what we're reading
  console.log('[WALLET] HOUSE_WALLET_SECRET from env:', secretKey ? `${secretKey.substring(0, 10)}... (length: ${secretKey.length})` : 'NOT SET');
  console.log('[WALLET] First char code:', secretKey ? secretKey.charCodeAt(0) : 'N/A');
  
  if (!secretKey) {
    throw new Error('HOUSE_WALLET_SECRET not configured in environment');
  }

  // Check if it starts with '[' (JSON array)
  const isJsonArray = secretKey.trim().startsWith('[');
  console.log('[WALLET] Detected format:', isJsonArray ? 'JSON Array' : 'Base58');

  if (isJsonArray) {
    // Parse as JSON array
    try {
      const parsed = JSON.parse(secretKey);
      houseWallet = Keypair.fromSecretKey(Uint8Array.from(parsed));
      console.log('[WALLET] House wallet initialized:', houseWallet.publicKey.toBase58());
      return houseWallet;
    } catch (e) {
      console.error('[WALLET] Failed to parse JSON array:', e);
      throw new Error('Invalid HOUSE_WALLET_SECRET JSON array format.');
    }
  } else {
    // Parse as base58
    try {
      const decoded = bs58.decode(secretKey.trim());
      houseWallet = Keypair.fromSecretKey(decoded);
      console.log('[WALLET] House wallet initialized:', houseWallet.publicKey.toBase58());
      return houseWallet;
    } catch (e) {
      console.error('[WALLET] Failed to decode base58:', e);
      throw new Error('Invalid HOUSE_WALLET_SECRET base58 format.');
    }
  }
};

/**
 * Get the house wallet (initialize if needed)
 */
export const getHouseWallet = (): Keypair => {
  if (!houseWallet) {
    return initializeHouseWallet();
  }
  return houseWallet;
};

/**
 * Get house wallet public key
 */
export const getHouseWalletAddress = (): string => {
  return getHouseWallet().publicKey.toBase58();
};

/**
 * Check if house wallet is initialized
 */
export const isHouseWalletInitialized = (): boolean => {
  try {
    getHouseWallet();
    return true;
  } catch {
    return false;
  }
};

/**
 * Detect if a token uses Token-2022 or standard SPL Token program
 */
const getTokenProgramId = async (connection: Connection, mint: PublicKey): Promise<PublicKey> => {
  try {
    const mintInfo = await connection.getAccountInfo(mint);
    if (mintInfo && mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
      return TOKEN_2022_PROGRAM_ID;
    }
  } catch (error) {
    console.log('[WALLET] Error detecting token program, defaulting to SPL Token');
  }
  return TOKEN_PROGRAM_ID;
};

/**
 * Get or create associated token account for a wallet
 */
export const getOrCreateTokenAccount = async (
  walletAddress: string,
  createIfMissing: boolean = false
): Promise<PublicKey> => {
  const wallet = new PublicKey(walletAddress);
  const mint = getTokenMint();
  const connection = getConnection();
  
  // Detect token program
  const tokenProgramId = await getTokenProgramId(connection, mint);
  
  const associatedTokenAddress = await getAssociatedTokenAddress(
    mint,
    wallet,
    false,
    tokenProgramId
  );

  if (createIfMissing) {
    try {
      await getAccount(connection, associatedTokenAddress, 'confirmed', tokenProgramId);
    } catch {
      // Account doesn't exist, create it
      const house = getHouseWallet();
      const transaction = new Transaction().add(
        createAssociatedTokenAccountInstruction(
          house.publicKey,
          associatedTokenAddress,
          wallet,
          mint,
          tokenProgramId
        )
      );

      await sendAndConfirmTransaction(connection, transaction, [house]);
      console.log('[WALLET] Created token account for', walletAddress);
    }
  }

  return associatedTokenAddress;
};

/**
 * Get token balance for a wallet
 */
export const getTokenBalance = async (walletAddress: string): Promise<number> => {
  try {
    const tokenAccount = await getOrCreateTokenAccount(walletAddress);
    const connection = getConnection();
    const account = await getAccount(connection, tokenAccount);
    // Assuming 9 decimals for the token (standard SPL token)
    return Number(account.amount) / 1e9;
  } catch (error: any) {
    if (error.message?.includes('could not find account')) {
      return 0;
    }
    throw error;
  }
};

/**
 * Get SOL balance for a wallet
 */
export const getSolBalance = async (walletAddress: string): Promise<number> => {
  const connection = getConnection();
  const balance = await connection.getBalance(new PublicKey(walletAddress));
  return balance / LAMPORTS_PER_SOL;
};

/**
 * Transfer tokens from house wallet to user
 * Used for payouts when user wins
 */
export const transferTokensToUser = async (
  userWalletAddress: string,
  amount: number,
  memo?: string
): Promise<{ success: boolean; signature?: string; error?: string }> => {
  try {
    const house = getHouseWallet();
    const connection = getConnection();
    const mint = getTokenMint();

    // Detect token program (Token-2022 vs SPL Token)
    const tokenProgramId = await getTokenProgramId(connection, mint);
    console.log('[WALLET] Using token program:', tokenProgramId.toBase58());

    // Get token accounts with correct program
    const houseTokenAccount = await getAssociatedTokenAddress(mint, house.publicKey, false, tokenProgramId);
    const userTokenAccount = await getOrCreateTokenAccount(userWalletAddress, true);

    // Get decimals from environment
    const decimals = parseInt(process.env.TOKEN_DECIMALS || '9', 10);
    const amountInSmallestUnit = BigInt(Math.floor(amount * Math.pow(10, decimals)));

    // Build transaction
    const transaction = new Transaction();

    // Add priority fee for faster confirmation
    transaction.add(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 1000
      })
    );

    // Add transfer instruction with correct program
    transaction.add(
      createTransferInstruction(
        houseTokenAccount,
        userTokenAccount,
        house.publicKey,
        amountInSmallestUnit,
        [],
        tokenProgramId
      )
    );

    // Add memo if provided
    if (memo) {
      const memoProgram = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
      transaction.add(
        new TransactionInstruction({
          keys: [],
          programId: memoProgram,
          data: Buffer.from(memo)
        })
      );
    }

    // Send transaction
    const signature = await sendAndConfirmTransaction(connection, transaction, [house], {
      commitment: 'confirmed',
      maxRetries: 3
    });

    console.log('[WALLET] Transfer successful:', signature);
    return { success: true, signature };
  } catch (error: any) {
    console.error('[WALLET] Transfer failed:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Verify a deposit transaction
 * Checks if a transaction actually transferred tokens to the house wallet
 */
export const verifyDeposit = async (
  signature: string,
  expectedSender: string,
  expectedAmount: number
): Promise<{ valid: boolean; actualAmount?: number; error?: string }> => {
  try {
    const connection = getConnection();
    const tx = await connection.getParsedTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0
    });

    if (!tx) {
      return { valid: false, error: 'Transaction not found' };
    }

    if (tx.meta?.err) {
      return { valid: false, error: 'Transaction failed' };
    }

    const house = getHouseWallet();
    const mint = getTokenMint();
    const houseTokenAccount = await getAssociatedTokenAddress(mint, house.publicKey);

    // Look for token transfer to house wallet
    const instructions = tx.transaction.message.instructions;
    for (const ix of instructions) {
      if ('parsed' in ix && ix.parsed?.type === 'transferChecked') {
        const info = ix.parsed.info;
        if (
          info.destination === houseTokenAccount.toBase58() &&
          info.authority === expectedSender
        ) {
          const actualAmount = Number(info.tokenAmount.amount) / 1e9;
          if (actualAmount >= expectedAmount * 0.99) { // Allow 1% tolerance
            return { valid: true, actualAmount };
          }
        }
      }
    }

    // Also check for regular transfer (without checked)
    const preBalances = tx.meta?.preTokenBalances || [];
    const postBalances = tx.meta?.postTokenBalances || [];

    for (const post of postBalances) {
      if (post.owner === house.publicKey.toBase58()) {
        const pre = preBalances.find(
          p => p.accountIndex === post.accountIndex
        );
        const preAmount = pre ? Number(pre.uiTokenAmount.amount) : 0;
        const postAmount = Number(post.uiTokenAmount.amount);
        const diff = (postAmount - preAmount) / 1e9;
        
        if (diff >= expectedAmount * 0.99) {
          return { valid: true, actualAmount: diff };
        }
      }
    }

    return { valid: false, error: 'No matching transfer found' };
  } catch (error: any) {
    console.error('[WALLET] Verify deposit failed:', error);
    return { valid: false, error: error.message };
  }
};

/**
 * Get recent transactions for the house wallet
 */
export const getRecentTransactions = async (limit: number = 10): Promise<any[]> => {
  const connection = getConnection();
  const house = getHouseWallet();
  
  const signatures = await connection.getSignaturesForAddress(house.publicKey, { limit });
  
  return signatures.map(sig => ({
    signature: sig.signature,
    slot: sig.slot,
    timestamp: sig.blockTime,
    error: sig.err
  }));
};

/**
 * Check if wallet service is ready
 */
export const isWalletServiceReady = (): boolean => {
  try {
    getHouseWallet();
    getTokenMint();
    return true;
  } catch {
    return false;
  }
};

export default {
  initializeHouseWallet,
  getHouseWallet,
  getHouseWalletAddress,
  isHouseWalletInitialized,
  getOrCreateTokenAccount,
  getTokenBalance,
  getSolBalance,
  transferTokensToUser,
  verifyDeposit,
  getRecentTransactions,
  isWalletServiceReady
};

