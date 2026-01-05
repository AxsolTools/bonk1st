"use client"

import type { Token22FormData } from "./token22-wizard"
import { GlassInput, GlassButton } from "@/components/ui/glass-panel"
import { Switch } from "@/components/ui/switch"
import { Info, Shield, Zap, Coins, Lock, Flame } from "lucide-react"

interface Step22ExtensionsProps {
  formData: Token22FormData
  updateFormData: (updates: Partial<Token22FormData>) => void
  onNext: () => void
  onBack: () => void
}

export function Step22Extensions({ formData, updateFormData, onNext, onBack }: Step22ExtensionsProps) {
  // Transfer fee in percentage for display
  const transferFeePercent = (formData.transferFeeBasisPoints / 100).toFixed(2)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <p className="text-white/60 text-sm">
          Token-2022 extensions give you advanced control. These features are baked into the token standard.
        </p>
      </div>

      {/* Tokenomics */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-white flex items-center gap-2">
          <Coins className="w-4 h-4 text-cyan-400" />
          Supply Settings
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <GlassInput
            label="Total Supply"
            value={formData.totalSupply}
            onChange={(e) => updateFormData({ totalSupply: e.target.value.replace(/[^0-9]/g, '') })}
            placeholder="1000000000"
            hint="Total tokens to mint"
          />
          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/80">Decimals</label>
            <select
              value={formData.decimals}
              onChange={(e) => updateFormData({ decimals: parseInt(e.target.value) })}
              className="w-full h-12 px-4 rounded-xl bg-white/5 border border-white/10 text-white focus:border-cyan-500/50 focus:outline-none transition-colors"
            >
              <option value={6} className="bg-slate-900">6 (Standard)</option>
              <option value={9} className="bg-slate-900">9 (High precision)</option>
              <option value={0} className="bg-slate-900">0 (NFT-like)</option>
            </select>
            <p className="text-xs text-white/40">6 decimals is standard for most tokens</p>
          </div>
        </div>
      </div>

      {/* Transfer Fee Extension */}
      <div className="p-5 rounded-xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
              <Zap className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-white">Transfer Fee</h3>
              <p className="text-xs text-white/60 mt-1">
                Collect a % on every transfer. Fee goes directly to you. Perfect for reflections.
              </p>
            </div>
          </div>
          <Switch
            checked={formData.enableTransferFee}
            onCheckedChange={(checked) => updateFormData({ enableTransferFee: checked })}
          />
        </div>

        {formData.enableTransferFee && (
          <div className="space-y-4 mt-4 pt-4 border-t border-amber-500/20">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-white/80">Fee Percentage</label>
                <span className="text-sm font-medium text-amber-400">{transferFeePercent}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={500}
                step={10}
                value={formData.transferFeeBasisPoints}
                onChange={(e) => updateFormData({ transferFeeBasisPoints: parseInt(e.target.value) })}
                className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
              <div className="flex justify-between text-xs text-white/40 mt-1">
                <span>0%</span>
                <span>1%</span>
                <span>2.5%</span>
                <span>5% max</span>
              </div>
            </div>
            <GlassInput
              label="Max Fee per Transfer (tokens)"
              value={formData.maxTransferFee}
              onChange={(e) => updateFormData({ maxTransferFee: e.target.value.replace(/[^0-9]/g, '') })}
              placeholder="1000000"
              hint="Cap the fee on large transfers"
            />
          </div>
        )}
      </div>

      {/* Authority Controls */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-white flex items-center gap-2">
          <Shield className="w-4 h-4 text-purple-400" />
          Authority Controls
        </h3>
        
        <div className="space-y-3">
          {/* Revoke Mint Authority */}
          <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center flex-shrink-0">
                <Flame className="w-4 h-4 text-red-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">Revoke Mint Authority</p>
                <p className="text-xs text-white/50 mt-0.5">
                  Prevents minting more tokens. Required for most DEXs.
                </p>
              </div>
            </div>
            <Switch
              checked={formData.revokeMintAuthority}
              onCheckedChange={(checked) => updateFormData({ revokeMintAuthority: checked })}
            />
          </div>

          {/* Revoke Freeze Authority */}
          <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                <Lock className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">Revoke Freeze Authority</p>
                <p className="text-xs text-white/50 mt-0.5">
                  Prevents freezing token accounts. Increases trust.
                </p>
              </div>
            </div>
            <Switch
              checked={formData.revokeFreezeAuthority}
              onCheckedChange={(checked) => updateFormData({ revokeFreezeAuthority: checked })}
            />
          </div>
        </div>

        {/* Warning if keeping mint authority */}
        {!formData.revokeMintAuthority && (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-2">
            <Info className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-400/90">
              Keeping mint authority means you can create more tokens later. Some traders see this as a red flag.
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <GlassButton onClick={onBack} variant="outline">
          ← Back
        </GlassButton>
        <GlassButton onClick={onNext} variant="primary">
          Continue to Distribution →
        </GlassButton>
      </div>
    </div>
  )
}

