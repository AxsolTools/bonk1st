"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { motion } from "framer-motion"
import { Copy, Check, Users, Coins, Gift, TrendingUp, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/components/providers/auth-provider"

interface ReferralStats {
  referralCode: string
  totalReferred: number
  activeReferrals: number
  totalEarnings: number
  pendingEarnings: number
  claimableAmount: number
  totalClaimed: number
  lastClaimAt: string | null
  referralLink: string
  canClaim: boolean
  cooldownActive: boolean
  cooldownRemaining: number
  minClaimAmount: number
  sharePercent: number
}

// Polling interval for real-time updates (every 30 seconds)
const POLLING_INTERVAL = 30000

export function ReferralPanel() {
  const [stats, setStats] = useState<ReferralStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isClaiming, setIsClaiming] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const { activeWallet, isAuthenticated } = useAuth()
  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  // Load referral stats
  const loadStats = useCallback(async (showRefreshing = false) => {
    if (!activeWallet) return

    if (showRefreshing) {
      setIsRefreshing(true)
    }
    setError(null)

    try {
      // Get referral code
      const codeResponse = await fetch(
        `/api/referral/code?wallet_address=${activeWallet.public_key}`
      )
      const codeData = await codeResponse.json()

      // Get referral stats
      const statsResponse = await fetch(
        `/api/referral/stats?wallet_address=${activeWallet.public_key}`
      )
      const statsData = await statsResponse.json()

      if (codeData.success && statsData.success) {
        const baseUrl = window.location.origin
        const referralCode = codeData.data?.referralCode || activeWallet.public_key.slice(0, 8).toUpperCase()
        
        setStats({
          referralCode,
          totalReferred: statsData.data?.totalReferred || 0,
          activeReferrals: statsData.data?.activeReferrals || 0,
          totalEarnings: statsData.data?.totalEarnings || 0,
          pendingEarnings: statsData.data?.pendingEarnings || 0,
          claimableAmount: statsData.data?.claimableAmount || 0,
          totalClaimed: statsData.data?.totalClaimed || 0,
          lastClaimAt: statsData.data?.lastClaimAt || null,
          referralLink: `${baseUrl}?ref=${referralCode}`,
          canClaim: statsData.data?.canClaim ?? (statsData.data?.claimableAmount > 0),
          cooldownActive: statsData.data?.cooldownActive || false,
          cooldownRemaining: statsData.data?.cooldownRemaining || 0,
          minClaimAmount: statsData.data?.minClaimAmount || 0.01,
          sharePercent: statsData.data?.sharePercent || 50,
        })
      } else {
        const errorMsg = typeof codeData.error === 'string' 
          ? codeData.error 
          : typeof statsData.error === 'string'
            ? statsData.error
            : "Failed to load referral data"
        setError(errorMsg)
      }
    } catch (error) {
      console.error("[REFERRAL] Failed to load stats:", error)
      setError("Failed to load referral data")
    }

    setIsLoading(false)
    setIsRefreshing(false)
  }, [activeWallet])

  // Initial load
  useEffect(() => {
    loadStats()
  }, [loadStats])

  // Set up polling for real-time updates
  useEffect(() => {
    if (!isAuthenticated || !activeWallet) return

    // Start polling
    pollingRef.current = setInterval(() => {
      loadStats(false) // Silent refresh
    }, POLLING_INTERVAL)

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
      }
    }
  }, [isAuthenticated, activeWallet, loadStats])

  // Copy referral link
  const handleCopy = async () => {
    if (!stats) return

    try {
      await navigator.clipboard.writeText(stats.referralLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error("[REFERRAL] Failed to copy:", error)
    }
  }

  // Manual refresh
  const handleRefresh = () => {
    loadStats(true)
  }

  // Claim earnings
  const handleClaim = async () => {
    if (!activeWallet || !stats || stats.claimableAmount <= 0) return

    setIsClaiming(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const response = await fetch("/api/referral/claim", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-wallet-address": activeWallet.public_key,
        },
        body: JSON.stringify({
          wallet_address: activeWallet.public_key,
          destinationWallet: activeWallet.public_key,
        }),
      })

      const data = await response.json()

      if (data.success) {
        // Update stats with successful claim
        setStats((prev) =>
          prev
            ? {
                ...prev,
                claimableAmount: 0,
                pendingEarnings: 0,
                totalClaimed: (prev.totalClaimed || 0) + (prev.claimableAmount || 0),
                lastClaimAt: new Date().toISOString(),
                canClaim: false,
                cooldownActive: true,
              }
            : null
        )
        setSuccessMessage(data.data?.message || `Successfully claimed ${data.data?.amountFormatted}!`)
        
        // Clear success message after 5 seconds
        setTimeout(() => setSuccessMessage(null), 5000)
        
        // Refresh stats after a short delay
        setTimeout(() => loadStats(false), 2000)
      } else {
        setError(data.error || "Failed to claim earnings")
      }
    } catch (error) {
      console.error("[REFERRAL] Failed to claim:", error)
      setError("Failed to claim earnings. Please try again.")
    }

    setIsClaiming(false)
  }

  // Format cooldown time
  const formatCooldown = (ms: number): string => {
    if (ms <= 0) return ""
    const minutes = Math.floor(ms / 60000)
    const hours = Math.floor(minutes / 60)
    if (hours > 0) return `${hours}h ${minutes % 60}m`
    return `${minutes}m`
  }

  if (!isAuthenticated) {
    return (
      <div className="bg-black/30 rounded-xl border border-white/10 p-6 text-center">
        <Users className="w-12 h-12 text-white/20 mx-auto mb-4" />
        <p className="text-white/50">Connect wallet to view referral program</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="bg-black/30 rounded-xl border border-white/10 p-6 flex items-center justify-center min-h-[300px]">
        <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-black/30 rounded-xl border border-white/10 overflow-hidden"
    >
      {/* Header */}
      <div className="p-6 border-b border-white/10 bg-gradient-to-r from-cyan-500/10 to-blue-500/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-cyan-500/20 flex items-center justify-center">
              <Gift className="w-6 h-6 text-cyan-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Refer & Earn</h3>
              <p className="text-white/50 text-sm">
                Share your link. Get {stats?.sharePercent || 50}% of their trading fees. Easy money.
              </p>
            </div>
          </div>
          <Button
            onClick={handleRefresh}
            variant="ghost"
            size="sm"
            className="text-white/50 hover:text-white"
            disabled={isRefreshing}
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Referral Link */}
      <div className="p-6 border-b border-white/10">
        <label className="block text-sm text-white/60 mb-2">Your Referral Link</label>
        <div className="flex gap-2">
          <Input
            value={stats?.referralLink || ""}
            readOnly
            className="flex-1 bg-white/5 border-white/10 text-white font-mono text-sm"
          />
          <Button
            onClick={handleCopy}
            variant="outline"
            className="border-white/10 text-white hover:bg-white/5"
          >
            {copied ? (
              <Check className="w-4 h-4 text-green-400" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-white/40 mt-2">
          Code: <span className="text-cyan-400 font-mono">{stats?.referralCode}</span>
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 border-b border-white/10">
        <div className="text-center">
          <div className="text-2xl font-bold text-white mb-1">
            {stats?.totalReferred || 0}
          </div>
          <div className="text-xs text-white/50 flex items-center justify-center gap-1">
            <Users className="w-3 h-3" />
            Total Referred
          </div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-green-400 mb-1">
            {stats?.activeReferrals || 0}
          </div>
          <div className="text-xs text-white/50 flex items-center justify-center gap-1">
            <TrendingUp className="w-3 h-3" />
            Active
          </div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-white mb-1">
            {(stats?.totalEarnings || 0).toFixed(4)}
          </div>
          <div className="text-xs text-white/50 flex items-center justify-center gap-1">
            <Coins className="w-3 h-3" />
            Total Earned (SOL)
          </div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-cyan-400 mb-1">
            {(stats?.claimableAmount || 0).toFixed(4)}
          </div>
          <div className="text-xs text-white/50 flex items-center justify-center gap-1">
            <Gift className="w-3 h-3" />
            Claimable (SOL)
          </div>
        </div>
      </div>

      {/* Claim Section */}
      <div className="p-6">
        {/* Success Message */}
        {successMessage && (
          <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-sm">
            {successMessage}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-white font-medium">Claimable Earnings</p>
            <p className="text-3xl font-bold text-cyan-400">
              {(stats?.claimableAmount || 0).toFixed(4)} SOL
            </p>
            {stats?.cooldownActive && stats.cooldownRemaining > 0 && (
              <p className="text-xs text-yellow-400 mt-1">
                Cooldown: {formatCooldown(stats.cooldownRemaining)} remaining
              </p>
            )}
            {stats?.minClaimAmount && stats.claimableAmount < stats.minClaimAmount && stats.claimableAmount > 0 && (
              <p className="text-xs text-white/50 mt-1">
                Min claim: {stats.minClaimAmount} SOL
              </p>
            )}
          </div>
          <Button
            onClick={handleClaim}
            disabled={isClaiming || !stats?.canClaim || (stats?.claimableAmount || 0) <= 0}
            className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-black font-medium px-6 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isClaiming ? (
              <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin mr-2" />
            ) : (
              <Coins className="w-4 h-4 mr-2" />
            )}
            Claim Now
          </Button>
        </div>

        {stats?.lastClaimAt && (
          <p className="text-xs text-white/40">
            Last claim: {new Date(stats.lastClaimAt).toLocaleString()}
          </p>
        )}

        {stats?.totalClaimed > 0 && (
          <p className="text-xs text-white/40 mt-1">
            Total claimed: {stats.totalClaimed.toFixed(4)} SOL
          </p>
        )}
      </div>

      {/* How it works */}
      <div className="p-6 bg-white/5 border-t border-white/10">
        <h4 className="text-sm font-medium text-white mb-3">3 Steps</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-full bg-cyan-500/20 flex items-center justify-center flex-shrink-0 text-cyan-400 text-xs font-bold">
              1
            </div>
            <p className="text-white/60">Copy your link above</p>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-full bg-cyan-500/20 flex items-center justify-center flex-shrink-0 text-cyan-400 text-xs font-bold">
              2
            </div>
            <p className="text-white/60">Drop it in your group chats</p>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-full bg-cyan-500/20 flex items-center justify-center flex-shrink-0 text-cyan-400 text-xs font-bold">
              3
            </div>
            <p className="text-white/60">Stack SOL when they trade</p>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
