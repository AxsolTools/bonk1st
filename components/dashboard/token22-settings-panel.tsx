"use client"

/**
 * AQUA Launchpad - Token22 Settings Panel
 * 
 * Allows token creators to configure:
 * - Liquidity Engine (auto-harvest, auto-add-liquidity)
 * - Fee Distribution (burn %, liquidity %, creator %)
 * - Harvest Settings (interval, minimum)
 */

import { useState, useEffect, useCallback } from "react"
import { motion } from "framer-motion"
import { useAuth } from "@/components/providers/auth-provider"
import { getAuthHeaders } from "@/lib/api/auth-headers"
import {
  Droplets,
  Flame,
  Settings2,
  Loader2,
  Check,
  AlertCircle,
  Clock,
  Percent,
  Save,
  RotateCcw,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface Token22SettingsPanelProps {
  tokenId: string
  mintAddress: string
  tokenSymbol?: string
  isCreator: boolean
}

interface Token22Parameters {
  liquidityEngineEnabled: boolean
  autoHarvestEnabled: boolean
  autoAddLiquidityEnabled: boolean
  harvestIntervalMinutes: number
  minHarvestAmountTokens: number
  feeToLiquidityPercent: number
  feeToBurnPercent: number
  feeToCreatorPercent: number
  burnEnabled: boolean
  burnOnHarvestPercent: number
  lastHarvestAt: string | null
  totalHarvestedTokens: string
  totalBurnedTokens: string
  totalAddedToLiquiditySol: number
}

const DEFAULT_PARAMS: Token22Parameters = {
  liquidityEngineEnabled: false,
  autoHarvestEnabled: false,
  autoAddLiquidityEnabled: false,
  harvestIntervalMinutes: 60,
  minHarvestAmountTokens: 0,
  feeToLiquidityPercent: 50,
  feeToBurnPercent: 25,
  feeToCreatorPercent: 25,
  burnEnabled: false,
  burnOnHarvestPercent: 0,
  lastHarvestAt: null,
  totalHarvestedTokens: "0",
  totalBurnedTokens: "0",
  totalAddedToLiquiditySol: 0,
}

export function Token22SettingsPanel({
  tokenId,
  mintAddress,
  tokenSymbol = "TOKEN",
  isCreator,
}: Token22SettingsPanelProps) {
  const { sessionId, activeWallet, mainWallet, userId } = useAuth()
  const [params, setParams] = useState<Token22Parameters>(DEFAULT_PARAMS)
  const [originalParams, setOriginalParams] = useState<Token22Parameters>(DEFAULT_PARAMS)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [hasChanges, setHasChanges] = useState(false)

  const walletAddress = activeWallet?.public_key || mainWallet?.public_key

  // Fetch current parameters
  const fetchParams = useCallback(async () => {
    try {
      const response = await fetch(`/api/token22/parameters?mint=${mintAddress}`)
      const data = await response.json()

      if (data.success && data.data) {
        setParams(data.data)
        setOriginalParams(data.data)
      }
    } catch (error) {
      console.error("[TOKEN22-SETTINGS] Failed to fetch:", error)
    } finally {
      setIsLoading(false)
    }
  }, [mintAddress])

  useEffect(() => {
    fetchParams()
  }, [fetchParams])

  // Check for changes
  useEffect(() => {
    const changed = JSON.stringify(params) !== JSON.stringify(originalParams)
    setHasChanges(changed)
  }, [params, originalParams])

  // Update distribution helper - ensures sum is always 100
  const updateDistribution = (field: "feeToLiquidityPercent" | "feeToBurnPercent" | "feeToCreatorPercent", value: number) => {
    const newParams = { ...params }
    const oldValue = newParams[field]
    const diff = value - oldValue

    newParams[field] = value

    // Adjust other fields proportionally to maintain sum of 100
    const otherFields = (["feeToLiquidityPercent", "feeToBurnPercent", "feeToCreatorPercent"] as const).filter(
      (f) => f !== field
    )

    // Try to subtract from the first field that has enough
    for (const other of otherFields) {
      if (newParams[other] >= diff) {
        newParams[other] -= diff
        break
      }
    }

    // Clamp all values to 0-100
    for (const f of ["feeToLiquidityPercent", "feeToBurnPercent", "feeToCreatorPercent"] as const) {
      newParams[f] = Math.max(0, Math.min(100, newParams[f]))
    }

    // Ensure sum is 100
    const sum = newParams.feeToLiquidityPercent + newParams.feeToBurnPercent + newParams.feeToCreatorPercent
    if (sum !== 100) {
      // Adjust creator percent to balance
      newParams.feeToCreatorPercent = 100 - newParams.feeToLiquidityPercent - newParams.feeToBurnPercent
    }

    setParams(newParams)
  }

  const handleSave = async () => {
    if (!walletAddress || !sessionId) return

    setIsSaving(true)
    setMessage(null)

    try {
      const response = await fetch("/api/token22/parameters", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders({
            sessionId: sessionId || userId,
            walletAddress,
            userId,
          }),
        },
        body: JSON.stringify({
          mintAddress,
          ...params,
        }),
      })

      const data = await response.json()

      if (data.success) {
        setMessage({ type: "success", text: "Settings saved successfully!" })
        setOriginalParams(params)
        setHasChanges(false)
      } else {
        setMessage({ type: "error", text: data.error?.message || "Failed to save settings" })
      }
    } catch (error) {
      setMessage({ type: "error", text: "Failed to save settings" })
    }

    setIsSaving(false)
  }

  const handleReset = () => {
    setParams(originalParams)
    setMessage(null)
  }

  if (!isCreator) {
    return null
  }

  if (isLoading) {
    return (
      <div className="p-6 rounded-xl bg-[var(--glass-bg)] border border-purple-500/20">
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 rounded-xl bg-[var(--glass-bg)] border border-purple-500/20">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-500/20">
            <Settings2 className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h3 className="font-semibold text-white">Token-2022 Settings</h3>
            <p className="text-xs text-[var(--text-muted)]">Liquidity Engine & Fee Distribution</p>
          </div>
        </div>
        
        {/* Token22 Badge */}
        <div className="px-2 py-1 rounded-full bg-purple-500/20 border border-purple-500/30">
          <span className="text-xs font-medium text-purple-300">Token-2022</span>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-lg mb-4 text-sm",
            message.type === "success" ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"
          )}
        >
          {message.type === "success" ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {message.text}
        </div>
      )}

      {/* Liquidity Engine Toggle */}
      <div className="space-y-4">
        <div className="p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--glass-border)]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Droplets className="w-4 h-4 text-purple-400" />
              <span className="font-medium text-white">Liquidity Engine</span>
            </div>
            <button
              onClick={() => setParams({ ...params, liquidityEngineEnabled: !params.liquidityEngineEnabled })}
              className={cn(
                "relative w-11 h-6 rounded-full transition-colors",
                params.liquidityEngineEnabled ? "bg-purple-500" : "bg-[var(--bg-tertiary)]"
              )}
            >
              <div
                className={cn(
                  "absolute top-1 w-4 h-4 rounded-full bg-white transition-transform",
                  params.liquidityEngineEnabled ? "translate-x-6" : "translate-x-1"
                )}
              />
            </button>
          </div>
          
          {params.liquidityEngineEnabled && (
            <div className="space-y-3 mt-4 pt-4 border-t border-[var(--glass-border)]">
              {/* Auto Harvest */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--text-secondary)]">Auto-Harvest Fees</span>
                <button
                  onClick={() => setParams({ ...params, autoHarvestEnabled: !params.autoHarvestEnabled })}
                  className={cn(
                    "relative w-9 h-5 rounded-full transition-colors",
                    params.autoHarvestEnabled ? "bg-purple-500" : "bg-[var(--bg-tertiary)]"
                  )}
                >
                  <div
                    className={cn(
                      "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform",
                      params.autoHarvestEnabled ? "translate-x-4" : "translate-x-0.5"
                    )}
                  />
                </button>
              </div>

              {/* Auto Add Liquidity */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--text-secondary)]">Auto-Add to Liquidity</span>
                <button
                  onClick={() => setParams({ ...params, autoAddLiquidityEnabled: !params.autoAddLiquidityEnabled })}
                  className={cn(
                    "relative w-9 h-5 rounded-full transition-colors",
                    params.autoAddLiquidityEnabled ? "bg-purple-500" : "bg-[var(--bg-tertiary)]"
                  )}
                >
                  <div
                    className={cn(
                      "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform",
                      params.autoAddLiquidityEnabled ? "translate-x-4" : "translate-x-0.5"
                    )}
                  />
                </button>
              </div>

              {/* Harvest Interval */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-3 h-3 text-[var(--text-muted)]" />
                  <span className="text-sm text-[var(--text-secondary)]">Harvest Interval</span>
                </div>
                <select
                  value={params.harvestIntervalMinutes}
                  onChange={(e) => setParams({ ...params, harvestIntervalMinutes: parseInt(e.target.value) })}
                  className="px-2 py-1 rounded bg-[var(--bg-tertiary)] text-sm text-white border border-[var(--glass-border)]"
                >
                  <option value={15}>15 min</option>
                  <option value={30}>30 min</option>
                  <option value={60}>1 hour</option>
                  <option value={180}>3 hours</option>
                  <option value={360}>6 hours</option>
                  <option value={720}>12 hours</option>
                  <option value={1440}>24 hours</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Fee Distribution */}
        <div className="p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--glass-border)]">
          <div className="flex items-center gap-2 mb-4">
            <Percent className="w-4 h-4 text-purple-400" />
            <span className="font-medium text-white">Fee Distribution</span>
          </div>

          <div className="space-y-4">
            {/* To Liquidity */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-[var(--text-secondary)]">→ Add to Liquidity</span>
                <span className="text-purple-300 font-mono">{params.feeToLiquidityPercent}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={params.feeToLiquidityPercent}
                onChange={(e) => updateDistribution("feeToLiquidityPercent", parseInt(e.target.value))}
                className="w-full h-2 rounded-full bg-[var(--bg-tertiary)] appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-500"
              />
            </div>

            {/* To Burn */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-[var(--text-secondary)] flex items-center gap-1">
                  <Flame className="w-3 h-3 text-orange-400" /> Burn
                </span>
                <span className="text-orange-300 font-mono">{params.feeToBurnPercent}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={params.feeToBurnPercent}
                onChange={(e) => updateDistribution("feeToBurnPercent", parseInt(e.target.value))}
                className="w-full h-2 rounded-full bg-[var(--bg-tertiary)] appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-orange-500"
              />
            </div>

            {/* To Creator */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-[var(--text-secondary)]">→ Your Wallet</span>
                <span className="text-green-300 font-mono">{params.feeToCreatorPercent}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={params.feeToCreatorPercent}
                onChange={(e) => updateDistribution("feeToCreatorPercent", parseInt(e.target.value))}
                className="w-full h-2 rounded-full bg-[var(--bg-tertiary)] appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-green-500"
              />
            </div>

            {/* Sum indicator */}
            <div className="text-center text-xs text-[var(--text-muted)]">
              Total: {params.feeToLiquidityPercent + params.feeToBurnPercent + params.feeToCreatorPercent}%
            </div>
          </div>
        </div>

        {/* Stats */}
        {(params.totalHarvestedTokens !== "0" || params.totalBurnedTokens !== "0") && (
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-[var(--bg-secondary)] text-center">
              <p className="text-xs text-[var(--text-muted)] mb-1">Harvested</p>
              <p className="font-mono text-sm text-purple-300">
                {(parseFloat(params.totalHarvestedTokens) / 1e9).toFixed(2)}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-[var(--bg-secondary)] text-center">
              <p className="text-xs text-[var(--text-muted)] mb-1">Burned</p>
              <p className="font-mono text-sm text-orange-300">
                {(parseFloat(params.totalBurnedTokens) / 1e9).toFixed(2)}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-[var(--bg-secondary)] text-center">
              <p className="text-xs text-[var(--text-muted)] mb-1">→ Liquidity</p>
              <p className="font-mono text-sm text-[var(--aqua-primary)]">
                {params.totalAddedToLiquiditySol.toFixed(4)} SOL
              </p>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {hasChanges && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 pt-4 border-t border-[var(--glass-border)]"
          >
            <button
              onClick={handleReset}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-[var(--glass-border)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-purple-500 text-white font-medium hover:bg-purple-600 transition-colors disabled:opacity-50"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save Changes
            </button>
          </motion.div>
        )}
      </div>
    </div>
  )
}

