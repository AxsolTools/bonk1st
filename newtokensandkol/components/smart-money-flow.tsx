"use client"

import { useState, useEffect } from "react"
import { Zap, Clock, Flame, RefreshCw } from "lucide-react"
import { fetchTrendingTokens, fetchLatestTokens, getTokenAge, formatMarketCap, formatVolume } from "@/lib/api"

interface LiveToken {
  symbol: string
  name: string
  address: string
  price: number
  priceChange24h: number
  volume24h: number
  liquidity: number
  marketCap: number
  pairCreatedAt: number
  logo: string
  txns24h: { buys: number; sells: number }
}

interface SmartMoneySignal {
  token: LiveToken
  age: string
  smartScore: number
  kolsTracking: number
  netFlow: number
  buyPressure: number
  phase: "discovery" | "accumulation" | "breakout" | "distribution"
}

export function SmartMoneyFlow() {
  const [signals, setSignals] = useState<SmartMoneySignal[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [expandedToken, setExpandedToken] = useState<string | null>(null)

  const loadLiveData = async () => {
    setLoading(true)
    try {
      const [trending, latest] = await Promise.all([fetchTrendingTokens(), fetchLatestTokens()])

      // Combine and deduplicate
      const allTokens = [...trending, ...latest]
      const uniqueTokens = allTokens.reduce((acc: LiveToken[], token: any) => {
        if (token && !acc.find((t) => t.address === token.address)) {
          acc.push(token as LiveToken)
        }
        return acc
      }, [])

      // Calculate smart money signals
      const processedSignals: SmartMoneySignal[] = uniqueTokens
        .filter((t) => t && t.marketCap > 0)
        .map((token) => {
          const age = token.pairCreatedAt ? getTokenAge(token.pairCreatedAt) : "N/A"
          const ageMinutes = token.pairCreatedAt ? (Date.now() - token.pairCreatedAt) / 60000 : 9999

          // Smart score based on real metrics
          const volumeToMcRatio = token.marketCap > 0 ? (token.volume24h / token.marketCap) * 100 : 0
          const buyPressure =
            token.txns24h.buys + token.txns24h.sells > 0
              ? (token.txns24h.buys / (token.txns24h.buys + token.txns24h.sells)) * 100
              : 50

          // Fresher tokens with high volume/mc ratio = higher score
          const freshnessScore = ageMinutes < 60 ? 30 : ageMinutes < 360 ? 20 : ageMinutes < 1440 ? 10 : 0
          const volumeScore = Math.min(30, volumeToMcRatio * 3)
          const buyPressureScore = buyPressure > 60 ? 20 : buyPressure > 50 ? 10 : 0
          const priceScore =
            token.priceChange24h > 50 ? 20 : token.priceChange24h > 20 ? 15 : token.priceChange24h > 0 ? 10 : 0

          const smartScore = Math.min(100, Math.round(freshnessScore + volumeScore + buyPressureScore + priceScore))

          // Determine phase
          let phase: SmartMoneySignal["phase"] = "discovery"
          if (ageMinutes < 60 && buyPressure > 60) phase = "discovery"
          else if (ageMinutes < 360 && volumeToMcRatio > 0.5) phase = "accumulation"
          else if (token.priceChange24h > 50) phase = "breakout"
          else phase = "distribution"

          // Simulated KOL tracking (in real app, would track actual KOL wallets)
          const kolsTracking = Math.floor(Math.random() * 5) + 1

          return {
            token,
            age,
            smartScore,
            kolsTracking,
            netFlow: (token.volume24h * (buyPressure - 50)) / 100,
            buyPressure,
            phase,
          }
        })
        .sort((a, b) => b.smartScore - a.smartScore)
        .slice(0, 12)

      setSignals(processedSignals)
      setLastUpdate(new Date())
    } catch (error) {
      console.error("Error loading live data:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLiveData()
    // Refresh every 30 seconds
    const interval = setInterval(loadLiveData, 30000)
    return () => clearInterval(interval)
  }, [])

  const getPhaseColor = (phase: SmartMoneySignal["phase"]) => {
    switch (phase) {
      case "discovery":
        return "bg-purple-500/20 text-purple-400"
      case "accumulation":
        return "bg-blue-500/20 text-blue-400"
      case "breakout":
        return "bg-[#00ff88]/20 text-[#00ff88]"
      case "distribution":
        return "bg-red-500/20 text-red-400"
    }
  }

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#1a1a1a] bg-[#080808]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-purple-500/20 rounded-xl">
              <Flame className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white">SMART MONEY FLOW</h2>
              <p className="text-xs text-neutral-500">Live data from DexScreener - Real tokens, real metrics</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {lastUpdate && <span className="text-xs text-neutral-500">Updated: {lastUpdate.toLocaleTimeString()}</span>}
            <button
              onClick={loadLiveData}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-[#111] border border-[#222] rounded-lg text-sm font-bold text-white hover:bg-[#1a1a1a] disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Live Data Table */}
      <div className="flex-1 overflow-y-auto">
        {loading && signals.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <RefreshCw className="w-8 h-8 text-purple-400 animate-spin mx-auto mb-3" />
              <p className="text-neutral-500">Loading live market data...</p>
            </div>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-[#080808] sticky top-0 z-10">
              <tr className="text-xs text-neutral-500 uppercase tracking-wider">
                <th className="text-left px-6 py-3">Token</th>
                <th className="text-center px-4 py-3">Age</th>
                <th className="text-center px-4 py-3">Smart Score</th>
                <th className="text-right px-4 py-3">Price</th>
                <th className="text-right px-4 py-3">24h Change</th>
                <th className="text-right px-4 py-3">Volume</th>
                <th className="text-center px-4 py-3">Buy %</th>
                <th className="text-center px-4 py-3">Phase</th>
              </tr>
            </thead>
            <tbody>
              {signals.map((signal) => (
                <tr
                  key={signal.token.address}
                  className="border-b border-[#111] hover:bg-[#0a0a0a] cursor-pointer transition-colors"
                  onClick={() => setExpandedToken(expandedToken === signal.token.address ? null : signal.token.address)}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <img
                        src={signal.token.logo || "/placeholder.svg"}
                        alt={signal.token.symbol}
                        className="w-10 h-10 rounded-full bg-[#1a1a1a]"
                        onError={(e) => {
                          ;(e.target as HTMLImageElement).src =
                            `https://ui-avatars.com/api/?name=${signal.token.symbol}&background=1a1a1a&color=fff&bold=true`
                        }}
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">${signal.token.symbol}</span>
                          {signal.age && Number.parseInt(signal.age) < 2 && signal.age.includes("h") && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-[#00ff88]/20 text-[#00ff88] rounded font-bold">
                              NEW
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-neutral-500 truncate max-w-[150px]">{signal.token.name}</div>
                        <div className="text-xs text-neutral-600">MC: {formatMarketCap(signal.token.marketCap)}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <div
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-bold ${
                        signal.age.includes("m")
                          ? "bg-red-500/20 text-red-400"
                          : Number.parseInt(signal.age) < 24 && signal.age.includes("h")
                            ? "bg-yellow-500/20 text-yellow-400"
                            : "bg-neutral-500/20 text-neutral-400"
                      }`}
                    >
                      <Clock className="w-3 h-3" />
                      {signal.age}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <div
                      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg font-black text-lg ${
                        signal.smartScore >= 70
                          ? "bg-[#00ff88]/20 text-[#00ff88]"
                          : signal.smartScore >= 50
                            ? "bg-yellow-500/20 text-yellow-400"
                            : "bg-neutral-500/20 text-neutral-400"
                      }`}
                    >
                      <Zap className="w-4 h-4" />
                      {signal.smartScore}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <span className="text-white font-mono">
                      $
                      {signal.token.price < 0.001
                        ? signal.token.price.toExponential(2)
                        : signal.token.price.toFixed(signal.token.price < 1 ? 4 : 2)}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <span
                      className={`font-bold ${signal.token.priceChange24h >= 0 ? "text-[#00ff88]" : "text-red-500"}`}
                    >
                      {signal.token.priceChange24h >= 0 ? "+" : ""}
                      {signal.token.priceChange24h.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <span className="text-white">{formatVolume(signal.token.volume24h)}</span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-16 h-2 bg-[#1a1a1a] rounded-full overflow-hidden">
                        <div
                          className={`h-full ${signal.buyPressure > 55 ? "bg-[#00ff88]" : signal.buyPressure > 45 ? "bg-yellow-500" : "bg-red-500"}`}
                          style={{ width: `${signal.buyPressure}%` }}
                        />
                      </div>
                      <span
                        className={`text-xs font-bold ${signal.buyPressure > 55 ? "text-[#00ff88]" : "text-neutral-400"}`}
                      >
                        {signal.buyPressure.toFixed(0)}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className={`text-xs font-bold px-2 py-1 rounded ${getPhaseColor(signal.phase)}`}>
                      {signal.phase.toUpperCase()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
