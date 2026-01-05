/**
 * Token Configuration Hook
 * 
 * Fetches token configuration from the server
 * This allows the frontend to dynamically display the correct token symbol/name
 * based on what's configured in the backend .env file
 */

import { useState, useEffect, useCallback } from 'react';

interface TokenConfig {
  symbol: string;
  mint: string | null;
  decimals: number;
  name: string;
}

interface UseTokenConfigReturn {
  token: TokenConfig;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

// Default config while loading
const DEFAULT_TOKEN: TokenConfig = {
  symbol: 'LOCKED',
  mint: null,
  decimals: 9,
  name: 'LOCKED Token'
};

// Cache the token config to avoid unnecessary refetches
// Cache is session-based (cleared on page reload) to ensure fresh config on deployment
let cachedToken: TokenConfig | null = null;

export const useTokenConfig = (): UseTokenConfigReturn => {
  const [token, setToken] = useState<TokenConfig>(cachedToken || DEFAULT_TOKEN);
  const [isLoading, setIsLoading] = useState(!cachedToken);
  const [error, setError] = useState<string | null>(null);

  const fetchTokenConfig = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/token/config');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch token config: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success && data.token) {
        const newToken: TokenConfig = {
          symbol: data.token.symbol || DEFAULT_TOKEN.symbol,
          mint: data.token.mint || null,
          decimals: data.token.decimals || DEFAULT_TOKEN.decimals,
          name: data.token.name || DEFAULT_TOKEN.name
        };
        
        // Always update cache with fresh data from environment variables
        cachedToken = newToken;
        setToken(newToken);
      } else {
        // If API doesn't return success, clear cache to force retry
        cachedToken = null;
      }
    } catch (err: any) {
      console.error('Error fetching token config:', err);
      setError(err.message || 'Failed to fetch token configuration');
      // Use default on error
      setToken(DEFAULT_TOKEN);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Always fetch to ensure we get the latest config from environment variables
    // This ensures changes to env vars are reflected immediately
    fetchTokenConfig();
  }, [fetchTokenConfig]);

  return {
    token,
    isLoading,
    error,
    refetch: fetchTokenConfig
  };
};

// Export a simple function to get the cached token symbol
export const getTokenSymbol = (): string => {
  return cachedToken?.symbol || DEFAULT_TOKEN.symbol;
};

export const getTokenName = (): string => {
  return cachedToken?.name || DEFAULT_TOKEN.name;
};

export const getTokenDecimals = (): number => {
  return cachedToken?.decimals || DEFAULT_TOKEN.decimals;
};

