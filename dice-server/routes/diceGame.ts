/**
 * Dice Game Routes - Direct On-Chain Betting
 * 
 * This module implements a provably fair dice game with direct on-chain token transfers.
 * No deposit system - users bet directly from their wallet.
 * 
 * Key features:
 * 1. Real-time balance checking from blockchain
 * 2. Instant on-chain transfers: User -> House (loss) or House -> User (win)
 * 3. Rate limiting and abuse prevention
 * 4. Server-side transaction signing using stored user keys
 * 
 * Fairness system:
 * 1. Server seed is generated and hashed before the bet
 * 2. Client seed is provided by the player
 * 3. Combined seeds determine the roll result
 * 4. Original server seed is revealed after roll for verification
 */

import express from 'express';
import crypto from 'crypto';
import { storage } from '../storage';
import { WebSocket, WebSocketServer } from 'ws';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { 
  hasSufficientBalance, 
  getLockedTokenBalance, 
  invalidateCache,
  getFreshTokenBalance 
} from '../utils/balanceService';
import { 
  transferFromUser, 
  transferToUser, 
  getHouseBalance,
  householdHasSufficientBalance 
} from '../utils/transactionService';

const router = express.Router();

// Logger
const logger = {
  debug: (message: string, ...args: any[]) => console.log(`[DEBUG] ${message}`, ...args),
  info: (message: string, ...args: any[]) => console.log(`[INFO] ${message}`, ...args),
  warn: (message: string, ...args: any[]) => console.warn(`[WARN] ${message}`, ...args),
  error: (message: string, ...args: any[]) => console.error(`[ERROR] ${message}`, ...args)
};

// Token configuration from environment
const TOKEN_SYMBOL = process.env.LOCKED_TOKEN_SYMBOL || 'LOCKED';

// Rate limiting configuration
const MAX_BETS_PER_MINUTE = parseInt(process.env.MAX_BETS_PER_MINUTE || '10', 10);
const MIN_BET_INTERVAL_MS = parseInt(process.env.MIN_BET_INTERVAL_MS || '3000', 10);

// Rate limiting state
const userLastBetTime = new Map<string, number>();
const userBetsPerMinute = new Map<string, { count: number; resetTime: number }>();
const pendingBets = new Set<string>(); // Wallets with pending bets

// House liquidity reservation (prevents over-committing funds for simultaneous bets)
// Maps betId -> reserved payout amount
const houseReservedLiquidity = new Map<string, number>();

// Define interfaces
interface Bet {
  id: string;
  walletAddress: string;
  amount: string;
  target: number;
  isOver: boolean;
  multiplier: number;
  clientSeed: string;
  serverSeed: string;
  serverSeedHash: string;
  date: string;
  rolled: boolean;
  result?: number;
  resultHash?: string;
  won?: boolean;
  profit?: string;
  verified?: boolean;
  txSignature?: string;
  txError?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

// Setup data directory and file path for persisting bets
const DATA_DIR = path.join(process.cwd(), 'data');
const BETS_FILE_PATH = path.join(DATA_DIR, 'dice_bets.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize bets map - load from file if exists
let bets: Map<string, Bet> = new Map();

// Load bets from file on startup
function loadBetsFromFile() {
  try {
    if (fs.existsSync(BETS_FILE_PATH)) {
      const fileData = fs.readFileSync(BETS_FILE_PATH, 'utf8');
      const parsedData = JSON.parse(fileData);
      
      bets = new Map();
      parsedData.forEach((bet: Bet) => {
        if (bet && bet.id) {
          bets.set(bet.id, bet);
        }
      });
      
      console.log(`Loaded ${bets.size} bets from storage`);
    } else {
      console.log('No saved bets file found, starting fresh');
      bets = new Map();
    }
  } catch (error) {
    console.error('Error loading bets from file:', error);
    bets = new Map();
  }
}

// Save bets to file
function saveBetsToFile() {
  try {
    const betsArray = Array.from(bets.values());
    fs.writeFileSync(BETS_FILE_PATH, JSON.stringify(betsArray, null, 2));
  } catch (error) {
    console.error('Error saving bets to file:', error);
  }
}

// Load bets on module initialization
loadBetsFromFile();

// WebSocket server for live bets
let wss: WebSocketServer | null = null;
const connectedClients: Set<WebSocket> = new Set();

/**
 * Initialize WebSocket server for live bets
 */
export const initializeWebSocket = (server: http.Server) => {
  wss = new WebSocketServer({ 
    server,
    path: '/api/dice/live'
  });
  
  wss.on('connection', (ws: WebSocket) => {
    console.log('Client connected to dice game live feed');
    connectedClients.add(ws);
    
    ws.send(JSON.stringify({ 
      type: 'info', 
      message: 'Connected to LOCKED Dice Game live feed'
    }));
    
    // Send recent bets to newly connected client
    try {
      const recentBets = Array.from(bets.values())
        .filter(bet => bet.status === 'completed')
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 50);
      
      const historicalBets = recentBets.map(bet => ({
        id: bet.id,
        address: bet.walletAddress,
        amount: bet.amount,
        target: bet.target,
        rollType: bet.isOver ? 'over' : 'under',
        timestamp: bet.date,
        result: bet.result,
        won: bet.won,
        profit: bet.profit,
        tokenSymbol: TOKEN_SYMBOL,
        txSignature: bet.txSignature
      }));
      
      if (historicalBets.length > 0) {
        ws.send(JSON.stringify({
          type: 'historical_bets',
          bets: historicalBets
        }));
      }
    } catch (error) {
      console.error('Error sending historical bets:', error);
    }

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        if (data.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
      } catch (error) {
        console.error('Error processing client message:', error);
      }
    });
    
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 30000);
    
