"use client"

import type { TokenFormData } from "./launch-wizard"
import { useAuth } from "@/components/providers/auth-provider"
import { GlassButton } from "@/components/ui/glass-panel"
import { useState } from "react"

interface StepReviewProps {
  formData: TokenFormData
  onBack: () => void
  onDeploy: () => void
  isDeploying: boolean
  error: string | null
  mintAddress: string | null
  onRegenerateMint: () => void
  pool?: 'pump' | 'bonk'
  isUsd1Quote?: boolean
}

export function StepReview({ 
  formData, 
  onBack, 
  onDeploy, 
  isDeploying, 
  error, 
  mintAddress, 
  onRegenerateMint,
  pool = 'pump',
  isUsd1Quote = false,
}: StepReviewProps) {
  const { activeWallet } = useAuth()
  const [copied, setCopied] = useState(false)

  // Copy mint address to clipboard
  const copyMintAddress = async () => {
    if (mintAddress) {
      await navigator.clipboard.writeText(mintAddress)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const isBonkPool = pool === 'bonk'
  const platformName = isBonkPool ? 'Bonk.fun' : 'Pump.fun'
  const quoteCurrency = isUsd1Quote ? 'USD1' : 'SOL'
  const initialBuyDisplay = isUsd1Quote 
    ? `${parseFloat(formData.initialBuySol) || 0} SOL → USD1` 
    : `${parseFloat(formData.initialBuySol) || 0} SOL`

  const sections = [
    {
      title: "Token Identity",
      items: [
        { label: "Name", value: formData.name },
        { label: "Symbol", value: `$${formData.symbol}` },
        { label: "Description", value: formData.description || "—" },
      ],
    },
    {
      title: "Platform & Tokenomics",
      items: [
        { label: "Launch Platform", value: platformName },
        ...(isBonkPool ? [{ label: "Quote Currency", value: quoteCurrency }] : []),
        { label: "Total Supply", value: Number(formData.totalSupply).toLocaleString() },
        { label: "Decimals", value: `6 (${platformName.toLowerCase()} standard)` },
        { label: "Initial Purchase", value: initialBuyDisplay },
        ...(isUsd1Quote && parseFloat(formData.initialBuySol) > 0 ? [{ label: "Auto-Convert", value: "SOL → USD1 (via Jupiter)" }] : []),
      ],
    },
    {
      title: "AQUA Settings",
      items: [
        { label: "Pour Rate", value: `${formData.pourRate}% per hour` },
        { label: "Evaporation Rate", value: `${formData.evaporationRate}%` },
      ],
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-white/60 text-sm">Double check everything. Once deployed, these settings are permanent.</p>
      </div>

      {/* Review Sections */}
      <div className="space-y-4">
        {sections.map((section) => (
          <div
            key={section.title}
            className="p-5 rounded-xl bg-white/5 border border-white/10"
          >
            <h3 className="text-sm font-medium text-white mb-4">{section.title}</h3>
            <div className="space-y-3">
              {section.items.map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <span className="text-sm text-white/50">{item.label}</span>
                  <span className="text-sm font-medium text-white text-right max-w-[60%] truncate">
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Social Links - Compact */}
      {(formData.website || formData.twitter || formData.telegram || formData.discord) && (
        <div className="p-5 rounded-xl bg-white/5 border border-white/10">
          <h3 className="text-sm font-medium text-white mb-3">Social Links</h3>
          <div className="flex flex-wrap gap-2">
            {formData.website && (
              <span className="text-xs px-3 py-1.5 rounded-lg bg-white/10 text-white/70">🌐 Website</span>
            )}
            {formData.twitter && (
              <span className="text-xs px-3 py-1.5 rounded-lg bg-white/10 text-white/70">𝕏 Twitter</span>
            )}
            {formData.telegram && (
              <span className="text-xs px-3 py-1.5 rounded-lg bg-white/10 text-white/70">✈️ Telegram</span>
            )}
            {formData.discord && (
              <span className="text-xs px-3 py-1.5 rounded-lg bg-white/10 text-white/70">💬 Discord</span>
            )}
          </div>
        </div>
      )}

      {/* Pre-generated Mint Address */}
      {mintAddress && (
        <div className="p-5 rounded-xl bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-cyan-500/30">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <p className="text-sm font-medium text-cyan-400">Your Token Address (Pre-generated)</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={copyMintAddress}
                className="text-xs px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-colors flex items-center gap-1.5"
                title="Copy to clipboard"
              >
                {copied ? "✓" : "📋"}
                {copied ? "Copied!" : "Copy"}
              </button>
              <button
                onClick={onRegenerateMint}
                disabled={isDeploying}
                className="text-xs px-3 py-1.5 rounded-lg bg-white/10 text-white/70 hover:bg-white/20 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                title="Generate new address"
              >
                🔄 New
              </button>
            </div>
          </div>
          <p className="font-mono text-sm text-white bg-black/30 px-4 py-3 rounded-lg break-all select-all">
            {mintAddress}
          </p>
          <p className="text-xs text-white/40 mt-3">
            Save this address! It&apos;s your token&apos;s permanent home on Solana.
          </p>
        </div>
      )}

      {/* Cost Breakdown */}
      <div className="p-5 rounded-xl bg-white/5 border border-white/10">
        <h3 className="text-sm font-medium text-white mb-4">Cost Breakdown</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-white/50">Account Rent</span>
            <span className="text-white">~0.02 SOL</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/50">Creation Fee</span>
            <span className="text-[var(--aqua-primary)]">0.1 SOL</span>
          </div>
          {parseFloat(formData.initialBuySol) > 0 && (
            <>
              <div className="flex justify-between">
                <span className="text-white/50">Initial Buy</span>
                <span className="text-white">{formData.initialBuySol} SOL</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/50">Transaction Fee (2%)</span>
                <span className="text-white">~{(parseFloat(formData.initialBuySol) * 0.02).toFixed(4)} SOL</span>
              </div>
            </>
          )}
          {formData.launchWithBundle && formData.bundleWallets.length > 0 && (
            <>
              <div className="flex justify-between">
                <span className="text-white/50">Bundle Buys</span>
                <span className="text-white">{formData.bundleWallets.reduce((sum, w) => sum + w.buyAmount, 0).toFixed(4)} SOL</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/50">Bundle Fee (2%)</span>
                <span className="text-white">~{(formData.bundleWallets.reduce((sum, w) => sum + w.buyAmount, 0) * 0.02).toFixed(4)} SOL</span>
              </div>
            </>
          )}
          <div className="flex justify-between pt-2 border-t border-white/10">
            <span className="font-semibold text-white">Total Estimated</span>
            <span className="font-semibold text-[var(--aqua-primary)]">
              ~{(
                0.02 + 0.1 + 
                (parseFloat(formData.initialBuySol) || 0) * 1.02 +
                (formData.launchWithBundle ? formData.bundleWallets.reduce((sum, w) => sum + w.buyAmount, 0) * 1.02 : 0)
              ).toFixed(4)} SOL
            </span>
          </div>
        </div>
      </div>

      {/* Deploying Wallet */}
      <div className="p-5 rounded-xl bg-white/5 border border-white/10">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-white/40 mb-1">Deploying from</p>
            <p className="text-sm font-mono text-white">
              {activeWallet
                ? `${activeWallet.public_key.slice(0, 8)}...${activeWallet.public_key.slice(-8)}`
                : "No wallet connected"}
            </p>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-3">
          <span className="text-lg flex-shrink-0">⚠️</span>
          <div>
            <p className="text-sm font-medium text-red-400">Deployment failed</p>
            <p className="text-sm text-red-400/70 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Warning */}
      <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
        <span className="text-lg flex-shrink-0">⚠️</span>
        <p className="text-sm text-amber-400/90">
          Token deployment is permanent. Once live, settings cannot be changed. Make sure everything is correct!
        </p>
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <GlassButton onClick={onBack} disabled={isDeploying} variant="outline">
          ← Back
        </GlassButton>
        <GlassButton
          onClick={onDeploy}
          disabled={isDeploying || !activeWallet}
          variant="primary"
          isLoading={isDeploying}
        >
          {isDeploying ? (
            "Deploying..."
          ) : (
            <span className="flex items-center gap-2">
              🚀 Launch Token
            </span>
          )}
        </GlassButton>
      </div>
    </div>
  )
}
