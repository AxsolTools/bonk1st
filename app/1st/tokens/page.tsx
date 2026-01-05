"use client"

import { NewTokenFeed } from "@/components/1st/tokens/new-token-feed"
import { TokenGateGuard } from "@/components/1st/access/token-gate-guard"

export default function FirstTokensPage() {
  return (
    <TokenGateGuard>
      <NewTokenFeed />
    </TokenGateGuard>
  )
}

