/**
 * Wallet Service for LOCKED
 * 
 * Simplified service for Solana-based operations.
 * Most functionality is now handled by balance-based betting in balance.ts
 * This file provides backward compatibility and utility functions.
 */

import { 
  initializeHouseWallet,
  getHouseWallet,
  getHouseWalletAddress,
  isWalletServiceReady,
  transferTokensToUser,
  verifyDeposit,
  getTokenBalance,
  getSolBalance
} from './solanaWallet';

// Wallet roles for the system
export enum WalletRole {
  HOUSE = 'house',
  FEE = 'fee'
}

export interface PayoutResult {
  success: boolean;
  signature?: string;
  error?: string;
}

/**
 * WalletService class for managing Solana wallet operations
 */
export class WalletService {
  private initialized = false;

  /**
   * Initialize the wallet service
   */
  async initialize(): Promise<boolean> {
    try {
      if (!process.env.HOUSE_WALLET_SECRET) {
        console.warn('HOUSE_WALLET_SECRET not configured, wallet service will have limited functionality');
        return false;
      }

      initializeHouseWallet();
      this.initialized = true;
      console.log('Wallet service initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize wallet service:', error);
      return false;
    }
  }

  /**
   * Check if the service is initialized
   */
  isInitialized(): boolean {
    return this.initialized && isWalletServiceReady();
  }

  /**
   * Ensure wallet service is initialized
   */
  async ensureInitialized(): Promise<boolean> {
    if (this.isInitialized()) {
      return true;
    }
    return await this.initialize();
  }

  /**
   * Get house wallet address
   */
  getHouseWalletAddress(): string | null {
    try {
      return getHouseWalletAddress();
    } catch {
      return null;
    }
  }

  /**
   * Process a payout to a user
   */
  async processPayout(
    destinationAddress: string,
    amount: string,
    memo?: string
  ): Promise<PayoutResult> {
    try {
      const isReady = await this.ensureInitialized();
      if (!isReady) {
        return {
          success: false,
          error: 'Wallet service not initialized'
        };
      }

      const amountNum = parseFloat(amount);
      if (isNaN(amountNum) || amountNum <= 0) {
        return {
          success: false,
          error: 'Invalid payout amount'
        };
      }

      const result = await transferTokensToUser(destinationAddress, amountNum, memo);
      
      return {
        success: result.success,
        signature: result.signature,
        error: result.error
      };
    } catch (error: any) {
      console.error('Error processing payout:', error);
      return {
        success: false,
        error: error.message || 'Unknown error processing payout'
      };
    }
  }

  /**
   * Verify a deposit transaction
   */
  async verifyDeposit(
    signature: string,
    expectedSender: string,
    expectedAmount: number
  ): Promise<{ valid: boolean; actualAmount?: number; error?: string }> {
    return await verifyDeposit(signature, expectedSender, expectedAmount);
  }

  /**
   * Get token balance for an address
   */
  async getTokenBalance(address: string): Promise<number> {
    return await getTokenBalance(address);
  }

  /**
   * Get SOL balance for an address
   */
  async getSolBalance(address: string): Promise<number> {
    return await getSolBalance(address);
  }

  /**
   * Register a wallet (stub for admin routes compatibility)
   */
  async registerWallet(options: { role: WalletRole; address: string; seed: string; meta?: any }): Promise<boolean> {
    // Wallet registration is handled via environment variables
    // This is a stub for admin route compatibility
    console.log(`Wallet registration requested for role: ${options.role}, address: ${options.address}`);
    return true;
  }

  /**
   * Check wallet balances (stub for admin routes compatibility)
   */
  async checkWalletBalances(): Promise<{ house: number; fee: number }> {
    try {
      const houseAddress = this.getHouseWalletAddress();
      const houseBalance = houseAddress ? await this.getTokenBalance(houseAddress) : 0;
      return {
        house: houseBalance,
        fee: 0 // Fee wallet balance not tracked separately
      };
    } catch (error) {
      console.error('Error checking wallet balances:', error);
      return { house: 0, fee: 0 };
    }
  }

  /**
   * Clean up resources
   */
  async shutdown(): Promise<void> {
    this.initialized = false;
    console.log('Wallet service shut down');
  }
}

// Export singleton instance
export const walletService = new WalletService();
