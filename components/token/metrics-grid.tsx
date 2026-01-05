"use client"

import { useEffect, useState, useCallback } from "react"
import { motion } from "framer-motion"
import type { Token } from "@/lib/types/database"
import { GlassPanel } from "@/components/ui/glass-panel"
import { WaterLevelMeter } from "@/components/metrics/water-level-meter"
import { EvaporationTracker } from "@/components/metrics/evaporation-tracker"
import { ConstellationGauge } from "@/components/metrics/constellation-gauge"
import { PourRateVisualizer } from "@/components/metrics/pour-rate-visualizer"
import { TideHarvestCard } from "@/components/metrics/tide-harvest-card"
import { Token22FeeHarvestCard } from "@/components/metrics/token22-fee-harvest-card"
import { JupiterFeeHarvestCard } from "@/components/metrics/jupiter-fee-harvest-card"

interface MetricsGridProps {
  token: Token & { pool_type?: string; dbc_pool_address?: string }
  isToken22?: boolean
}

interface RealTimeMetrics {
  waterLevel: number
  evaporated: number
  evaporationRate: number
  constellationStrength: number
  tideHarvest: number
  pourRateTotal: number
  pourRateLast24h: number
  liquidity: number
  marketCap: number
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
}

// Polling interval for real-time metrics (10 seconds)
const METRICS_POLL_INTERVAL = 10_000

