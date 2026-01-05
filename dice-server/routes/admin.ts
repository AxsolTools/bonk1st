/**
 * Admin API Routes for Wallet Service Management
 */

import express from 'express';
import { isAdmin } from '../middleware/auth';
import { walletService, WalletRole } from '../utils/walletService';
import { storage } from '../storage';

const router = express.Router();

// Middleware to ensure the wallet service is initialized
const ensureWalletServiceInitialized = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!walletService.isInitialized()) {
    return res.status(503).json({ error: 'Wallet service not initialized' });
  }
  next();
};

/**
 * POST /api/admin/wallet/initialize
 * Initialize the wallet service with a master password
 */
router.post('/wallet/initialize', isAdmin, async (req, res) => {
  try {
    const { masterPassword } = req.body;
    
    if (!masterPassword) {
      return res.status(400).json({ error: 'Master password is required' });
    }
    
    const initialized = await walletService.initialize();
    
    if (initialized) {
      return res.json({ success: true, message: 'Wallet service initialized successfully' });
    } else {
      return res.status(500).json({ error: 'Failed to initialize wallet service' });
    }
  } catch (error: any) {
    console.error('Error initializing wallet service:', error);
    return res.status(500).json({ error: error.message || 'An error occurred during initialization' });
  }
});

/**
 * POST /api/admin/wallet/register
 * Register a new wallet with the service
 */
router.post('/wallet/register', isAdmin, ensureWalletServiceInitialized, async (req, res) => {
  try {
    const { role, address, seed, meta } = req.body;
    
    if (!role || !address || !seed) {
      return res.status(400).json({ error: 'Role, address, and seed are required' });
    }
    
    // Validate role
    if (!Object.values(WalletRole).includes(role)) {
      return res.status(400).json({ 
        error: `Invalid role. Must be one of: ${Object.values(WalletRole).join(', ')}` 
      });
    }
    
    const result = await walletService.registerWallet({
      role: role as WalletRole,
      address,
      seed,
      meta
    });
    
    if (result) {
      return res.json({ success: true, message: `${role} wallet registered successfully` });
    } else {
      return res.status(500).json({ error: 'Failed to register wallet' });
    }
  } catch (error: any) {
    console.error('Error registering wallet:', error);
    return res.status(500).json({ error: error.message || 'An error occurred during registration' });
  }
});

/**
 * GET /api/admin/wallet/balances
 * Get all wallet balances
 */
router.get('/wallet/balances', isAdmin, ensureWalletServiceInitialized, async (req, res) => {
  try {
    const balances = await walletService.checkWalletBalances();
    return res.json(balances);
  } catch (error: any) {
    console.error('Error checking wallet balances:', error);
    return res.status(500).json({ error: error.message || 'Failed to check wallet balances' });
  }
});

/**
 * GET /api/admin/config
 * Returns the system configuration
 */
router.get('/config', isAdmin, async (req, res) => {
  try {
    // Get wallet address from the request
    const walletAddress = 
      req.headers['x-wallet-address'] || 
      req.query.walletAddress || 
      (req.body && req.body.walletAddress);
      
    console.log('Admin requesting configuration with wallet:', walletAddress);
    
    // Use storage if available, otherwise return mock data
    let systemConfig = await storage.getSystemConfig();
    
    if (!systemConfig) {
      // Create config from environment variables
      systemConfig = {
        id: 1,
        feeWalletAddress: process.env.FEE_WALLET_ADDRESS || "",
        feeAmount: process.env.FEE_AMOUNT || "25",
        minLockDuration: parseInt(process.env.MIN_LOCK_DURATION || "1"),
        maxLockDuration: parseInt(process.env.MAX_LOCK_DURATION || "3650"),
        hookVersion: "solana_locker_v1",
        hookNamespace: "locked_token_locker",
        adminEmail: process.env.ADMIN_EMAIL || "",
        maintenanceMode: false,
        lastUpdated: new Date(),
        updatedBy: null,
        additionalSettings: {},
        diceGameConfig: {
          enabled: process.env.DICE_ENABLED !== 'false',
          houseWalletAddress: "", // Derived from HOUSE_WALLET_SECRET at runtime
          maxBetAmount: process.env.MAX_BET_AMOUNT || "10000",
          minBetAmount: process.env.MIN_BET_AMOUNT || "1",
          houseEdge: parseFloat(process.env.HOUSE_EDGE || "1.5"),
          bankrollAmount: process.env.BANKROLL_AMOUNT || "100000",
          payoutEnabled: true,
          decimalPlaces: 2,
          maxProfit: process.env.MAX_PROFIT || "5000",
          hotWalletThreshold: process.env.HOT_WALLET_THRESHOLD || "10000",
          lastUpdated: new Date()
        }
      };
    }
    
    return res.status(200).json({ 
      success: true,
      config: systemConfig
    });
  } catch (error: any) {
    console.error('Error getting system config:', error);
    return res.status(500).json({ error: error.message || 'Failed to get system configuration' });
  }
});

/**
 * GET /api/admin/users
 * Returns a list of system users
 */
