"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { GlassPanel } from "@/components/ui/glass-panel"
import { useAuth } from "@/components/providers/auth-provider"
import { useBalance } from "@/hooks/use-balance"
import { cn } from "@/lib/utils"

interface BundleWallet {
  walletId: string
  address: string
  label: string
  buyAmount: number
  balance: number
  selected: boolean
}

interface StepBundleProps {
  launchWithBundle: boolean
  bundleWallets: BundleWallet[]
  onToggleBundle: (enabled: boolean) => void
  onUpdateWallets: (wallets: BundleWallet[]) => void
  initialBuySol: number
}

export function StepBundle({
  launchWithBundle,
  bundleWallets,
  onToggleBundle,
  onUpdateWallets,
  initialBuySol,
}: StepBundleProps) {
  const { wallets } = useAuth()
  const [localWallets, setLocalWallets] = useState<BundleWallet[]>([])

  // Initialize local wallets from auth wallets
  useEffect(() => {
    if (wallets.length > 0 && localWallets.length === 0) {
      const bundleList: BundleWallet[] = wallets.map((wallet) => ({
        walletId: wallet.id,
        address: wallet.public_key,
        label: wallet.label || `${wallet.public_key.slice(0, 4)}...${wallet.public_key.slice(-4)}`,
        buyAmount: 0.1, // Default buy amount per bundle wallet
        balance: 0,
        selected: false,
      }))
      setLocalWallets(bundleList)
    }
  }, [wallets, localWallets.length])

  // Sync with parent
  useEffect(() => {
    onUpdateWallets(localWallets.filter((w) => w.selected))
  }, [localWallets, onUpdateWallets])

  const toggleWallet = (walletId: string) => {
    setLocalWallets((prev) =>
      prev.map((w) =>
        w.walletId === walletId ? { ...w, selected: !w.selected } : w
      )
    )
  }

  const updateBuyAmount = (walletId: string, amount: number) => {
    setLocalWallets((prev) =>
      prev.map((w) =>
        w.walletId === walletId ? { ...w, buyAmount: amount } : w
      )
    )
  }

  const selectAll = () => {
    setLocalWallets((prev) => prev.map((w) => ({ ...w, selected: true })))
  }

  const deselectAll = () => {
    setLocalWallets((prev) => prev.map((w) => ({ ...w, selected: false })))
  }

  const selectedCount = localWallets.filter((w) => w.selected).length
  const totalBundleBuy = localWallets
    .filter((w) => w.selected)
    .reduce((sum, w) => sum + w.buyAmount, 0)
  const totalCost = initialBuySol + totalBundleBuy

  return (
    <div className="space-y-4">
      {/* Bundle Toggle */}
      <GlassPanel className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              Launch with Bundle
            </h3>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Coordinate multiple wallets for atomic launch
            </p>
          </div>
          <button
            onClick={() => onToggleBundle(!launchWithBundle)}
            className={cn(
              "relative w-12 h-6 rounded-full transition-all",
              launchWithBundle
                ? "bg-[var(--aqua-primary)]"
                : "bg-[var(--bg-secondary)] border border-[var(--border-default)]"
            )}
          >
            <motion.div
              animate={{ x: launchWithBundle ? 26 : 2 }}
              className="absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm"
            />
          </button>
        </div>

        {launchWithBundle && (
          <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div className="text-xs text-amber-400">
                <p className="font-medium">Ensure wallets are funded</p>
                <p className="opacity-80 mt-0.5">
                  Each wallet needs SOL for their buy amount + ~0.01 SOL for fees
                </p>
              </div>
            </div>
          </div>
        )}
      </GlassPanel>

      {/* Wallet Selection */}
      {launchWithBundle && (
        <GlassPanel className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-[var(--text-primary)]">
              Select Bundle Wallets
            </h4>
            <div className="flex items-center gap-2">
              <button
                onClick={selectAll}
                className="text-[10px] text-[var(--aqua-primary)] hover:underline"
              >
                Select All
              </button>
              <span className="text-[var(--text-muted)]">|</span>
              <button
                onClick={deselectAll}
                className="text-[10px] text-[var(--text-muted)] hover:underline"
              >
                Clear
              </button>
            </div>
          </div>

          {localWallets.length === 0 ? (
            <div className="text-center py-6 text-[var(--text-muted)] text-sm">
              No additional wallets found. Add more wallets to use bundle launch.
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {localWallets.map((wallet) => (
                <WalletRow
                  key={wallet.walletId}
                  wallet={wallet}
                  onToggle={() => toggleWallet(wallet.walletId)}
                  onUpdateAmount={(amount) => updateBuyAmount(wallet.walletId, amount)}
                />
              ))}
            </div>
          )}

          {/* Summary */}
          <div className="mt-4 pt-3 border-t border-[var(--border-subtle)]">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-[var(--text-muted)]">Selected wallets</span>
              <span className="text-[var(--text-primary)] font-medium">
                {selectedCount} / {localWallets.length}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-[var(--text-muted)]">Dev buy (your wallet)</span>
              <span className="text-[var(--text-primary)] font-mono">
                {initialBuySol.toFixed(2)} SOL
              </span>
            </div>
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-[var(--text-muted)]">Bundle buys total</span>
              <span className="text-[var(--text-primary)] font-mono">
                {totalBundleBuy.toFixed(2)} SOL
              </span>
            </div>
            <div className="flex items-center justify-between text-sm pt-2 border-t border-[var(--border-subtle)]">
              <span className="text-[var(--text-primary)] font-medium">Total required</span>
              <span className="text-[var(--aqua-primary)] font-mono font-semibold">
                {totalCost.toFixed(2)} SOL
              </span>
            </div>
          </div>
        </GlassPanel>
      )}

      {/* Benefits Info */}
      {launchWithBundle && (
        <GlassPanel className="p-4">
          <h4 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-2">
            Bundle Launch Benefits
          </h4>
          <ul className="space-y-2 text-xs text-[var(--text-muted)]">
            <li className="flex items-start gap-2">
              <svg className="w-4 h-4 text-[var(--green)] mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>All transactions execute atomically via Jito bundles</span>
            </li>
            <li className="flex items-start gap-2">
              <svg className="w-4 h-4 text-[var(--green)] mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>MEV protection - sniper bots can't front-run your launch</span>
            </li>
            <li className="flex items-start gap-2">
              <svg className="w-4 h-4 text-[var(--green)] mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>All bundle wallets get the same entry price</span>
            </li>
            <li className="flex items-start gap-2">
              <svg className="w-4 h-4 text-[var(--green)] mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Max 4 bundle wallets per atomic launch (Jito limit)</span>
            </li>
          </ul>
        </GlassPanel>
      )}
    </div>
  )
}

