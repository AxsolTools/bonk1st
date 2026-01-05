"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Settings, Droplets, Flame, TrendingUp, Save, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { useAuth } from "@/components/providers/auth-provider"

interface TokenParameters {
  id: string
  token_id: string
  pour_rate_percent: number
  pour_enabled: boolean
  pour_interval_seconds: number
  pour_max_per_interval_sol: number
  pour_min_trigger_sol: number
  evaporation_rate_percent: number
  evaporation_enabled: boolean
  fee_to_liquidity_percent: number
  fee_to_creator_percent: number
  auto_claim_enabled: boolean
  claim_threshold_sol: number
  created_at: string
  updated_at: string
}

interface TokenParametersPanelProps {
  tokenAddress: string
}

export function TokenParametersPanel({ tokenAddress }: TokenParametersPanelProps) {
  const [parameters, setParameters] = useState<TokenParameters | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const { activeWallet, isAuthenticated } = useAuth()

  // Load parameters
  useEffect(() => {
    const loadParameters = async () => {
      if (!activeWallet) return

      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch(`/api/token/${tokenAddress}/parameters`, {
          headers: {
            "x-wallet-address": activeWallet.public_key,
            "x-session-id": activeWallet.session_id || "",
          },
        })
        const data = await response.json()

        if (data.success && data.data.parameters) {
          setParameters(data.data.parameters)
        } else {
          setError(data.error?.message || "Failed to load parameters")
        }
      } catch (error) {
        console.error("[PARAMETERS] Failed to load:", error)
        setError("Failed to load parameters")
      }

      setIsLoading(false)
    }

    loadParameters()
  }, [tokenAddress, activeWallet])

  // Update parameter
  const updateParameter = <K extends keyof TokenParameters>(
    key: K,
    value: TokenParameters[K]
  ) => {
    if (!parameters) return

    setParameters({ ...parameters, [key]: value })
    setHasChanges(true)
    setSuccess(null)
  }

  // Save parameters
  const handleSave = async () => {
    if (!activeWallet || !parameters) return

    setIsSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch(`/api/token/${tokenAddress}/parameters`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": activeWallet.public_key,
          "x-session-id": activeWallet.session_id || "",
        },
        body: JSON.stringify({
          pour_rate_percent: parameters.pour_rate_percent,
          pour_enabled: parameters.pour_enabled,
          pour_max_per_interval_sol: parameters.pour_max_per_interval_sol,
          pour_min_trigger_sol: parameters.pour_min_trigger_sol,
          evaporation_rate_percent: parameters.evaporation_rate_percent,
          evaporation_enabled: parameters.evaporation_enabled,
          fee_to_liquidity_percent: parameters.fee_to_liquidity_percent,
          fee_to_creator_percent: parameters.fee_to_creator_percent,
        }),
      })

      const data = await response.json()

      if (data.success && data.data.parameters) {
        setParameters(data.data.parameters)
        setHasChanges(false)
        setSuccess("Parameters saved successfully!")
      } else {
        setError(data.error?.message || "Failed to save parameters")
      }
    } catch (error) {
      console.error("[PARAMETERS] Failed to save:", error)
      setError("Failed to save parameters")
    }

    setIsSaving(false)
  }

  if (!isAuthenticated) {
    return (
      <div className="bg-black/30 rounded-xl border border-white/10 p-6 text-center">
        <Settings className="w-12 h-12 text-white/20 mx-auto mb-4" />
        <p className="text-white/50">Connect wallet to manage token parameters</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="bg-black/30 rounded-xl border border-white/10 p-6 flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
      </div>
    )
  }

  if (!parameters) {
    return (
      <div className="bg-black/30 rounded-xl border border-white/10 p-6 text-center">
        <Settings className="w-12 h-12 text-white/20 mx-auto mb-4" />
        <p className="text-white/50">No parameters found for this token</p>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-black/30 rounded-xl border border-white/10 overflow-hidden"
    >
      {/* Header */}
      <div className="p-6 border-b border-white/10 bg-gradient-to-r from-cyan-500/10 to-blue-500/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-cyan-500/20 flex items-center justify-center">
              <Settings className="w-6 h-6 text-cyan-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Token Parameters</h3>
              <p className="text-white/50 text-sm">Configure liquidity and burning settings</p>
            </div>
          </div>
          <Button
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-black font-medium"
          >
            {isSaving ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save Changes
          </Button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="mx-6 mt-6 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="mx-6 mt-6 p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-sm">
          {success}
        </div>
      )}

      <div className="p-6 space-y-8">
        {/* Pour Rate Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Droplets className="w-5 h-5 text-cyan-400" />
              <Label className="text-white font-medium">Pour Rate (Liquidity Addition)</Label>
            </div>
            <Switch
              checked={parameters.pour_enabled}
              onCheckedChange={(checked) => updateParameter("pour_enabled", checked)}
            />
          </div>
          <p className="text-sm text-white/50">
            Automatically add liquidity back to the bonding curve at a steady rate
          </p>

          {parameters.pour_enabled && (
            <div className="pl-7 space-y-4">
              <div>
                <div className="flex justify-between mb-2">
                  <Label className="text-white/70 text-sm">Rate (%/interval)</Label>
                  <span className="text-cyan-400 font-mono">{parameters.pour_rate_percent?.toFixed(2) || "0.00"}%</span>
                </div>
                <Slider
                  value={[parameters.pour_rate_percent || 0]}
                  onValueChange={([value]) => updateParameter("pour_rate_percent", value)}
                  min={0}
                  max={10}
                  step={0.1}
                  className="w-full"
                />
              </div>

              <div>
                <Label className="text-white/70 text-sm mb-2 block">Max Pour Per Interval (SOL)</Label>
                <Input
                  type="number"
                  value={parameters.pour_max_per_interval_sol || 0}
                  onChange={(e) => updateParameter("pour_max_per_interval_sol", parseFloat(e.target.value) || 0)}
                  min={0}
                  step={0.01}
                  className="bg-white/5 border-white/10 text-white"
                />
              </div>

              <div>
                <Label className="text-white/70 text-sm mb-2 block">Min Trigger Threshold (SOL)</Label>
                <Input
                  type="number"
                  value={parameters.pour_min_trigger_sol || 0}
                  onChange={(e) => updateParameter("pour_min_trigger_sol", parseFloat(e.target.value) || 0)}
                  min={0}
                  step={0.001}
                  className="bg-white/5 border-white/10 text-white"
                />
              </div>
            </div>
          )}
        </div>

        {/* Evaporation Section */}
        <div className="space-y-4 pt-4 border-t border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Flame className="w-5 h-5 text-orange-400" />
              <Label className="text-white font-medium">Evaporation (Token Burning)</Label>
            </div>
            <Switch
              checked={parameters.evaporation_enabled}
              onCheckedChange={(checked) => updateParameter("evaporation_enabled", checked)}
            />
          </div>
          <p className="text-sm text-white/50">
            Burn a percentage of tokens from each transaction to reduce supply
          </p>

          {parameters.evaporation_enabled && (
            <div className="pl-7">
              <div className="flex justify-between mb-2">
                <Label className="text-white/70 text-sm">Burn Rate (%)</Label>
                <span className="text-orange-400 font-mono">{parameters.evaporation_rate_percent?.toFixed(2) || "0.00"}%</span>
              </div>
              <Slider
                value={[parameters.evaporation_rate_percent || 0]}
                onValueChange={([value]) => updateParameter("evaporation_rate_percent", value)}
                min={0}
                max={5}
                step={0.1}
                className="w-full"
              />
            </div>
          )}
        </div>

        {/* Fee Distribution Section */}
        <div className="space-y-4 pt-4 border-t border-white/10">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-green-400" />
            <Label className="text-white font-medium">Fee Distribution</Label>
          </div>
          <p className="text-sm text-white/50">
            Configure how trading fees are distributed between liquidity and creator
          </p>

          <div className="pl-7 space-y-4">
            <div>
              <div className="flex justify-between mb-2">
                <Label className="text-white/70 text-sm">To Liquidity (%)</Label>
                <span className="text-green-400 font-mono">{parameters.fee_to_liquidity_percent?.toFixed(1) || "25.0"}%</span>
              </div>
              <Slider
                value={[parameters.fee_to_liquidity_percent || 25]}
                onValueChange={([value]) => {
                  updateParameter("fee_to_liquidity_percent", value)
                  updateParameter("fee_to_creator_percent", 100 - value)
                }}
                min={0}
                max={100}
                step={1}
                className="w-full"
              />
            </div>

            <div>
              <div className="flex justify-between mb-2">
                <Label className="text-white/70 text-sm">To Creator (%)</Label>
                <span className="text-cyan-400 font-mono">{parameters.fee_to_creator_percent?.toFixed(1) || "75.0"}%</span>
              </div>
              <p className="text-xs text-white/40">
                Fee distribution must total 100%
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-6 bg-white/5 border-t border-white/10 text-xs text-white/40">
        <p>Last updated: {new Date(parameters.updated_at).toLocaleString()}</p>
      </div>
    </motion.div>
  )
}

