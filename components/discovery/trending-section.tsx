"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { motion } from "framer-motion"
import { createClient } from "@/lib/supabase/client"
import { HolographicCard } from "@/components/ui/holographic-card"

interface TrendingToken {
  id: string
  token_address: string
  token_name: string
  token_symbol: string
  token_image: string | null
  description: string | null
}

export function TrendingSection() {
  const [trending, setTrending] = useState<TrendingToken[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchTrending = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from("trending_profiles")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(6)

      if (data) setTrending(data)
      setIsLoading(false)
    }

    fetchTrending()
  }, [])

  if (isLoading) {
    return (
      <div className="mb-12">
        <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-6">Rising Tides</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 skeleton rounded-2xl" />
          ))}
        </div>
      </div>
    )
  }

  if (trending.length === 0) return null

  return (
    <div className="mb-12" id="discover">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-[var(--text-primary)]">Rising Tides</h2>
        <Link href="/explore/trending" className="text-sm text-[var(--aqua-primary)] hover:underline">
          View All
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {trending.map((token, index) => (
          <motion.div
            key={token.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Link href={`/token/${token.token_address}`}>
              <HolographicCard className="group cursor-pointer">
                <div className="p-5">
                  <div className="flex items-start gap-4">
                    <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-gradient-to-br from-[var(--aqua-primary)] to-[var(--warm-pink)] flex-shrink-0">
                      {token.token_image ? (
                        <Image
                          src={token.token_image || "/placeholder.svg"}
                          alt={token.token_name}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[var(--ocean-deep)] font-bold text-lg">
                          {token.token_symbol.slice(0, 2)}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-[var(--text-primary)] truncate group-hover:text-[var(--aqua-primary)] transition-colors">
                        {token.token_name}
                      </h3>
                      <p className="text-sm text-[var(--text-muted)]">${token.token_symbol}</p>
                    </div>
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--success)]/10 text-[var(--success)]">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path
                          d="M7 11V3M3 7l4-4 4 4"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                  </div>
                  {token.description && (
                    <p className="mt-3 text-sm text-[var(--text-secondary)] line-clamp-2">{token.description}</p>
                  )}
                </div>
              </HolographicCard>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
