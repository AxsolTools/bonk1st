"use client"

import { useState, useEffect } from "react"
import { KOL_DATABASE, type KOL } from "@/lib/kol-data"
import { formatUSD } from "@/lib/solana-rpc"
import {
  Trophy,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Copy,
  ExternalLink,
  Star,
  StarOff,
  Eye,
  Clock,
  ChevronUp,
  ChevronDown,
  Search,
  Crown,
  Award,
  Medal,
  Zap,
  Target,
  BarChart2,
  Percent,
  Users,
} from "lucide-react"

interface Props {
  onSelectKOL: (kol: KOL) => void
  selectedKOL: KOL | null
}

export function KOLLeaderboard({ onSelectKOL, selectedKOL }: Props) {
  const [kols, setKols] = useState<KOL[]>(KOL_DATABASE)
  const [sortBy, setSortBy] = useState<"pnl" | "winRate" | "trades" | "followers" | "roi7d" | "roi30d" | "sharpe">(
    "pnl",
  )
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc")
  const [search, setSearch] = useState("")
  const [filterTier, setFilterTier] = useState<string>("all")
  const [filterStyle, setFilterStyle] = useState<string>("all")
  const [showOnlyVerified, setShowOnlyVerified] = useState(false)
  const [hideWashTraders, setHideWashTraders] = useState(false)
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set())
  const [countdown, setCountdown] = useState(300)
  const [copiedWallet, setCopiedWallet] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const perPage = 20

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          setKols(
            KOL_DATABASE.map((kol) => ({
              ...kol,
              pnl: kol.pnl + (Math.random() - 0.4) * 50000,
              pnl7d: kol.pnl7d + (Math.random() - 0.4) * 10000,
            })),
          )
          return 300
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const toggleWatchlist = (id: string) => {
    setWatchlist((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const copyWallet = (wallet: string) => {
    navigator.clipboard.writeText(wallet)
    setCopiedWallet(wallet)
    setTimeout(() => setCopiedWallet(null), 2000)
  }

  const filteredKols = [...kols]
    .filter((kol) => {
      if (
        search &&
        !kol.name.toLowerCase().includes(search.toLowerCase()) &&
        !kol.twitter.toLowerCase().includes(search.toLowerCase())
      )
        return false
      if (filterTier !== "all" && kol.tier !== filterTier) return false
      if (filterStyle !== "all" && kol.tradingStyle !== filterStyle) return false
      if (showOnlyVerified && !kol.verified) return false
      if (hideWashTraders && kol.isWashTrader) return false
      return true
    })
    .sort((a, b) => {
      const multiplier = sortDir === "desc" ? -1 : 1
      switch (sortBy) {
        case "pnl":
          return (a.pnl - b.pnl) * multiplier
        case "winRate":
          return (a.winRate - b.winRate) * multiplier
        case "trades":
          return (a.totalTrades - b.totalTrades) * multiplier
        case "followers":
          return (a.followers - b.followers) * multiplier
        case "roi7d":
          return (a.roi7d - b.roi7d) * multiplier
        case "roi30d":
          return (a.roi30d - b.roi30d) * multiplier
        case "sharpe":
          return (a.sharpeRatio - b.sharpeRatio) * multiplier
        default:
          return 0
      }
    })

  const paginatedKols = filteredKols.slice((page - 1) * perPage, page * perPage)
  const totalPages = Math.ceil(filteredKols.length / perPage)

  const tradingStyles = [...new Set(KOL_DATABASE.map((k) => k.tradingStyle))]

  const getTierIcon = (tier: string) => {
    switch (tier) {
      case "diamond":
        return <Crown className="w-4 h-4 text-cyan-400" />
      case "gold":
        return <Award className="w-4 h-4 text-yellow-400" />
      case "silver":
        return <Medal className="w-4 h-4 text-neutral-400" />
      default:
        return <Medal className="w-4 h-4 text-amber-700" />
    }
  }

  const getRankDisplay = (index: number, globalIndex: number) => {
    if (globalIndex === 0)
      return (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center text-black font-black">
          1
        </div>
      )
    if (globalIndex === 1)
      return (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-neutral-300 to-neutral-500 flex items-center justify-center text-black font-black">
          2
        </div>
      )
    if (globalIndex === 2)
      return (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-600 to-amber-800 flex items-center justify-center text-white font-black">
          3
        </div>
      )
    return (
      <div className="w-8 h-8 rounded-full bg-[#1a1a1a] flex items-center justify-center text-neutral-500 font-bold">
        {globalIndex + 1}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-[#1a1a1a]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-[#00ff88]" />
            <h2 className="text-lg font-bold text-white">KOL LEADERBOARD</h2>
            <span className="text-xs bg-[#00ff88]/20 text-[#00ff88] px-2 py-0.5 rounded">
              {filteredKols.length} of {KOL_DATABASE.length}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Clock className="w-3 h-3 text-neutral-500" />
            <span className="text-neutral-500">Refresh in</span>
            <span className="text-[#00ff88] font-mono">
              {Math.floor(countdown / 60)}:{(countdown % 60).toString().padStart(2, "0")}
            </span>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="flex gap-2 mb-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder="Search KOL or @handle..."
              className="w-full pl-9 pr-3 py-2 bg-[#111] border border-[#222] rounded-lg text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-[#00ff88]/50"
            />
          </div>
          <select
            value={filterTier}
            onChange={(e) => {
              setFilterTier(e.target.value)
              setPage(1)
            }}
            className="px-3 py-2 bg-[#111] border border-[#222] rounded-lg text-sm text-white focus:outline-none focus:border-[#00ff88]/50"
          >
            <option value="all">All Tiers</option>
            <option value="diamond">Diamond</option>
            <option value="gold">Gold</option>
            <option value="silver">Silver</option>
            <option value="bronze">Bronze</option>
          </select>
          <select
            value={filterStyle}
            onChange={(e) => {
              setFilterStyle(e.target.value)
              setPage(1)
            }}
            className="px-3 py-2 bg-[#111] border border-[#222] rounded-lg text-sm text-white focus:outline-none focus:border-[#00ff88]/50"
          >
            <option value="all">All Styles</option>
            {tradingStyles.map((style) => (
              <option key={style} value={style}>
                {style}
              </option>
            ))}
          </select>
        </div>

        {/* Quick Filters */}
        <div className="flex items-center gap-3 mb-3">
          <label className="flex items-center gap-2 text-xs text-neutral-400 cursor-pointer">
            <input
              type="checkbox"
              checked={showOnlyVerified}
              onChange={(e) => {
                setShowOnlyVerified(e.target.checked)
                setPage(1)
              }}
              className="rounded bg-[#111] border-[#333]"
            />
            Verified Only
          </label>
          <label className="flex items-center gap-2 text-xs text-neutral-400 cursor-pointer">
            <input
              type="checkbox"
              checked={hideWashTraders}
              onChange={(e) => {
                setHideWashTraders(e.target.checked)
                setPage(1)
              }}
              className="rounded bg-[#111] border-[#333]"
            />
            Hide Wash Traders
          </label>
        </div>

        {/* Enhanced Sort Tabs */}
        <div className="flex gap-1 flex-wrap">
          {[
            { key: "pnl", label: "PNL", icon: TrendingUp },
            { key: "winRate", label: "Win Rate", icon: Target },
            { key: "trades", label: "Trades", icon: Zap },
            { key: "roi7d", label: "7D ROI", icon: BarChart2 },
            { key: "roi30d", label: "30D ROI", icon: BarChart2 },
            { key: "sharpe", label: "Sharpe", icon: Percent },
            { key: "followers", label: "Followers", icon: Users },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => {
                if (sortBy === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"))
                else {
                  setSortBy(key as typeof sortBy)
                  setSortDir("desc")
                }
              }}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                sortBy === key ? "bg-[#00ff88]/20 text-[#00ff88]" : "bg-[#111] text-neutral-400 hover:text-white"
              }`}
            >
              <Icon className="w-3 h-3" />
              {label}
              {sortBy === key &&
                (sortDir === "desc" ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />)}
            </button>
          ))}
        </div>
      </div>

      {/* KOL List */}
      <div className="flex-1 overflow-y-auto">
        {paginatedKols.map((kol, index) => {
          const globalIndex = (page - 1) * perPage + index
          return (
            <div
              key={kol.id}
              onClick={() => onSelectKOL(kol)}
              className={`p-4 border-b border-[#111] cursor-pointer transition-all hover:bg-[#111] ${
                selectedKOL?.id === kol.id ? "bg-[#00ff88]/5 border-l-2 border-l-[#00ff88]" : ""
              } ${kol.isWashTrader ? "bg-red-500/5" : ""}`}
            >
              <div className="flex items-start gap-3">
                {getRankDisplay(index, globalIndex)}

                <div className="relative">
                  <img
                    src={kol.avatar || "/placeholder.svg"}
                    alt={kol.name}
                    className="w-12 h-12 rounded-full border-2 border-[#222] object-cover"
                  />
                  {kol.verified && (
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-[#1d9bf0] rounded-full flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                      </svg>
                    </div>
                  )}
                  {kol.isWashTrader && (
                    <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                      <AlertTriangle className="w-3 h-3 text-white" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white truncate">{kol.name}</span>
                    {getTierIcon(kol.tier)}
                    {kol.isWashTrader && (
                      <span className="text-[10px] bg-red-500/20 text-red-500 px-1.5 py-0.5 rounded font-medium">
                        WASH TRADER
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <a
                      href={`https://twitter.com/${kol.twitter}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs text-neutral-500 hover:text-[#1d9bf0]"
                    >
                      @{kol.twitter}
                    </a>
                    <span className="text-neutral-700">•</span>
                    <span className="text-xs text-neutral-600">{kol.tradingStyle}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <div className="flex items-center gap-1">
                      <Target className="w-3 h-3 text-neutral-500" />
                      <span className="text-xs text-neutral-400">{kol.winRate.toFixed(1)}%</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Zap className="w-3 h-3 text-neutral-500" />
                      <span className="text-xs text-neutral-400">{kol.totalTrades.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Eye className="w-3 h-3 text-neutral-500" />
                      <span className="text-xs text-neutral-400">{(kol.followers / 1000).toFixed(0)}K</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <BarChart2 className="w-3 h-3 text-neutral-500" />
                      <span className="text-xs text-neutral-400">{kol.sharpeRatio.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className={`text-lg font-bold ${kol.pnl >= 0 ? "text-[#00ff88]" : "text-red-500"}`}>
                    {kol.pnl >= 0 ? "+" : ""}
                    {formatUSD(kol.pnl)}
                  </div>
                  <div
                    className={`text-xs flex items-center justify-end gap-1 ${kol.pnl7d >= 0 ? "text-[#00ff88]/70" : "text-red-500/70"}`}
                  >
                    {kol.pnl7d >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    7d: {kol.pnl7d >= 0 ? "+" : ""}
                    {formatUSD(kol.pnl7d)}
                  </div>
                  <div className={`text-xs ${kol.roi30d >= 0 ? "text-cyan-400" : "text-red-400"}`}>
                    30d ROI: {kol.roi30d >= 0 ? "+" : ""}
                    {kol.roi30d.toFixed(1)}%
                  </div>
                  <div className="flex items-center justify-end gap-1 mt-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleWatchlist(kol.id)
                      }}
                      className={`p-1.5 rounded hover:bg-[#222] transition-colors ${watchlist.has(kol.id) ? "text-yellow-400" : "text-neutral-600"}`}
                    >
                      {watchlist.has(kol.id) ? (
                        <Star className="w-4 h-4 fill-current" />
                      ) : (
                        <StarOff className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        copyWallet(kol.wallet)
                      }}
                      className="p-1.5 rounded hover:bg-[#222] transition-colors text-neutral-600 hover:text-white"
                      title="Copy wallet"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <a
                      href={`https://solscan.io/account/${kol.wallet}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-1.5 rounded hover:bg-[#222] transition-colors text-neutral-600 hover:text-white"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="p-4 border-t border-[#1a1a1a] flex items-center justify-between">
          <div className="text-xs text-neutral-500">
            Showing {(page - 1) * perPage + 1}-{Math.min(page * perPage, filteredKols.length)} of {filteredKols.length}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 bg-[#111] border border-[#222] rounded text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#1a1a1a]"
            >
              Prev
            </button>
            <span className="text-sm text-neutral-400">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 bg-[#111] border border-[#222] rounded text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#1a1a1a]"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {copiedWallet && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-[#00ff88] text-black px-4 py-2 rounded-lg text-sm font-medium animate-in fade-in slide-in-from-bottom-2">
          Wallet copied!
        </div>
      )}
    </div>
  )
}
