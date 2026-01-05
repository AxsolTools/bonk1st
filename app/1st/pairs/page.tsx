"use client"

import { PairsPage } from "@/components/1st/pairs/pairs-page"
import { TokenGateGuard } from "@/components/1st/access/token-gate-guard"

export default function FirstPairsPage() {
  return (
    <TokenGateGuard>
      <PairsPage />
    </TokenGateGuard>
  )
}

