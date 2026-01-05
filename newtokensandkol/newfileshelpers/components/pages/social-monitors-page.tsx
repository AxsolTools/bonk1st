"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import {
  Radio,
  Twitter,
  Instagram,
  Newspaper,
  Users,
  Crown,
  MessageSquare,
  Copy,
  CheckCheck,
  ExternalLink,
} from "lucide-react"

interface SocialFeed {
  id: string
  name: string
  icon: typeof Twitter
  enabled: boolean
  itemCount: number
  color: string
}

interface SocialPost {
  id: string
  source: string
  author: string
  authorAvatar: string
  content: string
  timestamp: Date
  engagement: number
  hasCA: boolean
  contractAddress?: string
  tokenSymbol?: string
  tokenName?: string
  tokenLogo?: string
  marketCap?: number
  priceChange?: number
}

const SOCIAL_FEEDS: SocialFeed[] = [
  { id: "twitter", name: "Twitter/X", icon: Twitter, enabled: true, itemCount: 0, color: "text-[#1DA1F2]" },
  { id: "instagram", name: "Instagram", icon: Instagram, enabled: true, itemCount: 0, color: "text-[#E1306C]" },
  { id: "truth", name: "Truth Social", icon: MessageSquare, enabled: false, itemCount: 0, color: "text-[#5448EE]" },
  { id: "telegram", name: "Telegram", icon: Users, enabled: true, itemCount: 0, color: "text-[#0088CC]" },
  { id: "news", name: "News Feed", icon: Newspaper, enabled: true, itemCount: 0, color: "text-primary" },
  { id: "dex", name: "DEX Activity", icon: Crown, enabled: true, itemCount: 0, color: "text-primary" },
]

const VIP_ACCOUNTS = [
  { name: "Elon Musk", handle: "elonmusk", avatar: "https://unavatar.io/twitter/elonmusk" },
  { name: "Donald Trump", handle: "realDonaldTrump", avatar: "https://unavatar.io/twitter/realDonaldTrump" },
  { name: "Ansem", handle: "blknoiz06", avatar: "https://unavatar.io/twitter/blknoiz06" },
  { name: "Murad", handle: "MustStopMurad", avatar: "https://unavatar.io/twitter/MustStopMurad" },
]

