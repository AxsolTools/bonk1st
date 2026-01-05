import express, { Request, Response, NextFunction } from "express";
// @ts-ignore
import cors from 'cors';
// @ts-ignore
import bodyParser from 'body-parser';
import routes from './routes';
import diceGameRoutes, { initializeWebSocket, cleanupBets } from './routes/diceGame';
import balanceRoutes, { loadBalances } from './routes/balance';
import vestingRoutes, { loadVestingSchedules } from './routes/vesting';
import adminRoutes from './routes/admin';
import chatRoutes from './routes/chat';
import { initializeSolanaClient } from './utils/solanaClient';
import { initializeHouseWallet, isWalletServiceReady } from './utils/solanaWallet';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { log } from './vite';
import http from 'http';
import { storage } from './storage';
import { encryptPrivateKey } from './fileStorage';
// @ts-ignore
import rateLimit from 'express-rate-limit';
import { initializeDiceGameConfig, repairDiceGameConfig } from './initDiceGame';

// ES Module compatibility - get __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
// Load from project root - check both .env and .env.local (Next.js convention)
const envPath = path.resolve(process.cwd(), '.env');
const envLocalPath = path.resolve(process.cwd(), '.env.local');
console.log('[DICE SERVER] Loading environment from:', envPath);
dotenv.config({ path: envPath });
dotenv.config({ path: envLocalPath }); // .env.local takes precedence
console.log('[DICE SERVER] HOUSE_WALLET_SECRET loaded:', process.env.HOUSE_WALLET_SECRET ? 'YES' : 'NO');
console.log('[DICE SERVER] DICE_TOKEN_SYMBOL:', process.env.NEXT_PUBLIC_DICE_TOKEN_SYMBOL || 'AQUA');

const app = express();
// Use DICE_SERVER_PORT to avoid conflict with Next.js (which uses 3000)
const PORT = process.env.DICE_SERVER_PORT || 5001;

// DigitalOcean / proxy compatibility:
// Ensure Express trusts the upstream proxy so rate limiting and IP detection work correctly.
// This prevents ERR_ERL_UNEXPECTED_X_FORWARDED_FOR from express-rate-limit.
app.set('trust proxy', 1);

// Create rate limiter for dice game
const diceGameLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again after a minute'
});

// Rate limiter for balance operations
const balanceLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute for balance operations
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many balance requests, please try again after a minute'
});

// Middleware
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-wallet-address']
}));
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: false }));

// Add CORS headers middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-wallet-address');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on("finish", () => {
    const duration = Date.now() - start;
    log(`${req.method} ${req.originalUrl} ${res.statusCode} in ${duration}ms`);
  });
  
  next();
});

// Authentication API route - connect wallet
app.post('/api/auth/connect-wallet', (req, res) => {
  console.log('📲 Wallet connection request received:', req.body);
  
  const { walletAddress } = req.body;
  
  if (!walletAddress) {
    console.log('❌ Missing wallet address in request');
    return res.status(400).json({ 
      success: false,
      message: 'Wallet address is required' 
    });
  }

  // Validate Solana address format
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid Solana wallet address format'
    });
  }

  console.log(`✅ Connecting wallet: ${walletAddress}`);
  
  const user = {
    id: 1,
    walletAddress,
    username: `user_${walletAddress.slice(0, 6)}`,
    isAdmin: false,
    createdAt: new Date().toISOString(),
    lastLogin: new Date().toISOString()
  };
  
  console.log(`🔐 User authenticated: ${user.username} (${user.walletAddress})`);
  
  return res.status(200).json(user);
});

// Wallet registration API - stores encrypted private key for server-side transaction signing
app.post('/api/wallet/register', async (req, res) => {
  try {
    const { publicKey, privateKey } = req.body;
    
    if (!publicKey || !privateKey) {
      return res.status(400).json({ 
        success: false, 
        error: 'Public key and private key are required' 
      });
    }
    
    // Validate Solana address format
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(publicKey)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Solana wallet address format'
      });
    }
    
    // Encrypt the private key before storing
    const encryptedPrivateKey = encryptPrivateKey(privateKey);
    
    // Store the wallet
    await storage.storeUserWallet({
      walletAddress: publicKey,
      encryptedPrivateKey,
      createdAt: new Date(),
      lastUsed: new Date()
    });
    
    console.log(`🔐 Wallet registered: ${publicKey}`);
    
    return res.status(200).json({ 
      success: true,
      message: 'Wallet registered successfully'
    });
  } catch (error: any) {
    console.error('Error registering wallet:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to register wallet' 
    });
  }
});

