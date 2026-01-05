/**
 * Balance Routes
 * 
 * Manages user balances for the dice game:
 * - Deposit: Verify on-chain deposit and credit balance
 * - Withdraw: Debit balance and send tokens on-chain
 * - Get Balance: Return current balance for a wallet
 */

import express from 'express';
import { storage } from '../storage';
import { 
  verifyDeposit, 
  transferTokensToUser, 
  getHouseWalletAddress,
  isWalletServiceReady,
  getTokenBalance
} from '../utils/solanaWallet';
import { 
  transferToDestination,
  getHouseBalance 
} from '../utils/transactionService';
import {
  getFreshTokenBalance,
  invalidateCache
} from '../utils/balanceService';

const router = express.Router();

// In-memory balance cache for quick lookups
// Persisted to storage on changes
const balanceCache: Map<string, number> = new Map();

// Pending deposits being processed (to prevent double-crediting)
const pendingDeposits: Set<string> = new Set();

// Pending withdrawals being processed
const pendingWithdrawals: Map<string, { amount: number; timestamp: number }> = new Map();

/**
 * Load balances from storage on startup
 */
export const loadBalances = async (): Promise<void> => {
  try {
    const balances = await storage.getAllBalances();
    for (const [address, balance] of Object.entries(balances)) {
      balanceCache.set(address, balance as number);
    }
    console.log(`[BALANCE] Loaded ${balanceCache.size} balances from storage`);
  } catch (error) {
    console.error('[BALANCE] Error loading balances:', error);
  }
};

/**
 * Save a balance to storage
 */
const saveBalance = async (walletAddress: string, balance: number): Promise<void> => {
  balanceCache.set(walletAddress, balance);
  await storage.setBalance(walletAddress, balance);
};

/**
 * Get balance for a wallet
 */
export const getBalance = (walletAddress: string): number => {
  return balanceCache.get(walletAddress) || 0;
};

/**
 * Add to balance (internal use only)
 */
export const addToBalance = async (walletAddress: string, amount: number): Promise<number> => {
  const currentBalance = getBalance(walletAddress);
  const newBalance = currentBalance + amount;
  await saveBalance(walletAddress, newBalance);
  return newBalance;
};

/**
 * Deduct from balance (internal use only)
 * Returns false if insufficient balance
 */
export const deductFromBalance = async (walletAddress: string, amount: number): Promise<boolean> => {
  const currentBalance = getBalance(walletAddress);
  if (currentBalance < amount) {
    return false;
  }
  const newBalance = currentBalance - amount;
  await saveBalance(walletAddress, newBalance);
  return true;
};

/**
 * GET /api/balance/house/address
 * Get the house wallet address for deposits
 * NOTE: This route MUST be defined BEFORE /:walletAddress to avoid route parameter matching issues
 */
router.get('/house/address', async (req, res) => {
  try {
    if (!isWalletServiceReady()) {
      return res.status(503).json({ 
        success: false,
        error: 'Wallet service not ready. House wallet may not be configured.',
        houseWalletAddress: null,
        tokenMint: process.env.LOCKED_TOKEN_MINT || 'Not configured'
      });
    }

    const address = getHouseWalletAddress();
    
    res.json({
      success: true,
      houseWalletAddress: address,
      tokenMint: process.env.LOCKED_TOKEN_MINT || 'Not configured'
    });
  } catch (error: any) {
    console.error('[BALANCE] Error getting house address:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to get house address',
      houseWalletAddress: null 
    });
  }
});

/**
 * GET /api/balance/:walletAddress
 * Get the balance for a wallet
 */
