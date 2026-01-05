"use client"

import { useEffect, useState, useRef } from "react"
import { KOL_DATABASE, TOKENS, EMERGING_TOKENS, getKolAvatar } from "@/lib/kol-data"

interface Activity {
  id: string
  kol: string
  kolTwitter: string
  avatar: string
  action: "BUY" | "SELL"
  token: string
  tokenLogo: string
  amount: number
}

const verifiedKols = KOL_DATABASE.filter((k) => k.twitter && !k.isWashTrader)

function getRandomVerifiedKOL() {
  const kol = verifiedKols[Math.floor(Math.random() * verifiedKols.length)]
  return {
    name: kol.name,
    twitter: kol.twitter,
    avatar: getKolAvatar(kol.twitter, kol.name),
  }
}

const allTokens = [...TOKENS, ...EMERGING_TOKENS]

function getRandomToken() {
  const token = allTokens[Math.floor(Math.random() * allTokens.length)]
  return {
    symbol: token.symbol,
    logo: token.logo,
  }
}

export function LiveActivityTicker() {
  const [activities, setActivities] = useState<Activity[]>([])
  const tickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const initial = Array.from({ length: 40 }, (_, i) => {
      const kol = getRandomVerifiedKOL()
      const token = getRandomToken()
      return {
        id: `init-${i}`,
        kol: kol.name,
        kolTwitter: kol.twitter,
        avatar: kol.avatar,
        action: (Math.random() > 0.4 ? "BUY" : "SELL") as "BUY" | "SELL",
        token: token.symbol,
        tokenLogo: token.logo,
        amount: Math.floor(Math.random() * 80000) + 500,
      }
    })
    setActivities(initial)

    const interval = setInterval(() => {
      const kol = getRandomVerifiedKOL()
      const token = getRandomToken()
      const newActivity: Activity = {
        id: `new-${Date.now()}`,
        kol: kol.name,
        kolTwitter: kol.twitter,
        avatar: kol.avatar,
        action: Math.random() > 0.4 ? "BUY" : "SELL",
        token: token.symbol,
        tokenLogo: token.logo,
        amount: Math.floor(Math.random() * 80000) + 500,
      }
      setActivities((prev) => [newActivity, ...prev.slice(0, 39)])
    }, 2000)

    return () => clearInterval(interval)
  }, [])

  const displayActivities = [...activities, ...activities, ...activities]

  return (
    <div className="bg-[#050505] border-b border-[#1a1a1a] overflow-hidden relative">
      {/* Gradient edges */}
      <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-[#050505] to-transparent z-10" />
      <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[#050505] to-transparent z-10" />

      <div ref={tickerRef} className="flex animate-scroll hover:pause" style={{ width: "max-content" }}>
        {displayActivities.map((activity, i) => (
          <div
            key={`${activity.id}-${i}`}
            className="flex items-center gap-2 px-4 py-2 border-r border-[#1a1a1a]/50 whitespace-nowrap shrink-0"
          >
            <img
              src={activity.avatar || "/placeholder.svg"}
              alt={activity.kol}
              className="w-5 h-5 rounded-full bg-[#1a1a1a] object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement
                target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(activity.kol)}&background=1a1a1a&color=00ff88&size=40`
              }}
            />
            <span className="text-white font-medium text-sm">{activity.kol}</span>
            <span
              className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                activity.action === "BUY" ? "bg-[#00ff88]/20 text-[#00ff88]" : "bg-red-500/20 text-red-400"
              }`}
            >
              {activity.action}
            </span>
            <img
              src={activity.tokenLogo || "/placeholder.svg"}
              alt={activity.token}
              className="w-4 h-4 rounded-full bg-[#1a1a1a] object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement
                target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(activity.token)}&background=1a1a1a&color=fff&size=32`
              }}
            />
            <span className="text-white text-sm font-medium">${activity.token}</span>
            <span className="text-neutral-500 text-xs">
              ${activity.amount >= 1000 ? `${(activity.amount / 1000).toFixed(1)}K` : activity.amount}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
