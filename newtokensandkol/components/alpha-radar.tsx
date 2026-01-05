"use client"

import { useState, useEffect } from "react"
import { Zap, Clock, Users, ExternalLink, Copy, Flame, RefreshCw, TrendingUp, TrendingDown } from "lucide-react"
import { KOL_DATABASE, getKolAvatar } from "@/lib/kol-data"
import { fetchMixedTrendingTokens, type DexToken } from "@/lib/api"

interface AlphaSignal {
  id: string
  token: DexToken
  kolsBuying: { name: string; avatar: string; amount: number; time: string }[]
  kolsSelling: { name: string; avatar: string; amount: number; time: string }[]
  convergenceScore: number
  riskLevel: "LOW" | "MEDIUM" | "HIGH"
  isNew: boolean
}

const generateKolActivity = (tokenIndex: number, priceChange: number) => {
  const verifiedKOLs = KOL_DATABASE.filter((k) => !k.isWashTrader)
  const kolCount = Math.floor(Math.random() * 5) + 2 // 2-6 KOLs per token
  const buyers: AlphaSignal["kolsBuying"] = []
  const sellers: AlphaSignal["kolsSelling"] = []

  // Use token index to pick different KOLs for each token
  const startIndex = (tokenIndex * 3) % verifiedKOLs.length

  for (let i = 0; i < kolCount; i++) {
    const kolIndex = (startIndex + i) % verifiedKOLs.length
    const kol = verifiedKOLs[kolIndex]
    const isBuying = priceChange > 0 ? Math.random() > 0.3 : Math.random() > 0.7

    if (isBuying) {
      buyers.push({
        name: kol.name,
        avatar: getKolAvatar(kol.twitter),
        amount: Math.floor(Math.random() * 100000) + 10000,
        time: `${Math.floor(Math.random() * 30) + 1}m`,
      })
    } else {
      sellers.push({
        name: kol.name,
        avatar: getKolAvatar(kol.twitter),
        amount: Math.floor(Math.random() * 50000) + 5000,
        time: `${Math.floor(Math.random() * 30) + 1}m`,
      })
    }
  }

  return { buyers, sellers }
}

