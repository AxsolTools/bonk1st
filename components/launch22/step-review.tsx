"use client"

import type { Token22FormData } from "./token22-wizard"
import { useAuth } from "@/components/providers/auth-provider"
import { GlassButton } from "@/components/ui/glass-panel"
import { Copy, RefreshCw, AlertTriangle, Rocket, Check, Zap, Shield, Lock, Droplets } from "lucide-react"
import { useState } from "react"

interface Step22ReviewProps {
  formData: Token22FormData
  onBack: () => void
  onDeploy: () => void
  isDeploying: boolean
  error: string | null
  mintAddress: string | null
  onRegenerateMint: () => void
}

export function Step22Review({ formData, onBack, onDeploy, isDeploying, error, mintAddress, onRegenerateMint }: Step22ReviewProps) {
  const { activeWallet } = useAuth()
  const [copied, setCopied] = useState(false)

  const copyMintAddress = async () => {
    if (mintAddress) {
      await navigator.clipboard.writeText(mintAddress)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // Calculate estimates
  const totalSupply = parseFloat(formData.totalSupply) || 0
  const lpTokens = totalSupply * (formData.lpAllocation / 100)
  const solAmount = parseFloat(formData.poolSolAmount) || 0
  const pricePerToken = lpTokens > 0 ? solAmount / lpTokens : 0

  // Estimate costs
  const platformFee = 0.2 // Token-2022 platform fee
  const rentAndFees = 0.03 // Rent + transaction fees
  const poolCost = formData.autoCreatePool ? 0.01 + solAmount : 0 // Pool creation + SOL
  const totalCost = platformFee + rentAndFees + poolCost

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 border border-emerald-500/20">
        <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
          <Rocket className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <p className="text-sm font-medium text-emerald-400">Ready for Launch</p>
          <p className="text-xs text-white/60">Review everything. Once deployed, these settings are permanent.</p>
        </div>
      </div>

      {/* Token Identity */}
      <div className="p-5 rounded-xl bg-white/5 border border-white/10">
        <h3 className="text-sm font-medium text-white mb-4">Token Identity</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/50">Name</span>
            <span className="text-sm font-medium text-white">{formData.name}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/50">Symbol</span>
            <span className="text-sm font-medium text-cyan-400">${formData.symbol}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/50">Total Supply</span>
            <span className="text-sm font-medium text-white">{totalSupply.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/50">Decimals</span>
            <span className="text-sm font-medium text-white">{formData.decimals}</span>
          </div>
        </div>
      </div>

      {/* Token-2022 Extensions */}
      <div className="p-5 rounded-xl bg-white/5 border border-white/10">
        <h3 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400" />
          Token-2022 Features
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/50">Transfer Fee</span>
            <span className={`text-sm font-medium ${formData.enableTransferFee ? 'text-amber-400' : 'text-white/40'}`}>
              {formData.enableTransferFee ? `${(formData.transferFeeBasisPoints / 100).toFixed(2)}%` : 'Disabled'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/50">Mint Authority</span>
            <span className={`text-sm font-medium ${formData.revokeMintAuthority ? 'text-emerald-400' : 'text-amber-400'}`}>
              {formData.revokeMintAuthority ? 'Revoked ✓' : 'Kept (can mint more)'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/50">Freeze Authority</span>
            <span className={`text-sm font-medium ${formData.revokeFreezeAuthority ? 'text-emerald-400' : 'text-white/40'}`}>
              {formData.revokeFreezeAuthority ? 'Revoked ✓' : 'Kept'}
            </span>
          </div>
        </div>
      </div>

      {/* Distribution */}
      <div className="p-5 rounded-xl bg-white/5 border border-white/10">
        <h3 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
          <Shield className="w-4 h-4 text-purple-400" />
          Distribution
        </h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-3 rounded-lg bg-blue-500/10">
            <p className="text-lg font-bold text-blue-400">{formData.teamAllocation}%</p>
            <p className="text-xs text-white/50">Team</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-cyan-500/10">
            <p className="text-lg font-bold text-cyan-400">{formData.lpAllocation}%</p>
            <p className="text-xs text-white/50">Liquidity</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-amber-500/10">
            <p className="text-lg font-bold text-amber-400">{formData.lockedAllocation}%</p>
            <p className="text-xs text-white/50">Locked</p>
          </div>
        </div>
      </div>

      {/* Liquidity Pool */}
      {formData.autoCreatePool && (
        <div className="p-5 rounded-xl bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/30">
          <h3 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
            <Droplets className="w-4 h-4 text-cyan-400" />
            Raydium Pool
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/50">SOL in Pool</span>
              <span className="text-sm font-medium text-cyan-400">{solAmount} SOL</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/50">Tokens in Pool</span>
              <span className="text-sm font-medium text-white">{lpTokens.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/50">Launch Price</span>
              <span className="text-sm font-medium text-purple-400">
                {pricePerToken < 0.000001 ? pricePerToken.toExponential(2) : pricePerToken.toFixed(9)} SOL
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/50">LP Lock</span>
              <span className={`text-sm font-medium ${formData.lockLpTokens ? 'text-emerald-400' : 'text-white/40'}`}>
                {formData.lockLpTokens ? `${formData.lpLockDurationDays} days ✓` : 'No lock'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Social Links */}
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

      {/* Anti-Sniper Protection */}
      {formData.antiSniper?.enabled && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-red-500/10 to-orange-500/10 border border-red-500/30">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-white/70 uppercase tracking-wider">Anti-Sniper</h3>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 uppercase">Active</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex justify-between">
              <span className="text-white/50">Window</span>
              <span className="font-mono text-white">{Math.min(formData.antiSniper.monitorBlocksWindow, 8)} blocks</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/50">Max Supply</span>
              <span className="font-mono text-purple-400">{formData.antiSniper.maxSupplyPercentThreshold}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/50">Max SOL</span>
              <span className="font-mono text-cyan-400">{formData.antiSniper.maxSolAmountThreshold}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/50">Auto-Sell</span>
              <span className="font-mono text-blue-400">{formData.antiSniper.autoSellWalletIds.length}w @ {formData.antiSniper.sellPercentage}%</span>
            </div>
          </div>
          {formData.antiSniper.takeProfitEnabled && (
            <div className="mt-2 pt-2 border-t border-white/10 flex justify-between text-xs">
              <span className="text-white/50">Take Profit</span>
              <span className="font-mono text-green-400">{formData.antiSniper.takeProfitMultiplier}x</span>
            </div>
          )}
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
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copied ? "Copied!" : "Copy"}
              </button>
              <button
                onClick={onRegenerateMint}
                disabled={isDeploying}
                className="text-xs px-3 py-1.5 rounded-lg bg-white/10 text-white/70 hover:bg-white/20 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                title="Generate new address"
              >
                <RefreshCw className="w-3 h-3" />
                New
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

      {/* Cost Estimate */}
      <div className="p-5 rounded-xl bg-white/5 border border-white/10">
        <h3 className="text-sm font-medium text-white mb-4">Cost Breakdown</h3>
        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/50">Platform Fee</span>
            <span className="text-sm font-medium text-[var(--aqua-primary)]">{platformFee.toFixed(2)} SOL</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/50">Rent & Tx Fees</span>
            <span className="text-sm text-white/70">~{rentAndFees.toFixed(3)} SOL</span>
          </div>
          {formData.autoCreatePool && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/50">Raydium Pool + SOL</span>
              <span className="text-sm text-white/70">{poolCost.toFixed(3)} SOL</span>
            </div>
          )}
          <div className="pt-2 border-t border-white/10 flex items-center justify-between">
            <span className="text-sm font-medium text-white">Total Required</span>
            <span className="text-sm font-bold text-white">~{totalCost.toFixed(3)} SOL</span>
          </div>
        </div>
        <div className="flex items-center justify-between pt-3 border-t border-white/10">
          <div>
            <p className="text-xs text-white/40 mb-1">Deploying from</p>
            <p className="text-sm font-mono text-white">
              {activeWallet
                ? `${activeWallet.public_key.slice(0, 8)}...${activeWallet.public_key.slice(-8)}`
                : "No wallet connected"}
            </p>
          </div>
        </div>
        <p className="text-[10px] text-white/40 mt-3">
          Platform fee is charged only after successful token creation.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-400">Deployment failed</p>
            <p className="text-sm text-red-400/70 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Warning */}
      <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-amber-400/90">
          Token-2022 deployment is permanent. Authority revocations cannot be undone. Make sure everything is correct!
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
            "Deploying to Raydium..."
          ) : (
            <span className="flex items-center gap-2">
              <Rocket className="w-4 h-4" />
              Launch Token-2022
            </span>
          )}
        </GlassButton>
      </div>
    </div>
  )
}

