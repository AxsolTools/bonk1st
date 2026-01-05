"use client"

import { useState, useEffect } from "react"
import { Flame, Clock, ExternalLink, Copy } from "lucide-react"

interface HotToken {
  id: string
  symbol: string
  name: string
  logo: string
  address: string
  age: string
  kolsBuying: number
  kolsSelling: number
  totalKOLVolume: number
  priceChange: number
  heatScore: number
  topBuyers: { name: string; avatar: string; amount: number }[]
  marketCap: number
  liquidity: number
}

const MOCK_HOT_TOKENS: HotToken[] = [
  {
    id: "1",
    symbol: "GIGA",
    name: "Gigachad",
    logo: "https://dd.dexscreener.com/ds-data/tokens/solana/63LfDmNb3MQ8mw9MtZ2To9bEA2M71kZUUGq5tiJxcqj9.png",
    address: "63LfDmNb3MQ8mw9MtZ2To9bEA2M71kZUUGq5tiJxcqj9",
    age: "2h",
    kolsBuying: 8,
    kolsSelling: 1,
    totalKOLVolume: 458000,
    priceChange: 847,
    heatScore: 98,
    topBuyers: [
      { name: "Ansem", avatar: "https://unavatar.io/twitter/blknoiz06", amount: 125000 },
      { name: "Murad", avatar: "https://unavatar.io/twitter/MustStopMurad", amount: 89000 },
      { name: "GCR", avatar: "https://unavatar.io/twitter/GiganticRebirth", amount: 67000 },
    ],
    marketCap: 12500000,
    liquidity: 890000,
  },
  {
    id: "2",
    symbol: "MICHI",
    name: "Michi",
    logo: "https://dd.dexscreener.com/ds-data/tokens/solana/5mbK36SZ7J19An8jFochhQS4of8g6BwUjbeCSxBSoWdp.png",
    address: "5mbK36SZ7J19An8jFochhQS4of8g6BwUjbeCSxBSoWdp",
    age: "45m",
    kolsBuying: 6,
    kolsSelling: 0,
    totalKOLVolume: 234000,
    priceChange: 523,
    heatScore: 94,
    topBuyers: [
      { name: "Hsaka", avatar: "https://unavatar.io/twitter/HsakaTrades", amount: 78000 },
      { name: "Pentoshi", avatar: "https://unavatar.io/twitter/Pentosh1", amount: 56000 },
      { name: "Cobie", avatar: "https://unavatar.io/twitter/coaborblabs", amount: 45000 },
    ],
    marketCap: 4800000,
    liquidity: 320000,
  },
  {
    id: "3",
    symbol: "RETARDIO",
    name: "Retardio",
    logo: "https://dd.dexscreener.com/ds-data/tokens/solana/6ogzHhzdrQr9Pgv6hZ2MNze7UrzBMAFyBBWUYp1Fhitx.png",
    address: "6ogzHhzdrQr9Pgv6hZ2MNze7UrzBMAFyBBWUYp1Fhitx",
    age: "18m",
    kolsBuying: 5,
    kolsSelling: 0,
    totalKOLVolume: 189000,
    priceChange: 312,
    heatScore: 89,
    topBuyers: [
      { name: "CL207", avatar: "https://unavatar.io/twitter/CL207", amount: 67000 },
      { name: "Loomdart", avatar: "https://unavatar.io/twitter/loomdart", amount: 52000 },
      { name: "0xSun", avatar: "https://unavatar.io/twitter/0xSunNFT", amount: 38000 },
    ],
    marketCap: 2100000,
    liquidity: 180000,
  },
]

