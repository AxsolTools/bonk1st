"use client"

import { Header } from "@/components/layout/header"
import { GlobalPourEffect } from "@/components/visuals/global-pour-effect"
import { TokenAggregator } from "@/components/kol/token-aggregator"
import { DexAlertsTicker } from "@/components/kol/dex-alerts-ticker"
import { BarChart3, Activity } from "lucide-react"

export default function TokenAggregatorPage() {
  return (
    <main className="min-h-screen bg-[var(--bg-primary)]">
      <GlobalPourEffect />
      <Header />

      <div className="px-3 sm:px-4 lg:px-6 py-4">
        <div className="max-w-[1920px] mx-auto">
          {/* DexScreener Real-Time Alerts Ticker */}
          <DexAlertsTicker className="mb-3" maxVisible={15} />

          {/* Page Header */}
          <div className="mb-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-[var(--aqua-primary)]/20">
                <BarChart3 className="w-6 h-6 text-[var(--aqua-primary)]" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-[var(--text-primary)]">Token Aggregator</h1>
                <p className="text-sm text-[var(--text-muted)]">
                  Real-time token discovery with advanced analytics and smart money tracking
                </p>
              </div>
            </div>

            {/* Live Indicator */}
            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-subtle)]">
                <Activity className="w-4 h-4 text-[var(--aqua-primary)]" />
                <span className="text-xs text-[var(--text-muted)]">Live Feed</span>
                <span className="w-2 h-2 rounded-full bg-[var(--green)] animate-pulse" />
              </div>
            </div>
          </div>

          {/* Token Aggregator - Full Width */}
          <div className="bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl overflow-hidden h-[calc(100vh-200px)]">
            <TokenAggregator />
          </div>
        </div>
      </div>
    </main>
  )
}
