"use client"

/**
 * Solana Wallet Context - Aqua Bridge
 * 
 * This wraps Aqua's auth system to provide the interface expected by the dice game.
 * Uses Aqua's wallet management instead of managing its own wallets.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useAuth } from '@/components/providers/auth-provider';
import axios from 'axios';

// Token balance interface
export interface TokenBalance {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  uiBalance: number;
  logoURI?: string;
}

interface WalletState {
  publicKey: string | null;
  isConnected: boolean;
  isLoading: boolean;
  hasSeenPrivateKey: boolean;
  isRegisteredWithBackend: boolean;
  tokenBalances: TokenBalance[];
  isLoadingTokens: boolean;
  tokenError: string | null;
}

interface WalletContextType extends WalletState {
  // Token operations
  fetchTokenBalances: () => Promise<void>;
  refreshTokenBalances: () => Promise<void>;
  
  // Utility
  formatAddress: (address: string, chars?: number) => string;
}

const SolanaWalletContext = createContext<WalletContextType | undefined>(undefined);

interface SolanaWalletProviderProps {
  children: ReactNode;
}

export const SolanaWalletProvider: React.FC<SolanaWalletProviderProps> = ({ children }) => {
  const { activeWallet, isAuthenticated, isLoading: authLoading } = useAuth();
  
  const [tokenBalances, setTokenBalances] = useState<TokenBalance[]>([]);
  const [isLoadingTokens, setIsLoadingTokens] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [isRegisteredWithBackend, setIsRegisteredWithBackend] = useState(false);

  const publicKey = activeWallet?.public_key || null;

  // Check wallet registration with dice backend
  useEffect(() => {
    const checkRegistration = async () => {
      if (!publicKey) {
        setIsRegisteredWithBackend(false);
        return;
      }

      try {
        const response = await axios.get(`/api/wallet/status/${publicKey}`);
        setIsRegisteredWithBackend(response.data.registered || false);
      } catch (error) {
        console.error('Error checking wallet registration:', error);
        // Assume registered if we can't check (wallet might be using Aqua's system)
        setIsRegisteredWithBackend(true);
      }
    };

    checkRegistration();
  }, [publicKey]);

  // Fetch token balances from Helius RPC
  const fetchTokenBalances = useCallback(async () => {
    if (!publicKey) return;
    
    setIsLoadingTokens(true);
    setTokenError(null);
    
    try {
      // Fetch token balances through our backend (which uses Helius RPC)
      const response = await axios.get(`/api/solana/token-balances/${publicKey}`);
      
      if (response.data.success && response.data.tokens) {
        setTokenBalances(response.data.tokens);
      } else {
        throw new Error(response.data.error || 'Failed to fetch token balances');
      }
    } catch (error: any) {
      console.error('Error fetching token balances:', error);
      setTokenBalances([]);
      setTokenError(error.message || 'Failed to fetch token balances');
    } finally {
      setIsLoadingTokens(false);
    }
  }, [publicKey]);

  // Refresh token balances (alias for fetchTokenBalances)
  const refreshTokenBalances = useCallback(async () => {
    await fetchTokenBalances();
  }, [fetchTokenBalances]);

  // Fetch token balances when wallet connects
  useEffect(() => {
    if (isAuthenticated && publicKey && !authLoading) {
      fetchTokenBalances();
    }
  }, [isAuthenticated, publicKey, authLoading, fetchTokenBalances]);

  // Format address for display
  const formatAddress = useCallback((address: string, chars: number = 4): string => {
    if (!address || address.length < chars * 2 + 3) return address;
    return `${address.slice(0, chars)}...${address.slice(-chars)}`;
  }, []);

  const value: WalletContextType = {
    publicKey,
    isConnected: isAuthenticated && !!publicKey,
    isLoading: authLoading,
    hasSeenPrivateKey: true, // Aqua manages this
    isRegisteredWithBackend,
    tokenBalances,
    isLoadingTokens,
    tokenError,
    fetchTokenBalances,
    refreshTokenBalances,
    formatAddress
  };

  return (
    <SolanaWalletContext.Provider value={value}>
      {children}
    </SolanaWalletContext.Provider>
  );
};

// Custom hook to use the wallet context
export const useSolanaWallet = (): WalletContextType => {
  const context = useContext(SolanaWalletContext);
  if (context === undefined) {
    throw new Error('useSolanaWallet must be used within a SolanaWalletProvider');
  }
  return context;
};

// Export the context for testing purposes
export { SolanaWalletContext };
