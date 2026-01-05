import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { insertUserSchema, insertLockedTokenSchema, insertTransactionSchema, insertSystemConfigSchema } from "./shared/schema.js";
import diceGameRoutes from "./routes/diceGame";
import { Router } from "express";
import adminWalletRoutes from './routes/admin';
import tokenRoutes from './routes/tokens';
import path from 'path';

const router = Router();

/**
 * Register all the routes for the server
 */
export async function registerRoutes(app: Express): Promise<Server> {
  /**
   * Basic health route
   */
  app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  /**
   * Verification page route to handle rendering the verification data
   * This is used for the provably fair dice game verification
   */
  app.get('/verify', (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  });
  
  // Register dice game routes
  app.use('/api', diceGameRoutes);
  
  // Register admin routes
  app.use('/api/admin', adminWalletRoutes);
  
  // Register token routes
  app.use('/api', tokenRoutes);

  /**
   * User authentication and profile endpoints
   */
  
  // Simple server-side wallet connection
  router.post('/auth/connect', async (req: Request, res: Response) => {
    try {
      const { walletAddress, signature, message } = req.body;

      if (!walletAddress) {
        return res.status(400).json({ error: 'Wallet address is required' });
      }

      // Validate Solana address format (base58, 32-44 characters)
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)) {
        return res.status(400).json({ error: 'Invalid Solana wallet address format' });
      }

      // Check if user exists
      let user = await storage.getUserByWalletAddress(walletAddress);
      
      if (!user) {
        // Create new user
        user = await storage.createUser({
          walletAddress,
          isAdmin: false,
          username: `user_${walletAddress.slice(0, 8)}`,
        });
        console.log(`Created new user for wallet: ${walletAddress}`);
      } else {
        // Update last login
        await storage.updateUser(user.id, {
          lastLogin: new Date()
        });
      }

      // Initialize user balance if not exists
      // await storage.initializeUserBalance(user.id);

      return res.json({
        success: true,
        user: {
          id: user.id,
          walletAddress: user.walletAddress,
          username: user.username,
          isAdmin: user.isAdmin
        }
      });
    } catch (error: any) {
      console.error('Error connecting wallet:', error);
      return res.status(500).json({ error: 'Failed to connect wallet' });
    }
  });

  // Get user profile
  router.get('/user/profile', async (req: Request, res: Response) => {
    try {
      const walletAddress = req.query.walletAddress as string;
      
      if (!walletAddress) {
        return res.status(400).json({ error: 'Wallet address is required' });
      }

      const user = await storage.getUserByWalletAddress(walletAddress);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const balance = await storage.getBalance(user.walletAddress);

      return res.json({
        user: {
          id: user.id,
          walletAddress: user.walletAddress,
          username: user.username,
          isAdmin: user.isAdmin,
          createdAt: user.createdAt
        },
        balance
      });
    } catch (error: any) {
      console.error('Error getting user profile:', error);
      return res.status(500).json({ error: 'Failed to get user profile' });
    }
  });

  /**
   * Token locking endpoints
   */

  // Get locked tokens for a user
  router.get('/tokens/locked', async (req: Request, res: Response) => {
    try {
      const walletAddress = req.query.walletAddress as string;
      
      if (!walletAddress) {
        return res.status(400).json({ error: 'Wallet address is required' });
      }

      const user = await storage.getUserByWalletAddress(walletAddress);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const lockedToken = await storage.getLockedToken(user.id);

      return res.json({
        lockedTokens: lockedToken ? [lockedToken] : [],
        count: lockedToken ? 1 : 0
      });
    } catch (error: any) {
      console.error('Error getting locked tokens:', error);
      return res.status(500).json({ error: 'Failed to get locked tokens' });
    }
  });

  // Get all locked tokens (admin)
  router.get('/tokens/all-locked', async (req: Request, res: Response) => {
    try {
      const walletAddress = req.query.walletAddress as string;
      
      // Verify admin (optional check)
      if (walletAddress) {
        const user = await storage.getUserByWalletAddress(walletAddress);
        if (!user?.isAdmin) {
          // Allow access but could restrict in production
        }
      }

      const allTokens = await storage.getAllLockedTokens();

      return res.json({
        lockedTokens: allTokens,
        count: allTokens.length
      });
    } catch (error: any) {
      console.error('Error getting all locked tokens:', error);
      return res.status(500).json({ error: 'Failed to get locked tokens' });
    }
  });

  /**
   * Transaction history endpoints
   */

  // Get user transactions
  router.get('/transactions', async (req: Request, res: Response) => {
    try {
      const walletAddress = req.query.walletAddress as string;
      const userId = req.query.userId as string;
      
      let user;
      if (walletAddress) {
        user = await storage.getUserByWalletAddress(walletAddress);
      } else if (userId) {
        user = await storage.getUser(parseInt(userId));
      }
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const transaction = await storage.getTransaction(user.id);

      return res.json({
        transactions: transaction ? [transaction] : [],
        count: transaction ? 1 : 0
      });
    } catch (error: any) {
      console.error('Error getting transactions:', error);
      return res.status(500).json({ error: 'Failed to get transactions' });
    }
  });

  /**
   * Platform statistics endpoints
   */

  // Get platform stats
  router.get('/stats', async (req: Request, res: Response) => {
    try {
      const stats = await storage.getPlatformStats();
      
      return res.json({
        stats: stats || {
          totalLockedTokens: '0',
          activeLockers: 0,
          avgLockDuration: 0,
          tokensReleased: '0',
          totalFeeCollected: '0'
        }
      });
    } catch (error: any) {
      console.error('Error getting stats:', error);
      return res.status(500).json({ error: 'Failed to get stats' });
    }
  });

  // Register the router
  app.use('/api', router);

  // Create HTTP server
  const httpServer = createServer(app);
  return httpServer;
}

export default router;
