"use client"

import type { Token22FormData } from "./token22-wizard"
import { GlassInput, GlassButton } from "@/components/ui/glass-panel"
import { PieChart, Users, Droplets, Lock, AlertTriangle } from "lucide-react"

interface Step22DistributionProps {
  formData: Token22FormData
  updateFormData: (updates: Partial<Token22FormData>) => void
  onNext: () => void
  onBack: () => void
}

export function Step22Distribution({ formData, updateFormData, onNext, onBack }: Step22DistributionProps) {
  // Calculate remaining allocation
  const totalAllocated = formData.teamAllocation + formData.lpAllocation + formData.lockedAllocation
  const isValid = totalAllocated === 100

  // Update allocations ensuring they total 100
  const updateAllocation = (field: 'teamAllocation' | 'lpAllocation' | 'lockedAllocation', value: number) => {
    updateFormData({ [field]: Math.min(100, Math.max(0, value)) })
  }

  // Calculate actual token amounts
  const totalSupply = parseFloat(formData.totalSupply) || 0
  const teamTokens = (totalSupply * formData.teamAllocation / 100).toLocaleString()
  const lpTokens = (totalSupply * formData.lpAllocation / 100).toLocaleString()
  const lockedTokens = (totalSupply * formData.lockedAllocation / 100).toLocaleString()

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20">
        <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
          <PieChart className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <p className="text-sm font-medium text-purple-400">Supply Distribution</p>
          <p className="text-xs text-white/60">Control where your tokens go. Unlike pump.fun, you decide.</p>
        </div>
      </div>

      {/* Allocation Cards */}
      <div className="space-y-4">
        {/* Team Allocation */}
        <div className="p-5 rounded-xl bg-white/5 border border-white/10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-white">Team Allocation</h3>
              <p className="text-xs text-white/50">For team, marketing, advisors, airdrops</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-blue-400">{formData.teamAllocation}%</p>
              <p className="text-xs text-white/40">{teamTokens} tokens</p>
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={50}
            step={1}
            value={formData.teamAllocation}
            onChange={(e) => updateAllocation('teamAllocation', parseInt(e.target.value))}
            className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
          <div className="flex justify-between text-xs text-white/40 mt-2">
            <span>0%</span>
            <span>25%</span>
            <span>50%</span>
          </div>
        </div>

        {/* Liquidity Pool Allocation */}
        <div className="p-5 rounded-xl bg-white/5 border border-white/10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
              <Droplets className="w-5 h-5 text-cyan-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-white">Liquidity Pool</h3>
              <p className="text-xs text-white/50">Tokens paired with SOL in Raydium pool</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-cyan-400">{formData.lpAllocation}%</p>
              <p className="text-xs text-white/40">{lpTokens} tokens</p>
            </div>
          </div>
          <input
            type="range"
            min={20}
            max={100}
            step={1}
            value={formData.lpAllocation}
            onChange={(e) => updateAllocation('lpAllocation', parseInt(e.target.value))}
            className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-500"
          />
          <div className="flex justify-between text-xs text-white/40 mt-2">
            <span>20% min</span>
            <span>60%</span>
            <span>100%</span>
          </div>
        </div>

        {/* Locked Allocation */}
        <div className="p-5 rounded-xl bg-white/5 border border-white/10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <Lock className="w-5 h-5 text-amber-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-white">Locked / Vested</h3>
              <p className="text-xs text-white/50">Tokens locked for future unlocking</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-amber-400">{formData.lockedAllocation}%</p>
              <p className="text-xs text-white/40">{lockedTokens} tokens</p>
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={50}
            step={1}
            value={formData.lockedAllocation}
            onChange={(e) => updateAllocation('lockedAllocation', parseInt(e.target.value))}
            className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-amber-500"
          />
          <div className="flex justify-between text-xs text-white/40 mt-2">
            <span>0%</span>
            <span>25%</span>
            <span>50%</span>
          </div>
          
          {formData.lockedAllocation > 0 && (
            <div className="mt-4 pt-4 border-t border-white/10">
              <GlassInput
                label="Lock Duration (days)"
                value={formData.lockDurationDays.toString()}
                onChange={(e) => updateFormData({ lockDurationDays: parseInt(e.target.value) || 0 })}
                placeholder="90"
                hint="How long tokens will be locked"
              />
            </div>
          )}
        </div>
      </div>

      {/* Total Check */}
      <div className={`p-4 rounded-xl flex items-center justify-between ${
        isValid 
          ? 'bg-emerald-500/10 border border-emerald-500/30' 
          : 'bg-red-500/10 border border-red-500/30'
      }`}>
        <div className="flex items-center gap-3">
          {isValid ? (
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <span className="text-emerald-400">✓</span>
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-red-400" />
            </div>
          )}
          <div>
            <p className={`text-sm font-medium ${isValid ? 'text-emerald-400' : 'text-red-400'}`}>
              Total Allocated: {totalAllocated}%
            </p>
            <p className="text-xs text-white/50">
              {isValid ? 'Distribution is complete' : 'Must equal 100%'}
            </p>
          </div>
        </div>
        
        {!isValid && (
          <button
            onClick={() => {
              // Auto-adjust LP allocation to make total = 100
              const remaining = 100 - formData.teamAllocation - formData.lockedAllocation
              updateFormData({ lpAllocation: Math.max(20, remaining) })
            }}
            className="text-xs px-3 py-1.5 rounded-lg bg-white/10 text-white/70 hover:bg-white/20 transition-colors"
          >
            Auto-fix
          </button>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <GlassButton onClick={onBack} variant="outline">
          ← Back
        </GlassButton>
        <GlassButton onClick={onNext} disabled={!isValid} variant="primary">
          Continue to Liquidity →
        </GlassButton>
      </div>
    </div>
  )
}

