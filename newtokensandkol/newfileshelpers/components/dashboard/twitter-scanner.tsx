"use client"

import type React from "react"
import { useEffect, useState, useCallback } from "react"
import useSWR from "swr"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  Search,
  RefreshCw,
  ExternalLink,
  Copy,
  CheckCheck,
  Twitter,
  Flame,
  Clock,
  TrendingUp,
  Users,
} from "lucide-react"

interface TokenData {
  address: string
  symbol: string
  name: string
  logoURI: string | null
  price: number
  marketCap: number
  volume24h: number
  liquidity: number
  priceChange24h: number
}

interface TweetData {
  id: string
  text: string
  author: string
  authorHandle: string
  authorAvatar: string
  authorFollowers: number
  timestamp: string
  likes: number
  retweets: number
  replies: number
  contractAddresses: string[]
  url: string
  engagementScore: number
  token: TokenData
  isNew?: boolean
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function TwitterScanner() {
  const router = useRouter()
  const [isScanning, setIsScanning] = useState(true)
  const [countdown, setCountdown] = useState(15)
  const [copiedCA, setCopiedCA] = useState<string | null>(null)
  const [allTweets, setAllTweets] = useState<TweetData[]>([])
  const [newTweetIds, setNewTweetIds] = useState<Set<string>>(new Set())

  const { data, mutate, isValidating } = useSWR<{ tweets: TweetData[]; timestamp: number }>(
    isScanning ? "/api/twitter/scan" : null,
    fetcher,
    {
      refreshInterval: 15000,
      revalidateOnFocus: false,
    },
  )

  useEffect(() => {
    if (data?.tweets) {
      setAllTweets((prev) => {
        const existingIds = new Set(prev.map((t) => t.id))
        const newTweets = data.tweets.filter((t) => !existingIds.has(t.id))

        if (newTweets.length > 0) {
          const newIds = new Set(newTweets.map((t) => t.id))
          setNewTweetIds((prevIds) => new Set([...prevIds, ...newIds]))

          setTimeout(() => {
            setNewTweetIds((prevIds) => {
              const updated = new Set(prevIds)
              newIds.forEach((id) => updated.delete(id))
              return updated
            })
          }, 30000)
        }

        return [...newTweets.map((t) => ({ ...t, isNew: true })), ...prev].slice(0, 100)
      })
    }
  }, [data])

  useEffect(() => {
    if (!isScanning) return
    const interval = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? 15 : prev - 1))
    }, 1000)
    return () => clearInterval(interval)
  }, [isScanning])

  const copyToClipboard = useCallback(async (ca: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    await navigator.clipboard.writeText(ca)
    setCopiedCA(ca)
    setTimeout(() => setCopiedCA(null), 2000)
  }, [])

  const navigateToToken = useCallback(
    (address: string) => {
      router.push(`/token/${address}`)
    },
    [router],
  )

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const diff = Math.floor((Date.now() - date.getTime()) / 1000)
    if (diff < 60) return `${diff}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    return `${Math.floor(diff / 3600)}h ago`
  }

  const formatMC = (mc: number) => {
    if (mc >= 1000000000) return `$${(mc / 1000000000).toFixed(2)}B`
    if (mc >= 1000000) return `$${(mc / 1000000).toFixed(2)}M`
    if (mc >= 1000) return `$${(mc / 1000).toFixed(0)}K`
    return `$${mc.toFixed(2)}`
  }

  const truncateText = (text: string, maxLength = 140) => {
    if (text.length <= maxLength) return text
    return text.slice(0, maxLength).trim() + "..."
  }

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    e.currentTarget.src = "/digital-token.png"
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Search className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Twitter CA Scanner</h2>
            <p className="text-xs text-muted-foreground">Scanning every 15s for new token CAs</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-1.5">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                isScanning ? "animate-pulse bg-[var(--success)]" : "bg-destructive",
              )}
            />
            <span className="text-xs font-medium text-foreground">
              {isValidating ? "Scanning..." : isScanning ? "Active" : "Paused"}
            </span>
          </div>

          <div className="flex items-center gap-1 rounded bg-secondary/50 px-2 py-1">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="font-mono text-sm font-medium text-primary">{countdown}s</span>
          </div>

          <Button variant="outline" size="sm" onClick={() => setIsScanning(!isScanning)}>
            <RefreshCw className={cn("mr-2 h-4 w-4", isValidating && "animate-spin")} />
            {isScanning ? "Pause" : "Resume"}
          </Button>
        </div>
      </div>

      <div className="max-h-[600px] divide-y divide-border/50 overflow-y-auto">
        {allTweets.length === 0 && !isValidating && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Twitter className="mb-3 h-10 w-10" />
            <p className="font-medium">Scanning for token mentions...</p>
            <p className="mt-1 text-sm">New CAs will appear here</p>
          </div>
        )}

        {allTweets.map((tweet) => {
          const isNew = newTweetIds.has(tweet.id)

          return (
            <div
              key={tweet.id}
              onClick={() => navigateToToken(tweet.token.address)}
              className={cn("cursor-pointer p-4 transition-all hover:bg-secondary/30", isNew && "bg-primary/5")}
            >
              <div className="flex gap-4">
                {/* Token Image */}
                <div className="relative flex-shrink-0">
                  <div
                    className={cn(
                      "relative h-14 w-14 overflow-hidden rounded-xl bg-secondary",
                      isNew && "ring-2 ring-primary ring-offset-2 ring-offset-background",
                    )}
                  >
                    <Image
                      src={tweet.token.logoURI || "/digital-token.png"}
                      alt={tweet.token.symbol || "Token"}
                      width={56}
                      height={56}
                      className="h-full w-full object-cover"
                      unoptimized
                      onError={handleImageError}
                    />
                  </div>
                  {isNew && (
                    <div className="absolute -right-1 -top-1 flex items-center gap-0.5 rounded-full bg-primary px-1.5 py-0.5 shadow-lg">
                      <Flame className="h-3 w-3 text-primary-foreground" />
                      <span className="text-[10px] font-bold text-primary-foreground">NEW</span>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  {/* Token Info Row */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-bold text-foreground">${tweet.token.symbol || "???"}</span>
                    <span className="text-sm text-muted-foreground">{tweet.token.name || "Unknown"}</span>
                    {tweet.token.marketCap > 0 && (
                      <Badge variant="outline" className="font-mono text-xs">
                        {formatMC(tweet.token.marketCap)}
                      </Badge>
                    )}
                    {tweet.token.priceChange24h !== 0 && (
                      <span
                        className={cn(
                          "flex items-center gap-0.5 text-xs font-semibold",
                          tweet.token.priceChange24h >= 0 ? "text-[var(--success)]" : "text-destructive",
                        )}
                      >
                        <TrendingUp className="h-3 w-3" />
                        {tweet.token.priceChange24h >= 0 ? "+" : ""}
                        {tweet.token.priceChange24h.toFixed(1)}%
                      </span>
                    )}
                  </div>

                  {/* Tweet Preview */}
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{truncateText(tweet.text)}</p>

                  {/* Contract Address */}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <code className="rounded-md bg-secondary px-2.5 py-1 font-mono text-xs text-primary">
                      {tweet.token.address.slice(0, 8)}...{tweet.token.address.slice(-8)}
                    </code>
                    <button
                      onClick={(e) => copyToClipboard(tweet.token.address, e)}
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                      title="Copy CA"
                    >
                      {copiedCA === tweet.token.address ? (
                        <CheckCheck className="h-4 w-4 text-[var(--success)]" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        window.open(`https://dexscreener.com/solana/${tweet.token.address}`, "_blank")
                      }}
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                      title="DexScreener"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        window.open(tweet.url, "_blank")
                      }}
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                      title="View Tweet"
                    >
                      <Twitter className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Author & Engagement Row */}
                  <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      {tweet.authorAvatar && (
                        <Image
                          src={tweet.authorAvatar || "/placeholder.svg"}
                          alt={tweet.author}
                          width={16}
                          height={16}
                          className="rounded-full"
                          unoptimized
                          onError={handleImageError}
                        />
                      )}
                      <span className="font-medium text-foreground">{tweet.authorHandle}</span>
                      <span className="flex items-center gap-0.5">
                        <Users className="h-3 w-3" />
                        {tweet.authorFollowers.toLocaleString()}
                      </span>
                    </div>
                    <span className="text-muted-foreground/60">•</span>
                    <span>{tweet.likes.toLocaleString()} likes</span>
                    <span>{tweet.retweets.toLocaleString()} RTs</span>
                    <span className="text-muted-foreground/60">•</span>
                    <span>{formatTime(tweet.timestamp)}</span>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border px-5 py-3 text-xs text-muted-foreground">
        <span>Last scan: {data?.timestamp ? new Date(data.timestamp).toLocaleTimeString() : "—"}</span>
        <div className="flex items-center gap-3">
          {newTweetIds.size > 0 && (
            <Badge className="bg-primary/20 text-primary text-[10px]">{newTweetIds.size} new</Badge>
          )}
          <span>{allTweets.length} CAs detected</span>
        </div>
      </div>
    </div>
  )
}
