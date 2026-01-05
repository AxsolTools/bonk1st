"use client"

import useSWR from "swr"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { StatsCard } from "@/components/dashboard/stats-card"
import { cn } from "@/lib/utils"
import { TrendingUp, Flame, Copy, CheckCheck, ExternalLink, BarChart3, DollarSign, Activity, Zap } from "lucide-react"

interface TrendingToken {
  address: string
  symbol: string
  name: string
  logoURI: string | null
  price: number
  priceChange24h: number
  volume24h: number
  marketCap: number
  liquidity: number
  pairAddress: string
  dexUrl: string
  boosts: number
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function TrendingTokensFull() {
  const [copiedCA, setCopiedCA] = useState<string | null>(null)
  const [timeframe, setTimeframe] = useState<"1h" | "6h" | "24h">("24h")
  const router = useRouter()

  const { data, isLoading } = useSWR<{ tokens: TrendingToken[] }>("/api/tokens/trending", fetcher, {
    refreshInterval: 30000,
  })

  const tokens = data?.tokens || []

  const copyToClipboard = async (ca: string) => {
    await navigator.clipboard.writeText(ca)
    setCopiedCA(ca)
    setTimeout(() => setCopiedCA(null), 2000)
  }

  const formatMC = (mc: number) => {
    if (mc >= 1e9) return `$${(mc / 1e9).toFixed(2)}B`
    if (mc >= 1e6) return `$${(mc / 1e6).toFixed(2)}M`
    if (mc >= 1e3) return `$${(mc / 1e3).toFixed(0)}K`
    return `$${mc.toFixed(2)}`
  }

  const totalVolume = tokens.reduce((sum, t) => sum + t.volume24h, 0)
  const totalMC = tokens.reduce((sum, t) => sum + t.marketCap, 0)
  const avgChange = tokens.length ? tokens.reduce((sum, t) => sum + t.priceChange24h, 0) / tokens.length : 0
  const boostedCount = tokens.filter((t) => t.boosts > 0).length

  return (
    <>
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Trending Tokens</h1>
        <p className="text-muted-foreground">Top performing Solana tokens by volume and momentum</p>
      </div>

      {/* Stats Row */}
      <div className="mb-6 grid grid-cols-4 gap-4">
        <StatsCard
          title="Total Volume"
          value={formatMC(totalVolume)}
          subtitle="Combined 24h"
          icon={<DollarSign className="h-5 w-5" />}
        />
        <StatsCard
          title="Total MC"
          value={formatMC(totalMC)}
          subtitle="Market cap"
          icon={<BarChart3 className="h-5 w-5" />}
        />
        <StatsCard
          title="Avg Change"
          value={`${avgChange >= 0 ? "+" : ""}${avgChange.toFixed(1)}%`}
          subtitle="Price movement"
          icon={<Activity className="h-5 w-5" />}
        />
        <StatsCard
          title="Boosted"
          value={boostedCount.toString()}
          subtitle="DEX promoted"
          icon={<Zap className="h-5 w-5" />}
        />
      </div>

      {/* Timeframe Filter */}
      <div className="mb-4 flex gap-2">
        {(["1h", "6h", "24h"] as const).map((tf) => (
          <button
            key={tf}
            onClick={() => setTimeframe(tf)}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
              timeframe === tf
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground",
            )}
          >
            {tf}
          </button>
        ))}
      </div>

      {/* Token Feed */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Trending Now</h2>
              <p className="text-xs text-muted-foreground">Sorted by volume and momentum</p>
            </div>
          </div>
          <Badge variant="outline" className="border-primary/30 text-primary">
            <Flame className="mr-1 h-3 w-3" />
            {tokens.length} tokens
          </Badge>
        </div>

        <div className="divide-y divide-border/50">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          )}

          {!isLoading && tokens.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <TrendingUp className="h-12 w-12 mb-4 opacity-50" />
              <p>No trending tokens found</p>
              <p className="text-xs">Check back in a moment</p>
            </div>
          )}

          {tokens.map((token, i) => (
            <div
              key={token.address}
              onClick={() => router.push(`/token/${token.address}`)}
              className="flex cursor-pointer items-center gap-4 px-5 py-4 transition-colors hover:bg-secondary/30"
            >
              {/* Rank + Logo */}
              <div className="relative">
                {token.logoURI ? (
                  <Image
                    src={token.logoURI || "/placeholder.svg"}
                    alt={token.symbol}
                    width={48}
                    height={48}
                    className="rounded-lg"
                    unoptimized
                    onError={(e) => {
                      e.currentTarget.src = "/digital-token.png"
                    }}
                  />
                ) : (
                  <div
                    className={cn(
                      "flex h-12 w-12 items-center justify-center rounded-lg text-lg font-bold",
                      i === 0
                        ? "bg-primary/20 text-primary"
                        : i === 1
                          ? "bg-[var(--success)]/20 text-[var(--success)]"
                          : "bg-secondary text-foreground",
                    )}
                  >
                    {token.symbol?.slice(0, 2)}
                  </div>
                )}
                <span
                  className={cn(
                    "absolute -left-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ring-2 ring-background",
                    i === 0
                      ? "bg-primary text-primary-foreground"
                      : i === 1
                        ? "bg-[var(--success)] text-white"
                        : i === 2
                          ? "bg-chart-4 text-white"
                          : "bg-secondary text-foreground",
                  )}
                >
                  {i + 1}
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">{token.symbol}</span>
                  <span className="truncate text-sm text-muted-foreground">{token.name}</span>
                  {token.boosts > 0 && (
                    <Badge className="bg-primary/20 text-primary text-[10px]">
                      <Zap className="mr-0.5 h-3 w-3" />
                      Boosted
                    </Badge>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <code className="font-mono text-xs text-muted-foreground">
                    {token.address.slice(0, 6)}...{token.address.slice(-4)}
                  </code>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      copyToClipboard(token.address)
                    }}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                  >
                    {copiedCA === token.address ? (
                      <CheckCheck className="h-3.5 w-3.5 text-[var(--success)]" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      window.open(token.dexUrl, "_blank")
                    }}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-6 text-right text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Market Cap</div>
                  <div className="font-medium text-foreground">{formatMC(token.marketCap)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Volume 24h</div>
                  <div className="font-medium text-foreground">{formatMC(token.volume24h)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Change</div>
                  <div
                    className={cn(
                      "font-semibold",
                      token.priceChange24h >= 0 ? "text-[var(--success)]" : "text-destructive",
                    )}
                  >
                    {token.priceChange24h >= 0 ? "+" : ""}
                    {token.priceChange24h.toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
