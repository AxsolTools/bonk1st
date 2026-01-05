"use client"

import { useState } from "react"
import { Users, ChevronRight, ExternalLink, Copy } from "lucide-react"

interface ConvergenceToken {
  id: string
  symbol: string
  name: string
  logo: string
  address: string
  kolCount: number
  totalVolume: number
  avgEntry: number
  currentPrice: number
  convergenceScore: number
  kols: { name: string; avatar: string; action: "buy" | "accumulate"; amount: number; time: string }[]
  trend: "bullish" | "neutral" | "bearish"
}

const MOCK_CONVERGENCE: ConvergenceToken[] = [
  {
    id: "1",
    symbol: "WIF",
    name: "dogwifhat",
    logo: "https://bafkreibk3covs5ltyqxa272uodhber6imo6qy7fuwj3q3d2ap3f37tlkmu.ipfs.nftstorage.link/",
    address: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
    kolCount: 12,
    totalVolume: 2340000,
    avgEntry: 2.45,
    currentPrice: 2.87,
    convergenceScore: 94,
    kols: [
      {
        name: "Ansem",
        avatar: "https://unavatar.io/twitter/blknoiz06",
        action: "accumulate",
        amount: 450000,
        time: "5m",
      },
      {
        name: "Murad",
        avatar: "https://unavatar.io/twitter/MustStopMurad",
        action: "buy",
        amount: 320000,
        time: "12m",
      },
      {
        name: "GCR",
        avatar: "https://unavatar.io/twitter/GiganticRebirth",
        action: "buy",
        amount: 280000,
        time: "18m",
      },
      {
        name: "Hsaka",
        avatar: "https://unavatar.io/twitter/HsakaTrades",
        action: "accumulate",
        amount: 210000,
        time: "25m",
      },
      { name: "Pentoshi", avatar: "https://unavatar.io/twitter/Pentosh1", action: "buy", amount: 180000, time: "32m" },
    ],
    trend: "bullish",
  },
  {
    id: "2",
    symbol: "BONK",
    name: "Bonk",
    logo: "https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5cSY7I",
    address: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    kolCount: 9,
    totalVolume: 1890000,
    avgEntry: 0.0000221,
    currentPrice: 0.0000234,
    convergenceScore: 87,
    kols: [
      { name: "CL207", avatar: "https://unavatar.io/twitter/CL207", action: "buy", amount: 380000, time: "8m" },
      {
        name: "Cobie",
        avatar: "https://unavatar.io/twitter/coaborblabs",
        action: "accumulate",
        amount: 290000,
        time: "15m",
      },
      { name: "Loomdart", avatar: "https://unavatar.io/twitter/loomdart", action: "buy", amount: 240000, time: "28m" },
    ],
    trend: "bullish",
  },
  {
    id: "3",
    symbol: "POPCAT",
    name: "Popcat",
    logo: "https://bafkreidvkvuzyslw5jh5z242lgzwzhbi2kxxnpkb47thkjdueppwuwtrmq.ipfs.nftstorage.link/",
    address: "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr",
    kolCount: 7,
    totalVolume: 1240000,
    avgEntry: 1.32,
    currentPrice: 1.45,
    convergenceScore: 79,
    kols: [
      { name: "0xSun", avatar: "https://unavatar.io/twitter/0xSunNFT", action: "buy", amount: 320000, time: "10m" },
      {
        name: "Dingaling",
        avatar: "https://unavatar.io/twitter/dingalingts",
        action: "accumulate",
        amount: 210000,
        time: "22m",
      },
    ],
    trend: "bullish",
  },
]

export function KOLConvergenceMap() {
  const [tokens, setTokens] = useState(MOCK_CONVERGENCE)
  const [expandedToken, setExpandedToken] = useState<string | null>("1")

  const copyAddress = (address: string) => {
    navigator.clipboard.writeText(address)
  }

  return (
    <div className="h-[500px] flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#1a1a1a] bg-[#080808]">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-purple-500/20 rounded-lg">
            <Users className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h3 className="font-bold text-white">KOL CONVERGENCE</h3>
            <p className="text-[10px] text-neutral-500">Multiple KOLs buying same tokens</p>
          </div>
        </div>
      </div>

      {/* Token List */}
      <div className="flex-1 overflow-y-auto">
        {tokens.map((token) => (
          <div key={token.id} className="border-b border-[#111]">
            {/* Token Header */}
            <div
              onClick={() => setExpandedToken(expandedToken === token.id ? null : token.id)}
              className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-[#0a0a0a] transition-colors"
            >
              <div className="flex items-center gap-3">
                <img src={token.logo || "/placeholder.svg"} alt={token.symbol} className="w-10 h-10 rounded-full" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">${token.symbol}</span>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                        token.convergenceScore >= 90
                          ? "bg-purple-500/20 text-purple-400"
                          : token.convergenceScore >= 80
                            ? "bg-blue-500/20 text-blue-400"
                            : "bg-neutral-500/20 text-neutral-400"
                      }`}
                    >
                      {token.convergenceScore}% CONV
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-[#00ff88]">{token.kolCount} KOLs</span>
                    <span className="text-neutral-600">•</span>
                    <span className="text-xs text-neutral-500">${(token.totalVolume / 1000000).toFixed(2)}M vol</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-sm font-bold text-[#00ff88]">
                    +{(((token.currentPrice - token.avgEntry) / token.avgEntry) * 100).toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-neutral-500">from avg entry</div>
                </div>
                <ChevronRight
                  className={`w-4 h-4 text-neutral-500 transition-transform ${expandedToken === token.id ? "rotate-90" : ""}`}
                />
              </div>
            </div>

            {/* Expanded KOL List */}
            {expandedToken === token.id && (
              <div className="px-4 pb-3 bg-[#080808]">
                <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-2">Recent KOL Activity</div>
                <div className="space-y-2">
                  {token.kols.map((kol, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5">
                      <div className="flex items-center gap-2">
                        <img
                          src={kol.avatar || "/placeholder.svg"}
                          alt={kol.name}
                          className="w-7 h-7 rounded-full border border-[#222]"
                        />
                        <div>
                          <span className="text-sm text-white">{kol.name}</span>
                          <span
                            className={`ml-2 text-[10px] px-1.5 py-0.5 rounded ${
                              kol.action === "accumulate"
                                ? "bg-purple-500/20 text-purple-400"
                                : "bg-[#00ff88]/20 text-[#00ff88]"
                            }`}
                          >
                            {kol.action.toUpperCase()}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-white">${(kol.amount / 1000).toFixed(0)}K</div>
                        <div className="text-[10px] text-neutral-500">{kol.time} ago</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => copyAddress(token.address)}
                    className="flex-1 flex items-center justify-center gap-1 py-2 bg-[#111] border border-[#222] rounded text-xs text-white hover:bg-[#1a1a1a]"
                  >
                    <Copy className="w-3 h-3" />
                    Copy CA
                  </button>
                  <a
                    href={`https://dexscreener.com/solana/${token.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-1 py-2 bg-[#00ff88] text-black font-bold rounded text-xs hover:bg-[#00dd77]"
                  >
                    Trade
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
