"use client"

import type React from "react"

import useSWR from "swr"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Zap, Copy, CheckCheck, ExternalLink, Heart, Repeat, MessageCircle } from "lucide-react"

interface EngagementToken {
  address: string
  symbol: string
  name: string
  logoURI: string | null
  engagementScore: number
  totalLikes: number
  totalRetweets: number
  totalReplies: number
  tweetCount: number
  topInfluencer: string
  marketCap: number
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function EngagementTracker() {
  const router = useRouter()
  const [copiedCA, setCopiedCA] = useState<string | null>(null)

  const { data, isLoading } = useSWR<{ tokens: EngagementToken[] }>("/api/tokens/engagement", fetcher, {
    refreshInterval: 30000,
  })

  const tokens = data?.tokens || []

  const copyToClipboard = async (ca: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await navigator.clipboard.writeText(ca)
    setCopiedCA(ca)
    setTimeout(() => setCopiedCA(null), 2000)
  }

  const formatNumber = (n: number) => {
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
    return n.toString()
  }

  return (
    <div className="rounded-lg border border-border bg-card h-full flex flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-yellow-500/10 p-2">
            <Zap className="h-4 w-4 text-yellow-500" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Engagement</h2>
            <p className="text-[10px] text-muted-foreground">Highest social activity</p>
          </div>
        </div>
        {tokens.length > 0 && (
          <Badge variant="outline" className="text-[10px] border-yellow-500/30 text-yellow-500">
            {tokens.length} active
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
            <Zap className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-xs">No engagement data yet</p>
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
                  index === 0 ? "bg-yellow-500 text-black" : "bg-secondary text-foreground ring-1 ring-border",
                )}
              >
                {index + 1}
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground text-sm">${token.symbol}</span>
                <Badge className="bg-yellow-500/20 text-yellow-600 text-[9px] px-1.5 py-0">
                  {formatNumber(token.engagementScore)} score
                </Badge>
              </div>
              <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-0.5">
                  <Heart className="h-2.5 w-2.5" />
                  {formatNumber(token.totalLikes)}
                </span>
                <span className="flex items-center gap-0.5">
                  <Repeat className="h-2.5 w-2.5" />
                  {formatNumber(token.totalRetweets)}
                </span>
                <span className="flex items-center gap-0.5">
                  <MessageCircle className="h-2.5 w-2.5" />
                  {formatNumber(token.totalReplies)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={(e) => copyToClipboard(token.address, e)}
                className="p-1 text-muted-foreground hover:text-foreground rounded"
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
                  window.open(`https://dexscreener.com/solana/${token.address}`, "_blank")
                }}
                className="p-1 text-muted-foreground hover:text-foreground rounded"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
