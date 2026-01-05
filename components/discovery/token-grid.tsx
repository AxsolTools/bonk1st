"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import Image from "next/image"
import { motion } from "framer-motion"
import { createClient } from "@/lib/supabase/client"
import type { Token } from "@/lib/types/database"
import { cn, formatTimeAgo } from "@/lib/utils"
import { useBondingProgress } from "@/hooks/use-bonding-progress"

interface TokenWithCreator extends Token {
  creator?: {
    username: string | null
    avatar_url: string | null
  } | null
  live_market_cap?: number // Live market cap from API
  bonding_progress?: number // Real-time bonding curve progress from PumpPortal
}

const TOKENS_PER_PAGE = 20
const MAX_TOKENS = 100

export function TokenGrid() {
  const [tokens, setTokens] = useState<TokenWithCreator[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  // Get bonding token mint addresses for WebSocket subscription
  const bondingMints = tokens
    .filter(t => t.stage === "bonding" && t.pool_type !== 'jupiter')
    .map(t => t.mint_address)
    .filter(Boolean)

  // Subscribe to real-time bonding progress via PumpPortal WebSocket
  const { progressMap } = useBondingProgress(bondingMints)

  // Fetch live market caps for all tokens
  const fetchLiveMarketCaps = useCallback(async (tokenList: TokenWithCreator[]) => {
    if (tokenList.length === 0) return

    try {
      // Batch fetch prices for all tokens
      const mintAddresses = tokenList.map(t => t.mint_address).filter(Boolean)
      
      const response = await fetch('/api/price/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mints: mintAddresses }),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success && data.data) {
          setTokens(prev => prev.map(token => {
            const priceData = data.data[token.mint_address]
            if (priceData && priceData.marketCap > 0) {
              return { ...token, live_market_cap: priceData.marketCap }
            }
            return token
          }))
        }
      }
    } catch (error) {
      console.debug('[TOKEN-GRID] Failed to fetch live market caps:', error)
    }
  }, [])

  const fetchTokens = useCallback(async (page: number) => {
    setIsLoading(true)
    const supabase = createClient()
    
    // Calculate pagination range
    const from = (page - 1) * TOKENS_PER_PAGE
    const to = from + TOKENS_PER_PAGE - 1
    
    // Fetch total count (capped at MAX_TOKENS)
    const { count } = await supabase
      .from("tokens")
      .select("*", { count: "exact", head: true })
    
    const cappedTotal = Math.min(count || 0, MAX_TOKENS)
    setTotalCount(cappedTotal)
    
    // Fetch tokens with creator info for current page
    const { data: tokenData } = await supabase
      .from("tokens")
      .select(`
        *,
        creator:users!tokens_creator_id_fkey (
          username,
          avatar_url
        )
      `)
      .order("created_at", { ascending: false })
      .range(from, Math.min(to, MAX_TOKENS - 1))

    if (tokenData) {
      const typedTokens = tokenData as TokenWithCreator[]
      setTokens(typedTokens)
      // Fetch live market caps after initial load
      fetchLiveMarketCaps(typedTokens)
    }
    setIsLoading(false)
  }, [fetchLiveMarketCaps])

  useEffect(() => {
    fetchTokens(currentPage)

    // Real-time subscription for new tokens (only affects first page)
    const supabase = createClient()
    const channel = supabase
      .channel("tokens-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "tokens" }, (payload) => {
        if (payload.eventType === "INSERT" && currentPage === 1) {
          setTokens((prev) => [payload.new as TokenWithCreator, ...prev].slice(0, TOKENS_PER_PAGE))
          setTotalCount((prev) => Math.min(prev + 1, MAX_TOKENS))
        } else if (payload.eventType === "UPDATE") {
          setTokens((prev) => prev.map((t) => (t.id === (payload.new as Token).id ? { ...t, ...(payload.new as Token) } : t)))
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentPage, fetchTokens])

  // Refresh market caps every 30 seconds
  useEffect(() => {
    if (tokens.length === 0) return
    
    const interval = setInterval(() => {
      fetchLiveMarketCaps(tokens)
    }, 30000)

    return () => clearInterval(interval)
  }, [tokens.length, fetchLiveMarketCaps])

  const formatMarketCap = (mc: number | null | undefined) => {
    const m = mc || 0
    if (m >= 1000000) return `$${(m / 1000000).toFixed(2)}M`
    if (m >= 1000) return `$${(m / 1000).toFixed(1)}K`
    return `$${m.toFixed(0)}`
  }

  const formatChange = (change: number | null | undefined) => {
    const c = change || 0
    const prefix = c >= 0 ? "↑" : "↓"
    return `${prefix} ${Math.abs(c).toFixed(2)}%`
  }

  const formatAddress = (addr: string) => `${addr.slice(0, 4)}...${addr.slice(-4)}`

  const getMigrationProgress = (token: TokenWithCreator) => {
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

  const getMarketCap = (token: TokenWithCreator) => {
    return token.live_market_cap || token.market_cap_usd || token.market_cap || 0
  }

  const getCreatorDisplay = (token: TokenWithCreator) => {
    if (token.creator?.username) {
      return token.creator.username
    }
    if (token.creator_wallet) {
      return `${token.creator_wallet.slice(0, 4)}...${token.creator_wallet.slice(-4)}`
    }
    return "Unknown"
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
        {[...Array(15)].map((_, i) => (
          <div key={i} className="h-[140px] skeleton rounded-lg" />
        ))}
      </div>
    )
  }

  if (tokens.length === 0) {
    return (
      <div className="card p-12 text-center">
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center">
          <svg
            className="w-8 h-8 text-[var(--text-muted)]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M12 2C12 2 6 10 6 14C6 18 8.7 22 12 22C15.3 22 18 18 18 14C18 10 12 2 12 2Z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">No tokens yet</h3>
        <p className="text-sm text-[var(--text-muted)] mb-6">Be the first to launch a token</p>
        <Link href="/launch" className="btn-primary">
          Launch Token
        </Link>
      </div>
    )
  }

  const totalPages = Math.ceil(totalCount / TOKENS_PER_PAGE)
  
  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
      {tokens.map((token, index) => {
        // Get real-time bonding progress from WebSocket if available
        const realtimeProgress = progressMap[token.mint_address]?.progress
        const tokenWithProgress = realtimeProgress !== undefined 
          ? { ...token, bonding_progress: realtimeProgress }
          : token
        const progress = getMigrationProgress(tokenWithProgress)
        const isLive = token.stage === "bonding"
        const isMigrated = token.stage === "migrated"
        const isPositive = (token.change_24h || 0) >= 0
        const timeAgo = token.created_at ? formatTimeAgo(new Date(token.created_at)) : ""

        return (
          <motion.div
            key={token.id}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15, delay: index * 0.02 }}
          >
            <Link href={`/token/${token.mint_address}`}>
              <div className="card-interactive overflow-hidden group bg-[var(--bg-primary)] border border-[var(--border-subtle)] hover:border-[var(--aqua-primary)]/50 transition-all">
                {/* Horizontal layout: Image on left, info on right */}
                <div className="flex gap-3 p-3">
                  {/* Token Image - Square, left side */}
                  <div className="relative w-20 h-20 rounded-lg bg-[var(--bg-secondary)] flex-shrink-0 overflow-hidden">
                    {(() => {
                      // Get image URL - use Jupiter static hosting for Jupiter tokens
                      const imageUrl = token.image_url 
                        || (token.pool_type === 'jupiter' ? `https://static-create.jup.ag/images/${token.mint_address}` : null)
                      
                      return imageUrl ? (
                        <Image src={imageUrl} alt={token.name} fill className="object-cover" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[var(--aqua-primary)]/20 to-[var(--warm-pink)]/20">
                          <span className="text-xl font-bold text-[var(--text-muted)]">{token.symbol?.slice(0, 2)}</span>
                        </div>
                      )
                    })()}
                  </div>

                  {/* Token Info - Right side */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    {/* Top: Name + Symbol */}
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-sm text-[var(--text-primary)] truncate">{token.name}</h3>
                        {isLive && (
                          <span className="px-1.5 py-0.5 text-[8px] font-bold rounded bg-[var(--green)] text-white flex-shrink-0">
                            LIVE
                          </span>
                        )}
                        {isMigrated && (
                          <span className="px-1.5 py-0.5 text-[8px] font-bold rounded bg-[var(--aqua-primary)] text-[var(--ocean-deep)] flex-shrink-0">
                            DEX
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--text-muted)]">{token.symbol}</p>
                    </div>

                    {/* Middle: Creator + Time */}
                    <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                      {/* Creator Avatar */}
                      {token.creator?.avatar_url ? (
                        <Image 
                          src={token.creator.avatar_url} 
                          alt="" 
                          width={14} 
                          height={14} 
                          className="rounded-full"
                        />
                      ) : (
                        <div className="w-3.5 h-3.5 rounded-full bg-gradient-to-br from-[var(--aqua-primary)] to-[var(--warm-pink)] flex items-center justify-center">
                          <span className="text-[7px] font-bold text-white">
                            {(token.creator?.username || token.creator_wallet || "?").charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <span className="truncate">{getCreatorDisplay(token)}</span>
                      {timeAgo && (
                        <>
                          <span className="text-[var(--text-dim)]">•</span>
                          <span className="text-[var(--text-dim)] whitespace-nowrap">{timeAgo}</span>
                        </>
                      )}
                    </div>

                    {/* Bottom: Market Cap + Progress + Change */}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[var(--text-muted)]">MC</span>
                      <span className="text-sm font-bold text-[var(--aqua-primary)]">
                        {formatMarketCap(getMarketCap(token))}
                      </span>
                      
                      {/* Progress Bar - Gray track with green fill */}
                      <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[var(--green)] transition-all"
                          style={{ width: `${progress !== undefined ? Math.max(progress, 0) : 0}%` }}
                        />
                      </div>
                      
                      {/* Change Percentage */}
                      <span className={cn(
                        "text-[11px] font-bold whitespace-nowrap",
                        isPositive ? "text-[var(--green)]" : "text-[var(--red)]"
                      )}>
                        {formatChange(token.change_24h)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Description preview - bottom */}
                {token.description && (
                  <div className="px-3 pb-2">
                    <p className="text-[11px] text-[var(--text-muted)] line-clamp-2 leading-tight">
                      {token.description}
                    </p>
                  </div>
                )}
              </div>
            </Link>
          </motion.div>
        )
      })}
      </div>
      
      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
              currentPage === 1
                ? "bg-white/5 text-white/30 cursor-not-allowed"
                : "bg-white/10 text-white/70 hover:bg-white/20"
            )}
          >
            ← Prev
          </button>
          
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              let pageNum: number
              if (totalPages <= 5) {
                pageNum = i + 1
              } else if (currentPage <= 3) {
                pageNum = i + 1
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i
              } else {
                pageNum = currentPage - 2 + i
              }
              
              return (
                <button
                  key={pageNum}
                  onClick={() => handlePageChange(pageNum)}
                  className={cn(
                    "w-8 h-8 rounded-lg text-sm font-medium transition-all",
                    currentPage === pageNum
                      ? "bg-[var(--aqua-primary)] text-[var(--ocean-deep)]"
                      : "bg-white/5 text-white/60 hover:bg-white/10"
                  )}
                >
                  {pageNum}
                </button>
              )
            })}
          </div>
          
          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
              currentPage === totalPages
                ? "bg-white/5 text-white/30 cursor-not-allowed"
                : "bg-white/10 text-white/70 hover:bg-white/20"
            )}
          >
            Next →
          </button>
          
          <span className="ml-4 text-xs text-white/40">
            {totalCount} tokens (max 100)
          </span>
        </div>
      )}
    </div>
  )
}
