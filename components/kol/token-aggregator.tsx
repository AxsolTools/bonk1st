"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import Link from "next/link"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Search,
  Filter,
  RefreshCw,
  ExternalLink,
  Copy,
  BarChart3,
  Flame,
  Clock,
  Zap,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Activity,
  Droplets,
  DollarSign,
  ArrowUpDown,
  Sparkles,
  Target,
  Gauge,
  ChevronLeft,
  ChevronRight,
  Rocket,
  Eye,
  BadgeCheck,
  Crown,
  Star,
  Loader2,
  ArrowUp,
  ArrowDown,
  CircleDot,
  TrendingUpIcon,
  Users,
  Radio,
} from "lucide-react"

// ============================================================================
// TYPES
// ============================================================================

interface TokenData {
  address: string
  symbol: string
  name: string
  price: number
  priceChange24h: number
  priceChange1h: number
  priceChange5m?: number
  volume24h: number
  volume6h?: number
  volume1h: number
  volume5m?: number
  liquidity: number
  marketCap: number
  fdv: number
  pairCreatedAt: number
  pairAddress?: string
  logo: string
  dexId?: string
  txns24h: { buys: number; sells: number }
  txns6h?: { buys: number; sells: number }
  txns1h: { buys: number; sells: number }
  txns5m?: { buys: number; sells: number }
  holders?: number
  source?: string
  trendingScore?: number
  buySignal?: number
  sellSignal?: number
  riskScore?: number
  momentumScore?: number
  isPumpFun?: boolean
  isMigrated?: boolean
  bondingCurveProgress?: number
  hasDexScreenerProfile?: boolean
  hasDexScreenerBoost?: boolean
  boostAmount?: number
  hasEnhancedProfile?: boolean
  volumeToMcapRatio?: number
  buyPressure?: number
  liquidityScore?: number
  volatility24h?: number
  accumulationScore?: number
  // Pre-pump detection signals
  prePumpScore?: number
  prePumpSignals?: {
    freshWalletInflux: number
    walletVelocity: number
    txClustering: number
    bondingVelocity: number
    sellAbsence: number
    buySizeShift: number
  }
  prePumpAlerts?: string[]
  freshWalletRate?: number
  coordinatedWallets?: number
}

