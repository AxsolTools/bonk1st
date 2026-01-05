"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { createClient } from "@/lib/supabase/client"
import { GlassPanel } from "@/components/ui/glass-panel"
import { useAuth } from "@/components/providers/auth-provider"
import { cn } from "@/lib/utils"

interface VouchSectionProps {
  tokenAddress: string
}

interface VoucherData {
  wallet_address: string
  vouched_at: string
  vote_type: 'up' | 'down' | null
}

export function BoostSection({ tokenAddress }: VouchSectionProps) {
  const { activeWallet, isAuthenticated, setIsOnboarding } = useAuth()
  const [totalVouches, setTotalVouches] = useState(0)
  const [totalShits, setTotalShits] = useState(0)
  const [hasVouched, setHasVouched] = useState(false)
  const [hasShitted, setHasShitted] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isShitLoading, setIsShitLoading] = useState(false)
  const [topVouchers, setTopVouchers] = useState<VoucherData[]>([])
  const [topShitters, setTopShitters] = useState<VoucherData[]>([])

  useEffect(() => {
    fetchVouches()
  }, [tokenAddress, activeWallet])

  const fetchVouches = async () => {
    try {
      const supabase = createClient()

      // Get all votes for this token
      const { data: votesData, error } = await supabase
        .from("votes")
        .select("wallet_address, created_at, vote_type")
        .eq("token_address", tokenAddress)
        .order("created_at", { ascending: false })

      if (error) {
        console.debug('[VOUCH] Table query error:', error.message)
        return
      }

      if (votesData) {
        // Separate vouches (up/null) from shits (down)
        const vouches = votesData.filter(v => v.vote_type !== 'down')
        const shits = votesData.filter(v => v.vote_type === 'down')
        
        setTotalVouches(vouches.length)
        setTotalShits(shits.length)
        
        setTopVouchers(vouches.slice(0, 5).map(v => ({
          wallet_address: v.wallet_address,
          vouched_at: v.created_at,
          vote_type: v.vote_type || 'up'
        })))
        
        setTopShitters(shits.slice(0, 5).map(v => ({
          wallet_address: v.wallet_address,
          vouched_at: v.created_at,
          vote_type: 'down'
        })))

        // Check if user has vouched or shitted
        if (activeWallet) {
          const userVote = votesData.find(v => v.wallet_address === activeWallet.public_key)
          if (userVote) {
            if (userVote.vote_type === 'down') {
              setHasShitted(true)
              setHasVouched(false)
            } else {
              setHasVouched(true)
              setHasShitted(false)
            }
          } else {
            setHasVouched(false)
            setHasShitted(false)
          }
        }
      }
    } catch (error) {
      console.debug('[VOUCH] Failed to fetch vouches:', error)
    }
  }

  const handleVouch = async () => {
    if (!isAuthenticated) {
      setIsOnboarding(true)
      return
    }

    if (!activeWallet || isLoading) return

    setIsLoading(true)

    try {
      const supabase = createClient()

      if (hasVouched) {
        // Remove vouch (from votes table)
        const { error } = await supabase
          .from("votes")
          .delete()
          .eq("token_address", tokenAddress)
          .eq("wallet_address", activeWallet.public_key)

        if (error) {
          console.error('[VOUCH] Delete error:', error)
          return
        }

        setHasVouched(false)
        setTotalVouches(prev => Math.max(0, prev - 1))
      } else {
        // If user had shitted, remove it first
        if (hasShitted) {
          await supabase
            .from("votes")
            .delete()
            .eq("token_address", tokenAddress)
            .eq("wallet_address", activeWallet.public_key)
          setTotalShits(prev => Math.max(0, prev - 1))
          setHasShitted(false)
        }
        
        // Add vouch (to votes table)
        const { error } = await supabase
          .from("votes")
          .upsert({
            token_address: tokenAddress,
            wallet_address: activeWallet.public_key,
            vote_type: 'up'
          }, { onConflict: 'token_address,wallet_address' })

        if (error) {
          console.error('[VOUCH] Insert error:', error)
          return
        }

        setHasVouched(true)
        setTotalVouches(prev => prev + 1)
      }

      // Refresh data
      fetchVouches()
    } catch (error) {
      console.error('[VOUCH] Failed to vouch:', error)
    }

    setIsLoading(false)
  }

  const handleShit = async () => {
    if (!isAuthenticated) {
      setIsOnboarding(true)
      return
    }

    if (!activeWallet || isShitLoading) return

    setIsShitLoading(true)

    try {
      const supabase = createClient()

      if (hasShitted) {
        // Remove shit vote
        const { error } = await supabase
          .from("votes")
          .delete()
          .eq("token_address", tokenAddress)
          .eq("wallet_address", activeWallet.public_key)

        if (error) {
          console.error('[SHIT] Delete error:', error)
          return
        }

        setHasShitted(false)
        setTotalShits(prev => Math.max(0, prev - 1))
      } else {
        // If user had vouched, remove it first
        if (hasVouched) {
          await supabase
            .from("votes")
            .delete()
            .eq("token_address", tokenAddress)
            .eq("wallet_address", activeWallet.public_key)
          setTotalVouches(prev => Math.max(0, prev - 1))
          setHasVouched(false)
        }
        
        // Add shit vote
        const { error } = await supabase
          .from("votes")
          .upsert({
            token_address: tokenAddress,
            wallet_address: activeWallet.public_key,
            vote_type: 'down'
          }, { onConflict: 'token_address,wallet_address' })

        if (error) {
          console.error('[SHIT] Insert error:', error)
          return
        }

        setHasShitted(true)
        setTotalShits(prev => prev + 1)
      }

      // Refresh data
      fetchVouches()
    } catch (error) {
      console.error('[SHIT] Failed to shit:', error)
    }

    setIsShitLoading(false)
  }

  const formatAddress = (addr: string) => `${addr.slice(0, 4)}...${addr.slice(-4)}`
  
  const formatTime = (date: string) => {
    const d = new Date(date)
    const now = new Date()
    const diff = (now.getTime() - d.getTime()) / 1000

    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return d.toLocaleDateString()
  }

  return (
    <GlassPanel className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">Community Sentiment</h3>
          <p className="text-sm text-[var(--text-muted)] mt-1">Show your opinion on this token</p>
        </div>
        <div className="flex gap-4 text-right">
          <div>
            <p className="text-xl font-bold text-[var(--aqua-primary)]">{totalVouches.toLocaleString()}</p>
            <p className="text-[10px] text-[var(--text-muted)]">Vouches</p>
          </div>
          <div>
            <p className="text-xl font-bold text-[var(--error)]">{totalShits.toLocaleString()}</p>
            <p className="text-[10px] text-[var(--text-muted)]">Shits</p>
          </div>
        </div>
      </div>

      {/* Vouch & Shit Buttons */}
      <div className="flex gap-3 mb-4">
        <motion.button
          onClick={handleVouch}
          disabled={isLoading}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          className={cn(
            "flex-1 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2",
            hasVouched
              ? "bg-[var(--aqua-primary)] text-[var(--ocean-deep)]"
              : "border-2 border-dashed border-[var(--aqua-primary)]/40 text-[var(--aqua-primary)] hover:border-[var(--aqua-primary)] hover:bg-[var(--aqua-primary)]/10"
          )}
        >
          {isLoading ? (
            <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
          ) : (
            <>
              <svg 
                width="18" 
                height="18" 
                viewBox="0 0 24 24" 
                fill={hasVouched ? "currentColor" : "none"} 
                stroke="currentColor" 
                strokeWidth="2"
              >
                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
              </svg>
              {hasVouched ? "Vouched!" : "Vouch"}
            </>
          )}
        </motion.button>

        <motion.button
          onClick={handleShit}
          disabled={isShitLoading}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          className={cn(
            "flex-1 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2",
            hasShitted
              ? "bg-[var(--error)] text-white"
              : "border-2 border-dashed border-[var(--error)]/40 text-[var(--error)] hover:border-[var(--error)] hover:bg-[var(--error)]/10"
          )}
        >
          {isShitLoading ? (
            <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
          ) : (
            <>
              <span className="text-lg">💩</span>
              {hasShitted ? "Shitcoin!" : "Shit Coin"}
            </>
          )}
        </motion.button>
      </div>

      {hasVouched && (
        <p className="text-sm text-[var(--aqua-primary)] mb-3 text-center">
          You&apos;re vouching for this token ✓
        </p>
      )}

      {hasShitted && (
        <p className="text-sm text-[var(--error)] mb-3 text-center">
          You think this is a shitcoin 💩
        </p>
      )}

      {/* Recent Vouchers & Shitters */}
      <div className="grid grid-cols-2 gap-4">
        {/* Recent Vouchers */}
        <div>
          <h4 className="text-xs font-medium text-[var(--text-muted)] mb-2 uppercase tracking-wider">Recent Vouchers</h4>
          {topVouchers.length > 0 ? (
            <div className="space-y-1.5">
              <AnimatePresence>
                {topVouchers.map((voucher, i) => (
                  <motion.div
                    key={voucher.wallet_address}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-[var(--ocean-surface)]/30"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-[var(--aqua-primary)]/20 flex items-center justify-center">
                        <svg className="w-3 h-3 text-[var(--aqua-primary)]" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                        </svg>
                      </div>
                      <span className="text-xs font-mono text-[var(--text-primary)]">
                        {formatAddress(voucher.wallet_address)}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          ) : (
            <p className="text-xs text-[var(--text-muted)] text-center py-4">No vouches yet</p>
          )}
        </div>

        {/* Recent Shitters */}
        <div>
          <h4 className="text-xs font-medium text-[var(--text-muted)] mb-2 uppercase tracking-wider">Recent Shitters</h4>
          {topShitters.length > 0 ? (
            <div className="space-y-1.5">
              <AnimatePresence>
                {topShitters.map((shitter, i) => (
                  <motion.div
                    key={shitter.wallet_address}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-[var(--ocean-surface)]/30"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-[var(--error)]/20 flex items-center justify-center">
                        <span className="text-xs">💩</span>
                      </div>
                      <span className="text-xs font-mono text-[var(--text-primary)]">
                        {formatAddress(shitter.wallet_address)}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          ) : (
            <p className="text-xs text-[var(--text-muted)] text-center py-4">No shits yet</p>
          )}
        </div>
      </div>
    </GlassPanel>
  )
}
