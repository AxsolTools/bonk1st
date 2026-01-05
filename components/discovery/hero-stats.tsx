"use client"

import { useEffect, useState } from "react"
import { GlassPanel } from "@/components/ui/glass-panel"
import { createClient } from "@/lib/supabase/client"

interface Stats {
  totalTokens: number
  totalLiquidity: number
  totalEvaporated: number
  totalVolume: number
}

export function HeroStats() {
  const [stats, setStats] = useState<Stats>({
    totalTokens: 0,
    totalLiquidity: 0,
    totalEvaporated: 0,
    totalVolume: 0,
  })
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      const supabase = createClient()

      const { data: tokens } = await supabase.from("tokens").select("current_liquidity, total_evaporated, volume_24h")

      if (tokens) {
        setStats({
          totalTokens: tokens.length,
          totalLiquidity: tokens.reduce((sum, t) => sum + (Number(t.current_liquidity) || 0), 0),
          totalEvaporated: tokens.reduce((sum, t) => sum + (Number(t.total_evaporated) || 0), 0),
          totalVolume: tokens.reduce((sum, t) => sum + (Number(t.volume_24h) || 0), 0),
        })
      }

      setIsLoading(false)
    }

    fetchStats()
  }, [])

  const formatNumber = (num: number, prefix = "") => {
    if (num >= 1_000_000) return `${prefix}${(num / 1_000_000).toFixed(2)}M`
    if (num >= 1_000) return `${prefix}${(num / 1_000).toFixed(2)}K`
    return `${prefix}${num.toFixed(2)}`
  }

  const statItems = [
    {
      label: "Total Tokens",
      value: isLoading ? "—" : stats.totalTokens.toString(),
      subtext: "Launched on AQUA",
    },
    {
      label: "Total Liquidity",
      value: isLoading ? "—" : formatNumber(stats.totalLiquidity, "$"),
      subtext: "Across all pools",
    },
    {
      label: "Tokens Evaporated",
      value: isLoading ? "—" : formatNumber(stats.totalEvaporated),
      subtext: "Burned from circulation",
    },
    {
      label: "24h Volume",
      value: isLoading ? "—" : formatNumber(stats.totalVolume, "$"),
      subtext: "Trading activity",
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {statItems.map((item, index) => (
        <GlassPanel key={index} className="p-6 text-center" glow={index === 0}>
          <p className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">{item.label}</p>
          <p className="text-3xl md:text-4xl font-bold text-[var(--text-primary)] mb-1">{item.value}</p>
          <p className="text-xs text-[var(--text-secondary)]">{item.subtext}</p>
        </GlassPanel>
      ))}
    </div>
  )
}
