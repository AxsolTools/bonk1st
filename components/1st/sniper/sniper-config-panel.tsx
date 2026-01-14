"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { GoldCard, GoldCardHeader } from "../ui/gold-card"
import { GoldInput, GoldNumberInput, GoldToggle, GoldSelect, GoldSlider } from "../ui/gold-input"
import { GoldButton } from "../ui/gold-button"
import { GoldBadge } from "../ui/gold-badge"
import type { SniperConfig, TargetPool } from "@/lib/1st/sniper-config"
import { DEFAULT_SNIPER_CONFIG, AGGRESSIVE_SNIPER_CONFIG, CONSERVATIVE_SNIPER_CONFIG } from "@/lib/1st/sniper-config"

interface SniperConfigPanelProps {
  config: SniperConfig
  onConfigChange: (updates: Partial<SniperConfig>) => void
  onSave?: () => void
  isDirty?: boolean
  isSaving?: boolean
  lastSavedAt?: number | null
  disabled?: boolean
  className?: string
}

type ConfigSection = 'timing' | 'filters' | 'execution' | 'autosell' | 'safety' | 'advanced'

export function SniperConfigPanel({
  config,
  onConfigChange,
  onSave,
  isDirty = false,
  isSaving = false,
  lastSavedAt = null,
  disabled = false,
  className,
}: SniperConfigPanelProps) {
  const [activeSection, setActiveSection] = React.useState<ConfigSection>('timing')
  
  const sections: { id: ConfigSection; label: string; icon: string }[] = [
    { id: 'timing', label: 'TIMING', icon: '⏱' },
    { id: 'filters', label: 'FILTERS', icon: '🔍' },
    { id: 'execution', label: 'EXECUTION', icon: '⚡' },
    { id: 'autosell', label: 'AUTO-SELL', icon: '💰' },
    { id: 'safety', label: 'SAFETY', icon: '🛡' },
    { id: 'advanced', label: 'ADVANCED', icon: '⚙' },
  ]
  
  const applyPreset = (preset: 'default' | 'aggressive' | 'conservative') => {
    switch (preset) {
      case 'aggressive':
        onConfigChange({ ...DEFAULT_SNIPER_CONFIG, ...AGGRESSIVE_SNIPER_CONFIG })
        break
      case 'conservative':
        onConfigChange({ ...DEFAULT_SNIPER_CONFIG, ...CONSERVATIVE_SNIPER_CONFIG })
        break
      default:
        onConfigChange(DEFAULT_SNIPER_CONFIG)
    }
  }
  
  const poolOptions: { value: TargetPool; label: string }[] = [
    { value: 'bonk-usd1', label: 'BONK/USD1' },
    { value: 'bonk-sol', label: 'BONK/SOL' },
    { value: 'pump', label: 'Pump.fun' },
    { value: 'raydium', label: 'Raydium' },
  ]
  
  const togglePool = (pool: TargetPool) => {
    const current = config.targetPools
    if (current.includes(pool)) {
      onConfigChange({ targetPools: current.filter(p => p !== pool) })
    } else {
      onConfigChange({ targetPools: [...current, pool] })
    }
  }
  
  return (
    <GoldCard variant="elevated" className={cn("", className)}>
      <GoldCardHeader 
        title="Sniper Configuration" 
        subtitle="Fine-tune your hunting parameters"
        action={
          <div className="flex items-center gap-2">
            {/* Save */}
            {onSave && (
              <div className="flex items-center gap-2">
                {isDirty ? (
                  <GoldBadge variant="warning" size="xs">UNSAVED</GoldBadge>
                ) : (
                  <GoldBadge variant="success" size="xs">SAVED</GoldBadge>
                )}
                <GoldButton
                  size="sm"
                  variant="primary"
                  disabled={disabled || !isDirty || isSaving}
                  onClick={onSave}
                >
                  {isSaving ? 'SAVING…' : 'SAVE'}
                </GoldButton>
              </div>
            )}

            <div className="h-6 w-px bg-white/10" />

            {/* Presets */}
            <GoldButton size="sm" variant="ghost" onClick={() => applyPreset('conservative')}>
              SAFE
            </GoldButton>
            <GoldButton size="sm" variant="ghost" onClick={() => applyPreset('default')}>
              DEFAULT
            </GoldButton>
            <GoldButton size="sm" variant="ghost" onClick={() => applyPreset('aggressive')}>
              DEGEN
            </GoldButton>
          </div>
        }
      />
      
      {/* Section Tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-2 -mx-1 px-1">
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => setActiveSection(section.id)}
            disabled={disabled}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider rounded transition-all whitespace-nowrap",
              activeSection === section.id
                ? "bg-[#D4AF37]/20 text-[#FFD700] border border-[#D4AF37]/40"
                : "text-white/50 hover:text-white hover:bg-white/5 border border-transparent"
            )}
          >
            <span>{section.icon}</span>
            {section.label}
          </button>
        ))}
      </div>
      
      {/* Section Content */}
      <div className="space-y-4">
        {/* TIMING */}
        {activeSection === 'timing' && (
          <div className="space-y-4">
            <div className="p-3 bg-[#D4AF37]/5 border border-[#D4AF37]/20 rounded-lg">
              <GoldToggle
                checked={config.snipeBlockZero}
                onChange={(checked) => onConfigChange({ snipeBlockZero: checked })}
                label="Block Zero Sniping"
                description="Maximum speed, maximum risk. Snipe at token creation block."
                disabled={disabled}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <GoldNumberInput
                label="Min Block Delay"
                value={config.minBlockDelay}
                onChange={(value) => onConfigChange({ minBlockDelay: value })}
                min={0}
                max={100}
                hint="Blocks to wait before sniping (0 = instant)"
                disabled={disabled}
              />
              <GoldNumberInput
                label="Max Block Delay"
                value={config.maxBlockDelay}
                onChange={(value) => onConfigChange({ maxBlockDelay: value })}
                min={0}
                max={100}
                hint="Max blocks after creation to still snipe"
                disabled={disabled}
              />
            </div>
          </div>
        )}
        
        {/* FILTERS */}
        {activeSection === 'filters' && (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-white/70 uppercase tracking-wider mb-2">
                Target Pools
              </p>
              <div className="flex flex-wrap gap-2">
                {poolOptions.map((pool) => (
                  <button
                    key={pool.value}
                    onClick={() => togglePool(pool.value)}
                    disabled={disabled}
                    className={cn(
                      "px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all",
                      config.targetPools.includes(pool.value)
                        ? "bg-[#D4AF37]/20 text-[#FFD700] border-[#D4AF37]/50"
                        : "bg-transparent text-white/50 border-white/10 hover:border-white/30"
                    )}
                  >
                    {pool.label}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <GoldNumberInput
                label="Min Holders"
                value={config.minHolders}
                onChange={(value) => onConfigChange({ minHolders: value })}
                min={0}
                max={10000}
                disabled={disabled}
              />
              <GoldNumberInput
                label="Max Holders"
                value={config.maxHolders}
                onChange={(value) => onConfigChange({ maxHolders: value })}
                min={0}
                max={100000}
                disabled={disabled}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <GoldNumberInput
                label="Min Liquidity (USD)"
                value={config.minLiquidityUsd}
                onChange={(value) => onConfigChange({ minLiquidityUsd: value })}
                min={0}
                max={1000000}
                step={100}
                disabled={disabled}
              />
              <GoldNumberInput
                label="Max Market Cap (USD)"
                value={config.maxMarketCap}
                onChange={(value) => onConfigChange({ maxMarketCap: value })}
                min={0}
                max={10000000}
                step={1000}
                disabled={disabled}
              />
            </div>
            
            <GoldSlider
              label="Max Dev Holdings"
              value={config.maxDevHoldings}
              onChange={(value) => onConfigChange({ maxDevHoldings: value })}
              min={0}
              max={100}
              formatValue={(v) => `${v}%`}
            />
            
            <GoldToggle
              checked={config.snipeOnDevSell}
              onChange={(checked) => onConfigChange({ snipeOnDevSell: checked })}
              label="Snipe on Dev Sell"
              description="Contrarian play: Buy when dev dumps"
              disabled={disabled}
            />
          </div>
        )}
        
        {/* EXECUTION */}
        {activeSection === 'execution' && (
          <div className="space-y-4">
            <GoldToggle
              checked={config.useUsd1}
              onChange={(checked) => onConfigChange({ useUsd1: checked })}
              label="Use USD1"
              description="Pay with USD1 instead of SOL (for USD1 pools)"
              disabled={disabled}
            />
            
            <div className="grid grid-cols-2 gap-4">
              <GoldNumberInput
                label={config.useUsd1 ? "Buy Amount (USD1)" : "Buy Amount (SOL)"}
                value={config.useUsd1 ? config.buyAmountUsd1 : config.buyAmountSol}
                onChange={(value) => onConfigChange(
                  config.useUsd1 ? { buyAmountUsd1: value } : { buyAmountSol: value }
                )}
                min={0.001}
                max={100}
                step={0.1}
                disabled={disabled}
              />
              <GoldNumberInput
                label="Max Single Snipe (SOL)"
                value={config.maxSingleSnipeSol}
                onChange={(value) => onConfigChange({ maxSingleSnipeSol: value })}
                min={0.01}
                max={10}
                step={0.1}
                disabled={disabled}
              />
            </div>
            
            <GoldSlider
              label="Slippage Tolerance"
              value={config.slippageBps / 100}
              onChange={(value) => onConfigChange({ slippageBps: value * 100 })}
              min={1}
              max={50}
              formatValue={(v) => `${v}%`}
            />
            
            <GoldNumberInput
              label="Priority Fee (lamports)"
              value={config.priorityFeeLamports}
              onChange={(value) => onConfigChange({ priorityFeeLamports: value })}
              min={0}
              max={10000000}
              step={10000}
              hint="Higher = faster inclusion (Jito tip)"
              disabled={disabled}
            />
          </div>
        )}
        
        {/* AUTO-SELL */}
        {activeSection === 'autosell' && (
          <div className="space-y-4">
            <GoldToggle
              checked={config.autoSellEnabled}
              onChange={(checked) => onConfigChange({ autoSellEnabled: checked })}
              label="Enable Auto-Sell"
              description="Automatically sell based on profit/loss targets"
              disabled={disabled}
            />
            
            {config.autoSellEnabled && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-[#00FF41]/5 border border-[#00FF41]/20 rounded-lg">
                    <GoldSlider
                      label="Take Profit"
                      value={config.takeProfitPercent}
                      onChange={(value) => onConfigChange({ takeProfitPercent: value })}
                      min={10}
                      max={1000}
                      formatValue={(v) => `+${v}% (${(1 + v/100).toFixed(1)}x)`}
                    />
                  </div>
                  <div className="p-3 bg-[#FF3333]/5 border border-[#FF3333]/20 rounded-lg">
                    <GoldSlider
                      label="Stop Loss"
                      value={config.stopLossPercent}
                      onChange={(value) => onConfigChange({ stopLossPercent: value })}
                      min={5}
                      max={95}
                      formatValue={(v) => `-${v}%`}
                    />
                  </div>
                </div>
                
                <GoldToggle
                  checked={config.trailingStopEnabled}
                  onChange={(checked) => onConfigChange({ trailingStopEnabled: checked })}
                  label="Trailing Stop"
                  description="Lock in profits as price rises"
                  disabled={disabled}
                />
                
                {config.trailingStopEnabled && (
                  <GoldSlider
                    label="Trailing Stop Distance"
                    value={config.trailingStopPercent}
                    onChange={(value) => onConfigChange({ trailingStopPercent: value })}
                    min={5}
                    max={50}
                    formatValue={(v) => `${v}% from peak`}
                  />
                )}
                
                <GoldToggle
                  checked={config.sellOnDevSell}
                  onChange={(checked) => onConfigChange({ sellOnDevSell: checked })}
                  label="Sell When Dev Sells"
                  description="Exit position if developer sells"
                  disabled={disabled}
                />
                
                <GoldSlider
                  label="Sell Percentage"
                  value={config.sellPercentOnTrigger}
                  onChange={(value) => onConfigChange({ sellPercentOnTrigger: value })}
                  min={10}
                  max={100}
                  step={10}
                  formatValue={(v) => `${v}%`}
                />
              </>
            )}
          </div>
        )}
        
        {/* SAFETY */}
        {activeSection === 'safety' && (
          <div className="space-y-4">
            <div className="p-3 bg-[#FF3333]/5 border border-[#FF3333]/20 rounded-lg">
              <GoldToggle
                checked={config.emergencyStopEnabled}
                onChange={(checked) => onConfigChange({ emergencyStopEnabled: checked })}
                label="Emergency Stop Enabled"
                description="Kill switch to immediately stop all sniping"
                disabled={disabled}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <GoldNumberInput
                label="Max Concurrent Snipes"
                value={config.maxConcurrentSnipes}
                onChange={(value) => onConfigChange({ maxConcurrentSnipes: value })}
                min={1}
                max={20}
                disabled={disabled}
              />
              <GoldNumberInput
                label="Daily Budget (SOL)"
                value={config.dailyBudgetSol}
                onChange={(value) => onConfigChange({ dailyBudgetSol: value })}
                min={0.1}
                max={100}
                step={0.1}
                disabled={disabled}
              />
            </div>
            
            <GoldNumberInput
              label="Cooldown Between Snipes (seconds)"
              value={config.cooldownBetweenSnipes}
              onChange={(value) => onConfigChange({ cooldownBetweenSnipes: value })}
              min={0}
              max={60}
              disabled={disabled}
            />
            
            <div>
              <p className="text-xs font-semibold text-white/70 uppercase tracking-wider mb-2">
                Token Blacklist
              </p>
              <GoldInput
                placeholder="Enter token mint addresses (comma separated)"
                value={config.blacklistTokens.join(', ')}
                onChange={(e) => onConfigChange({ 
                  blacklistTokens: e.target.value.split(',').map(s => s.trim()).filter(Boolean) 
                })}
                disabled={disabled}
              />
            </div>
          </div>
        )}
        
        {/* ADVANCED */}
        {activeSection === 'advanced' && (
          <div className="space-y-4">
            <GoldToggle
              checked={config.antiRugEnabled}
              onChange={(checked) => onConfigChange({ antiRugEnabled: checked })}
              label="Anti-Rug Protection"
              description="Auto-exit if rug pull indicators detected"
              disabled={disabled}
            />
            
            {config.antiRugEnabled && (
              <div className="grid grid-cols-2 gap-4">
                <GoldSlider
                  label="Max Dev Sell %"
                  value={config.antiRugMaxDevSellPercent}
                  onChange={(value) => onConfigChange({ antiRugMaxDevSellPercent: value })}
                  min={10}
                  max={100}
                  formatValue={(v) => `${v}%`}
                />
                <GoldSlider
                  label="Min Liquidity %"
                  value={config.antiRugMinLiquidityPercent}
                  onChange={(value) => onConfigChange({ antiRugMinLiquidityPercent: value })}
                  min={10}
                  max={100}
                  formatValue={(v) => `${v}%`}
                />
              </div>
            )}
            
            <GoldToggle
              checked={config.bundleEnabled}
              onChange={(checked) => onConfigChange({ bundleEnabled: checked })}
              label="Jito Bundle Mode"
              description="Use Jito bundles for MEV protection"
              disabled={disabled}
            />
            
            <GoldToggle
              checked={config.retryOnFail}
              onChange={(checked) => onConfigChange({ retryOnFail: checked })}
              label="Retry Failed Snipes"
              description="Automatically retry if snipe fails"
              disabled={disabled}
            />
            
            {config.retryOnFail && (
              <GoldNumberInput
                label="Max Retries"
                value={config.maxRetries}
                onChange={(value) => onConfigChange({ maxRetries: value })}
                min={1}
                max={5}
                disabled={disabled}
              />
            )}
            
            <div className="grid grid-cols-2 gap-4">
              <GoldToggle
                checked={config.onlyVerifiedDevs}
                onChange={(checked) => onConfigChange({ onlyVerifiedDevs: checked })}
                label="Verified Devs Only"
                disabled={disabled}
              />
              <GoldToggle
                checked={config.requireSocialLinks}
                onChange={(checked) => onConfigChange({ requireSocialLinks: checked })}
                label="Require Socials"
                disabled={disabled}
              />
            </div>
          </div>
        )}
      </div>
    </GoldCard>
  )
}

