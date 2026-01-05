"use client"

import { useEffect, useState } from "react"
import { getRpcStatus } from "@/lib/solana"
import { Progress } from "@/components/ui/progress"

export function RpcMonitor() {
  const [rpcInfo, setRpcInfo] = useState({ currentRpc: "", requestsUntilRotation: 3, currentIndex: 0, totalRpcs: 6 })

  useEffect(() => {
    const interval = setInterval(() => {
      setRpcInfo(getRpcStatus())
    }, 500)
    return () => clearInterval(interval)
  }, [])

  const progress = ((3 - rpcInfo.requestsUntilRotation) / 3) * 100

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">RPC Rotation</h3>
        <span className="text-xs text-primary">
          {rpcInfo.currentIndex + 1}/{rpcInfo.totalRpcs}
        </span>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Current RPC</span>
          <span className="font-mono text-foreground">{new URL(rpcInfo.currentRpc || "https://solana.com").host}</span>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Requests until rotation</span>
            <span className="text-foreground">{rpcInfo.requestsUntilRotation}/3</span>
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>
      </div>
    </div>
  )
}
