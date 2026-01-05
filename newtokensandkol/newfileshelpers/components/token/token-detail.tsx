"use client"

import type React from "react"

import useSWR from "swr"
import Image from "next/image"
import Link from "next/link"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  ArrowLeft,
  Copy,
  CheckCheck,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Users,
  Droplets,
  Activity,
  Globe,
  Twitter,
  MessageCircle,
} from "lucide-react"

interface TokenData {
  address: string
  symbol: string
  name: string
  logoURI: string | null
  price: number
  priceChange24h: number
  volume24h: number
  marketCap: number
  liquidity: number
  holders: number
  txns24h: { buys: number; sells: number }
  pairAddress: string
  dexUrl: string
  socials: { type: string; url: string }[]
  websites: { label: string; url: string }[]
  boosts: number
  createdAt: string | null
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function TokenDetail({ address }: { address: string }) {
  const [copiedCA, setCopiedCA] = useState(false)

  const { data, isLoading, error } = useSWR<{ token: TokenData }>(`/api/tokens/${address}`, fetcher, {
    refreshInterval: 30000,
  })

  const token = data?.token

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(address)
    setCopiedCA(true)
    setTimeout(() => setCopiedCA(false), 2000)
  }

  const formatMC = (mc: number) => {
    if (mc >= 1000000000) return `$${(mc / 1000000000).toFixed(2)}B`
    if (mc >= 1000000) return `$${(mc / 1000000).toFixed(2)}M`
    if (mc >= 1000) return `$${(mc / 1000).toFixed(0)}K`
    return `$${mc.toFixed(2)}`
  }

  const formatPrice = (price: number) => {
    if (price < 0.00001) return `$${price.toExponential(2)}`
    if (price < 1) return `$${price.toFixed(6)}`
    return `$${price.toFixed(2)}`
  }

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    e.currentTarget.src = "/digital-token.png"
  }

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Dashboard
      </Link>

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
          <p className="text-destructive">Failed to load token data</p>
        </div>
      )}

      {token && (
        <div className="space-y-6">
          {/* Token Header */}
          <div className="rounded-lg border border-border bg-card p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-center gap-4">
                <Image
                  src={token.logoURI || "/digital-token.png"}
                  alt={token.symbol}
                  width={64}
                  height={64}
                  className="rounded-xl"
                  unoptimized
                  onError={handleImageError}
                />
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <h1 className="text-2xl font-bold text-foreground">{token.symbol || "???"}</h1>
                    <span className="text-lg text-muted-foreground">{token.name || "Unknown"}</span>
                    {token.boosts > 0 && <Badge className="bg-primary/20 text-primary">Boosted</Badge>}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <code className="rounded bg-secondary px-3 py-1 font-mono text-sm text-muted-foreground">
                      {address.slice(0, 12)}...{address.slice(-12)}
                    </code>
                    <button
                      onClick={copyToClipboard}
                      className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                    >
                      {copiedCA ? (
                        <CheckCheck className="h-4 w-4 text-[var(--success)]" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {token.dexUrl && (
                  <Button asChild variant="outline" size="sm">
                    <a href={token.dexUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      DexScreener
                    </a>
                  </Button>
                )}
                <Button asChild size="sm">
                  <a href={`https://jup.ag/swap/SOL-${address}`} target="_blank" rel="noopener noreferrer">
                    Trade on Jupiter
                  </a>
                </Button>
              </div>
            </div>
          </div>

          {/* Price + Stats Grid - 2x2 on mobile, 4 cols on desktop */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-lg border border-border bg-card p-5">
              <p className="text-sm text-muted-foreground">Price</p>
              <p className="mt-1 text-xl font-bold text-foreground">{formatPrice(token.price)}</p>
              <div
                className={cn(
                  "mt-1 flex items-center gap-1 text-sm",
                  token.priceChange24h >= 0 ? "text-[var(--success)]" : "text-destructive",
                )}
              >
                {token.priceChange24h >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                {token.priceChange24h >= 0 ? "+" : ""}
                {token.priceChange24h.toFixed(2)}%
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-5">
              <p className="text-sm text-muted-foreground">Market Cap</p>
              <p className="mt-1 text-xl font-bold text-foreground">{formatMC(token.marketCap)}</p>
              <p className="mt-1 text-sm text-muted-foreground">FDV</p>
            </div>

            <div className="rounded-lg border border-border bg-card p-5">
              <p className="text-sm text-muted-foreground">Volume (24h)</p>
              <p className="mt-1 text-xl font-bold text-foreground">{formatMC(token.volume24h)}</p>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="text-[var(--success)]">{token.txns24h.buys} buys</span>
                <span className="text-destructive">{token.txns24h.sells} sells</span>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-5">
              <p className="text-sm text-muted-foreground">Liquidity</p>
              <p className="mt-1 text-xl font-bold text-foreground">{formatMC(token.liquidity)}</p>
              <div className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                <Droplets className="h-4 w-4" />
                Pooled
              </div>
            </div>
          </div>

          {/* Additional Info - 3 cols */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Users className="h-5 w-5" />
                <span>Holders</span>
              </div>
              <p className="mt-2 text-xl font-bold text-foreground">{token.holders.toLocaleString()}</p>
            </div>

            <div className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Activity className="h-5 w-5" />
                <span>24h Transactions</span>
              </div>
              <p className="mt-2 text-xl font-bold text-foreground">
                {(token.txns24h.buys + token.txns24h.sells).toLocaleString()}
              </p>
            </div>

            <div className="rounded-lg border border-border bg-card p-5">
              <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                <Globe className="h-5 w-5" />
                <span>Links</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {token.websites?.length > 0
                  ? token.websites.map((site, i) => (
                      <a
                        key={i}
                        href={site.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-1 text-xs text-foreground hover:bg-secondary/80 transition-colors"
                      >
                        <Globe className="h-3 w-3" />
                        {site.label || "Website"}
                      </a>
                    ))
                  : null}
                {token.socials?.length > 0
                  ? token.socials.map((social, i) => (
                      <a
                        key={i}
                        href={social.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-1 text-xs text-foreground hover:bg-secondary/80 transition-colors"
                      >
                        {social.type === "twitter" && <Twitter className="h-3 w-3" />}
                        {social.type === "telegram" && <MessageCircle className="h-3 w-3" />}
                        {social.type.charAt(0).toUpperCase() + social.type.slice(1)}
                      </a>
                    ))
                  : null}
                {!token.websites?.length && !token.socials?.length && (
                  <span className="text-sm text-muted-foreground">No links available</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
