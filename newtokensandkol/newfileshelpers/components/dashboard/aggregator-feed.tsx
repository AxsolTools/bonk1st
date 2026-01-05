"use client"

import useSWR from "swr"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { DEFAULT_AGGREGATORS } from "@/lib/aggregator"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Zap, Copy, CheckCheck, ExternalLink } from "lucide-react"

interface AggregatorMatch {
  tokenAddress: string
  tokenSymbol: string
  tokenName: string
  logoURI: string
  timestamp: string
  matchedFilters: string[]
  data: {
    marketCap: number
    volume24h: number
    liquidity: number
    holders: number
    ageMinutes: number
    groupHits: number
    socialScore: number
    freshWallets: number
    dexPaid: boolean
  }
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function AggregatorFeed() {
  const [copiedCA, setCopiedCA] = useState<string | null>(null)
  const router = useRouter()

  const { data, isLoading } = useSWR<{ matches: AggregatorMatch[] }>("/api/aggregator/matches", fetcher, {
    refreshInterval: 30000,
  })

  const matches = data?.matches || []

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

  const formatMC = (mc: number) => {
    if (mc >= 1000000) return `$${(mc / 1000000).toFixed(2)}M`
    if (mc >= 1000) return `$${(mc / 1000).toFixed(0)}K`
    return `$${mc}`
  }

  const getFilterName = (id: string) => {
    return DEFAULT_AGGREGATORS.find((a) => a.id === id)?.name || id
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-[var(--success)]/10 p-2">
            <Zap className="h-5 w-5 text-[var(--success)]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Aggregator Matches</h2>
            <p className="text-xs text-muted-foreground">Tokens matching your filters</p>
          </div>
        </div>
        <Badge variant="outline" className="border-[var(--success)]/30 text-[var(--success)]">
          {matches.length} active
        </Badge>
      </div>

      <div className="max-h-[400px] divide-y divide-border/50 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}

        {matches.map((match, i) => (
          <div
            key={`${match.tokenAddress}-${i}`}
            onClick={() => router.push(`/token/${match.tokenAddress}`)}
            className="block cursor-pointer px-5 py-4 transition-colors hover:bg-secondary/30"
          >
            <div className="flex items-start gap-4">
              <Image
                src={match.logoURI || "/placeholder.svg"}
                alt={match.tokenSymbol}
                width={40}
                height={40}
                className="rounded-lg"
                unoptimized
                onError={(e) => {
                  e.currentTarget.src = "/digital-token.png"
                }}
              />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold text-primary">{match.tokenSymbol}</span>
                  <span className="truncate text-xs text-muted-foreground">{match.tokenName}</span>
                  <span className="text-xs text-muted-foreground">{formatTime(match.timestamp)}</span>
                </div>

                <div className="mt-1 flex items-center gap-2">
                  <code className="font-mono text-xs text-muted-foreground">
                    {match.tokenAddress.slice(0, 8)}...{match.tokenAddress.slice(-6)}
                  </code>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      copyToClipboard(match.tokenAddress)
                    }}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                  >
                    {copiedCA === match.tokenAddress ? (
                      <CheckCheck className="h-3 w-3 text-[var(--success)]" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      window.open(`https://dexscreener.com/solana/${match.tokenAddress}`, "_blank")
                    }}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </button>
                </div>

                <div className="mt-2 flex flex-wrap gap-1">
                  {match.matchedFilters.map((f) => (
                    <Badge key={f} className="bg-primary/20 text-primary text-[10px]">
                      {getFilterName(f)}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-right text-xs">
                <div>
                  <span className="text-muted-foreground">MC:</span>{" "}
                  <span className="text-foreground">{formatMC(match.data.marketCap)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Vol:</span>{" "}
                  <span className="text-foreground">{formatMC(match.data.volume24h)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Holders:</span>{" "}
                  <span className="text-foreground">{match.data.holders}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Age:</span>{" "}
                  <span className="text-foreground">{match.data.ageMinutes}m</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Groups:</span>{" "}
                  <span className={cn(match.data.groupHits >= 2 ? "text-primary" : "text-foreground")}>
                    {match.data.groupHits}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Social:</span>{" "}
                  <span className={cn(match.data.socialScore >= 70 ? "text-[var(--success)]" : "text-foreground")}>
                    {match.data.socialScore}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