    ws.on('close', () => {
      console.log('Client disconnected from dice game live feed');
      connectedClients.delete(ws);
      clearInterval(pingInterval);
    });
    
    ws.on('error', (error: Error) => {
      console.error('WebSocket error:', error);
      connectedClients.delete(ws);
      clearInterval(pingInterval);
    });
  });
  
  console.log('WebSocket server initialized for dice game live feed');
};

/**
 * Broadcast message to all connected clients
 */
const broadcastToClients = (data: any) => {
  if (!connectedClients.size) return;
  
  const message = JSON.stringify(data);
  
  connectedClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
};

// Cryptographic functions for provably fair system
const generateServerSeed = () => crypto.randomBytes(32).toString('hex');
const generateBetId = () => crypto.randomBytes(16).toString('hex');

/**
 * Convert hash to a number between 0-999999.99
 */
const hexToNumber = (hash: string) => {
  const first8Chars = hash.slice(0, 8);
  const decimal = parseInt(first8Chars, 16);
  return decimal % 100000000 / 100;
};

/**
 * Calculate profit based on bet amount and multiplier
 */
const calculateProfit = (betAmount: number, multiplier: number) => {
  return betAmount * multiplier;
};

/**
 * Apply house edge to multiplier calculation
 * CRITICAL FIX: Use same formula as frontend to prevent mismatches
 * Formula: (999999 / prediction) * (1 - houseEdge/100) for "under"
 *          (999999 / (999999 - prediction)) * (1 - houseEdge/100) for "over"
 */
const applyHouseEdge = (target: number, isOver: boolean, houseEdge: number) => {
  // Calculate raw multiplier using same formula as frontend
  const rawMultiplier = isOver 
    ? (999999.99 / (999999.99 - target))
    : (999999.99 / target);
  
  // Apply house edge
  const houseEdgeFactor = (100 - houseEdge) / 100;
  return rawMultiplier * houseEdgeFactor;
};

/**
 * Check rate limiting for a user
 */
function checkRateLimit(walletAddress: string): { allowed: boolean; error?: string } {
  const now = Date.now();
  
  // Check if user has a pending bet
  if (pendingBets.has(walletAddress)) {
    return { allowed: false, error: 'Please wait for your current bet to complete' };
  }
  
  // Check minimum interval between bets
  const lastBetTime = userLastBetTime.get(walletAddress) || 0;
  if (now - lastBetTime < MIN_BET_INTERVAL_MS) {
    const waitTime = Math.ceil((MIN_BET_INTERVAL_MS - (now - lastBetTime)) / 1000);
    return { allowed: false, error: `Please wait ${waitTime} seconds before betting again` };
  }
  
  // Check bets per minute limit
  const minuteStats = userBetsPerMinute.get(walletAddress);
  if (minuteStats) {
    if (now < minuteStats.resetTime) {
      if (minuteStats.count >= MAX_BETS_PER_MINUTE) {
        const waitTime = Math.ceil((minuteStats.resetTime - now) / 1000);
        return { allowed: false, error: `Rate limit reached. Please wait ${waitTime} seconds` };
      }
    } else {
      // Reset the counter
      userBetsPerMinute.set(walletAddress, { count: 0, resetTime: now + 60000 });
    }
  } else {
    userBetsPerMinute.set(walletAddress, { count: 0, resetTime: now + 60000 });
  }
  
  return { allowed: true };
}

/**
 * Update rate limiting after a bet
 */
function updateRateLimit(walletAddress: string): void {
  const now = Date.now();
  userLastBetTime.set(walletAddress, now);
  
  const minuteStats = userBetsPerMinute.get(walletAddress);
  if (minuteStats) {
    minuteStats.count++;
  }
}

/**
 * GET /api/dice/config
 * Get dice game configuration
 */
