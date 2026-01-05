"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useAuth } from "@/components/providers/auth-provider"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

interface VoteBoostPanelProps {
  tokenAddress: string
  tokenName: string
}

// Boost tier options: SOL amount = boost count
const BOOST_TIERS = [
  { sol: 0.1, boosts: 1, label: "1 Boost" },
  { sol: 0.5, boosts: 5, label: "5 Boosts" },
  { sol: 1, boosts: 10, label: "10 Boosts" },
  { sol: 5, boosts: 50, label: "50 Boosts" },
]

export function VoteBoostPanel({ tokenAddress, tokenName }: VoteBoostPanelProps) {
  const { wallets, activeWallet, isAuthenticated, setIsOnboarding, sessionId } = useAuth()
  const [vouchCount, setVouchCount] = useState(0)
  const [shitCount, setShitCount] = useState(0)
  const [boostCount, setBoostCount] = useState(0)
  const [hasVouched, setHasVouched] = useState(false)
  const [hasShitted, setHasShitted] = useState(false)
  const [isVouching, setIsVouching] = useState(false)
  const [isShitting, setIsShitting] = useState(false)
  const [selectedTier, setSelectedTier] = useState(0) // Index of selected tier
  const [showBoostModal, setShowBoostModal] = useState(false)
  const [selectedWalletId, setSelectedWalletId] = useState<string>("")
  const [isBoosting, setIsBoosting] = useState(false)
  const [boostError, setBoostError] = useState<string | null>(null)
  const [boostSuccess, setBoostSuccess] = useState(false)
  const [walletBalances, setWalletBalances] = useState<Record<string, number>>({})

  // Set default wallet when modal opens
  useEffect(() => {
    if (showBoostModal && activeWallet && !selectedWalletId) {
      setSelectedWalletId(activeWallet.id)
    }
  }, [showBoostModal, activeWallet, selectedWalletId])

  // Fetch wallet balances when modal opens
  useEffect(() => {
    if (showBoostModal && wallets.length > 0) {
      fetchWalletBalances()
    }
  }, [showBoostModal, wallets])

  useEffect(() => {
    fetchCounts()
    if (activeWallet) {
      checkUserVotes()
    }
  }, [tokenAddress, activeWallet])

  const fetchWalletBalances = async () => {
    try {
      const addresses = wallets.map(w => w.public_key)
      const response = await fetch("/api/wallet/balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addresses }),
      })
      const data = await response.json()
      if (data.success && data.data?.balances) {
        const balances: Record<string, number> = {}
        data.data.balances.forEach((b: { address: string; balanceSol: number }) => {
          const wallet = wallets.find(w => w.public_key === b.address)
          if (wallet) {
            balances[wallet.id] = b.balanceSol || 0
          }
        })
        setWalletBalances(balances)
      }
    } catch (error) {
      console.debug('[BOOST] Failed to fetch balances:', error)
    }
  }

  const fetchCounts = async () => {
    try {
      const supabase = createClient()
      
      // Get vouch count (vote_type = 'up' or null)
      const { count: vouchCountResult } = await supabase
        .from("votes")
        .select("*", { count: "exact", head: true })
        .eq("token_address", tokenAddress)
        .or("vote_type.eq.up,vote_type.is.null")
      
      // Get shit count (vote_type = 'down')
      const { count: shitCountResult } = await supabase
        .from("votes")
        .select("*", { count: "exact", head: true })
        .eq("token_address", tokenAddress)
        .eq("vote_type", "down")
      
      // Get boost count
      const { count: boostCountResult } = await supabase
        .from("boosts")
        .select("*", { count: "exact", head: true })
        .eq("token_address", tokenAddress)
      
      setVouchCount(vouchCountResult || 0)
      setShitCount(shitCountResult || 0)
      setBoostCount(boostCountResult || 0)
    } catch (err) {
      console.debug('[VOTE-BOOST] Database unavailable:', err)
    }
  }

  const checkUserVotes = async () => {
    if (!activeWallet) return

    try {
      const supabase = createClient()
      
      // Check if user has vouched (up vote)
      const { data: vouchData } = await supabase
        .from("votes")
        .select("vote_type")
        .eq("token_address", tokenAddress)
        .eq("wallet_address", activeWallet.public_key)
        .maybeSingle()
      
      if (vouchData) {
        if (vouchData.vote_type === 'down') {
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
    } catch (err) {
      console.debug('[VOTES] Vote check unavailable:', err)
      setHasVouched(false)
      setHasShitted(false)
    }
  }

  const handleVouch = async () => {
    if (!isAuthenticated) {
      setIsOnboarding(true)
      return
    }

    if (!activeWallet || isVouching) return

    setIsVouching(true)

    try {
      const supabase = createClient()
      
      if (hasVouched) {
        // Remove vouch
        await supabase
          .from("votes")
          .delete()
          .eq("token_address", tokenAddress)
          .eq("wallet_address", activeWallet.public_key)
        
        setHasVouched(false)
        setVouchCount((prev) => Math.max(0, prev - 1))
      } else {
        // If user had a shit vote, remove it first
        if (hasShitted) {
          await supabase
            .from("votes")
            .delete()
            .eq("token_address", tokenAddress)
            .eq("wallet_address", activeWallet.public_key)
          setShitCount((prev) => Math.max(0, prev - 1))
          setHasShitted(false)
        }
        
        // Add vouch
        await supabase
          .from("votes")
          .upsert({
            token_address: tokenAddress,
            wallet_address: activeWallet.public_key,
            vote_type: 'up'
          }, { onConflict: 'token_address,wallet_address' })
        
        setHasVouched(true)
        setVouchCount((prev) => prev + 1)
      }
    } catch (err) {
      console.debug('[VOTES] Vote operation failed:', err)
    }

    setIsVouching(false)
  }

  const handleShit = async () => {
    if (!isAuthenticated) {
      setIsOnboarding(true)
      return
    }

    if (!activeWallet || isShitting) return

    setIsShitting(true)

    try {
      const supabase = createClient()
      
      if (hasShitted) {
        // Remove shit vote
        await supabase
          .from("votes")
          .delete()
          .eq("token_address", tokenAddress)
          .eq("wallet_address", activeWallet.public_key)
        
        setHasShitted(false)
        setShitCount((prev) => Math.max(0, prev - 1))
      } else {
        // If user had a vouch, remove it first
        if (hasVouched) {
          await supabase
            .from("votes")
            .delete()
            .eq("token_address", tokenAddress)
            .eq("wallet_address", activeWallet.public_key)
          setVouchCount((prev) => Math.max(0, prev - 1))
          setHasVouched(false)
        }
        
        // Add shit vote
        await supabase
          .from("votes")
          .upsert({
            token_address: tokenAddress,
            wallet_address: activeWallet.public_key,
            vote_type: 'down'
          }, { onConflict: 'token_address,wallet_address' })
        
        setHasShitted(true)
        setShitCount((prev) => prev + 1)
      }
    } catch (err) {
      console.debug('[VOTES] Shit vote operation failed:', err)
    }

    setIsShitting(false)
  }

  const handleBoost = async () => {
    if (!isAuthenticated) {
      setIsOnboarding(true)
      return
    }

    if (!selectedWalletId || isBoosting) return

    const selectedWallet = wallets.find(w => w.id === selectedWalletId)
    if (!selectedWallet) {
      setBoostError("Please select a wallet")
      return
    }

    const tier = BOOST_TIERS[selectedTier]
    const balance = walletBalances[selectedWalletId] || 0
    
    if (balance < tier.sol) {
      setBoostError(`Insufficient balance. You have ${balance.toFixed(4)} SOL`)
      return
    }

    setIsBoosting(true)
    setBoostError(null)

    try {
      const response = await fetch('/api/boosts', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-session-id': sessionId || '',
          'x-wallet-address': selectedWallet.public_key,
        },
        body: JSON.stringify({
          tokenAddress,
          walletAddress: selectedWallet.public_key,
          amount: tier.sol,
          boostCount: tier.boosts, // Number of boosts to add
        }),
      })

      const data = await response.json()

      if (data.success) {
        setBoostSuccess(true)
        setBoostCount((prev) => prev + tier.boosts)
        // Refresh balances
        fetchWalletBalances()
        // Close modal after 2 seconds
        setTimeout(() => {
          setShowBoostModal(false)
          setBoostSuccess(false)
        }, 2000)
      } else {
        setBoostError(data.error || "Failed to boost")
      }
    } catch (err) {
      console.error('[BOOST] Boost failed:', err)
      setBoostError("Failed to process boost payment")
    }

    setIsBoosting(false)
  }

  const openBoostModal = () => {
    if (!isAuthenticated) {
      setIsOnboarding(true)
      return
    }
    setBoostError(null)
    setBoostSuccess(false)
    setSelectedTier(0)
    setShowBoostModal(true)
  }

  const tier = BOOST_TIERS[selectedTier]

  return (
    <div className="glass-panel rounded-xl p-4 h-full">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Community</h3>
        <span className="text-[10px] text-[var(--text-muted)]">Show your support</span>
      </div>

      {/* Horizontal layout: Vouch + Shit + Boost */}
      <div className="flex items-stretch gap-2">
        {/* Vouch Button (Free) */}
        <motion.button
          onClick={handleVouch}
          disabled={isVouching}
          whileTap={{ scale: 0.95 }}
          className={cn(
            "flex-1 flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border transition-all",
            hasVouched
              ? "border-[var(--aqua-primary)] bg-[var(--aqua-primary)]/10"
              : "border-[var(--glass-border)] hover:border-[var(--aqua-primary)]/50",
          )}
        >
          <motion.div animate={hasVouched ? { scale: [1, 1.2, 1] } : {}} transition={{ duration: 0.3 }}>
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill={hasVouched ? "var(--aqua-primary)" : "none"}
              stroke="var(--aqua-primary)"
              strokeWidth="2"
            >
              <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
            </svg>
          </motion.div>
          <div className="text-center">
            <span className="text-lg font-bold text-[var(--text-primary)] font-mono block">{vouchCount}</span>
            <span className="text-[10px] text-[var(--text-muted)]">{hasVouched ? "Vouched!" : "Vouch"}</span>
          </div>
        </motion.button>

        {/* Shit Coin Button (Free) */}
        <motion.button
          onClick={handleShit}
          disabled={isShitting}
          whileTap={{ scale: 0.95 }}
          className={cn(
            "flex-1 flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border transition-all",
            hasShitted
              ? "border-[var(--error)] bg-[var(--error)]/10"
              : "border-[var(--glass-border)] hover:border-[var(--error)]/50",
          )}
        >
          <motion.div animate={hasShitted ? { scale: [1, 1.2, 1] } : {}} transition={{ duration: 0.3 }}>
            <span className="text-2xl">{hasShitted ? "💩" : "💩"}</span>
          </motion.div>
          <div className="text-center">
            <span className="text-lg font-bold text-[var(--text-primary)] font-mono block">{shitCount}</span>
            <span className="text-[10px] text-[var(--text-muted)]">{hasShitted ? "Shitcoin!" : "Shit Coin"}</span>
          </div>
        </motion.button>

        {/* Boost Button (Paid) */}
        <motion.button
          onClick={openBoostModal}
          whileTap={{ scale: 0.95 }}
          className="flex-1 flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border border-[var(--glass-border)] hover:border-[var(--warm-orange)]/50 bg-gradient-to-br from-[var(--warm-orange)]/5 to-transparent transition-all"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--warm-orange)" strokeWidth="2">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div className="text-center">
            <span className="text-lg font-bold text-[var(--text-primary)] font-mono block">{boostCount}</span>
            <span className="text-[10px] text-[var(--warm-orange)]">Boost ⚡</span>
          </div>
        </motion.button>
      </div>

      {/* Boost Modal */}
      <AnimatePresence>
        {showBoostModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--ocean-abyss)]/80 backdrop-blur-sm"
            onClick={() => setShowBoostModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md glass-panel-elevated rounded-2xl p-6"
            >
              {boostSuccess ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--green)]/20 flex items-center justify-center">
                    <svg className="w-8 h-8 text-[var(--green)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">Boost Successful!</h3>
                  <p className="text-sm text-[var(--text-secondary)]">
                    You added <span className="font-bold text-[var(--warm-orange)]">{tier.boosts} boosts</span> to {tokenName}
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--warm-orange)]/20 to-[var(--warm-coral)]/20 flex items-center justify-center">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--warm-orange)" strokeWidth="2">
                        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-[var(--text-primary)]">Boost {tokenName}</h3>
                      <p className="text-sm text-[var(--text-muted)]">Pay SOL to boost this token&apos;s visibility</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {/* Boost Tier Selection */}
                    <div>
                      <label className="text-sm text-[var(--text-muted)] mb-3 block">Select Boost Package</label>
                      <div className="grid grid-cols-2 gap-3">
                        {BOOST_TIERS.map((t, i) => (
                          <button
                            key={i}
                            onClick={() => setSelectedTier(i)}
                            className={cn(
                              "p-4 rounded-xl border-2 transition-all text-left",
                              selectedTier === i
                                ? "border-[var(--warm-orange)] bg-[var(--warm-orange)]/10"
                                : "border-[var(--glass-border)] hover:border-[var(--warm-orange)]/50",
                            )}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-lg font-bold text-[var(--warm-orange)]">{t.sol} SOL</span>
                              <svg 
                                width="16" 
                                height="16" 
                                viewBox="0 0 24 24" 
                                fill={selectedTier === i ? "var(--warm-orange)" : "none"} 
                                stroke="var(--warm-orange)" 
                                strokeWidth="2"
                              >
                                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </div>
                            <span className="text-sm text-[var(--text-secondary)]">+{t.boosts} Boosts</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Wallet Selection */}
                    <div>
                      <label className="text-sm text-[var(--text-muted)] mb-2 block">Pay from Wallet</label>
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {wallets.map((wallet) => {
                          const balance = walletBalances[wallet.id] || 0
                          const hasEnough = balance >= tier.sol
                          return (
                            <button
                              key={wallet.id}
                              onClick={() => setSelectedWalletId(wallet.id)}
                              disabled={!hasEnough}
                              className={cn(
                                "w-full flex items-center justify-between p-3 rounded-xl border transition-all",
                                selectedWalletId === wallet.id
                                  ? "border-[var(--warm-orange)] bg-[var(--warm-orange)]/10"
                                  : hasEnough
                                    ? "border-[var(--glass-border)] hover:border-[var(--warm-orange)]/50"
                                    : "border-[var(--glass-border)] opacity-50 cursor-not-allowed",
                              )}
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-[var(--ocean-surface)] flex items-center justify-center">
                                  <svg className="w-4 h-4 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                                  </svg>
                                </div>
                                <div className="text-left">
                                  <p className="text-sm font-medium text-[var(--text-primary)]">
                                    {wallet.label || `${wallet.public_key.slice(0, 6)}...${wallet.public_key.slice(-4)}`}
                                  </p>
                                  <p className={cn(
                                    "text-xs",
                                    hasEnough ? "text-[var(--text-muted)]" : "text-[var(--red)]"
                                  )}>
                                    {balance.toFixed(4)} SOL {!hasEnough && "(insufficient)"}
                                  </p>
                                </div>
                              </div>
                              {selectedWalletId === wallet.id && (
                                <svg className="w-5 h-5 text-[var(--warm-orange)]" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Error Message */}
                    {boostError && (
                      <div className="p-3 rounded-xl bg-[var(--red)]/10 border border-[var(--red)]/30">
                        <p className="text-sm text-[var(--red)]">{boostError}</p>
                      </div>
                    )}

                    {/* Boost Button */}
                    <button
                      onClick={handleBoost}
                      disabled={isBoosting || !selectedWalletId}
                      className="w-full py-4 rounded-xl bg-gradient-to-r from-[var(--warm-orange)] to-[var(--warm-coral)] text-white font-semibold text-base disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-[0_0_30px_rgba(255,140,50,0.3)] transition-all"
                    >
                      {isBoosting ? (
                        <span className="flex items-center justify-center gap-2">
                          <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                          Processing...
                        </span>
                      ) : (
                        <span className="flex items-center justify-center gap-2">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                          </svg>
                          Boost with {tier.sol} SOL (+{tier.boosts} boosts)
                        </span>
                      )}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
