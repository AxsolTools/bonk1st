"use client"

import type { KOL } from "@/lib/kol-data"
import { formatUSD } from "@/lib/solana-rpc"
import {
  X,
  Copy,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Target,
  Zap,
  Clock,
  Users,
  AlertTriangle,
  Shield,
  Twitter,
  Eye,
  BarChart2,
  Activity,
  Percent,
  DollarSign,
  Calendar,
  Flame,
} from "lucide-react"

interface Props {
  kol: KOL
  onClose: () => void
}

export function KOLProfilePanel({ kol, onClose }: Props) {
  const copyWallet = () => {
    navigator.clipboard.writeText(kol.wallet)
  }

  return (
    <div className="h-full flex flex-col bg-[#0a0a0a] border-l border-[#1a1a1a] overflow-y-auto">
      {/* Header */}
      <div className="p-4 border-b border-[#1a1a1a]">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <img
                src={kol.avatar || "/placeholder.svg"}
                alt={kol.name}
                className="w-16 h-16 rounded-full border-2 border-[#222] object-cover"
              />
              {kol.verified && (
                <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-[#1d9bf0] rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                  </svg>
                </div>
              )}
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">{kol.name}</h3>
              <a
                href={`https://twitter.com/${kol.twitter}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[#1d9bf0] hover:underline flex items-center gap-1"
              >
                <Twitter className="w-3 h-3" />@{kol.twitter}
              </a>
              <div className="text-xs text-neutral-500 mt-1">{kol.tradingStyle}</div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[#1a1a1a] rounded-lg text-neutral-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Wallet */}
        <div className="mt-4 flex items-center gap-2 bg-[#111] rounded-lg p-2">
          <code className="text-xs text-neutral-400 flex-1 truncate">{kol.wallet}</code>
          <button onClick={copyWallet} className="p-1.5 hover:bg-[#222] rounded text-neutral-500 hover:text-white">
            <Copy className="w-4 h-4" />
          </button>
          <a
            href={`https://solscan.io/account/${kol.wallet}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 hover:bg-[#222] rounded text-neutral-500 hover:text-white"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>

        {/* Wash Trader Warning */}
        {kol.isWashTrader && (
          <div className="mt-3 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
            <div className="flex items-center gap-2 text-red-500 font-medium">
              <AlertTriangle className="w-4 h-4" />
              Wash Trading Detected
            </div>
            <p className="text-xs text-red-400/80 mt-1">
              This wallet shows patterns consistent with wash trading. Confidence: {kol.washScore.toFixed(0)}%
            </p>
          </div>
        )}
      </div>

      <div className="p-4 border-b border-[#1a1a1a]">
        <h4 className="text-xs text-neutral-500 uppercase tracking-wider mb-3">Performance</h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#111] rounded-lg p-3">
            <div className="text-xs text-neutral-500 mb-1">Total PNL</div>
            <div className={`text-xl font-bold ${kol.pnl >= 0 ? "text-[#00ff88]" : "text-red-500"}`}>
              {kol.pnl >= 0 ? "+" : ""}
              {formatUSD(kol.pnl)}
            </div>
          </div>
          <div className="bg-[#111] rounded-lg p-3">
            <div className="text-xs text-neutral-500 mb-1">7D PNL</div>
            <div
              className={`text-xl font-bold flex items-center gap-1 ${kol.pnl7d >= 0 ? "text-[#00ff88]" : "text-red-500"}`}
            >
              {kol.pnl7d >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {kol.pnl7d >= 0 ? "+" : ""}
              {formatUSD(kol.pnl7d)}
            </div>
          </div>
          <div className="bg-[#111] rounded-lg p-3">
            <div className="text-xs text-neutral-500 mb-1">Win Rate</div>
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-[#00ff88]" />
              <span className="text-xl font-bold text-white">{kol.winRate.toFixed(1)}%</span>
            </div>
            <div className="mt-2 h-1.5 bg-[#222] rounded-full overflow-hidden">
              <div className="h-full bg-[#00ff88] rounded-full" style={{ width: `${kol.winRate}%` }} />
            </div>
          </div>
          <div className="bg-[#111] rounded-lg p-3">
            <div className="text-xs text-neutral-500 mb-1">Total Trades</div>
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-400" />
              <span className="text-xl font-bold text-white">{kol.totalTrades.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 border-b border-[#1a1a1a]">
        <h4 className="text-xs text-neutral-500 uppercase tracking-wider mb-3">Advanced Analytics</h4>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-neutral-500">
              <BarChart2 className="w-4 h-4" />
              <span className="text-sm">Sharpe Ratio</span>
            </div>
            <span
              className={`font-medium ${kol.sharpeRatio >= 1.5 ? "text-[#00ff88]" : kol.sharpeRatio >= 1 ? "text-yellow-400" : "text-red-500"}`}
            >
              {kol.sharpeRatio.toFixed(2)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-neutral-500">
              <Percent className="w-4 h-4" />
              <span className="text-sm">Max Drawdown</span>
            </div>
            <span className="text-red-400 font-medium">-{kol.maxDrawdown.toFixed(1)}%</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-neutral-500">
              <Activity className="w-4 h-4" />
              <span className="text-sm">Profit Factor</span>
            </div>
            <span className={`font-medium ${kol.profitFactor >= 1.5 ? "text-[#00ff88]" : "text-yellow-400"}`}>
              {kol.profitFactor.toFixed(2)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-neutral-500">
              <DollarSign className="w-4 h-4" />
              <span className="text-sm">Avg Trade Size</span>
            </div>
            <span className="text-white font-medium">{formatUSD(kol.avgTradeSize)}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-neutral-500">
              <TrendingUp className="w-4 h-4" />
              <span className="text-sm">Best Trade</span>
            </div>
            <span className="text-[#00ff88] font-medium">+{formatUSD(kol.bestTrade)}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-neutral-500">
              <TrendingDown className="w-4 h-4" />
              <span className="text-sm">Worst Trade</span>
            </div>
            <span className="text-red-500 font-medium">{formatUSD(kol.worstTrade)}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-neutral-500">
              <Flame className="w-4 h-4" />
              <span className="text-sm">Win Streak</span>
            </div>
            <span className="text-[#00ff88] font-medium">{kol.consecutiveWins}</span>
          </div>
        </div>
      </div>

      {/* Additional Info */}
      <div className="p-4 border-b border-[#1a1a1a] space-y-3">
        <h4 className="text-xs text-neutral-500 uppercase tracking-wider mb-3">Trading Info</h4>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-neutral-500">
            <Clock className="w-4 h-4" />
            <span className="text-sm">Avg Hold Time</span>
          </div>
          <span className="text-white font-medium">{kol.avgHoldTime}</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-neutral-500">
            <Calendar className="w-4 h-4" />
            <span className="text-sm">Active Hours</span>
          </div>
          <span className="text-white font-medium text-xs">{kol.activeHours}</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-neutral-500">
            <Users className="w-4 h-4" />
            <span className="text-sm">Copy Traders</span>
          </div>
          <span className="text-white font-medium">{kol.copyTraders.toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-neutral-500">
            <Eye className="w-4 h-4" />
            <span className="text-sm">Followers</span>
          </div>
          <span className="text-white font-medium">{kol.followers.toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-neutral-500">
            <Shield className="w-4 h-4" />
            <span className="text-sm">Risk Level</span>
          </div>
          <span
            className={`font-medium capitalize ${
              kol.riskLevel === "low"
                ? "text-[#00ff88]"
                : kol.riskLevel === "medium"
                  ? "text-yellow-400"
                  : kol.riskLevel === "high"
                    ? "text-orange-500"
                    : "text-red-500"
            }`}
          >
            {kol.riskLevel}
          </span>
        </div>
      </div>

      {/* Favorite Tokens */}
      <div className="p-4 border-b border-[#1a1a1a]">
        <div className="text-xs text-neutral-500 mb-2">FAVORITE TOKENS</div>
        <div className="flex flex-wrap gap-2">
          {kol.favoriteTokens.map((token) => (
            <span key={token} className="px-2 py-1 bg-[#111] border border-[#222] rounded text-sm text-white">
              {token}
            </span>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="p-4 mt-auto space-y-2">
        <a
          href={`https://birdeye.so/profile/${kol.wallet}?chain=solana`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-2.5 bg-[#00ff88] text-black font-bold rounded-lg hover:bg-[#00dd77] transition-colors"
        >
          View on Birdeye
          <ExternalLink className="w-4 h-4" />
        </a>
        <a
          href={`https://dexscreener.com/solana?maker=${kol.wallet}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-2.5 bg-[#111] text-white font-medium rounded-lg border border-[#222] hover:border-[#333] transition-colors"
        >
          View on DexScreener
          <ExternalLink className="w-4 h-4" />
        </a>
        <a
          href={`https://gmgn.ai/sol/address/${kol.wallet}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-2.5 bg-[#111] text-white font-medium rounded-lg border border-[#222] hover:border-[#333] transition-colors"
        >
          View on GMGN
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>
    </div>
  )
}
