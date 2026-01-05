"use client"

import { Header } from "@/components/layout/header"
import { EarnDashboard } from "@/components/earn/earn-dashboard"
import { EarnTicker } from "@/components/earn/earn-ticker"

export default function EarnPage() {
  return (
    <main className="min-h-screen bg-[var(--bg-primary)]">
      <Header />
      
      {/* Live Stats Ticker - Only on Earn page */}
      <EarnTicker />
      
      {/* Background Effects - matching rest of site */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {/* Gradient orbs */}
        <div className="absolute top-0 left-1/4 w-[800px] h-[800px] bg-[var(--aqua-primary)]/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-[var(--warm-pink)]/5 rounded-full blur-[100px]" />
      </div>

      {/* Content */}
      <div className="relative z-10 pt-8 pb-16 px-4 lg:px-6">
        <div className="max-w-7xl mx-auto">
          <EarnDashboard />
        </div>
      </div>
    </main>
  )
}
