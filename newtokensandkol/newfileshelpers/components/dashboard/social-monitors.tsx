"use client"

import { useState } from "react"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { Radio, Twitter, MessageSquare, Globe, Copy, ExternalLink, RefreshCw } from "lucide-react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import useSWR from "swr"

interface SocialFeed {
  id: string
  name: string
  icon: typeof Twitter
  enabled: boolean
  color: string
}

interface SocialPost {
  id: string
  source: string
  author: string
  authorAvatar: string
  content: string
  timestamp: string
  engagement: number
  hasCA: boolean
  contractAddress?: string
  tokenName?: string
  tokenSymbol?: string
  marketCap?: number
  volume24h?: number
  priceChange?: number
  url?: string
}

const SOCIAL_FEEDS: SocialFeed[] = [
  { id: "twitter", name: "Twitter/X", icon: Twitter, enabled: true, color: "text-[#1DA1F2]" },
  { id: "telegram", name: "Telegram", icon: MessageSquare, enabled: true, color: "text-[#0088CC]" },
  { id: "dex", name: "DEX Activity", icon: Globe, enabled: true, color: "text-primary" },
]

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function SocialMonitors() {
  const router = useRouter()
  const [feeds, setFeeds] = useState(SOCIAL_FEEDS)
  const [selectedSource, setSelectedSource] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const { data, isLoading, mutate } = useSWR<{ posts: SocialPost[] }>("/api/social/feed", fetcher, {
    refreshInterval: 30000,
  })

  const posts = data?.posts || []

  const toggleFeed = (id: string) => {
    setFeeds((prev) => prev.map((f) => (f.id === id ? { ...f, enabled: !f.enabled } : f)))
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const diff = Math.floor((Date.now() - date.getTime()) / 1000)
    if (diff < 60) return `${diff}s`
    if (diff < 3600) return `${Math.floor(diff / 60)}m`
    return `${Math.floor(diff / 3600)}h`
  }

  const copyCA = (ca: string, id: string) => {
    navigator.clipboard.writeText(ca)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const formatMC = (mc: number) => {
    if (mc >= 1e9) return `$${(mc / 1e9).toFixed(2)}B`
    if (mc >= 1e6) return `$${(mc / 1e6).toFixed(2)}M`
    if (mc >= 1e3) return `$${(mc / 1e3).toFixed(0)}K`
    return `$${mc.toFixed(0)}`
  }

  const cleanContent = (text: string) => {
    if (!text) return ""
    // Remove URLs from content
    return text
      .replace(/https?:\/\/[^\s]+/g, "")
      .replace(/\s+/g, " ")
      .trim()
  }

  // Filter posts by enabled feeds and selected source
  const filteredPosts = posts.filter((p) => {
    const feedEnabled = feeds.find((f) => f.id === p.source)?.enabled ?? true
    if (!feedEnabled) return false
    if (selectedSource && p.source !== selectedSource) return false
    return true
  })

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Radio className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Social Monitors</h2>
            <p className="text-xs text-muted-foreground">Real-time token activity</p>
          </div>
        </div>
        <button
          onClick={() => mutate()}
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
        </button>
      </div>

      {/* Feed Toggles */}
      <div className="grid grid-cols-3 gap-2 border-b border-border p-4">
        {feeds.map((feed) => (
          <div
            key={feed.id}
            className={cn(
              "flex cursor-pointer items-center justify-between rounded-lg border p-2 transition-colors",
              feed.enabled ? "border-primary/30 bg-primary/5" : "border-border bg-secondary/30",
              selectedSource === feed.id && "ring-1 ring-primary",
            )}
            onClick={() => setSelectedSource(selectedSource === feed.id ? null : feed.id)}
          >
            <div className="flex items-center gap-2">
              <feed.icon className={cn("h-4 w-4", feed.color)} />
              <span className="text-xs font-medium text-foreground">{feed.name}</span>
            </div>
            <Switch
              checked={feed.enabled}
              onCheckedChange={() => toggleFeed(feed.id)}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        ))}
      </div>

      {/* Posts Feed */}
      <div className="max-h-[400px] divide-y divide-border/50 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No posts found</div>
        ) : (
          filteredPosts.map((post) => {
            const feed = feeds.find((f) => f.id === post.source)
            const tokenLogo = post.contractAddress
              ? `https://dd.dexscreener.com/ds-data/tokens/solana/${post.contractAddress}.png`
              : null

            return (
              <div
                key={post.id}
                className="px-5 py-4 transition-colors hover:bg-secondary/30 cursor-pointer"
                onClick={() => post.contractAddress && router.push(`/token/${post.contractAddress}`)}
              >
                <div className="flex items-start gap-3">
                  {/* Token Logo - not author avatar */}
                  <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-secondary">
                    {tokenLogo ? (
                      <Image
                        src={tokenLogo || "/placeholder.svg"}
                        alt={post.tokenSymbol || "token"}
                        fill
                        className="object-cover"
                        unoptimized
                        onError={(e) => {
                          const target = e.target as HTMLImageElement
                          target.src = "/digital-token.png"
                        }}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs font-bold text-muted-foreground">
                        {post.tokenSymbol?.slice(0, 2) || "?"}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    {/* Header */}
                    <div className="flex items-center gap-2">
                      {feed && <feed.icon className={cn("h-3.5 w-3.5", feed.color)} />}
                      <span className="text-sm font-semibold text-foreground">
                        {post.tokenSymbol ? `$${post.tokenSymbol}` : post.author}
                      </span>
                      {post.tokenName && <span className="text-xs text-muted-foreground">{post.tokenName}</span>}
                      <span className="text-xs text-muted-foreground">{formatTime(post.timestamp)}</span>
                    </div>

                    {/* Market Data */}
                    {post.marketCap !== undefined && post.marketCap > 0 && (
                      <div className="mt-1 flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">MC: {formatMC(post.marketCap)}</span>
                        {post.priceChange !== undefined && (
                          <span
                            className={cn(
                              "text-xs font-medium",
                              post.priceChange >= 0 ? "text-green-500" : "text-red-500",
                            )}
                          >
                            {post.priceChange >= 0 ? "+" : ""}
                            {post.priceChange.toFixed(1)}%
                          </span>
                        )}
                      </div>
                    )}

                    {/* Content - cleaned of URLs */}
                    {cleanContent(post.content) && (
                      <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{cleanContent(post.content)}</p>
                    )}

                    {/* Contract Address & Actions */}
                    {post.contractAddress && (
                      <div className="mt-2 flex items-center gap-2">
                        <code className="rounded bg-secondary/50 px-1.5 py-0.5 font-mono text-[10px] text-primary">
                          {post.contractAddress.slice(0, 6)}...{post.contractAddress.slice(-4)}
                        </code>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            copyCA(post.contractAddress!, post.id)
                          }}
                          className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                          title="Copy CA"
                        >
                          <Copy className={cn("h-3 w-3", copiedId === post.id && "text-green-500")} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            window.open(`https://dexscreener.com/solana/${post.contractAddress}`, "_blank")
                          }}
                          className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                          title="View on DexScreener"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Engagement */}
                  <div className="shrink-0 text-right">
                    <span className="text-sm font-medium text-foreground">{post.engagement.toLocaleString()}</span>
                    <p className="text-[10px] text-muted-foreground">buys</p>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
