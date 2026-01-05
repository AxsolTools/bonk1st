"use client"

import { useEffect } from "react"
import type { Token22FormData, AntiSniperSettings } from "./token22-wizard"
import { GlassButton } from "@/components/ui/glass-panel"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

interface Step22AntiSniperProps {
  formData: Token22FormData
  updateFormData: (updates: Partial<Token22FormData>) => void
  onNext: () => void
  onBack: () => void
}

export function Step22AntiSniper({ formData, updateFormData, onNext, onBack }: Step22AntiSniperProps) {
  const { antiSniper, bundleWallets, launchWithBundle } = formData

  // Auto-populate sellable wallets when bundle wallets change
  useEffect(() => {
    if (launchWithBundle && bundleWallets.length > 0) {
      const bundleWalletIds = bundleWallets.filter(w => w.selected).map(w => w.walletId)
      if (antiSniper.autoSellWalletIds.length === 0 && bundleWalletIds.length > 0) {
        updateAntiSniper({ autoSellWalletIds: bundleWalletIds })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundleWallets.length, launchWithBundle])

  const updateAntiSniper = (updates: Partial<AntiSniperSettings>) => {
    updateFormData({
      antiSniper: { ...antiSniper, ...updates }
    })
  }

  const toggleWalletForAutoSell = (walletId: string) => {
    const current = antiSniper.autoSellWalletIds
    if (current.includes(walletId)) {
      updateAntiSniper({ autoSellWalletIds: current.filter(id => id !== walletId) })
    } else {
      updateAntiSniper({ autoSellWalletIds: [...current, walletId] })
    }
  }

  const selectAllBundleWallets = () => {
    const allIds = bundleWallets.filter(w => w.selected).map(w => w.walletId)
    updateAntiSniper({ autoSellWalletIds: allIds })
  }

  const deselectAllWallets = () => {
    updateAntiSniper({ autoSellWalletIds: [] })
  }

  // Check if feature can be enabled (needs bundle wallets)
  const canEnableAntiSniper = launchWithBundle && bundleWallets.some(w => w.selected)

  return (
    <div className="space-y-5">
      {/* Enable Toggle */}
      <div className="p-4 rounded-xl bg-white/5 border border-white/10">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Anti-Sniper Protection</h3>
            <p className="text-xs text-white/50 mt-0.5">
              Auto-sell bundle wallets if sniper activity detected (max 8 blocks)
            </p>
            {!canEnableAntiSniper && (
              <p className="text-xs text-amber-400 mt-1">
                ⚠ Requires bundle launch with selected wallets
              </p>
            )}
          </div>
          <Switch
            checked={antiSniper.enabled}
            onCheckedChange={(checked) => updateAntiSniper({ enabled: checked })}
            disabled={!canEnableAntiSniper}
          />
        </div>
      </div>

      {/* Settings - Only show if enabled */}
      {antiSniper.enabled && canEnableAntiSniper && (
        <div className="space-y-4">
          {/* Detection Thresholds */}
          <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-white/70 uppercase tracking-wider">Detection Thresholds</h4>
              <span className="text-[10px] px-2 py-0.5 rounded bg-red-500/20 text-red-400">Triggers Auto-Sell</span>
            </div>

            {/* Max Supply Percent */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-white/60">Max Buy (% Supply)</span>
                <span className="text-xs font-mono text-purple-400">{antiSniper.maxSupplyPercentThreshold}%</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[0.5, 1, 2, 3, 5, 7, 10].map((value) => (
                  <button
                    key={value}
                    onClick={() => updateAntiSniper({ maxSupplyPercentThreshold: value })}
                    className={cn(
                      "px-2.5 py-1 rounded text-xs font-medium transition-all",
                      antiSniper.maxSupplyPercentThreshold === value
                        ? "bg-purple-500 text-white"
                        : "bg-white/5 text-white/60 hover:bg-purple-500/20"
                    )}
                  >
                    {value}%
                  </button>
                ))}
              </div>
            </div>

            {/* Max SOL Amount */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-white/60">Max Buy (SOL)</span>
                <span className="text-xs font-mono text-cyan-400">{antiSniper.maxSolAmountThreshold} SOL</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[1, 2, 5, 10, 20, 30, 50].map((value) => (
                  <button
                    key={value}
                    onClick={() => updateAntiSniper({ maxSolAmountThreshold: value })}
                    className={cn(
                      "px-2.5 py-1 rounded text-xs font-mono transition-all",
                      antiSniper.maxSolAmountThreshold === value
                        ? "bg-cyan-500 text-white"
                        : "bg-white/5 text-white/60 hover:bg-cyan-500/20"
                    )}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>

            {/* Monitoring Window */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-white/60">Monitor Window</span>
                <span className="text-xs font-mono text-amber-400">{antiSniper.monitorBlocksWindow} blocks (~{(antiSniper.monitorBlocksWindow * 0.4).toFixed(1)}s)</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[2, 4, 6, 8].map((blocks) => (
                  <button
                    key={blocks}
                    onClick={() => updateAntiSniper({ monitorBlocksWindow: blocks })}
                    className={cn(
                      "px-2.5 py-1 rounded text-xs font-medium transition-all",
                      antiSniper.monitorBlocksWindow === blocks
                        ? "bg-amber-500 text-white"
                        : "bg-white/5 text-white/60 hover:bg-amber-500/20"
                    )}
                  >
                    {blocks}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-white/40 mt-1.5">
                Max 8 blocks. Most snipers attack in first 6 blocks.
              </p>
            </div>
          </div>

          {/* Take Profit */}
          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="text-xs font-semibold text-white">Take Profit</h4>
                <p className="text-[10px] text-white/50">Auto-sell at target price</p>
              </div>
              <Switch
                checked={antiSniper.takeProfitEnabled}
                onCheckedChange={(checked) => updateAntiSniper({ takeProfitEnabled: checked })}
              />
            </div>
            {antiSniper.takeProfitEnabled && (
              <div className="flex flex-wrap gap-1.5">
                {[1.5, 2, 3, 5, 10].map((mult) => (
                  <button
                    key={mult}
                    onClick={() => updateAntiSniper({ takeProfitMultiplier: mult })}
                    className={cn(
                      "px-3 py-1 rounded text-xs font-medium transition-all",
                      antiSniper.takeProfitMultiplier === mult
                        ? "bg-green-500 text-white"
                        : "bg-white/5 text-white/60 hover:bg-green-500/20"
                    )}
                  >
                    {mult}x
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Sell Configuration */}
          <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
            <h4 className="text-xs font-semibold text-white/70 uppercase tracking-wider">Auto-Sell Config</h4>
            
            {/* Sell Percentage */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-white/60">Sell Amount</span>
                <span className="text-xs font-mono text-blue-400">{antiSniper.sellPercentage}%</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[25, 50, 75, 100].map((pct) => (
                  <button
                    key={pct}
                    onClick={() => updateAntiSniper({ sellPercentage: pct })}
                    className={cn(
                      "px-3 py-1 rounded text-xs font-medium transition-all",
                      antiSniper.sellPercentage === pct
                        ? "bg-blue-500 text-white"
                        : "bg-white/5 text-white/60 hover:bg-blue-500/20"
                    )}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>

            {/* Wallet Selection */}
            <div className="pt-3 border-t border-white/10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-white/60">Wallets to Sell</span>
                <div className="flex items-center gap-2 text-[10px]">
                  <button onClick={selectAllBundleWallets} className="text-cyan-400 hover:underline">All</button>
                  <span className="text-white/20">|</span>
                  <button onClick={deselectAllWallets} className="text-white/40 hover:underline">Clear</button>
                </div>
              </div>

              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {bundleWallets.filter(w => w.selected).map((wallet) => (
                  <button
                    key={wallet.walletId}
                    onClick={() => toggleWalletForAutoSell(wallet.walletId)}
                    className={cn(
                      "w-full flex items-center gap-2 p-2 rounded border transition-all text-left",
                      antiSniper.autoSellWalletIds.includes(wallet.walletId)
                        ? "border-blue-500/50 bg-blue-500/10"
                        : "border-white/10 bg-white/5 hover:bg-white/10"
                    )}
                  >
                    <div
                      className={cn(
                        "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0",
                        antiSniper.autoSellWalletIds.includes(wallet.walletId)
                          ? "bg-blue-500 border-blue-500"
                          : "border-white/30"
                      )}
                    >
                      {antiSniper.autoSellWalletIds.includes(wallet.walletId) && (
                        <span className="text-white text-[10px]">✓</span>
                      )}
                    </div>
                    <span className="text-xs text-white truncate flex-1">{wallet.label}</span>
                    <span className="text-[10px] font-mono text-white/50">{wallet.address.slice(0, 4)}...{wallet.address.slice(-4)}</span>
                    <span className="text-[10px] font-mono text-cyan-400">{wallet.buyAmount} SOL</span>
                  </button>
                ))}
              </div>

              {bundleWallets.filter(w => w.selected).length === 0 && (
                <p className="text-center py-4 text-white/40 text-xs">No bundle wallets selected</p>
              )}

              <p className="text-[10px] text-white/40 mt-2">
                Dev wallet NOT included. Your own swaps are ignored.
              </p>
            </div>
          </div>

          {/* Summary */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-red-500/10 to-orange-500/10 border border-red-500/30">
            <h4 className="text-xs font-semibold text-white/70 uppercase tracking-wider mb-3">Summary</h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex justify-between">
                <span className="text-white/50">Window</span>
                <span className="text-white font-mono">{Math.min(antiSniper.monitorBlocksWindow, 8)} blocks</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/50">Max Supply</span>
                <span className="text-purple-400 font-mono">{antiSniper.maxSupplyPercentThreshold}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/50">Max SOL</span>
                <span className="text-cyan-400 font-mono">{antiSniper.maxSolAmountThreshold}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/50">Sell</span>
                <span className="text-blue-400 font-mono">{antiSniper.autoSellWalletIds.length}w @ {antiSniper.sellPercentage}%</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Disabled State */}
      {!antiSniper.enabled && (
        <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
          <p className="text-xs text-white/50">
            Anti-sniper disabled. Token will launch without automated protection.
          </p>
        </div>
      )}

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
