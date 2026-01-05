"use client"

import useSWR from "swr"
import { TrendingUp, DollarSign, Activity, Users } from "lucide-react"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function TrendingStats() {
  const { data } = useSWR("/api/tokens/trending", fetcher, { refreshInterval: 20000 })
  const tokens = data?.tokens || []

  const totalVolume = tokens.reduce((acc: number, t: { volume24h: number }) => acc + (t.volume24h || 0), 0)
  const totalMC = tokens.reduce((acc: number, t: { marketCap: number }) => acc + (t.marketCap || 0), 0)
  const avgChange = tokens.length
    ? tokens.reduce((acc: number, t: { priceChange24h: number }) => acc + (t.priceChange24h || 0), 0) / tokens.length
    : 0

  const formatNumber = (n: number) => {
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
    if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
    if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`
    return `$${n.toFixed(0)}`
  }

  const stats = [
    { label: "Total Volume 24h", value: formatNumber(totalVolume), icon: DollarSign, color: "text-primary" },
    { label: "Combined MC", value: formatNumber(totalMC), icon: TrendingUp, color: "text-[var(--success)]" },
    {
      label: "Avg Change",
      value: `${avgChange >= 0 ? "+" : ""}${avgChange.toFixed(1)}%`,
      icon: Activity,
      color: avgChange >= 0 ? "text-[var(--success)]" : "text-destructive",
    },
    { label: "Tokens Tracked", value: tokens.length.toString(), icon: Users, color: "text-primary" },
  ]

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label} className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <stat.icon className={`h-4 w-4 ${stat.color}`} />
            <span className="text-xs text-muted-foreground">{stat.label}</span>
          </div>
          <div className={`mt-1 text-2xl font-bold ${stat.color}`}>{stat.value}</div>
        </div>
      ))}
    </div>
  )
}
