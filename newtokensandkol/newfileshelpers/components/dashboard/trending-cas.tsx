"use client"

import type React from "react"

import useSWR from "swr"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Flame, Copy, CheckCheck, ExternalLink, TrendingUp } from "lucide-react"

interface TrendingCA {
  address: string
  symbol: string
  name: string
  logoURI: string | null
  mentionCount: number
  uniqueAccounts: number
  marketCap: number
  priceChange24h: number
  firstSeen: string
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function TrendingCAs() {
  const router = useRouter()
  const [copiedCA, setCopiedCA] = useState<string | null>(null)

  const { data, isLoading } = useSWR<{ tokens: TrendingCA[] }>("/api/tokens/trending-cas", fetcher, {
    refreshInterval: 30000,
  })

  const tokens = data?.tokens || []

  const copyToClipboard = async (ca: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await navigator.clipboard.writeText(ca)
    setCopiedCA(ca)
    setTimeout(() => setCopiedCA(null), 2000)
  }

  const formatMC = (mc: number) => {
    if (mc >= 1e9) return `$${(mc / 1e9).toFixed(2)}B`
    if (mc >= 1e6) return `$${(mc / 1e6).toFixed(2)}M`
    if (mc >= 1e3) return `$${(mc / 1e3).toFixed(0)}K`
    return `$${mc.toFixed(0)}`
  }

  return (
    <div className="rounded-lg border border-border bg-card h-full flex flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-orange-500/10 p-2">
            <Flame className="h-4 w-4 text-orange-500" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Trending CAs</h2>
            <p className="text-[10px] text-muted-foreground">Multiple mentions</p>
          </div>
        </div>
        {tokens.length > 0 && (
          <Badge variant="outline" className="text-[10px] border-orange-500/30 text-orange-500">
            {tokens.length} trending
          </Badge>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}

        {!isLoading && tokens.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Flame className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-xs">No trending CAs yet</p>
          </div>
        )}

        {tokens.map((token, index) => (
          <div
            key={token.address}
            onClick={() => router.push(`/token/${token.address}`)}
            className="flex items-center gap-3 border-b border-border/50 px-4 py-3 cursor-pointer transition-colors hover:bg-secondary/30"
          >
            <div className="relative flex-shrink-0">
              <Image
                src={token.logoURI || "/digital-token.png"}
                alt={token.symbol}
                width={36}
                height={36}
                className="rounded-lg"
                unoptimized
                onError={(e) => {
                  e.currentTarget.src = "/digital-token.png"
                }}
              />
              <span
                className={cn(
                  "absolute -left-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold",
                  index === 0 ? "bg-orange-500 text-white" : "bg-secondary text-foreground ring-1 ring-border",
                )}
              >
                {index + 1}
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground text-sm">${token.symbol}</span>
                <Badge className="bg-orange-500/20 text-orange-500 text-[9px] px-1.5 py-0">{token.mentionCount}x</Badge>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <code className="font-mono text-[9px] text-muted-foreground">
                  {token.address.slice(0, 4)}...{token.address.slice(-4)}
                </code>
                <button
                  onClick={(e) => copyToClipboard(token.address, e)}
                  className="text-muted-foreground hover:text-foreground"
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
                    window.open(`https://dexscreener.com/solana/${token.address}`, "_blank")
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="h-3 w-3" />
                </button>
              </div>
            </div>

            <div className="text-right">
              <div className="text-xs font-medium text-foreground">{formatMC(token.marketCap)}</div>
              <div
                className={cn(
                  "text-[10px] flex items-center justify-end gap-0.5",
                  token.priceChange24h >= 0 ? "text-[var(--success)]" : "text-destructive",
                )}
              >
                <TrendingUp className="h-2.5 w-2.5" />
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
