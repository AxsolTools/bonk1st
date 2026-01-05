"use client"

import { KOL_DATABASE, getWashTraders, getHotWallets } from "@/lib/kol-data"
import { formatUSD } from "@/lib/solana-rpc"
import { TrendingUp, TrendingDown, Users, AlertTriangle, Target, Zap, Crown, Flame, BarChart3 } from "lucide-react"

export function StatsOverview() {
  const totalPNL = KOL_DATABASE.reduce((sum, kol) => sum + kol.pnl, 0)
  const avgWinRate = KOL_DATABASE.reduce((sum, kol) => sum + kol.winRate, 0) / KOL_DATABASE.length
  const totalTrades = KOL_DATABASE.reduce((sum, kol) => sum + kol.totalTrades, 0)
  const washTraders = getWashTraders().length
  const diamondTier = KOL_DATABASE.filter((kol) => kol.tier === "diamond").length
  const totalCopyTraders = KOL_DATABASE.reduce((sum, kol) => sum + kol.copyTraders, 0)
  const avgROI = KOL_DATABASE.reduce((sum, kol) => sum + kol.roi30d, 0) / KOL_DATABASE.length
  const hotWallets = getHotWallets(1)[0]

  const stats = [
    {
      label: "Total KOL PNL",
      value: formatUSD(totalPNL),
      change: "+12.5%",
      isPositive: true,
      icon: TrendingUp,
      color: "text-[#00ff88]",
      bgColor: "bg-[#00ff88]/10",
    },
    {
      label: "Avg Win Rate",
      value: `${avgWinRate.toFixed(1)}%`,
      change: "+2.3%",
      isPositive: true,
      icon: Target,
      color: "text-cyan-400",
      bgColor: "bg-cyan-400/10",
    },
    {
      label: "Total Trades",
      value: totalTrades.toLocaleString(),
      change: "+8.2K",
      isPositive: true,
      icon: Zap,
      color: "text-yellow-400",
      bgColor: "bg-yellow-400/10",
    },
    {
      label: "Diamond KOLs",
      value: diamondTier.toString(),
      subtext: `of ${KOL_DATABASE.length} tracked`,
      icon: Crown,
      color: "text-purple-400",
      bgColor: "bg-purple-400/10",
    },
    {
      label: "Wash Traders",
      value: washTraders.toString(),
      subtext: "flagged",
      icon: AlertTriangle,
      color: "text-red-500",
      bgColor: "bg-red-500/10",
    },
    {
      label: "Copy Traders",
      value: `${(totalCopyTraders / 1000).toFixed(0)}K`,
      subtext: "following",
      icon: Users,
      color: "text-blue-400",
      bgColor: "bg-blue-400/10",
    },
    {
      label: "Avg 30d ROI",
      value: `${avgROI.toFixed(1)}%`,
      change: avgROI >= 0 ? `+${avgROI.toFixed(1)}%` : `${avgROI.toFixed(1)}%`,
      isPositive: avgROI >= 0,
      icon: BarChart3,
      color: avgROI >= 0 ? "text-[#00ff88]" : "text-red-500",
      bgColor: avgROI >= 0 ? "bg-[#00ff88]/10" : "bg-red-500/10",
    },
    {
      label: "Hottest Wallet",
      value: hotWallets?.name || "N/A",
      subtext: `+${formatUSD(hotWallets?.pnl7d || 0)} (7d)`,
      icon: Flame,
      color: "text-orange-400",
      bgColor: "bg-orange-400/10",
    },
  ]

  return (
    <div className="grid grid-cols-8 gap-3 p-4 bg-[#0a0a0a] border-b border-[#1a1a1a]">
      {stats.map((stat, i) => (
        <div key={i} className="bg-[#111] rounded-xl p-3 border border-[#1a1a1a]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-neutral-500 uppercase tracking-wider">{stat.label}</span>
            <div className={`p-1.5 rounded-lg ${stat.bgColor}`}>
              <stat.icon className={`w-3.5 h-3.5 ${stat.color}`} />
            </div>
          </div>
          <div className="text-xl font-bold text-white truncate">{stat.value}</div>
          {stat.change && (
            <div
              className={`text-xs mt-1 flex items-center gap-1 ${stat.isPositive ? "text-[#00ff88]" : "text-red-500"}`}
            >
              {stat.isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {stat.change} (24h)
            </div>
          )}
          {stat.subtext && <div className="text-xs mt-1 text-neutral-500">{stat.subtext}</div>}
        </div>
      ))}
    </div>
  )
}
