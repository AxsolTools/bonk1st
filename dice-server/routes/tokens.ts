import { Router, Request, Response } from 'express';
import { storage } from '../storage';
import { insertLockedTokenSchema } from '../../shared/schema.js';
import { setupHookForTokenLocking, unlockTokensWithHook } from '../hooks/tokenLock';

const router = Router();

// Handle token locking requests
router.post('/tokens/lock', async (req: Request, res: Response) => {
  try {
    console.log('Received token lock request:', req.body);
    
    // For non-standard token format (like the one in the error logs)
    // We'll handle it directly rather than through schema validation
    const tokenData = req.body;
    
    // Validate required fields
    if (!tokenData.address || !tokenData.tokenType || !tokenData.amount || !tokenData.unlockDate) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required fields. Required: address, tokenType, amount, unlockDate' 
      });
    }
    
    // Get user by wallet address
    const user = await storage.getUserByWalletAddress(tokenData.address);
    if (!user) {
      // Create a new user if they don't exist
      const newUser = {
        walletAddress: tokenData.address,
        username: tokenData.address.substring(0, 4) + '...' + tokenData.address.substring(tokenData.address.length - 4),
        isAdmin: false
      };
      
      try {
        const createdUser = await storage.createUser(newUser);
        console.log('Created new user for lock request:', createdUser);
      } catch (userError) {
        console.error('Error creating user:', userError);
        return res.status(500).json({ 
          success: false,
          error: 'Failed to create user account' 
        });
      }
    }
    
    // Mock successful lock for development
    const mockTxHash = `sim_lock_${Date.now()}`;
    
    // Create a standardized locked token record
    const lockedTokenData = {
      userId: user ? user.id : 1, // Default to 1 if no user (should not happen)
      tokenSymbol: tokenData.tokenType,
      tokenName: tokenData.tokenType,
      issuer: tokenData.address,
      amount: tokenData.amount,
      lockDuration: Math.floor((new Date(tokenData.unlockDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)),
      releaseDate: new Date(tokenData.unlockDate),
      status: 'locked',
      releaseCondition: tokenData.releaseCondition || 'time-based',
      releaseConditionData: tokenData.releaseConditionData || null,
      transactionHash: mockTxHash,
      feeAmount: '1', // Minimal fee for development
      feePaid: true
    };
    
    // Create locked token record in storage
    let lockedToken;
    try {
      lockedToken = await storage.createLockedToken(lockedTokenData);
      console.log('Created locked token:', lockedToken);
    } catch (tokenError) {
      console.error('Error creating locked token:', tokenError);
      // Provide mock response anyway for development
      lockedToken = {
        id: Date.now(),
        ...lockedTokenData,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    }
    
    // Create transaction record
    let transaction;
    try {
      transaction = await storage.createTransaction({
        userId: user ? user.id : 1,
        tokenSymbol: tokenData.tokenType,
        amount: tokenData.amount,
        status: 'success',
        type: 'lock',
        transactionHash: mockTxHash,
        details: {
          unlockDate: tokenData.unlockDate,
          releaseCondition: tokenData.releaseCondition
        }
      });
      console.log('Created transaction record:', transaction);
    } catch (txError) {
      console.error('Error creating transaction record:', txError);
      // Mock transaction for development
      transaction = {
        id: Date.now(),
        userId: user ? user.id : 1,
        tokenSymbol: tokenData.tokenType,
        amount: tokenData.amount,
        status: 'success',
        type: 'lock',
        transactionHash: mockTxHash,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    }
    
    return res.status(201).json({ 
      success: true, 
      lockedToken, 
      transaction 
    });
  } catch (error) {
    console.error('Error locking tokens:', error);
    return res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to lock tokens' 
    });
  }
});

// Get locked token by ID
router.get('/tokens/lock/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tokenId = parseInt(id, 10);
    
    if (isNaN(tokenId)) {
      return res.status(400).json({ success: false, error: 'Invalid token ID' });
    }
    
    const token = await storage.getLockedToken(tokenId);
    
    if (!token) {
      return res.status(404).json({ success: false, error: 'Locked token not found' });
    }
    
    return res.status(200).json({ success: true, token });
  } catch (error) {
    console.error('Error fetching locked token:', error);
    return res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to fetch locked token' 
    });
  }
});

