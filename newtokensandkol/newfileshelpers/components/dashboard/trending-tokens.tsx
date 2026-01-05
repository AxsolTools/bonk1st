"use client"

import useSWR from "swr"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { TrendingUp, Flame, Copy, CheckCheck, ExternalLink } from "lucide-react"

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

export function TrendingTokens() {
  const [copiedCA, setCopiedCA] = useState<string | null>(null)
  const router = useRouter()

  const { data, isLoading } = useSWR<{ tokens: TrendingToken[] }>("/api/tokens/trending", fetcher, {
    refreshInterval: 20000, // Updated refresh interval from 60s to 20s
  })

  const tokens = data?.tokens || []

  const copyToClipboard = async (ca: string) => {
    await navigator.clipboard.writeText(ca)
    setCopiedCA(ca)
    setTimeout(() => setCopiedCA(null), 2000)
  }

  const formatMC = (mc: number) => {
    if (mc >= 1000000000) return `$${(mc / 1000000000).toFixed(2)}B`
    if (mc >= 1000000) return `$${(mc / 1000000).toFixed(2)}M`
    if (mc >= 1000) return `$${(mc / 1000).toFixed(0)}K`
    return `$${mc.toFixed(2)}`
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <TrendingUp className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Trending Now</h2>
            <p className="text-xs text-muted-foreground">Top volume tokens</p>
          </div>
        </div>
        <Badge variant="outline" className="border-primary/30 text-primary">
          <Flame className="mr-1 h-3 w-3" />
          Live
        </Badge>
      </div>

      <div className="divide-y divide-border/50">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
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
                  width={40}
                  height={40}
                  className="rounded-lg"
                  unoptimized
                />
              ) : (
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-lg text-lg font-bold",
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
              <span className="absolute -left-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-background text-xs font-bold text-foreground ring-1 ring-border">
                {i + 1}
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground">{token.symbol}</span>
                <span className="truncate text-xs text-muted-foreground">{token.name}</span>
                {token.boosts > 0 && <Badge className="bg-primary/20 text-primary text-[10px]">Boosted</Badge>}
              </div>
              <div className="mt-0.5 flex items-center gap-2">
                <code className="font-mono text-[10px] text-muted-foreground">
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
                    <CheckCheck className="h-3 w-3 text-[var(--success)]" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    window.open(token.dexUrl, "_blank")
                  }}
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="h-3 w-3" />
                </button>
              </div>
            </div>

            <div className="text-right">
              <div className="text-sm font-medium text-foreground">{formatMC(token.marketCap)}</div>
              <div
                className={cn(
                  "text-xs font-medium",
                  token.priceChange24h >= 0 ? "text-[var(--success)]" : "text-destructive",
                )}
              >
                {token.priceChange24h >= 0 ? "+" : ""}
                {token.priceChange24h.toFixed(1)}%
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
