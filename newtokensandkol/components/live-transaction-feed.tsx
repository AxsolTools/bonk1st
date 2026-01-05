"use client"

import { useState, useEffect, useRef } from "react"
import { type KOL_DATABASE, type TOKENS, getRandomKOL, getRandomToken } from "@/lib/kol-data"
import { formatUSD } from "@/lib/solana-rpc"
import { Activity, AlertTriangle, Pause, Play, Volume2, VolumeX, ArrowUpRight, ArrowDownRight } from "lucide-react"

interface Transaction {
  id: string
  kol: (typeof KOL_DATABASE)[0]
  token: (typeof TOKENS)[0]
  type: "buy" | "sell"
  amount: number
  price: number
  timestamp: Date
  isWashTrade: boolean
  pnlPercent: number
}

export function LiveTransactionFeed() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [isPaused, setIsPaused] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [filter, setFilter] = useState<"all" | "buy" | "sell" | "wash">("all")
  const feedRef = useRef<HTMLDivElement>(null)

  // Generate mock transactions
  useEffect(() => {
    if (isPaused) return

    const generateTx = () => {
      const kol = getRandomKOL()
      const token = getRandomToken()
      const type = Math.random() > 0.5 ? "buy" : "sell"
      const amount = Math.random() * 50000 + 100
      const isWashTrade = kol.isWashTrader && Math.random() > 0.7

      const tx: Transaction = {
        id: Math.random().toString(36).substring(7),
        kol,
        token,
        type,
        amount,
        price: amount * (Math.random() * 0.5 + 0.75),
        timestamp: new Date(),
        isWashTrade,
        pnlPercent: (Math.random() - 0.3) * 100,
      }

      setTransactions((prev) => [tx, ...prev].slice(0, 100))
    }

    // Initial transactions
    for (let i = 0; i < 10; i++) generateTx()

    const interval = setInterval(generateTx, 2000 + Math.random() * 3000)
    return () => clearInterval(interval)
  }, [isPaused])

  const filteredTx = transactions.filter((tx) => {
    if (filter === "all") return true
    if (filter === "buy") return tx.type === "buy"
    if (filter === "sell") return tx.type === "sell"
    if (filter === "wash") return tx.isWashTrade
    return true
  })

  const formatTime = (date: Date) => {
    const diff = Math.floor((Date.now() - date.getTime()) / 1000)
    if (diff < 60) return `${diff}s ago`
    return `${Math.floor(diff / 60)}m ago`
  }

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] border-l border-[#1a1a1a]">
      {/* Header */}
      <div className="p-4 border-b border-[#1a1a1a]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-[#00ff88]" />
            <h2 className="font-bold text-white">LIVE FEED</h2>
            <span className="w-2 h-2 rounded-full bg-[#00ff88] animate-pulse" />
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsPaused(!isPaused)}
              className={`p-1.5 rounded hover:bg-[#1a1a1a] ${isPaused ? "text-yellow-400" : "text-neutral-500"}`}
            >
              {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-1.5 rounded hover:bg-[#1a1a1a] ${soundEnabled ? "text-[#00ff88]" : "text-neutral-500"}`}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-1">
          {[
            { key: "all", label: "All" },
            { key: "buy", label: "Buys", color: "text-[#00ff88]" },
            { key: "sell", label: "Sells", color: "text-red-500" },
            { key: "wash", label: "Wash", color: "text-yellow-400" },
          ].map(({ key, label, color }) => (
            <button
              key={key}
              onClick={() => setFilter(key as typeof filter)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                filter === key ? `bg-[#1a1a1a] ${color || "text-white"}` : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Transaction List */}
      <div ref={feedRef} className="flex-1 overflow-y-auto">
        {filteredTx.map((tx, i) => (
          <div
            key={tx.id}
            className={`p-3 border-b border-[#111] hover:bg-[#111] transition-colors ${
              tx.isWashTrade ? "bg-yellow-500/5" : ""
            } ${i === 0 ? "animate-in slide-in-from-top-2" : ""}`}
          >
            <div className="flex items-center gap-3">
              {/* KOL Avatar */}
              <img
                src={tx.kol.avatar || "/placeholder.svg"}
                alt={tx.kol.name}
                className="w-10 h-10 rounded-full border border-[#222] object-cover"
              />

              {/* Transaction Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-white truncate">{tx.kol.name}</span>
                  {tx.isWashTrade && <AlertTriangle className="w-3 h-3 text-yellow-400 flex-shrink-0" />}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span
                    className={`text-xs font-medium flex items-center gap-0.5 ${
                      tx.type === "buy" ? "text-[#00ff88]" : "text-red-500"
                    }`}
                  >
                    {tx.type === "buy" ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    {tx.type.toUpperCase()}
                  </span>
                  <span className="text-neutral-500">•</span>
                  <div className="flex items-center gap-1">
                    {tx.token.logo && (
                      <img
                        src={tx.token.logo || "/placeholder.svg"}
                        alt={tx.token.symbol}
                        className="w-4 h-4 rounded-full"
                      />
                    )}
                    <span className="text-xs text-white font-medium">{tx.token.symbol}</span>
                  </div>
                  <span className="text-neutral-500">•</span>
                  <span className="text-xs text-neutral-500">{formatTime(tx.timestamp)}</span>
                </div>
              </div>

              {/* Amount */}
              <div className="text-right">
                <div className="text-white font-medium">{formatUSD(tx.amount)}</div>
                <div className={`text-xs ${tx.pnlPercent >= 0 ? "text-[#00ff88]" : "text-red-500"}`}>
                  {tx.pnlPercent >= 0 ? "+" : ""}
                  {tx.pnlPercent.toFixed(1)}%
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