// Check if wallet is registered
app.get('/api/wallet/status/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    
    if (!walletAddress || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)) {
      return res.status(400).json({ success: false, error: 'Invalid wallet address' });
    }
    
    const wallet = await storage.getUserWallet(walletAddress);
    
    return res.json({
      success: true,
      registered: !!wallet,
      createdAt: wallet?.createdAt?.toISOString() || null
    });
  } catch (error: any) {
    console.error('Error checking wallet status:', error);
    return res.status(500).json({ success: false, error: 'Failed to check wallet status' });
  }
});

// Stats API route
app.get('/api/stats', (req, res) => {
  res.json({
    totalLockedTokens: "12500.00",
    activeLockers: 15,
    avgLockDuration: 90,
    tokensReleased: "4000.00",
    totalFeeCollected: "350.00",
    updatedAt: new Date().toISOString()
  });
});

// Recent transactions API route
app.get('/api/transactions/recent', (req, res) => {
  const tokenSymbol = process.env.LOCKED_TOKEN_SYMBOL || 'LOCKED';
  res.json({
    success: true,
    transactions: [
      {
        id: 1,
        type: 'deposit',
        walletAddress: 'DemoWallet111111111111111111111111111111111',
        amount: '500',
        tokenType: tokenSymbol,
        timestamp: new Date().toISOString()
      }
    ]
  });
});

// Token configuration API - returns token info from environment
// Supports both legacy LOCKED_* vars and new DICE_* vars for Aqua integration
app.get('/api/token/config', (req, res) => {
  res.json({
    success: true,
    token: {
      symbol: process.env.NEXT_PUBLIC_DICE_TOKEN_SYMBOL || process.env.LOCKED_TOKEN_SYMBOL || 'AQUA',
      mint: process.env.DICE_TOKEN_MINT || process.env.LOCKED_TOKEN_MINT || null,
      decimals: parseInt(process.env.DICE_TOKEN_DECIMALS || process.env.TOKEN_DECIMALS || '9'),
      name: process.env.DICE_TOKEN_NAME || process.env.LOCKED_TOKEN_NAME || 'AQUA Token'
    }
  });
});

// Solana Token Balances API - fetches user's SPL token balances using Helius RPC
app.get('/api/solana/token-balances/:walletAddress', async (req, res) => {
  const { walletAddress } = req.params;
  
  if (!walletAddress || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)) {
    return res.status(400).json({ success: false, error: 'Invalid wallet address' });
  }
  
  const heliusApiKey = process.env.HELIUS_API_KEY;
  const heliusRpcUrl = process.env.HELIUS_RPC_URL || (heliusApiKey ? `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}` : null);
  
  if (!heliusRpcUrl) {
    return res.status(500).json({ success: false, error: 'Helius RPC not configured' });
  }
  
  try {
    // Use Helius getAssetsByOwner for comprehensive token data
    const response = await fetch(heliusRpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'get-token-balances',
        method: 'getAssetsByOwner',
        params: {
          ownerAddress: walletAddress,
          page: 1,
          limit: 100,
          displayOptions: {
            showFungible: true,
            showNativeBalance: true
          }
        }
      })
    });
    
    const data = await response.json();
    
    if (data.error) {
      console.error('Helius RPC error:', data.error);
      return res.status(500).json({ success: false, error: data.error.message || 'RPC error' });
    }
    
    // Transform the response to our token format
    const tokens: any[] = [];
    
    // Add native SOL balance if available
    if (data.result?.nativeBalance) {
      const solBalance = data.result.nativeBalance.lamports || 0;
      tokens.push({
        mint: 'So11111111111111111111111111111111111111112',
        symbol: 'SOL',
        name: 'Solana',
        decimals: 9,
        balance: solBalance.toString(),
        uiBalance: solBalance / 1e9,
        logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png'
      });
    }
    
    // Add fungible tokens
    if (data.result?.items) {
      for (const item of data.result.items) {
        if (item.interface === 'FungibleToken' || item.interface === 'FungibleAsset') {
          const tokenInfo = item.token_info || {};
          const content = item.content || {};
          const metadata = content.metadata || {};
          
          tokens.push({
            mint: item.id,
            symbol: tokenInfo.symbol || metadata.symbol || 'Unknown',
            name: metadata.name || tokenInfo.symbol || 'Unknown Token',
            decimals: tokenInfo.decimals || 9,
            balance: tokenInfo.balance || '0',
            uiBalance: tokenInfo.balance ? Number(tokenInfo.balance) / Math.pow(10, tokenInfo.decimals || 9) : 0,
            logoURI: content.links?.image || content.files?.[0]?.uri || null
          });
        }
      }
    }
    
    res.json({ success: true, tokens });
  } catch (error: any) {
    console.error('Error fetching token balances:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch token balances' });
  }
});

// API Routes
app.use('/api', routes);
console.log('API routes registered from routes.ts');

// Balance routes
app.use('/api/balance', balanceLimiter, balanceRoutes);
console.log('Balance routes registered');

