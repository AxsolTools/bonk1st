"use client"

import { useState } from "react"
import { AlertTriangle, Clock, Ban, ExternalLink, Bell, BellOff } from "lucide-react"

interface DumpAlert {
  id: string
  kol: {
    name: string
    avatar: string
    twitter: string
    followers: number
  }
  token: {
    symbol: string
    logo: string
    address: string
  }
  type: "dump" | "exit" | "suspicious"
  amount: number
  percentSold: number
  priceImpact: number
  timestamp: Date
  copyTradersAffected: number
  severity: "critical" | "high" | "medium"
}

const MOCK_DUMP_ALERTS: DumpAlert[] = [
  {
    id: "1",
    kol: { name: "ShadyTrader", avatar: "https://unavatar.io/twitter/trader1", twitter: "trader1", followers: 45000 },
    token: {
      symbol: "RUGGED",
      logo: "https://dd.dexscreener.com/ds-data/tokens/solana/placeholder.png",
      address: "xxx1",
    },
    type: "dump",
    amount: 890000,
    percentSold: 95,
    priceImpact: -67,
    timestamp: new Date(Date.now() - 120000),
    copyTradersAffected: 234,
    severity: "critical",
  },
  {
    id: "2",
    kol: { name: "QuickExit", avatar: "https://unavatar.io/twitter/trader2", twitter: "trader2", followers: 28000 },
    token: {
      symbol: "SCAM",
      logo: "https://dd.dexscreener.com/ds-data/tokens/solana/placeholder.png",
      address: "xxx2",
    },
    type: "exit",
    amount: 340000,
    percentSold: 100,
    priceImpact: -45,
    timestamp: new Date(Date.now() - 300000),
    copyTradersAffected: 156,
    severity: "high",
  },
  {
    id: "3",
    kol: { name: "Flipper", avatar: "https://unavatar.io/twitter/trader3", twitter: "trader3", followers: 67000 },
    token: {
      symbol: "PUMP",
      logo: "https://dd.dexscreener.com/ds-data/tokens/solana/placeholder.png",
      address: "xxx3",
    },
    type: "suspicious",
    amount: 180000,
    percentSold: 60,
    priceImpact: -23,
    timestamp: new Date(Date.now() - 600000),
    copyTradersAffected: 89,
    severity: "medium",
  },
]

export function DumpAlerts() {
  const [alerts, setAlerts] = useState(MOCK_DUMP_ALERTS)
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)

  const formatTime = (date: Date) => {
    const diff = Math.floor((Date.now() - date.getTime()) / 1000)
    if (diff < 60) return `${diff}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    return `${Math.floor(diff / 3600)}h ago`
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-red-500 text-white"
      case "high":
        return "bg-orange-500 text-white"
      case "medium":
        return "bg-yellow-500 text-black"
      default:
        return "bg-neutral-500 text-white"
    }
  }

  return (
    <div className="h-[500px] flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#1a1a1a] bg-[#080808] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-red-500/20 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h3 className="font-bold text-white">DUMP ALERTS</h3>
            <p className="text-[10px] text-neutral-500">KOLs exiting positions</p>
          </div>
        </div>
        <button
          onClick={() => setNotificationsEnabled(!notificationsEnabled)}
          className={`p-2 rounded-lg transition-colors ${
            notificationsEnabled ? "bg-[#00ff88]/20 text-[#00ff88]" : "bg-[#1a1a1a] text-neutral-500"
          }`}
        >
          {notificationsEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
        </button>
      </div>

      {/* Alerts List */}
      <div className="flex-1 overflow-y-auto">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className={`p-4 border-b border-[#111] ${
              alert.severity === "critical" ? "bg-red-500/5" : alert.severity === "high" ? "bg-orange-500/5" : ""
            }`}
          >
            {/* Alert Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <img
                  src={alert.kol.avatar || "/placeholder.svg"}
                  alt={alert.kol.name}
                  className="w-10 h-10 rounded-full border-2 border-red-500/50"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">{alert.kol.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${getSeverityColor(alert.severity)}`}>
                      {alert.severity.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-xs text-neutral-500">@{alert.kol.twitter}</div>
                </div>
              </div>
              <div className="text-xs text-neutral-500 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatTime(alert.timestamp)}
              </div>
            </div>

            {/* Alert Details */}
            <div className="bg-[#0a0a0a] rounded-lg p-3 mb-3">
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded ${
                    alert.type === "dump"
                      ? "bg-red-500/20 text-red-500"
                      : alert.type === "exit"
                        ? "bg-orange-500/20 text-orange-500"
                        : "bg-yellow-500/20 text-yellow-500"
                  }`}
                >
                  {alert.type.toUpperCase()}
                </span>
                <span className="text-white font-medium">${alert.token.symbol}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <div className="text-neutral-500">Sold</div>
                  <div className="text-white font-bold">${(alert.amount / 1000).toFixed(0)}K</div>
                </div>
                <div>
                  <div className="text-neutral-500">Position</div>
                  <div className="text-red-500 font-bold">-{alert.percentSold}%</div>
                </div>
                <div>
                  <div className="text-neutral-500">Price Impact</div>
                  <div className="text-red-500 font-bold">{alert.priceImpact}%</div>
                </div>
              </div>
            </div>

            {/* Affected Copy Traders */}
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1 text-red-400">
                <Ban className="w-3 h-3" />
                <span>{alert.copyTradersAffected} copy traders affected</span>
              </div>
              <a
                href={`https://solscan.io/token/${alert.token.address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-neutral-500 hover:text-white"
              >
                View TX
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
