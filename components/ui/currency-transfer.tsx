"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"

interface CurrencyTransferProps {
  mode: "buy" | "sell"
  amount: string
  onAmountChange: (amount: string) => void
  fromCurrency: string
  toCurrency: string
  rate: number
  balance: number
  onExecute: () => void
  isLoading?: boolean
  className?: string
}

export function CurrencyTransfer({
  mode,
  amount,
  onAmountChange,
  fromCurrency,
  toCurrency,
  rate,
  balance,
  onExecute,
  isLoading,
  className,
}: CurrencyTransferProps) {
  const [isFocused, setIsFocused] = useState(false)

  const outputAmount = Number.parseFloat(amount || "0") * rate
  const presets = [25, 50, 75, 100]

  const handlePreset = (percent: number) => {
    const value = (balance * percent) / 100
    onAmountChange(value.toFixed(6))
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Input Card */}
      <div
        className={cn(
          "relative p-5 rounded-2xl border transition-all duration-300",
          isFocused
            ? "border-[var(--aqua-primary)]/50 bg-[var(--aqua-subtle)]"
            : "border-[var(--glass-border)] bg-[var(--ocean-surface)]/30",
        )}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-[var(--text-muted)]">You {mode === "buy" ? "pay" : "sell"}</span>
          <span className="text-xs text-[var(--text-muted)]">
            Balance:{" "}
            <span className="text-[var(--text-secondary)] font-mono">
              {balance.toFixed(4)} {fromCurrency}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-4">
          <input
            type="number"
            value={amount}
            onChange={(e) => onAmountChange(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="0.00"
            className="flex-1 bg-transparent text-3xl font-bold text-[var(--text-primary)] placeholder-[var(--text-muted)]/50 outline-none font-mono"
          />
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--ocean-surface)]">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[var(--aqua-primary)] to-[var(--aqua-secondary)]" />
            <span className="font-semibold text-[var(--text-primary)]">{fromCurrency}</span>
          </div>
        </div>

        {/* Presets */}
        <div className="flex gap-2 mt-4">
          {presets.map((percent) => (
            <button
              key={percent}
              onClick={() => handlePreset(percent)}
              className="flex-1 py-2 rounded-lg text-xs font-medium text-[var(--text-secondary)] bg-[var(--ocean-surface)] hover:bg-[var(--ocean-surface)]/80 hover:text-[var(--text-primary)] transition-all"
            >
              {percent}%
            </button>
          ))}
        </div>
      </div>

      {/* Transfer Arrow */}
      <div className="flex justify-center -my-2 relative z-10">
        <motion.div
          animate={{ y: [0, -3, 0] }}
          transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
          className="w-12 h-12 rounded-full bg-gradient-to-br from-[var(--aqua-primary)] to-[var(--aqua-secondary)] flex items-center justify-center shadow-lg"
          style={{ boxShadow: "0 0 30px var(--aqua-glow)" }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="var(--ocean-deep)">
            <path
              d="M10 3v14M5 12l5 5 5-5"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              stroke="var(--ocean-deep)"
              fill="none"
            />
          </svg>
        </motion.div>
      </div>

      {/* Output Card */}
      <div className="relative p-5 rounded-2xl border border-[var(--glass-border)] bg-[var(--ocean-surface)]/30">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-[var(--text-muted)]">You receive</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex-1 text-3xl font-bold text-[var(--text-primary)] font-mono">
            {outputAmount > 0 ? outputAmount.toFixed(4) : "0.00"}
          </span>
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--ocean-surface)]">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[var(--warm-orange)] to-[var(--warm-pink)]" />
            <span className="font-semibold text-[var(--text-primary)]">{toCurrency}</span>
          </div>
        </div>
      </div>

      {/* Execute Button */}
      <motion.button
        onClick={onExecute}
        disabled={isLoading || !amount || Number.parseFloat(amount) <= 0}
        whileTap={{ scale: 0.98 }}
        className={cn(
          "w-full py-4 rounded-xl font-semibold text-base transition-all relative overflow-hidden",
          mode === "buy"
            ? "bg-gradient-to-r from-[var(--success)] to-[#059669] text-white"
            : "bg-gradient-to-r from-[var(--error)] to-[#dc2626] text-white",
          "disabled:opacity-50 disabled:cursor-not-allowed",
        )}
        style={{
          boxShadow: mode === "buy" ? "0 0 30px var(--success-glow)" : "0 0 30px var(--error-glow)",
        }}
      >
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-center gap-2"
            >
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Processing...
            </motion.div>
          ) : (
            <motion.span key="text" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {mode === "buy" ? "Buy" : "Sell"} {toCurrency}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  )
}