router.get('/users', isAdmin, async (req, res) => {
  try {
    // Get wallet address from the request
    const walletAddress = 
      req.headers['x-wallet-address'] || 
      req.query.walletAddress || 
      (req.body && req.body.walletAddress);
      
    console.log('Admin requesting users with wallet:', walletAddress);
    
    // Retrieve all users from storage
    const allUsers = await storage.getAllUsers();
    
    // Sort users by date created (newest first)
    const sortedUsers = allUsers.sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateB - dateA;
    });
    
    // Format dates and ensure consistent response structure
    const formattedUsers = sortedUsers.map(user => ({
      id: user.id,
      walletAddress: user.walletAddress,
      username: user.username || `user_${user.walletAddress.substring(1, 6)}`,
      isAdmin: user.isAdmin || false,
      createdAt: user.createdAt || new Date().toISOString(),
      lastLogin: user.lastLogin || null
    }));
    
    console.log(`Returning ${formattedUsers.length} users from database`);
    
    return res.status(200).json({ 
      success: true,
      users: formattedUsers
    });
  } catch (error: any) {
    console.error('Error getting users:', error);
    return res.status(500).json({ error: error.message || 'Failed to get users' });
  }
});

/**
 * POST /api/admin/dice-config
 * Update dice game configuration
 */
router.post('/dice-config', isAdmin, async (req, res) => {
  try {
    console.log('Updating dice game config:', req.body);
    
    const { 
      enabled, 
      houseWalletAddress, 
      maxBetAmount, 
      minBetAmount, 
      houseEdge, 
      bankrollAmount,
      payoutEnabled,
      decimalPlaces,
      maxProfit,
      hotWalletThreshold,
      updatedBy
    } = req.body;
    
    // Validate the required fields
    if (houseWalletAddress === undefined) {
      return res.status(400).json({ error: 'House wallet address is required' });
    }
    
    // Get the current system config
    const systemConfig = await storage.getSystemConfig();
    if (!systemConfig) {
      return res.status(404).json({ error: 'System configuration not found' });
    }
    
    // Update the dice game configuration
    systemConfig.diceGameConfig = {
      ...systemConfig.diceGameConfig,
      enabled: Boolean(enabled),
      houseWalletAddress,
      maxBetAmount: String(maxBetAmount),
      minBetAmount: String(minBetAmount),
      houseEdge: Number(houseEdge),
      bankrollAmount: String(bankrollAmount),
      payoutEnabled: Boolean(payoutEnabled),
      decimalPlaces: Number(decimalPlaces),
      maxProfit: String(maxProfit),
      hotWalletThreshold: String(hotWalletThreshold),
      lastUpdated: new Date()
    };
    
    // Save the updated configuration
    await storage.updateSystemConfig(systemConfig);
    
    return res.status(200).json({ 
      success: true, 
      message: 'Dice game configuration updated successfully',
      config: systemConfig.diceGameConfig
    });
  } catch (error: any) {
    console.error('Error updating dice game config:', error);
    return res.status(500).json({ 
      error: 'Failed to update dice game configuration',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

/**
 * POST /api/admin/config
 * Update system configuration
 */
router.post('/config', isAdmin, async (req, res) => {
  try {
    console.log('Updating system config:', req.body);
    
    // Get the current system config
    let systemConfig = await storage.getSystemConfig();
    if (!systemConfig) {
      return res.status(404).json({ error: 'System configuration not found' });
    }
    
    // Extract updateable fields from request body
    const { 
      feeWalletAddress, 
      feeAmount,
      minLockDuration,
      maxLockDuration,
      hookVersion,
      hookNamespace,
      adminEmail,
      maintenanceMode,
      updatedBy
    } = req.body;
    
    // Create update object with provided fields
    const updateData: Partial<any> = {};
    
    if (feeWalletAddress !== undefined) updateData.feeWalletAddress = feeWalletAddress;
    if (feeAmount !== undefined) updateData.feeAmount = String(feeAmount);
    if (minLockDuration !== undefined) updateData.minLockDuration = Number(minLockDuration);
    if (maxLockDuration !== undefined) updateData.maxLockDuration = Number(maxLockDuration);
    if (hookVersion !== undefined) updateData.hookVersion = hookVersion;
    if (hookNamespace !== undefined) updateData.hookNamespace = hookNamespace;
    if (adminEmail !== undefined) updateData.adminEmail = adminEmail;
    if (maintenanceMode !== undefined) updateData.maintenanceMode = Boolean(maintenanceMode);
    
    // Add updated timestamp and updater
    updateData.lastUpdated = new Date();
    updateData.updatedBy = updatedBy;
    
    // Update the system config
    const updatedConfig = await storage.updateSystemConfig(updateData);
    
    return res.status(200).json({ 
      success: true, 
      message: 'System configuration updated successfully',
      config: updatedConfig
    });
  } catch (error: any) {
    console.error('Error updating system config:', error);
    return res.status(500).json({ 
      error: 'Failed to update system configuration',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

export default router; 