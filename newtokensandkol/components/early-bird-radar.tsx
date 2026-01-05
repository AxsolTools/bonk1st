"use client"

import { useState, useEffect } from "react"
import { Sparkles, Clock, ExternalLink, Copy, Zap, RefreshCw } from "lucide-react"
import { fetchLatestTokens, getTokenAge, formatMarketCap } from "@/lib/api"

interface LiveEarlyToken {
  symbol: string
  name: string
  logo: string
  address: string
  age: string
  marketCap: number
  priceChange24h: number
  volume24h: number
  liquidity: number
  txns24h: { buys: number; sells: number }
}

export function EarlyBirdRadar() {
  const [tokens, setTokens] = useState<LiveEarlyToken[]>([])
  const [loading, setLoading] = useState(true)
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null)

  const loadTokens = async () => {
    setLoading(true)
    try {
      const latestTokens = await fetchLatestTokens()

      // Filter for truly new tokens (created within last 24h) and sort by freshness
      const earlyTokens: LiveEarlyToken[] = latestTokens
        .filter((t: any) => t && t.pairCreatedAt && Date.now() - t.pairCreatedAt < 86400000)
        .map((t: any) => ({
          symbol: t.symbol,
          name: t.name,
          logo: t.logo,
          address: t.address,
          age: getTokenAge(t.pairCreatedAt),
          marketCap: t.marketCap || 0,
          priceChange24h: t.priceChange24h || 0,
          volume24h: t.volume24h || 0,
          liquidity: t.liquidity || 0,
          txns24h: t.txns24h || { buys: 0, sells: 0 },
        }))
        .sort((a: LiveEarlyToken, b: LiveEarlyToken) => {
          // Sort by age (newest first)
          const aMinutes = parseAge(a.age)
          const bMinutes = parseAge(b.age)
          return aMinutes - bMinutes
        })
        .slice(0, 8)

      setTokens(earlyTokens)
    } catch (error) {
      console.error("Error loading early tokens:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTokens()
    const interval = setInterval(loadTokens, 30000)
    return () => clearInterval(interval)
  }, [])

  const parseAge = (age: string): number => {
    const num = Number.parseInt(age)
    if (age.includes("m")) return num
    if (age.includes("h")) return num * 60
    if (age.includes("d")) return num * 1440
    return 9999
  }

  const copyAddress = (address: string) => {
    navigator.clipboard.writeText(address)
    setCopiedAddress(address)
    setTimeout(() => setCopiedAddress(null), 2000)
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#1a1a1a] bg-[#080808]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-yellow-500/20 rounded-lg">
              <Sparkles className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <h3 className="font-bold text-white">EARLY BIRD RADAR</h3>
              <p className="text-[10px] text-neutral-500">Live newest tokens from DexScreener</p>
            </div>
          </div>
          <button
            onClick={loadTokens}
            disabled={loading}
            className="p-2 bg-[#111] border border-[#222] rounded-lg hover:bg-[#1a1a1a] disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 text-neutral-400 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Token List */}
      <div className="flex-1 overflow-y-auto">
        {loading && tokens.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <RefreshCw className="w-6 h-6 text-yellow-400 animate-spin" />
          </div>
        ) : tokens.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-neutral-500 text-sm">No new tokens found</div>
        ) : (
          tokens.map((token) => (
            <div key={token.address} className="p-4 border-b border-[#111] hover:bg-[#080808] transition-colors">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <img
                    src={token.logo || "/placeholder.svg"}
                    alt={token.symbol}
                    className="w-10 h-10 rounded-lg bg-[#1a1a1a]"
                    onError={(e) => {
                      ;(e.target as HTMLImageElement).src =
                        `https://ui-avatars.com/api/?name=${token.symbol}&background=1a1a1a&color=fff&bold=true`
                    }}
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">${token.symbol}</span>
                      {parseAge(token.age) < 60 && (
                        <span className="text-xs px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded font-bold animate-pulse">
                          <Zap className="w-3 h-3 inline" /> HOT
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-neutral-500">
                      <Clock className="w-3 h-3" />
                      {token.age} old
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`font-bold ${token.priceChange24h >= 0 ? "text-[#00ff88]" : "text-red-500"}`}>
                    {token.priceChange24h >= 0 ? "+" : ""}
                    {token.priceChange24h.toFixed(1)}%
                  </div>
                  <div className="text-xs text-neutral-500">MC: {formatMarketCap(token.marketCap)}</div>
                </div>
              </div>

              {/* Stats Row */}
              <div className="flex items-center gap-4 mb-3 text-xs">
                <div className="text-neutral-500">
                  Vol: <span className="text-white">{formatMarketCap(token.volume24h)}</span>
                </div>
                <div className="text-neutral-500">
                  Liq: <span className="text-white">{formatMarketCap(token.liquidity)}</span>
                </div>
                <div className="text-neutral-500">
                  Txns: <span className="text-[#00ff88]">{token.txns24h.buys}B</span>
                  {" / "}
                  <span className="text-red-500">{token.txns24h.sells}S</span>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => copyAddress(token.address)}
                  className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs transition-colors ${
                    copiedAddress === token.address
                      ? "bg-[#00ff88] text-black font-bold"
                      : "bg-[#111] border border-[#222] text-white hover:bg-[#1a1a1a]"
                  }`}
                >
                  <Copy className="w-3 h-3" />
                  {copiedAddress === token.address ? "Copied!" : "CA"}
                </button>
                <a
                  href={`https://dexscreener.com/solana/${token.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-1 py-2 bg-yellow-500 text-black font-bold rounded-lg text-xs hover:bg-yellow-400 transition-colors"
                >
                  Trade
                  <ExternalLink className="w-3 h-3" />
                </a>
                <a
                  href={`https://birdeye.so/token/${token.address}?chain=solana`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1 px-3 py-2 bg-[#111] border border-[#222] text-white rounded-lg text-xs hover:bg-[#1a1a1a] transition-colors"
                >
                  Chart
                </a>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