router.get('/config', async (req, res) => {
  try {
    const defaultConfig = {
      enabled: process.env.DICE_ENABLED !== 'false',
      minBetAmount: process.env.MIN_BET_AMOUNT || "1",
      maxBetAmount: process.env.MAX_BET_AMOUNT || "10000",
      decimalPlaces: 2,
      payoutEnabled: true,
      houseEdge: parseFloat(process.env.HOUSE_EDGE || "1.5"),
      maxProfit: process.env.MAX_PROFIT || "5000",
      directBetting: true // New flag to indicate direct on-chain betting
    };
    
    try {
      const systemConfig = await storage.getSystemConfig();
      
      if (!systemConfig || !systemConfig.diceGameConfig) {
        return res.json(defaultConfig);
      }
      
      return res.json({
        enabled: systemConfig.diceGameConfig.enabled,
        minBetAmount: systemConfig.diceGameConfig.minBetAmount,
        maxBetAmount: systemConfig.diceGameConfig.maxBetAmount,
        decimalPlaces: systemConfig.diceGameConfig.decimalPlaces,
        payoutEnabled: systemConfig.diceGameConfig.payoutEnabled,
        houseEdge: systemConfig.diceGameConfig.houseEdge,
        maxProfit: systemConfig.diceGameConfig.maxProfit,
        directBetting: true
      });
    } catch (configError) {
      logger.error('Error retrieving system configuration:', configError);
      return res.json(defaultConfig);
    }
  } catch (error) {
    logger.error('Error getting dice game configuration:', error);
    return res.status(500).json({ error: 'Failed to get dice game configuration' });
  }
});

/**
 * GET /api/dice/balance/:walletAddress
 * Get user's on-chain token balance for betting
 */
router.get('/balance/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    
    if (!walletAddress || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)) {
      return res.status(400).json({ error: 'Invalid wallet address' });
    }
    
    // Get fresh balance from chain
    const balance = await getFreshTokenBalance(walletAddress);
    
    // Check if wallet is registered
    const wallet = await storage.getUserWallet(walletAddress);
    
    res.json({
      success: true,
      walletAddress,
      balance,
      currency: TOKEN_SYMBOL,
      registered: !!wallet,
      directBetting: true
    });
  } catch (error: any) {
    logger.error('Error getting balance:', error);
    res.status(500).json({ error: 'Failed to get balance' });
  }
});

/**
 * POST /api/dice/bet
 * Place a new bet with direct on-chain settlement
 */
