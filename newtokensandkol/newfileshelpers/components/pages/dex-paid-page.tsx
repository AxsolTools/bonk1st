"use client"

import type React from "react"
import useSWR from "swr"
import { useRouter } from "next/navigation"
import { useState, useEffect } from "react"
import { Badge } from "@/components/ui/badge"
import { Zap, Copy, CheckCheck, ExternalLink, RefreshCw, TrendingUp, TrendingDown, Clock, Trophy } from "lucide-react"

interface BoostedToken {
  address: string
  chainId: string
  symbol: string
  name: string
  logoURI: string | null
  description: string | null
  boosts: number
  dexUrl: string
  links: Array<{ type: string; label: string; url: string }>
  price: number
  marketCap: number
  volume24h: number
  liquidity: number
  priceChange: number
  boostedAt?: number
}

interface ApiResponse {
  topBoosts: BoostedToken[]
  latestBoosts: BoostedToken[]
  timestamp: number
}

const fetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error("Failed to fetch")
  return res.json()
}

const STORAGE_KEY = "vexorscan_dex_paid"

function getGradientForAddress(address: string): string {
  const hash = address.split("").reduce((acc, char) => char.charCodeAt(0) + ((acc << 5) - acc), 0)
  const h1 = Math.abs(hash) % 360
  const h2 = (h1 + 40) % 360
  return `linear-gradient(135deg, hsl(${h1}, 70%, 40%), hsl(${h2}, 60%, 30%))`
}

