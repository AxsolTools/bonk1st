"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/components/providers/auth-provider"
import { GoldCard, GoldCardHeader } from "../ui/gold-card"
import { GoldInput, GoldSlider, GoldSelect } from "../ui/gold-input"
import { GoldButton, SnipeButton } from "../ui/gold-button"
import { GoldBadge, TokenLogo, PoolBadge } from "../ui/gold-badge"
import { SNIPER_PROGRAMS } from "@/lib/1st/sniper-config"

interface SwapPanel1stProps {
  tokenMint?: string
  tokenSymbol?: string
  tokenName?: string
  tokenLogo?: string
  pool?: 'bonk-usd1' | 'bonk-sol' | 'pump' | 'raydium'
  onSuccess?: (txSignature: string) => void
  onError?: (error: string) => void
  className?: string
}

export function SwapPanel1st({
  tokenMint,
  tokenSymbol = 'TOKEN',
  tokenName = 'Unknown Token',
  tokenLogo,
  pool = 'bonk-usd1',
  onSuccess,
  onError,
  className,
}: SwapPanel1stProps) {
  const { isAuthenticated, activeWallet, sessionId, userId } = useAuth()
  
  const [mode, setMode] = React.useState<'buy' | 'sell'>('buy')
  const [amount, setAmount] = React.useState('')
  const [quoteCurrency, setQuoteCurrency] = React.useState<'SOL' | 'USD1'>(
    pool === 'bonk-usd1' ? 'USD1' : 'SOL'
  )
  const [slippage, setSlippage] = React.useState(15)
  const [isLoading, setIsLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState<string | null>(null)
  
  // Quick amount buttons
  const quickAmounts = quoteCurrency === 'USD1' 
    ? [5, 10, 25, 50, 100] 
    : [0.1, 0.25, 0.5, 1, 2]
  
  const handleTrade = async () => {
    if (!isAuthenticated || !activeWallet) {
      setError('Connect wallet to trade')
      return
    }
    
    if (!tokenMint) {
      setError('No token selected')
      return
    }
    
    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Enter a valid amount')
      return
    }
    
    setIsLoading(true)
    setError(null)
    setSuccess(null)
    
    try {
      const quoteMint = quoteCurrency === 'USD1' 
        ? SNIPER_PROGRAMS.USD1_MINT 
        : SNIPER_PROGRAMS.WSOL_MINT
      
      const response = await fetch('/api/trade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': sessionId || userId || '',
          'x-wallet-address': activeWallet.public_key,
          'x-user-id': userId || '',
        },
        body: JSON.stringify({
          action: mode,
          tokenMint,
          amount: amountNum,
          slippageBps: slippage * 100,
          pool: pool.startsWith('bonk') ? 'bonk' : 'pump',
          quoteMint,
          autoConvertUsd1: false,
        }),
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error?.message || 'Trade failed')
      }
      
      setSuccess(`${mode === 'buy' ? 'Bought' : 'Sold'} ${tokenSymbol}!`)
      setAmount('')
      onSuccess?.(data.data?.txSignature)
      
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Trade failed'
      setError(errorMsg)
      onError?.(errorMsg)
    } finally {
      setIsLoading(false)
    }
  }
  
  return (
    <GoldCard variant="elevated" className={cn("", className)}>
      <GoldCardHeader
        title="Quick Swap"
        subtitle={tokenMint ? `${tokenSymbol}` : 'Select a token'}
        action={<PoolBadge pool={pool} />}
      />
      
      {/* Token Info */}
      {tokenMint && (
        <div className="flex items-center gap-3 p-3 bg-[#0A0A0A] rounded-lg mb-4">
          <TokenLogo src={tokenLogo} symbol={tokenSymbol} size="lg" />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-white">${tokenSymbol}</p>
            <p className="text-xs text-white/50 truncate">{tokenName}</p>
            <p className="text-[10px] text-white/30 font-mono truncate">{tokenMint}</p>
          </div>
        </div>
      )}
      
      {/* Buy/Sell Toggle */}
      <div className="flex gap-1 p-1 bg-[#0A0A0A] rounded-lg mb-4">
        <button
          onClick={() => setMode('buy')}
          className={cn(
            "flex-1 py-2 text-sm font-bold uppercase rounded-md transition-all",
            mode === 'buy'
              ? "bg-[#00FF41]/20 text-[#00FF41] border border-[#00FF41]/30"
              : "text-white/50 hover:text-white"
          )}
        >
          BUY
        </button>
        <button
          onClick={() => setMode('sell')}
          className={cn(
            "flex-1 py-2 text-sm font-bold uppercase rounded-md transition-all",
            mode === 'sell'
              ? "bg-[#FF3333]/20 text-[#FF3333] border border-[#FF3333]/30"
              : "text-white/50 hover:text-white"
          )}
        >
          SELL
        </button>
      </div>
      
      {/* Quote Currency Toggle (for BONK pools) */}
      {pool.startsWith('bonk') && mode === 'buy' && (
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setQuoteCurrency('USD1')}
            className={cn(
              "flex-1 py-2 px-3 text-xs font-semibold rounded-lg border transition-all",
              quoteCurrency === 'USD1'
                ? "bg-[#D4AF37]/20 text-[#FFD700] border-[#D4AF37]/50"
                : "bg-transparent text-white/50 border-white/10 hover:border-white/30"
            )}
          >
            PAY WITH USD1
          </button>
          <button
            onClick={() => setQuoteCurrency('SOL')}
            className={cn(
              "flex-1 py-2 px-3 text-xs font-semibold rounded-lg border transition-all",
              quoteCurrency === 'SOL'
                ? "bg-[#D4AF37]/20 text-[#FFD700] border-[#D4AF37]/50"
                : "bg-transparent text-white/50 border-white/10 hover:border-white/30"
            )}
          >
            PAY WITH SOL
          </button>
        </div>
      )}
      
      {/* Amount Input */}
      <div className="space-y-3 mb-4">
        <div className="relative">
          <GoldInput
            label={mode === 'buy' ? 'You Pay' : 'You Sell'}
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            suffix={
              <span className="text-[#D4AF37] font-semibold">
                {mode === 'buy' ? quoteCurrency : tokenSymbol}
              </span>
            }
          />
        </div>
        
        {/* Quick Amount Buttons */}
        <div className="flex gap-2">
          {quickAmounts.map((amt) => (
            <button
              key={amt}
              onClick={() => setAmount(amt.toString())}
              className="flex-1 py-1.5 text-[10px] font-semibold text-white/60 hover:text-[#D4AF37] bg-[#0A0A0A] hover:bg-[#D4AF37]/10 border border-white/5 hover:border-[#D4AF37]/30 rounded transition-all"
            >
              {amt} {mode === 'buy' ? quoteCurrency : ''}
            </button>
          ))}
        </div>
      </div>
      
      {/* Slippage */}
      <div className="mb-4">
        <GoldSlider
          label="Slippage Tolerance"
          value={slippage}
          onChange={setSlippage}
          min={1}
          max={50}
          formatValue={(v) => `${v}%`}
        />
      </div>
      
      {/* Trade Button */}
      {!isAuthenticated ? (
        <GoldButton variant="secondary" className="w-full" disabled>
          CONNECT WALLET
        </GoldButton>
      ) : !tokenMint ? (
        <GoldButton variant="secondary" className="w-full" disabled>
          SELECT A TOKEN
        </GoldButton>
      ) : (
        <SnipeButton 
          className="w-full"
          onClick={handleTrade}
          loading={isLoading}
          disabled={isLoading || !amount}
        >
          {isLoading 
            ? 'EXECUTING...' 
            : mode === 'buy' 
              ? `BUY ${tokenSymbol}` 
              : `SELL ${tokenSymbol}`
          }
        </SnipeButton>
      )}
      
      {/* Status Messages */}
      {error && (
        <div className="mt-3 p-2 bg-[#FF3333]/10 border border-[#FF3333]/30 rounded-lg">
          <p className="text-xs text-[#FF3333]">{error}</p>
        </div>
      )}
      
      {success && (
        <div className="mt-3 p-2 bg-[#00FF41]/10 border border-[#00FF41]/30 rounded-lg">
          <p className="text-xs text-[#00FF41]">{success}</p>
        </div>
      )}
      
      {/* Trade Info */}
      <div className="mt-4 pt-4 border-t border-[#D4AF37]/10 space-y-2 text-xs">
        <div className="flex justify-between text-white/50">
          <span>Network Fee</span>
          <span>~0.000005 SOL</span>
        </div>
        <div className="flex justify-between text-white/50">
          <span>Platform Fee</span>
          <span>0.5%</span>
        </div>
        <div className="flex justify-between text-white/50">
          <span>Max Slippage</span>
          <span className="text-[#D4AF37]">{slippage}%</span>
        </div>
      </div>
    </GoldCard>
  )
}

