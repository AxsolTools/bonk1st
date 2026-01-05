"use client"

import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useAuth } from "@/components/providers/auth-provider"

interface DepositModalProps {
  isOpen: boolean
  onClose: () => void
  vault: {
    symbol: string
    asset: {
      symbol: string
      priceUsd: number
    }
    apy: number
    apyFormatted: string
    tvlFormatted: string
    address: string
  }
  propelBalance?: number
  propelMint?: string
  onSuccess?: () => void
}

export function DepositModal({ 
  isOpen, 
  onClose, 
  vault, 
  propelBalance = 0,
  propelMint,
  onSuccess 
}: DepositModalProps) {
  const { sessionId, activeWallet, wallets } = useAuth()
  const [amount, setAmount] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [quote, setQuote] = useState<{
    outputAmount: number
    intermediateAmount: string
    priceImpact: number
    estimatedApy: number
  } | null>(null)
  const [isGettingQuote, setIsGettingQuote] = useState(false)

  // Get quote when amount changes
  useEffect(() => {
    if (!amount || !propelMint || !activeWallet || parseFloat(amount) <= 0) {
      setQuote(null)
      return
    }

    const getQuote = async () => {
      setIsGettingQuote(true)
      try {
        // Convert to base units (assuming 6 decimals for PROPEL)
        const amountBase = Math.floor(parseFloat(amount) * 1e6).toString()
        
        const response = await fetch(
          `/api/earn/swap-to-earn?inputMint=${propelMint}&amount=${amountBase}&targetAsset=${vault.asset.symbol}&wallet=${activeWallet.publicKey}`,
          {
            headers: {
              'x-session-id': sessionId || '',
            },
          }
        )
        
        if (response.ok) {
          const data = await response.json()
          if (data.success) {
            setQuote({
              outputAmount: data.data.outputAmountFormatted,
              intermediateAmount: data.data.intermediateAmount,
              priceImpact: data.data.priceImpact,
              estimatedApy: data.data.estimatedApy,
            })
          }
        }
      } catch (err) {
        console.error('Quote error:', err)
      } finally {
        setIsGettingQuote(false)
      }
    }

    const debounce = setTimeout(getQuote, 500)
    return () => clearTimeout(debounce)
  }, [amount, propelMint, activeWallet, vault.asset.symbol, sessionId])

  const handleDeposit = async () => {
    if (!amount || !activeWallet || !sessionId || !propelMint) {
      setError("Please connect wallet and enter amount")
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // Convert to base units
      const amountBase = Math.floor(parseFloat(amount) * 1e6).toString()

      const response = await fetch('/api/earn/swap-to-earn', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': sessionId,
        },
        body: JSON.stringify({
          inputMint: propelMint,
          amount: amountBase,
          targetAsset: vault.asset.symbol,
          walletAddress: activeWallet.publicKey,
          slippageBps: 100, // 1%
        }),
      })

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error?.message || 'Deposit failed')
      }

      // Success!
      onSuccess?.()
      onClose()
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deposit failed')
    } finally {
      setIsLoading(false)
    }
  }

  const handleMaxClick = () => {
    setAmount(propelBalance.toString())
  }

  const estimatedValueUsd = parseFloat(amount || '0') * (quote?.outputAmount ? vault.asset.priceUsd : 0)
  const yearlyEarnings = estimatedValueUsd * (vault.apy / 100)

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md bg-[var(--bg-card)] border-[var(--border-subtle)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-[var(--text-primary)]">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--aqua-primary)] to-[var(--aqua-secondary)] flex items-center justify-center shadow-lg">
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <span>Deposit to {vault.symbol}</span>
              <p className="text-xs font-normal text-[var(--text-muted)] mt-0.5">
                Swap PROPEL → Earn {vault.apyFormatted} APY
              </p>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          {/* Input Field */}
          <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-[var(--text-muted)]">Amount (PROPEL)</span>
              <button 
                onClick={handleMaxClick}
                className="text-xs text-[var(--aqua-primary)] hover:text-[var(--aqua-secondary)] transition-colors"
              >
                Max: {propelBalance.toLocaleString()}
              </button>
            </div>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className={cn(
                "w-full bg-transparent text-2xl font-semibold text-[var(--text-primary)]",
                "placeholder:text-[var(--text-muted)]/50 focus:outline-none tabular-nums"
              )}
            />
            {estimatedValueUsd > 0 && (
              <p className="text-xs text-[var(--text-muted)] mt-1">≈ ${estimatedValueUsd.toFixed(2)} USD</p>
            )}
          </div>

          {/* Quote Info */}
          {isGettingQuote && (
            <div className="p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-[var(--aqua-primary)] border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-[var(--text-muted)]">Getting quote...</span>
              </div>
            </div>
          )}

          {quote && !isGettingQuote && (
            <div className="p-4 rounded-xl bg-gradient-to-br from-[var(--aqua-primary)]/5 to-[var(--aqua-secondary)]/5 border border-[var(--aqua-border)]">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--text-muted)]">You'll receive</span>
                  <span className="font-semibold text-[var(--text-primary)]">
                    ~{quote.outputAmount.toFixed(4)} {vault.symbol}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--text-muted)]">Price Impact</span>
                  <span className={cn(
                    "font-medium",
                    quote.priceImpact > 1 ? "text-[var(--red)]" : "text-[var(--green)]"
                  )}>
                    {quote.priceImpact.toFixed(2)}%
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--text-muted)]">APY</span>
                  <span className="font-semibold text-[var(--aqua-primary)]">{vault.apyFormatted}</span>
                </div>
                <div className="pt-2 border-t border-[var(--border-subtle)]">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[var(--text-muted)]">Est. yearly earnings</span>
                    <span className="font-semibold text-[var(--green)]">+${yearlyEarnings.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Swap Flow Visualization */}
          <div className="flex items-center justify-center gap-2 py-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
              <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[var(--aqua-primary)] to-[var(--warm-pink)] flex items-center justify-center">
                <span className="text-[8px] font-bold text-white">P</span>
              </div>
              <span className="text-sm font-medium text-[var(--text-primary)]">PROPEL</span>
            </div>
            
            <svg className="w-5 h-5 text-[var(--text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-[var(--aqua-primary)]/10 to-[var(--green)]/10 border border-[var(--aqua-border)]">
              <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[var(--aqua-primary)] to-[var(--green)] flex items-center justify-center">
                <span className="text-[8px] font-bold text-white">jl</span>
              </div>
              <span className="text-sm font-medium text-[var(--aqua-primary)]">{vault.symbol}</span>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 rounded-lg bg-[var(--red)]/10 border border-[var(--red)]/20">
              <p className="text-sm text-[var(--red)]">{error}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className={cn(
                "flex-1 py-3 rounded-xl font-medium text-sm transition-all",
                "bg-[var(--bg-secondary)] border border-[var(--border-default)]",
                "text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
              )}
            >
              Cancel
            </button>
            <button
              onClick={handleDeposit}
              disabled={isLoading || !amount || parseFloat(amount) <= 0 || parseFloat(amount) > propelBalance}
              className={cn(
                "flex-1 py-3 rounded-xl font-semibold text-sm transition-all",
                "bg-gradient-to-r from-[var(--aqua-primary)] to-[var(--aqua-secondary)]",
                "text-white shadow-lg shadow-[var(--aqua-primary)]/25",
                "hover:shadow-xl hover:shadow-[var(--aqua-primary)]/30",
                "disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
              )}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Processing...
                </span>
              ) : (
                "Deposit & Earn"
              )}
            </button>
          </div>

          {/* Info Footer */}
          <p className="text-[10px] text-center text-[var(--text-muted)] pt-2">
            Your PROPEL will be swapped to {vault.asset.symbol} and deposited into a secure yield vault.
            You'll receive {vault.symbol} tokens representing your position.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