export function HotTokensHero() {
  const [tokens, setTokens] = useState(MOCK_HOT_TOKENS)
  const [countdown, setCountdown] = useState(30)

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? 30 : prev - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const copyAddress = (address: string) => {
    navigator.clipboard.writeText(address)
  }

  return (
    <div className="bg-gradient-to-b from-[#0a0a0a] to-[#050505] border-b border-[#1a1a1a]">
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-500/20 rounded-lg">
            <Flame className="w-6 h-6 text-orange-500" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white">HOT RIGHT NOW</h2>
            <p className="text-xs text-neutral-500">New tokens KOLs are accumulating</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-xs text-neutral-500">
            Auto-refresh in <span className="text-[#00ff88] font-mono">{countdown}s</span>
          </div>
          <button className="px-4 py-2 bg-[#111] border border-[#222] rounded-lg text-sm text-white hover:bg-[#1a1a1a] transition-colors">
            View All Tokens
          </button>
        </div>
      </div>

      {/* Hot Tokens Grid */}
      <div className="px-6 pb-6 grid grid-cols-3 gap-4">
        {tokens.map((token, index) => (
          <div
            key={token.id}
            className={`relative bg-[#0d0d0d] border rounded-xl overflow-hidden transition-all hover:border-[#00ff88]/50 ${
              index === 0 ? "border-orange-500/50" : "border-[#1a1a1a]"
            }`}
          >
            {/* Heat Badge */}
            <div
              className={`absolute top-3 right-3 px-2 py-1 rounded text-xs font-bold ${
                token.heatScore >= 95
                  ? "bg-orange-500 text-white"
                  : token.heatScore >= 85
                    ? "bg-yellow-500 text-black"
                    : "bg-[#00ff88] text-black"
              }`}
            >
              {token.heatScore} HEAT
            </div>

            {/* Token Header */}
            <div className="p-4 pb-3">
              <div className="flex items-center gap-3">
                <img
                  src={token.logo || "/placeholder.svg"}
                  alt={token.symbol}
                  className="w-12 h-12 rounded-full border-2 border-[#222]"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-white text-lg">${token.symbol}</span>
                    <span className="text-xs text-neutral-500 bg-[#1a1a1a] px-2 py-0.5 rounded">
                      <Clock className="w-3 h-3 inline mr-1" />
                      {token.age}
                    </span>
                  </div>
                  <div className="text-xs text-neutral-500">{token.name}</div>
                </div>
              </div>
            </div>

            {/* Stats Row */}
            <div className="px-4 py-3 bg-[#080808] border-y border-[#1a1a1a] grid grid-cols-3 gap-2">
              <div className="text-center">
                <div className="text-xs text-neutral-500">KOLs Buying</div>
                <div className="text-lg font-bold text-[#00ff88]">{token.kolsBuying}</div>
              </div>
              <div className="text-center border-x border-[#1a1a1a]">
                <div className="text-xs text-neutral-500">Price</div>
                <div className="text-lg font-bold text-[#00ff88]">+{token.priceChange}%</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-neutral-500">KOL Vol</div>
                <div className="text-lg font-bold text-white">${(token.totalKOLVolume / 1000).toFixed(0)}K</div>
              </div>
            </div>

            {/* Top Buyers */}
            <div className="p-4">
              <div className="text-xs text-neutral-500 mb-2">TOP BUYERS</div>
              <div className="space-y-2">
                {token.topBuyers.map((buyer, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <img src={buyer.avatar || "/placeholder.svg"} alt={buyer.name} className="w-6 h-6 rounded-full" />
                      <span className="text-sm text-white">{buyer.name}</span>
                    </div>
                    <span className="text-sm text-[#00ff88]">${(buyer.amount / 1000).toFixed(0)}K</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="px-4 pb-4 flex gap-2">
              <button
                onClick={() => copyAddress(token.address)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-[#111] border border-[#222] rounded-lg text-xs text-white hover:bg-[#1a1a1a] transition-colors"
              >
                <Copy className="w-3 h-3" />
                Copy CA
              </button>
              <a
                href={`https://dexscreener.com/solana/${token.address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-[#00ff88] text-black font-bold rounded-lg text-xs hover:bg-[#00dd77] transition-colors"
              >
                Trade
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
