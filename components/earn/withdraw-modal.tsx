"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useAuth } from "@/components/providers/auth-provider"

interface WithdrawModalProps {
  isOpen: boolean
  onClose: () => void
  position: {
    vaultAddress: string
    vaultSymbol: string
    assetSymbol: string
    sharesFormatted: number
    underlyingAssetsFormatted: number
    underlyingValueUsd: number
    walletAddress?: string
  }
  onSuccess?: () => void
}

export function WithdrawModal({ 
  isOpen, 
  onClose, 
  position,
  onSuccess 
}: WithdrawModalProps) {
  const { sessionId, activeWallet } = useAuth()
  const [amount, setAmount] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [useShares, setUseShares] = useState(false)

  const maxAmount = useShares ? position.sharesFormatted : position.underlyingAssetsFormatted
  const displayUnit = useShares ? position.vaultSymbol : position.assetSymbol

  const handleWithdraw = async () => {
    if (!amount || !activeWallet || !sessionId) {
      setError("Please connect wallet and enter amount")
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // Convert to base units (assuming 6 decimals)
      const decimals = position.assetSymbol === 'SOL' ? 9 : 6
      const amountBase = Math.floor(parseFloat(amount) * Math.pow(10, decimals)).toString()

      const walletToUse = position.walletAddress || activeWallet.publicKey

      const response = await fetch('/api/earn/withdraw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': sessionId,
        },
        body: JSON.stringify({
          asset: position.assetSymbol,
          amount: useShares ? undefined : amountBase,
          shares: useShares ? amountBase : undefined,
          walletAddress: walletToUse,
          useShares,
        }),
      })

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error?.message || 'Withdraw failed')
      }

      // Success!
      onSuccess?.()
      onClose()
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Withdraw failed')
    } finally {
      setIsLoading(false)
    }
  }

  const handleMaxClick = () => {
    setAmount(maxAmount.toString())
  }

  const percentageOfPosition = parseFloat(amount || '0') / maxAmount * 100

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md bg-[var(--bg-card)] border-[var(--border-subtle)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-[var(--text-primary)]">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--warm)] to-[var(--warm-pink)] flex items-center justify-center shadow-lg">
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <span>Withdraw from {position.vaultSymbol}</span>
              <p className="text-xs font-normal text-[var(--text-muted)] mt-0.5">
                Receive {position.assetSymbol} back to your wallet
              </p>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          {/* Toggle: Amount vs Shares */}
          <div className="flex items-center gap-2 p-1 rounded-lg bg-[var(--bg-secondary)]">
            <button
              onClick={() => setUseShares(false)}
              className={cn(
                "flex-1 py-2 rounded-md text-sm font-medium transition-all",
                !useShares 
                  ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm" 
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              )}
            >
              By Amount
            </button>
            <button
              onClick={() => setUseShares(true)}
              className={cn(
                "flex-1 py-2 rounded-md text-sm font-medium transition-all",
                useShares 
                  ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm" 
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              )}
            >
              By Shares
            </button>
          </div>

          {/* Current Position Info */}
          <div className="p-3 rounded-lg bg-[var(--bg-secondary)]/50 border border-[var(--border-subtle)]">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--text-muted)]">Your Position</span>
              <div className="text-right">
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  {position.underlyingAssetsFormatted.toLocaleString(undefined, { maximumFractionDigits: 4 })} {position.assetSymbol}
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  {position.sharesFormatted.toLocaleString(undefined, { maximumFractionDigits: 4 })} shares
                </p>
              </div>
            </div>
          </div>

          {/* Input Field */}
          <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-[var(--text-muted)]">Withdraw ({displayUnit})</span>
              <button 
                onClick={handleMaxClick}
                className="text-xs text-[var(--warm)] hover:text-[var(--warm-pink)] transition-colors"
              >
                Max: {maxAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })}
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
          </div>

          {/* Percentage Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
              <span>Withdraw percentage</span>
              <span className="font-medium text-[var(--text-secondary)]">{percentageOfPosition.toFixed(1)}%</span>
            </div>
            <div className="flex gap-2">
              {[25, 50, 75, 100].map((pct) => (
                <button
                  key={pct}
                  onClick={() => setAmount((maxAmount * pct / 100).toString())}
                  className={cn(
                    "flex-1 py-1.5 rounded-lg text-xs font-medium transition-all",
                    "bg-[var(--bg-secondary)] border border-[var(--border-subtle)]",
                    "hover:border-[var(--warm)]/50 hover:text-[var(--warm)]",
                    Math.abs(percentageOfPosition - pct) < 1 && "border-[var(--warm)] text-[var(--warm)]"
                  )}
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>

          {/* Receive Estimate */}
          {parseFloat(amount || '0') > 0 && (
            <div className="p-3 rounded-lg bg-gradient-to-br from-[var(--warm)]/5 to-[var(--warm-pink)]/5 border border-[var(--warm)]/20">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--text-muted)]">You'll receive</span>
                <span className="text-lg font-semibold text-[var(--text-primary)]">
                  ~{parseFloat(amount || '0').toLocaleString(undefined, { maximumFractionDigits: 4 })} {position.assetSymbol}
                </span>
              </div>
            </div>
          )}

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
              onClick={handleWithdraw}
              disabled={isLoading || !amount || parseFloat(amount) <= 0 || parseFloat(amount) > maxAmount}
              className={cn(
                "flex-1 py-3 rounded-xl font-semibold text-sm transition-all",
                "bg-gradient-to-r from-[var(--warm)] to-[var(--warm-pink)]",
                "text-white shadow-lg shadow-[var(--warm)]/25",
                "hover:shadow-xl hover:shadow-[var(--warm)]/30",
                "disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
              )}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Processing...
                </span>
              ) : (
                "Withdraw"
              )}
            </button>
          </div>

          {/* Info Footer */}
          <p className="text-[10px] text-center text-[var(--text-muted)] pt-2">
            Withdrawing will redeem your {position.vaultSymbol} shares for {position.assetSymbol}.
            Any accumulated earnings will be included.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

