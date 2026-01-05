"use client"

import useSWR from "swr"
import Image from "next/image"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Users, AlertTriangle, Copy, CheckCheck } from "lucide-react"

interface FreshWalletAlert {
  id: string
  tokenAddress: string
  tokenSymbol: string
  tokenName: string
  logoURI: string
  freshWalletCount: number
  totalBuyVolume: number
  bundleDetected: boolean
  timestamp: string
  riskLevel: "low" | "medium" | "high"
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function FreshWallets() {
  const [copiedCA, setCopiedCA] = useState<string | null>(null)
  const router = useRouter()
  const { data, isLoading } = useSWR<{ alerts: FreshWalletAlert[] }>("/api/tokens/fresh-wallets", fetcher, {
    refreshInterval: 30000,
  })

  const alerts = data?.alerts?.slice(0, 5) || []

  const copyToClipboard = async (ca: string) => {
    await navigator.clipboard.writeText(ca)
    setCopiedCA(ca)
    setTimeout(() => setCopiedCA(null), 2000)
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const diff = Math.floor((Date.now() - date.getTime()) / 1000)
    if (diff < 60) return `${diff}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    return `${Math.floor(diff / 3600)}h ago`
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-chart-5/20 p-2">
            <Users className="h-5 w-5 text-chart-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Fresh Wallets</h2>
            <p className="text-xs text-muted-foreground">New wallet activity</p>
          </div>
        </div>
        <Link href="/wallets" className="text-xs text-primary hover:underline">
          View all
        </Link>
      </div>

      <div className="divide-y divide-border/50">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}

        {alerts.map((alert) => (
          <div
            key={alert.id}
            onClick={() => router.push(`/token/${alert.tokenAddress}`)}
            className="flex cursor-pointer items-center gap-3 px-5 py-4 transition-colors hover:bg-secondary/30"
          >
            <Image
              src={alert.logoURI || "/placeholder.svg"}
              alt={alert.tokenSymbol}
              width={32}
              height={32}
              className="rounded-lg"
              unoptimized
              onError={(e) => {
                e.currentTarget.src = "/digital-token.png"
              }}
            />

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground">{alert.tokenSymbol}</span>
                {alert.bundleDetected && (
                  <Badge className="bg-destructive/20 text-destructive text-[10px]">
                    <AlertTriangle className="mr-1 h-3 w-3" />
                    Bundle
                  </Badge>
                )}
                <Badge
                  className={cn(
                    "text-[10px]",
                    alert.riskLevel === "high"
                      ? "bg-destructive/20 text-destructive"
                      : alert.riskLevel === "medium"
                        ? "bg-primary/20 text-primary"
                        : "bg-[var(--success)]/20 text-[var(--success)]",
                  )}
                >
                  {alert.riskLevel}
                </Badge>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <code className="font-mono text-[10px] text-muted-foreground">
                  {alert.tokenAddress.slice(0, 6)}...{alert.tokenAddress.slice(-4)}
                </code>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    copyToClipboard(alert.tokenAddress)
                  }}
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                >
                  {copiedCA === alert.tokenAddress ? (
                    <CheckCheck className="h-3 w-3 text-[var(--success)]" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </button>
              </div>
            </div>

            <div className="text-right text-xs">
              <div className="font-medium text-foreground">{alert.freshWalletCount} wallets</div>
              <div className="text-muted-foreground">{formatTime(alert.timestamp)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
