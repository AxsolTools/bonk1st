"use client"

import { useState, useMemo } from "react"
import {
  Shield,
  AlertTriangle,
  TrendingUp,
  Users,
  Target,
  Zap,
  Copy,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Search,
  BarChart3,
  Timer,
  DollarSign,
  Activity,
  RefreshCw,
  Bell,
  BellOff,
  Star,
  StarOff,
  ShieldCheck,
  ShieldX,
  Flame,
} from "lucide-react"
import { KOL_DATABASE } from "@/lib/kol-data"

function calculateCopyMetrics(kol: (typeof KOL_DATABASE)[0]) {
  // Entry Delay Risk: How much later do copy traders enter?
  const entryDelayRisk = Math.min(100, kol.avgEntryTiming * 10)

  // Dump Risk: How often does this KOL dump on followers?
  const dumpRisk = Math.min(100, kol.dumpOnFollowers * 8)

  // Alpha Decay: How quickly does alpha disappear after KOL entry?
  const alphaDecay = 100 - kol.alphaAccuracy

  // Coordination Risk: Does this KOL coordinate with others (front-running)?
  const coordinationRisk = kol.coordinationScore

  // Crowd Factor: More copy traders = more slippage
  const crowdFactor = Math.min(100, (kol.copyTraders / 15000) * 100)

  // Overall Copy Safety Score
  const safetyScore = Math.max(
    0,
    Math.min(
      100,
      100 - entryDelayRisk * 0.2 - dumpRisk * 0.3 - alphaDecay * 0.15 - coordinationRisk * 0.15 - crowdFactor * 0.2,
    ),
  )

  // Profitability if copied
  const expectedProfitability = (((kol.winRate / 100) * (100 - entryDelayRisk)) / 100) * 100

  // Speed rating (how fast to copy)
  const speedRequired =
    kol.avgEntryTiming < 2 ? "INSTANT" : kol.avgEntryTiming < 5 ? "FAST" : kol.avgEntryTiming < 10 ? "MEDIUM" : "SLOW"

  return {
    safetyScore: Math.round(safetyScore),
    entryDelayRisk: Math.round(entryDelayRisk),
    dumpRisk: Math.round(dumpRisk),
    alphaDecay: Math.round(alphaDecay),
    coordinationRisk: Math.round(coordinationRisk),
    crowdFactor: Math.round(crowdFactor),
    expectedProfitability: Math.round(expectedProfitability),
    speedRequired,
    recommendation:
      safetyScore >= 75
        ? "SAFE TO COPY"
        : safetyScore >= 50
          ? "COPY WITH CAUTION"
          : safetyScore >= 25
            ? "HIGH RISK"
            : "AVOID",
    grade:
      safetyScore >= 90
        ? "A+"
        : safetyScore >= 80
          ? "A"
          : safetyScore >= 70
            ? "B+"
            : safetyScore >= 60
              ? "B"
              : safetyScore >= 50
                ? "C"
                : safetyScore >= 40
                  ? "D"
                  : "F",
  }
}

