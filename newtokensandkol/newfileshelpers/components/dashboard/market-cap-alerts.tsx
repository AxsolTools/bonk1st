"use client"

import useSWR from "swr"
import Image from "next/image"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Bell, TrendingUp, Copy, CheckCheck } from "lucide-react"

interface MCAlert {
  id: string
  tokenAddress: string
  tokenSymbol: string
  tokenName: string
  logoURI: string
  previousMC: number
  currentMC: number
  threshold: string
  timestamp: string
  priceChange: number
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function MarketCapAlerts() {
  const [copiedCA, setCopiedCA] = useState<string | null>(null)
  const router = useRouter()
  const { data, isLoading } = useSWR<{ alerts: MCAlert[] }>("/api/tokens/mc-alerts", fetcher, {
    refreshInterval: 30000,
  })

  const alerts = data?.alerts?.slice(0, 5) || []

  const copyToClipboard = async (ca: string) => {
    await navigator.clipboard.writeText(ca)
    setCopiedCA(ca)
    setTimeout(() => setCopiedCA(null), 2000)
  }

  const formatMC = (mc: number) => {
    if (mc >= 1000000) return `$${(mc / 1000000).toFixed(2)}M`
    if (mc >= 1000) return `$${(mc / 1000).toFixed(0)}K`
    return `$${mc}`
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
          <div className="rounded-lg bg-destructive/10 p-2">
            <Bell className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">MC Alerts</h2>
            <p className="text-xs text-muted-foreground">Threshold breaches</p>
          </div>
        </div>
        <Link href="/alerts" className="text-xs text-primary hover:underline">
          View all
        </Link>
      </div>

      <div className="max-h-[300px] divide-y divide-border/50 overflow-y-auto">
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
                <span className="font-semibold text-foreground">{alert.tokenSymbol}</span>
                <Badge className="bg-[var(--success)]/20 text-[var(--success)] text-[10px]">
                  <TrendingUp className="mr-1 h-3 w-3" />
                  Hit {alert.threshold}
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

            <div className="text-right">
              <div className="text-sm font-medium text-foreground">{formatMC(alert.currentMC)}</div>
              <div className="text-[10px] text-muted-foreground">{formatTime(alert.timestamp)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