// Individual wallet row component
function WalletRow({
  wallet,
  onToggle,
  onUpdateAmount,
}: {
  wallet: BundleWallet
  onToggle: () => void
  onUpdateAmount: (amount: number) => void
}) {
  const { balanceSol } = useBalance(wallet.address, { enabled: true, refreshInterval: 60000 })

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value) || 0
    onUpdateAmount(Math.max(0, value))
  }

  const insufficientBalance = wallet.selected && (balanceSol || 0) < wallet.buyAmount + 0.01

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg border transition-all",
        wallet.selected
          ? "border-[var(--aqua-primary)] bg-[var(--aqua-primary)]/5"
          : "border-[var(--border-subtle)] bg-[var(--bg-secondary)]",
        insufficientBalance && "border-amber-500/50"
      )}
    >
      {/* Checkbox */}
      <button
        onClick={onToggle}
        className={cn(
          "w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all",
          wallet.selected
            ? "bg-[var(--aqua-primary)] border-[var(--aqua-primary)]"
            : "border-[var(--border-default)]"
        )}
      >
        {wallet.selected && (
          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      {/* Wallet Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[var(--text-primary)] truncate">
            {wallet.label}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
          <span className="font-mono">{wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}</span>
          <span>•</span>
          <span className={cn(
            "font-mono",
            insufficientBalance && "text-amber-400"
          )}>
            {(balanceSol || 0).toFixed(4)} SOL
          </span>
        </div>
      </div>

      {/* Buy Amount Input */}
      {wallet.selected && (
        <div className="flex items-center gap-2 flex-shrink-0">
          <input
            type="number"
            value={wallet.buyAmount}
            onChange={handleAmountChange}
            step="0.1"
            min="0"
            className="w-20 px-2 py-1 text-sm font-mono text-right bg-[var(--bg-primary)] border border-[var(--border-default)] rounded focus:border-[var(--aqua-primary)] focus:outline-none"
          />
          <span className="text-xs text-[var(--text-muted)]">SOL</span>
        </div>
      )}
    </div>
  )
}

