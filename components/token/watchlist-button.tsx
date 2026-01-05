"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { useAuth } from "@/components/providers/auth-provider"
import { cn } from "@/lib/utils"

interface WatchlistButtonProps {
  tokenId: string
  tokenAddress?: string
  className?: string
}

export function WatchlistButton({ tokenId, tokenAddress, className }: WatchlistButtonProps) {
  const { sessionId, isAuthenticated, setIsOnboarding } = useAuth()
  const [isWatching, setIsWatching] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (sessionId && tokenAddress) {
      checkWatchlist()
    }
  }, [tokenId, tokenAddress, sessionId])

  const checkWatchlist = async () => {
    if (!sessionId || !tokenAddress) return

    try {
      const response = await fetch(`/api/watchlist?token_address=${tokenAddress}`, {
        headers: {
          Authorization: `Bearer ${sessionId}`,
        },
      })
      const data = await response.json()
      setIsWatching(data.data?.isWatchlisted || false)
    } catch (error) {
      console.error("[WATCHLIST] Check failed:", error)
    }
  }

  const toggleWatchlist = async () => {
    if (!isAuthenticated) {
      setIsOnboarding(true)
      return
    }

    if (!sessionId || !tokenAddress || isLoading) return

    setIsLoading(true)

    try {
      if (isWatching) {
        await fetch(`/api/watchlist?token_address=${tokenAddress}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${sessionId}`,
          },
        })
        setIsWatching(false)
      } else {
        await fetch("/api/watchlist", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionId}`,
          },
          body: JSON.stringify({
            token_address: tokenAddress,
            token_id: tokenId,
          }),
        })
        setIsWatching(true)
      }
    } catch (error) {
      console.error("[WATCHLIST] Toggle failed:", error)
    }

    setIsLoading(false)
  }

  return (
    <motion.button
      onClick={toggleWatchlist}
      disabled={isLoading}
      whileTap={{ scale: 0.9 }}
      className={cn(
        "p-3 rounded-xl border transition-all",
        isWatching
          ? "border-[var(--warm-orange)] bg-[var(--warm-orange)]/10"
          : "border-[var(--glass-border)] hover:border-[var(--warm-orange)]/50",
        className,
      )}
    >
      <motion.svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill={isWatching ? "var(--warm-orange)" : "none"}
        stroke="var(--warm-orange)"
        strokeWidth="2"
        animate={isWatching ? { scale: [1, 1.2, 1] } : {}}
        transition={{ duration: 0.3 }}
      >
        <path d="M10 2l1.5 4.5H16l-3.5 3 1.5 4.5L10 11.5 6 14l1.5-4.5L4 6.5h4.5L10 2z" />
      </motion.svg>
    </motion.button>
  )
}
