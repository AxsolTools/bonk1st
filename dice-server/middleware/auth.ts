/**
 * Authentication Middleware
 */

import { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Check if the user is authenticated
 */
export const isAuthenticated = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Get wallet address from request (could be in headers, query, or body)
    const walletAddress = 
      req.headers['x-wallet-address'] || 
      req.query.walletAddress || 
      (req.body && req.body.walletAddress);
    
    if (!walletAddress) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Check if user exists in the system
    const user = await storage.getUserByWalletAddress(walletAddress as string);
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    // Attach user to request object for use in other middleware/routes
    (req as any).user = user;
    
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(500).json({ error: 'Authentication error' });
  }
};

/**
 * Check if the user is an admin
 */
export const isAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // First check authentication
    const walletAddress = 
      req.headers['x-wallet-address'] || 
      req.query.walletAddress || 
      (req.body && req.body.walletAddress);
    
    if (!walletAddress) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Allow override from environment variable for development/testing
    const adminWalletAddress = process.env.ADMIN_WALLET_ADDRESS;
    
    // If we have admin address in env and it matches the request, allow access
    if (adminWalletAddress && walletAddress === adminWalletAddress) {
      // Find or create admin user
      let user = await storage.getUserByWalletAddress(walletAddress as string);
      
      if (!user) {
        // Create admin user if doesn't exist yet
        user = await storage.createUser({
          walletAddress: walletAddress as string,
          isAdmin: true
        });
      } else if (!user.isAdmin) {
        // Update user to be admin if not already
        user = await storage.updateUser(user.id, { isAdmin: true }) || user;
      }
      
      // Attach user to request object
      (req as any).user = user;
      
      return next();
    }
    
    // Check if user exists and is an admin
    const user = await storage.getUserByWalletAddress(walletAddress as string);
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    if (!user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    // Attach user to request object
    (req as any).user = user;
    
    next();
  } catch (error) {
    console.error('Admin authentication error:', error);
    return res.status(500).json({ error: 'Authentication error' });
  }
}; 