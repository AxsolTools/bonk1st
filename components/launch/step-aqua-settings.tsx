"use client"

import type { TokenFormData } from "./launch-wizard"
import { GlassButton } from "@/components/ui/glass-panel"
import { cn } from "@/lib/utils"

interface StepAquaSettingsProps {
  formData: TokenFormData
  updateFormData: (updates: Partial<TokenFormData>) => void
  onNext: () => void
  onBack: () => void
}

export function StepAquaSettings({ formData, updateFormData, onNext, onBack }: StepAquaSettingsProps) {
  // Calculate projected metrics
  const dailyLiquidityGrowth = formData.pourEnabled 
    ? formData.pourInterval === 'hourly' ? formData.pourRate * 24 : formData.pourRate 
    : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-4 rounded-xl bg-gradient-to-r from-cyan-500/10 to-teal-500/10 border border-cyan-500/20">
        <p className="text-white/80 text-sm">
          🌊 <span className="font-medium text-cyan-400">This is where the alpha happens.</span> Set up your liquidity mechanics to make your chart look 
          <span className="text-green-400 font-bold"> thicc </span> 
          and keep degens coming back for more.
        </p>
      </div>

      {/* Section 1: Liquidity Engine (Pour Rate) */}
      <div className="p-5 rounded-xl bg-white/5 border border-cyan-500/20">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center text-lg">
              💧
            </div>
            <div>
              <div className="text-sm font-medium text-white">Liquidity Engine</div>
              <div className="text-xs text-white/40">Auto-pump liquidity into your pool</div>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={formData.pourEnabled}
              onChange={(e) => updateFormData({ pourEnabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
          </label>
        </div>

        {formData.pourEnabled && (
          <>
            {/* Pour Rate Slider */}
            <div className="mb-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-white/60">Pour Rate</span>
                <span className="text-2xl font-bold text-cyan-400">{formData.pourRate}%</span>
              </div>
              <div className="h-3 rounded-full bg-black/30 overflow-hidden mb-2">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300 rounded-full"
                  style={{ width: `${(formData.pourRate / 10) * 100}%` }}
                />
              </div>
              <input
                type="range"
                min="0.5"
                max="10"
                step="0.5"
                value={formData.pourRate}
                onChange={(e) => updateFormData({ pourRate: Number(e.target.value) })}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-white/10 
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 
                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400 
                  [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-lg"
              />
              <div className="flex justify-between text-xs text-white/40 mt-1">
                <span>0.5% (Slow drip)</span>
                <span>10% (Firehose 🚿)</span>
              </div>
            </div>

            {/* Pour Interval & Source */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-white/60 mb-2">How often?</label>
                <div className="flex gap-2">
                  {(['hourly', 'daily'] as const).map((interval) => (
                    <button
                      key={interval}
                      onClick={() => updateFormData({ pourInterval: interval })}
                      className={cn(
                        "flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all border",
                        formData.pourInterval === interval
                          ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-400"
                          : "bg-white/5 border-white/10 text-white/60 hover:border-white/20"
                      )}
                    >
                      {interval === 'hourly' ? '⚡ Every Hour' : '📅 Daily'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs text-white/60 mb-2">Pour from?</label>
                <select
                  value={formData.pourSource}
                  onChange={(e) => updateFormData({ pourSource: e.target.value as 'fees' | 'treasury' | 'both' })}
                  className="w-full py-2 px-3 rounded-lg text-xs font-medium bg-white/5 border border-white/10 text-white/80 cursor-pointer"
                >
                  <option value="fees">💰 Trading Fees</option>
                  <option value="treasury">🏦 Treasury</option>
                  <option value="both">🔄 Both</option>
                </select>
              </div>
            </div>

            <p className="text-xs text-cyan-400/70 mt-3 italic">
              💡 TL;DR: {formData.pourRate}% of {formData.pourSource === 'fees' ? 'your trading fees' : formData.pourSource === 'treasury' ? 'your treasury' : 'fees + treasury'} gets pumped back into liquidity {formData.pourInterval === 'hourly' ? 'every hour' : 'daily'}. More liquidity = healthier chart = happier degens.
            </p>
          </>
        )}
      </div>

      {/* Section 2: Burn Mechanics (Evaporation) */}
      <div className="p-5 rounded-xl bg-white/5 border border-orange-500/20">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center text-lg">
              🔥
            </div>
            <div>
              <div className="text-sm font-medium text-white">Burn Mechanics</div>
              <div className="text-xs text-white/40">Auto-burn when dev wallet buys</div>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={formData.evaporationEnabled}
              onChange={(e) => updateFormData({ evaporationEnabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
          </label>
        </div>

        {formData.evaporationEnabled && (
          <>
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-white/60">Burn Rate</span>
              <span className="text-2xl font-bold text-orange-400">{formData.evaporationRate}%</span>
            </div>
            <div className="h-3 rounded-full bg-black/30 overflow-hidden mb-2">
              <div
                className="h-full bg-gradient-to-r from-orange-500 to-red-500 transition-all duration-300 rounded-full"
                style={{ width: `${(formData.evaporationRate / 5) * 100}%` }}
              />
            </div>
            <input
              type="range"
              min="0.5"
              max="5"
              step="0.5"
              value={formData.evaporationRate}
              onChange={(e) => updateFormData({ evaporationRate: Number(e.target.value) })}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-white/10
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-orange-400 
                [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-lg"
            />
            <div className="flex justify-between text-xs text-white/40 mt-1">
              <span>0.5% (Light toast)</span>
              <span>5% (Crispy 🥓)</span>
            </div>

            <p className="text-xs text-orange-400/70 mt-3 italic">
              💡 TL;DR: When your dev wallet buys, {formData.evaporationRate}% of those tokens get burned forever. Less supply = more scarcity = 📈
            </p>
          </>
        )}
      </div>

      {/* Section 3: Fee Distribution */}
      <div className="p-5 rounded-xl bg-white/5 border border-purple-500/20">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center text-lg">
            💰
          </div>
          <div>
            <div className="text-sm font-medium text-white">Fee Distribution</div>
            <div className="text-xs text-white/40">Split your trading fees</div>
          </div>
        </div>

        <div className="flex items-center gap-4 mb-4">
          <div className="flex-1">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-purple-400">You Pocket</span>
              <span className="text-lg font-bold text-purple-400">{formData.feeToCreator}%</span>
            </div>
            <div className="h-3 rounded-full bg-purple-500/30 overflow-hidden">
              <div
                className="h-full bg-purple-500 transition-all duration-300 rounded-full"
                style={{ width: `${formData.feeToCreator}%` }}
              />
            </div>
          </div>
          <div className="text-white/40">→</div>
          <div className="flex-1">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-cyan-400">Back to Liquidity</span>
              <span className="text-lg font-bold text-cyan-400">{formData.feeToLiquidity}%</span>
            </div>
            <div className="h-3 rounded-full bg-cyan-500/30 overflow-hidden">
              <div
                className="h-full bg-cyan-500 transition-all duration-300 rounded-full"
                style={{ width: `${formData.feeToLiquidity}%` }}
              />
            </div>
          </div>
        </div>

        <input
          type="range"
          min="0"
          max="100"
          step="5"
          value={formData.feeToCreator}
          onChange={(e) => {
            const creator = Number(e.target.value)
            updateFormData({ feeToCreator: creator, feeToLiquidity: 100 - creator })
          }}
          className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-gradient-to-r from-cyan-500/30 to-purple-500/30
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white 
            [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-lg"
        />
        <div className="flex justify-between text-xs text-white/40 mt-1">
          <span>100% to Liquidity 🌊</span>
          <span>100% to You 💵</span>
        </div>

        <p className="text-xs text-purple-400/70 mt-3 italic">
          💡 TL;DR: Every trade generates fees. You keep {formData.feeToCreator}%, and {formData.feeToLiquidity}% flows back into liquidity. More to liquidity = stronger chart.
        </p>
      </div>

      {/* Section 4: Auto-Harvest */}
      <div className="p-5 rounded-xl bg-white/5 border border-amber-500/20">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center text-lg">
              🌊
            </div>
            <div>
              <div className="text-sm font-medium text-white">Auto-Harvest</div>
              <div className="text-xs text-white/40">Automatically collect your rewards</div>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={formData.autoClaimEnabled}
              onChange={(e) => updateFormData({ autoClaimEnabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
          </label>
        </div>

        {formData.autoClaimEnabled && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-white/60 mb-2">Claim when rewards hit</label>
              <div className="relative">
                <input
                  type="number"
                  min="0.01"
                  max="10"
                  step="0.01"
                  value={formData.claimThreshold}
                  onChange={(e) => updateFormData({ claimThreshold: Number(e.target.value) })}
                  className="w-full py-2 px-3 rounded-lg text-sm font-medium bg-white/5 border border-white/10 text-white/80"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-amber-400">SOL</span>
              </div>
            </div>
            <div>
              <label className="block text-xs text-white/60 mb-2">Check frequency</label>
              <select
                value={formData.claimInterval}
                onChange={(e) => updateFormData({ claimInterval: e.target.value as 'hourly' | 'daily' | 'weekly' })}
                className="w-full py-2 px-3 rounded-lg text-sm font-medium bg-white/5 border border-white/10 text-white/80 cursor-pointer"
              >
                <option value="hourly">⚡ Hourly</option>
                <option value="daily">📅 Daily</option>
                <option value="weekly">📆 Weekly</option>
              </select>
            </div>
          </div>
        )}

        <p className="text-xs text-amber-400/70 mt-3 italic">
          💡 TL;DR: When your reward pool hits {formData.claimThreshold} SOL, we auto-send it to your wallet. Passive income on autopilot.
        </p>
      </div>

      {/* Projected Metrics Summary */}
      <div className="p-5 rounded-xl bg-gradient-to-r from-green-500/10 to-cyan-500/10 border border-green-500/20">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-sm font-medium text-white">📊 Your Token Mechanics Summary</span>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-xs text-white/40 mb-1">Daily Liquidity Growth</div>
            <div className="text-xl font-bold text-cyan-400">
              {formData.pourEnabled ? `+${dailyLiquidityGrowth.toFixed(1)}%` : 'OFF'}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-white/40 mb-1">Burn on Dev Buy</div>
            <div className="text-xl font-bold text-orange-400">
              {formData.evaporationEnabled ? `${formData.evaporationRate}%` : 'OFF'}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-white/40 mb-1">Your Fee Share</div>
            <div className="text-xl font-bold text-purple-400">{formData.feeToCreator}%</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <GlassButton onClick={onBack} variant="outline">
          ← Back
        </GlassButton>
        <GlassButton onClick={onNext} variant="primary">
          Review & Launch →
        </GlassButton>
      </div>
    </div>
  )
}
