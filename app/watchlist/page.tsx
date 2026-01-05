"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { motion } from "framer-motion"
import { Header } from "@/components/layout/header"
import { LiquidBackground } from "@/components/visuals/liquid-background"
import { GlobalPourEffect } from "@/components/visuals/global-pour-effect"
import { GlassPanel } from "@/components/ui/glass-panel"
import { useAuth } from "@/components/providers/auth-provider"
import { createClient } from "@/lib/supabase/client"

interface WatchlistToken {
  id: string
  token_id: string
  token: {
    id: string
    name: string
    symbol: string
    image_url: string | null
    mint_address: string
    price_sol: number
    change_24h: number
    water_level: number
  }
}

export default function WatchlistPage() {
  const { userId, isAuthenticated, setIsOnboarding } = useAuth()
  const [watchlist, setWatchlist] = useState<WatchlistToken[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!userId) {
      setIsLoading(false)
      return
    }

    const fetchWatchlist = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from("watchlist")
        .select(`
          id,
          token_id,
          token:tokens (
            id,
            name,
            symbol,
            image_url,
            mint_address,
            price_sol,
            change_24h,
            water_level
          )
        `)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })

      if (data) {
        setWatchlist(data as unknown as WatchlistToken[])
      }
      setIsLoading(false)
    }

    fetchWatchlist()
  }, [userId])

  const removeFromWatchlist = async (watchlistId: string) => {
    const supabase = createClient()
    await supabase.from("watchlist").delete().eq("id", watchlistId)
    setWatchlist((prev) => prev.filter((w) => w.id !== watchlistId))
  }

  return (
    <main className="min-h-screen relative">
      <LiquidBackground />
      <GlobalPourEffect />

      <div className="relative z-10">
        <Header />

        <div className="pt-20 pb-12 px-3 sm:px-4 lg:px-6">
          <div className="max-w-[1920px] mx-auto">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
              <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">Watchlist</h1>
              <p className="text-[var(--text-secondary)]">Track your favorite tokens</p>
            </motion.div>

            {!isAuthenticated ? (
              <GlassPanel className="p-12 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--aqua-subtle)] flex items-center justify-center">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-[var(--aqua-primary)]">
                    <path
                      d="M12 6v6l4 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Connect Wallet</h2>
                <p className="text-sm text-[var(--text-secondary)] mb-6">
                  Connect your wallet to view and manage your watchlist
                </p>
                <button onClick={() => setIsOnboarding(true)} className="btn-primary">
                  Connect Wallet
                </button>
              </GlassPanel>
            ) : isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-24 skeleton rounded-xl" />
                ))}
              </div>
            ) : watchlist.length === 0 ? (
              <GlassPanel className="p-12 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--aqua-subtle)] flex items-center justify-center">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-[var(--aqua-primary)]">
                    <path
                      d="M12 4l2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6L7.1 19.2l.9-5.5-4-3.9 5.5-.8L12 4z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">No Tokens Watched</h2>
                <p className="text-sm text-[var(--text-secondary)] mb-6">
                  Add tokens to your watchlist to track them here
                </p>
                <Link href="/" className="btn-primary inline-flex">
                  Explore Tokens
                </Link>
              </GlassPanel>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {watchlist.map((item, index) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <GlassPanel className="p-4 hover:border-[var(--aqua-border)] transition-all group">
                      <div className="flex items-center gap-4">
                        <Link href={`/token/${item.token.mint_address}`} className="flex items-center gap-4 flex-1">
                          <div className="w-12 h-12 rounded-xl overflow-hidden bg-gradient-to-br from-[var(--aqua-primary)] to-[var(--warm-pink)] flex-shrink-0">
                            {item.token.image_url ? (
                              <Image
                                src={item.token.image_url || "/placeholder.svg"}
                                alt={item.token.name}
                                width={48}
                                height={48}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[var(--ocean-deep)] font-bold">
                                {item.token.symbol.slice(0, 2)}
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-[var(--text-primary)] truncate group-hover:text-[var(--aqua-primary)] transition-colors">
                              {item.token.name}
                            </h3>
                            <p className="text-sm text-[var(--text-muted)]">${item.token.symbol}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-mono text-sm text-[var(--text-primary)]">
                              {item.token.price_sol?.toFixed(6) || "0"} SOL
                            </p>
                            <p
                              className={`text-xs font-medium ${item.token.change_24h >= 0 ? "text-[var(--success)]" : "text-[var(--error)]"}`}
                            >
                              {item.token.change_24h >= 0 ? "+" : ""}
                              {item.token.change_24h?.toFixed(2) || 0}%
                            </p>
                          </div>
                        </Link>
                        <button
                          onClick={() => removeFromWatchlist(item.id)}
                          className="p-2 rounded-lg hover:bg-[var(--error)]/10 text-[var(--text-muted)] hover:text-[var(--error)] transition-all"
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                            <path
                              d="M6 6l12 12M6 18L18 6"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                            />
                          </svg>
                        </button>
                      </div>
                    </GlassPanel>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
