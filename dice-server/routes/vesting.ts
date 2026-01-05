/**
 * Vesting Routes - Token Locking
 * 
 * This module handles all token locking operations.
 * Tokens are transferred to the house wallet and tracked in persistent storage.
 * Users can claim tokens back after the lock period expires.
 */

import { Router, Request, Response } from 'express';
import { PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import fs from 'fs';
import path from 'path';
import { getConnection } from '../utils/solanaClient';
import { getTokenBalance, invalidateCache } from '../utils/balanceService';
import { transferFromUser, transferToUser } from '../utils/transactionService';

const router = Router();

// Vesting schedule interface
interface VestingSchedule {
  id: string;
  owner: string;
  amount: number;
  startTime: number;
  endTime: number;
  claimedAmount: number;
  status: 'active' | 'completed' | 'cancelled';
  createdAt: string;
  txSignature?: string;
}

// File path for persistent vesting storage
const DATA_DIR = path.join(process.cwd(), 'data');
const VESTING_FILE_PATH = path.join(DATA_DIR, 'vesting_schedules.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// In-memory vesting schedules (persisted to file)
let vestingSchedules: Map<string, VestingSchedule> = new Map();

/**
 * Save vesting schedules to file
 */
function saveVestingSchedules(): void {
  try {
    const schedulesArray = Array.from(vestingSchedules.values());
    fs.writeFileSync(VESTING_FILE_PATH, JSON.stringify(schedulesArray, null, 2));
    console.log('[VESTING] Saved', schedulesArray.length, 'schedules to storage');
  } catch (error) {
    console.error('[VESTING] Error saving vesting schedules:', error);
  }
}

/**
 * Load vesting schedules from storage on startup
 */
export const loadVestingSchedules = async (): Promise<void> => {
  try {
    if (fs.existsSync(VESTING_FILE_PATH)) {
      const fileData = fs.readFileSync(VESTING_FILE_PATH, 'utf8');
      const parsedData = JSON.parse(fileData);
      
      vestingSchedules = new Map();
      parsedData.forEach((schedule: VestingSchedule) => {
        if (schedule && schedule.id) {
          vestingSchedules.set(schedule.id, schedule);
        }
      });
      
      console.log('[VESTING] Loaded', vestingSchedules.size, 'vesting schedules from storage');
    } else {
      console.log('[VESTING] No saved vesting schedules found, starting fresh');
      vestingSchedules = new Map();
    }
    console.log('[VESTING] Vesting service initialized');
  } catch (error) {
    console.error('[VESTING] Error loading vesting schedules:', error);
    vestingSchedules = new Map();
  }
};

/**
 * Generate a unique vesting schedule ID
 */
const generateVestingId = (): string => {
  return `vest_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
};

/**
 * Calculate vested amount based on schedule
 */
const calculateVestedAmount = (schedule: VestingSchedule): number => {
  const now = Date.now();
  
  if (now < schedule.startTime) {
    return 0;
  }
  
  if (now >= schedule.endTime) {
    return schedule.amount;
  }
  
  const totalDuration = schedule.endTime - schedule.startTime;
  const elapsed = now - schedule.startTime;
  const vestedRatio = elapsed / totalDuration;
  
  return Math.floor(schedule.amount * vestedRatio * 100) / 100;
};

/**
 * GET /api/vesting/schedules/:walletAddress
 * Get all vesting schedules for a wallet
 */
router.get('/schedules/:walletAddress', async (req: Request, res: Response) => {
  const { walletAddress } = req.params;

  if (!walletAddress) {
    return res.status(400).json({ error: 'Wallet address is required' });
  }

  try {
    const userSchedules: any[] = [];
    
    vestingSchedules.forEach((schedule) => {
      if (schedule.owner === walletAddress) {
        const vestedAmount = calculateVestedAmount(schedule);
        const claimableAmount = vestedAmount - schedule.claimedAmount;
        
        userSchedules.push({
          ...schedule,
          vestedAmount,
          claimableAmount
        });
      }
    });

    res.json({
      success: true,
      schedules: userSchedules
    });
  } catch (error: any) {
    console.error('[VESTING] Error fetching schedules:', error);
    res.status(500).json({ error: 'Failed to fetch vesting schedules' });
  }
});

/**
 * POST /api/vesting/create
 * Create a new vesting schedule (lock tokens)
 * 
 * Duration is specified in SECONDS for maximum flexibility
 */
router.post('/create', async (req: Request, res: Response) => {
  const { 
    walletAddress, 
    amount, 
    durationSeconds, 
    signedMessage, 
    signature
  } = req.body;

  // Validate required fields
  if (!walletAddress || !amount || !durationSeconds || !signedMessage || !signature) {
    return res.status(400).json({ 
      error: 'Missing required fields: walletAddress, amount, durationSeconds, signedMessage, signature' 
    });
  }

  try {
    // Verify signature
    const messageBytes = new TextEncoder().encode(signedMessage);
    const signatureBytes = bs58.decode(signature);
    const publicKeyBytes = bs58.decode(walletAddress);

    if (!nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Validate amount
    const lockAmount = parseFloat(amount);
    if (isNaN(lockAmount) || lockAmount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    // Validate duration in seconds
    const seconds = parseInt(durationSeconds);
    const maxSeconds = 10 * 365 * 24 * 60 * 60; // ~10 years in seconds
    if (isNaN(seconds) || seconds < 1 || seconds > maxSeconds) {
      return res.status(400).json({ 
        error: `Duration must be between 1 second and ${maxSeconds} seconds (~10 years)` 
      });
    }

    // Get the token mint from environment
    const tokenMint = process.env.LOCKED_TOKEN_MINT;
    if (!tokenMint) {
      return res.status(500).json({ error: 'Token mint not configured' });
    }

    // Check user's ON-CHAIN token balance
    invalidateCache(walletAddress);
    const tokenBalance = await getTokenBalance(walletAddress, tokenMint);
    
    console.log('[VESTING] User balance check:', walletAddress, 'has', tokenBalance.balance, 'needs', lockAmount);
    
    if (tokenBalance.balance < lockAmount) {
      return res.status(400).json({ 
        error: 'Insufficient token balance',
        required: lockAmount,
        available: tokenBalance.balance
      });
    }

    // Check user has enough SOL for fee (0.01 SOL)
    const connection = await getConnection();
    const userPubkey = new PublicKey(walletAddress);
    const solBalance = await connection.getBalance(userPubkey);
    const requiredSol = 0.015 * LAMPORTS_PER_SOL; // 0.01 fee + buffer for tx fees
    
    console.log('[VESTING] SOL balance check:', walletAddress, 'has', solBalance / LAMPORTS_PER_SOL, 'SOL, needs ~0.015 SOL');
    
    if (solBalance < requiredSol) {
      return res.status(400).json({ 
        error: 'Insufficient SOL for lock fee',
        required: '0.015 SOL',
        available: (solBalance / LAMPORTS_PER_SOL).toFixed(4) + ' SOL'
      });
    }

    // Transfer tokens from user to house wallet (lock them)
    const transferResult = await transferFromUser(walletAddress, lockAmount, tokenMint);
    
    if (!transferResult.success) {
      console.error('[VESTING] Token transfer failed:', transferResult.error);
      return res.status(500).json({ 
        error: 'Failed to lock tokens: ' + (transferResult.error || 'Transfer failed'),
        details: transferResult.error
      });
    }
    
    console.log('[VESTING] Tokens locked, tx:', transferResult.signature);

    // Lock successful - now charge 0.01 SOL fee to FEE_WALLET_ADDRESS
    const feeWalletAddress = process.env.FEE_WALLET_ADDRESS;
    let feeSignature = null;
    
    if (feeWalletAddress) {
      try {
        const { getUserKeypair } = await import('../utils/transactionService');
        const userKeypair = await getUserKeypair(walletAddress);
        
        if (userKeypair) {
          const feeAmount = 0.01 * LAMPORTS_PER_SOL; // 0.01 SOL
          const feeWalletPubkey = new PublicKey(feeWalletAddress);
          
          const feeTransaction = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: userPubkey,
              toPubkey: feeWalletPubkey,
              lamports: feeAmount,
            })
          );
          
          const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
          feeTransaction.recentBlockhash = blockhash;
          feeTransaction.feePayer = userPubkey;
          
          feeTransaction.sign(userKeypair);
          
          feeSignature = await connection.sendRawTransaction(feeTransaction.serialize(), {
            skipPreflight: false,
            maxRetries: 3,
          });
          
          await connection.confirmTransaction({
            signature: feeSignature,
            blockhash,
            lastValidBlockHeight,
          }, 'confirmed');
          
          console.log('[VESTING] Lock fee (0.01 SOL) charged, tx:', feeSignature);
        }
      } catch (feeError: any) {
        console.error('[VESTING] Failed to charge lock fee (non-critical):', feeError.message);
      }
    }

    // Create vesting schedule
    const now = Date.now();
    const vestingSchedule: VestingSchedule = {
      id: generateVestingId(),
      owner: walletAddress,
      amount: lockAmount,
      startTime: now,
      endTime: now + (seconds * 1000),
      claimedAmount: 0,
      status: 'active',
      createdAt: new Date().toISOString(),
      txSignature: transferResult.signature
    };

    vestingSchedules.set(vestingSchedule.id, vestingSchedule);
    saveVestingSchedules();

    console.log('[VESTING] Created schedule:', vestingSchedule.id, 'for', walletAddress, 'duration:', seconds, 'seconds');

    // Get updated balance
    invalidateCache(walletAddress);
    const updatedBalance = await getTokenBalance(walletAddress, tokenMint);

    res.json({
      success: true,
      vestingId: vestingSchedule.id,
      signature: transferResult.signature,
      txSignature: transferResult.signature,
      feeSignature,
      message: 'Tokens locked successfully',
      schedule: {
        id: vestingSchedule.id,
        amount: vestingSchedule.amount,
        startTime: vestingSchedule.startTime,
        endTime: vestingSchedule.endTime,
        durationSeconds: seconds,
        releaseDate: new Date(vestingSchedule.endTime).toISOString()
      },
      newBalance: updatedBalance.balance
    });
  } catch (error: any) {
    console.error('[VESTING] Error creating vesting schedule:', error);
    res.status(500).json({ 
      error: 'Failed to create vesting schedule',
      details: error.message 
    });
  }
});

/**
 * POST /api/vesting/claim
 * Claim vested tokens
 */
router.post('/claim', async (req: Request, res: Response) => {
  const { walletAddress, vestingId, signedMessage, signature } = req.body;

  if (!walletAddress || !vestingId || !signedMessage || !signature) {
    return res.status(400).json({ 
      error: 'Missing required fields: walletAddress, vestingId, signedMessage, signature' 
    });
  }

  try {
    // Verify signature
    const messageBytes = new TextEncoder().encode(signedMessage);
    const signatureBytes = bs58.decode(signature);
    const publicKeyBytes = bs58.decode(walletAddress);

    if (!nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Find the vesting schedule
    const schedule = vestingSchedules.get(vestingId);
    if (!schedule) {
      return res.status(404).json({ error: 'Vesting schedule not found' });
    }

    // Verify ownership
    if (schedule.owner !== walletAddress) {
      return res.status(403).json({ error: 'You do not own this vesting schedule' });
    }

    // Check if already completed
    if (schedule.status === 'completed') {
      return res.status(400).json({ error: 'Vesting schedule already completed' });
    }

    // Calculate claimable amount
    const vestedAmount = calculateVestedAmount(schedule);
    const claimableAmount = vestedAmount - schedule.claimedAmount;

    if (claimableAmount <= 0) {
      return res.status(400).json({ 
        error: 'No tokens available to claim yet',
        nextUnlockTime: schedule.endTime
      });
    }

    // Get the token mint from environment
    const tokenMint = process.env.LOCKED_TOKEN_MINT;
    if (!tokenMint) {
      return res.status(500).json({ error: 'Token mint not configured' });
    }

    // Transfer tokens from house wallet back to user
    const transferResult = await transferToUser(walletAddress, claimableAmount, tokenMint);
    
    if (!transferResult.success) {
      console.error('[VESTING] Failed to transfer tokens back to user:', transferResult.error);
      return res.status(500).json({ 
        error: 'Failed to transfer tokens: ' + (transferResult.error || 'Transfer failed'),
        details: transferResult.error
      });
    }

    console.log('[VESTING] Tokens claimed, tx:', transferResult.signature);

    // Update vesting schedule
    schedule.claimedAmount += claimableAmount;
    
    if (schedule.claimedAmount >= schedule.amount) {
      schedule.status = 'completed';
    }

    vestingSchedules.set(vestingId, schedule);
    saveVestingSchedules();

    console.log('[VESTING] Claimed', claimableAmount, 'tokens from', vestingId, 'for', walletAddress);

    // Invalidate balance cache
    invalidateCache(walletAddress);

    res.json({
      success: true,
      claimedAmount: claimableAmount,
      totalClaimed: schedule.claimedAmount,
      remainingVested: schedule.amount - schedule.claimedAmount,
      txSignature: transferResult.signature,
      status: schedule.status
    });
  } catch (error: any) {
    console.error('[VESTING] Error claiming vested tokens:', error);
    res.status(500).json({ 
      error: 'Failed to claim vested tokens',
      details: error.message 
    });
  }
});

/**
 * GET /api/vesting/schedule/:vestingId
 * Get a specific vesting schedule
 */
router.get('/schedule/:vestingId', async (req: Request, res: Response) => {
  const { vestingId } = req.params;

  try {
    const schedule = vestingSchedules.get(vestingId);
    
    if (!schedule) {
      return res.status(404).json({ error: 'Vesting schedule not found' });
    }

    const vestedAmount = calculateVestedAmount(schedule);
    const claimableAmount = vestedAmount - schedule.claimedAmount;

    res.json({
      success: true,
      schedule: {
        ...schedule,
        vestedAmount,
        claimableAmount,
        progress: (vestedAmount / schedule.amount) * 100
      }
    });
  } catch (error: any) {
    console.error('[VESTING] Error fetching schedule:', error);
    res.status(500).json({ error: 'Failed to fetch vesting schedule' });
  }
});

/**
 * GET /api/vesting/stats
 * Get overall vesting statistics
 */
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    let totalLocked = 0;
    let totalVested = 0;
    let activeSchedules = 0;
    let completedSchedules = 0;

    vestingSchedules.forEach((schedule) => {
      totalLocked += schedule.amount;
      totalVested += calculateVestedAmount(schedule);
      
      if (schedule.status === 'active') {
        activeSchedules++;
      } else if (schedule.status === 'completed') {
        completedSchedules++;
      }
    });

    res.json({
      success: true,
      stats: {
        totalLocked,
        totalVested,
        activeSchedules,
        completedSchedules,
        totalSchedules: vestingSchedules.size
      }
    });
  } catch (error: any) {
    console.error('[VESTING] Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch vesting statistics' });
  }
});

export default router;
