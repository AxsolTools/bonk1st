"use client"

import type { TokenFormData } from "./launch-wizard"
import { GlassButton } from "@/components/ui/glass-panel"
import { cn } from "@/lib/utils"

interface StepTokenomicsProps {
  formData: TokenFormData
  updateFormData: (updates: Partial<TokenFormData>) => void
  onNext: () => void
  onBack: () => void
}

const supplyPresets = [
  { value: "1000000", label: "1M" },
  { value: "100000000", label: "100M" },
  { value: "1000000000", label: "1B" },
  { value: "1000000000000", label: "1T" },
]

export function StepTokenomics({ formData, updateFormData, onNext, onBack }: StepTokenomicsProps) {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <p className="text-white/60 text-sm">Set your token's supply. Most successful tokens use 1B supply.</p>
      </div>

      <div className="space-y-6">
        {/* Total Supply */}
        <div>
          <label className="block text-sm font-medium text-white/80 mb-2">Total Supply</label>
          <input
            type="text"
            value={Number(formData.totalSupply).toLocaleString()}
            onChange={(e) => {
              const value = e.target.value.replace(/,/g, "")
              if (/^\d*$/.test(value)) {
                updateFormData({ totalSupply: value })
              }
            }}
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white font-mono focus:outline-none focus:border-cyan-500/50 focus:bg-white/10 transition-all"
          />
          <div className="flex gap-2 mt-3">
            {supplyPresets.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => updateFormData({ totalSupply: preset.value })}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                  formData.totalSupply === preset.value
                    ? "bg-cyan-500 text-black"
                    : "bg-white/5 text-white/70 border border-white/10 hover:border-cyan-500/30 hover:bg-white/10"
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Initial Buy (SOL) */}
        <div>
          <label className="block text-sm font-medium text-white/80 mb-2">Initial Purchase (SOL)</label>
          <div className="relative">
            <input
              type="text"
              value={formData.initialBuySol}
              onChange={(e) => {
                const value = e.target.value.replace(/,/g, "")
                if (/^\d*\.?\d*$/.test(value)) {
                  updateFormData({ initialBuySol: value })
                }
              }}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white font-mono focus:outline-none focus:border-cyan-500/50 transition-all pr-16"
              placeholder="0.0"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-cyan-400 font-medium">
              SOL
            </span>
          </div>
          <p className="text-xs text-white/40 mt-2">
            Amount of SOL your dev wallet will spend to buy tokens at launch. This is your first purchase and creates initial liquidity on the bonding curve.
          </p>
        </div>

        {/* Supply Info */}
        <div className="p-5 rounded-xl bg-white/5 border border-white/10">
          <h3 className="text-sm font-medium text-white mb-4">Supply Information</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/60">Total Supply</span>
              <span className="text-sm font-mono text-white">
                {Number(formData.totalSupply).toLocaleString()} tokens
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/60">Decimals</span>
              <span className="text-sm font-mono text-white">
                6 (pump.fun standard)
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/60">Initial Purchase</span>
              <span className="text-sm font-mono text-cyan-400">
                {parseFloat(formData.initialBuySol) || 0} SOL
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <GlassButton onClick={onBack} variant="outline">
          ← Back
        </GlassButton>
        <GlassButton onClick={onNext} variant="primary">
          Continue →
        </GlassButton>
      </div>
    </div>
  )
}
