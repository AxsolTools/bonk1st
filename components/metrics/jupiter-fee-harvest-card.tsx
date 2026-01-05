"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { motion } from "framer-motion"
import { useAuth } from "@/components/providers/auth-provider"
import { getAuthHeaders } from "@/lib/api"
// Custom Jupiter icon (planet with rings)
const JupiterIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="7" />
    <ellipse cx="12" cy="12" rx="11" ry="3" />
    <path d="M5 12h14" strokeWidth="1.5" />
  </svg>
)

interface JupiterFeeHarvestCardProps {
  tokenId: string
  tokenAddress?: string
  creatorWallet?: string
  dbcPoolAddress?: string
}

interface JupiterFeesData {
  totalFees: number
  unclaimedFees: number
  claimedFees: number
  poolAddress: string
  hasRewards: boolean
}

export function JupiterFeeHarvestCard({ 
  tokenId, 
  tokenAddress,
  creatorWallet,
  dbcPoolAddress,
}: JupiterFeeHarvestCardProps) {
  const { userId, sessionId, activeWallet, mainWallet } = useAuth()
  const [fees, setFees] = useState<JupiterFeesData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isClaiming, setIsClaiming] = useState(false)
  const [claimMessage, setClaimMessage] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const walletAddress = activeWallet?.public_key || mainWallet?.public_key
  
  // User is the creator if their wallet matches the token's creator wallet
  const isCreator = !!(
    walletAddress && 
    creatorWallet && 
    walletAddress.toLowerCase() === creatorWallet.toLowerCase()
  )

  // Fetch Jupiter fees from API
  const fetchFees = useCallback(async () => {
    console.log(`[JUPITER-HARVEST-MONITOR] Checking fees:`, {
      tokenAddress: tokenAddress?.slice(0, 12) + '...',
      walletAddress: walletAddress?.slice(0, 12) + '...',
      creatorWallet: creatorWallet?.slice(0, 12) + '...',
      dbcPoolAddress: dbcPoolAddress?.slice(0, 12) + '...' || 'none',
      isCreator,
    })
    
    if (!tokenAddress || !walletAddress || !isCreator) {
      console.log(`[JUPITER-HARVEST-MONITOR] Skipping - not creator or missing data`)
      setIsLoading(false)
      return
    }

    try {
      const apiUrl = `/api/jupiter/fees?mint=${tokenAddress}${dbcPoolAddress ? `&pool=${dbcPoolAddress}` : ''}`
      console.log(`[JUPITER-HARVEST-MONITOR] Fetching: ${apiUrl}`)
      
      const response = await fetch(apiUrl)
      const data = await response.json()
      
      console.log(`[JUPITER-HARVEST-MONITOR] Response:`, {
        success: data.success,
        poolAddress: data.data?.poolAddress?.slice(0, 16) + '...' || 'none',
        totalFees: data.data?.totalFees,
        unclaimedFees: data.data?.unclaimedFees,
        claimedFees: data.data?.claimedFees,
        notJupiterToken: data.data?.notJupiterToken,
      })
      
      if (data.success && data.data) {
        setFees({
          totalFees: data.data.totalFees || 0,
          unclaimedFees: data.data.unclaimedFees || 0,
          claimedFees: data.data.claimedFees || 0,
          poolAddress: data.data.poolAddress || '',
          hasRewards: (data.data.unclaimedFees || 0) > 0,
        })
      }
    } catch (error) {
      console.error("[JUPITER-HARVEST-MONITOR] ❌ Failed to fetch fees:", error)
    } finally {
      setIsLoading(false)
    }
  }, [tokenAddress, walletAddress, creatorWallet, isCreator, dbcPoolAddress])

  useEffect(() => {
    fetchFees()

    // Poll every 30 seconds for real-time updates (only if creator)
    if (isCreator) {
      const interval = setInterval(fetchFees, 30_000)
      return () => clearInterval(interval)
    }
  }, [fetchFees, isCreator])

  // Wave animation with Jupiter orange theme
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = canvas.offsetWidth * dpr
    canvas.height = canvas.offsetHeight * dpr
    ctx.scale(dpr, dpr)

    const width = canvas.offsetWidth
    const height = canvas.offsetHeight

    let animationId: number
    let time = 0

    const animate = () => {
      ctx.clearRect(0, 0, width, height)

      for (let layer = 0; layer < 3; layer++) {
        ctx.beginPath()
        ctx.moveTo(0, height)

        for (let x = 0; x <= width; x++) {
          const y =
            height -
            15 -
            layer * 8 +
            Math.sin((x / width) * Math.PI * 2 + time * 0.002 + layer * 0.5) * 4 +
            Math.sin((x / width) * Math.PI * 4 + time * 0.003) * 2

          ctx.lineTo(x, y)
        }

        ctx.lineTo(width, height)
        ctx.closePath()

        const opacity = 0.15 - layer * 0.04
        // Jupiter orange gradient
        ctx.fillStyle = `rgba(249, 115, 22, ${opacity})`
        ctx.fill()
      }

      time += 16
      animationId = requestAnimationFrame(animate)
    }

    animate()

    return () => cancelAnimationFrame(animationId)
  }, [])

  const handleClaim = async () => {
    if (!fees?.hasRewards || !tokenAddress || !walletAddress || !sessionId) return

    setIsClaiming(true)
    setClaimMessage(null)

    try {
      const response = await fetch("/api/jupiter/fees/claim", {
        method: "POST",
        headers: getAuthHeaders({
          sessionId: sessionId || userId,
          walletAddress,
          userId,
        }),
        body: JSON.stringify({
          mintAddress: tokenAddress,
          poolAddress: fees.poolAddress || dbcPoolAddress,
        }),
      })

      const data = await response.json()
      
      if (data.success) {
        setClaimMessage(`Successfully claimed ${data.data?.claimedAmount?.toFixed(6) || fees.unclaimedFees.toFixed(6)} SOL!`)
        await fetchFees()
      } else {
        setClaimMessage(data.error?.message || data.error || "Failed to claim fees")
      }
    } catch (error) {
      console.error("[JUPITER-HARVEST] Claim failed:", error)
      setClaimMessage("Failed to claim fees")
    }

    setIsClaiming(false)
  }

  const openJupiter = () => {
    if (tokenAddress) {
      window.open(`https://jup.ag/swap/SOL-${tokenAddress}`, "_blank")
    }
  }

  const formatSol = (amount: number) => {
    if (amount >= 1) return amount.toFixed(4)
    if (amount >= 0.001) return amount.toFixed(6)
    return amount.toFixed(8)
  }

  // If user is not the creator, don't show the component
  if (!isCreator) {
    return null
  }

  const balance = fees?.unclaimedFees || 0
  const hasRewards = balance > 0

  if (isLoading) {
    return (
      <div className="h-20 flex items-center justify-center">
        <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="relative h-20 rounded-lg overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      <div className="relative z-10 flex flex-col items-center justify-center h-full py-1">
        <div className="flex items-baseline gap-1">
          <motion.span
            key={balance}
            initial={{ scale: 1.2, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-lg font-bold text-orange-400 font-mono"
            style={{ textShadow: '0 0 10px rgba(249, 115, 22, 0.5)' }}
          >
            {formatSol(balance)}
          </motion.span>
          <span className="text-xs text-[var(--text-secondary)]">SOL</span>
        </div>
        <p className="text-[10px] text-[var(--text-muted)] mb-1">
          {hasRewards ? "unclaimed fees" : "no fees yet"}
        </p>

        {claimMessage && (
          <p className="text-[9px] text-center max-w-[180px] px-1 py-0.5 rounded bg-[var(--bg-secondary)]">
            {claimMessage}
          </p>
        )}

        {hasRewards ? (
          <div className="flex items-center gap-1">
            <motion.button
              onClick={handleClaim}
              disabled={isClaiming}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="px-2 py-1 rounded-md bg-gradient-to-r from-orange-500 to-yellow-500 text-white text-[10px] font-semibold hover:shadow-[0_0_20px_rgba(249,115,22,0.3)] transition-all disabled:opacity-50"
            >
              {isClaiming ? "..." : "Claim Fees"}
            </motion.button>
            <button
              onClick={openJupiter}
              className="px-2 py-1 rounded-md border border-orange-500/30 text-orange-400 text-[10px] font-medium hover:bg-orange-500/10 transition-colors flex items-center gap-1"
            >
              <JupiterIcon className="w-3 h-3" />
              Jupiter
            </button>
          </div>
        ) : (
          <div className="px-2 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/20">
            <span className="text-[9px] text-orange-400/70">
              From DBC trading fees
            </span>
          </div>
        )}

        {/* Total fees info */}
        {fees && fees.totalFees > 0 && (
          <p className="text-[8px] text-[var(--text-muted)] mt-1">
            Total earned: {formatSol(fees.totalFees)} SOL
          </p>
        )}
      </div>
    </div>
  )
}

