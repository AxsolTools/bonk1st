"use client"

import { useState, useEffect } from "react"
import { Header } from "@/components/layout/header"
import { TokenHeader } from "@/components/token/token-header"
import { TradePanel } from "@/components/token/trade-panel"
import { MetricsGrid } from "@/components/token/metrics-grid"
import { LiveFeed } from "@/components/token/live-feed"
import { TokenInfo } from "@/components/token/token-info"
import { TransactionHistory } from "@/components/token/transaction-history"
import { BoostSection } from "@/components/token/boost-section"
import { VoteBoostPanel } from "@/components/token/vote-boost-panel"
import { DemoPourEffect } from "@/components/visuals/demo-pour-effect"

export default function DemoTokenPage() {
  const [pourTrigger, setPourTrigger] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setPourTrigger((prev) => prev + 1)
    }, 10000)

    // Initial pour after 2 seconds
    const timeout = setTimeout(() => {
      setPourTrigger(1)
    }, 2000)

    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [])

  // Mock token data
  const mockToken = {
    id: "demo-token-1",
    mint_address: "DEMO123456789ABCDEFGHIJKLMNOP",
    name: "Pump Swap",
    symbol: "SWAP",
    description: "A revolutionary DeFi token powering decentralized exchanges with infinite liquidity mechanics",
    image_url: "/eagle-logo.png",
    price_sol: 0.00425,
    market_cap_sol: 425000,
    volume_24h_sol: 85000,
    liquidity_sol: 250000,
    holders_count: 15420,
    creation_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
    creator_wallet: "EPjFWaoBg6eU8KzzchEgrSX1edQHkaJ329zZyh3SPsEm",
    pour_rate: 250.5,
    evaporation_rate: 15.25,
    water_level: 78.5,
    constellation_health: 92,
    total_poured: 1250000,
    total_harvested: 425000,
  } as any

  // Mock trades data
  const mockTrades = [
    {
      id: "trade-1",
      token_id: "demo-token-1",
      wallet_address: "Buyer123ABC...",
      amount: 5000,
      price_sol: 0.004,
      is_buy: true,
      created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      tx_hash: "5BvP4...",
    },
    {
      id: "trade-2",
      token_id: "demo-token-1",
      wallet_address: "Seller456DEF...",
      amount: 2500,
      price_sol: 0.00425,
      is_buy: false,
      created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      tx_hash: "7KmL9...",
    },
    {
      id: "trade-3",
      token_id: "demo-token-1",
      wallet_address: "Buyer789GHI...",
      amount: 10000,
      price_sol: 0.00415,
      is_buy: true,
      created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      tx_hash: "3JxK2...",
    },
  ] as any

  return (
    <main className="min-h-screen bg-[var(--bg-primary)]">
      <DemoPourEffect trigger={pourTrigger} tokenSymbol={mockToken.symbol} />
      <Header />

      <div className="max-w-[1600px] mx-auto px-6 sm:px-8 lg:px-12 py-6">
        <div className="w-full">
          {/* Token Header */}
          <TokenHeader token={mockToken} />

          {/* Main Grid: Chart + Trade Panel */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mt-4">
            {/* Chart & Live Feed */}
            <div className="xl:col-span-2 space-y-4">
              <div className="glass-panel-elevated p-4 rounded-lg h-[400px] flex items-center justify-center">
                <div className="text-center">
                  <svg
                    width="48"
                    height="48"
                    viewBox="0 0 40 40"
                    fill="none"
                    className="mx-auto mb-3 opacity-40 text-[var(--aqua-primary)]"
                    stroke="currentColor"
                  >
                    <path d="M8 28l8-8 8 4 12-16" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <p className="text-sm text-[var(--text-muted)]">Chart display area</p>
                  <p className="text-xs text-[var(--text-dim)] mt-1">TradingView Lightweight Charts renders here</p>
                </div>
              </div>

              {/* Live Feed */}
              <LiveFeed trades={mockTrades} tokenSymbol={mockToken.symbol} />
            </div>

            {/* Trade Panel & Token Info */}
            <div className="space-y-4">
              <TradePanel token={mockToken} />
              <TokenInfo token={mockToken} />
            </div>
          </div>

          {/* Metrics */}
          <div className="mt-4">
            <MetricsGrid token={mockToken} />
          </div>

          {/* Community */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            <VoteBoostPanel tokenAddress={mockToken.mint_address} />
            <BoostSection tokenAddress={mockToken.mint_address} />
          </div>

          {/* Transaction History */}
          <div className="mt-4">
            <TransactionHistory tokenAddress={mockToken.mint_address} />
          </div>
        </div>
      </div>
    </main>
  )
}
