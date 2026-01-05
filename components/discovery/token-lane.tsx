"use client"

import { useEffect, useState, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { createClient } from "@/lib/supabase/client"
import { TokenRowCard } from "./token-row-card"
import type { Token } from "@/lib/types/database"
import { cn } from "@/lib/utils"
import { useBondingProgress } from "@/hooks/use-bonding-progress"

interface TokenWithMetrics extends Token {
  creator?: {
    username: string | null
    avatar_url: string | null
  } | null
  live_market_cap?: number
  volume_24h?: number
  tx_count?: number
  holders_count?: number
  dev_holdings_percent?: number
  net_flow?: number
  bonding_progress?: number // Real-time bonding curve progress from PumpPortal
}

type LaneType = "new" | "almost-bonded" | "migrated"

interface TokenLaneProps {
  type: LaneType
  title: string
  icon: React.ReactNode
  accentColor: string
  maxTokens?: number
}

// Minimum market cap threshold for "Almost Bonded" lane
const ALMOST_BONDED_MIN_MC = 15000 // $15K minimum

const LANE_CONFIG = {
  "new": {
    filter: (token: TokenWithMetrics) => {
      // New tokens: bonding stage with market cap below $15K
      const mc = getMarketCap(token)
      return token.stage === "bonding" && mc < ALMOST_BONDED_MIN_MC
    },
    sort: (a: TokenWithMetrics, b: TokenWithMetrics) => {
      // Sort by newest first
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    },
    emptyMessage: "No new tokens yet",
  },
  "almost-bonded": {
    filter: (token: TokenWithMetrics) => {
      // Almost Bonded: bonding stage with market cap >= $15K
      const mc = getMarketCap(token)
      return token.stage === "bonding" && mc >= ALMOST_BONDED_MIN_MC
    },
    sort: (a: TokenWithMetrics, b: TokenWithMetrics) => {
      // Sort by highest progress first
      return getProgress(b) - getProgress(a)
    },
    emptyMessage: "No tokens close to bonding",
  },
  "migrated": {
    filter: (token: TokenWithMetrics) => token.stage === "migrated",
    sort: (a: TokenWithMetrics, b: TokenWithMetrics) => {
      // Sort by market cap for migrated
      const mcA = getMarketCap(a)
      const mcB = getMarketCap(b)
      return mcB - mcA
    },
    emptyMessage: "No migrated tokens yet",
  },
}

function getMarketCap(token: TokenWithMetrics) {
  return token.live_market_cap || token.market_cap_usd || token.market_cap || 0
}

function getProgress(token: TokenWithMetrics) {
  // Use bonding progress if available (from WebSocket or stats API)
  if (token.bonding_progress !== undefined) {
    return token.bonding_progress
  }
  // For migrated tokens, show 100%
  if (token.stage === 'migrated') {
    return 100
  }
  // No data yet - return undefined to indicate loading
  return undefined
}

export function TokenLane({ type, title, icon, accentColor, maxTokens = 20 }: TokenLaneProps) {
  const [tokens, setTokens] = useState<TokenWithMetrics[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isExpanded, setIsExpanded] = useState(true)

  const config = LANE_CONFIG[type]

  // Get bonding token mint addresses for WebSocket subscription
  const bondingMints = tokens
    .filter(t => t.stage === "bonding" && t.pool_type !== 'jupiter')
    .map(t => t.mint_address)
    .filter(Boolean)

  // Subscribe to real-time bonding progress via PumpPortal WebSocket
  const { progressMap } = useBondingProgress(bondingMints)

  // Fetch live market caps for tokens
  const fetchLiveMarketCaps = useCallback(async (tokenList: TokenWithMetrics[]) => {
    if (tokenList.length === 0) return tokenList

    try {
      const mintAddresses = tokenList.map(t => t.mint_address).filter(Boolean)
      
      const response = await fetch('/api/price/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mints: mintAddresses }),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success && data.data) {
          return tokenList.map(token => {
            const priceData = data.data[token.mint_address]
            if (priceData && priceData.marketCap > 0) {
              return { 
                ...token, 
                live_market_cap: priceData.marketCap,
                volume_24h: priceData.volume24h || 0,
                tx_count: priceData.txCount24h || 0,
              }
            }
            return token
          })
        }
      }
    } catch (error) {
      console.debug('[TOKEN-LANE] Failed to fetch live market caps:', error)
    }
    return tokenList
  }, [])

  const fetchTokens = useCallback(async () => {
    setIsLoading(true)
    const supabase = createClient()
    
    console.log(`[DEBUG] TokenLane (${type}) fetching tokens...`)
    
    // Fetch all tokens - we'll filter client side for the lanes
    const { data: tokenData, error } = await supabase
      .from("tokens")
      .select(`
        *,
        creator:users!tokens_creator_id_fkey (
          username,
          avatar_url
        )
      `)
      .order("created_at", { ascending: false })
      .limit(200) // Fetch more to have enough for all lanes

    console.log(`[DEBUG] TokenLane (${type}) Supabase response:`, { 
      count: tokenData?.length, 
      error,
      tokens: tokenData?.map(t => ({ mint: t.mint_address, name: t.name, stage: t.stage, mc: t.market_cap }))
    })

    if (tokenData) {
      let typedTokens = tokenData as TokenWithMetrics[]
      
      // Fetch live market caps
      typedTokens = await fetchLiveMarketCaps(typedTokens)
      
      // Filter and sort based on lane type
      const filteredTokens = typedTokens
        .filter(config.filter)
        .sort(config.sort)
        .slice(0, maxTokens)
      
      console.log(`[DEBUG] TokenLane (${type}) filtered tokens:`, filteredTokens.map(t => ({ mint: t.mint_address, name: t.name, live_mc: t.live_market_cap })))
      
      setTokens(filteredTokens)
    }
    setIsLoading(false)
  }, [config, maxTokens, fetchLiveMarketCaps, type])

  useEffect(() => {
    fetchTokens()

    // Real-time subscription
    const supabase = createClient()
    const channel = supabase
      .channel(`tokens-lane-${type}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tokens" }, () => {
        // Refetch on any change
        fetchTokens()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [type, fetchTokens])

  // Refresh market caps every 30 seconds
  useEffect(() => {
    if (tokens.length === 0) return
    
    const interval = setInterval(async () => {
      const updated = await fetchLiveMarketCaps(tokens)
      const filtered = updated.filter(config.filter).sort(config.sort)
      setTokens(filtered)
    }, 30000)

    return () => clearInterval(interval)
  }, [tokens.length, config, fetchLiveMarketCaps])

  return (
    <div className="flex flex-col h-full">
      {/* Lane Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "flex items-center justify-between gap-2 p-3 rounded-t-xl transition-all",
          "bg-gradient-to-r from-[var(--bg-elevated)] to-transparent",
          "border-b border-[var(--border-subtle)]",
          "hover:bg-[var(--bg-elevated)]"
        )}
      >
        <div className="flex items-center gap-2">
          <div className={cn("p-1.5 rounded-lg", accentColor)}>
            {icon}
          </div>
          <h3 className="font-semibold text-sm text-[var(--text-primary)]">
            {title}
          </h3>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--bg-tertiary)] text-[var(--text-muted)]">
            {tokens.length}
          </span>
        </div>
        
        <motion.svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-[var(--text-muted)]"
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </motion.svg>
      </button>

      {/* Lane Content */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className={cn(
              "flex-1 overflow-y-auto max-h-[600px] space-y-1 p-2",
              "bg-[var(--bg-primary)]/50 rounded-b-xl",
              "border border-t-0 border-[var(--border-subtle)]"
            )}>
              {isLoading ? (
                // Skeleton loading
                <div className="space-y-1">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-[60px] skeleton rounded-lg" />
                  ))}
                </div>
              ) : tokens.length === 0 ? (
                // Empty state
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className={cn("p-3 rounded-full mb-3", accentColor, "opacity-30")}>
                    {icon}
                  </div>
                  <p className="text-xs text-[var(--text-muted)]">{config.emptyMessage}</p>
                </div>
              ) : (
                // Token list
                <div className="space-y-1">
                  {tokens.map((token, index) => {
                    // Get real-time bonding progress from WebSocket if available
                    const realtimeProgress = progressMap[token.mint_address]?.progress
                    const tokenWithProgress = realtimeProgress !== undefined 
                      ? { ...token, bonding_progress: realtimeProgress }
                      : token
                    
                    return (
                      <motion.div
                        key={token.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.15, delay: index * 0.02 }}
                      >
                        <TokenRowCard 
                          token={tokenWithProgress} 
                          showProgress={type !== "migrated"}
                          compact={true}
                        />
                      </motion.div>
                    )
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

