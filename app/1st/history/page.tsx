"use client"

import { SnipeHistoryPage } from "@/components/1st/history/snipe-history"
import { TokenGateGuard } from "@/components/1st/access/token-gate-guard"

export default function FirstHistoryPage() {
  return (
    <TokenGateGuard>
      <SnipeHistoryPage />
    </TokenGateGuard>
  )
}