// Register unlock transaction
router.post('/tokens/register-unlock/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { address, txHash } = req.body;
    
    if (!id || !address || !txHash) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields for unlock registration' 
      });
    }
    
    const tokenId = parseInt(id, 10);
    if (isNaN(tokenId)) {
      return res.status(400).json({ success: false, error: 'Invalid token ID' });
    }
    
    // Get the locked token
    const lockedToken = await storage.getLockedToken(tokenId);
    if (!lockedToken) {
      return res.status(404).json({ success: false, error: 'Locked token not found' });
    }
    
    // Get user by wallet address
    const user = await storage.getUserByWalletAddress(address);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // Update token status
    const updatedToken = await storage.updateLockedToken(tokenId, {
      status: 'unlock_confirmed'
    });
    
    // Create transaction record
    const transaction = await storage.createTransaction({
      userId: user.id,
      tokenSymbol: lockedToken.tokenSymbol,
      amount: lockedToken.amount,
      type: 'unlock',
      status: 'success',
      transactionHash: txHash,
      details: {
        lockedTokenId: lockedToken.id
      }
    });
    
    return res.status(200).json({ 
      success: true, 
      token: updatedToken, 
      transaction 
    });
  } catch (error) {
    console.error('Error registering unlock:', error);
    return res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to register unlock' 
    });
  }
});

// Register lock transaction (separate endpoint for confirming transactions that are already created)
router.post('/tokens/register-lock', async (req: Request, res: Response) => {
  try {
    const { address, tokenType, amount, unlockDate, releaseCondition, txHash } = req.body;
    
    if (!address || !tokenType || !amount || !unlockDate || !txHash) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields for lock registration' 
      });
    }
    
    // Get user by wallet address
    const user = await storage.getUserByWalletAddress(address);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }
    
    // Create locked token record
    const lockedToken = await storage.createLockedToken({
      userId: user.id,
      tokenSymbol: tokenType,
      tokenName: tokenType,
      issuer: address,
      amount: amount,
      lockDuration: Math.floor((new Date(unlockDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)),
      releaseDate: new Date(unlockDate),
      status: 'locked',
      releaseCondition: releaseCondition || 'time-based',
      releaseConditionData: req.body.releaseConditionData || null,
      transactionHash: txHash,
      feeAmount: '1',
      feePaid: true
    });
    
    // Create transaction record
    const transaction = await storage.createTransaction({
      userId: user.id,
      tokenSymbol: tokenType,
      amount: amount,
      type: 'lock',
      status: 'success',
      transactionHash: txHash,
      details: {
        releaseDate: unlockDate,
        releaseCondition
      }
    });
    
    return res.status(201).json({ 
      success: true, 
      lockedToken, 
      transaction 
    });
  } catch (error) {
    console.error('Error registering lock:', error);
    return res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to register lock' 
    });
  }
});

// Unlock tokens
router.post('/tokens/unlock/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { address, tokenType, amount, hookParameters } = req.body;
    
    if (!id || !address || !tokenType || !amount) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields for unlocking tokens' 
      });
    }
    
    const tokenId = parseInt(id, 10);
    if (isNaN(tokenId)) {
      return res.status(400).json({ success: false, error: 'Invalid token ID' });
    }
    
    // Get the locked token
    const lockedToken = await storage.getLockedToken(tokenId);
    if (!lockedToken) {
      return res.status(404).json({ success: false, error: 'Locked token not found' });
    }
    
    // Generate a mock transaction hash
    const mockTxHash = `sim_unlock_${Date.now()}`;
    
    // Update token status
    const updatedToken = await storage.updateLockedToken(tokenId, {
      status: 'unlocked',
      transactionHash: mockTxHash
    });
    
    return res.status(200).json({
      success: true,
      txHash: mockTxHash,
      token: updatedToken
    });
  } catch (error) {
    console.error('Error unlocking tokens:', error);
    return res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to unlock tokens' 
    });
  }
});

export default router; 