interface AggregatorFilters {
  minLiquidity: number
  minVolume: number
  minMarketCap: number
  maxAge: number
  hideHighRisk: boolean
  showBoostedOnly: boolean
  showPumpFunOnly: boolean
  showBuySignals: boolean
  showPrePump: boolean
  sortBy: 'trending' | 'volume' | 'priceChange' | 'marketCap' | 'liquidity' | 'new' | 'momentum' | 'buySignal' | 'risk' | 'prePump'
  sortDir: 'desc' | 'asc'
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_FILTERS: AggregatorFilters = {
  minLiquidity: 0,
  minVolume: 0,
  minMarketCap: 0,
  maxAge: 720,
  hideHighRisk: false,
  showBoostedOnly: false,
  showPumpFunOnly: false,
  showBuySignals: false,
  showPrePump: false,
  sortBy: 'trending',
  sortDir: 'desc',
}

const TOKENS_PER_PAGE = 25
const POLL_INTERVAL = 12000

// ============================================================================
// BADGE IMAGES - Real logos from DexScreener, Pump.fun
// ============================================================================

const DEXSCREENER_LOGO = "https://dexscreener.com/favicon.png"
const PUMPFUN_LOGO = "https://pump.fun/icon.png"

// ============================================================================
// COMPONENT
// ============================================================================

export function TokenAggregator() {
  const [allTokens, setAllTokens] = useState<TokenData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<AggregatorFilters>(DEFAULT_FILTERS)
  const [search, setSearch] = useState("")
  const [countdown, setCountdown] = useState(12)
  const [showFilters, setShowFilters] = useState(false)
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [viewMode, setViewMode] = useState<'cards' | 'compact' | 'table'>('cards')
  const [hasMore, setHasMore] = useState(true)
  const lastFetchRef = useRef<number>(0)
  const abortControllerRef = useRef<AbortController | null>(null)

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  const fetchTokens = useCallback(async (append = false, showRefresh = false) => {
    const now = Date.now()
    if (!append && now - lastFetchRef.current < 3000 && allTokens.length > 0 && !showRefresh) {
      return
    }
    lastFetchRef.current = now

    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()

    if (showRefresh) setIsRefreshing(true)
    if (append) setIsLoadingMore(true)
    if (!append && allTokens.length === 0) setIsLoading(true)

    try {
      const page = append ? Math.ceil(allTokens.length / 200) + 1 : 1
      const sortParam = filters.sortBy === 'buySignal' ? 'buy_signal' : filters.sortBy
      
      const res = await fetch(`/api/tokens/live?limit=300&page=${page}&sort=${sortParam}`, {
        signal: abortControllerRef.current.signal,
        cache: 'no-store',
      })

      if (!res.ok) throw new Error('Failed to fetch tokens')
      
      const data = await res.json()

      if (data.success && data.data) {
        if (append) {
          setAllTokens(prev => {
            const newTokens = data.data.filter((t: TokenData) =>
              !prev.some(existing => existing.address === t.address)
            )
            return [...prev, ...newTokens]
          })
        } else {
          setAllTokens(data.data)
        }
        setHasMore(data.hasMore !== false && data.data.length >= 100)
        setError(null)
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Failed to fetch tokens')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
      setIsLoadingMore(false)
    }
  }, [allTokens.length, filters.sortBy])

  useEffect(() => {
    fetchTokens()
    
    const pollTimer = setInterval(() => {
      fetchTokens()
      setCountdown(12)
    }, POLL_INTERVAL)

    const countdownTimer = setInterval(() => {
      setCountdown(prev => prev > 0 ? prev - 1 : 12)
    }, 1000)

    return () => {
      clearInterval(pollTimer)
      clearInterval(countdownTimer)
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [fetchTokens])

  // ============================================================================
  // FILTERING & SORTING
  // ============================================================================

  const filteredTokens = useMemo(() => {
    let result = [...allTokens]

    // Search filter
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(t =>
        t.symbol.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.address.toLowerCase().includes(q)
      )
    }

    // Apply filters
    result = result.filter(t => {
      if (filters.minLiquidity > 0 && t.liquidity < filters.minLiquidity) return false
      if (filters.minVolume > 0 && t.volume24h < filters.minVolume) return false
      if (filters.minMarketCap > 0 && t.marketCap < filters.minMarketCap) return false
      
      const ageHours = (Date.now() - t.pairCreatedAt) / 3600000
      if (ageHours > filters.maxAge) return false
      
      if (filters.hideHighRisk && (t.riskScore || 0) > 70) return false
      if (filters.showBoostedOnly && !t.hasDexScreenerBoost) return false
      if (filters.showPumpFunOnly && !t.isPumpFun) return false
      if (filters.showBuySignals && (t.buySignal || 0) < 65) return false
      if (filters.showPrePump && (t.prePumpScore || 0) < 50) return false
      
      return true
    })

    // Sort
    result.sort((a, b) => {
      const dir = filters.sortDir === 'desc' ? 1 : -1
      
      switch (filters.sortBy) {
        case 'trending':
          return ((b.trendingScore || 0) - (a.trendingScore || 0)) * dir
        case 'volume':
          return (b.volume24h - a.volume24h) * dir
        case 'priceChange':
          return (b.priceChange24h - a.priceChange24h) * dir
        case 'marketCap':
          return (b.marketCap - a.marketCap) * dir
        case 'liquidity':
          return (b.liquidity - a.liquidity) * dir
        case 'momentum':
          return ((b.momentumScore || 0) - (a.momentumScore || 0)) * dir
        case 'buySignal':
          return ((b.buySignal || 0) - (a.buySignal || 0)) * dir
        case 'risk':
          return ((a.riskScore || 0) - (b.riskScore || 0)) * dir // Lower risk first
        case 'new':
          return (b.pairCreatedAt - a.pairCreatedAt) * dir
        case 'prePump':
          // Sort by pre-pump score (highest first)
          const scoreA = a.prePumpScore || 0
          const scoreB = b.prePumpScore || 0
          if (scoreA !== scoreB) return (scoreB - scoreA) * dir
          return ((b.trendingScore || 0) - (a.trendingScore || 0)) * dir
        default:
          return 0
      }
    })

    return result
  }, [allTokens, search, filters])

  // ============================================================================
  // PAGINATION
  // ============================================================================

  const totalPages = Math.ceil(filteredTokens.length / TOKENS_PER_PAGE)
  const paginatedTokens = filteredTokens.slice(
    (currentPage - 1) * TOKENS_PER_PAGE,
    currentPage * TOKENS_PER_PAGE
  )

  useEffect(() => {
    setCurrentPage(1)
  }, [search, filters])

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    
    // Load more if nearing the end
    if (page >= totalPages - 1 && hasMore && !isLoadingMore) {
      fetchTokens(true)
    }
  }

  // ============================================================================
  // STATS
  // ============================================================================

  const stats = useMemo(() => {
    const now = Date.now()
    const oneHourAgo = now - 3600000
    
    return {
      totalTokens: filteredTokens.length,
      newTokens1h: filteredTokens.filter(t => t.pairCreatedAt > oneHourAgo).length,
      boostedTokens: filteredTokens.filter(t => t.hasDexScreenerBoost).length,
      pumpFunTokens: filteredTokens.filter(t => t.isPumpFun).length,
      buySignals: filteredTokens.filter(t => (t.buySignal || 0) >= 70).length,
      highMomentum: filteredTokens.filter(t => (t.momentumScore || 0) > 70).length,
      totalVolume: filteredTokens.reduce((sum, t) => sum + t.volume24h, 0),
      avgBuyPressure: filteredTokens.length > 0 
        ? filteredTokens.reduce((sum, t) => sum + (t.buyPressure || 50), 0) / filteredTokens.length 
        : 50,
      // Pre-pump stats
      prePumpSignals: filteredTokens.filter(t => (t.prePumpScore || 0) >= 50).length,
      highPrePump: filteredTokens.filter(t => (t.prePumpScore || 0) >= 70).length,
    }
  }, [filteredTokens])

  // ============================================================================
  // UTILITIES
  // ============================================================================

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

  const getAgeDisplay = (timestamp: number) => {
    if (!timestamp) return ''
    const diff = Date.now() - timestamp
    const mins = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(hours / 24)
    
    if (days > 0) return `${days}d`
    if (hours > 0) return `${hours}h`
    return `${mins}m`
  }

  const getSignalColor = (score: number) => {
    if (score >= 75) return 'text-[var(--green)]'
    if (score >= 60) return 'text-yellow-400'
    if (score >= 40) return 'text-[var(--text-muted)]'
    return 'text-[var(--red)]'
  }

  const getRiskColor = (score: number) => {
    if (score <= 30) return 'text-[var(--green)]'
    if (score <= 50) return 'text-yellow-400'
    if (score <= 70) return 'text-orange-500'
    return 'text-[var(--red)]'
  }

  const handleManualRefresh = () => {
    setCountdown(12)
    fetchTokens(false, true)
  }

  // ============================================================================
  // LOADING STATE
  // ============================================================================

  if (isLoading && allTokens.length === 0) {
    return (
      <div className="h-full flex flex-col">
        <div className="p-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <Loader2 className="w-5 h-5 text-[var(--aqua-primary)] animate-spin" />
            <span className="text-lg font-bold text-[var(--text-primary)]">Loading tokens...</span>
          </div>
        </div>
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 p-4">
          {[...Array(15)].map((_, i) => (
            <div key={i} className="h-[180px] skeleton rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-[var(--border-subtle)] flex-shrink-0">
        {/* Top Bar */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className="text-xs bg-[var(--green)]/20 text-[var(--green)] px-2 py-0.5 rounded flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--green)] animate-pulse" />
              LIVE
            </span>
            <span className="text-sm font-bold text-[var(--text-primary)]">
              {filteredTokens.length.toLocaleString()} tokens
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex items-center gap-0.5 bg-[var(--bg-secondary)] rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('cards')}
                className={cn(
                  "p-1.5 rounded text-xs transition-all",
                  viewMode === 'cards' ? "bg-[var(--aqua-primary)]/20 text-[var(--aqua-primary)]" : "text-[var(--text-muted)]"
                )}
                title="Card View"
              >
                <BarChart3 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode('compact')}
                className={cn(
                  "p-1.5 rounded text-xs transition-all",
                  viewMode === 'compact' ? "bg-[var(--aqua-primary)]/20 text-[var(--aqua-primary)]" : "text-[var(--text-muted)]"
                )}
                title="Compact View"
              >
                <Activity className="w-3.5 h-3.5" />
              </button>
            </div>
            <span className="text-[10px] text-[var(--text-dim)] tabular-nums">{countdown}s</span>
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="p-1.5 rounded bg-[var(--bg-secondary)] hover:bg-[var(--bg-elevated)] transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn("w-3.5 h-3.5 text-[var(--text-muted)]", isRefreshing && "animate-spin")} />
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-4 sm:grid-cols-9 gap-2 mb-3">
          <StatCard icon={Target} label="Total" value={stats.totalTokens} color="text-[var(--text-primary)]" />
          <StatCard icon={Sparkles} label="New 1h" value={stats.newTokens1h} color="text-[var(--aqua-primary)]" />
          <StatCard icon={Zap} label="Boosted" value={stats.boostedTokens} color="text-yellow-400" />
          <StatCard icon={Rocket} label="Pump.fun" value={stats.pumpFunTokens} color="text-purple-400" />
          <StatCard icon={TrendingUp} label="Buy Signals" value={stats.buySignals} color="text-[var(--green)]" />
          <StatCard icon={Radio} label="Pre-Pump" value={stats.prePumpSignals} color="text-cyan-400" />
          <StatCard icon={Flame} label="Hot" value={stats.highMomentum} color="text-orange-400" />
          <StatCard icon={DollarSign} label="24h Vol" value={`$${(stats.totalVolume / 1e6).toFixed(1)}M`} color="text-[var(--text-primary)]" isString />
          <StatCard icon={Gauge} label="Buy Press." value={`${stats.avgBuyPressure.toFixed(0)}%`} color={stats.avgBuyPressure > 55 ? "text-[var(--green)]" : "text-[var(--text-muted)]"} isString />
        </div>

        {/* Search and Filter Row */}
        <div className="flex gap-2 flex-wrap">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tokens..."
              className="w-full pl-9 pr-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--aqua-primary)]/50"
            />
          </div>
          
          {/* Quick Sort Buttons */}
          <div className="flex items-center gap-1">
            {[
              { key: 'trending', label: 'Hot', icon: Flame },
              { key: 'prePump', label: 'Pump', icon: Radio },
              { key: 'buySignal', label: 'Buy', icon: TrendingUp },
              { key: 'volume', label: 'Vol', icon: DollarSign },
              { key: 'new', label: 'New', icon: Sparkles },
            ].map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setFilters(f => ({ 
                  ...f, 
                  sortBy: key as AggregatorFilters['sortBy'],
                  sortDir: f.sortBy === key ? (f.sortDir === 'desc' ? 'asc' : 'desc') : 'desc'
                }))}
                className={cn(
                  "flex items-center gap-1 px-2 py-1.5 rounded text-[10px] font-medium transition-all",
                  filters.sortBy === key 
                    ? "bg-[var(--aqua-primary)]/20 text-[var(--aqua-primary)]"
                    : "bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                )}
              >
                <Icon className="w-3 h-3" />
                {label}
                {filters.sortBy === key && (
                  <span className="text-[8px]">{filters.sortDir === 'desc' ? '↓' : '↑'}</span>
                )}
              </button>
            ))}
          </div>

          {/* Quick Filters with Real Logos */}
          <div className="flex items-center gap-1">
            {/* DexScreener Boost Filter */}
            <button
              onClick={() => setFilters(f => ({ ...f, showBoostedOnly: !f.showBoostedOnly }))}
              className={cn(
                "flex items-center gap-1 px-2 py-1.5 rounded text-[10px] font-medium transition-all border",
                filters.showBoostedOnly
                  ? "bg-yellow-500/20 border-yellow-500/50"
                  : "bg-[var(--bg-secondary)] border-transparent text-[var(--text-muted)]"
              )}
              title="Show boosted tokens only"
            >
              <img 
                src={DEXSCREENER_LOGO} 
                alt="DexScreener" 
                className="w-3.5 h-3.5 rounded-sm"
                onError={(e) => { (e.target as HTMLImageElement).src = '' }}
              />
              <Zap className={cn("w-3 h-3", filters.showBoostedOnly ? "text-yellow-400" : "")} />
            </button>
            
            {/* Pump.fun Filter */}
            <button
              onClick={() => setFilters(f => ({ ...f, showPumpFunOnly: !f.showPumpFunOnly }))}
              className={cn(
                "flex items-center gap-1 px-2 py-1.5 rounded text-[10px] font-medium transition-all border",
                filters.showPumpFunOnly
                  ? "bg-purple-500/20 border-purple-500/50"
                  : "bg-[var(--bg-secondary)] border-transparent text-[var(--text-muted)]"
              )}
              title="Show Pump.fun tokens only"
            >
              <img 
                src={PUMPFUN_LOGO} 
                alt="Pump.fun" 
                className="w-3.5 h-3.5 rounded-full"
                onError={(e) => { (e.target as HTMLImageElement).src = '' }}
              />
            </button>
            
            {/* Buy Signals Filter */}
            <button
              onClick={() => setFilters(f => ({ ...f, showBuySignals: !f.showBuySignals }))}
              className={cn(
                "flex items-center gap-1 px-2 py-1.5 rounded text-[10px] font-medium transition-all border",
                filters.showBuySignals
                  ? "bg-[var(--green)]/20 border-[var(--green)]/50 text-[var(--green)]"
                  : "bg-[var(--bg-secondary)] border-transparent text-[var(--text-muted)]"
              )}
              title="Show strong buy signals only (65+)"
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span className="text-[9px]">BUY</span>
            </button>
            
            {/* Pre-Pump Filter */}
            <button
              onClick={() => setFilters(f => ({ ...f, showPrePump: !f.showPrePump }))}
              className={cn(
                "flex items-center gap-1 px-2 py-1.5 rounded text-[10px] font-medium transition-all border",
                filters.showPrePump
                  ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-400"
                  : "bg-[var(--bg-secondary)] border-transparent text-[var(--text-muted)]"
              )}
              title="Show pre-pump signals only (50+)"
            >
              <Radio className="w-3.5 h-3.5" />
              <span className="text-[9px]">PUMP</span>
            </button>
          </div>
          
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-lg border transition-colors",
              showFilters 
                ? "bg-[var(--aqua-primary)]/20 border-[var(--aqua-primary)]/50 text-[var(--aqua-primary)]"
                : "bg-[var(--bg-secondary)] border-[var(--border-subtle)] text-[var(--text-muted)]"
            )}
          >
            <Filter className="w-4 h-4" />
          </button>
        </div>

        {/* Advanced Filters Panel */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="pt-3 flex flex-wrap gap-2">
                <select
                  value={filters.minLiquidity}
                  onChange={(e) => setFilters(f => ({ ...f, minLiquidity: parseInt(e.target.value) }))}
                  className="px-2 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded text-xs text-[var(--text-primary)]"
                >
                  <option value={0}>Any Liquidity</option>
                  <option value={5000}>$5K+ Liq</option>
                  <option value={10000}>$10K+ Liq</option>
                  <option value={50000}>$50K+ Liq</option>
                  <option value={100000}>$100K+ Liq</option>
                </select>
                <select
                  value={filters.minVolume}
                  onChange={(e) => setFilters(f => ({ ...f, minVolume: parseInt(e.target.value) }))}
                  className="px-2 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded text-xs text-[var(--text-primary)]"
                >
                  <option value={0}>Any Volume</option>
                  <option value={10000}>$10K+ Vol</option>
                  <option value={50000}>$50K+ Vol</option>
                  <option value={100000}>$100K+ Vol</option>
                </select>
                <select
                  value={filters.maxAge}
                  onChange={(e) => setFilters(f => ({ ...f, maxAge: parseInt(e.target.value) }))}
                  className="px-2 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded text-xs text-[var(--text-primary)]"
                >
                  <option value={1}>1 hour</option>
                  <option value={6}>6 hours</option>
                  <option value={24}>24 hours</option>
                  <option value={72}>3 days</option>
                  <option value={168}>7 days</option>
                  <option value={720}>30 days</option>
                </select>
                <label className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)] cursor-pointer px-2">
                  <input
                    type="checkbox"
                    checked={filters.hideHighRisk}
                    onChange={(e) => setFilters(f => ({ ...f, hideHighRisk: e.target.checked }))}
                    className="rounded w-3 h-3"
                  />
                  Hide High Risk
                </label>
                <button
                  onClick={() => setFilters(DEFAULT_FILTERS)}
                  className="px-2 py-1.5 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  Reset All
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Token Grid */}
      <div className="flex-1 overflow-y-auto p-3">
        {error ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)]">
            <AlertTriangle className="w-8 h-8 mb-2 text-[var(--red)]" />
            <p>{error}</p>
            <button onClick={handleManualRefresh} className="mt-4 px-4 py-2 bg-[var(--aqua-primary)] text-[var(--ocean-deep)] rounded-lg text-sm font-medium">
              Retry
            </button>
          </div>
        ) : filteredTokens.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)]">
            <Search className="w-8 h-8 mb-2" />
            <p>No tokens match your filters</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className={cn(
              "grid gap-3",
              viewMode === 'cards' 
                ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
                : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            )}>
              {paginatedTokens.map((token, index) => (
                <TokenCard
                  key={token.address}
                  token={token}
                  index={index}
                  viewMode={viewMode}
                  copiedAddress={copiedAddress}
                  onCopy={copyAddress}
                  formatPrice={formatPrice}
                  formatCompact={formatCompact}
                  getAgeDisplay={getAgeDisplay}
                  getSignalColor={getSignalColor}
                  getRiskColor={getRiskColor}
                />
              ))}
            </div>

            {/* Load More */}
            {hasMore && (
              <div className="flex justify-center pt-2">
                <button
                  onClick={() => fetchTokens(true)}
                  disabled={isLoadingMore}
                  className="flex items-center gap-2 px-6 py-2 bg-[var(--aqua-primary)] text-[var(--ocean-deep)] rounded-lg font-medium text-sm hover:bg-[var(--aqua-secondary)] transition-all disabled:opacity-50"
                >
                  {isLoadingMore ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>Load More Tokens</>
                  )}
                </button>
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalTokens={filteredTokens.length}
                onPageChange={handlePageChange}
              />
            )}
          </div>
        )}
      </div>

      {/* Copy Toast */}
      <AnimatePresence>
        {copiedAddress && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-[var(--aqua-primary)] text-[var(--ocean-deep)] px-4 py-2 rounded-lg text-sm font-medium z-50"
          >
            Address copied!
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function StatCard({ icon: Icon, label, value, color, isString = false }: {
  icon: any
  label: string
  value: number | string
  color: string
  isString?: boolean
}) {
  return (
    <div className="p-2 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-subtle)]">
      <div className="text-[9px] text-[var(--text-muted)] flex items-center gap-1">
        <Icon className="w-3 h-3" />
        {label}
      </div>
      <div className={cn("text-sm font-bold", color)}>
        {isString ? value : typeof value === 'number' ? value.toLocaleString() : value}
      </div>
    </div>
  )
}

function TokenCard({
  token,
  index,
  viewMode,
  copiedAddress,
  onCopy,
  formatPrice,
  formatCompact,
  getAgeDisplay,
  getSignalColor,
  getRiskColor,
}: {
  token: TokenData
  index: number
  viewMode: 'cards' | 'compact' | 'table'
  copiedAddress: string | null
  onCopy: (address: string, e: React.MouseEvent) => void
  formatPrice: (price: number) => string
  formatCompact: (num: number) => string
  getAgeDisplay: (timestamp: number) => string
  getSignalColor: (score: number) => string
  getRiskColor: (score: number) => string
}) {
  const isPositive = token.priceChange24h >= 0
  const buyRatio = token.txns24h.buys + token.txns24h.sells > 0 
    ? (token.txns24h.buys / (token.txns24h.buys + token.txns24h.sells)) * 100 
    : 50
  const age = getAgeDisplay(token.pairCreatedAt)
  const buySignal = token.buySignal || 0
  const sellSignal = token.sellSignal || 0
  const riskScore = token.riskScore || 50
  const momentumScore = token.momentumScore || 50

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.1, delay: Math.min(index * 0.01, 0.15) }}
    >
      <Link href={`/token/${token.address}`}>
        <div className="card-interactive overflow-hidden group bg-[var(--bg-primary)] border border-[var(--border-subtle)] hover:border-[var(--aqua-primary)]/50 transition-all relative">
          {/* Badge Row - Top Right */}
          <div className="absolute top-2 right-2 flex items-center gap-1 z-10">
            {/* Pre-Pump Signal Badge */}
            {(token.prePumpScore || 0) >= 50 && (
              <div 
                className={cn(
                  "flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border animate-pulse",
                  (token.prePumpScore || 0) >= 70 
                    ? "bg-gradient-to-r from-cyan-500/40 to-blue-500/40 border-cyan-400/70" 
                    : "bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border-cyan-500/50"
                )} 
                title={`Pre-Pump Score: ${token.prePumpScore}${token.prePumpAlerts?.length ? ' - ' + token.prePumpAlerts[0] : ''}`}
              >
                <Radio className={cn("w-2.5 h-2.5", (token.prePumpScore || 0) >= 70 ? "text-cyan-300" : "text-cyan-400")} />
                <span className={cn("text-[8px] font-bold", (token.prePumpScore || 0) >= 70 ? "text-cyan-300" : "text-cyan-400")}>
                  {token.prePumpScore}
                </span>
              </div>
            )}
            
            {/* DexScreener Boost Badge - Lightning with real DexScreener icon */}
            {token.hasDexScreenerBoost && (
              <div 
                className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-gradient-to-r from-yellow-500/30 to-orange-500/30 border border-yellow-500/50" 
                title={`${token.boostAmount || 1} Boost${(token.boostAmount || 1) > 1 ? 's' : ''} on DexScreener`}
              >
                <img 
                  src={DEXSCREENER_LOGO} 
                  alt="DexScreener" 
                  className="w-3 h-3 rounded-sm"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
                <Zap className="w-2.5 h-2.5 text-yellow-400" />
                {(token.boostAmount || 0) > 1 && (
                  <span className="text-[8px] font-bold text-yellow-300">{token.boostAmount}</span>
                )}
              </div>
            )}
            
            {/* DexScreener Profile Badge - Has paid/enhanced profile */}
            {token.hasDexScreenerProfile && !token.hasDexScreenerBoost && (
              <div 
                className="flex items-center gap-0.5 px-1 py-0.5 rounded-full bg-blue-500/20 border border-blue-500/40" 
                title="Verified DexScreener Profile"
              >
                <img 
                  src={DEXSCREENER_LOGO} 
                  alt="DexScreener" 
                  className="w-3 h-3 rounded-sm"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              </div>
            )}
            
            {/* Pump.fun Badge - Real Pump.fun icon */}
            {token.isPumpFun && (
              <div 
                className={cn(
                  "flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border",
                  token.isMigrated 
                    ? "bg-gradient-to-r from-green-500/20 to-emerald-500/20 border-green-500/50" 
                    : "bg-gradient-to-r from-purple-500/20 to-pink-500/20 border-purple-500/50"
                )} 
                title={token.isMigrated ? "Migrated from Pump.fun to Raydium" : `Pump.fun Token${token.bondingCurveProgress ? ` - ${token.bondingCurveProgress}% bonded` : ''}`}
              >
                <img 
                  src={PUMPFUN_LOGO} 
                  alt="Pump.fun" 
                  className="w-3 h-3 rounded-full"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
                {token.isMigrated ? (
                  <span className="text-[8px] font-bold text-green-400">DEX</span>
                ) : token.bondingCurveProgress && token.bondingCurveProgress > 30 ? (
                  <span className="text-[8px] font-bold text-purple-300">{token.bondingCurveProgress}%</span>
                ) : null}
              </div>
            )}
          </div>

          {/* Main Content */}
          <div className="flex gap-3 p-3">
            {/* Token Image */}
            <div className="relative w-16 h-16 rounded-lg bg-[var(--bg-secondary)] flex-shrink-0 overflow-hidden">
              <Image
                src={token.logo || `https://dd.dexscreener.com/ds-data/tokens/solana/${token.address}.png`}
                alt={token.symbol}
                fill
                className="object-cover"
                unoptimized
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 
                    `https://ui-avatars.com/api/?name=${token.symbol}&background=0a0a0a&color=00d9ff&size=64`
                }}
              />
              
              {/* Momentum Indicator */}
              {momentumScore > 70 && (
                <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center border-2 border-[var(--bg-primary)]">
                  <Flame className="w-3 h-3 text-white" />
                </div>
              )}
            </div>

            {/* Token Info */}
            <div className="flex-1 min-w-0 flex flex-col justify-between">
              {/* Top: Name + Age */}
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

              {/* Middle: Price + Change */}
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

              {/* Bottom: MC + Buy Pressure Bar */}
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-[var(--text-dim)]">MC</span>
                <span className="text-[11px] font-bold text-[var(--aqua-primary)]">
                  {formatCompact(token.marketCap)}
                </span>
                
                {/* Buy/Sell Pressure Bar */}
                <div className="flex-1 h-1.5 bg-[var(--bg-secondary)] rounded-full overflow-hidden flex" title={`Buy: ${buyRatio.toFixed(0)}%`}>
                  <div className="h-full bg-[var(--green)]" style={{ width: `${buyRatio}%` }} />
                  <div className="h-full bg-[var(--red)]" style={{ width: `${100 - buyRatio}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* Signal Row */}
          <div className="px-3 pb-2 flex items-center justify-between gap-2">
            {/* Buy/Sell Signals */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1" title={`Buy Signal: ${buySignal}`}>
                <ArrowUp className={cn("w-3 h-3", getSignalColor(buySignal))} />
                <span className={cn("text-[10px] font-bold", getSignalColor(buySignal))}>{buySignal}</span>
              </div>
              <div className="flex items-center gap-1" title={`Sell Warning: ${sellSignal}`}>
                <ArrowDown className={cn("w-3 h-3", getRiskColor(sellSignal))} />
                <span className={cn("text-[10px] font-bold", getRiskColor(sellSignal))}>{sellSignal}</span>
              </div>
              <div className="flex items-center gap-1" title={`Risk Score: ${riskScore}`}>
                <Shield className={cn("w-3 h-3", getRiskColor(riskScore))} />
                <span className={cn("text-[10px] font-bold", getRiskColor(riskScore))}>{riskScore}</span>
              </div>
            </div>

            {/* Volume + Liquidity */}
            <div className="flex items-center gap-2 text-[9px] text-[var(--text-muted)]">
              <span>Vol: {formatCompact(token.volume24h)}</span>
              <span>Liq: {formatCompact(token.liquidity)}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="px-3 pb-2 flex gap-1">
            <button
              onClick={(e) => onCopy(token.address, e)}
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
}

function Pagination({ currentPage, totalPages, totalTokens, onPageChange }: {
  currentPage: number
  totalPages: number
  totalTokens: number
  onPageChange: (page: number) => void
}) {
  return (
    <div className="flex items-center justify-center gap-2 pt-2">
      <button
        onClick={() => onPageChange(1)}
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
        onClick={() => onPageChange(currentPage - 1)}
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
              onClick={() => onPageChange(pageNum)}
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
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className={cn(
          "px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
          currentPage === totalPages ? "bg-white/5 text-white/30" : "bg-white/10 text-white/70 hover:bg-white/20"
        )}
      >
        Next
      </button>
      
      <button
        onClick={() => onPageChange(totalPages)}
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
        Page {currentPage}/{totalPages} • {totalTokens.toLocaleString()} tokens
      </span>
    </div>
  )
}