export function SocialMonitorsPage() {
  const router = useRouter()
  const [feeds, setFeeds] = useState(SOCIAL_FEEDS)
  const [posts, setPosts] = useState<SocialPost[]>([])
  const [selectedSource, setSelectedSource] = useState<string | null>(null)
  const [copiedCA, setCopiedCA] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Helper to clean content - remove URLs
  const cleanContent = (text: string) => {
    if (!text) return ""
    return text
      .replace(/https?:\/\/[^\s]+/g, "")
      .replace(/\s+/g, " ")
      .trim()
  }

  // Format market cap
  const formatMC = (mc: number) => {
    if (mc >= 1e9) return `$${(mc / 1e9).toFixed(2)}B`
    if (mc >= 1e6) return `$${(mc / 1e6).toFixed(2)}M`
    if (mc >= 1e3) return `$${(mc / 1e3).toFixed(0)}K`
    return `$${mc.toFixed(0)}`
  }

  useEffect(() => {
    const fetchSocialData = async () => {
      try {
        const res = await fetch("/api/social/feed")
        const data = await res.json()

        const socialPosts: SocialPost[] = (data.posts || []).map(
          (post: {
            id: string
            source: string
            author: string
            authorAvatar: string
            content: string
            timestamp: string
            engagement: number
            contractAddress?: string
            tokenSymbol?: string
            tokenName?: string
            marketCap?: number
            priceChange?: number
          }) => ({
            id: post.id,
            source: post.source || "dex",
            author: post.author,
            authorAvatar: post.authorAvatar,
            content: post.content,
            timestamp: new Date(post.timestamp),
            engagement: post.engagement || 0,
            hasCA: !!post.contractAddress,
            contractAddress: post.contractAddress,
            tokenSymbol: post.tokenSymbol,
            tokenName: post.tokenName,
            marketCap: post.marketCap,
            priceChange: post.priceChange,
          }),
        )

        setPosts(socialPosts)
        setFeeds((prev) =>
          prev.map((f) => ({
            ...f,
            itemCount: socialPosts.filter((p) => p.source === f.id).length,
          })),
        )
      } catch (error) {
        console.error("Social fetch error:", error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchSocialData()
    const interval = setInterval(fetchSocialData, 30000)
    return () => clearInterval(interval)
  }, [])

  const toggleFeed = (id: string) => {
    setFeeds((prev) => prev.map((f) => (f.id === id ? { ...f, enabled: !f.enabled } : f)))
  }

  const copyToClipboard = async (ca: string) => {
    await navigator.clipboard.writeText(ca)
    setCopiedCA(ca)
    setTimeout(() => setCopiedCA(null), 2000)
  }

  const formatTime = (date: Date) => {
    const diff = Math.floor((Date.now() - date.getTime()) / 1000)
    if (diff < 60) return `${diff}s`
    if (diff < 3600) return `${Math.floor(diff / 60)}m`
    return `${Math.floor(diff / 3600)}h`
  }

  const filteredPosts = posts.filter((p) => {
    const feedEnabled = feeds.find((f) => f.id === p.source)?.enabled ?? true
    if (!feedEnabled) return false
    if (selectedSource && p.source !== selectedSource) return false
    return true
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Social Monitors</h1>
        <p className="text-muted-foreground">Multi-platform tracking for crypto mentions</p>
      </div>

      {/* VIP Trackers */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Crown className="h-4 w-4 text-primary" />
          VIP Account Trackers
        </h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {VIP_ACCOUNTS.map((vip) => (
            <div
              key={vip.handle}
              className="flex items-center gap-2 rounded-lg border border-border bg-secondary/30 p-2"
            >
              <Image
                src={vip.avatar || "/placeholder.svg"}
                alt={vip.name}
                width={32}
                height={32}
                className="rounded-full"
                unoptimized
                onError={(e) => {
                  e.currentTarget.src = "/diverse-avatars.jpg"
                }}
              />
              <div>
                <div className="text-sm font-medium text-foreground">{vip.name}</div>
                <div className="text-xs text-muted-foreground">@{vip.handle}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Feed Controls */}
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <Radio className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Feed Controls</h2>
                <p className="text-xs text-muted-foreground">Toggle sources</p>
              </div>
            </div>
          </div>

          <div className="divide-y divide-border/50">
            {feeds.map((feed) => (
              <div
                key={feed.id}
                className={cn(
                  "flex cursor-pointer items-center justify-between px-5 py-3 transition-colors",
                  selectedSource === feed.id ? "bg-primary/10" : "hover:bg-secondary/30",
                )}
                onClick={() => setSelectedSource(selectedSource === feed.id ? null : feed.id)}
              >
                <div className="flex items-center gap-3">
                  <feed.icon className={cn("h-5 w-5", feed.color)} />
                  <div>
                    <span className="text-sm font-medium text-foreground">{feed.name}</span>
                    <Badge variant="outline" className="ml-2 text-[10px]">
                      {feed.itemCount}
                    </Badge>
                  </div>
                </div>
                <Switch
                  checked={feed.enabled}
                  onCheckedChange={() => toggleFeed(feed.id)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Posts Feed */}
        <div className="lg:col-span-2 rounded-lg border border-border bg-card">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-lg font-semibold text-foreground">Live Feed</h2>
            <p className="text-xs text-muted-foreground">
              {selectedSource ? `Showing ${selectedSource} posts` : "All sources"}
            </p>
          </div>

          <div className="max-h-[600px] divide-y divide-border/50 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : filteredPosts.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">No posts found</div>
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
                      {/* Token Logo */}
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
                        <div className="flex items-center gap-2 flex-wrap">
                          {feed && <feed.icon className={cn("h-4 w-4 shrink-0", feed.color)} />}
                          <span className="font-semibold text-foreground">
                            {post.tokenSymbol ? `$${post.tokenSymbol}` : "Unknown"}
                          </span>
                          {post.tokenName && (
                            <span className="text-xs text-muted-foreground truncate">{post.tokenName}</span>
                          )}
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

                        {/* Content - cleaned */}
                        {cleanContent(post.content) && (
                          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                            {cleanContent(post.content)}
                          </p>
                        )}

                        {/* CA and Actions */}
                        {post.contractAddress && (
                          <div className="mt-2 flex items-center gap-2">
                            <code className="rounded bg-secondary/50 px-1.5 py-0.5 font-mono text-[10px] text-primary">
                              {post.contractAddress.slice(0, 6)}...{post.contractAddress.slice(-4)}
                            </code>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                copyToClipboard(post.contractAddress!)
                              }}
                              className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                              title="Copy CA"
                            >
                              {copiedCA === post.contractAddress ? (
                                <CheckCheck className="h-3 w-3 text-green-500" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
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
      </div>
    </div>
  )
}
