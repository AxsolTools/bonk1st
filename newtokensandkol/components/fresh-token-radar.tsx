"use client"

import { useState, useEffect } from "react"
import { getFreshTokens, type FreshToken } from "@/lib/kol-data"
import { Radar, Clock, TrendingUp, AlertTriangle, Shield, Rocket, ExternalLink } from "lucide-react"

export function FreshTokenRadar() {
  const [tokens, setTokens] = useState<FreshToken[]>([])

  useEffect(() => {
    setTokens(getFreshTokens())
    const interval = setInterval(() => {
      setTokens(getFreshTokens())
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  const getTimeAgo = (date: Date) => {
    const hours = Math.floor((Date.now() - date.getTime()) / 3600000)
    if (hours < 1) return "< 1h"
    if (hours < 24) return `${hours}h`
    return `${Math.floor(hours / 24)}d`
  }

  const getRiskColor = (risk: number) => {
    if (risk < 30) return "text-[#00ff88]"
    if (risk < 60) return "text-yellow-400"
    return "text-red-500"
  }

  const getMoonColor = (moon: number) => {
    if (moon >= 70) return "text-[#00ff88]"
    if (moon >= 40) return "text-yellow-400"
    return "text-neutral-500"
  }

  return (
    <div className="bg-[#0d0d0d] border border-[#1a1a1a] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-[#1a1a1a] bg-gradient-to-r from-purple-500/10 to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-purple-500/20">
              <Radar className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h3 className="font-bold text-white">FRESH TOKEN RADAR</h3>
              <p className="text-xs text-neutral-500">New launches KOLs are buying</p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs text-purple-400">
            <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />
            SCANNING
          </div>
        </div>
      </div>

      {/* Token Grid */}
      <div className="p-4 space-y-3">
        {tokens.map((item, i) => (
          <div
            key={item.token.symbol}
            className="bg-[#111] rounded-lg p-4 border border-[#1a1a1a] hover:border-[#333] transition-colors"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <img
                  src={item.token.logo || "/placeholder.svg"}
                  alt={item.token.symbol}
                  className="w-10 h-10 rounded-full"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">{item.token.symbol}</span>
                    <span className="text-xs text-neutral-500">{item.token.name}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-neutral-500">
                    <Clock className="w-3 h-3" />
                    Launched {getTimeAgo(item.launchTime)} ago
                  </div>
                </div>
              </div>

              <a
                href={`https://birdeye.so/token/${item.token.address}?chain=solana`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 hover:bg-[#222] rounded-lg text-neutral-500 hover:text-white transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div className="bg-[#0a0a0a] rounded-lg p-2">
                <div className="flex items-center gap-1 text-xs text-neutral-500 mb-1">
                  <Shield className="w-3 h-3" />
                  Risk
                </div>
                <div className={`font-bold ${getRiskColor(item.riskScore)}`}>{item.riskScore}%</div>
              </div>
              <div className="bg-[#0a0a0a] rounded-lg p-2">
                <div className="flex items-center gap-1 text-xs text-neutral-500 mb-1">
                  <Rocket className="w-3 h-3" />
                  Moon
                </div>
                <div className={`font-bold ${getMoonColor(item.moonPotential)}`}>{item.moonPotential}%</div>
              </div>
              <div className="bg-[#0a0a0a] rounded-lg p-2">
                <div className="flex items-center gap-1 text-xs text-neutral-500 mb-1">
                  <TrendingUp className="w-3 h-3" />
                  KOLs
                </div>
                <div className="font-bold text-white">{item.kolBuyers.length}</div>
              </div>
            </div>

            {/* KOL Avatars */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-500">Buying:</span>
              <div className="flex -space-x-2">
                {item.kolBuyers.slice(0, 5).map((kol) => (
                  <img
                    key={kol.id}
                    src={kol.avatar || "/placeholder.svg"}
                    alt={kol.name}
                    title={kol.name}
                    className="w-6 h-6 rounded-full border-2 border-[#111]"
                  />
                ))}
                {item.kolBuyers.length > 5 && (
                  <div className="w-6 h-6 rounded-full border-2 border-[#111] bg-[#333] flex items-center justify-center text-[10px] text-white">
                    +{item.kolBuyers.length - 5}
                  </div>
                )}
              </div>
              {item.kolBuyers.some((k) => k.isWashTrader) && (
                <div className="flex items-center gap-1 text-xs text-yellow-500">
                  <AlertTriangle className="w-3 h-3" />
                  Contains flagged
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
