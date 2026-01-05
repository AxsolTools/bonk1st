"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/components/providers/auth-provider"
import { GlassPanel } from "@/components/ui/glass-panel"
import { cn } from "@/lib/utils"
import Link from "next/link"
import Image from "next/image"
import type { Trade, Token, Wallet } from "@/lib/types/database"
import { useBatchLivePrices } from "@/hooks/use-live-price"

// ========== TYPES ==========
interface TokenHolding {
  token: Token
  balance: number
  avgBuyPrice: number
  currentPrice: number
  totalInvested: number
  currentValue: number
  pnl: number
  pnlPercent: number
}

interface WalletPnL {
  wallet: Wallet
  totalInvested: number
  currentValue: number
  realizedPnL: number
  unrealizedPnL: number
  totalPnL: number
  totalPnLPercent: number
  holdings: TokenHolding[]
  recentTrades: TradeWithPnL[]
}

interface TradeWithPnL extends Trade {
  tokenName?: string
  tokenSymbol?: string
  tokenImage?: string
  pnl?: number
  pnlPercent?: number
}

interface PnLSummary {
  totalInvested: number
  totalCurrentValue: number
  totalRealizedPnL: number
  totalUnrealizedPnL: number
  totalPnL: number
  totalPnLPercent: number
  bestTrade: TradeWithPnL | null
  worstTrade: TradeWithPnL | null
  winRate: number
  totalTrades: number
}