router.get('/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    
    if (!walletAddress) {
      return res.status(400).json({ error: 'Wallet address required' });
    }

    // Validate Solana address format
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)) {
      return res.status(400).json({ error: 'Invalid Solana wallet address' });
    }

    const balance = getBalance(walletAddress);
    
    const tokenSymbol = process.env.LOCKED_TOKEN_SYMBOL || 'LOCKED';
    res.json({
      success: true,
      walletAddress,
      balance,
      currency: tokenSymbol
    });
  } catch (error: any) {
    console.error('[BALANCE] Error getting balance:', error);
    res.status(500).json({ error: 'Failed to get balance' });
  }
});

/**
 * POST /api/balance/deposit
 * Verify a deposit transaction and credit the user's balance
 */
router.post('/deposit', async (req, res) => {
  try {
    const { walletAddress, signature, amount } = req.body;

    // Validate inputs
    if (!walletAddress || !signature || !amount) {
      return res.status(400).json({ error: 'Missing required fields: walletAddress, signature, amount' });
    }

    // Validate wallet address format
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)) {
      return res.status(400).json({ error: 'Invalid Solana wallet address' });
    }

    // Validate amount
    const depositAmount = parseFloat(amount);
    if (isNaN(depositAmount) || depositAmount <= 0) {
      return res.status(400).json({ error: 'Invalid deposit amount' });
    }

    // Check for duplicate deposit
    if (pendingDeposits.has(signature)) {
      return res.status(409).json({ error: 'Deposit already being processed' });
    }

    // Check if this signature was already processed
    const existingDeposit = await storage.getDeposit(signature);
    if (existingDeposit) {
      return res.status(409).json({ error: 'Deposit already credited' });
    }

    // Mark as pending
    pendingDeposits.add(signature);

    try {
      // Verify the deposit on-chain
      const verification = await verifyDeposit(signature, walletAddress, depositAmount);

      if (!verification.valid) {
        pendingDeposits.delete(signature);
        return res.status(400).json({ 
          error: 'Deposit verification failed', 
          details: verification.error 
        });
      }

      // Credit the balance
      const actualAmount = verification.actualAmount || depositAmount;
      const newBalance = await addToBalance(walletAddress, actualAmount);

      // Record the deposit
      await storage.recordDeposit({
        signature,
        walletAddress,
        amount: actualAmount,
        timestamp: new Date().toISOString(),
        status: 'completed'
      });

      console.log(`[BALANCE] Deposit credited: ${walletAddress} +${actualAmount} LOCKED (new balance: ${newBalance})`);

      res.json({
        success: true,
        message: 'Deposit credited successfully',
        amount: actualAmount,
        newBalance,
        signature
      });
    } finally {
      pendingDeposits.delete(signature);
    }
  } catch (error: any) {
    console.error('[BALANCE] Deposit error:', error);
    res.status(500).json({ error: 'Failed to process deposit' });
  }
});

/**
 * POST /api/balance/withdraw
 * Withdraw tokens from user's wallet to a destination address
 * Requires destinationAddress - users always specify where to send funds
 */