export function CopyProtectionScore() {
  const [sortBy, setSortBy] = useState<"safe" | "risky" | "profit" | "speed">("safe")
  const [searchQuery, setSearchQuery] = useState("")
  const [tierFilter, setTierFilter] = useState<string>("all")
  const [expandedKol, setExpandedKol] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set())
  const [alertsEnabled, setAlertsEnabled] = useState<Set<string>>(new Set())
  const [currentPage, setCurrentPage] = useState(1)
  const [viewMode, setViewMode] = useState<"list" | "grid">("list")
  const itemsPerPage = 50

  const verifiedKOLs = KOL_DATABASE.filter((k) => !k.isWashTrader)

  const filteredAndSortedKOLs = useMemo(() => {
    const filtered = verifiedKOLs.filter((kol) => {
      const matchesSearch =
        kol.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        kol.twitter.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesTier = tierFilter === "all" || kol.tier === tierFilter
      return matchesSearch && matchesTier
    })

    return filtered.sort((a, b) => {
      const metricsA = calculateCopyMetrics(a)
      const metricsB = calculateCopyMetrics(b)

      switch (sortBy) {
        case "safe":
          return metricsB.safetyScore - metricsA.safetyScore
        case "risky":
          return metricsA.safetyScore - metricsB.safetyScore
        case "profit":
          return metricsB.expectedProfitability - metricsA.expectedProfitability
        case "speed":
          return a.avgEntryTiming - b.avgEntryTiming
        default:
          return 0
      }
    })
  }, [verifiedKOLs, searchQuery, tierFilter, sortBy])

  // Pagination
  const totalPages = Math.ceil(filteredAndSortedKOLs.length / itemsPerPage)
  const paginatedKOLs = filteredAndSortedKOLs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  const aggregateStats = useMemo(() => {
    const metrics = filteredAndSortedKOLs.map(calculateCopyMetrics)
    const safeCount = metrics.filter((m) => m.safetyScore >= 75).length
    const riskyCount = metrics.filter((m) => m.safetyScore < 40).length
    const avgSafety = metrics.reduce((a, b) => a + b.safetyScore, 0) / metrics.length
    const avgProfit = metrics.reduce((a, b) => a + b.expectedProfitability, 0) / metrics.length
    return { safeCount, riskyCount, avgSafety: Math.round(avgSafety), avgProfit: Math.round(avgProfit) }
  }, [filteredAndSortedKOLs])

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-[#00ff88]"
    if (score >= 60) return "text-yellow-400"
    if (score >= 40) return "text-orange-400"
    return "text-red-500"
  }

  const getScoreBg = (score: number) => {
    if (score >= 80) return "bg-[#00ff88]/10 border-[#00ff88]/30"
    if (score >= 60) return "bg-yellow-400/10 border-yellow-400/30"
    if (score >= 40) return "bg-orange-400/10 border-orange-400/30"
    return "bg-red-500/10 border-red-500/30"
  }

  const getGradeColor = (grade: string) => {
    if (grade.startsWith("A")) return "text-[#00ff88] bg-[#00ff88]/20"
    if (grade.startsWith("B")) return "text-blue-400 bg-blue-400/20"
    if (grade.startsWith("C")) return "text-yellow-400 bg-yellow-400/20"
    if (grade.startsWith("D")) return "text-orange-400 bg-orange-400/20"
    return "text-red-500 bg-red-500/20"
  }

  const toggleWatchlist = (id: string) => {
    const newWatchlist = new Set(watchlist)
    if (newWatchlist.has(id)) {
      newWatchlist.delete(id)
    } else {
      newWatchlist.add(id)
    }
    setWatchlist(newWatchlist)
  }

  const toggleAlerts = (id: string) => {
    const newAlerts = new Set(alertsEnabled)
    if (newAlerts.has(id)) {
      newAlerts.delete(id)
    } else {
      newAlerts.add(id)
    }
    setAlertsEnabled(newAlerts)
  }

  const copyWallet = (wallet: string) => {
    navigator.clipboard.writeText(wallet)
  }

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col">
      {/* Header with Stats */}
      <div className="px-6 py-4 border-b border-[#1a1a1a] bg-[#080808]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#00ff88]/20 rounded-xl">
              <Shield className="w-6 h-6 text-[#00ff88]" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white">COPY PROTECTION SCORE</h2>
              <p className="text-xs text-neutral-500">AI-powered safety analysis for copy trading</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="px-4 py-2 bg-[#111] rounded-xl border border-[#222]">
              <div className="text-[10px] text-neutral-500">SAFE TO COPY</div>
              <div className="text-lg font-black text-[#00ff88]">{aggregateStats.safeCount}</div>
            </div>
            <div className="px-4 py-2 bg-[#111] rounded-xl border border-[#222]">
              <div className="text-[10px] text-neutral-500">HIGH RISK</div>
              <div className="text-lg font-black text-red-500">{aggregateStats.riskyCount}</div>
            </div>
            <div className="px-4 py-2 bg-[#111] rounded-xl border border-[#222]">
              <div className="text-[10px] text-neutral-500">AVG SAFETY</div>
              <div className={`text-lg font-black ${getScoreColor(aggregateStats.avgSafety)}`}>
                {aggregateStats.avgSafety}%
              </div>
            </div>
            <div className="px-4 py-2 bg-[#111] rounded-xl border border-[#222]">
              <div className="text-[10px] text-neutral-500">AVG PROFIT</div>
              <div className="text-lg font-black text-blue-400">{aggregateStats.avgProfit}%</div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
            <input
              type="text"
              placeholder="Search KOL by name or Twitter..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-[#111] border border-[#222] rounded-xl text-white text-sm focus:outline-none focus:border-[#00ff88]/50"
            />
          </div>

          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
            className="px-4 py-2.5 bg-[#111] border border-[#222] rounded-xl text-white text-sm focus:outline-none"
          >
            <option value="all">All Tiers</option>
            <option value="diamond">Diamond</option>
            <option value="gold">Gold</option>
            <option value="silver">Silver</option>
            <option value="bronze">Bronze</option>
          </select>

          <div className="flex items-center gap-1">
            {[
              { id: "safe", label: "Safest", icon: ShieldCheck },
              { id: "risky", label: "Riskiest", icon: ShieldX },
              { id: "profit", label: "Profitable", icon: TrendingUp },
              { id: "speed", label: "Fastest", icon: Zap },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setSortBy(id as typeof sortBy)}
                className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                  sortBy === id
                    ? "bg-[#00ff88] text-black"
                    : "bg-[#111] text-neutral-400 hover:text-white border border-[#222]"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          <button
            onClick={() => window.location.reload()}
            className="p-2.5 bg-[#111] border border-[#222] rounded-xl text-neutral-400 hover:text-white"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="px-6 py-2 bg-[#050505] border-b border-[#1a1a1a] grid grid-cols-12 gap-4 text-[10px] text-neutral-500 font-bold uppercase">
        <div className="col-span-3">KOL</div>
        <div className="col-span-1 text-center">Grade</div>
        <div className="col-span-1 text-center">Safety</div>
        <div className="col-span-1 text-center">Dump Risk</div>
        <div className="col-span-1 text-center">Entry Delay</div>
        <div className="col-span-1 text-center">Crowd</div>
        <div className="col-span-1 text-center">Exp. Profit</div>
        <div className="col-span-1 text-center">Speed Req</div>
        <div className="col-span-2 text-center">Actions</div>
      </div>

      {/* KOL List */}
      <div className="flex-1 overflow-y-auto">
        {paginatedKOLs.map((kol, i) => {
          const metrics = calculateCopyMetrics(kol)
          const isExpanded = expandedKol === kol.id
          const globalIndex = (currentPage - 1) * itemsPerPage + i + 1

          return (
            <div key={kol.id} className="border-b border-[#111]">
              {/* Main Row */}
              <div
                className={`px-6 py-3 grid grid-cols-12 gap-4 items-center hover:bg-[#080808] cursor-pointer transition-colors ${
                  isExpanded ? "bg-[#080808]" : ""
                }`}
                onClick={() => setExpandedKol(isExpanded ? null : kol.id)}
              >
                {/* KOL Info */}
                <div className="col-span-3 flex items-center gap-3">
                  <div className="text-lg font-black text-neutral-600 w-6">{globalIndex}</div>
                  <img
                    src={kol.avatar || "/placeholder.svg"}
                    alt={kol.name}
                    className="w-10 h-10 rounded-full bg-[#1a1a1a]"
                    onError={(e) => {
                      e.currentTarget.src = `https://unavatar.io/twitter/${kol.twitter}`
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white truncate">{kol.name}</span>
                      {kol.tier === "diamond" && <span className="text-[10px]">💎</span>}
                      {kol.tier === "gold" && <span className="text-[10px]">🥇</span>}
                      {watchlist.has(kol.id) && <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />}
                    </div>
                    <div className="text-xs text-neutral-500">@{kol.twitter}</div>
                  </div>
                </div>

                {/* Grade */}
                <div className="col-span-1 flex justify-center">
                  <span className={`px-2.5 py-1 rounded-lg text-sm font-black ${getGradeColor(metrics.grade)}`}>
                    {metrics.grade}
                  </span>
                </div>

                {/* Safety Score */}
                <div className="col-span-1 flex justify-center">
                  <div className={`px-3 py-1.5 rounded-lg border ${getScoreBg(metrics.safetyScore)}`}>
                    <span className={`text-lg font-black ${getScoreColor(metrics.safetyScore)}`}>
                      {metrics.safetyScore}
                    </span>
                  </div>
                </div>

                {/* Dump Risk */}
                <div className="col-span-1 text-center">
                  <div
                    className={`font-bold ${metrics.dumpRisk > 50 ? "text-red-500" : metrics.dumpRisk > 25 ? "text-yellow-400" : "text-[#00ff88]"}`}
                  >
                    {metrics.dumpRisk}%
                  </div>
                  <div className="text-[10px] text-neutral-600">{kol.dumpOnFollowers}x dumps</div>
                </div>

                {/* Entry Delay */}
                <div className="col-span-1 text-center">
                  <div className={`font-bold ${kol.avgEntryTiming > 5 ? "text-orange-400" : "text-white"}`}>
                    {kol.avgEntryTiming}m
                  </div>
                  <div className="text-[10px] text-neutral-600">avg delay</div>
                </div>

                {/* Crowd Factor */}
                <div className="col-span-1 text-center">
                  <div className={`font-bold ${metrics.crowdFactor > 60 ? "text-orange-400" : "text-white"}`}>
                    {metrics.crowdFactor}%
                  </div>
                  <div className="text-[10px] text-neutral-600">{(kol.copyTraders / 1000).toFixed(1)}K copiers</div>
                </div>

                {/* Expected Profit */}
                <div className="col-span-1 text-center">
                  <div
                    className={`font-bold ${metrics.expectedProfitability > 50 ? "text-[#00ff88]" : "text-yellow-400"}`}
                  >
                    {metrics.expectedProfitability}%
                  </div>
                </div>

                {/* Speed Required */}
                <div className="col-span-1 text-center">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      metrics.speedRequired === "INSTANT"
                        ? "bg-red-500/20 text-red-400"
                        : metrics.speedRequired === "FAST"
                          ? "bg-orange-400/20 text-orange-400"
                          : metrics.speedRequired === "MEDIUM"
                            ? "bg-yellow-400/20 text-yellow-400"
                            : "bg-[#00ff88]/20 text-[#00ff88]"
                    }`}
                  >
                    {metrics.speedRequired}
                  </span>
                </div>

                {/* Actions */}
                <div className="col-span-2 flex items-center justify-center gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleWatchlist(kol.id)
                    }}
                    className={`p-1.5 rounded-lg transition-colors ${
                      watchlist.has(kol.id)
                        ? "bg-yellow-400/20 text-yellow-400"
                        : "bg-[#111] text-neutral-500 hover:text-white"
                    }`}
                    title="Add to watchlist"
                  >
                    {watchlist.has(kol.id) ? (
                      <Star className="w-3.5 h-3.5 fill-current" />
                    ) : (
                      <StarOff className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleAlerts(kol.id)
                    }}
                    className={`p-1.5 rounded-lg transition-colors ${
                      alertsEnabled.has(kol.id)
                        ? "bg-[#00ff88]/20 text-[#00ff88]"
                        : "bg-[#111] text-neutral-500 hover:text-white"
                    }`}
                    title="Enable alerts"
                  >
                    {alertsEnabled.has(kol.id) ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      copyWallet(kol.wallet)
                    }}
                    className="p-1.5 bg-[#111] text-neutral-500 hover:text-white rounded-lg"
                    title="Copy wallet"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <a
                    href={`https://twitter.com/${kol.twitter}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="p-1.5 bg-[#111] text-neutral-500 hover:text-white rounded-lg"
                    title="View Twitter"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <button
                    onClick={(e) => e.stopPropagation()}
                    className="p-1.5 bg-[#111] text-neutral-500 hover:text-white rounded-lg"
                  >
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="px-6 py-4 bg-[#050505] border-t border-[#111]">
                  <div className="grid grid-cols-4 gap-6">
                    {/* Risk Breakdown */}
                    <div className="bg-[#0a0a0a] rounded-xl p-4 border border-[#1a1a1a]">
                      <h4 className="text-xs text-neutral-500 font-bold mb-3 flex items-center gap-2">
                        <AlertTriangle className="w-3.5 h-3.5" /> RISK BREAKDOWN
                      </h4>
                      <div className="space-y-2">
                        {[
                          {
                            label: "Dump Risk",
                            value: metrics.dumpRisk,
                            color: metrics.dumpRisk > 50 ? "bg-red-500" : "bg-yellow-400",
                          },
                          {
                            label: "Entry Delay Risk",
                            value: metrics.entryDelayRisk,
                            color: metrics.entryDelayRisk > 50 ? "bg-orange-400" : "bg-[#00ff88]",
                          },
                          {
                            label: "Alpha Decay",
                            value: metrics.alphaDecay,
                            color: metrics.alphaDecay > 50 ? "bg-red-500" : "bg-blue-400",
                          },
                          {
                            label: "Coordination Risk",
                            value: metrics.coordinationRisk,
                            color: metrics.coordinationRisk > 50 ? "bg-purple-400" : "bg-[#00ff88]",
                          },
                          {
                            label: "Crowd Factor",
                            value: metrics.crowdFactor,
                            color: metrics.crowdFactor > 60 ? "bg-orange-400" : "bg-[#00ff88]",
                          },
                        ].map(({ label, value, color }) => (
                          <div key={label}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-neutral-400">{label}</span>
                              <span className="text-white font-bold">{value}%</span>
                            </div>
                            <div className="h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                              <div className={`h-full ${color} rounded-full`} style={{ width: `${value}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Trading Stats */}
                    <div className="bg-[#0a0a0a] rounded-xl p-4 border border-[#1a1a1a]">
                      <h4 className="text-xs text-neutral-500 font-bold mb-3 flex items-center gap-2">
                        <BarChart3 className="w-3.5 h-3.5" /> TRADING STATS
                      </h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <div className="text-xs text-neutral-500">Win Rate</div>
                          <div className="text-lg font-black text-[#00ff88]">{kol.winRate}%</div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">Total PNL</div>
                          <div className="text-lg font-black text-[#00ff88]">${(kol.pnl / 1000000).toFixed(1)}M</div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">Total Trades</div>
                          <div className="text-lg font-black text-white">{kol.totalTrades.toLocaleString()}</div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">Avg Hold</div>
                          <div className="text-lg font-black text-white">{kol.avgHoldTime}</div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">Alpha Accuracy</div>
                          <div className="text-lg font-black text-blue-400">{kol.alphaAccuracy}%</div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">Style</div>
                          <div className="text-sm font-bold text-neutral-300">{kol.tradingStyle}</div>
                        </div>
                      </div>
                    </div>

                    {/* Recommendation */}
                    <div className="bg-[#0a0a0a] rounded-xl p-4 border border-[#1a1a1a]">
                      <h4 className="text-xs text-neutral-500 font-bold mb-3 flex items-center gap-2">
                        <Target className="w-3.5 h-3.5" /> RECOMMENDATION
                      </h4>
                      <div
                        className={`text-center p-4 rounded-xl mb-3 ${
                          metrics.recommendation === "SAFE TO COPY"
                            ? "bg-[#00ff88]/10 border border-[#00ff88]/30"
                            : metrics.recommendation === "COPY WITH CAUTION"
                              ? "bg-yellow-400/10 border border-yellow-400/30"
                              : metrics.recommendation === "HIGH RISK"
                                ? "bg-orange-400/10 border border-orange-400/30"
                                : "bg-red-500/10 border border-red-500/30"
                        }`}
                      >
                        <div
                          className={`text-xl font-black ${
                            metrics.recommendation === "SAFE TO COPY"
                              ? "text-[#00ff88]"
                              : metrics.recommendation === "COPY WITH CAUTION"
                                ? "text-yellow-400"
                                : metrics.recommendation === "HIGH RISK"
                                  ? "text-orange-400"
                                  : "text-red-500"
                          }`}
                        >
                          {metrics.recommendation}
                        </div>
                      </div>
                      <div className="space-y-2 text-xs">
                        <div className="flex items-center gap-2">
                          {metrics.speedRequired === "INSTANT" ? (
                            <Flame className="w-3.5 h-3.5 text-red-400" />
                          ) : (
                            <Timer className="w-3.5 h-3.5 text-neutral-400" />
                          )}
                          <span className="text-neutral-400">Copy within</span>
                          <span className="text-white font-bold">{kol.avgEntryTiming} minutes</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <DollarSign className="w-3.5 h-3.5 text-neutral-400" />
                          <span className="text-neutral-400">Expected return</span>
                          <span className="text-[#00ff88] font-bold">{metrics.expectedProfitability}%</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Users className="w-3.5 h-3.5 text-neutral-400" />
                          <span className="text-neutral-400">Competition</span>
                          <span className="text-white font-bold">{kol.copyTraders.toLocaleString()} copiers</span>
                        </div>
                      </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="bg-[#0a0a0a] rounded-xl p-4 border border-[#1a1a1a]">
                      <h4 className="text-xs text-neutral-500 font-bold mb-3 flex items-center gap-2">
                        <Zap className="w-3.5 h-3.5" /> QUICK ACTIONS
                      </h4>
                      <div className="space-y-2">
                        <a
                          href={`https://birdeye.so/profile/${kol.wallet}?chain=solana`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between w-full px-3 py-2 bg-[#111] hover:bg-[#1a1a1a] rounded-lg text-sm text-white transition-colors"
                        >
                          <span>View on Birdeye</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        <a
                          href={`https://solscan.io/account/${kol.wallet}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between w-full px-3 py-2 bg-[#111] hover:bg-[#1a1a1a] rounded-lg text-sm text-white transition-colors"
                        >
                          <span>View on Solscan</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        <a
                          href={`https://gmgn.ai/sol/address/${kol.wallet}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between w-full px-3 py-2 bg-[#111] hover:bg-[#1a1a1a] rounded-lg text-sm text-white transition-colors"
                        >
                          <span>View on GMGN</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        <button
                          onClick={() => copyWallet(kol.wallet)}
                          className="flex items-center justify-between w-full px-3 py-2 bg-[#00ff88]/10 hover:bg-[#00ff88]/20 rounded-lg text-sm text-[#00ff88] transition-colors"
                        >
                          <span>Copy Wallet Address</span>
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Favorite Tokens */}
                  <div className="mt-4 pt-4 border-t border-[#1a1a1a]">
                    <div className="flex items-center gap-2 text-xs text-neutral-500 mb-2">
                      <Activity className="w-3.5 h-3.5" />
                      <span>FAVORITE TOKENS</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {kol.favoriteTokens.map((token) => (
                        <span
                          key={token}
                          className="px-3 py-1 bg-[#111] rounded-lg text-xs font-bold text-white border border-[#222]"
                        >
                          {token}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="px-6 py-3 border-t border-[#1a1a1a] bg-[#080808] flex items-center justify-between">
        <div className="text-sm text-neutral-500">
          Showing {(currentPage - 1) * itemsPerPage + 1} -{" "}
          {Math.min(currentPage * itemsPerPage, filteredAndSortedKOLs.length)} of {filteredAndSortedKOLs.length} KOLs
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1.5 bg-[#111] border border-[#222] rounded-lg text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let pageNum
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
                onClick={() => setCurrentPage(pageNum)}
                className={`w-8 h-8 rounded-lg text-sm font-bold ${
                  currentPage === pageNum ? "bg-[#00ff88] text-black" : "bg-[#111] text-white border border-[#222]"
                }`}
              >
                {pageNum}
              </button>
            )
          })}
          <button
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="px-3 py-1.5 bg-[#111] border border-[#222] rounded-lg text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}
