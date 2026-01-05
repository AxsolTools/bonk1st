"use client"

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Trophy, Medal, Award } from 'lucide-react';
import axios from 'axios';

interface LeaderboardEntry {
  rank: number;
  walletAddress: string;
  totalWagered: string;
  totalProfit: string;
  winRate: number;
  gamesPlayed: number;
}

const Leaderboard: React.FC = () => {
  const [leaders, setLeaders] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [timeframe, setTimeframe] = useState<'daily' | 'weekly' | 'alltime'>('daily');

  const fetchLeaderboard = async () => {
    try {
      const response = await axios.get(`/api/dice/leaderboard?timeframe=${timeframe}&limit=10`);
      if (response.data.success) {
        setLeaders(response.data.leaderboard || []);
      }
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      // Use placeholder data if API fails
      setLeaders([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard();
    const interval = setInterval(fetchLeaderboard, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, [timeframe]);

  const formatAddress = (address: string) => `${address.slice(0, 4)}...${address.slice(-4)}`;
  
  const formatAmount = (amount: string) => {
    const num = parseFloat(amount);
    if (Math.abs(num) >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (Math.abs(num) >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toFixed(0);
  };

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Trophy className="h-4 w-4 text-yellow-500" />;
      case 2:
        return <Medal className="h-4 w-4 text-gray-400" />;
      case 3:
        return <Award className="h-4 w-4 text-amber-600" />;
      default:
        return <span className="text-xs text-[var(--text-muted)] w-4 text-center">{rank}</span>;
    }
  };

  return (
    <Card className="bg-[var(--bg-secondary)] border-[var(--border-subtle)]">
      <CardHeader className="pb-2 px-4 py-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
            <Trophy className="h-4 w-4 text-yellow-500" />
            Leaderboard
          </CardTitle>
          <div className="flex gap-1">
            {(['daily', 'weekly', 'alltime'] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-2 py-0.5 text-[10px] rounded ${
                  timeframe === tf
                    ? 'bg-[var(--aqua-primary)] text-white'
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                {tf === 'alltime' ? 'All' : tf.charAt(0).toUpperCase() + tf.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-2 pb-2">
        <div className="space-y-1">
          {isLoading ? (
            <div className="text-center py-6 text-[var(--text-muted)] text-sm">
              Loading...
            </div>
          ) : leaders.length === 0 ? (
            <div className="text-center py-6 text-[var(--text-muted)] text-sm">
              No data yet
            </div>
          ) : (
            leaders.map((entry) => (
              <div
                key={entry.walletAddress}
                className="flex items-center justify-between px-2 py-1.5 rounded-md bg-[var(--bg-tertiary)]/50 text-xs"
              >
                <div className="flex items-center gap-2">
                  {getRankIcon(entry.rank)}
                  <span className="font-mono text-[var(--text-secondary)]">
                    {formatAddress(entry.walletAddress)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[var(--text-muted)]">
                    {entry.gamesPlayed} games
                  </span>
                  <span className={parseFloat(entry.totalProfit) >= 0 ? 'text-green-500' : 'text-red-500'}>
                    {parseFloat(entry.totalProfit) >= 0 ? '+' : ''}{formatAmount(entry.totalProfit)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default Leaderboard;