export function MetricsGrid({ token, isToken22 = false }: MetricsGridProps) {
  const [metrics, setMetrics] = useState<RealTimeMetrics | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Fetch real-time metrics from the aggregated API
  const fetchMetrics = useCallback(async () => {
    try {
      const response = await fetch(`/api/token/${token.mint_address}/metrics`)
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setMetrics(data.data)
        }
      }
    } catch (error) {
      console.warn('[METRICS-GRID] Failed to fetch metrics:', error)
    } finally {
      setIsLoading(false)
    }
  }, [token.mint_address])

  // Initial fetch and polling
  useEffect(() => {
    fetchMetrics()

    // Poll for updates every 10 seconds
    const interval = setInterval(fetchMetrics, METRICS_POLL_INTERVAL)

    return () => clearInterval(interval)
  }, [fetchMetrics])

  // Use real-time data if available, fall back to token props
  const waterLevel = metrics?.waterLevel ?? token.water_level ?? 0
  const evaporated = metrics?.evaporated ?? token.total_evaporated ?? 0
  const evaporationRate = metrics?.evaporationRate ?? token.evaporation_rate ?? 0
  const constellationStrength = metrics?.constellationStrength ?? token.constellation_strength ?? 0
  const pourRate = metrics?.pourRateLast24h ?? token.pour_rate ?? 0

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Liquidity Metrics</h2>
          <p className="text-xs text-[var(--text-muted)]">Real-time token health indicators</p>
        </div>
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3"
      >
        {/* Water Level */}
        <motion.div variants={itemVariants}>
          <GlassPanel className="p-3 h-full" glow="aqua">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-xs font-semibold text-[var(--text-primary)]">Water Level</h3>
                <p className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">Liquidity Depth</p>
              </div>
              <div className="w-6 h-6 rounded-md bg-[var(--aqua-subtle)] flex items-center justify-center">
                <svg className="w-3 h-3 text-[var(--aqua-primary)]" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 2C12 2 6 10 6 14C6 18 8.7 22 12 22C15.3 22 18 18 18 14C18 10 12 2 12 2Z"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                </svg>
              </div>
            </div>
            <WaterLevelMeter level={waterLevel} size="md" isLoading={isLoading} />
          </GlassPanel>
        </motion.div>

        {/* Evaporation Tracker */}
        <motion.div variants={itemVariants}>
          <GlassPanel className="p-3 h-full" glow="orange">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-xs font-semibold text-[var(--text-primary)]">Evaporation</h3>
                <p className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">Tokens Burned</p>
              </div>
              <div className="w-6 h-6 rounded-md bg-[var(--warm-orange)]/10 flex items-center justify-center">
                <svg className="w-3 h-3 text-[var(--warm-orange)]" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 2v4M4.93 4.93l2.83 2.83M2 12h4M4.93 19.07l2.83-2.83M12 18v4M16.24 16.24l2.83 2.83M18 12h4M16.24 7.76l2.83-2.83"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            </div>
            <EvaporationTracker
              totalEvaporated={evaporated}
              evaporationRate={evaporationRate}
              symbol={token.symbol}
              isLoading={isLoading}
            />
          </GlassPanel>
        </motion.div>

        {/* Constellation Strength */}
        <motion.div variants={itemVariants}>
          <GlassPanel className="p-3 h-full" glow="pink">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-xs font-semibold text-[var(--text-primary)]">Constellation</h3>
                <p className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">Health Score</p>
              </div>
              <div className="w-6 h-6 rounded-md bg-[var(--warm-pink)]/10 flex items-center justify-center">
                <svg className="w-3 h-3 text-[var(--warm-pink)]" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
            <ConstellationGauge strength={constellationStrength} isLoading={isLoading} />
          </GlassPanel>
        </motion.div>

        {/* Pour Rate */}
        <motion.div variants={itemVariants}>
          <GlassPanel className="p-3 h-full" glow="aqua">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-xs font-semibold text-[var(--text-primary)]">Pour Rate</h3>
                <p className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">Liquidity Flow</p>
              </div>
              <div className="w-6 h-6 rounded-md bg-[var(--aqua-subtle)] flex items-center justify-center">
                <svg className="w-3 h-3 text-[var(--aqua-primary)]" viewBox="0 0 24 24" fill="none">
                  <path d="M12 5v14M7 10l5-5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
            </div>
            <PourRateVisualizer rate={pourRate} isLoading={isLoading} />
          </GlassPanel>
        </motion.div>

        {/* Tide Harvest / Token22 Fee Harvest / Jupiter Fee Harvest */}
        <motion.div variants={itemVariants}>
          {isToken22 ? (
            <GlassPanel className="p-3 h-full" glow="purple">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-xs font-semibold text-[var(--text-primary)]">Token22 Fees</h3>
                  <p className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">Transfer Fees</p>
                </div>
                <div className="w-6 h-6 rounded-md bg-purple-500/10 flex items-center justify-center">
                  <svg className="w-3 h-3 text-purple-400" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M12 8v4l3 3M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
              </div>
              <Token22FeeHarvestCard 
                tokenId={token.id} 
                tokenAddress={token.mint_address} 
                creatorWallet={token.creator_wallet || ""} 
                tokenSymbol={token.symbol}
                decimals={token.decimals}
              />
            </GlassPanel>
          ) : token.pool_type === 'jupiter' ? (
            <GlassPanel className="p-3 h-full" glow="orange">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-xs font-semibold text-[var(--text-primary)]">Jupiter Fees</h3>
                  <p className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">DBC Rewards</p>
                </div>
                <div className="w-6 h-6 rounded-md bg-orange-500/10 flex items-center justify-center">
                  <svg className="w-3 h-3 text-orange-400" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </div>
              <JupiterFeeHarvestCard 
                tokenId={token.id} 
                tokenAddress={token.mint_address} 
                creatorWallet={token.creator_wallet || ""}
                dbcPoolAddress={token.dbc_pool_address}
              />
            </GlassPanel>
          ) : (
            <GlassPanel className="p-3 h-full" glow="aqua">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-xs font-semibold text-[var(--text-primary)]">Tide Harvest</h3>
                  <p className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">Creator Rewards</p>
                </div>
                <div className="w-6 h-6 rounded-md bg-[var(--aqua-subtle)] flex items-center justify-center">
                  <svg className="w-3 h-3 text-[var(--aqua-primary)]" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M12 8v4l3 3M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
              </div>
              <TideHarvestCard tokenId={token.id} creatorId={token.creator_id} tokenAddress={token.mint_address} creatorWallet={token.creator_wallet || ""} />
            </GlassPanel>
          )}
        </motion.div>
      </motion.div>
    </div>
  )
}
