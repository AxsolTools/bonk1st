"use client"

import type { Token22FormData } from "./token22-wizard"
import { GlassInput, GlassButton } from "@/components/ui/glass-panel"
import { Switch } from "@/components/ui/switch"
import { Droplets, Lock, Zap, TrendingUp, Info } from "lucide-react"

interface Step22LiquidityProps {
  formData: Token22FormData
  updateFormData: (updates: Partial<Token22FormData>) => void
  onNext: () => void
  onBack: () => void
}

export function Step22Liquidity({ formData, updateFormData, onNext, onBack }: Step22LiquidityProps) {
  // Calculate initial price based on pool settings
  const totalSupply = parseFloat(formData.totalSupply) || 1000000000
  const lpTokens = totalSupply * (formData.lpAllocation / 100)
  const solAmount = parseFloat(formData.poolSolAmount) || 1
  const pricePerToken = lpTokens > 0 ? solAmount / lpTokens : 0
  const initialMarketCap = pricePerToken * totalSupply

  // Format price with appropriate precision
  const formatPrice = (price: number) => {
    if (price < 0.000001) return price.toExponential(2)
    if (price < 0.001) return price.toFixed(9)
    if (price < 1) return price.toFixed(6)
    return price.toFixed(4)
  }

  const isValid = formData.autoCreatePool ? parseFloat(formData.poolSolAmount) >= 0.1 : true

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/20">
        <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center">
          <Droplets className="w-5 h-5 text-cyan-400" />
        </div>
        <div>
          <p className="text-sm font-medium text-cyan-400">Raydium Liquidity Pool</p>
          <p className="text-xs text-white/60">Launch directly to Raydium CPMM. No bonding curve BS.</p>
        </div>
      </div>

      {/* Auto-Create Pool Toggle */}
      <div className="p-5 rounded-xl bg-white/5 border border-white/10">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
              <Zap className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-white">Auto-Create Pool on Launch</h3>
              <p className="text-xs text-white/60 mt-1">
                Automatically create a Raydium CPMM pool when your token deploys.
                Tokens go live immediately.
              </p>
            </div>
          </div>
          <Switch
            checked={formData.autoCreatePool}
            onCheckedChange={(checked) => updateFormData({ autoCreatePool: checked })}
          />
        </div>
      </div>

      {/* Pool Configuration - Only show if auto-create is enabled */}
      {formData.autoCreatePool && (
        <div className="space-y-6">
          {/* SOL Amount */}
          <div className="p-5 rounded-xl bg-white/5 border border-white/10 space-y-4">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-cyan-400" />
              <h3 className="text-sm font-medium text-white">Initial Liquidity</h3>
            </div>
            
            <GlassInput
              label="SOL to add to pool"
              value={formData.poolSolAmount}
              onChange={(e) => updateFormData({ poolSolAmount: e.target.value })}
              placeholder="1.0"
              hint="Minimum 0.1 SOL. More SOL = less slippage for traders."
            />

            {/* Quick buttons */}
            <div className="flex flex-wrap gap-2">
              {['0.5', '1', '2', '5', '10'].map((amount) => (
                <button
                  key={amount}
                  onClick={() => updateFormData({ poolSolAmount: amount })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    formData.poolSolAmount === amount
                      ? 'bg-cyan-500/30 text-cyan-400 border border-cyan-500/50'
                      : 'bg-white/5 text-white/60 hover:bg-white/10'
                  }`}
                >
                  {amount} SOL
                </button>
              ))}
            </div>
          </div>

          {/* Lock LP Tokens */}
          <div className="p-5 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                  <Lock className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-white">Lock LP Tokens</h3>
                  <p className="text-xs text-white/60 mt-1">
                    Lock your LP tokens to prove you won&apos;t rug. Builds trust with degens.
                  </p>
                </div>
              </div>
              <Switch
                checked={formData.lockLpTokens}
                onCheckedChange={(checked) => updateFormData({ lockLpTokens: checked })}
              />
            </div>

            {formData.lockLpTokens && (
              <div className="pt-4 border-t border-white/10">
                <label className="block text-sm text-white/80 mb-2">Lock Duration</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { days: 30, label: '30 Days' },
                    { days: 90, label: '90 Days' },
                    { days: 180, label: '6 Months' },
                    { days: 365, label: '1 Year' },
                    { days: 730, label: '2 Years' },
                  ].map(({ days, label }) => (
                    <button
                      key={days}
                      onClick={() => updateFormData({ lpLockDurationDays: days })}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        formData.lpLockDurationDays === days
                          ? 'bg-amber-500/30 text-amber-400 border border-amber-500/50'
                          : 'bg-white/5 text-white/60 hover:bg-white/10'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Price Preview */}
          <div className="p-5 rounded-xl bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/30">
            <h3 className="text-sm font-medium text-white mb-4">Launch Price Preview</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-white/50 mb-1">Price per Token</p>
                <p className="text-lg font-bold text-purple-400">{formatPrice(pricePerToken)} SOL</p>
              </div>
              <div>
                <p className="text-xs text-white/50 mb-1">Initial Market Cap</p>
                <p className="text-lg font-bold text-pink-400">{initialMarketCap.toFixed(2)} SOL</p>
              </div>
              <div>
                <p className="text-xs text-white/50 mb-1">LP Tokens</p>
                <p className="text-sm font-medium text-white">{lpTokens.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-white/50 mb-1">Your SOL Contribution</p>
                <p className="text-sm font-medium text-white">{solAmount.toFixed(2)} SOL</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Pool Info */}
      {!formData.autoCreatePool && (
        <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-blue-400">Manual Pool Creation</p>
            <p className="text-xs text-blue-400/70 mt-1">
              You can create the Raydium pool later from the token dashboard.
              Tokens will be minted to your wallet. You&apos;ll need to add liquidity manually.
            </p>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <GlassButton onClick={onBack} variant="outline">
          ← Back
        </GlassButton>
        <GlassButton onClick={onNext} disabled={!isValid} variant="primary">
          Review & Launch →
        </GlassButton>
      </div>
    </div>
  )
}

