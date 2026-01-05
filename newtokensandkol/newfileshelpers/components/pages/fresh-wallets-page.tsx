"use client"

import useSWR from "swr"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Users, AlertTriangle, Copy, CheckCheck, ExternalLink } from "lucide-react"

interface FreshWalletAlert {
  id: string
  tokenAddress: string
  tokenSymbol: string
  tokenName: string
  logoURI: string | null
  freshWalletCount: number
  totalBuyVolume: number
  bundleDetected: boolean
  timestamp: string
  riskLevel: "low" | "medium" | "high"
  marketCap: number
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function getGradientFromAddress(address: string): string {
  let hash = 0
  for (let i = 0; i < address.length; i++) {
    hash = address.charCodeAt(i) + ((hash << 5) - hash)
  }
  const h1 = Math.abs(hash % 360)
  const h2 = (h1 + 40) % 360
  return `linear-gradient(135deg, hsl(${h1}, 70%, 50%), hsl(${h2}, 70%, 40%))`
}

function TokenLogo({ logoURI, symbol, address }: { logoURI: string | null; symbol: string; address: string }) {
  const [failed, setFailed] = useState(false)

  if (!logoURI || failed) {
    return (
      <div
        className="flex h-12 w-12 items-center justify-center rounded-lg text-sm font-bold text-white"
        style={{ background: getGradientFromAddress(address) }}
      >
        {symbol.slice(0, 2).toUpperCase()}
      </div>
    )
  }

  return (
    <img
      src={logoURI || "/placeholder.svg"}
      alt={symbol}
      className="h-12 w-12 rounded-lg object-cover"
      onError={() => setFailed(true)}
    />
  )
}

export function FreshWalletsPage() {
  const router = useRouter()
  const [copiedCA, setCopiedCA] = useState<string | null>(null)
  const { data, isLoading } = useSWR<{ alerts: FreshWalletAlert[] }>("/api/tokens/fresh-wallets", fetcher, {
    refreshInterval: 30000,
  })

  const alerts = data?.alerts || []

  const copyToClipboard = async (ca: string) => {
    await navigator.clipboard.writeText(ca)
    setCopiedCA(ca)
    setTimeout(() => setCopiedCA(null), 2000)
  }

  const formatNumber = (n: number) => {
    if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
    if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`
    return `$${n.toFixed(0)}`
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const diff = Math.floor((Date.now() - date.getTime()) / 1000)
    if (diff < 60) return `${diff}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    return `${Math.floor(diff / 3600)}h ago`
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Fresh Wallets Tracker</h1>
        <p className="text-muted-foreground">Detect new wallet activity and potential bundling</p>
      </div>

      {/* Risk Legend */}
      <div className="flex gap-4 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-[var(--success)]" />
          <span className="text-sm text-muted-foreground">Low Risk</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-primary" />
          <span className="text-sm text-muted-foreground">Medium Risk</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-destructive" />
          <span className="text-sm text-muted-foreground">High Risk / Bundle Detected</span>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-chart-5/20 p-2">
              <Users className="h-5 w-5 text-chart-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Fresh Wallet Activity</h2>
              <p className="text-xs text-muted-foreground">New wallets buying tokens</p>
            </div>
          </div>
          <Badge variant="outline">{alerts.length} tracked</Badge>
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
              <TokenLogo logoURI={alert.logoURI} symbol={alert.tokenSymbol} address={alert.tokenAddress} />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{alert.tokenSymbol}</span>
                  <span className="truncate text-xs text-muted-foreground">{alert.tokenName}</span>
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
                    {alert.riskLevel} risk
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

              <div className="text-right text-xs">
                <div className="font-medium text-foreground">{alert.freshWalletCount} fresh wallets</div>
                <div className="text-muted-foreground">{formatNumber(alert.totalBuyVolume)} bought</div>
                <div className="text-muted-foreground">{formatNumber(alert.marketCap)} MC</div>
                <div className="text-[10px] text-muted-foreground">{formatTime(alert.timestamp)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
