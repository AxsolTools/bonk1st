/**
 * Solana Utilities
 * 
 * Client-side utilities for Solana operations
 */

import { PublicKey, Connection } from '@solana/web3.js';

// Get RPC endpoint from environment or default
const getRpcEndpoint = (): string => {
  // In browser, we might use a public RPC or one provided by env
  // For production, this should be configured via NEXT_PUBLIC_SOLANA_RPC_URL
  return process.env.NEXT_PUBLIC_SOLANA_RPC_URL || process.env.NEXT_PUBLIC_HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com';
};

// Create connection
export const getConnection = (): Connection => {
  return new Connection(getRpcEndpoint(), 'confirmed');
};

// Validate Solana address
export const isValidSolanaAddress = (address: string): boolean => {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
};

// Format address for display (shortened)
export const formatAddress = (address: string, chars: number = 4): string => {
  if (!address || address.length < chars * 2 + 3) return address || '';
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
};

// Format token amount with decimals
export const formatTokenAmount = (amount: number, decimals: number = 2): string => {
  return amount.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
};

// Parse token amount from string
export const parseTokenAmount = (amount: string): number => {
  const parsed = parseFloat(amount.replace(/,/g, ''));
  return isNaN(parsed) ? 0 : parsed;
};

// Get explorer URL for a transaction
export const getExplorerUrl = (signature: string, cluster: 'mainnet' | 'devnet' = 'mainnet'): string => {
  const base = 'https://explorer.solana.com';
  return `${base}/tx/${signature}?cluster=${cluster === 'mainnet' ? 'mainnet-beta' : cluster}`;
};

// Get explorer URL for an address
export const getAddressExplorerUrl = (address: string, cluster: 'mainnet' | 'devnet' = 'mainnet'): string => {
  const base = 'https://explorer.solana.com';
  return `${base}/address/${address}?cluster=${cluster === 'mainnet' ? 'mainnet-beta' : cluster}`;
};

// Sleep utility
export const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

// Retry with exponential backoff
export const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> => {
  let lastError: Error | null = null;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      if (i < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, i);
        await sleep(delay);
      }
    }
  }
  
  throw lastError;
};

export default {
  getConnection,
  isValidSolanaAddress,
  formatAddress,
  formatTokenAmount,
  parseTokenAmount,
  getExplorerUrl,
  getAddressExplorerUrl
};

