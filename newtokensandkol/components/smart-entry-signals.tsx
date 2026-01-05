"use client"

import { useState, useEffect } from "react"
import { getSmartEntries, type SmartEntry } from "@/lib/kol-data"
import { Target, TrendingUp, TrendingDown, Clock, Sparkles, Copy, ExternalLink } from "lucide-react"

export function SmartEntrySignals() {
  const [entries, setEntries] = useState<SmartEntry[]>([])
  const [copiedWallet, setCopiedWallet] = useState<string | null>(null)

  useEffect(() => {
    setEntries(getSmartEntries())
    const interval = setInterval(() => {
      setEntries(getSmartEntries())
    }, 45000)
    return () => clearInterval(interval)
  }, [])

  const copyWallet = (wallet: string) => {
    navigator.clipboard.writeText(wallet)
    setCopiedWallet(wallet)
    setTimeout(() => setCopiedWallet(null), 2000)
  }

  return (
    <div className="bg-[#0d0d0d] border border-[#1a1a1a] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-[#1a1a1a] bg-gradient-to-r from-cyan-500/10 to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-cyan-500/20">
              <Target className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h3 className="font-bold text-white">SMART ENTRY SIGNALS</h3>
              <p className="text-xs text-neutral-500">Top KOL entries to follow</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span className="text-xs text-cyan-400">AI Ranked</span>
          </div>
        </div>
      </div>

      {/* Entries List */}
      <div className="max-h-[350px] overflow-y-auto">
        {entries.map((entry, i) => (
          <div
            key={`${entry.kol.id}-${entry.token.symbol}`}
            className={`p-4 border-b border-[#111] hover:bg-[#111] transition-colors ${i < 3 ? "bg-cyan-500/5" : ""}`}
          >
            <div className="flex items-center gap-3">
              {/* KOL Avatar */}
              <div className="relative">
                <img
                  src={entry.kol.avatar || "/placeholder.svg"}
                  alt={entry.kol.name}
                  className="w-10 h-10 rounded-full border-2 border-[#222]"
                />
                <img
                  src={entry.token.logo || "/placeholder.svg"}
                  alt={entry.token.symbol}
                  className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border border-[#111]"
                />
              </div>

              {/* Entry Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-white">{entry.kol.name}</span>
                  <span className="text-neutral-500">→</span>
                  <span className="font-bold text-cyan-400">{entry.token.symbol}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <Clock className="w-3 h-3" />
                  <span>Entry {entry.timeAgo}</span>
                  <span>•</span>
                  <span>@ ${entry.entryPrice.toFixed(4)}</span>
                </div>
              </div>

              {/* PNL & Confidence */}
              <div className="text-right">
                <div
                  className={`flex items-center justify-end gap-1 font-bold ${
                    entry.pnlPercent >= 0 ? "text-[#00ff88]" : "text-red-500"
                  }`}
                >
                  {entry.pnlPercent >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  {entry.pnlPercent >= 0 ? "+" : ""}
                  {entry.pnlPercent.toFixed(1)}%
                </div>
                <div className="text-xs text-neutral-500">
                  Confidence:{" "}
                  <span
                    className={`${
                      entry.confidence >= 70
                        ? "text-[#00ff88]"
                        : entry.confidence >= 50
                          ? "text-yellow-400"
                          : "text-neutral-400"
                    }`}
                  >
                    {entry.confidence}%
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => copyWallet(entry.kol.wallet)}
                  className="p-2 hover:bg-[#222] rounded-lg text-neutral-500 hover:text-white transition-colors"
                  title="Copy wallet"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <a
                  href={`https://birdeye.so/token/${entry.token.address}?chain=solana`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 hover:bg-[#222] rounded-lg text-neutral-500 hover:text-white transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>

            {/* Confidence Bar */}
            <div className="mt-2 h-1 bg-[#1a1a1a] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  entry.confidence >= 70 ? "bg-[#00ff88]" : entry.confidence >= 50 ? "bg-yellow-400" : "bg-neutral-500"
                }`}
                style={{ width: `${entry.confidence}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Copied Toast */}
      {copiedWallet && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-cyan-500 text-black px-4 py-2 rounded-lg text-sm font-medium">
          Wallet copied!
        </div>
      )}
    </div>
  )
}
