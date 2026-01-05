"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useAuth } from "@/components/providers/auth-provider"
import { Header } from "@/components/layout/header"
import { 
  FintechCard, 
  MetricCard, 
  ProgressBar, 
  StatusBadge, 
  ActionButton,
  EmptyState 
} from "@/components/ui/fintech-card"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import type { Token, TideHarvest } from "@/lib/types/database"
import { motion } from "framer-motion"
import { TokenParametersPanel } from "@/components/dashboard/token-parameters-panel"
import { WaterLevelMeter } from "@/components/metrics/water-level-meter"
import { PourRateVisualizer } from "@/components/metrics/pour-rate-visualizer"
import { EvaporationTracker } from "@/components/metrics/evaporation-tracker"
import { ConstellationGauge } from "@/components/metrics/constellation-gauge"
import { getAuthHeaders } from "@/lib/api"
import { 
  LayoutDashboard, 
  Droplets, 
  Waves, 
  Flame, 
  Star, 
  Gift, 
  Coins, 
  Wallet, 
  CreditCard,
  Plus,
  ExternalLink,
  Settings,
  X
} from "lucide-react"

export default function DashboardPage() {
  const { isAuthenticated, isLoading, mainWallet, sessionId, setIsOnboarding, userId } = useAuth()
  const [createdTokens, setCreatedTokens] = useState<(Token & { harvest?: TideHarvest })[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [totalRewards, setTotalRewards] = useState(0)
  const [selectedTokenForManage, setSelectedTokenForManage] = useState<string | null>(null)
  const [claimingToken, setClaimingToken] = useState<string | null>(null)
  const [claimMessage, setClaimMessage] = useState<{ tokenMint: string; message: string; success: boolean } | null>(null)
  const rewardsPollingRef = useRef<NodeJS.Timeout | null>(null)

  const supabase = createClient()
  const router = useRouter()

  const fetchCreatorData = useCallback(async (showLoadingState = true) => {
    if (!mainWallet) return
    if (showLoadingState) setDataLoading(true)

    console.log('[DASHBOARD] Fetching tokens for wallet:', mainWallet.public_key?.slice(0, 8))

    try {
      const { data: tokens, error } = await supabase
        .from("tokens")
        .select("*, token_parameters(*)")
        .eq("creator_wallet", mainWallet.public_key)
        .order("created_at", { ascending: false })
      
      if (error) {
        console.error('[DASHBOARD] Token query error:', error)
      }
      
      console.log('[DASHBOARD] Tokens found:', tokens?.length || 0)

      if (tokens) {
        let rewards = 0
        const tokensWithHarvest = await Promise.all(
          tokens.map(async (token) => {
            let harvest = null
            let liveMarketCap = token.market_cap || 0
            let liveVolume24h = token.volume_24h || 0
            
            // Fetch live market cap
            try {
              const priceResponse = await fetch(`/api/price/token?mint=${token.mint_address}&supply=${token.total_supply}&decimals=${token.decimals || 6}`)
              if (priceResponse.ok) {
                const priceData = await priceResponse.json()
                if (priceData.success && priceData.data?.marketCap) {
                  liveMarketCap = priceData.data.marketCap
                }
              }
            } catch {
              // Use DB market cap as fallback
            }
            
            // Fetch live 24h volume from DexScreener
            try {
              const statsResponse = await fetch(`/api/token/${token.mint_address}/stats`)
              if (statsResponse.ok) {
                const statsData = await statsResponse.json()
                if (statsData.success && statsData.data?.volume24h !== undefined) {
                  liveVolume24h = statsData.data.volume24h
                }
              }
            } catch (err) {
              console.debug('[DASHBOARD] Failed to fetch live volume:', err)
              // Use DB volume as fallback
            }
            
            // Fetch creator rewards from on-chain
            // NOTE: Pump.fun/Bonk.fun use a per-CREATOR vault (shared across all tokens)
            // Jupiter uses per-TOKEN DBC pools
            try {
              const rewardsResponse = await fetch(`/api/creator-rewards?tokenMint=${token.mint_address}&creatorWallet=${mainWallet.public_key}`)
              if (rewardsResponse.ok) {
                const rewardsData = await rewardsResponse.json()
                if (rewardsData.success && rewardsData.data) {
                  const balance = rewardsData.data.balance || 0
                  const poolType = rewardsData.data.poolType || 'pump'
                  
                  // For Jupiter tokens, rewards are per-token so add to total
                  // For Pump/Bonk tokens, the vault is shared - we'll deduplicate below
                  harvest = { 
                    total_accumulated: balance, 
                    total_claimed: 0,
                    vault_address: rewardsData.data.vaultAddress,
                    hasRewards: rewardsData.data.hasRewards,
                    canClaimViaPumpPortal: rewardsData.data.canClaimViaPumpPortal,
                    canClaimViaJupiter: rewardsData.data.canClaimViaJupiter,
                    poolType,
                    platformName: rewardsData.data.platformName,
                  }
                }
              }
            } catch (err) {
              console.debug('[DASHBOARD] Failed to fetch creator rewards:', err)
            }

            // Merge token_parameters metrics into token for easy access
            return { 
              ...token, 
              harvest,
              market_cap: liveMarketCap,
              volume_24h: liveVolume24h,
              pour_rate: token.token_parameters?.pour_rate_percent ?? 0,
              evaporation_rate: token.token_parameters?.evaporation_rate_percent ?? 0,
              total_evaporated: token.token_parameters?.total_evaporated ?? 0,
            }
          }),
        )

        // Calculate total rewards properly:
        // - Jupiter tokens: per-token fees (sum all)
        // - Pump/Bonk tokens: per-creator vault (only count once)
        let totalRewardsCalc = 0
        let pumpVaultCounted = false
        let bonkVaultCounted = false
        
        tokensWithHarvest.forEach((token) => {
          if (token.harvest && token.harvest.total_accumulated > 0) {
            const poolType = token.harvest.poolType || token.pool_type || 'pump'
            
            if (poolType === 'jupiter') {
              // Jupiter fees are per-token, add them all
              totalRewardsCalc += token.harvest.total_accumulated
            } else if (poolType === 'pump' && !pumpVaultCounted) {
              // Pump.fun vault is per-creator, only count once
              totalRewardsCalc += token.harvest.total_accumulated
              pumpVaultCounted = true
            } else if (poolType === 'bonk' && !bonkVaultCounted) {
              // Bonk.fun vault is per-creator, only count once
              totalRewardsCalc += token.harvest.total_accumulated
              bonkVaultCounted = true
            }
            // For subsequent pump/bonk tokens, don't add to total (already counted)
          }
        })
        
        setCreatedTokens(tokensWithHarvest)
        setTotalRewards(totalRewardsCalc)
      }
    } catch (err) {
      console.error("Failed to fetch creator data:", err)
    } finally {
      if (showLoadingState) setDataLoading(false)
    }
  }, [mainWallet, supabase])

  useEffect(() => {
    console.log('[DASHBOARD] Auth state:', { 
      isAuthenticated, 
      hasMainWallet: !!mainWallet,
      sessionId: sessionId?.slice(0, 8)
    })
    
    if (isAuthenticated && mainWallet) {
      fetchCreatorData()
    } else if (!isLoading) {
      setDataLoading(false)
    }
  }, [isAuthenticated, mainWallet, sessionId, isLoading, fetchCreatorData])

  // Refresh data when returning to dashboard (e.g., after token creation)
  useEffect(() => {
    const handleFocus = () => {
      if (isAuthenticated && mainWallet) {
        console.log('[DASHBOARD] Window focused, refreshing data')
        fetchCreatorData(false)
      }
    }
    
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [isAuthenticated, mainWallet, fetchCreatorData])

  // Real-time polling for creator rewards (every 15 seconds)
  useEffect(() => {
    if (!isAuthenticated || !mainWallet) return

    // Start polling for rewards updates
    rewardsPollingRef.current = setInterval(() => {
      console.log('[DASHBOARD] Polling for rewards updates...')
      fetchCreatorData(false) // Silent refresh without loading state
    }, 15_000) // 15 seconds

    return () => {
      if (rewardsPollingRef.current) {
        clearInterval(rewardsPollingRef.current)
        rewardsPollingRef.current = null
      }
    }
  }, [isAuthenticated, mainWallet, fetchCreatorData])

  // Claim creator rewards handler
  const handleClaimRewards = async (tokenMint: string, rewardsAmount: number) => {
    if (!mainWallet || !sessionId) {
      setClaimMessage({ tokenMint, message: "Please connect your wallet", success: false })
      return
    }

    setClaimingToken(tokenMint)
    setClaimMessage(null)

    try {
      const response = await fetch("/api/creator-rewards", {
        method: "POST",
        headers: getAuthHeaders({
          sessionId: sessionId,
          walletAddress: mainWallet.public_key,
          userId: userId || sessionId,
        }),
        body: JSON.stringify({
          tokenMint,
          walletAddress: mainWallet.public_key,
        }),
      })

      const data = await response.json()

      if (data.success) {
        setClaimMessage({ 
          tokenMint, 
          message: `Successfully claimed ${data.data?.amountClaimed?.toFixed(6) || rewardsAmount.toFixed(6)} SOL!`, 
          success: true 
        })
        // Refresh rewards data
        await fetchCreatorData(false)
      } else {
        // If claiming failed but we have a claim URL, open it
        if (data.data?.claimUrl) {
          window.open(data.data.claimUrl, "_blank")
          const platformName = data.data?.poolType === 'bonk' ? 'Bonk.fun' : 'Pump.fun'
          setClaimMessage({ tokenMint, message: data.error || `Opening ${platformName} to claim...`, success: false })
        } else {
          setClaimMessage({ tokenMint, message: data.error || "Failed to claim rewards", success: false })
        }
      }
    } catch (error) {
      console.error("[DASHBOARD] Claim failed:", error)
      setClaimMessage({ tokenMint, message: "Failed to claim rewards. Please try again.", success: false })
    }

    setClaimingToken(null)
  }

  const formatNumber = (num: number | null | undefined) => {
    const n = num || 0
    if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
    if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`
    if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`
    return n.toFixed(4)
  }

  if (isLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="flex items-center gap-3 text-zinc-500">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>Loading dashboard...</span>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-zinc-950">
      {/* Subtle gradient background */}
      <div className="fixed inset-0 bg-gradient-to-br from-zinc-950 via-zinc-950 to-teal-950/20 pointer-events-none" />

      <Header />

      <div className="relative z-10 pt-20 pb-8 px-4 lg:px-6">
        <div className="max-w-6xl mx-auto">
          {/* Dashboard Header - Compact */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-teal-500/10 border border-teal-500/20">
                  <LayoutDashboard className="w-5 h-5 text-teal-400" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-zinc-100">Creator Dashboard</h1>
                  <p className="text-xs text-zinc-500">Your tokens. Your rewards. Real-time data.</p>
                </div>
              </div>
              {mainWallet && (
                <div className="flex items-center gap-2">
                  <StatusBadge status="online" label="Connected" />
                  <span className="text-xs text-zinc-500 font-mono">
                    {mainWallet.public_key.slice(0, 6)}...{mainWallet.public_key.slice(-4)}
                  </span>
                </div>
              )}
            </div>
          </motion.div>

          {isAuthenticated && mainWallet ? (
            <>
              {/* Stats Overview - Compact Row */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="grid grid-cols-5 gap-3 mb-4"
              >
                <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">Tokens Created</p>
                  <p className="text-xl font-bold text-zinc-100">{createdTokens.length}</p>
                </div>
                <div className="p-3 rounded-xl bg-zinc-900/80 border border-teal-500/20">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">Total Market Cap</p>
                  <p className="text-xl font-bold text-teal-400">${formatNumber(createdTokens.reduce((sum, t) => sum + (t.market_cap || 0), 0))}</p>
                </div>
                <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">Total Liquidity</p>
                  <p className="text-xl font-bold text-zinc-100">{formatNumber(createdTokens.reduce((sum, t) => sum + (t.current_liquidity || 0), 0))} <span className="text-xs text-zinc-500">SOL</span></p>
                </div>
                <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">24h Volume</p>
                  <p className="text-xl font-bold text-zinc-100">{formatNumber(createdTokens.reduce((sum, t) => sum + (t.volume_24h || 0), 0))} <span className="text-xs text-zinc-500">USD</span></p>
                </div>
                <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
                  <p className="text-[10px] text-amber-400 uppercase tracking-wide mb-1">Claimable Rewards</p>
                  <p className="text-xl font-bold text-amber-400">{formatNumber(totalRewards)} <span className="text-xs text-zinc-500">SOL</span></p>
                </div>
              </motion.div>

              {/* Liquidity Health - Compact Animated Metrics */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="mb-4"
              >
                <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Liquidity Health</h3>
                    <span className="text-[9px] text-zinc-600">Live metrics</span>
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    {/* Water Level */}
                    <div className="p-2 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Droplets className="w-3.5 h-3.5 text-cyan-400" />
                        <span className="text-[9px] text-zinc-500">Level</span>
                      </div>
                      <WaterLevelMeter level={createdTokens[0]?.water_level || 50} size="sm" showLabel={true} />
                    </div>

                    {/* Pour Rate */}
                    <div className="p-2 rounded-lg bg-zinc-800/50 border border-zinc-700/50 overflow-hidden">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Waves className="w-3.5 h-3.5 text-blue-400" />
                        <span className="text-[9px] text-zinc-500">Pour</span>
                      </div>
                      <div className="h-24 -mb-2">
                        <PourRateVisualizer rate={createdTokens[0]?.pour_rate || 1.5} />
                      </div>
                    </div>

                    {/* Evaporation */}
                    <div className="p-2 rounded-lg bg-zinc-800/50 border border-zinc-700/50 overflow-hidden">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Flame className="w-3.5 h-3.5 text-orange-400" />
                        <span className="text-[9px] text-zinc-500">Burn</span>
                      </div>
                      <div className="flex flex-col items-center justify-center h-20">
                        <EvaporationTracker 
                          totalEvaporated={createdTokens[0]?.total_evaporated || 0}
                          evaporationRate={createdTokens[0]?.evaporation_rate || 0.5}
                          symbol={createdTokens[0]?.symbol || "TOKEN"}
                        />
                      </div>
                    </div>

                    {/* Health Score */}
                    <div className="p-2 rounded-lg bg-zinc-800/50 border border-zinc-700/50 overflow-hidden">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Star className="w-3.5 h-3.5 text-yellow-400" />
                        <span className="text-[9px] text-zinc-500">Health</span>
                      </div>
                      <div className="flex items-center justify-center h-20">
                        <ConstellationGauge strength={createdTokens[0]?.constellation_strength || 50} />
                      </div>
                    </div>

                    {/* Harvest */}
                    <div className="p-2 rounded-lg bg-amber-500/5 border border-amber-500/20">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Gift className="w-3.5 h-3.5 text-amber-400" />
                        <span className="text-[9px] text-amber-400/70">Harvest</span>
                      </div>
                      <div className="flex flex-col items-center justify-center h-20">
                        <span className="text-xl font-bold text-amber-400">{formatNumber(totalRewards)}</span>
                        <span className="text-[9px] text-zinc-500">SOL</span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Token List - Compact */}
              {dataLoading ? (
                <div className="flex items-center justify-center py-6">
                  <div className="flex items-center gap-2 text-zinc-500 text-xs">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span>Loading tokens...</span>
                  </div>
                </div>
              ) : createdTokens.length === 0 ? (
                <div className="p-6 rounded-xl bg-zinc-900/80 border border-zinc-800 text-center">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center">
                    <Coins className="w-6 h-6 text-teal-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-zinc-300 mb-1">Ready to Launch?</h3>
                  <p className="text-xs text-zinc-500 mb-3">Drop your first token and start collecting rewards.</p>
                  <Link href="/launch" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-500 text-zinc-900 text-xs font-semibold hover:bg-teal-400 transition-colors">
                    <Plus className="w-3.5 h-3.5" /> Launch Token
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {createdTokens.map((token, index) => (
                    <motion.div
                      key={token.id}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.05 + index * 0.02 }}
                      className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 hover:border-teal-500/30 transition-colors"
                    >
                      {/* Token Row - Single Line Compact */}
                      <div className="flex items-center gap-3">
                        {/* Token Icon */}
                        <div className="relative w-10 h-10 rounded-lg bg-gradient-to-br from-teal-500/20 to-teal-600/10 border border-teal-500/20 overflow-hidden flex-shrink-0">
                          {(() => {
                            // Get image URL - use Jupiter static hosting for Jupiter tokens
                            const imageUrl = token.image_url 
                              || ((token as any).pool_type === 'jupiter' ? `https://static-create.jup.ag/images/${token.mint_address}` : null)
                            
                            return imageUrl ? (
                              <Image src={imageUrl} alt={token.name} fill className="object-cover" />
                            ) : (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-xs font-bold text-teal-400">{token.symbol.slice(0, 2)}</span>
                              </div>
                            )
                          })()}
                        </div>

                        {/* Token Name & Symbol */}
                        <div className="min-w-0 flex-shrink-0 w-32">
                          <h3 className="font-semibold text-sm text-zinc-100 truncate">{token.name}</h3>
                          <p className="text-xs text-teal-400">${token.symbol}</p>
                        </div>

                        {/* Status & Pool Badges */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-medium",
                            token.stage === "bonding" ? "bg-amber-500/10 text-amber-400" : "bg-green-500/10 text-green-400"
                          )}>
                            {token.stage === "bonding" ? "Bonding" : "DEX"}
                          </span>
                          {/* Pool type badge */}
                          {(token as any).pool_type === 'jupiter' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-green-500/20 text-green-400">
                              JUP
                            </span>
                          )}
                          {(token as any).pool_type === 'token22' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-purple-500/20 text-purple-400">
                              T22
                            </span>
                          )}
                          {(token as any).pool_type === 'bonk' && (
                            <span className={cn(
                              "px-2 py-0.5 rounded text-[10px] font-medium",
                              (token as any).quote_mint === 'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB'
                                ? "bg-amber-500/20 text-amber-300"
                                : "bg-orange-500/10 text-orange-400"
                            )}>
                              {(token as any).quote_mint === 'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB' ? 'USD1' : 'BONK'}
                            </span>
                          )}
                        </div>

                        {/* Stats - Inline */}
                        <div className="flex items-center gap-4 flex-1 text-xs">
                          <div className="text-center">
                            <p className="text-[10px] text-zinc-500">MCap</p>
                            <p className="font-semibold text-teal-400">${formatNumber(token.market_cap || 0)}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-[10px] text-zinc-500">Vol 24h</p>
                            <p className="font-semibold text-zinc-200">{formatNumber(token.volume_24h || 0)}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-[10px] text-zinc-500">Holders</p>
                            <p className="font-semibold text-zinc-200">{token.holders || 0}</p>
                          </div>
                        </div>

                        {/* Water Level - Compact Bar */}
                        <div className="w-24 flex-shrink-0">
                          <div className="flex items-center justify-between text-[9px] text-zinc-500 mb-0.5">
                            <span>Water Level</span>
                            <span className="text-teal-400">{(token.water_level || 50).toFixed(0)}%</span>
                          </div>
                          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-gradient-to-r from-teal-500 to-teal-400 rounded-full transition-all"
                              style={{ width: `${token.water_level || 50}%` }}
                            />
                          </div>
                        </div>

                        {/* Rewards */}
                        {token.harvest && token.harvest.total_accumulated > 0 && (
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <div className="p-2 rounded bg-amber-500/5 border border-amber-500/20">
                              <p className="text-[9px] text-zinc-500">
                                {token.harvest.poolType === 'jupiter' ? 'Rewards' : 'Rewards'}
                              </p>
                              <p className="text-sm font-bold text-amber-400">{formatNumber(token.harvest.total_accumulated)} SOL</p>
                              {/* Show indicator for shared vault (pump/bonk) */}
                              {token.harvest.poolType !== 'jupiter' && (
                                <p className="text-[8px] text-zinc-600" title="Pump.fun and Bonk.fun rewards are pooled across all your tokens">
                                  (shared vault)
                                </p>
                              )}
                            </div>
                            <div className="flex flex-col items-start gap-1">
                              <button 
                                onClick={() => handleClaimRewards(token.mint_address, token.harvest?.total_accumulated || 0)}
                                disabled={claimingToken === token.mint_address}
                                className="px-2 py-1.5 rounded bg-amber-500 text-[10px] font-semibold text-zinc-900 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              >
                                {claimingToken === token.mint_address ? (
                                  <span className="flex items-center gap-1">
                                    <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                    Claiming...
                                  </span>
                                ) : "Claim"}
                              </button>
                              {claimMessage?.tokenMint === token.mint_address && (
                                <p className={cn(
                                  "text-[9px] max-w-[120px] truncate",
                                  claimMessage.success ? "text-green-400" : "text-amber-400"
                                )}>
                                  {claimMessage.message}
                                </p>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Link href={`/token/${token.mint_address}`} className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 transition-colors" title="View Token">
                            <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </Link>
                          <button 
                            onClick={() => setSelectedTokenForManage(token.mint_address)}
                            className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 transition-colors"
                            title="Manage"
                          >
                            <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Token Parameters Modal */}
              {selectedTokenForManage && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
                  onClick={() => setSelectedTokenForManage(null)}
                >
                  <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="w-full max-w-2xl max-h-[90vh] overflow-y-auto"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="relative">
                      <button
                        onClick={() => setSelectedTokenForManage(null)}
                        className="absolute -top-2 -right-2 z-10 p-2 rounded-full bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 transition-colors"
                      >
                        <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                      <TokenParametersPanel tokenAddress={selectedTokenForManage} />
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </>
          ) : (
            <div className="p-8 rounded-xl bg-zinc-900/80 border border-zinc-800 text-center max-w-md mx-auto">
              <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center">
                <Wallet className="w-7 h-7 text-teal-400" />
              </div>
              <h3 className="text-lg font-semibold text-zinc-200 mb-2">Connect Wallet</h3>
              <p className="text-sm text-zinc-500 mb-4">Link up to see your tokens and rewards.</p>
              <button
                onClick={() => setIsOnboarding(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-teal-500 text-zinc-900 font-semibold hover:bg-teal-400 transition-colors"
              >
                <CreditCard className="w-4 h-4" /> Connect Wallet
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
