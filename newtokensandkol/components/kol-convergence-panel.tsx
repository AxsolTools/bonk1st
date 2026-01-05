"use client"

import { useState, useEffect } from "react"
import { getKOLConvergence, type KOLConvergence } from "@/lib/kol-data"
import { formatUSD } from "@/lib/solana-rpc"
import { Users, TrendingUp, Clock, Flame, AlertTriangle, ChevronRight, Zap } from "lucide-react"

export function KOLConvergencePanel() {
  const [convergences, setConvergences] = useState<KOLConvergence[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    setConvergences(getKOLConvergence())
    const interval = setInterval(() => {
      setConvergences(getKOLConvergence())
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  const formatTime = (date: Date) => {
    const diff = Math.floor((Date.now() - date.getTime()) / 60000)
    if (diff < 60) return `${diff}m ago`
    return `${Math.floor(diff / 60)}h ago`
  }

  return (
    <div className="bg-[#0d0d0d] border border-[#1a1a1a] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-[#1a1a1a] bg-gradient-to-r from-[#00ff88]/10 to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-[#00ff88]/20">
              <Users className="w-5 h-5 text-[#00ff88]" />
            </div>
            <div>
              <h3 className="font-bold text-white">KOL CONVERGENCE</h3>
              <p className="text-xs text-neutral-500">Multiple KOLs buying same token</p>
            </div>
          </div>
          <span className="text-xs bg-[#00ff88]/20 text-[#00ff88] px-2 py-1 rounded-full animate-pulse">
            LIVE SIGNALS
          </span>
        </div>
      </div>

      {/* Convergence List */}
      <div className="max-h-[400px] overflow-y-auto">
        {convergences.length === 0 ? (
          <div className="p-8 text-center text-neutral-500">No active convergence signals</div>
        ) : (
          convergences.map((conv, i) => (
            <div key={conv.token.symbol} className={`border-b border-[#111] ${i < 3 ? "bg-[#00ff88]/5" : ""}`}>
              <div
                className="p-4 cursor-pointer hover:bg-[#111] transition-colors"
                onClick={() => setExpanded(expanded === conv.token.symbol ? null : conv.token.symbol)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* Rank Badge */}
                    {i < 3 && (
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          i === 0
                            ? "bg-yellow-500 text-black"
                            : i === 1
                              ? "bg-neutral-400 text-black"
                              : "bg-amber-700 text-white"
                        }`}
                      >
                        {i + 1}
                      </div>
                    )}

                    {/* Token Info */}
                    <img
                      src={conv.token.logo || "/placeholder.svg"}
                      alt={conv.token.symbol}
                      className="w-10 h-10 rounded-full"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">{conv.token.symbol}</span>
                        {conv.convergenceScore >= 80 && <Flame className="w-4 h-4 text-orange-500 animate-pulse" />}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-neutral-500">
                        <Users className="w-3 h-3" />
                        <span>{conv.kols.length} KOLs buying</span>
                        <span>•</span>
                        <Clock className="w-3 h-3" />
                        <span>{formatTime(conv.firstBuyTime)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {/* Convergence Score */}
                    <div className="text-right">
                      <div className="text-xs text-neutral-500">Score</div>
                      <div
                        className={`text-lg font-bold ${
                          conv.convergenceScore >= 80
                            ? "text-[#00ff88]"
                            : conv.convergenceScore >= 50
                              ? "text-yellow-400"
                              : "text-neutral-400"
                        }`}
                      >
                        {conv.convergenceScore.toFixed(0)}
                      </div>
                    </div>

                    {/* Volume */}
                    <div className="text-right">
                      <div className="text-xs text-neutral-500">Volume</div>
                      <div className="text-white font-medium">{formatUSD(conv.totalBuyVolume)}</div>
                    </div>

                    <ChevronRight
                      className={`w-5 h-5 text-neutral-500 transition-transform ${
                        expanded === conv.token.symbol ? "rotate-90" : ""
                      }`}
                    />
                  </div>
                </div>

                {/* Convergence Bar */}
                <div className="mt-3 h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      conv.convergenceScore >= 80
                        ? "bg-[#00ff88]"
                        : conv.convergenceScore >= 50
                          ? "bg-yellow-400"
                          : "bg-neutral-500"
                    }`}
                    style={{ width: `${conv.convergenceScore}%` }}
                  />
                </div>
              </div>

              {/* Expanded KOL List */}
              {expanded === conv.token.symbol && (
                <div className="px-4 pb-4 pt-2 bg-[#0a0a0a] border-t border-[#111]">
                  <div className="text-xs text-neutral-500 mb-2">KOLs Buying This Token</div>
                  <div className="flex flex-wrap gap-2">
                    {conv.kols.map((kol) => (
                      <a
                        key={kol.id}
                        href={`https://twitter.com/${kol.twitter}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 bg-[#111] px-3 py-2 rounded-lg hover:bg-[#1a1a1a] transition-colors"
                      >
                        <img src={kol.avatar || "/placeholder.svg"} alt={kol.name} className="w-6 h-6 rounded-full" />
                        <div>
                          <div className="text-sm text-white font-medium">{kol.name}</div>
                          <div className="text-xs text-neutral-500">{kol.winRate.toFixed(0)}% WR</div>
                        </div>
                        {kol.isWashTrader && <AlertTriangle className="w-3 h-3 text-red-500" />}
                      </a>
                    ))}
                  </div>

                  {/* Quick Action */}
                  <div className="mt-3 flex gap-2">
                    <a
                      href={`https://birdeye.so/token/${conv.token.address}?chain=solana`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center gap-2 py-2 bg-[#00ff88] text-black font-bold rounded-lg hover:bg-[#00dd77] transition-colors text-sm"
                    >
                      <Zap className="w-4 h-4" />
                      View on Birdeye
                    </a>
                    <a
                      href={`https://jup.ag/swap/SOL-${conv.token.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center gap-2 py-2 bg-[#1a1a1a] text-white font-medium rounded-lg hover:bg-[#222] transition-colors text-sm border border-[#333]"
                    >
                      <TrendingUp className="w-4 h-4" />
                      Trade on Jupiter
                    </a>
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