router.post('/bet', async (req, res) => {
  try {
    const { walletAddress, betAmount, target, isOver, clientSeed } = req.body;

    // Validate inputs
    if (!walletAddress || !betAmount || !clientSeed || target === undefined || isOver === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate Solana address format
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)) {
      return res.status(400).json({ error: 'Invalid Solana wallet address' });
    }

    // Check if wallet is registered (has stored private key)
    // First check Aqua's Supabase, then fall back to local storage
    const { isWalletRegisteredInAqua } = await import('../utils/aquaWalletService');
    const storedWallet = await storage.getUserWallet(walletAddress);
    const isRegisteredInAqua = await isWalletRegisteredInAqua(walletAddress);
    
    if (!storedWallet && !isRegisteredInAqua) {
      return res.status(400).json({ 
        error: 'Wallet not registered. Please reconnect your wallet.',
        code: 'WALLET_NOT_REGISTERED'
      });
    }

    // Prevent multiple pending bets from same wallet (anti-exploit)
    if (pendingBets.has(walletAddress)) {
      return res.status(400).json({ 
        error: 'You have a pending bet. Please complete it before placing a new bet.',
        code: 'PENDING_BET_EXISTS'
      });
    }

    // Check rate limiting
    const rateLimitCheck = checkRateLimit(walletAddress);
    if (!rateLimitCheck.allowed) {
      return res.status(429).json({ error: rateLimitCheck.error });
    }

    // Get configuration
    const systemConfig = await storage.getSystemConfig();
    const config = systemConfig?.diceGameConfig || {
      enabled: true,
      minBetAmount: process.env.MIN_BET_AMOUNT || "1",
      maxBetAmount: process.env.MAX_BET_AMOUNT || "10000",
      houseEdge: parseFloat(process.env.HOUSE_EDGE || "1.5"),
      maxProfit: process.env.MAX_PROFIT || "5000"
    };

    if (!config.enabled) {
      return res.status(403).json({ error: 'Dice game is currently disabled' });
    }

    // Validate bet amount
    const minBet = parseFloat(config.minBetAmount);
    const maxBet = parseFloat(config.maxBetAmount);
    const betAmountNum = parseFloat(betAmount);

    if (isNaN(betAmountNum) || betAmountNum < minBet || betAmountNum > maxBet) {
      return res.status(400).json({ 
        error: `Bet amount must be between ${minBet} and ${maxBet} ${TOKEN_SYMBOL}` 
      });
    }

    // CRITICAL: Invalidate cache and fetch fresh balance to prevent exploits
    // This ensures user can't place multiple bets with stale balance data
    invalidateCache(walletAddress);
    
    // Check user's on-chain balance (will fetch fresh after cache invalidation)
    const { sufficient, currentBalance } = await hasSufficientBalance(walletAddress, betAmountNum);
    if (!sufficient) {
      return res.status(400).json({ 
        error: 'Insufficient balance',
        balance: currentBalance,
        required: betAmountNum
      });
    }
    
    logger.info(`Balance check for ${walletAddress}: Has ${currentBalance} ${TOKEN_SYMBOL}, needs ${betAmountNum} ${TOKEN_SYMBOL}`);

    // Validate target range
    if (target < 0 || target > 999999.99) {
      return res.status(400).json({ error: 'Target must be between 0 and 999999.99' });
    }

    // Calculate win chance and multiplier
    // CRITICAL FIX: Use target directly, not winChance percentage, to match frontend formula
    const winChance = isOver ? (999999.99 - target) / 999999.99 * 100 : target / 999999.99 * 100;
    const houseEdge = config.houseEdge || 1.5;
    const multiplier = applyHouseEdge(target, isOver, houseEdge);
    
    // Validate multiplier is reasonable (should be between 1.0 and ~100 for normal bets)
    if (multiplier < 1.0 || multiplier > 100) {
      logger.error(`[BET] Invalid multiplier calculated: ${multiplier} for target: ${target}, isOver: ${isOver}`);
      return res.status(400).json({ error: 'Invalid bet parameters. Multiplier out of range.' });
    }

    // Calculate potential profit
    const potentialProfit = calculateProfit(betAmountNum, multiplier) - betAmountNum;
    const maxProfit = parseFloat(config.maxProfit || "5000");
    const cappedProfit = Math.min(potentialProfit, maxProfit);

    // Check if house has sufficient balance for potential payout
    // INCLUDING already reserved liquidity for other pending bets
    const potentialPayout = betAmountNum + cappedProfit;
    const totalReserved = Array.from(houseReservedLiquidity.values()).reduce((sum, amt) => sum + amt, 0);
    const houseBalance = await getHouseBalance();
    const availableBalance = houseBalance - totalReserved;
    
    if (availableBalance < potentialPayout) {
      return res.status(503).json({ 
        error: 'House temporarily unable to cover this bet. Please try a smaller amount.',
        code: 'HOUSE_INSUFFICIENT_FUNDS',
        houseBalance,
        reservedLiquidity: totalReserved,
        availableBalance,
        required: potentialPayout
      });
    }

    // Mark user as having pending bet
    pendingBets.add(walletAddress);

    // Generate bet ID and server seed
    const betId = generateBetId();
    const serverSeed = generateServerSeed();
    const serverSeedHash = crypto.createHash('sha256').update(serverSeed).digest('hex');

    // Create bet record
    const bet: Bet = {
      id: betId,
      walletAddress,
      amount: betAmount,
      target,
      isOver,
      multiplier,
      clientSeed,
      serverSeed,
      serverSeedHash,
      date: new Date().toISOString(),
      rolled: false,
      status: 'pending'
    };

    bets.set(betId, bet);
    saveBetsToFile();

    // Reserve house liquidity for potential payout
    houseReservedLiquidity.set(betId, potentialPayout);
    logger.info(`Reserved ${potentialPayout} ${TOKEN_SYMBOL} for bet ${betId}. Total reserved: ${Array.from(houseReservedLiquidity.values()).reduce((sum, amt) => sum + amt, 0)}`);

    // Update rate limiting
    updateRateLimit(walletAddress);

    // Broadcast bet placement to live feed
    broadcastToClients({
      type: 'bet',
      bet: {
        id: betId,
        address: walletAddress,
        amount: betAmount,
        target,
        rollType: isOver ? 'over' : 'under',
        timestamp: bet.date,
        tokenSymbol: TOKEN_SYMBOL,
        status: 'pending'
      }
    });

    // Return bet details (don't process roll yet)
    res.json({
      success: true,
      betId,
      serverSeedHash,
      winChance,
      multiplier,
      potentialProfit: cappedProfit,
      balance: currentBalance,
      directBetting: true
    });
  } catch (error: any) {
    console.error('Error placing bet:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/dice/roll
 * Process the dice roll and execute on-chain transfer
 */
router.post('/roll', async (req, res) => {
  try {
    const { betId, walletAddress, clientSeed } = req.body;

    if (!betId || !walletAddress) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get the bet
    const bet = bets.get(betId);
    if (!bet) {
      return res.status(404).json({ error: 'Bet not found' });
    }

    // Verify bet belongs to user
    if (bet.walletAddress !== walletAddress) {
      return res.status(403).json({ error: 'Unauthorized access to bet' });
    }

    // Check if already rolled
    if (bet.rolled) {
      return res.json({
        success: true,
        betId,
        result: bet.result,
        won: bet.won,
        profit: bet.profit,
        txSignature: bet.txSignature,
        alreadyRolled: true
      });
    }

    // Verify client seed
    if (bet.clientSeed !== clientSeed) {
      return res.status(400).json({ error: 'Client seed does not match' });
    }

    // Update bet status
    bet.status = 'processing';
    bets.set(betId, bet);

    // Get config for max profit AND house edge from saved config (not just env!)
    const systemConfig = await storage.getSystemConfig();
    const diceConfig = systemConfig?.diceGameConfig || {
      maxProfit: process.env.MAX_PROFIT || "5000",
      houseEdge: parseFloat(process.env.HOUSE_EDGE || "1.5")
    };
    const maxProfit = parseFloat(diceConfig.maxProfit || process.env.MAX_PROFIT || "5000");
    // CRITICAL FIX: Read house edge from saved config, not just env var
    const configuredHouseEdge = diceConfig.houseEdge ?? parseFloat(process.env.HOUSE_EDGE || "1.5");
    
    logger.info(`[ROLL] Using config - maxProfit: ${maxProfit}, houseEdge: ${configuredHouseEdge}%`);

    // Calculate result
    const combinedSeed = clientSeed + bet.serverSeed;
    const resultHash = crypto.createHash('sha256').update(combinedSeed).digest('hex');
    const resultNumber = hexToNumber(resultHash);

    // Determine win/loss
    let won = false;
    if (bet.isOver) {
      won = resultNumber > bet.target;
    } else {
      won = resultNumber < bet.target;
    }
    
    // Log the roll result for debugging
    logger.info(`[ROLL] Result: ${resultNumber.toFixed(2)}, Target: ${bet.target}, IsOver: ${bet.isOver}, Won: ${won}`);

    // Calculate profit
    let profit = 0;
    let txSignature: string | undefined;
    let txError: string | undefined;
    const betAmountNum = parseFloat(bet.amount);

    if (won) {
      // User won - calculate profit
      // CRITICAL FIX: Recalculate multiplier to ensure house edge is applied correctly
      // Don't trust stored multiplier - recalculate from bet parameters
      const winChance = bet.isOver ? (999999.99 - bet.target) / 999999.99 * 100 : bet.target / 999999.99 * 100;
      
      // CRITICAL FIX: Use house edge from saved config, not env var!
      const houseEdge = configuredHouseEdge;
      
      // Recalculate multiplier with house edge to prevent manipulation
      // CRITICAL FIX: Use target and isOver directly, not winChance percentage
      const verifiedMultiplier = applyHouseEdge(bet.target, bet.isOver, houseEdge);
      
      // CRITICAL: Verify stored multiplier matches calculated multiplier (within 0.01 tolerance for rounding)
      const multiplierDiff = Math.abs(bet.multiplier - verifiedMultiplier);
      if (multiplierDiff > 0.01) {
        logger.error(`[ROLL] CRITICAL: Multiplier mismatch! Stored: ${bet.multiplier}, Verified: ${verifiedMultiplier}, Diff: ${multiplierDiff}`);
        logger.error(`[ROLL] Possible exploit attempt! Using verified multiplier for safety.`);
      }
      
      // Use the verified multiplier (with house edge) to prevent exploits
      // Ensure multiplier is reasonable (between 1.0 and 100.0)
      const safeMultiplier = Math.max(1.0, Math.min(100.0, verifiedMultiplier));
      
      // Log for debugging
      logger.info(`[ROLL] Multiplier check - Stored: ${bet.multiplier}, Verified: ${verifiedMultiplier}, Safe: ${safeMultiplier}, WinChance: ${winChance.toFixed(2)}%, HouseEdge: ${houseEdge}%`);
      
      const totalPayout = calculateProfit(betAmountNum, safeMultiplier);
      const rawProfit = totalPayout - betAmountNum;
      profit = Math.min(rawProfit, maxProfit);
      
      // Ensure profit is never negative
      if (profit < 0) {
        logger.error(`[ROLL] CRITICAL: Calculated negative profit! betAmount: ${betAmountNum}, multiplier: ${verifiedMultiplier}, totalPayout: ${totalPayout}`);
        profit = 0;
      }
      
      logger.info(`[ROLL] User ${walletAddress} WON! Profit: ${profit} ${TOKEN_SYMBOL} (bet: ${betAmountNum}, multiplier: ${safeMultiplier.toFixed(4)}, totalPayout: ${totalPayout.toFixed(2)})`);
      
      // CRITICAL: Verify house wallet is initialized and has sufficient balance BEFORE paying out
      const { getHouseWallet } = await import('../utils/solanaWallet');
      const houseWallet = getHouseWallet();
      if (!houseWallet) {
        logger.error(`[ROLL] CRITICAL: House wallet not initialized when trying to pay win!`);
        txError = 'House wallet not available. Please contact support.';
        bet.status = 'failed';
        bet.txError = txError;
        bets.set(betId, bet);
        saveBetsToFile();
        return res.status(500).json({ 
          error: txError,
          code: 'HOUSE_WALLET_NOT_AVAILABLE'
        });
      }
      
      // Verify house has sufficient token balance for profit payout
      const houseBalance = await getHouseBalance();
      if (houseBalance < profit) {
        logger.error(`[ROLL] CRITICAL: House insufficient balance! Has ${houseBalance}, needs ${profit}`);
        txError = `House insufficient balance. Has ${houseBalance}, needs ${profit}`;
        bet.status = 'failed';
        bet.txError = txError;
        bets.set(betId, bet);
        saveBetsToFile();
        return res.status(503).json({ 
          error: txError,
          code: 'HOUSE_INSUFFICIENT_BALANCE',
          houseBalance,
          required: profit
        });
      }
      
      // Verify house has SOL for transaction fees
      const { getConnection } = await import('../utils/solanaClient');
      const connection = await getConnection();
      const houseSolBalance = await connection.getBalance(houseWallet.publicKey);
      const requiredSol = 0.005 * 1e9; // 0.005 SOL minimum
      if (houseSolBalance < requiredSol) {
        logger.error(`[ROLL] CRITICAL: House insufficient SOL for fees! Has ${houseSolBalance / 1e9} SOL, needs 0.005 SOL`);
        txError = `House wallet needs SOL for transaction fees. Please fund the house wallet.`;
        bet.status = 'failed';
        bet.txError = txError;
        bets.set(betId, bet);
        saveBetsToFile();
        return res.status(503).json({ 
          error: txError,
          code: 'HOUSE_INSUFFICIENT_SOL',
          solBalance: houseSolBalance / 1e9,
          required: 0.005
        });
      }
      
      logger.info(`[ROLL] House wallet verified. Balance: ${houseBalance}, SOL: ${houseSolBalance / 1e9}. Calling transferToUser for ${walletAddress}, amount: ${profit}`);
      
      // Pay the profit (user never paid bet amount upfront, so we only pay profit on win)
      const transferResult = await transferToUser(walletAddress, profit);
      
      logger.info(`[ROLL] transferToUser returned: success=${transferResult.success}, signature=${transferResult.signature || 'NONE'}, error=${transferResult.error || 'NONE'}, attempts=${transferResult.attempts}`);
      
      if (transferResult.success) {
        txSignature = transferResult.signature;
        logger.info(`[ROLL] Win payout successful: ${txSignature}`);
      } else {
        txError = transferResult.error;
        logger.error(`[ROLL] CRITICAL: Win payout FAILED: ${txError}`);
        logger.error(`[ROLL] Transfer result details:`, JSON.stringify(transferResult, null, 2));
        
        // CRITICAL: If house payout fails, mark bet as failed and return error
        bet.status = 'failed';
        bet.txError = txError;
        bets.set(betId, bet);
        saveBetsToFile();
        
        // Release reserved liquidity
        const releasedAmount = houseReservedLiquidity.get(betId) || 0;
        houseReservedLiquidity.delete(betId);
        logger.info(`Released ${releasedAmount} ${TOKEN_SYMBOL} reservation (payout failed) for bet ${betId}`);
        
        return res.status(500).json({ 
          error: `Win payout failed: ${txError}`,
          code: 'PAYOUT_FAILED',
          betId,
          won: true,
          profit: profit.toString()
        });
      }
    } else {
      // User lost - transfer from user to house
      profit = -betAmountNum;
      
      logger.info(`[ROLL] User ${walletAddress} LOST. Transferring ${betAmountNum} ${TOKEN_SYMBOL} to house`);
      
      // CRITICAL: Verify wallet is still registered and has balance BEFORE attempting transfer
      // Check both Aqua Supabase and local storage
      const storedWallet = await storage.getUserWallet(walletAddress);
      const { isWalletRegisteredInAqua } = await import('../utils/aquaWalletService');
      const isRegisteredInAqua = await isWalletRegisteredInAqua(walletAddress);
      
      if (!storedWallet && !isRegisteredInAqua) {
        logger.error(`[ROLL] CRITICAL: Wallet ${walletAddress} not registered when trying to collect loss!`);
        txError = 'Wallet not registered. Please reconnect your wallet.';
        bet.status = 'failed';
        bet.txError = txError;
        bets.set(betId, bet);
        saveBetsToFile();
        return res.status(400).json({ 
          error: txError,
          code: 'WALLET_NOT_REGISTERED'
        });
      }
      
      // Verify user still has sufficient balance
      invalidateCache(walletAddress);
      const { sufficient, currentBalance } = await hasSufficientBalance(walletAddress, betAmountNum);
      if (!sufficient) {
        logger.error(`[ROLL] CRITICAL: User ${walletAddress} insufficient balance when trying to collect loss! Has ${currentBalance}, needs ${betAmountNum}`);
        txError = `Insufficient balance to pay loss. Has ${currentBalance}, needs ${betAmountNum}`;
        bet.status = 'failed';
        bet.txError = txError;
        bets.set(betId, bet);
        saveBetsToFile();
        return res.status(400).json({ 
          error: txError,
          balance: currentBalance,
          required: betAmountNum
        });
      }
      
      logger.info(`[ROLL] Wallet verified and balance confirmed. Calling transferFromUser for ${walletAddress}, amount: ${betAmountNum}`);
      
      const transferResult = await transferFromUser(walletAddress, betAmountNum);
      
      logger.info(`[ROLL] transferFromUser returned: success=${transferResult.success}, signature=${transferResult.signature || 'NONE'}, error=${transferResult.error || 'NONE'}, attempts=${transferResult.attempts}`);
      
      if (transferResult.success) {
        txSignature = transferResult.signature;
        logger.info(`[ROLL] Loss collection successful: ${txSignature}`);
      } else {
        txError = transferResult.error;
        logger.error(`[ROLL] Loss collection FAILED: ${txError}`);
        logger.error(`[ROLL] Transfer result details:`, JSON.stringify(transferResult, null, 2));
      }
    }

    // Update bet with results
    bet.rolled = true;
    bet.result = resultNumber;
    bet.won = won;
    bet.profit = won ? profit.toString() : `-${bet.amount}`;
    bet.resultHash = resultHash;
    bet.txSignature = txSignature;
    bet.status = txSignature ? 'completed' : 'failed';
    bets.set(betId, bet);
    saveBetsToFile();

    // Remove from pending bets and release reserved liquidity
    pendingBets.delete(walletAddress);
    const releasedAmount = houseReservedLiquidity.get(betId) || 0;
    houseReservedLiquidity.delete(betId);
    logger.info(`Released ${releasedAmount} ${TOKEN_SYMBOL} reservation for bet ${betId}. Total reserved: ${Array.from(houseReservedLiquidity.values()).reduce((sum, amt) => sum + amt, 0)}`);

    // Invalidate balance cache for both parties
    invalidateCache(walletAddress);

    // Get new balance
    const newBalance = await getFreshTokenBalance(walletAddress);

    // Broadcast result to live feed
    broadcastToClients({
      type: 'result',
      betId,
      address: walletAddress,
      result: resultNumber,
      target: bet.target,
      isOver: bet.isOver,
      won,
      profit: bet.profit,
      txSignature,
      tokenSymbol: TOKEN_SYMBOL
    });

    // Return results
    res.json({
      success: true,
      betId,
      clientSeed: bet.clientSeed,
      serverSeed: bet.serverSeed,
      serverSeedHash: bet.serverSeedHash,
      result: resultNumber,
      target: bet.target,
      isOver: bet.isOver,
      won,
      profit: bet.profit,
      newBalance,
      txSignature,
      txError,
      tokenSymbol: TOKEN_SYMBOL,
      directBetting: true
    });
  } catch (error: any) {
    console.error('Error processing roll:', error);
    
    // Clean up pending bet and reserved liquidity on error
    const { betId, walletAddress } = req.body;
    if (walletAddress) {
      pendingBets.delete(walletAddress);
    }
    if (betId) {
      const releasedAmount = houseReservedLiquidity.get(betId) || 0;
      houseReservedLiquidity.delete(betId);
      logger.info(`Released ${releasedAmount} ${TOKEN_SYMBOL} reservation (error cleanup) for bet ${betId}`);
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/dice/verify/:betId
 * Verify a previous roll
 */
router.get('/verify/:betId', (req, res) => {
  try {
    const { betId } = req.params;
    
    if (!betId) {
      return res.status(400).json({ error: 'Missing bet ID' });
    }
    
    const bet = bets.get(betId);
    if (!bet || !bet.rolled) {
      return res.status(404).json({ error: 'Completed bet not found' });
    }
    
    // Verify server seed hash
    const serverSeedHash = crypto.createHash('sha256').update(bet.serverSeed).digest('hex');
    const hashVerified = serverSeedHash === bet.serverSeedHash;
    
    // Re-calculate result
    const combinedSeed = bet.clientSeed + bet.serverSeed;
    const resultHash = crypto.createHash('sha256').update(combinedSeed).digest('hex');
    const resultNumber = hexToNumber(resultHash);
    const resultVerified = resultNumber === bet.result;
    
    // Verify win condition
    const winCondition = bet.isOver ? (resultNumber > bet.target) : (resultNumber < bet.target);
    const winVerified = winCondition === bet.won;
    
    bet.verified = true;
    bets.set(betId, bet);
    saveBetsToFile();
    
    res.json({
      success: true,
      betId,
      verified: hashVerified && resultVerified && winVerified,
      hashVerified,
      resultVerified,
      winVerified,
      clientSeed: bet.clientSeed,
      serverSeed: bet.serverSeed,
      serverSeedHash: bet.serverSeedHash,
      calculatedHash: serverSeedHash,
      result: bet.result,
      recalculatedResult: resultNumber,
      target: bet.target,
      isOver: bet.isOver,
      won: bet.won,
      recalculatedWin: winCondition,
      txSignature: bet.txSignature
    });
  } catch (error) {
    console.error('Error verifying roll:', error);
    res.status(500).json({ error: 'Failed to verify roll' });
  }
});

/**
 * GET /api/dice/bets/recent
 * Get recent bets for live feed
 */
router.get('/bets/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    
    const recentBets = Array.from(bets.values())
      .filter(bet => bet.rolled && bet.status === 'completed')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, limit)
      .map(bet => ({
        id: bet.id,
        walletAddress: bet.walletAddress,
        betAmount: bet.amount,
        profit: bet.profit || '0',
        won: bet.won || false,
        result: bet.result || 0,
        target: bet.target,
        isOver: bet.isOver,
        timestamp: bet.date,
        txSignature: bet.txSignature
      }));
    
    res.json({
      success: true,
      bets: recentBets
    });
  } catch (error) {
    console.error('Error getting recent bets:', error);
    res.status(500).json({ error: 'Failed to get recent bets' });
  }
});

/**
 * GET /api/dice/leaderboard
 * Get dice game leaderboard
 */
router.get('/leaderboard', async (req, res) => {
  try {
    const timeframe = req.query.timeframe as string || 'daily';
    const limit = parseInt(req.query.limit as string) || 10;
    
    const leaderboard = calculateLeaderboardFromBets(timeframe, limit);
    res.json({ 
      success: true,
      leaderboard 
    });
  } catch (error) {
    console.error('Error getting leaderboard:', error);
    res.status(500).json({ error: 'Failed to get leaderboard' });
  }
});

/**
 * Calculate leaderboard from bets
 */
function calculateLeaderboardFromBets(timeframe: string = 'daily', limit: number = 10) {
  const playerStats = new Map();
  const now = new Date();
  
  // Calculate cutoff time based on timeframe
  let cutoffTime: Date;
  switch (timeframe) {
    case 'daily':
      cutoffTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case 'weekly':
      cutoffTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'alltime':
    default:
      cutoffTime = new Date(0); // Beginning of time
      break;
  }
  
  for (const bet of bets.values()) {
    if (!bet.rolled || bet.status !== 'completed') continue;
    
    // Filter by timeframe
    const betDate = new Date(bet.date);
    if (betDate < cutoffTime) continue;
    
    const walletAddress = bet.walletAddress;
    
    if (!playerStats.has(walletAddress)) {
      playerStats.set(walletAddress, {
        walletAddress: walletAddress,
        totalProfit: 0,
        totalWagered: 0,
        wins: 0,
        gamesPlayed: 0
      });
    }
    
    const stats = playerStats.get(walletAddress);
    stats.gamesPlayed++;
    
    const amountValue = parseFloat(bet.amount);
    if (!isNaN(amountValue)) {
      stats.totalWagered += amountValue;
    }
    
    if (bet.won) {
      stats.wins++;
      const profitValue = parseFloat(bet.profit || '0');
      if (!isNaN(profitValue)) {
        stats.totalProfit += profitValue;
      }
    } else {
      if (!isNaN(amountValue)) {
        stats.totalProfit -= amountValue;
      }
    }
  }
  
  const result = Array.from(playerStats.values()).map((player, index) => {
    const winRate = player.gamesPlayed > 0 
      ? (player.wins / player.gamesPlayed) * 100
      : 0;
      
    return {
      rank: index + 1,
      walletAddress: player.walletAddress,
      totalWagered: player.totalWagered.toFixed(2),
      totalProfit: player.totalProfit.toFixed(2),
      winRate: winRate,
      gamesPlayed: player.gamesPlayed
    };
  });
  
  // Sort by profit (descending)
  result.sort((a, b) => parseFloat(b.totalProfit) - parseFloat(a.totalProfit));
  
  // Assign proper ranks after sorting
  result.forEach((entry, index) => {
    entry.rank = index + 1;
  });
  
  return result.slice(0, limit);
}

/**
 * GET /api/dice/verify-roll
 * Verify a roll with explicit parameters
 */
router.get('/verify-roll', (req, res) => {
  try {
    const { clientSeed, serverSeed, target, isOver } = req.query;
    
    if (!clientSeed || !serverSeed || target === undefined || isOver === undefined) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    const serverSeedHash = crypto.createHash('sha256').update(serverSeed.toString()).digest('hex');
    const combinedSeed = clientSeed.toString() + serverSeed.toString();
    const resultHash = crypto.createHash('sha256').update(combinedSeed).digest('hex');
    const resultNumber = hexToNumber(resultHash);
    
    const targetNum = parseFloat(target.toString());
    const isOverBool = isOver.toString() === 'true';
    const winCondition = isOverBool ? (resultNumber > targetNum) : (resultNumber < targetNum);
    
    res.json({
      verified: true,
      clientSeed: clientSeed.toString(),
      serverSeed: serverSeed.toString(),
      serverSeedHash,
      result: resultNumber,
      target: targetNum,
      isOver: isOverBool,
      won: winCondition
    });
  } catch (error) {
    console.error('Error verifying roll:', error);
    res.status(500).json({ error: 'Failed to verify roll' });
  }
});

/**
 * GET /api/dice/history/:walletAddress
 * Get bet history for a wallet
 */
router.get('/history/:walletAddress', (req, res) => {
  try {
    const { walletAddress } = req.params;
    const limit = parseInt(req.query.limit as string) || 20;
    
    if (!walletAddress) {
      return res.status(400).json({ error: 'Wallet address required' });
    }
    
    const userBets = Array.from(bets.values())
      .filter(bet => bet.walletAddress === walletAddress)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, limit)
      .map(bet => ({
        id: bet.id,
        amount: bet.amount,
        target: bet.target,
        isOver: bet.isOver,
        result: bet.result,
        won: bet.won,
        profit: bet.profit,
        date: bet.date,
        verified: bet.verified,
        txSignature: bet.txSignature,
        status: bet.status
      }));
    
    res.json({
      success: true,
      walletAddress,
      bets: userBets
    });
  } catch (error) {
    console.error('Error getting bet history:', error);
    res.status(500).json({ error: 'Failed to get bet history' });
  }
});

/**
 * GET /api/dice/house-balance
 * Get house wallet balance (for transparency)
 */
router.get('/house-balance', async (req, res) => {
  try {
    const balance = await getHouseBalance();
    res.json({
      success: true,
      balance,
      currency: TOKEN_SYMBOL
    });
  } catch (error) {
    console.error('Error getting house balance:', error);
    res.status(500).json({ error: 'Failed to get house balance' });
  }
});

// Cleanup function
export const cleanupBets = () => {
  saveBetsToFile();
};

export default router;