// Dice game routes
app.use('/api/dice', diceGameLimiter, diceGameRoutes);
console.log('Dice game routes registered');

// Vesting routes (token locking)
app.use('/api/vesting', vestingRoutes);
console.log('Vesting routes registered');

// Admin routes
app.use('/api/admin', adminRoutes);
console.log('Admin routes registered');

// Chat routes
app.use('/api/chat', chatRoutes);
console.log('Chat routes registered');

// Create HTTP server
const server = http.createServer(app);

// Initialize WebSocket server for dice game live feed
initializeWebSocket(server);

// Initialize Solana client and services
const initializeSolana = async () => {
  try {
    console.log('🔗 Initializing Solana client...');
    await initializeSolanaClient();
    console.log('✅ Solana client initialized');

    // Initialize house wallet if configured
    if (process.env.HOUSE_WALLET_SECRET) {
      try {
        const houseWallet = initializeHouseWallet();
        console.log(`✅ House wallet initialized: ${houseWallet.publicKey.toBase58()}`);
      } catch (error) {
        console.error('⚠️ Failed to initialize house wallet:', error);
        console.error('Payouts will be disabled until house wallet is configured');
      }
    } else {
      console.warn('⚠️ HOUSE_WALLET_SECRET not set. Payouts will be disabled.');
    }

    // Load user balances from storage
    await loadBalances();
    console.log('✅ User balances loaded');

    // Load vesting schedules
    await loadVestingSchedules();
    console.log('✅ Vesting schedules loaded');
  } catch (error) {
    console.error('❌ Error initializing Solana:', error);
  }
};

// Start the server
server.listen(PORT, () => {
  log(`Server is running on port ${PORT}`);

  // Initialize Solana
  initializeSolana();

  // Initialize dice game configuration
  initializeDiceGameConfig()
    .then(() => {
      log('✅ Dice game configuration initialized');
      return repairDiceGameConfig();
    })
    .then(() => {
      log('✅ Dice game configuration verified');
    })
    .catch(err => {
      log('❌ Error initializing dice game configuration:', err);
    });

  // Initial cleanup
  cleanupBets();
});

// API status endpoint
app.get('/api-status', (req, res) => {
  const solanaReady = isWalletServiceReady();
  res.json({ 
    status: 'API is running',
    solana: solanaReady ? 'connected' : 'not configured',
    chain: 'solana-mainnet'
  });
});

// Debug endpoint for routes
app.get('/api/debug/routes', (req, res) => {
  interface RouteInfo {
    path: string;
    methods: string;
  }
  
  const registeredRoutes: RouteInfo[] = [];
  
  app._router.stack.forEach((middleware: any) => {
    if (middleware.route) {
      registeredRoutes.push({
        path: middleware.route.path,
        methods: Object.keys(middleware.route.methods).join(', ')
      });
    } else if (middleware.name === 'router') {
      middleware.handle.stack.forEach((handler: any) => {
        if (handler.route) {
          const path = handler.route.path;
          registeredRoutes.push({
            path: middleware.regexp.toString().includes('/api') 
              ? `/api${path}` 
              : path,
            methods: Object.keys(handler.route.methods).join(', ')
          });
        }
      });
    }
  });
  
  res.json({ 
    routes: registeredRoutes,
    routeCount: registeredRoutes.length
  });
});

// User profile endpoint
app.get('/api/user/profile', async (req, res) => {
  try {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, x-wallet-address');
    
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    
    const { walletAddress } = req.query;
    
    if (!walletAddress || typeof walletAddress !== 'string') {
      return res.status(400).json({ message: 'Valid wallet address is required' });
    }
    
    const user = await storage.getUserByWalletAddress(walletAddress);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    return res.status(200).json({ user });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return res.status(500).json({ message: 'Failed to fetch user profile' });
  }
});

// Serve static files in production, redirect to Vite dev server in development
if (process.env.NODE_ENV === 'production') {
  // Serve static files from the built client
  const staticPath = path.join(__dirname, 'public');
  app.use(express.static(staticPath));
  
  // Handle client-side routing - serve index.html for all non-API routes
  app.get('*', (req, res) => {
    if (!req.originalUrl.startsWith('/api')) {
      res.sendFile(path.join(staticPath, 'index.html'));
    } else {
      res.status(404).json({ error: 'API endpoint not found' });
    }
  });
} else {
  // Development: redirect to Vite dev server
  app.use('*', (req, res) => {
    if (!req.originalUrl.startsWith('/api')) {
      const redirectUrl = `http://localhost:5173${req.originalUrl}`;
      log(`Redirecting to: ${redirectUrl}`);
      return res.redirect(302, redirectUrl);
    }
    
    res.status(404).json({ error: 'API endpoint not found' });
  });
}

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Handle server shutdown gracefully
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  cleanupBets();
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('Shutting down server...');
  cleanupBets();
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});

export { app };
export default server;
