"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { motion } from "framer-motion"
import { Header } from "@/components/layout/header"
import { LiquidBackground } from "@/components/visuals/liquid-background"
import { GlobalPourEffect } from "@/components/visuals/global-pour-effect"
import { GlassPanel } from "@/components/ui/glass-panel"
import { HolographicCard } from "@/components/ui/holographic-card"
import { createClient } from "@/lib/supabase/client"

interface TrendingProfile {
  id: string
  token_address: string
  token_name: string
  token_symbol: string
  token_image: string | null
  banner_url: string | null
  description: string | null
  website: string | null
  twitter: string | null
  telegram: string | null
  discord: string | null
  is_active: boolean
  expires_at: string
}

export default function TrendingPage() {
  const [trending, setTrending] = useState<TrendingProfile[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchTrending = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from("trending_profiles")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false })

      if (data) setTrending(data)
      setIsLoading(false)
    }

    fetchTrending()
  }, [])

  return (
    <main className="min-h-screen relative">
      <LiquidBackground />
      <GlobalPourEffect />

      <div className="relative z-10">
        <Header />

        <div className="pt-20 pb-12 px-3 sm:px-4 lg:px-6">
          <div className="max-w-[1920px] mx-auto">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
              <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">Rising Tides</h1>
              <p className="text-[var(--text-secondary)]">Featured and trending tokens in the Propel ecosystem</p>
            </motion.div>

            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="h-64 skeleton rounded-2xl" />
                ))}
              </div>
            ) : trending.length === 0 ? (
              <GlassPanel className="p-12 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--aqua-subtle)] flex items-center justify-center">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-[var(--aqua-primary)]">
                    <path
                      d="M13 7l-4 5 4 5M7 7l-4 5 4 5"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">No Trending Tokens</h2>
                <p className="text-sm text-[var(--text-secondary)] mb-6">
                  Be the first to feature your token in the Rising Tides section
                </p>
                <Link href="/launch" className="btn-primary inline-flex">
                  Launch Token
                </Link>
              </GlassPanel>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {trending.map((profile, index) => (
                  <motion.div
                    key={profile.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <Link href={`/token/${profile.token_address}`}>
                      <HolographicCard className="h-full group cursor-pointer overflow-hidden">
                        {profile.banner_url && (
                          <div className="h-24 overflow-hidden">
                            <Image
                              src={profile.banner_url || "/placeholder.svg"}
                              alt={`${profile.token_name} banner`}
                              width={400}
                              height={96}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            />
                          </div>
                        )}

                        <div className="p-5">
                          <div className="flex items-start gap-4">
                            <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-gradient-to-br from-[var(--aqua-primary)] to-[var(--warm-pink)] flex-shrink-0 -mt-8 border-4 border-[var(--ocean-deep)]">
                              {profile.token_image ? (
                                <Image
                                  src={profile.token_image || "/placeholder.svg"}
                                  alt={profile.token_name}
                                  fill
                                  className="object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-[var(--ocean-deep)] font-bold text-lg">
                                  {profile.token_symbol.slice(0, 2)}
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0 pt-1">
                              <h3 className="font-semibold text-[var(--text-primary)] truncate group-hover:text-[var(--aqua-primary)] transition-colors">
                                {profile.token_name}
                              </h3>
                              <p className="text-sm text-[var(--text-muted)]">${profile.token_symbol}</p>
                            </div>
                          </div>

                          {profile.description && (
                            <p className="mt-4 text-sm text-[var(--text-secondary)] line-clamp-2">
                              {profile.description}
                            </p>
                          )}

                          <div className="mt-4 flex items-center gap-2">
                            {profile.website && (
                              <a
                                href={profile.website}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="p-2 rounded-lg bg-[var(--ocean-surface)] hover:bg-[var(--aqua-subtle)] text-[var(--text-muted)] hover:text-[var(--aqua-primary)] transition-all"
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                                  <path
                                    d="M2 12h20M12 2a15 15 0 014 10 15 15 0 01-4 10 15 15 0 01-4-10 15 15 0 014-10z"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                  />
                                </svg>
                              </a>
                            )}
                            {profile.twitter && (
                              <a
                                href={profile.twitter}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="p-2 rounded-lg bg-[var(--ocean-surface)] hover:bg-[var(--aqua-subtle)] text-[var(--text-muted)] hover:text-[var(--aqua-primary)] transition-all"
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                                </svg>
                              </a>
                            )}
                            {profile.telegram && (
                              <a
                                href={profile.telegram}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="p-2 rounded-lg bg-[var(--ocean-surface)] hover:bg-[var(--aqua-subtle)] text-[var(--text-muted)] hover:text-[var(--aqua-primary)] transition-all"
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
                                </svg>
                              </a>
                            )}
                            {profile.discord && (
                              <a
                                href={profile.discord}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="p-2 rounded-lg bg-[var(--ocean-surface)] hover:bg-[var(--aqua-subtle)] text-[var(--text-muted)] hover:text-[var(--aqua-primary)] transition-all"
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028 14.09 14.09 0 001.226-1.994.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                                </svg>
                              </a>
                            )}
                          </div>
                        </div>
                      </HolographicCard>
                    </Link>
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
