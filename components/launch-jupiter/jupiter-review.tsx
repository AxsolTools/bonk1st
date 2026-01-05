"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Copy, Check, RefreshCw, Loader2, AlertCircle, ExternalLink } from "lucide-react"

// Custom Jupiter icon (planet with rings)
const JupiterIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="7" />
    <ellipse cx="12" cy="12" rx="11" ry="3" />
    <path d="M5 12h14" strokeWidth="1.5" />
  </svg>
)
import { cn } from "@/lib/utils"
import type { JupiterFormData } from "./jupiter-wizard"

interface JupiterReviewProps {
  formData: JupiterFormData
  onBack: () => void
  onDeploy: () => void
  isDeploying: boolean
  error: string | null
  mintAddress: string | null
  onRegenerateMint: () => void
}

export function JupiterReview({
  formData,
  onBack,
  onDeploy,
  isDeploying,
  error,
  mintAddress,
  onRegenerateMint,
}: JupiterReviewProps) {
  const [copied, setCopied] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  const copyMintAddress = () => {
    if (mintAddress) {
      navigator.clipboard.writeText(mintAddress)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // Calculate estimated costs
  const baseCost = 0.02 // SOL for account creation (rent)
  const creationFee = 0.1 // Fixed platform creation fee
  const initialBuy = parseFloat(formData.initialBuySol) || 0
  const bundleCost = formData.launchWithBundle 
    ? formData.bundleWallets.reduce((sum, w) => sum + w.buyAmount, 0) 
    : 0
  const transactionFee = (initialBuy + bundleCost) * 0.02 // 2% on buys only
  const totalCost = baseCost + creationFee + initialBuy + bundleCost + transactionFee

  return (
    <div className="space-y-6">
      {/* Jupiter Badge */}
      <div className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-r from-orange-500/10 to-yellow-500/10 border border-orange-500/20">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-yellow-500 flex items-center justify-center">
          <JupiterIcon className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="font-semibold text-[var(--text-primary)]">Jupiter Dynamic Bonding Curve</p>
          <p className="text-sm text-[var(--text-muted)]">Powered by Jupiter Studio API</p>
        </div>
      </div>

      {/* Token Summary */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 rounded-xl bg-[var(--glass-bg)] border border-[var(--border-subtle)]">
          <p className="text-xs text-[var(--text-muted)] mb-1">Token Name</p>
          <p className="font-semibold text-[var(--text-primary)]">{formData.name || "—"}</p>
        </div>
        <div className="p-4 rounded-xl bg-[var(--glass-bg)] border border-[var(--border-subtle)]">
          <p className="text-xs text-[var(--text-muted)] mb-1">Symbol</p>
          <p className="font-semibold text-[var(--text-primary)]">{formData.symbol || "—"}</p>
        </div>
        <div className="p-4 rounded-xl bg-[var(--glass-bg)] border border-[var(--border-subtle)]">
          <p className="text-xs text-[var(--text-muted)] mb-1">Total Supply</p>
          <p className="font-semibold text-[var(--text-primary)]">
            {parseInt(formData.totalSupply).toLocaleString()}
          </p>
        </div>
        <div className="p-4 rounded-xl bg-[var(--glass-bg)] border border-[var(--border-subtle)]">
          <p className="text-xs text-[var(--text-muted)] mb-1">Initial Buy</p>
          <p className="font-semibold text-[var(--text-primary)]">
            {initialBuy > 0 ? `${initialBuy} SOL` : "None"}
          </p>
        </div>
      </div>

      {/* Pre-generated Mint Address */}
      <div className="p-4 rounded-xl bg-[var(--glass-bg)] border border-[var(--border-subtle)]">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-[var(--text-muted)]">Token Address (Pre-generated)</p>
          <button
            onClick={onRegenerateMint}
            className="text-xs text-[var(--aqua-primary)] hover:text-[var(--aqua-secondary)] flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            Regenerate
          </button>
        </div>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-sm font-mono text-[var(--text-primary)] truncate">
            {mintAddress || "Generating..."}
          </code>
          <button
            onClick={copyMintAddress}
            className="p-2 rounded-lg hover:bg-[var(--glass-bg-hover)] transition-colors"
            disabled={!mintAddress}
          >
            {copied ? (
              <Check className="w-4 h-4 text-green-400" />
            ) : (
              <Copy className="w-4 h-4 text-[var(--text-muted)]" />
            )}
          </button>
        </div>
      </div>

      {/* AQUA Settings Summary */}
      <div className="p-4 rounded-xl bg-[var(--glass-bg)] border border-[var(--border-subtle)]">
        <p className="text-xs text-[var(--text-muted)] mb-3">AQUA Settings</p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">Pour Rate:</span>
            <span className="text-[var(--text-primary)]">
              {formData.pourEnabled ? `${formData.pourRate}% ${formData.pourInterval}` : "Disabled"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">Evaporation:</span>
            <span className="text-[var(--text-primary)]">
              {formData.evaporationEnabled ? `${formData.evaporationRate}%` : "Disabled"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">Fee Split:</span>
            <span className="text-[var(--text-primary)]">
              {formData.feeToLiquidity}% LP / {formData.feeToCreator}% Creator
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">Auto-Claim:</span>
            <span className="text-[var(--text-primary)]">
              {formData.autoClaimEnabled ? `${formData.claimInterval}` : "Disabled"}
            </span>
          </div>
        </div>
      </div>

      {/* Bundle Summary (if enabled) */}
      {formData.launchWithBundle && formData.bundleWallets.length > 0 && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20">
          <p className="text-xs text-purple-400 mb-2">Bundle Launch</p>
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--text-muted)]">
              {formData.bundleWallets.length} wallet{formData.bundleWallets.length > 1 ? "s" : ""} configured
            </span>
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              {bundleCost.toFixed(4)} SOL total
            </span>
          </div>
        </div>
      )}

      {/* Cost Breakdown */}
      <div className="p-4 rounded-xl bg-[var(--glass-bg)] border border-[var(--border-subtle)]">
        <p className="text-xs text-[var(--text-muted)] mb-3">Cost Breakdown</p>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">Account Rent</span>
            <span className="text-[var(--text-primary)]">~{baseCost} SOL</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">Creation Fee</span>
            <span className="text-orange-400">{creationFee} SOL</span>
          </div>
          {initialBuy > 0 && (
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Initial Buy</span>
              <span className="text-[var(--text-primary)]">{initialBuy} SOL</span>
            </div>
          )}
          {bundleCost > 0 && (
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Bundle Buys</span>
              <span className="text-[var(--text-primary)]">{bundleCost.toFixed(4)} SOL</span>
            </div>
          )}
          {(initialBuy > 0 || bundleCost > 0) && (
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Transaction Fee (2%)</span>
              <span className="text-[var(--text-primary)]">~{transactionFee.toFixed(4)} SOL</span>
            </div>
          )}
          <div className="flex justify-between pt-2 border-t border-[var(--border-subtle)]">
            <span className="font-semibold text-[var(--text-primary)]">Total Estimated</span>
            <span className="font-semibold text-orange-400">~{totalCost.toFixed(4)} SOL</span>
          </div>
        </div>
      </div>

      {/* Confirmation Checkbox */}
      <label className="flex items-start gap-3 p-4 rounded-xl bg-[var(--glass-bg)] border border-[var(--border-subtle)] cursor-pointer hover:border-orange-500/30 transition-colors">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-1 w-4 h-4 rounded border-[var(--border-subtle)] text-orange-500 focus:ring-orange-500"
        />
        <div className="text-sm">
          <p className="text-[var(--text-primary)] font-medium">
            I understand this will create a token on Jupiter's Dynamic Bonding Curve
          </p>
          <p className="text-[var(--text-muted)] mt-1">
            The token will be live immediately after deployment. This action cannot be undone.
          </p>
        </div>
      </label>

      {/* Error Display */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-3"
        >
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-400">Deployment Failed</p>
            <p className="text-sm text-red-300/80 mt-1">{error}</p>
          </div>
        </motion.div>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-4 border-t border-[var(--border-subtle)]">
        <button
          onClick={onBack}
          disabled={isDeploying}
          className="px-4 py-2 text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
        >
          ← Back
        </button>
        <button
          onClick={onDeploy}
          disabled={isDeploying || !confirmed || !mintAddress}
          className={cn(
            "px-8 py-3 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
            "bg-gradient-to-r from-orange-500 to-yellow-500 text-white",
            "hover:from-orange-600 hover:to-yellow-600",
            "shadow-lg shadow-orange-500/25",
            "disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
          )}
        >
          {isDeploying ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Deploying to Jupiter...
            </>
          ) : (
            <>
              <JupiterIcon className="w-4 h-4" />
              Deploy Token
            </>
          )}
        </button>
      </div>

      {/* Jupiter Info */}
      <div className="text-center">
        <a
          href="https://jup.ag"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-orange-400 transition-colors"
        >
          Learn more about Jupiter DBC
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  )
}

