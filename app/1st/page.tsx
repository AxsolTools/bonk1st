"use client"

import { SniperDashboard } from "@/components/1st/sniper/sniper-dashboard"
import { TokenGateGuard } from "@/components/1st/access/token-gate-guard"

export default function FirstSniperPage() {
  return (
    <TokenGateGuard>
      <SniperDashboard />
    </TokenGateGuard>
  )
}