// ========== COMPONENT ==========
export function PnLPanel() {
  const { wallets, activeWallet, isAuthenticated } = useAuth()
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null)
  const [walletsPnL, setWalletsPnL] = useState<WalletPnL[]>([])
  const [summary, setSummary] = useState<PnLSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<"overview" | "holdings" | "trades">("overview")
  const [tokenMints, setTokenMints] = useState<string[]>([])
  const [rawTradeData, setRawTradeData] = useState<Map<string, { wallet: Wallet; trades: any[] }>>(new Map())

  const supabase = createClient()
  
  // Fetch live prices for all held tokens
  const { prices: livePrices, solPriceUsd, isLoading: pricesLoading } = useBatchLivePrices(tokenMints)

  // Format helpers
  const formatSOL = (value: number) => {
    if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(2)}K`
    if (Math.abs(value) >= 1) return value.toFixed(4)
    return value.toFixed(6)
  }

  const formatPercent = (value: number) => {
    const sign = value >= 0 ? "+" : ""
    return `${sign}${value.toFixed(2)}%`
  }

  const formatPrice = (price: number) => {
    if (price < 0.0001) return price.toExponential(2)
    if (price < 1) return price.toFixed(6)
    return price.toFixed(4)
  }

  // Step 1: Fetch trade data and collect token mints
  const fetchTradeData = useCallback(async () => {
    if (!isAuthenticated || wallets.length === 0) {
      setIsLoading(false)
      return
    }

    setIsLoading(true)

    try {
      const tradeDataMap = new Map<string, { wallet: Wallet; trades: any[] }>()
      const mintSet = new Set<string>()

      for (const wallet of wallets) {
        // Fetch trades for this wallet
        const { data: trades } = await supabase
          .from("trades")
          .select(`
            *,
            tokens:token_id (
              id,
              name,
              symbol,
              image_url,
              price_sol,
              mint_address
            )
          `)
          .eq("wallet_address", wallet.public_key)
          .order("created_at", { ascending: false })
          .limit(100)

        if (trades && trades.length > 0) {
          tradeDataMap.set(wallet.id, { wallet, trades })
          
          // Collect mint addresses for live price fetching
          for (const trade of trades) {
            const token = (trade as any).tokens as Token
            if (token?.mint_address) {
              mintSet.add(token.mint_address)
            }
          }
        } else {
          tradeDataMap.set(wallet.id, { wallet, trades: [] })
        }
      }

      setRawTradeData(tradeDataMap)
      setTokenMints(Array.from(mintSet))
    } catch (err) {
      console.error("[P&L] Failed to fetch trade data:", err)
    }
  }, [wallets, isAuthenticated, supabase])

  // Step 2: Calculate P&L using live prices
  const calculatePnL = useCallback(() => {
    if (rawTradeData.size === 0) {
      setIsLoading(false)
      return
    }

    try {
      const allWalletPnL: WalletPnL[] = []
      let allTrades: TradeWithPnL[] = []

      for (const [walletId, { wallet, trades }] of rawTradeData) {
        if (!trades || trades.length === 0) {
          allWalletPnL.push({
            wallet,
            totalInvested: 0,
            currentValue: 0,
            realizedPnL: 0,
            unrealizedPnL: 0,
            totalPnL: 0,
            totalPnLPercent: 0,
            holdings: [],
            recentTrades: [],
          })
          continue
        }

        // Group trades by token to calculate holdings
        const tokenMap = new Map<string, {
          token: Token
          buys: Trade[]
          sells: Trade[]
        }>()

        for (const trade of trades) {
          const token = (trade as any).tokens as Token
          if (!token) continue

          if (!tokenMap.has(token.id)) {
            tokenMap.set(token.id, { token, buys: [], sells: [] })
          }

          const entry = tokenMap.get(token.id)!
          if (trade.trade_type === "buy") {
            entry.buys.push(trade)
          } else {
            entry.sells.push(trade)
          }
        }

        // Calculate holdings and P&L per token
        const holdings: TokenHolding[] = []
        let totalInvested = 0
        let currentValue = 0
        let realizedPnL = 0

        for (const [tokenId, data] of tokenMap) {
          const { token, buys, sells } = data

          // Total bought
          const totalBought = buys.reduce((sum, t) => sum + (t.amount_tokens || 0), 0)
          const totalBuyCost = buys.reduce((sum, t) => sum + (t.amount_sol || 0), 0)
          const avgBuyPrice = totalBought > 0 ? totalBuyCost / totalBought : 0

          // Total sold
          const totalSold = sells.reduce((sum, t) => sum + (t.amount_tokens || 0), 0)
          const totalSellRevenue = sells.reduce((sum, t) => sum + (t.amount_sol || 0), 0)

          // Current balance
          const balance = totalBought - totalSold
          const invested = balance > 0 ? (balance / totalBought) * totalBuyCost : 0
          
          // Get LIVE price from Jupiter, fallback to DB price
          const livePrice = token.mint_address 
            ? livePrices.get(token.mint_address)?.priceSol || (token.price_sol || 0)
            : (token.price_sol || 0)
          
          // Current value using LIVE price
          const tokenCurrentValue = balance * livePrice
          
          // Realized P&L (from sells)
          const costBasisSold = totalSold > 0 ? (totalSold / totalBought) * totalBuyCost : 0
          const tokenRealizedPnL = totalSellRevenue - costBasisSold

          // Unrealized P&L (from holdings)
          const tokenUnrealizedPnL = tokenCurrentValue - invested

          totalInvested += invested
          currentValue += tokenCurrentValue
          realizedPnL += tokenRealizedPnL

          if (balance > 0.00001) {
            holdings.push({
              token,
              balance,
              avgBuyPrice,
              currentPrice: livePrice, // Use LIVE price
              totalInvested: invested,
              currentValue: tokenCurrentValue,
              pnl: tokenUnrealizedPnL,
              pnlPercent: invested > 0 ? ((tokenCurrentValue - invested) / invested) * 100 : 0,
            })
          }
        }

        // Sort holdings by value
        holdings.sort((a, b) => b.currentValue - a.currentValue)

        // Prepare trades with P&L info
        const tradesWithPnL: TradeWithPnL[] = trades.slice(0, 20).map((trade) => {
          const token = (trade as any).tokens as Token
          return {
            ...trade,
            tokenName: token?.name,
            tokenSymbol: token?.symbol,
            tokenImage: token?.image_url,
          }
        })

        allTrades = [...allTrades, ...tradesWithPnL]

        const unrealizedPnL = currentValue - totalInvested
        const totalPnL = realizedPnL + unrealizedPnL

        allWalletPnL.push({
          wallet,
          totalInvested,
          currentValue,
          realizedPnL,
          unrealizedPnL,
          totalPnL,
          totalPnLPercent: totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0,
          holdings,
          recentTrades: tradesWithPnL,
        })
      }

      setWalletsPnL(allWalletPnL)

      // Calculate overall summary
      const summaryData: PnLSummary = {
        totalInvested: allWalletPnL.reduce((sum, w) => sum + w.totalInvested, 0),
        totalCurrentValue: allWalletPnL.reduce((sum, w) => sum + w.currentValue, 0),
        totalRealizedPnL: allWalletPnL.reduce((sum, w) => sum + w.realizedPnL, 0),
        totalUnrealizedPnL: allWalletPnL.reduce((sum, w) => sum + w.unrealizedPnL, 0),
        totalPnL: allWalletPnL.reduce((sum, w) => sum + w.totalPnL, 0),
        totalPnLPercent: 0,
        bestTrade: null,
        worstTrade: null,
        winRate: 0,
        totalTrades: allTrades.length,
      }

      if (summaryData.totalInvested > 0) {
        summaryData.totalPnLPercent = (summaryData.totalPnL / summaryData.totalInvested) * 100
      }

      // Find best/worst trades (sells with realized P&L)
      const sellTrades = allTrades.filter(t => t.trade_type === "sell")
      const wins = sellTrades.filter(t => (t.pnl || 0) > 0).length
      summaryData.winRate = sellTrades.length > 0 ? (wins / sellTrades.length) * 100 : 0

      setSummary(summaryData)
    } catch (error) {
      console.error("[P&L] Failed to calculate:", error)
    } finally {
      setIsLoading(false)
    }
  }, [rawTradeData, livePrices])

  // Initial fetch of trade data
  useEffect(() => {
    fetchTradeData()
  }, [fetchTradeData])

  // Recalculate P&L when live prices update
  useEffect(() => {
    if (rawTradeData.size > 0 && !pricesLoading) {
      calculatePnL()
    }
  }, [rawTradeData, livePrices, pricesLoading, calculatePnL])

  // Get currently selected wallet data
  const selectedWalletData = selectedWalletId
    ? walletsPnL.find((w) => w.wallet.id === selectedWalletId)
    : null

  const displayedHoldings = selectedWalletData
    ? selectedWalletData.holdings
    : walletsPnL.flatMap((w) => w.holdings)

  const displayedTrades = selectedWalletData
    ? selectedWalletData.recentTrades
    : walletsPnL.flatMap((w) => w.recentTrades).sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ).slice(0, 50)

  if (!isAuthenticated) {
    return null
  }

  return (
    <div className="space-y-4">
      {/* Wallet Selector */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        <button
          onClick={() => setSelectedWalletId(null)}
          className={cn(
            "px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all",
            selectedWalletId === null
              ? "bg-[var(--aqua-primary)] text-[var(--ocean-deep)]"
              : "bg-[var(--ocean-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          )}
        >
          All Wallets
        </button>
        {wallets.map((wallet) => (
          <button
            key={wallet.id}
            onClick={() => setSelectedWalletId(wallet.id)}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all",
              selectedWalletId === wallet.id
                ? "bg-[var(--aqua-primary)] text-[var(--ocean-deep)]"
                : "bg-[var(--ocean-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            )}
          >
            {wallet.label || `${wallet.public_key.slice(0, 4)}...${wallet.public_key.slice(-4)}`}
          </button>
        ))}
      </div>

      {/* Summary Cards */}
      {summary && !selectedWalletId && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <GlassPanel className="p-4">
            <p className="text-xs text-[var(--text-muted)] mb-1">Total Invested</p>
            <p className="text-xl font-bold text-[var(--text-primary)]">{formatSOL(summary.totalInvested)} SOL</p>
          </GlassPanel>
          <GlassPanel className="p-4">
            <p className="text-xs text-[var(--text-muted)] mb-1">Current Value</p>
            <p className="text-xl font-bold text-[var(--aqua-primary)]">{formatSOL(summary.totalCurrentValue)} SOL</p>
          </GlassPanel>
          <GlassPanel className="p-4">
            <p className="text-xs text-[var(--text-muted)] mb-1">Total P&L</p>
            <p className={cn(
              "text-xl font-bold",
              summary.totalPnL >= 0 ? "text-emerald-400" : "text-red-400"
            )}>
              {summary.totalPnL >= 0 ? "+" : ""}{formatSOL(summary.totalPnL)} SOL
            </p>
            <p className={cn(
              "text-xs",
              summary.totalPnL >= 0 ? "text-emerald-400/70" : "text-red-400/70"
            )}>
              {formatPercent(summary.totalPnLPercent)}
            </p>
          </GlassPanel>
          <GlassPanel className="p-4">
            <p className="text-xs text-[var(--text-muted)] mb-1">Win Rate</p>
            <p className="text-xl font-bold text-[var(--text-primary)]">{summary.winRate.toFixed(0)}%</p>
            <p className="text-xs text-[var(--text-muted)]">{summary.totalTrades} trades</p>
          </GlassPanel>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--glass-border)]">
        {(["overview", "holdings", "trades"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px",
              activeTab === tab
                ? "border-[var(--aqua-primary)] text-[var(--aqua-primary)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            )}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      <GlassPanel className="p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-[var(--aqua-primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Overview Tab */}
            {activeTab === "overview" && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Wallet Performance</h3>
                {walletsPnL.length === 0 ? (
                  <p className="text-center py-8 text-[var(--text-muted)]">No trading data yet</p>
                ) : (
                  <div className="space-y-3">
                    {walletsPnL.map((walletData) => (
                      <div
                        key={walletData.wallet.id}
                        className="p-4 rounded-xl bg-[var(--ocean-surface)]/30 border border-[var(--glass-border)]"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-[var(--text-primary)]">
                              {walletData.wallet.label || "Wallet"}
                            </span>
                            <span className="text-xs font-mono text-[var(--text-muted)]">
                              {walletData.wallet.public_key.slice(0, 4)}...{walletData.wallet.public_key.slice(-4)}
                            </span>
                            {walletData.wallet.is_primary && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--aqua-primary)]/20 text-[var(--aqua-primary)]">
                                Main
                              </span>
                            )}
                          </div>
                          <span className={cn(
                            "text-sm font-semibold",
                            walletData.totalPnL >= 0 ? "text-emerald-400" : "text-red-400"
                          )}>
                            {walletData.totalPnL >= 0 ? "+" : ""}{formatSOL(walletData.totalPnL)} SOL
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-2 text-xs">
                          <div>
                            <p className="text-[var(--text-muted)]">Invested</p>
                            <p className="font-medium text-[var(--text-primary)]">{formatSOL(walletData.totalInvested)}</p>
                          </div>
                          <div>
                            <p className="text-[var(--text-muted)]">Current</p>
                            <p className="font-medium text-[var(--aqua-primary)]">{formatSOL(walletData.currentValue)}</p>
                          </div>
                          <div>
                            <p className="text-[var(--text-muted)]">Realized</p>
                            <p className={cn("font-medium", walletData.realizedPnL >= 0 ? "text-emerald-400" : "text-red-400")}>
                              {walletData.realizedPnL >= 0 ? "+" : ""}{formatSOL(walletData.realizedPnL)}
                            </p>
                          </div>
                          <div>
                            <p className="text-[var(--text-muted)]">Unrealized</p>
                            <p className={cn("font-medium", walletData.unrealizedPnL >= 0 ? "text-emerald-400" : "text-red-400")}>
                              {walletData.unrealizedPnL >= 0 ? "+" : ""}{formatSOL(walletData.unrealizedPnL)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Holdings Tab */}
            {activeTab === "holdings" && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Current Holdings</h3>
                {displayedHoldings.length === 0 ? (
                  <p className="text-center py-8 text-[var(--text-muted)]">No holdings</p>
                ) : (
                  displayedHoldings.map((holding, idx) => (
                    <Link
                      key={`${holding.token.id}-${idx}`}
                      href={`/token/${holding.token.mint_address}`}
                      className="block"
                    >
                      <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--ocean-surface)]/30 border border-[var(--glass-border)] hover:border-[var(--aqua-primary)]/50 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="relative w-10 h-10 rounded-lg bg-gradient-to-br from-[var(--aqua-primary)] to-[var(--warm-pink)] overflow-hidden">
                            {holding.token.image_url ? (
                              <Image src={holding.token.image_url} alt={holding.token.name} fill className="object-cover" />
                            ) : (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-sm font-bold text-[var(--ocean-deep)]">
                                  {holding.token.symbol?.slice(0, 2)}
                                </span>
                              </div>
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-[var(--text-primary)]">{holding.token.name}</p>
                            <p className="text-xs text-[var(--text-muted)]">
                              {holding.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${holding.token.symbol}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-[var(--text-primary)]">
                            {formatSOL(holding.currentValue)} SOL
                          </p>
                          <p className={cn(
                            "text-xs font-medium",
                            holding.pnl >= 0 ? "text-emerald-400" : "text-red-400"
                          )}>
                            {holding.pnl >= 0 ? "+" : ""}{formatSOL(holding.pnl)} ({formatPercent(holding.pnlPercent)})
                          </p>
                        </div>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            )}

            {/* Trades Tab */}
            {activeTab === "trades" && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Trade History</h3>
                {displayedTrades.length === 0 ? (
                  <p className="text-center py-8 text-[var(--text-muted)]">No trades yet</p>
                ) : (
                  displayedTrades.map((trade, idx) => (
                    <div
                      key={`${trade.id}-${idx}`}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-xl border",
                        trade.trade_type === "buy"
                          ? "bg-emerald-500/5 border-emerald-500/20"
                          : "bg-red-500/5 border-red-500/20"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold",
                          trade.trade_type === "buy"
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-red-500/20 text-red-400"
                        )}>
                          {trade.trade_type === "buy" ? "B" : "S"}
                        </div>
                        <div className="flex items-center gap-2">
                          {trade.tokenImage && (
                            <div className="relative w-6 h-6 rounded overflow-hidden">
                              <Image src={trade.tokenImage} alt="" fill className="object-cover" />
                            </div>
                          )}
                          <div>
                            <p className="text-sm font-medium text-[var(--text-primary)]">
                              {trade.trade_type === "buy" ? "Bought" : "Sold"} {trade.tokenSymbol || "Token"}
                            </p>
                            <p className="text-xs text-[var(--text-muted)]">
                              {new Date(trade.created_at).toLocaleDateString()} {new Date(trade.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-[var(--text-primary)]">
                          {(trade.amount_tokens || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </p>
                        <p className={cn(
                          "text-xs font-mono",
                          trade.trade_type === "buy" ? "text-emerald-400" : "text-red-400"
                        )}>
                          {trade.trade_type === "buy" ? "-" : "+"}{formatSOL(trade.amount_sol || 0)} SOL
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </GlassPanel>
    </div>
  )
}

