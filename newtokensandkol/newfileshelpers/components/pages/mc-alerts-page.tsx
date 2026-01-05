"use client"

import useSWR from "swr"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { StatsCard } from "@/components/dashboard/stats-card"
import { Bell, TrendingUp, Copy, CheckCheck, ExternalLink, Target, Clock } from "lucide-react"
import { cn } from "@/lib/utils"

interface MCAlert {
  id: string
  tokenAddress: string
  tokenSymbol: string
  tokenName: string
  logoURI: string | null
  previousMC: number
  currentMC: number
  threshold: string
  timestamp: string
  priceChange: number
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function TokenLogo({ address, symbol, logoURI }: { address: string; symbol: string; logoURI: string | null }) {
  const [failed, setFailed] = useState(false)

  // Generate unique gradient from address
  const hash = address.slice(0, 8)
  const hue1 = Number.parseInt(hash.slice(0, 4), 16) % 360
  const hue2 = (hue1 + 40) % 360

  if (!logoURI || failed) {
    return (
      <div
        className="flex h-12 w-12 items-center justify-center rounded-lg text-sm font-bold text-white"
        style={{
          background: `linear-gradient(135deg, hsl(${hue1}, 70%, 40%), hsl(${hue2}, 70%, 30%))`,
        }}
      >
        {symbol.slice(0, 2).toUpperCase()}
      </div>
    )
  }

  return (
    <img
      src={logoURI || "/placeholder.svg"}
      alt={symbol}
      width={48}
      height={48}
      className="h-12 w-12 rounded-lg object-cover"
      onError={() => setFailed(true)}
    />
  )
}

export function MCAlertPage() {
  const [copiedCA, setCopiedCA] = useState<string | null>(null)
  const router = useRouter()
  const { data, isLoading } = useSWR<{ alerts: MCAlert[] }>("/api/tokens/mc-alerts", fetcher, {
    refreshInterval: 30000,
  })

  const alerts = data?.alerts || []

  const copyToClipboard = async (ca: string) => {
    await navigator.clipboard.writeText(ca)
    setCopiedCA(ca)
    setTimeout(() => setCopiedCA(null), 2000)
  }

  const formatMC = (mc: number) => {
    if (mc >= 1e6) return `$${(mc / 1e6).toFixed(2)}M`
    if (mc >= 1e3) return `$${(mc / 1e3).toFixed(0)}K`
    return `$${mc.toFixed(0)}`
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const diff = Math.floor((Date.now() - date.getTime()) / 1000)
    if (diff < 60) return `${diff}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    return `${Math.floor(diff / 3600)}h ago`
  }

  return (
    <>
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Market Cap Alerts</h1>
        <p className="text-muted-foreground">Tokens hitting key market cap thresholds</p>
      </div>

      {/* Stats Row */}
      <div className="mb-6 grid grid-cols-4 gap-4">
        <StatsCard
          title="Alerts Today"
          value={alerts.length.toString()}
          subtitle="Thresholds hit"
          icon={<Bell className="h-5 w-5" />}
        />
        <StatsCard
          title="Avg Growth"
          value={
            alerts.length ? `+${(alerts.reduce((a, t) => a + t.priceChange, 0) / alerts.length).toFixed(1)}%` : "0%"
          }
          subtitle="Price change"
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <StatsCard
          title="Top Threshold"
          value="$10M"
          subtitle="Highest hit today"
          icon={<Target className="h-5 w-5" />}
        />
        <StatsCard title="Avg Time" value="< 1m" subtitle="Alert speed" icon={<Clock className="h-5 w-5" />} />
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-destructive/10 p-2">
              <Bell className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Threshold Breaches</h2>
              <p className="text-xs text-muted-foreground">100K, 250K, 500K, 1M, 2.5M, 5M, 10M</p>
            </div>
          </div>
          <Badge variant="outline" className="border-destructive/30 text-destructive">
            {alerts.length} alerts
          </Badge>
        </div>

        <div className="divide-y divide-border/50">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          )}

          {alerts.map((alert) => (
            <div
              key={alert.id}
              onClick={() => router.push(`/token/${alert.tokenAddress}`)}
              className="flex cursor-pointer items-center gap-4 px-5 py-4 transition-colors hover:bg-secondary/30"
            >
              <TokenLogo address={alert.tokenAddress} symbol={alert.tokenSymbol} logoURI={alert.logoURI} />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">{alert.tokenSymbol}</span>
                  <span className="truncate text-xs text-muted-foreground">{alert.tokenName}</span>
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
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      window.open(`https://dexscreener.com/solana/${alert.tokenAddress}`, "_blank")
                    }}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
              </div>

              <div className="text-right">
                <div className="text-lg font-medium text-foreground">{formatMC(alert.currentMC)}</div>
                <div className="text-xs text-muted-foreground">from {formatMC(alert.previousMC)}</div>
                <div
                  className={cn(
                    "text-xs font-medium",
                    alert.priceChange >= 0 ? "text-[var(--success)]" : "text-destructive",
                  )}
                >
                  {alert.priceChange >= 0 ? "+" : ""}
                  {alert.priceChange.toFixed(1)}%
                </div>
                <div className="text-[10px] text-muted-foreground">{formatTime(alert.timestamp)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
