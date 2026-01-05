"use client"

import type React from "react"

import useSWR from "swr"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Activity, Copy, CheckCheck, ExternalLink } from "lucide-react"

interface VolumeGem {
  address: string
  symbol: string
  name: string
  logoURI: string
  volume24h: number
  marketCap: number
  volumeToMC: number
  daysActive: number
  trend: string
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function VolumeGems() {
  const router = useRouter()
  const [copiedCA, setCopiedCA] = useState<string | null>(null)
  const { data, isLoading } = useSWR<{ gems: VolumeGem[] }>("/api/tokens/volume-gems", fetcher, {
    refreshInterval: 20000,
  })

  const gems = data?.gems?.slice(0, 5) || []

  const copyToClipboard = async (e: React.MouseEvent, ca: string) => {
    e.stopPropagation()
    await navigator.clipboard.writeText(ca)
    setCopiedCA(ca)
    setTimeout(() => setCopiedCA(null), 2000)
  }

  const openExternal = (e: React.MouseEvent, url: string) => {
    e.stopPropagation()
    window.open(url, "_blank", "noopener,noreferrer")
  }

  const formatMC = (mc: number) => {
    if (mc >= 1000000) return `$${(mc / 1000000).toFixed(2)}M`
    if (mc >= 1000) return `$${(mc / 1000).toFixed(0)}K`
    return `$${mc}`
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-chart-4/20 p-2">
            <Activity className="h-5 w-5 text-chart-4" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Volume Gems</h2>
            <p className="text-xs text-muted-foreground">High vol/MC ratio plays</p>
          </div>
        </div>
        <button onClick={() => router.push("/volume")} className="text-xs text-primary hover:underline">
          View all
        </button>
      </div>

      <div className="divide-y divide-border/50">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
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
                src={gem.logoURI || "/digital-token.png"}
                alt={gem.symbol}
                width={32}
                height={32}
                className="rounded-lg"
                unoptimized
                onError={(e) => {
                  e.currentTarget.src = "/digital-token.png"
                }}
              />
              <span className="absolute -left-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-background text-[10px] font-bold text-foreground ring-1 ring-border">
                {i + 1}
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground">{gem.symbol}</span>
                <Badge
                  className={cn(
                    "text-[10px]",
                    gem.volumeToMC >= 1.5 ? "bg-green-500/20 text-green-500" : "bg-secondary text-foreground",
                  )}
                >
                  {gem.volumeToMC.toFixed(2)}x
                </Badge>
              </div>
              <div className="mt-0.5 flex items-center gap-2">
                <code className="font-mono text-[10px] text-muted-foreground">
                  {gem.address.slice(0, 6)}...{gem.address.slice(-4)}
                </code>
                <button
                  onClick={(e) => copyToClipboard(e, gem.address)}
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                >
                  {copiedCA === gem.address ? (
                    <CheckCheck className="h-3 w-3 text-green-500" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </button>
                <button
                  onClick={(e) => openExternal(e, `https://dexscreener.com/solana/${gem.address}`)}
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="h-3 w-3" />
                </button>
              </div>
            </div>

            <div className="text-right text-xs">
              <div className="text-foreground">{formatMC(gem.volume24h)} vol</div>
              <div className="text-muted-foreground">{formatMC(gem.marketCap)} mc</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