router.post('/withdraw', async (req, res) => {
  try {
    const { walletAddress, amount, destinationAddress } = req.body;
    const tokenSymbol = process.env.LOCKED_TOKEN_SYMBOL || 'LOCKED';

    // Validate inputs
    if (!walletAddress || !amount || !destinationAddress) {
      return res.status(400).json({ 
        error: 'Missing required fields: walletAddress, amount, destinationAddress' 
      });
    }

    // Validate source wallet address format
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)) {
      return res.status(400).json({ error: 'Invalid source wallet address' });
    }

    // Validate destination wallet address format
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(destinationAddress)) {
      return res.status(400).json({ error: 'Invalid destination wallet address' });
    }

    // Validate amount
    const withdrawAmount = parseFloat(amount);
    if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
      return res.status(400).json({ error: 'Invalid withdrawal amount' });
    }

    // Check minimum withdrawal (to cover transaction fees)
    const minWithdrawal = parseFloat(process.env.MIN_WITHDRAWAL || '1');
    if (withdrawAmount < minWithdrawal) {
      return res.status(400).json({ error: `Minimum withdrawal is ${minWithdrawal} ${tokenSymbol}` });
    }

    // Check for pending withdrawal
    const pending = pendingWithdrawals.get(walletAddress);
    if (pending && Date.now() - pending.timestamp < 60000) {
      return res.status(409).json({ error: 'Withdrawal already in progress' });
    }

    // Check if user's wallet is registered (has stored private key)
    const storedWallet = await storage.getUserWallet(walletAddress);
    if (!storedWallet) {
      return res.status(400).json({ 
        error: 'Wallet not registered. Please reconnect your wallet.',
        code: 'WALLET_NOT_REGISTERED'
      });
    }

    // Get user's on-chain balance (direct betting - no internal balance)
    const onChainBalance = await getFreshTokenBalance(walletAddress);
    if (onChainBalance < withdrawAmount) {
      return res.status(400).json({ 
        error: 'Insufficient balance',
        balance: onChainBalance,
        requested: withdrawAmount
      });
    }

    // Mark withdrawal as pending
    pendingWithdrawals.set(walletAddress, { amount: withdrawAmount, timestamp: Date.now() });

    try {
      // Transfer tokens to destination using user's stored private key
      const result = await transferToDestination(
        walletAddress,
        destinationAddress,
        withdrawAmount
      );

      if (!result.success) {
        pendingWithdrawals.delete(walletAddress);
        return res.status(500).json({ 
          error: 'Withdrawal failed',
          details: result.error
        });
      }

      // Record the withdrawal
      await storage.recordWithdrawal({
        signature: result.signature!,
        walletAddress,
        destinationAddress,
        amount: withdrawAmount,
        timestamp: new Date().toISOString(),
        status: 'completed'
      });

      // Invalidate balance cache
      invalidateCache(walletAddress);
      invalidateCache(destinationAddress);

      // Get new on-chain balance
      const newBalance = await getFreshTokenBalance(walletAddress);
      
      console.log(`[BALANCE] Withdrawal completed: ${walletAddress} -> ${destinationAddress} ${withdrawAmount} ${tokenSymbol} (new balance: ${newBalance})`);

      res.json({
        success: true,
        message: 'Withdrawal completed',
        amount: withdrawAmount,
        destinationAddress,
        newBalance,
        signature: result.signature
      });
    } finally {
      pendingWithdrawals.delete(walletAddress);
    }
  } catch (error: any) {
    console.error('[BALANCE] Withdrawal error:', error);
    res.status(500).json({ error: 'Failed to process withdrawal' });
  }
});

/**
 * GET /api/balance/history/:walletAddress
 * Get transaction history for a wallet
 */
router.get('/history/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const limit = parseInt(req.query.limit as string) || 20;

    if (!walletAddress) {
      return res.status(400).json({ error: 'Wallet address required' });
    }

    const history = await storage.getTransactionHistory(walletAddress, limit);

    res.json({
      success: true,
      walletAddress,
      transactions: history
    });
  } catch (error: any) {
    console.error('[BALANCE] History error:', error);
    res.status(500).json({ error: 'Failed to get transaction history' });
  }
});

/**
 * GET /api/balance/on-chain/:walletAddress
 * Get actual on-chain token balance (for verification)
 */
router.get('/on-chain/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;

    if (!walletAddress) {
      return res.status(400).json({ error: 'Wallet address required' });
    }

    const onChainBalance = await getTokenBalance(walletAddress);
    const gameBalance = getBalance(walletAddress);

    const tokenSymbol = process.env.LOCKED_TOKEN_SYMBOL || 'LOCKED';
    res.json({
      success: true,
      walletAddress,
      onChainBalance,
      gameBalance,
      currency: tokenSymbol
    });
  } catch (error: any) {
    console.error('[BALANCE] On-chain balance error:', error);
    res.status(500).json({ error: 'Failed to get on-chain balance' });
  }
});

export default router;

