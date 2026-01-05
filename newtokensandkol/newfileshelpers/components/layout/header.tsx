"use client"

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Clock, AlertTriangle } from "lucide-react"

export function Header() {
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(new Date())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <header className="sticky top-0 z-30 flex flex-col border-b border-border bg-background/80 backdrop-blur-sm">
      <div className="relative overflow-hidden max-w-full bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-amber-500/10 border-b border-amber-500/20">
        <div className="flex items-center gap-2 py-1.5 animate-marquee whitespace-nowrap">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-8 mx-8">
              <span className="flex items-center gap-2 text-xs font-medium text-amber-400">
                <AlertTriangle className="h-3 w-3 animate-pulse" />
                <span className="animate-pulse">ACCESS REQUIREMENT:</span>
                <span className="text-amber-300 font-bold">Hold minimum 1,000,000 VEXOR tokens to use this app</span>
                <AlertTriangle className="h-3 w-3 animate-pulse" />
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex h-16 items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
          <Badge variant="outline" className="border-primary/30 text-primary">
            <span className="mr-1.5 h-2 w-2 animate-pulse rounded-full bg-primary" />
            Live
          </Badge>
        </div>

        <div className="flex items-center gap-6">
          {/* Time */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span className="font-mono">{time.toLocaleTimeString()}</span>
          </div>
        </div>
      </div>
    </header>
  )
}