export function DexPaidPage() {
  const router = useRouter()
  const [copiedCA, setCopiedCA] = useState<string | null>(null)
  const [cachedData, setCachedData] = useState<ApiResponse | null>(null)
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set())

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed.topBoosts && Date.now() - parsed.timestamp < 2 * 60 * 1000) {
          setCachedData(parsed)
        }
      }
    } catch {}
  }, [])

  const { data, isLoading, error, mutate } = useSWR<ApiResponse>("/api/tokens/boosted", fetcher, {
    refreshInterval: 30000, // 30 seconds - balanced between real-time and rate limits
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    dedupingInterval: 10000, // Prevent duplicate requests within 10s
    onSuccess: (data) => {
      if (data?.topBoosts?.length || data?.latestBoosts?.length) {
        setCachedData(data)
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, timestamp: Date.now() }))
      }
    },
  })

  const topBoosts = data?.topBoosts?.length ? data.topBoosts : cachedData?.topBoosts || []
  const latestBoosts = data?.latestBoosts?.length ? data.latestBoosts : cachedData?.latestBoosts || []

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

  const formatNumber = (n: number) => {
    if (!n || n === 0) return "$0"
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
    if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
    if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
    return `$${n.toFixed(2)}`
  }

  const handleImageError = (address: string) => {
    setFailedImages((prev) => new Set(prev).add(address))
  }

  const TokenLogo = ({ token }: { token: BoostedToken }) => {
    const [imgError, setImgError] = useState(false)
    const [triedCdn, setTriedCdn] = useState(false)

    const cdnUrl = `https://dd.dexscreener.com/ds-data/tokens/solana/${token.address}.png`

    // If original failed, try CDN. If CDN failed, show gradient
    const currentSrc = imgError ? (triedCdn ? null : cdnUrl) : token.logoURI || cdnUrl

    if (!currentSrc || failedImages.has(token.address)) {
      return (
        <div
          className="h-full w-full flex items-center justify-center text-white font-bold text-xs"
          style={{ background: getGradientForAddress(token.address) }}
        >
          {token.symbol.slice(0, 2).toUpperCase()}
        </div>
      )
    }

    return (
      <img
        src={currentSrc || "/placeholder.svg"}
        alt={token.symbol}
        className="h-full w-full object-cover"
        onError={() => {
          if (!imgError) {
            setImgError(true)
          } else if (!triedCdn) {
            setTriedCdn(true)
            handleImageError(token.address)
          }
        }}
      />
    )
  }

  const TokenRow = ({ token, index, showRank = true }: { token: BoostedToken; index: number; showRank?: boolean }) => (
    <div
      key={`${token.address}-${index}`}
      onClick={() => router.push(`/token/${token.address}`)}
      className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/30"
    >
      {showRank && (
        <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
          {index + 1}
        </div>
      )}

      <div className="relative h-9 w-9 flex-shrink-0 overflow-hidden rounded-lg">
        <TokenLogo token={token} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground text-sm">${token.symbol}</span>
          <span className="truncate text-xs text-muted-foreground">{token.name}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <code className="rounded bg-secondary/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {token.address.slice(0, 6)}...{token.address.slice(-4)}
          </code>
          <button
            onClick={(e) => copyToClipboard(e, token.address)}
            className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            {copiedCA === token.address ? (
              <CheckCheck className="h-3 w-3 text-green-500" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </button>
          <button
            onClick={(e) => openExternal(e, token.dexUrl)}
            className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <ExternalLink className="h-3 w-3" />
          </button>
        </div>
      </div>

      <div className="flex flex-shrink-0 items-center gap-2">
        {token.marketCap > 0 && (
          <div className="hidden text-right text-xs sm:block">
            <div className="font-medium text-foreground">{formatNumber(token.marketCap)}</div>
            <div className="text-muted-foreground">{formatNumber(token.volume24h)} vol</div>
          </div>
        )}

        {token.priceChange !== 0 && (
          <div
            className={`hidden items-center gap-0.5 text-xs sm:flex ${token.priceChange >= 0 ? "text-green-500" : "text-red-500"}`}
          >
            {token.priceChange >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(token.priceChange).toFixed(1)}%
          </div>
        )}

        <Badge className="bg-primary/20 text-primary text-xs">
          <Zap className="mr-0.5 h-2.5 w-2.5" />
          {token.boosts.toLocaleString()}
        </Badge>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">DEX Paid Alerts</h1>
        <p className="text-muted-foreground">Tokens that paid for promotion on DEX platforms</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Active Boosts</div>
          <div className="mt-1 text-2xl font-bold text-primary">{topBoosts.length + latestBoosts.length}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Total Boost Value</div>
          <div className="mt-1 text-2xl font-bold text-foreground">
            {[...topBoosts, ...latestBoosts].reduce((sum, t) => sum + (t.boosts || 0), 0).toLocaleString()}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">New Boosts</div>
          <div className="mt-1 text-2xl font-bold text-yellow-500">{latestBoosts.length}</div>
          <div className="text-xs text-muted-foreground">Real-time</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Data Status</div>
          <div className="mt-1 flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${error ? "bg-red-500" : "bg-green-500"} ${!error ? "animate-pulse" : ""}`}
            />
            <span className="text-sm text-foreground">{error ? "Cached" : "Live"}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Latest Boosts - Real-time new paids */}
        <div className="rounded-lg border border-yellow-500/30 bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-yellow-500/20 p-2">
                <Clock className="h-4 w-4 text-yellow-500" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">New Paids</h2>
                <p className="text-xs text-muted-foreground">Real-time boost activity</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
              </span>
              <Badge variant="outline" className="text-yellow-500 border-yellow-500/30">
                {latestBoosts.length} new
              </Badge>
            </div>
          </div>

          <div className="divide-y divide-border/50 max-h-[600px] overflow-y-auto">
            {isLoading && latestBoosts.length === 0 && (
              <div className="flex items-center justify-center py-12">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-yellow-500 border-t-transparent" />
              </div>
            )}

            {latestBoosts.length === 0 && !isLoading && (
              <div className="py-12 text-center text-muted-foreground text-sm">No new boosts detected</div>
            )}

            {latestBoosts.map((token, i) => (
              <TokenRow key={token.address} token={token} index={i} showRank={false} />
            ))}
          </div>
        </div>

        {/* Top Boosted - Highest boost amounts */}
        <div className="rounded-lg border border-primary/30 bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/20 p-2">
                <Trophy className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">Top Boosted</h2>
                <p className="text-xs text-muted-foreground">Highest boost amounts</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => mutate()}
                className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
              </button>
              <Badge variant="outline" className="text-primary">
                {topBoosts.length} active
              </Badge>
            </div>
          </div>

          <div className="divide-y divide-border/50 max-h-[600px] overflow-y-auto">
            {isLoading && topBoosts.length === 0 && (
              <div className="flex items-center justify-center py-12">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            )}

            {topBoosts.length === 0 && !isLoading && (
              <div className="py-12 text-center text-muted-foreground text-sm">No boosted tokens found</div>
            )}

            {topBoosts.map((token, i) => (
              <TokenRow key={token.address} token={token} index={i} showRank={true} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
