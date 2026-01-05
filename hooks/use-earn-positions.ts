/**
 * Hook to fetch user's Jupiter Earn positions
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/providers/auth-provider';

interface EarnPosition {
  vaultAddress: string;
  vaultSymbol: string;
  assetSymbol: string;
  sharesFormatted: number;
  underlyingAssetsFormatted: number;
  underlyingValueUsd: number;
  walletAddress: string;
}

interface EarnEarnings {
  positionAddress: string;
  vaultSymbol: string;
  assetSymbol: string;
  earnedAmountFormatted: number;
  earnedValueUsd: number;
  walletAddress: string;
}

interface UseEarnPositionsReturn {
  positions: EarnPosition[];
  earnings: EarnEarnings[];
  totalValueUsd: number;
  totalEarnedUsd: number;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useEarnPositions(): UseEarnPositionsReturn {
  const { sessionId, isAuthenticated } = useAuth();
  const [positions, setPositions] = useState<EarnPosition[]>([]);
  const [earnings, setEarnings] = useState<EarnEarnings[]>([]);
  const [totalValueUsd, setTotalValueUsd] = useState(0);
  const [totalEarnedUsd, setTotalEarnedUsd] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPositions = useCallback(async () => {
    if (!sessionId || !isAuthenticated) {
      setPositions([]);
      setEarnings([]);
      setTotalValueUsd(0);
      setTotalEarnedUsd(0);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Fetch positions
      const positionsResponse = await fetch('/api/earn/positions', {
        headers: {
          'x-session-id': sessionId,
        },
      });

      if (positionsResponse.ok) {
        const positionsData = await positionsResponse.json();
        if (positionsData.success) {
          setPositions(positionsData.data.positions || []);
          setTotalValueUsd(positionsData.data.totalValueUsd || 0);
        }
      }

      // Fetch earnings
      const earningsResponse = await fetch('/api/earn/earnings', {
        headers: {
          'x-session-id': sessionId,
        },
      });

      if (earningsResponse.ok) {
        const earningsData = await earningsResponse.json();
        if (earningsData.success) {
          setEarnings(earningsData.data.earnings || []);
          setTotalEarnedUsd(earningsData.data.totalEarnedUsd || 0);
        }
      }
    } catch (err) {
      console.error('[useEarnPositions] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch earn data');
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, isAuthenticated]);

  // Initial fetch
  useEffect(() => {
    fetchPositions();
  }, [fetchPositions]);

  // Refresh periodically
  useEffect(() => {
    if (!isAuthenticated) return;

    const interval = setInterval(fetchPositions, 30000); // Every 30 seconds
    return () => clearInterval(interval);
  }, [isAuthenticated, fetchPositions]);

  return {
    positions,
    earnings,
    totalValueUsd,
    totalEarnedUsd,
    isLoading,
    error,
    refresh: fetchPositions,
  };
}

