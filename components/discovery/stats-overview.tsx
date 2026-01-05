"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { createClient } from "@/lib/supabase/client"

interface Stats {
  totalPoured: number
  totalEvaporated: number
  activeTides: number
  totalTokens: number
}

export function StatsOverview() {
  const [stats, setStats] = useState<Stats>({
    totalPoured: 0,
    totalEvaporated: 0,
    activeTides: 0,
    totalTokens: 0,
  })
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      const supabase = createClient()

      const { data: tokens } = await supabase.from("tokens").select("current_liquidity, total_evaporated")

      const { data: harvests } = await supabase.from("tide_harvests").select("id").gt("total_accumulated", 0)

      if (tokens) {
        setStats({
          totalTokens: tokens.length,
          totalPoured: tokens.reduce((sum, t) => sum + (Number(t.current_liquidity) || 0), 0),
          totalEvaporated: tokens.reduce((sum, t) => sum + (Number(t.total_evaporated) || 0), 0),
          activeTides: harvests?.length || 0,
        })
      }
      setIsLoading(false)
    }

    fetchStats()
  }, [])

  const formatNumber = (num: number, decimals = 2) => {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(decimals)}M`
    if (num >= 1_000) return `${(num / 1_000).toFixed(decimals)}K`
    return num.toFixed(decimals)
  }

  const statItems = [
    { label: "Total Poured", value: formatNumber(stats.totalPoured), suffix: "SOL", color: "aqua" },
    { label: "Evaporated", value: formatNumber(stats.totalEvaporated, 0), suffix: "Tokens", color: "orange" },
    { label: "Active Tides", value: stats.activeTides.toString(), suffix: "", color: "pink" },
    { label: "Tokens Live", value: stats.totalTokens.toString(), suffix: "", color: "violet" },
  ]

  return (
    <section className="px-3 sm:px-4 lg:px-6 mb-12">
      <div className="max-w-[1920px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="glass-panel rounded-2xl p-1"
        >
          <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-[var(--glass-border)]">
            {statItems.map((item, index) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 + index * 0.1 }}
                className="p-6 text-center"
              >
                <p className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">{item.label}</p>
                {isLoading ? (
                  <div className="h-9 w-24 mx-auto skeleton rounded" />
                ) : (
                  <p
                    className={`text-3xl sm:text-4xl font-bold ${
                      item.color === "aqua"
                        ? "text-[var(--aqua-primary)]"
                        : item.color === "orange"
                          ? "text-[var(--warm-orange)]"
                          : item.color === "pink"
                            ? "text-[var(--warm-pink)]"
                            : "text-[var(--warm-violet)]"
                    }`}
                  >
                    {item.value}
                    {item.suffix && (
                      <span className="text-base font-normal text-[var(--text-muted)] ml-1">{item.suffix}</span>
                    )}
                  </p>
                )}
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  )
}
