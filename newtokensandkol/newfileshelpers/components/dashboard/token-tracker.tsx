"use client"

import useSWR from "swr"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { TrendingUp, TrendingDown, Minus, Activity, Copy, CheckCheck, ExternalLink } from "lucide-react"

interface TrackedToken {
  contractAddress: string
  symbol: string
  name: string
  logoURI: string
  totalMentions: number
  totalEngagement: number
  uniqueAccounts: number
  trendDirection: "up" | "down" | "stable"
  marketCap: number
  priceChange: number
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function TokenTracker() {
  const [copiedCA, setCopiedCA] = useState<string | null>(null)
  const router = useRouter()

  const { data, isLoading } = useSWR<{ tokens: TrackedToken[] }>("/api/tokens/traction", fetcher, {
    refreshInterval: 30000,
  })

  const tokens = data?.tokens || []

  const copyToClipboard = async (ca: string) => {
    await navigator.clipboard.writeText(ca)
    setCopiedCA(ca)
    setTimeout(() => setCopiedCA(null), 2000)
  }

  const getTrendIcon = (direction: "up" | "down" | "stable") => {
    switch (direction) {
      case "up":
        return <TrendingUp className="h-4 w-4 text-[var(--success)]" />
      case "down":
        return <TrendingDown className="h-4 w-4 text-destructive" />
      default:
        return <Minus className="h-4 w-4 text-muted-foreground" />
    }
  }

  const formatNumber = (n: number) => {
    if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
    if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`
    return `$${n.toFixed(0)}`
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-[var(--success)]/10 p-2">
            <Activity className="h-5 w-5 text-[var(--success)]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Token Traction</h2>
            <p className="text-xs text-muted-foreground">Tracking engagement momentum</p>
          </div>
        </div>
      </div>

      <div className="max-h-[400px] overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}

        {tokens.map((token, index) => (
          <div
            key={token.contractAddress}
            onClick={() => router.push(`/token/${token.contractAddress}`)}
            className="flex cursor-pointer items-center gap-4 border-b border-border/50 px-5 py-4 transition-colors hover:bg-secondary/30"
          >
            <div className="relative">
              <Image
                src={token.logoURI || "/placeholder.svg"}
                alt={token.symbol}
                width={40}
                height={40}
                className="rounded-lg"
                unoptimized
                onError={(e) => {
                  e.currentTarget.src = "/digital-token.png"
                }}
              />
              <span
                className={cn(
                  "absolute -left-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
                  index === 0
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-foreground ring-1 ring-border",
                )}
              >
                {index + 1}
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground">{token.symbol}</span>
                <span className="truncate text-xs text-muted-foreground">{token.name}</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <code className="font-mono text-[10px] text-muted-foreground">
                  {token.contractAddress.slice(0, 6)}...{token.contractAddress.slice(-4)}
                </code>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    copyToClipboard(token.contractAddress)
                  }}
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                >
                  {copiedCA === token.contractAddress ? (
                    <CheckCheck className="h-3 w-3 text-[var(--success)]" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    window.open(`https://dexscreener.com/solana/${token.contractAddress}`, "_blank")
                  }}
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="h-3 w-3" />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right text-xs">
                <div className="font-medium text-foreground">{formatNumber(token.totalEngagement)}</div>
                <div className="text-muted-foreground">{token.uniqueAccounts} buyers</div>
              </div>

              <div className="flex items-center gap-1">
                {getTrendIcon(token.trendDirection)}
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px]",
                    token.trendDirection === "up"
                      ? "border-[var(--success)]/30 text-[var(--success)]"
                      : token.trendDirection === "down"
                        ? "border-destructive/30 text-destructive"
                        : "",
                  )}
                >
                  {token.trendDirection}
                </Badge>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