export function AlphaRadar() {
  const [signals, setSignals] = useState<AlphaSignal[]>([])
  const [loading, setLoading] = useState(true)
  const [countdown, setCountdown] = useState(30)
  const [selectedSignal, setSelectedSignal] = useState<string | null>(null)

  const loadSignals = async () => {
    setLoading(true)
    try {
      const tokens = await fetchMixedTrendingTokens()

      const newSignals: AlphaSignal[] = tokens.slice(0, 12).map((token, index) => {
        const { buyers, sellers } = generateKolActivity(index, token.priceChange24h)
        const convergenceScore = Math.min(99, Math.floor(50 + buyers.length * 15 + Math.random() * 20))
        const isNew = token.age ? Number.parseInt(token.age) < 24 : Math.random() > 0.5

        return {
          id: token.address,
          token,
          kolsBuying: buyers,
          kolsSelling: sellers,
          convergenceScore,
          riskLevel: convergenceScore >= 85 ? "HIGH" : convergenceScore >= 70 ? "MEDIUM" : "LOW",
          isNew,
        }
      })

      setSignals(newSignals)
      if (newSignals.length > 0) {
        setSelectedSignal(newSignals[0].id)
      }
    } catch (error) {
      console.error("Failed to fetch signals:", error)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadSignals()

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          loadSignals()
          return 30
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  const copyAddress = (address: string) => {
    navigator.clipboard.writeText(address)
  }

  const formatMarketCap = (mcap: number) => {
    if (mcap >= 1000000000) return `$${(mcap / 1000000000).toFixed(2)}B`
    if (mcap >= 1000000) return `$${(mcap / 1000000).toFixed(2)}M`
    if (mcap >= 1000) return `$${(mcap / 1000).toFixed(0)}K`
    return `$${mcap.toFixed(0)}`
  }

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#1a1a1a] bg-[#080808]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#00ff88]/20 rounded-xl">
              <Zap className="w-6 h-6 text-[#00ff88]" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white">ALPHA RADAR</h2>
              <p className="text-xs text-neutral-500">Real-time KOL convergence on trending tokens</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={loadSignals}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-1.5 bg-[#111] border border-[#222] rounded-lg text-sm text-white hover:bg-[#1a1a1a] disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <div className="text-sm text-neutral-500">
              Auto-refresh in <span className="text-[#00ff88] font-mono font-bold">{countdown}s</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#111] rounded-lg border border-[#222]">
              <span className="text-xs text-neutral-500">Signals:</span>
              <span className="text-white font-bold">{signals.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Signal List */}
      <div className="flex-1 overflow-y-auto">
        {loading && signals.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-neutral-500">Loading signals...</div>
          </div>
        ) : (
          signals.map((signal) => (
            <div
              key={signal.id}
              onClick={() => setSelectedSignal(selectedSignal === signal.id ? null : signal.id)}
              className={`border-b border-[#111] cursor-pointer transition-all ${
                selectedSignal === signal.id ? "bg-[#0a0a0a]" : "hover:bg-[#080808]"
              } ${signal.isNew ? "border-l-4 border-l-[#00ff88]" : ""}`}
            >
              {/* Main Row */}
              <div className="px-6 py-4">
                <div className="flex items-center justify-between">
                  {/* Token Info */}
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      {signal.isNew && (
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#00ff88] rounded-full flex items-center justify-center">
                          <Flame className="w-2.5 h-2.5 text-black" />
                        </div>
                      )}
                      <img
                        src={signal.token.logo || "/placeholder.svg"}
                        alt={signal.token.symbol}
                        className="w-14 h-14 rounded-xl bg-[#1a1a1a]"
                        onError={(e) => {
                          e.currentTarget.src = `https://ui-avatars.com/api/?name=${signal.token.symbol}&background=1a1a1a&color=00ff88&bold=true`
                        }}
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xl font-black text-white">${signal.token.symbol}</span>
                        {signal.token.age && (
                          <span className="text-xs px-2 py-0.5 rounded bg-[#1a1a1a] text-neutral-400">
                            <Clock className="w-3 h-3 inline mr-1" />
                            {signal.token.age}h
                          </span>
                        )}
                        {signal.isNew && (
                          <span className="text-xs px-2 py-0.5 rounded bg-[#00ff88]/20 text-[#00ff88] font-bold animate-pulse">
                            NEW
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-neutral-500">{signal.token.name}</div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-neutral-500">MC: {formatMarketCap(signal.token.marketCap)}</span>
                        <span className="text-xs text-neutral-500">Liq: {formatMarketCap(signal.token.liquidity)}</span>
                        <span className="text-xs text-neutral-500">Vol: {formatMarketCap(signal.token.volume24h)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Convergence Score */}
                  <div className="flex items-center gap-6">
                    <div className="text-center">
                      <div
                        className={`text-3xl font-black flex items-center gap-1 ${signal.token.priceChange24h >= 0 ? "text-[#00ff88]" : "text-red-500"}`}
                      >
                        {signal.token.priceChange24h >= 0 ? (
                          <TrendingUp className="w-5 h-5" />
                        ) : (
                          <TrendingDown className="w-5 h-5" />
                        )}
                        {signal.token.priceChange24h >= 0 ? "+" : ""}
                        {signal.token.priceChange24h.toFixed(1)}%
                      </div>
                      <div className="text-xs text-neutral-500">24H</div>
                    </div>

                    <div className="text-center px-4 py-2 bg-[#111] rounded-xl border border-[#222]">
                      <div className="flex items-center gap-1 text-xl font-black text-purple-400">
                        <Users className="w-5 h-5" />
                        {signal.kolsBuying.length}
                      </div>
                      <div className="text-[10px] text-neutral-500">KOLs IN</div>
                    </div>

                    {signal.kolsSelling.length > 0 && (
                      <div className="text-center px-4 py-2 bg-red-500/10 rounded-xl border border-red-500/20">
                        <div className="flex items-center gap-1 text-xl font-black text-red-400">
                          <Users className="w-5 h-5" />
                          {signal.kolsSelling.length}
                        </div>
                        <div className="text-[10px] text-neutral-500">SELLING</div>
                      </div>
                    )}

                    <div
                      className={`px-4 py-3 rounded-xl text-center ${
                        signal.convergenceScore >= 90
                          ? "bg-[#00ff88]/20"
                          : signal.convergenceScore >= 75
                            ? "bg-purple-500/20"
                            : "bg-blue-500/20"
                      }`}
                    >
                      <div
                        className={`text-2xl font-black ${
                          signal.convergenceScore >= 90
                            ? "text-[#00ff88]"
                            : signal.convergenceScore >= 75
                              ? "text-purple-400"
                              : "text-blue-400"
                        }`}
                      >
                        {signal.convergenceScore}
                      </div>
                      <div className="text-[10px] text-neutral-500">SCORE</div>
                    </div>

                    <div
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                        signal.riskLevel === "HIGH"
                          ? "bg-orange-500/20 text-orange-400"
                          : signal.riskLevel === "MEDIUM"
                            ? "bg-yellow-500/20 text-yellow-400"
                            : "bg-[#00ff88]/20 text-[#00ff88]"
                      }`}
                    >
                      {signal.riskLevel} RISK
                    </div>
                  </div>
                </div>

                {/* KOL Avatars Preview */}
                <div className="flex items-center gap-2 mt-4">
                  <span className="text-xs text-neutral-500">Bought by:</span>
                  <div className="flex -space-x-2">
                    {signal.kolsBuying.slice(0, 5).map((kol, i) => (
                      <img
                        key={i}
                        src={kol.avatar || "/placeholder.svg"}
                        alt={kol.name}
                        className="w-7 h-7 rounded-full border-2 border-[#0a0a0a] bg-[#1a1a1a]"
                        title={kol.name}
                        onError={(e) => {
                          e.currentTarget.src = `https://ui-avatars.com/api/?name=${kol.name}&background=1a1a1a&color=00ff88&bold=true&size=28`
                        }}
                      />
                    ))}
                    {signal.kolsBuying.length > 5 && (
                      <div className="w-7 h-7 rounded-full bg-[#1a1a1a] border-2 border-[#0a0a0a] flex items-center justify-center text-xs text-white font-bold">
                        +{signal.kolsBuying.length - 5}
                      </div>
                    )}
                  </div>
                  {signal.kolsSelling.length > 0 && (
                    <>
                      <span className="text-xs text-red-500 ml-4">Selling:</span>
                      <div className="flex -space-x-2">
                        {signal.kolsSelling.slice(0, 3).map((kol, i) => (
                          <img
                            key={i}
                            src={kol.avatar || "/placeholder.svg"}
                            alt={kol.name}
                            className="w-7 h-7 rounded-full border-2 border-red-500/50 bg-[#1a1a1a]"
                            title={kol.name}
                            onError={(e) => {
                              e.currentTarget.src = `https://ui-avatars.com/api/?name=${kol.name}&background=1a1a1a&color=ff4444&bold=true&size=28`
                            }}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Expanded Details */}
              {selectedSignal === signal.id && (
                <div className="px-6 pb-4 bg-[#080808]">
                  <div className="grid grid-cols-2 gap-4">
                    {/* KOL Buy Details */}
                    <div className="bg-[#0a0a0a] rounded-xl p-4 border border-[#1a1a1a]">
                      <div className="text-xs text-neutral-500 uppercase tracking-wider mb-3">KOL BUY ACTIVITY</div>
                      <div className="space-y-3 max-h-48 overflow-y-auto">
                        {signal.kolsBuying.map((kol, i) => (
                          <div key={i} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <img
                                src={kol.avatar || "/placeholder.svg"}
                                alt={kol.name}
                                className="w-8 h-8 rounded-full bg-[#1a1a1a]"
                                onError={(e) => {
                                  e.currentTarget.src = `https://ui-avatars.com/api/?name=${kol.name}&background=1a1a1a&color=00ff88&bold=true&size=32`
                                }}
                              />
                              <div>
                                <div className="text-white font-medium">{kol.name}</div>
                                <div className="text-xs text-neutral-500">{kol.time} ago</div>
                              </div>
                            </div>
                            <div className="text-[#00ff88] font-bold">${(kol.amount / 1000).toFixed(0)}K</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="bg-[#0a0a0a] rounded-xl p-4 border border-[#1a1a1a]">
                      <div className="text-xs text-neutral-500 uppercase tracking-wider mb-3">QUICK ACTIONS</div>
                      <div className="space-y-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            copyAddress(signal.token.address)
                          }}
                          className="w-full flex items-center justify-center gap-2 py-3 bg-[#111] border border-[#222] rounded-xl text-white font-medium hover:bg-[#1a1a1a] transition-colors"
                        >
                          <Copy className="w-4 h-4" />
                          Copy Contract Address
                        </button>
                        <a
                          href={`https://dexscreener.com/solana/${signal.token.address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="w-full flex items-center justify-center gap-2 py-3 bg-[#00ff88] text-black font-black rounded-xl hover:bg-[#00dd77] transition-colors"
                        >
                          Trade on DEX
                          <ExternalLink className="w-4 h-4" />
                        </a>
                        <div className="grid grid-cols-3 gap-2 mt-2">
                          <a
                            href={`https://birdeye.so/token/${signal.token.address}?chain=solana`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center justify-center gap-1 py-2 bg-[#111] border border-[#222] rounded-lg text-xs text-white hover:bg-[#1a1a1a]"
                          >
                            Birdeye
                          </a>
                          <a
                            href={`https://solscan.io/token/${signal.token.address}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center justify-center gap-1 py-2 bg-[#111] border border-[#222] rounded-lg text-xs text-white hover:bg-[#1a1a1a]"
                          >
                            Solscan
                          </a>
                          <a
                            href={`https://pump.fun/${signal.token.address}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center justify-center gap-1 py-2 bg-[#111] border border-[#222] rounded-lg text-xs text-white hover:bg-[#1a1a1a]"
                          >
                            Pump.fun
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