// Compact swap for embedding in modals
export function CompactSwap({
  tokenMint,
  tokenSymbol,
  pool,
  onSuccess,
  className,
}: {
  tokenMint: string
  tokenSymbol: string
  pool: 'bonk-usd1' | 'bonk-sol' | 'pump' | 'raydium'
  onSuccess?: (tx: string) => void
  className?: string
}) {
  const { isAuthenticated, activeWallet, sessionId, userId } = useAuth()
  const [amount, setAmount] = React.useState('0.1')
  const [isLoading, setIsLoading] = React.useState(false)
  
  const handleQuickSnipe = async () => {
    if (!isAuthenticated || !activeWallet) return
    
    setIsLoading(true)
    try {
      const response = await fetch('/api/trade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': sessionId || userId || '',
          'x-wallet-address': activeWallet.public_key,
          'x-user-id': userId || '',
        },
        body: JSON.stringify({
          action: 'buy',
          tokenMint,
          amount: parseFloat(amount),
          slippageBps: 1500,
          pool: pool.startsWith('bonk') ? 'bonk' : 'pump',
          quoteMint: pool === 'bonk-usd1' ? SNIPER_PROGRAMS.USD1_MINT : SNIPER_PROGRAMS.WSOL_MINT,
        }),
      })
      
      const data = await response.json()
      if (response.ok) {
        onSuccess?.(data.data?.txSignature)
      }
    } catch (error) {
      console.error('Quick snipe failed:', error)
    } finally {
      setIsLoading(false)
    }
  }
  
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <GoldInput
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-24"
        suffix="SOL"
      />
      <SnipeButton 
        size="sm" 
        onClick={handleQuickSnipe}
        loading={isLoading}
        disabled={!isAuthenticated || isLoading}
      >
        SNIPE
      </SnipeButton>
    </div>
  )
}

