"use client"

import useSWR from "swr"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { StatsCard } from "@/components/dashboard/stats-card"
import { cn } from "@/lib/utils"
import {
  Activity,
  Copy,
  CheckCheck,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Minus,
  Gem,
  DollarSign,
  BarChart3,
} from "lucide-react"

interface VolumeGem {
  address: string
  symbol: string
  name: string
  logoURI: string
  volume24h: number
  marketCap: number
  volumeToMC: number
  daysActive: number
  trend: "up" | "down" | "stable"
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function VolumeGemsPage() {
  const [copiedCA, setCopiedCA] = useState<string | null>(null)
  const router = useRouter()
  const { data, isLoading } = useSWR<{ gems: VolumeGem[] }>("/api/tokens/volume-gems", fetcher, {
    refreshInterval: 60000,
  })

  const gems = data?.gems || []

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

  const TrendIcon = ({ trend }: { trend: string }) => {
    if (trend === "up") return <TrendingUp className="h-4 w-4 text-[var(--success)]" />
    if (trend === "down") return <TrendingDown className="h-4 w-4 text-destructive" />
    return <Minus className="h-4 w-4 text-muted-foreground" />
  }

  return (
    <>
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Volume Gems</h1>
        <p className="text-muted-foreground">Tokens with high volume-to-market-cap ratio</p>
      </div>

      {/* Stats Row */}
      <div className="mb-6 grid grid-cols-4 gap-4">
        <StatsCard
          title="Active Gems"
          value={gems.length.toString()}
          subtitle="High vol/mc"
          icon={<Gem className="h-5 w-5" />}
        />
        <StatsCard
          title="Avg Vol/MC"
          value={gems.length ? `${(gems.reduce((a, g) => a + g.volumeToMC, 0) / gems.length).toFixed(2)}x` : "0x"}
          subtitle="Ratio"
          icon={<BarChart3 className="h-5 w-5" />}
        />
        <StatsCard
          title="Total Volume"
          value={formatNumber(gems.reduce((a, g) => a + g.volume24h, 0))}
          subtitle="Combined 24h"
          icon={<DollarSign className="h-5 w-5" />}
        />
        <StatsCard
          title="Trending Up"
          value={gems.filter((g) => g.trend === "up").length.toString()}
          subtitle="Positive momentum"
          icon={<TrendingUp className="h-5 w-5" />}
        />
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-chart-4/20 p-2">
              <Activity className="h-5 w-5 text-chart-4" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">High Vol/MC Plays</h2>
              <p className="text-xs text-muted-foreground">Sorted by volume to market cap ratio</p>
            </div>
          </div>
          <Badge variant="outline">{gems.length} gems</Badge>
        </div>

        <div className="divide-y divide-border/50">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          )}

          {gems.map((gem, i) => (
            <div
              key={gem.address}
              onClick={() => router.push(`/token/${gem.address}`)}
              className="flex cursor-pointer items-center gap-4 px-5 py-4 transition-colors hover:bg-secondary/30"
            >
              <div className="relative">
                <Image
                  src={gem.logoURI || "/placeholder.svg?height=48&width=48&query=crypto gem"}
                  alt={gem.symbol}
                  width={48}
                  height={48}
                  className="rounded-lg"
                  unoptimized
                  onError={(e) => {
                    e.currentTarget.src = "/digital-token.png"
                  }}
                />
                <span className="absolute -left-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-background text-xs font-bold text-foreground ring-1 ring-border">
                  {i + 1}
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{gem.symbol}</span>
                  <span className="truncate text-xs text-muted-foreground">{gem.name}</span>
                  <Badge
                    className={cn(
                      "text-[10px]",
                      gem.volumeToMC >= 1.5
                        ? "bg-[var(--success)]/20 text-[var(--success)]"
                        : "bg-secondary text-foreground",
                    )}
                  >
                    {gem.volumeToMC.toFixed(2)}x vol/mc
                  </Badge>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <code className="font-mono text-[10px] text-muted-foreground">
                    {gem.address.slice(0, 6)}...{gem.address.slice(-4)}
                  </code>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      copyToClipboard(gem.address)
                    }}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                  >
                    {copiedCA === gem.address ? (
                      <CheckCheck className="h-3 w-3 text-[var(--success)]" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      window.open(`https://dexscreener.com/solana/${gem.address}`, "_blank")
                    }}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <TrendIcon trend={gem.trend} />
                <div className="text-right text-xs">
                  <div className="font-medium text-foreground">{formatNumber(gem.volume24h)} vol</div>
                  <div className="text-muted-foreground">{formatNumber(gem.marketCap)} mc</div>
                  <div className="text-muted-foreground">{gem.daysActive}d active</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
