"use client"

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, TrendingUp, TrendingDown } from 'lucide-react';
import axios from 'axios';

interface BetEntry {
  id: string;
  walletAddress: string;
  betAmount: string;
  profit: string;
  won: boolean;
  result: number;
  target: number;
  isOver: boolean;
  timestamp: string;
  txSignature?: string;
}

const LiveBets: React.FC = () => {
  const [bets, setBets] = useState<BetEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchBets = async () => {
    try {
      const response = await axios.get('/api/dice/bets/recent?limit=20');
      if (response.data.success) {
        setBets(response.data.bets || []);
      }
    } catch (error) {
      console.error('Error fetching bets:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBets();
    const interval = setInterval(fetchBets, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const formatAddress = (address: string) => `${address.slice(0, 4)}...${address.slice(-4)}`;
  
  const formatAmount = (amount: string) => {
    const num = parseFloat(amount);
    if (Math.abs(num) >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (Math.abs(num) >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toFixed(2);
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = (now.getTime() - date.getTime()) / 1000;
    
    if (diff < 60) return `${Math.floor(diff)}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <Card className="bg-[var(--bg-secondary)] border-[var(--border-subtle)] h-full">
      <CardHeader className="pb-2 px-4 py-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
          <Activity className="h-4 w-4 text-[var(--aqua-primary)]" />
          Live Bets
          <span className="ml-auto text-xs text-[var(--text-muted)] font-normal">
            {bets.length} recent
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2 pb-2">
        <div className="max-h-[400px] overflow-y-auto space-y-1 scrollbar-thin">
          {isLoading ? (
            <div className="text-center py-8 text-[var(--text-muted)] text-sm">
              Loading bets...
            </div>
          ) : bets.length === 0 ? (
            <div className="text-center py-8 text-[var(--text-muted)] text-sm">
              No bets yet. Be the first!
            </div>
          ) : (
            bets.map((bet) => (
              <div
                key={bet.id}
                className={`flex items-center justify-between px-2 py-1.5 rounded-md text-xs ${
                  bet.won 
                    ? 'bg-green-500/10 border border-green-500/20' 
                    : 'bg-red-500/10 border border-red-500/20'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {bet.won ? (
                    <TrendingUp className="h-3 w-3 text-green-500 flex-shrink-0" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-red-500 flex-shrink-0" />
                  )}
                  <span className="font-mono text-[var(--text-secondary)] truncate">
                    {formatAddress(bet.walletAddress)}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[var(--text-muted)]">
                    {formatAmount(bet.betAmount)}
                  </span>
                  <span className={bet.won ? 'text-green-500 font-medium' : 'text-red-500 font-medium'}>
                    {bet.won ? '+' : ''}{formatAmount(bet.profit)}
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

export default LiveBets;

