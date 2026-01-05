"use client"

/**
 * AQUA Launchpad - Token22 Fee Harvest Card
 * 
 * Displays and allows claiming of Token-2022 transfer fees for token creators.
 * Token-2022 fees work differently from Pump.fun:
 * 1. Transfer fees are withheld in token accounts during transfers
 * 2. They must be harvested to the mint first
 * 3. Then withdrawn from mint to creator's wallet
 */

import { useState, useEffect, useCallback, useRef } from "react"
import { motion } from "framer-motion"
import { useAuth } from "@/components/providers/auth-provider"
import { getAuthHeaders } from "@/lib/api/auth-headers"
import { Droplets, ExternalLink, RefreshCw, AlertCircle, Check } from "lucide-react"

interface Token22FeeHarvestCardProps {
  tokenId: string
  tokenAddress: string
  creatorWallet: string
  tokenSymbol?: string
  decimals?: number
}

interface FeesData {
  totalWithheld: string
  accountCount: number
  lastHarvest?: string
}

export function Token22FeeHarvestCard({
  tokenId,
  tokenAddress,
  creatorWallet,
  tokenSymbol = "TOKEN",
  decimals = 9,
}: Token22FeeHarvestCardProps) {
  const { userId, sessionId, activeWallet, mainWallet } = useAuth()
  const [feesData, setFeesData] = useState<FeesData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isHarvesting, setIsHarvesting] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const walletAddress = activeWallet?.public_key || mainWallet?.public_key

  // User is the creator if their wallet matches the token's creator wallet
  const isCreator = !!(
    walletAddress &&
    creatorWallet &&
    walletAddress.toLowerCase() === creatorWallet.toLowerCase()
  )

  // Fetch withheld fees from API
  const fetchFees = useCallback(async () => {
    if (!tokenAddress) {
      setIsLoading(false)
      return
    }

    try {
      const response = await fetch(`/api/token22/fees/harvest?mint=${tokenAddress}`)

      if (response.ok) {
        const data = await response.json()
        if (data.success && data.data) {
          setFeesData({
            totalWithheld: data.data.totalWithheld,
            accountCount: data.data.accountCount,
          })
        }
      }
    } catch (error) {
      console.debug("[TOKEN22-FEES] Failed to fetch fees:", error)
    } finally {
      setIsLoading(false)
    }
  }, [tokenAddress])

  useEffect(() => {
    fetchFees()

    // Poll every 60 seconds for updates
    const interval = setInterval(fetchFees, 60_000)
    return () => clearInterval(interval)
  }, [fetchFees])

  // Wave animation
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let animationId: number
    let time = 0

    const animate = () => {
      const { width, height } = canvas
      ctx.clearRect(0, 0, width, height)

      // Draw gradient background
      const gradient = ctx.createLinearGradient(0, 0, 0, height)
      gradient.addColorStop(0, "rgba(138, 43, 226, 0.1)")  // Purple tint for Token22
      gradient.addColorStop(1, "rgba(138, 43, 226, 0.05)")
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, width, height)

      // Draw waves
      ctx.beginPath()
      ctx.moveTo(0, height)

      for (let x = 0; x <= width; x += 5) {
        const y = height - 20 + Math.sin((x + time) * 0.02) * 8 + Math.sin((x + time * 0.5) * 0.01) * 5
        ctx.lineTo(x, y)
      }

      ctx.lineTo(width, height)
      ctx.closePath()

      const waveGradient = ctx.createLinearGradient(0, height - 40, 0, height)
      waveGradient.addColorStop(0, "rgba(138, 43, 226, 0.4)")
      waveGradient.addColorStop(1, "rgba(138, 43, 226, 0.1)")
      ctx.fillStyle = waveGradient
      ctx.fill()

      time += 2
      animationId = requestAnimationFrame(animate)
    }

    const resizeCanvas = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio
      canvas.height = canvas.offsetHeight * window.devicePixelRatio
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
    }

    resizeCanvas()
    window.addEventListener("resize", resizeCanvas)
    animate()

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener("resize", resizeCanvas)
    }
  }, [])

  const handleHarvest = async () => {
    if (!tokenAddress || !walletAddress || !sessionId) return

    setIsHarvesting(true)
    setMessage(null)

    try {
      const response = await fetch("/api/token22/fees/harvest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders({
            sessionId: sessionId || userId,
            walletAddress,
            userId,
          }),
        },
        body: JSON.stringify({
          mintAddress: tokenAddress,
        }),
      })

      const data = await response.json()

      if (data.success) {
        setMessage({
          type: "success",
          text: `Successfully harvested fees from ${data.data?.accountsProcessed || 0} accounts!`,
        })
        await fetchFees()
      } else {
        setMessage({
          type: "error",
          text: data.error?.message || "Failed to harvest fees",
        })
      }
    } catch (error) {
      console.error("[TOKEN22-FEES] Harvest failed:", error)
      setMessage({
        type: "error",
        text: "Failed to harvest fees",
      })
    }

    setIsHarvesting(false)
  }

  const formatTokenAmount = (amount: string) => {
    const value = parseFloat(amount) / Math.pow(10, decimals)
    if (value >= 1) return value.toFixed(4)
    if (value >= 0.001) return value.toFixed(6)
    return value.toFixed(8)
  }

  // Only show for creator
  if (!isCreator) {
    return null
  }

  const totalWithheld = feesData?.totalWithheld || "0"
  const hasRewards = BigInt(totalWithheld) > BigInt(0)

  if (isLoading) {
    return (
      <div className="h-20 flex items-center justify-center bg-gradient-to-br from-purple-500/5 to-purple-600/10 rounded-lg border border-purple-500/20">
        <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="relative h-20 rounded-lg overflow-hidden border border-purple-500/30">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      <div className="relative z-10 flex flex-col items-center justify-center h-full py-1">
        <div className="flex items-baseline gap-1">
          <motion.span
            key={totalWithheld}
            initial={{ scale: 1.2, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-lg font-bold text-purple-300 font-mono"
            style={{ textShadow: "0 0 10px rgba(138, 43, 226, 0.5)" }}
          >
            {formatTokenAmount(totalWithheld)}
          </motion.span>
          <span className="text-xs text-[var(--text-secondary)]">{tokenSymbol}</span>
        </div>
        
        <p className="text-[10px] text-[var(--text-muted)] mb-1">
          {hasRewards 
            ? `from ${feesData?.accountCount || 0} accounts` 
            : "no fees yet"}
        </p>

        {message && (
          <div className={`flex items-center gap-1 px-1 py-0.5 rounded text-[9px] mb-1 ${
            message.type === "success" 
              ? "bg-green-500/20 text-green-300" 
              : "bg-red-500/20 text-red-300"
          }`}>
            {message.type === "success" ? (
              <Check className="w-2 h-2" />
            ) : (
              <AlertCircle className="w-2 h-2" />
            )}
            <span>{message.text}</span>
          </div>
        )}

        {hasRewards ? (
          <motion.button
            onClick={handleHarvest}
            disabled={isHarvesting}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="px-2 py-1 rounded-md bg-gradient-to-r from-purple-500 to-purple-600 text-white text-[10px] font-semibold hover:shadow-[0_0_20px_rgba(138,43,226,0.4)] transition-all disabled:opacity-50"
          >
            {isHarvesting ? "..." : "Harvest"}
          </motion.button>
        ) : (
          <div className="px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20">
            <span className="text-[9px] text-[var(--text-muted)]">
              From transfers
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

