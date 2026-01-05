"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import Image from "next/image"
import { motion } from "framer-motion"
import { RefreshCw, TrendingUp, TrendingDown, ExternalLink, Copy, Clock, ChevronLeft, ChevronRight, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface LiveToken {
  symbol: string
  name: string
  address: string
  price: number
  priceChange24h: number
  priceChange1h?: number
  priceChange5m?: number
  volume24h: number
  volume1h?: number
  volume5m?: number
  liquidity: number
  marketCap: number
  pairCreatedAt: number
  logo: string
  txns24h: { buys: number; sells: number }
  txns1h?: { buys: number; sells: number }
  txns5m?: { buys: number; sells: number }
  source?: string
  trendingScore?: number
}

interface AllSolanaGridProps {
  source?: 'all' | 'trending'
}

const POLL_INTERVAL = 12000 // 12 seconds
const TOKENS_PER_PAGE = 30 // Show more tokens per page

export function AllSolanaGrid({ source = 'all' }: AllSolanaGridProps) {
  const [allTokens, setAllTokens] = useState<LiveToken[]>([])
  const [displayTokens, setDisplayTokens] = useState<LiveToken[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(12)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalTokens, setTotalTokens] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const lastFetchRef = useRef<number>(0)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Fetch tokens from API - now handles pagination properly
  const fetchTokens = useCallback(async (page: number = 1, append: boolean = false, showRefresh = false) => {
    const now = Date.now()
    
    // Prevent too frequent fetches for same page
    if (!append && now - lastFetchRef.current < 3000 && allTokens.length > 0 && !showRefresh) {
      return
    }
    lastFetchRef.current = now

    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()

    if (showRefresh) setIsRefreshing(true)
    if (append) setIsLoadingMore(true)
    if (!append && allTokens.length === 0) setIsLoading(true)

    try {
      const limit = 200 // Fetch 200 tokens per API call
      const endpoint = source === 'trending' 
        ? `/api/tokens/trending?limit=${limit}&page=${page}` 
        : `/api/tokens/live?limit=${limit}&page=${page}&sort=trending`
      
      const res = await fetch(endpoint, {
        signal: abortControllerRef.current.signal,
        cache: 'no-store',
      })
      
      if (!res.ok) throw new Error('Failed to fetch')
      
      const data = await res.json()
      
      if (data.success && data.data) {
        if (append) {
          setAllTokens(prev => {
            const newTokens = data.data.filter((t: LiveToken) => 
              !prev.some(existing => existing.address === t.address)
            )
            return [...prev, ...newTokens]
          })
        } else {
          setAllTokens(data.data)
        }
        
        setTotalTokens(data.total || data.data.length)
        setHasMore(data.hasMore !== false && data.data.length >= 50)
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return
      }
      console.error('Error fetching tokens:', error)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
      setIsLoadingMore(false)
    }
  }, [source, allTokens.length])

  // Initial fetch and polling
  useEffect(() => {
    fetchTokens(1, false)
    
    const pollInterval = setInterval(() => {
      fetchTokens(1, false)
      setCountdown(12)
    }, POLL_INTERVAL)

    const countdownInterval = setInterval(() => {
      setCountdown(prev => prev > 0 ? prev - 1 : 12)
    }, 1000)

    return () => {
      clearInterval(pollInterval)
      clearInterval(countdownInterval)
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [fetchTokens])

  // Re-fetch when source changes
  useEffect(() => {
    setIsLoading(true)
    setAllTokens([])
    setCurrentPage(1)
    fetchTokens(1, false)
  }, [source])

  // Update display tokens when page or allTokens changes
  useEffect(() => {
    const start = (currentPage - 1) * TOKENS_PER_PAGE
    const end = start + TOKENS_PER_PAGE
    setDisplayTokens(allTokens.slice(start, end))
  }, [currentPage, allTokens])

  const handleManualRefresh = () => {
    setCountdown(12)
    fetchTokens(1, false, true)
  }

  const loadMoreTokens = () => {
    if (hasMore && !isLoadingMore) {
      const nextPage = Math.ceil(allTokens.length / 200) + 1
      fetchTokens(nextPage, true)
    }
  }

  const copyAddress = (address: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    navigator.clipboard.writeText(address)
    setCopiedAddress(address)
    setTimeout(() => setCopiedAddress(null), 1500)
  }

  const formatPrice = (price: number) => {
    if (!price || price === 0) return '$0'
    if (price < 0.0000001) return `$${price.toExponential(1)}`
    if (price < 0.00001) return `$${price.toExponential(2)}`
    if (price < 0.001) return `$${price.toFixed(6)}`
    if (price < 1) return `$${price.toFixed(4)}`
    if (price < 100) return `$${price.toFixed(2)}`
    return `$${price.toFixed(0)}`
  }

  const formatCompact = (num: number) => {
    if (!num || num === 0) return '$0'
    if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(1)}B`
    if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`
    if (num >= 1_000) return `$${(num / 1_000).toFixed(0)}K`
    return `$${num.toFixed(0)}`
  }

  const getTokenAge = (timestamp: number) => {
    if (!timestamp) return ''
    const diff = Date.now() - timestamp
    const mins = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(hours / 24)
    
    if (days > 0) return `${days}d`
    if (hours > 0) return `${hours}h`
    return `${mins}m`
  }

  // Pagination
  const totalPages = Math.ceil(allTokens.length / TOKENS_PER_PAGE)

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    
    // Load more if nearing the end
    if (page >= totalPages - 1 && hasMore && !isLoadingMore) {
      loadMoreTokens()
    }
    
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (isLoading && allTokens.length === 0) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
        {[...Array(20)].map((_, i) => (
          <div key={i} className="h-[140px] skeleton rounded-lg" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header with stats */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-[var(--text-primary)]">
            {allTokens.length.toLocaleString()} tokens
          </span>
          {totalTokens > allTokens.length && (
            <span className="text-xs text-[var(--text-muted)]">
              of {totalTokens.toLocaleString()}+
            </span>
          )}
          <span className="text-xs bg-[var(--green)]/20 text-[var(--green)] px-2 py-0.5 rounded flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--green)] animate-pulse" />
            LIVE
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-[var(--text-dim)] tabular-nums">
            {countdown}s
          </span>
          <button
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="p-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] hover:border-[var(--border-default)] transition-all disabled:opacity-50"
          >
            <RefreshCw className={cn("w-3.5 h-3.5 text-[var(--text-muted)]", isRefreshing && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Token Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
        {displayTokens.map((token, index) => {
          const isPositive = token.priceChange24h >= 0
          const buyRatio = token.txns24h.buys + token.txns24h.sells > 0 
            ? (token.txns24h.buys / (token.txns24h.buys + token.txns24h.sells)) * 100 
            : 50
          const age = getTokenAge(token.pairCreatedAt)

          return (
            <motion.div
              key={`${token.address}-${index}`}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.1, delay: Math.min(index * 0.01, 0.2) }}
            >
              <Link href={`/token/${token.address}`}>
                <div className="card-interactive overflow-hidden group bg-[var(--bg-primary)] border border-[var(--border-subtle)] hover:border-[var(--aqua-primary)]/50 transition-all">
                  <div className="flex gap-3 p-3">
                    <div className="relative w-16 h-16 rounded-lg bg-[var(--bg-secondary)] flex-shrink-0 overflow-hidden">
                      <Image
                        src={token.logo}
                        alt={token.symbol}
                        fill
                        className="object-cover"
                        unoptimized
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 
                            `https://ui-avatars.com/api/?name=${token.symbol}&background=0a0a0a&color=00d9ff&size=64`
                        }}
                      />
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h3 className="font-bold text-sm text-[var(--text-primary)] truncate">{token.symbol}</h3>
                          {age && (
                            <span className="flex items-center gap-0.5 px-1 py-0.5 text-[8px] font-medium rounded bg-[var(--bg-secondary)] text-[var(--text-dim)] flex-shrink-0">
                              {age}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-[var(--text-muted)] truncate">{token.name}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[var(--text-primary)] font-medium">{formatPrice(token.price)}</span>
                        <span className={cn(
                          "flex items-center gap-0.5 text-[10px] font-semibold",
                          isPositive ? "text-[var(--green)]" : "text-[var(--red)]"
                        )}>
                          {isPositive ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                          {isPositive ? '+' : ''}{token.priceChange24h?.toFixed(1) || '0'}%
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[9px] text-[var(--text-dim)]">MC</span>
                        <span className="text-[11px] font-bold text-[var(--aqua-primary)]">
                          {formatCompact(token.marketCap)}
                        </span>
                        
                        <div className="flex-1 h-1 bg-[var(--bg-secondary)] rounded-full overflow-hidden flex">
                          <div className="h-full bg-[var(--green)]" style={{ width: `${buyRatio}%` }} />
                          <div className="h-full bg-[var(--red)]" style={{ width: `${100 - buyRatio}%` }} />
                        </div>
                        
                        <span className="text-[9px] text-[var(--text-dim)]">
                          {token.txns24h.buys + token.txns24h.sells}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="px-3 pb-2 flex gap-1">
                    <button
                      onClick={(e) => copyAddress(token.address, e)}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-[10px] font-medium transition-all",
                        copiedAddress === token.address
                          ? "bg-[var(--green)] text-[var(--ocean-deep)]"
                          : "bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]"
                      )}
                    >
                      <Copy className="w-3 h-3" />
                      {copiedAddress === token.address ? '✓' : 'Copy'}
                    </button>
                    <a
                      href={`https://dexscreener.com/solana/${token.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-[10px] font-medium bg-[var(--aqua-primary)] text-[var(--ocean-deep)] hover:bg-[var(--aqua-secondary)] transition-all"
                    >
                      Chart <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </Link>
            </motion.div>
          )
        })}
      </div>

      {/* Load More Button */}
      {hasMore && (
        <div className="flex justify-center pt-2">
          <button
            onClick={loadMoreTokens}
            disabled={isLoadingMore}
            className="flex items-center gap-2 px-6 py-2 bg-[var(--aqua-primary)] text-[var(--ocean-deep)] rounded-lg font-medium text-sm hover:bg-[var(--aqua-secondary)] transition-all disabled:opacity-50"
          >
            {isLoadingMore ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading more...
              </>
            ) : (
              <>Load More Tokens</>
            )}
          </button>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => handlePageChange(1)}
            disabled={currentPage === 1}
            className={cn(
              "p-2 rounded-lg transition-all",
              currentPage === 1 ? "text-white/20" : "text-white/60 hover:bg-white/10"
            )}
          >
            <ChevronLeft className="w-4 h-4" />
            <ChevronLeft className="w-4 h-4 -ml-2" />
          </button>
          
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
              currentPage === 1 ? "bg-white/5 text-white/30" : "bg-white/10 text-white/70 hover:bg-white/20"
            )}
          >
            Prev
          </button>
          
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let pageNum: number
              if (totalPages <= 7) {
                pageNum = i + 1
              } else if (currentPage <= 4) {
                pageNum = i + 1
              } else if (currentPage >= totalPages - 3) {
                pageNum = totalPages - 6 + i
              } else {
                pageNum = currentPage - 3 + i
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
              currentPage === totalPages ? "bg-white/5 text-white/30" : "bg-white/10 text-white/70 hover:bg-white/20"
            )}
          >
            Next
          </button>
          
          <button
            onClick={() => handlePageChange(totalPages)}
            disabled={currentPage === totalPages}
            className={cn(
              "p-2 rounded-lg transition-all",
              currentPage === totalPages ? "text-white/20" : "text-white/60 hover:bg-white/10"
            )}
          >
            <ChevronRight className="w-4 h-4" />
            <ChevronRight className="w-4 h-4 -ml-2" />
          </button>
          
          <span className="ml-4 text-xs text-white/40">
            Page {currentPage} of {totalPages}
          </span>
        </div>
      )}

      {allTokens.length === 0 && !isLoading && (
        <div className="card p-8 text-center">
          <RefreshCw className="w-8 h-8 mx-auto mb-3 text-[var(--text-muted)]" />
          <p className="text-sm text-[var(--text-muted)] mb-3">No tokens found</p>
          <button onClick={handleManualRefresh} className="btn-primary text-sm">
            Refresh
          </button>
        </div>
      )}
    </div>
  )
}
