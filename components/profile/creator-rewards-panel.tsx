"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { motion } from "framer-motion"
import { Gift, RefreshCw, ExternalLink, Coins, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/components/providers/auth-provider"
import { GlassPanel } from "@/components/ui/glass-panel"
import { cn } from "@/lib/utils"
import { getAuthHeaders } from "@/lib/api"
import { createClient } from "@/lib/supabase/client"
import Link from "next/link"
import Image from "next/image"

interface TokenReward {
  tokenMint: string
  tokenName: string
  tokenSymbol: string
  imageUrl?: string
  poolType: 'pump' | 'bonk' | 'jupiter'
  balance: number
  hasRewards: boolean
  canClaim: boolean
  platformName: string
}

interface CreatorRewardsData {
  tokens: TokenReward[]
  totalRewards: number
  pumpVaultBalance: number
  bonkVaultBalance: number
  jupiterFeesTotal: number
}

// Polling interval for real-time updates (every 20 seconds)
const POLLING_INTERVAL = 20_000

export function CreatorRewardsPanel() {
  const [rewardsData, setRewardsData] = useState<CreatorRewardsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [claimingToken, setClaimingToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const { activeWallet, mainWallet, sessionId, userId, isAuthenticated } = useAuth()
  const pollingRef = useRef<NodeJS.Timeout | null>(null)
  const supabase = createClient()

  const walletAddress = activeWallet?.public_key || mainWallet?.public_key

  // Fetch creator rewards for all tokens
  const fetchRewards = useCallback(async (showRefreshing = false) => {
    if (!walletAddress) {
      console.log(`[REWARDS-DEBUG] No wallet address, skipping fetch`)
      return
    }

    console.log(`[REWARDS-DEBUG] Fetching rewards for wallet: ${walletAddress.slice(0, 8)}...`)

    if (showRefreshing) {
      setIsRefreshing(true)
    }
    setError(null)

    try {
      // First, get all tokens created by this wallet from Supabase
      const { data: tokens, error: tokensError } = await supabase
        .from("tokens")
        .select("id, mint_address, name, symbol, image_url, pool_type, creator_wallet")
        .eq("creator_wallet", walletAddress)
        .order("created_at", { ascending: false })
      
      console.log(`[REWARDS-DEBUG] Tokens query result:`, {
        count: tokens?.length || 0,
        error: tokensError?.message,
        tokens: tokens?.map(t => ({
          mint: t.mint_address?.slice(0, 8) + '...',
          name: t.name,
          pool_type: t.pool_type,
          creator: t.creator_wallet?.slice(0, 8) + '...',
        })),
      })

      if (tokensError) {
        throw new Error("Failed to fetch tokens")
      }

      // Fetch rewards for each token
      console.log(`[REWARDS-DEBUG] Fetching rewards for ${tokens.length} tokens...`)
      const tokenRewards: TokenReward[] = []
      let pumpVaultCounted = false
      let bonkVaultCounted = false
      let pumpVaultBalance = 0
      let bonkVaultBalance = 0
      let jupiterFeesTotal = 0

      for (const token of tokens) {
        try {
          const apiUrl = `/api/creator-rewards?tokenMint=${token.mint_address}&creatorWallet=${walletAddress}&poolType=${token.pool_type || 'pump'}`
          console.log(`[REWARDS-DEBUG] Fetching: ${token.symbol} (${token.pool_type || 'pump'})`)
          
          const rewardsResponse = await fetch(apiUrl)
          const data = await rewardsResponse.json()
          
          console.log(`[REWARDS-DEBUG] Response for ${token.symbol}:`, {
            success: data.success,
            poolType: data.data?.poolType,
            balance: data.data?.balance,
            hasRewards: data.data?.hasRewards,
            canClaim: data.data?.canClaimViaPumpPortal || data.data?.canClaimViaJupiter,
            vaultAddress: data.data?.vaultAddress?.slice(0, 12) + '...' || 'none',
            platformName: data.data?.platformName,
          })
          
          if (data.success && data.data) {
            const reward: TokenReward = {
              tokenMint: token.mint_address,
              tokenName: token.name,
              tokenSymbol: token.symbol,
              imageUrl: token.image_url,
              poolType: data.data.poolType || 'pump',
              balance: data.data.balance || 0,
              hasRewards: data.data.hasRewards,
              canClaim: data.data.canClaimViaPumpPortal || data.data.canClaimViaJupiter,
              platformName: data.data.platformName || 'Pump.fun',
            }
            tokenRewards.push(reward)

            // Track vault balances (pump/bonk are per-creator, jupiter is per-token)
            if (reward.poolType === 'jupiter') {
              jupiterFeesTotal += reward.balance
              console.log(`[REWARDS-DEBUG] Jupiter token: +${reward.balance.toFixed(6)} SOL`)
            } else if (reward.poolType === 'pump' && !pumpVaultCounted) {
              pumpVaultBalance = reward.balance
              pumpVaultCounted = true
              console.log(`[REWARDS-DEBUG] Pump.fun vault (shared): ${reward.balance.toFixed(6)} SOL`)
            } else if (reward.poolType === 'bonk' && !bonkVaultCounted) {
              bonkVaultBalance = reward.balance
              bonkVaultCounted = true
              console.log(`[REWARDS-DEBUG] Bonk.fun vault (shared): ${reward.balance.toFixed(6)} SOL`)
            }
          }
        } catch (tokenError) {
          console.error(`[REWARDS-DEBUG] ❌ Failed to fetch rewards for ${token.symbol}:`, tokenError)
        }
      }

      const totalRewards = pumpVaultBalance + bonkVaultBalance + jupiterFeesTotal

      setRewardsData({
        tokens: tokenRewards,
        totalRewards,
        pumpVaultBalance,
        bonkVaultBalance,
        jupiterFeesTotal,
      })
    } catch (err) {
      console.error("[REWARDS] Failed to fetch creator rewards:", err)
      setError("Failed to load creator rewards")
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [walletAddress, supabase])

  // Initial load and polling
  useEffect(() => {
    if (isAuthenticated && walletAddress) {
      fetchRewards()

      // Start polling for updates
      pollingRef.current = setInterval(() => {
        fetchRewards(false)
      }, POLLING_INTERVAL)

      return () => {
        if (pollingRef.current) {
          clearInterval(pollingRef.current)
          pollingRef.current = null
        }
      }
    }
  }, [isAuthenticated, walletAddress, fetchRewards])

  // Claim rewards for a specific token
  const handleClaim = async (tokenMint: string, amount: number, poolType?: string) => {
    console.log(`[CLAIM-DEBUG] Starting claim:`, {
      tokenMint: tokenMint.slice(0, 8) + '...',
      amount,
      poolType,
      walletAddress: walletAddress?.slice(0, 8) + '...',
      sessionId: sessionId?.slice(0, 8) + '...',
      userId: userId?.slice(0, 8) + '...',
    })

    if (!walletAddress || !sessionId) {
      console.error(`[CLAIM-DEBUG] Missing auth: wallet=${!!walletAddress} session=${!!sessionId}`)
      return
    }

    setClaimingToken(tokenMint)
    setError(null)
    setSuccessMessage(null)

    try {
      const requestBody = {
        tokenMint,
        walletAddress,
        poolType: poolType || undefined,
      }
      console.log(`[CLAIM-DEBUG] Request body:`, requestBody)

      const response = await fetch("/api/creator-rewards", {
        method: "POST",
        headers: getAuthHeaders({
          sessionId,
          walletAddress,
          userId: userId || sessionId,
        }),
        body: JSON.stringify(requestBody),
      })

      const data = await response.json()
      console.log(`[CLAIM-DEBUG] Response:`, { status: response.status, data })

      if (data.success) {
        console.log(`[CLAIM-DEBUG] ✅ Claim successful:`, data.data)
        setSuccessMessage(`Successfully claimed ${data.data?.amountClaimed?.toFixed(6) || amount.toFixed(6)} SOL!`)
        // Refresh rewards data
        setTimeout(() => {
          fetchRewards(false)
          setSuccessMessage(null)
        }, 3000)
      } else {
        console.error(`[CLAIM-DEBUG] ❌ Claim failed:`, {
          error: data.error,
          debug: data.debug,
          claimUrl: data.data?.claimUrl,
        })
        // If claiming failed but we have a claim URL, open it
        if (data.data?.claimUrl) {
          window.open(data.data.claimUrl, "_blank")
          setError(data.error || "Opening platform to claim...")
        } else {
          setError(data.error || "Failed to claim rewards")
        }
      }
    } catch (err) {
      console.error("[CLAIM-DEBUG] Exception:", err)
      setError("Failed to claim rewards. Please try again.")
    }

    setClaimingToken(null)
  }

  // Manual refresh
  const handleRefresh = () => {
    fetchRewards(true)
  }

  const formatSOL = (value: number) => {
    if (value >= 1) return value.toFixed(4)
    if (value >= 0.0001) return value.toFixed(6)
    return value.toFixed(9)
  }

  if (!isAuthenticated) {
    return (
      <GlassPanel className="p-8 text-center">
        <Gift className="w-12 h-12 mx-auto mb-4 text-[var(--text-muted)]" />
        <p className="text-[var(--text-muted)]">Connect your wallet to view creator rewards</p>
      </GlassPanel>
    )
  }

  if (isLoading) {
    return (
      <GlassPanel className="p-8 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[var(--aqua-primary)] border-t-transparent rounded-full animate-spin" />
      </GlassPanel>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <Gift className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Creator Rewards</h2>
            <p className="text-xs text-[var(--text-muted)]">Claim fees from your created tokens</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
        </Button>
      </div>

      {/* Total Rewards Summary */}
      <GlassPanel className="p-4" glow="warm">
        <div className="grid grid-cols-4 gap-4">
          <div className="text-center">
            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-1">Total Claimable</p>
            <p className="text-xl font-bold text-amber-400">
              {formatSOL(rewardsData?.totalRewards || 0)}
              <span className="text-xs text-[var(--text-muted)] ml-1">SOL</span>
            </p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-1">Pump.fun Vault</p>
            <p className="text-lg font-semibold text-[var(--text-primary)]">
              {formatSOL(rewardsData?.pumpVaultBalance || 0)}
              <span className="text-[10px] text-[var(--text-muted)] ml-1">SOL</span>
            </p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-1">Bonk.fun Vault</p>
            <p className="text-lg font-semibold text-[var(--text-primary)]">
              {formatSOL(rewardsData?.bonkVaultBalance || 0)}
              <span className="text-[10px] text-[var(--text-muted)] ml-1">SOL</span>
            </p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-1">Jupiter DBC</p>
            <p className="text-lg font-semibold text-[var(--text-primary)]">
              {formatSOL(rewardsData?.jupiterFeesTotal || 0)}
              <span className="text-[10px] text-[var(--text-muted)] ml-1">SOL</span>
            </p>
          </div>
        </div>
      </GlassPanel>

      {/* Success/Error Messages */}
      {successMessage && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-sm"
        >
          {successMessage}
        </motion.div>
      )}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm"
        >
          {error}
        </motion.div>
      )}

      {/* Token List */}
      {rewardsData?.tokens && rewardsData.tokens.length > 0 ? (
        <div className="space-y-2">
          {rewardsData.tokens.filter(t => t.hasRewards).map((token) => (
            <GlassPanel 
              key={token.tokenMint} 
              className="p-4 hover:border-amber-500/30 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* Token Icon */}
                  <div className="relative w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 overflow-hidden">
                    {token.imageUrl ? (
                      <Image 
                        src={token.imageUrl} 
                        alt={token.tokenName} 
                        fill 
                        className="object-cover" 
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xs font-bold text-amber-400">
                          {token.tokenSymbol.slice(0, 2)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Token Info */}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[var(--text-primary)]">{token.tokenName}</span>
                      <span className={cn(
                        "text-[9px] px-1.5 py-0.5 rounded font-medium",
                        token.poolType === 'jupiter' ? "bg-green-500/20 text-green-400" :
                        token.poolType === 'bonk' ? "bg-orange-500/20 text-orange-400" :
                        "bg-purple-500/20 text-purple-400"
                      )}>
                        {token.platformName}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-muted)]">${token.tokenSymbol}</p>
                  </div>
                </div>

                {/* Rewards & Claim */}
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-lg font-bold text-amber-400">{formatSOL(token.balance)} SOL</p>
                    {token.poolType !== 'jupiter' && (
                      <p className="text-[9px] text-[var(--text-muted)]">(shared vault)</p>
                    )}
                  </div>
                  
                  <Button
                    size="sm"
                    onClick={() => handleClaim(token.tokenMint, token.balance)}
                    disabled={claimingToken === token.tokenMint || !token.canClaim}
                    className="bg-amber-500 text-zinc-900 hover:bg-amber-400 disabled:opacity-50"
                  >
                    {claimingToken === token.tokenMint ? (
                      <span className="flex items-center gap-1">
                        <div className="w-3 h-3 border border-zinc-900 border-t-transparent rounded-full animate-spin" />
                        Claiming...
                      </span>
                    ) : (
                      "Claim"
                    )}
                  </Button>
                </div>
              </div>
            </GlassPanel>
          ))}
        </div>
      ) : (
        <GlassPanel className="p-8 text-center">
          <Coins className="w-12 h-12 mx-auto mb-4 text-[var(--text-muted)]" />
          <p className="text-[var(--text-muted)] mb-2">No claimable rewards at this time</p>
          <p className="text-xs text-[var(--text-muted)]">
            Creator fees accumulate as your tokens are traded
          </p>
          <Link 
            href="/launch" 
            className="inline-flex items-center gap-2 mt-4 text-sm text-[var(--aqua-primary)] hover:underline"
          >
            <TrendingUp className="w-4 h-4" />
            Launch a token to start earning
          </Link>
        </GlassPanel>
      )}

      {/* Info Box */}
      <div className="p-3 rounded-lg bg-[var(--ocean-surface)] border border-[var(--glass-border)] text-xs text-[var(--text-muted)]">
        <p className="mb-1">
          <strong>Pump.fun & Bonk.fun:</strong> Rewards accumulate in a single vault per creator (shared across all your tokens).
        </p>
        <p>
          <strong>Jupiter:</strong> Each token has its own DBC pool with separate fees.
        </p>
      </div>
    </div>
  )
}

