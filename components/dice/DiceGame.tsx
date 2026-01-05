"use client"

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { motion } from 'framer-motion';
import { useSolanaWallet } from './SolanaWalletContext';
import { useTokenConfig } from './useTokenConfig';
import axios from 'axios';
import { Loader, Wallet, RefreshCw, ExternalLink, AlertTriangle, CheckCircle } from 'lucide-react';
import { formatAddress, getExplorerUrl } from './solanaUtils';
import { toast } from 'sonner';

/**
 * Game configuration from server
 */
interface GameConfig {
  enabled: boolean;
  minBetAmount: string;
  maxBetAmount: string;
  decimalPlaces: number;
  payoutEnabled: boolean;
  houseEdge: number;
  maxProfit: string;
  directBetting: boolean;
}

/**
 * Game result
 */
interface GameResult {
  roll: number;
  won: boolean;
  profit: string;
  multiplier: string;
  betId?: string;
  txSignature?: string;
  verification?: {
    clientSeed: string;
    serverSeed: string;
    serverSeedHash: string;
  };
}

/**
 * DiceGame Component - Direct On-Chain Betting
 * 
 * No deposit system - bets directly from user's wallet.
 * Tokens are transferred on-chain when bet completes.
 */
const DiceGame: React.FC = () => {
  // Game state
  const [betAmount, setBetAmount] = useState<number>(10);
  const [prediction, setPrediction] = useState<number>(500000);
  const [rollType, setRollType] = useState<'under' | 'over'>('over');
  const [isRolling, setIsRolling] = useState<boolean>(false);
  const [gameResult, setGameResult] = useState<GameResult | null>(null);
  
  // Provable fairness state
  const [clientSeed, setClientSeed] = useState<string>('');
  
  // Balance state (on-chain balance)
  const [onChainBalance, setOnChainBalance] = useState<number>(0);
  const [isLoadingBalance, setIsLoadingBalance] = useState<boolean>(true);
  const [isWalletRegistered, setIsWalletRegistered] = useState<boolean>(false);
  
  // Configuration
  const [gameConfig, setGameConfig] = useState<GameConfig | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState<boolean>(true);
  
  // Wallet and token context
  const { publicKey, isConnected, isRegisteredWithBackend } = useSolanaWallet();
  const { token } = useTokenConfig();

  /**
   * Fetch game configuration
   */
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await axios.get('/api/dice/config');
        setGameConfig(response.data);
        if (response.data.minBetAmount) {
          setBetAmount(parseFloat(response.data.minBetAmount));
        }
      } catch (error) {
        console.error('Error fetching config:', error);
        // Use defaults
        setGameConfig({
        enabled: true,
        minBetAmount: "1",
        maxBetAmount: "10000",
        decimalPlaces: 2,
        payoutEnabled: true,
          houseEdge: 1.5,
          maxProfit: "5000",
          directBetting: true
        });
      } finally {
        setIsLoadingConfig(false);
      }
    };

    fetchConfig();
  }, []);

  /**
   * Fetch on-chain balance
   */
  const fetchBalance = useCallback(async () => {
    if (!publicKey) return;
    
    setIsLoadingBalance(true);
    try {
      const response = await axios.get(`/api/dice/balance/${publicKey}`);
      setOnChainBalance(response.data.balance || 0);
      setIsWalletRegistered(response.data.registered || false);
      } catch (error) {
      console.error('Error fetching balance:', error);
      } finally {
      setIsLoadingBalance(false);
      }
  }, [publicKey]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  /**
   * Generate client seed on mount
   */
  useEffect(() => {
    generateClientSeed();
  }, []);

  /**
   * Generate a new client seed
   */
  const generateClientSeed = () => {
    const seed = Math.random().toString(36).substring(2, 15) + 
                Math.random().toString(36).substring(2, 15);
    setClientSeed(seed);
  };

  /**
   * Calculate multiplier
   */
  const calculateMultiplier = () => {
    if (!gameConfig) return "0.00";
    
    const rawMultiplier = rollType === 'under' 
      ? (999999 / prediction) 
      : (999999 / (999999 - prediction));
    
    const houseEdgeFactor = (100 - gameConfig.houseEdge) / 100;
    return (rawMultiplier * houseEdgeFactor).toFixed(2);
  };

  /**
   * Calculate potential profit
   */
  const calculateProfit = () => {
    if (!gameConfig) return "0.00";
    
    const rawProfit = betAmount * parseFloat(calculateMultiplier()) - betAmount;
    const maxProfit = parseFloat(gameConfig.maxProfit || "5000");
    const cappedProfit = Math.min(rawProfit, maxProfit);
    
    return cappedProfit.toFixed(gameConfig.decimalPlaces || 2);
  };

  /**
   * Calculate win chance
   */
  const calculateWinChance = () => {
    return rollType === 'under' 
      ? ((prediction / 999999) * 100).toFixed(2)
      : (((999999 - prediction) / 999999) * 100).toFixed(2);
  };

  /**
   * Handle roll
   */
  const handleRoll = async () => {
    if (isRolling || !publicKey) return;
    
    // Check wallet registration
    if (!isWalletRegistered && !isRegisteredWithBackend) {
      toast.error("Wallet Not Registered", {
        description: "Please reconnect your wallet to enable betting",
      });
      return;
    }
    
    // Validate bet amount
    if (!gameConfig) return;
    
    const minBet = parseFloat(gameConfig.minBetAmount);
    const maxBet = parseFloat(gameConfig.maxBetAmount);
        
    if (betAmount < minBet || betAmount > maxBet) {
      toast.error("Invalid Bet", {
        description: `Bet must be between ${minBet} and ${maxBet} ${token.symbol}`,
      });
      return;
    }
        
    if (betAmount > onChainBalance) {
      toast.error("Insufficient Balance", {
        description: `You don't have enough ${token.symbol} tokens in your wallet`,
      });
      return;
    }
    
    setIsRolling(true);
    setGameResult(null);
    
    try {
      // Place bet
      const betResponse = await axios.post('/api/dice/bet', {
        walletAddress: publicKey,
            betAmount: betAmount.toString(),
            target: prediction,
            isOver: rollType === 'over',
        clientSeed
      });

      if (!betResponse.data.success) {
        throw new Error(betResponse.data.error || 'Failed to place bet');
      }

      const betId = betResponse.data.betId;

      // Roll and execute on-chain transaction
      const rollResponse = await axios.post('/api/dice/roll', {
            betId,
        walletAddress: publicKey,
            clientSeed
          });
          
      if (!rollResponse.data.success) {
        throw new Error(rollResponse.data.error || 'Failed to roll');
      }
      
      const result: GameResult = {
        roll: rollResponse.data.result,
        won: rollResponse.data.won,
        profit: rollResponse.data.profit,
        multiplier: calculateMultiplier(),
        betId: rollResponse.data.betId,
        txSignature: rollResponse.data.txSignature,
        verification: {
          clientSeed: rollResponse.data.clientSeed,
          serverSeed: rollResponse.data.serverSeed,
          serverSeedHash: rollResponse.data.serverSeedHash
        }
      };
      
      setGameResult(result);
      setOnChainBalance(rollResponse.data.newBalance);
      
      // Generate new client seed
      generateClientSeed();
            
      // Show result toast
      if (result.won) {
        toast.success("🎉 You Won!", {
          description: `+${result.profit} ${token.symbol}`,
        });
      } else {
        toast.error("😔 You Lost", {
          description: `${result.profit} ${token.symbol}`,
        });
      }
    } catch (error: any) {
      console.error('Roll error:', error);
                  
      // Handle specific error codes
      if (error.response?.data?.code === 'WALLET_NOT_REGISTERED') {
        toast.error("Wallet Not Registered", {
          description: "Please reconnect your wallet to enable betting",
        });
      } else if (error.response?.data?.code === 'HOUSE_INSUFFICIENT_FUNDS') {
        toast.error("Bet Too Large", {
          description: "House cannot cover this bet. Try a smaller amount.",
        });
      } else {
        toast.error("Error", {
          description: error.response?.data?.error || error.message || "Failed to complete bet",
        });
      }
      
      // Refresh balance
      fetchBalance();
    } finally {
      setIsRolling(false);
    }
  };

  /**
   * Verify roll
   */
  const verifyRoll = () => {
    if (gameResult?.verification) {
      const verificationUrl = `/verify?data=${encodeURIComponent(JSON.stringify(gameResult.verification))}`;
      window.open(verificationUrl, '_blank');
    }
  };

  if (!isConnected) {
    return (
      <Card className="w-full max-w-3xl mx-auto bg-card border-border">
        <CardContent className="flex flex-col items-center justify-center py-20">
          <Wallet className="h-12 w-12 text-primary mb-4" />
          <p className="text-lg text-muted-foreground">Please connect your wallet to play</p>
        </CardContent>
      </Card>
    );
  }

  if (isLoadingConfig) {
    return (
      <Card className="w-full max-w-3xl mx-auto bg-card border-border">
        <CardContent className="flex flex-col items-center justify-center py-20">
          <Loader className="h-10 w-10 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground">Loading game...</p>
        </CardContent>
      </Card>
    );
  }

  if (gameConfig && !gameConfig.enabled) {
    return (
      <Card className="w-full max-w-3xl mx-auto bg-card border-border">
        <CardContent className="flex flex-col items-center justify-center py-20">
          <p className="text-xl text-red-500 mb-2">Game Disabled</p>
          <p className="text-muted-foreground text-center">
            The dice game is currently disabled. Please check back later.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Compact Wallet Status Bar */}
      <div className="w-full max-w-3xl mx-auto px-4 py-2.5 bg-card/80 backdrop-blur border border-border rounded-lg">
        <div className="flex items-center justify-between gap-4">
          {/* Balance */}
          <div className="flex items-center gap-3">
            <Wallet className="h-4 w-4 text-primary" />
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-foreground">{onChainBalance.toFixed(4)}</span>
              <span className="text-xs text-muted-foreground">{token.symbol}</span>
            </div>
          </div>
          
          {/* Wallet Address + Status */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs">
              {isWalletRegistered || isRegisteredWithBackend ? (
                <>
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  <span className="text-green-500 hidden sm:inline">Ready</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-3 w-3 text-amber-500" />
                  <span className="text-amber-500 hidden sm:inline">Register</span>
                </>
              )}
            </div>
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {formatAddress(publicKey || '', 4)}
            </span>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={fetchBalance} disabled={isLoadingBalance}>
              <RefreshCw className={`h-3.5 w-3.5 ${isLoadingBalance ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </div>

      {/* Game Card */}
      <Card className="w-full max-w-3xl mx-auto bg-card border-border">
      <CardHeader>
          <CardTitle className="text-center text-2xl bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            {token.symbol} Dice Game
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Controls */}
          <div className="space-y-6">
            <div className="space-y-2">
                <label className="block text-sm font-medium text-muted-foreground">Bet Amount</label>
              <Input
                type="number"
                value={betAmount}
                onChange={(e) => setBetAmount(Number(e.target.value))}
                min={gameConfig ? parseFloat(gameConfig.minBetAmount) : 1}
                  max={Math.min(
                    gameConfig ? parseFloat(gameConfig.maxBetAmount) : 10000,
                    onChainBalance
                  )}
                  className="w-full bg-background/50 border-border"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Min: {gameConfig?.minBetAmount}</span>
                  <span>Available: {onChainBalance.toFixed(4)}</span>
                </div>
            </div>
            
            <div className="space-y-2">
                <label className="block text-sm font-medium text-muted-foreground">
                  Target: {prediction.toLocaleString()}
              </label>
              <Slider
                value={[prediction]}
                onValueChange={(value) => setPrediction(value[0])}
                min={1}
                max={999998}
                step={1000}
                className="w-full"
              />
            </div>
            
            <div className="space-y-2">
                <label className="block text-sm font-medium text-muted-foreground">Roll Type</label>
              <div className="flex gap-2">
                <Button
                  variant={rollType === 'under' ? 'default' : 'outline'}
                  onClick={() => setRollType('under')}
                    className={rollType === 'under' ? 'bg-primary hover:bg-primary/90' : ''}
                >
                  Roll Under
                </Button>
                <Button
                  variant={rollType === 'over' ? 'default' : 'outline'}
                  onClick={() => setRollType('over')}
                    className={rollType === 'over' ? 'bg-secondary hover:bg-secondary/90' : ''}
                >
                  Roll Over
                </Button>
              </div>
            </div>
            
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-background/50 rounded-lg p-3 border border-border">
                  <p className="text-xs text-muted-foreground">Win Chance</p>
                  <p className="text-lg font-bold text-foreground">{calculateWinChance()}%</p>
              </div>
                <div className="bg-background/50 rounded-lg p-3 border border-border">
                  <p className="text-xs text-muted-foreground">Multiplier</p>
                  <p className="text-lg font-bold text-foreground">{calculateMultiplier()}x</p>
            </div>
            </div>
            
              <div className="bg-gradient-to-r from-[var(--aqua-primary)]/20 to-transparent rounded-lg p-3 border border-[var(--aqua-primary)]/30">
                <p className="text-xs text-muted-foreground">Potential Profit</p>
                <p className="text-xl font-bold text-[var(--aqua-primary)]">
                  +{calculateProfit()} {token.symbol}
                </p>
              </div>
            
            <div className="space-y-2">
                <label className="block text-xs text-muted-foreground">Client Seed</label>
                <div className="flex gap-2">
                  <code className="flex-1 text-xs bg-background/50 p-2 rounded overflow-hidden text-ellipsis text-muted-foreground border border-border">
                {clientSeed}
                  </code>
                  <Button variant="ghost" size="sm" onClick={generateClientSeed}>
                    <RefreshCw className="h-4 w-4" />
              </Button>
                </div>
            </div>
          </div>
          
            {/* Result Area */}
          <div className="space-y-6">
            <Button
              onClick={handleRoll}
                disabled={isRolling || !gameConfig?.enabled || onChainBalance < betAmount || (!isWalletRegistered && !isRegisteredWithBackend)}
                className="w-full h-16 text-lg bg-gradient-to-r from-primary to-secondary hover:opacity-90"
            >
              {isRolling ? 'Rolling...' : 'Roll Dice'}
            </Button>
            
              {onChainBalance < betAmount && (
                <p className="text-center text-amber-500 text-sm">
                  Insufficient balance. You need more {token.symbol} tokens.
                </p>
              )}
              
              {(!isWalletRegistered && !isRegisteredWithBackend) && (
                <p className="text-center text-amber-500 text-sm">
                  Wallet not registered. Please reconnect your wallet.
                </p>
            )}
            
            {gameResult && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                  className="p-4 rounded-lg border border-border bg-background/50 space-y-4"
              >
                <div className="text-center">
                    <div className="text-sm text-muted-foreground">Roll Result</div>
                    <div className="text-5xl font-bold my-2 text-foreground">
                      {gameResult.roll.toLocaleString()}
                  </div>
                  <div className={`text-lg font-semibold ${gameResult.won ? 'text-green-500' : 'text-red-500'}`}>
                      {gameResult.won ? '🎉 YOU WON!' : '😔 YOU LOST'}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="text-muted-foreground">Target:</div>
                    <div className="text-right font-medium text-foreground">
                      {rollType === 'under' ? `< ${prediction.toLocaleString()}` : `> ${prediction.toLocaleString()}`}
                  </div>
                  
                    <div className="text-muted-foreground">Profit:</div>
                  <div className={`text-right font-medium ${parseFloat(gameResult.profit) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {parseFloat(gameResult.profit) >= 0 ? `+${gameResult.profit}` : gameResult.profit} {token.symbol}
                  </div>
                </div>
                
                  {gameResult.txSignature && (
                  <Button 
                    variant="outline" 
                    size="sm"
                      onClick={() => window.open(getExplorerUrl(gameResult.txSignature!), '_blank')}
                    className="w-full text-xs"
                  >
                      <ExternalLink className="h-3 w-3 mr-2" />
                      View Transaction
                  </Button>
                )}
                
                  {gameResult.verification && (
                <Button
                      variant="ghost" 
                      size="sm"
                      onClick={verifyRoll}
                      className="w-full text-xs"
                >
                      Verify Fairness
                </Button>
                  )}
              </motion.div>
            )}
            
            {!gameResult && !isRolling && (
                <div className="text-center text-muted-foreground italic py-10">
                Results will appear here after you roll.
              </div>
            )}
            
            {isRolling && (
                <div className="flex flex-col items-center justify-center py-10">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                    className="text-6xl mb-4"
              >
                🎲
              </motion.div>
                  <p className="text-muted-foreground">Rolling & processing transaction...</p>
          </div>
        )}
              </div>
              </div>
      </CardContent>
    </Card>
    </div>
  );
};

export default DiceGame; 
