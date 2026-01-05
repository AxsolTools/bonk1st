"use client"

import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/components/providers/auth-provider"
import { Header } from "@/components/layout/header"
import { LiquidBackground } from "@/components/visuals/liquid-background"
import { GlassPanel } from "@/components/ui/glass-panel"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import type { Token, Trade } from "@/lib/types/database"
import Link from "next/link"
import Image from "next/image"
import { motion } from "framer-motion"
import { ReferralPanel } from "@/components/profile/referral-panel"
import { PnLPanel } from "@/components/profile/pnl-panel"
import { CreatorRewardsPanel } from "@/components/profile/creator-rewards-panel"
import { 
  User, 
  Wallet, 
  CreditCard, 
  Coins, 
  ArrowUpDown, 
  Plus, 
  Copy,
  TrendingUp,
  TrendingDown,
  Gift
} from "lucide-react"

type TabType = "portfolio" | "pnl" | "created" | "rewards" | "activity" | "referrals" | "settings"

export default function ProfilePage() {
  const { isAuthenticated, isLoading, wallets, mainWallet, activeWallet, setIsOnboarding } = useAuth()
  const [activeTab, setActiveTab] = useState<TabType>("portfolio")
  const [createdTokens, setCreatedTokens] = useState<Token[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [walletBalances, setWalletBalances] = useState<Record<string, number>>({})
  const [balancesLoading, setBalancesLoading] = useState(false)
  
  // Trading settings state
  const [slippage, setSlippage] = useState<number>(1)
  const [customSlippage, setCustomSlippage] = useState<string>("")
  const [isCustomSlippage, setIsCustomSlippage] = useState(false)
  const [priorityFee, setPriorityFee] = useState<number>(0.0005)
  const [customPriorityFee, setCustomPriorityFee] = useState<string>("")
  const [isCustomPriorityFee, setIsCustomPriorityFee] = useState(false)
  const [jitoTip, setJitoTip] = useState<number>(0.0001)
  const [customJitoTip, setCustomJitoTip] = useState<string>("")
  const [isCustomJitoTip, setIsCustomJitoTip] = useState(false)

  const supabase = createClient()
  
  // Load settings from localStorage on mount
  useEffect(() => {
    const savedSlippage = localStorage.getItem("propel_slippage")
    const savedPriorityFee = localStorage.getItem("propel_priority_fee")
    const savedJitoTip = localStorage.getItem("propel_jito_tip")
    
    if (savedSlippage) {
      const slippageValue = parseFloat(savedSlippage)
      if ([0.1, 0.5, 1, 2, 3, 5, 10].includes(slippageValue)) {
        setSlippage(slippageValue)
        setIsCustomSlippage(false)
      } else {
        setSlippage(slippageValue)
        setCustomSlippage(savedSlippage)
        setIsCustomSlippage(true)
      }
    }
    
    if (savedPriorityFee) {
      const feeValue = parseFloat(savedPriorityFee)
      if ([0.00005, 0.0001, 0.0005, 0.001, 0.005].includes(feeValue)) {
        setPriorityFee(feeValue)
        setIsCustomPriorityFee(false)
      } else if (!isNaN(feeValue)) {
        setPriorityFee(feeValue)
        setCustomPriorityFee(savedPriorityFee)
        setIsCustomPriorityFee(true)
      }
    }
    
    if (savedJitoTip) {
      const tipValue = parseFloat(savedJitoTip)
      if ([0, 0.00005, 0.0001, 0.0005, 0.001].includes(tipValue)) {
        setJitoTip(tipValue)
        setIsCustomJitoTip(false)
      } else if (!isNaN(tipValue)) {
        setJitoTip(tipValue)
        setCustomJitoTip(savedJitoTip)
        setIsCustomJitoTip(true)
      }
    }
  }, [])
  
  // Save slippage to localStorage
  const handleSlippageChange = (value: number) => {
    setSlippage(value)
    setIsCustomSlippage(false)
    setCustomSlippage("")
    localStorage.setItem("propel_slippage", value.toString())
  }
  
  // Save custom slippage to localStorage
  const handleCustomSlippageChange = (value: string) => {
    setCustomSlippage(value)
    if (value && !isNaN(parseFloat(value)) && parseFloat(value) > 0) {
      const numValue = parseFloat(value)
      setSlippage(numValue)
      setIsCustomSlippage(true)
      localStorage.setItem("propel_slippage", numValue.toString())
    }
  }
  
  // Save priority fee to localStorage
  const handlePriorityFeeChange = (value: number) => {
      setPriorityFee(value)
      setIsCustomPriorityFee(false)
      setCustomPriorityFee("")
    localStorage.setItem("propel_priority_fee", value.toString())
  }
  
  // Save custom priority fee to localStorage
  const handleCustomPriorityFeeChange = (value: string) => {
    setCustomPriorityFee(value)
    if (value && !isNaN(parseFloat(value)) && parseFloat(value) >= 0) {
      const numValue = parseFloat(value)
      setPriorityFee(numValue)
      setIsCustomPriorityFee(true)
      localStorage.setItem("propel_priority_fee", value)
    }
  }
  
  // Save Jito tip to localStorage
  const handleJitoTipChange = (value: number) => {
    setJitoTip(value)
    setIsCustomJitoTip(false)
    setCustomJitoTip("")
    localStorage.setItem("propel_jito_tip", value.toString())
  }
  
  // Save custom Jito tip to localStorage
  const handleCustomJitoTipChange = (value: string) => {
    setCustomJitoTip(value)
    if (value && !isNaN(parseFloat(value)) && parseFloat(value) >= 0) {
      const numValue = parseFloat(value)
      setJitoTip(numValue)
      setIsCustomJitoTip(true)
      localStorage.setItem("propel_jito_tip", value)
    }
  }

  useEffect(() => {
    if (isAuthenticated && activeWallet) {
      fetchUserData()
    }
  }, [isAuthenticated, activeWallet])

  const fetchWalletBalances = useCallback(async () => {
    if (wallets.length === 0) return
    setBalancesLoading(true)
    try {
      const addresses = wallets.map(w => w.public_key)
      const response = await fetch("/api/wallet/balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addresses }),
      })
      const data = await response.json()
      if (data.success && data.data?.balances) {
        const newBalances: Record<string, number> = {}
        data.data.balances.forEach((balance: { address: string; balanceSol: number }) => {
          const wallet = wallets.find(w => w.public_key === balance.address)
          if (wallet) {
            newBalances[wallet.id] = balance.balanceSol || 0
          }
        })
        setWalletBalances(newBalances)
      }
    } catch (error) {
      console.error("[PROFILE] Failed to fetch wallet balances:", error)
    } finally {
      setBalancesLoading(false)
    }
  }, [wallets])

  // Fetch wallet balances
  useEffect(() => {
    if (isAuthenticated && wallets.length > 0) {
      fetchWalletBalances()
      
      // Refresh balances every 30 seconds
      const interval = setInterval(fetchWalletBalances, 30000)
      return () => clearInterval(interval)
    }
  }, [isAuthenticated, wallets, fetchWalletBalances])

  // Calculate total balance
  const totalBalance = Object.values(walletBalances).reduce((sum, balance) => sum + balance, 0)

  const fetchUserData = async () => {
    if (!activeWallet) return
    setDataLoading(true)

    try {
      const { data: created } = await supabase
        .from("tokens")
        .select("*")
        .eq("creator_wallet", activeWallet.public_key)
        .order("created_at", { ascending: false })

      if (created) {
        // Fetch live market caps for created tokens
        const tokensWithLiveData = await Promise.all(
          created.map(async (token) => {
            try {
              const priceResponse = await fetch(`/api/price/token?mint=${token.mint_address}&supply=${token.total_supply}&decimals=${token.decimals || 6}`)
              if (priceResponse.ok) {
                const priceData = await priceResponse.json()
                if (priceData.success && priceData.data?.marketCap) {
                  return { ...token, market_cap: priceData.data.marketCap }
                }
              }
            } catch {
              // Use DB market cap as fallback
            }
            return token
          })
        )
        setCreatedTokens(tokensWithLiveData)
      }

      const { data: tradeHistory } = await supabase
        .from("trades")
        .select("*")
        .eq("wallet_address", activeWallet.public_key)
        .order("created_at", { ascending: false })
        .limit(50)

      if (tradeHistory) setTrades(tradeHistory)
    } catch (err) {
      console.error("Failed to fetch user data:", err)
    } finally {
      setDataLoading(false)
    }
  }

  const formatAddress = (address: string) => `${address.slice(0, 6)}...${address.slice(-6)}`
  const formatNumber = (num: number) => {
    if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`
    if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`
    return num.toFixed(2)
  }

  if (isLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--aqua-primary)] border-t-transparent rounded-full animate-spin" />
      </main>
    )
  }

  return (
    <main className="min-h-screen relative overflow-hidden">
      <LiquidBackground />

      <div className="relative z-10">
        <Header />

        <div className="pt-16 pb-6 px-3 sm:px-4 lg:px-6">
          <div className="max-w-5xl mx-auto">
            {/* Profile Header - Compact */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[var(--aqua-primary)] to-[var(--warm-pink)] flex items-center justify-center">
                    <User className="w-5 h-5 text-[var(--ocean-deep)]" />
                  </div>
                  <div>
                    <h1 className="text-lg font-bold text-[var(--text-primary)]">Profile</h1>
                    {mainWallet && (
                      <p className="text-[10px] font-mono text-[var(--text-muted)]">
                        {formatAddress(mainWallet.public_key)}
                      </p>
                    )}
                  </div>
                </div>

                {!isAuthenticated && (
                  <button onClick={() => setIsOnboarding(true)} className="btn-primary text-xs px-3 py-1.5">
                    Connect Wallet
                  </button>
                )}
              </div>
            </motion.div>

            {isAuthenticated ? (
              <>
                {/* Tabs - Compact */}
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 }}
                  className="flex gap-1 mb-3 flex-wrap"
                >
                  {(["portfolio", "pnl", "created", "rewards", "activity", "referrals", "settings"] as TabType[]).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={cn(
                        "px-3 py-1.5 rounded-md text-[11px] font-medium whitespace-nowrap transition-all",
                        activeTab === tab
                          ? "bg-[var(--aqua-primary)] text-[var(--ocean-deep)]"
                          : "bg-[var(--ocean-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                        tab === "rewards" && "!bg-amber-500/20 !text-amber-400 hover:!bg-amber-500/30"
                      )}
                    >
                      {tab === "pnl" ? "P&L" : 
                       tab === "rewards" ? "💰 Rewards" :
                       tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </motion.div>

                {/* Tab Content */}
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {activeTab === "pnl" && (
                    <PnLPanel />
                  )}

                  {activeTab === "portfolio" && (
                    <div className="space-y-2">
                      {/* Wallet Overview - Compact Row */}
                      <div className="grid grid-cols-4 gap-1.5">
                        <GlassPanel className="p-2">
                          <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-wide">Wallets</p>
                          <p className="text-lg font-bold text-[var(--text-primary)]">{wallets.length}<span className="text-[9px] text-[var(--text-muted)]">/25</span></p>
                        </GlassPanel>
                        <GlassPanel className="p-2" glow="aqua">
                          <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-wide">Balance</p>
                          <p className="text-lg font-bold text-[var(--aqua-primary)]">
                            {balancesLoading ? "..." : `${totalBalance.toFixed(4)}`}
                            <span className="text-[9px] text-[var(--text-muted)] ml-0.5">SOL</span>
                          </p>
                        </GlassPanel>
                        <GlassPanel className="p-2">
                          <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-wide">Tokens</p>
                          <p className="text-lg font-bold text-[var(--text-primary)]">{createdTokens.length}</p>
                        </GlassPanel>
                        <GlassPanel className="p-2">
                          <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-wide">Trades</p>
                          <p className="text-lg font-bold text-[var(--text-primary)]">{trades.length}</p>
                        </GlassPanel>
                      </div>

                      {/* Connected Wallets - Compact List */}
                      <GlassPanel className="p-2">
                        <div className="flex items-center justify-between mb-1.5">
                          <h2 className="text-[11px] font-semibold text-[var(--text-primary)]">Connected Wallets</h2>
                          <span className="text-[9px] text-[var(--text-muted)]">{wallets.length}/25</span>
                        </div>
                        <div className="space-y-1">
                          {wallets.map((wallet) => (
                            <div
                              key={wallet.id}
                              className={cn(
                                "p-1.5 rounded-md border transition-all flex items-center justify-between",
                                wallet.is_primary
                                  ? "border-[var(--aqua-primary)]/50 bg-[var(--aqua-subtle)]/20"
                                  : "border-[var(--glass-border)] bg-[var(--ocean-surface)]/30",
                              )}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1">
                                    <span className="text-[11px] font-medium text-[var(--text-primary)] truncate">
                                      {wallet.label || "Imported Wallet"}
                                    </span>
                                    {wallet.is_primary && (
                                      <span className="text-[7px] px-1 py-0.5 rounded bg-[var(--aqua-primary)]/20 text-[var(--aqua-primary)] font-medium uppercase flex-shrink-0">
                                        Main
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[9px] font-mono text-[var(--text-muted)]">
                                    {formatAddress(wallet.public_key)}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <span className="text-[11px] font-semibold text-[var(--aqua-primary)] font-mono">
                                  {balancesLoading ? "..." : walletBalances[wallet.id] !== undefined ? `${walletBalances[wallet.id].toFixed(4)}` : "—"}
                                </span>
                                <button
                                  onClick={() => navigator.clipboard.writeText(wallet.public_key)}
                                  className="p-1 rounded hover:bg-[var(--ocean-surface)] transition-colors"
                                  title="Copy"
                                >
                                  <Copy className="w-3 h-3 text-[var(--text-muted)]" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </GlassPanel>
                    </div>
                  )}

                  {activeTab === "rewards" && (
                    <CreatorRewardsPanel />
                  )}

                  {activeTab === "created" && (
                    <div className="space-y-4">
                      {dataLoading ? (
                        <div className="text-center py-12">
                          <div className="w-6 h-6 border-2 border-[var(--aqua-primary)] border-t-transparent rounded-full animate-spin mx-auto" />
                        </div>
                      ) : createdTokens.length === 0 ? (
                        <GlassPanel className="p-12 text-center">
                          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--ocean-surface)] flex items-center justify-center">
                            <Plus className="w-6 h-6 text-[var(--text-muted)]" />
                          </div>
                          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">No tokens yet</h3>
                          <p className="text-sm text-[var(--text-secondary)] mb-6">
                            Launch your first token with AQUA liquidity mechanics
                          </p>
                          <Link href="/launch" className="btn-primary inline-flex items-center gap-2">
                            <Coins className="w-4 h-4" />
                            Launch Token
                          </Link>
                        </GlassPanel>
                      ) : (
                        createdTokens.map((token) => (
                          <Link key={token.id} href={`/token/${token.mint_address}`}>
                            <GlassPanel className="p-5 hover:border-[var(--aqua-primary)]/50 transition-all cursor-pointer">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                  <div className="relative w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--aqua-primary)] to-[var(--warm-pink)] overflow-hidden">
                                    {(() => {
                                      // Get image URL - use Jupiter static hosting for Jupiter tokens
                                      const imageUrl = token.image_url 
                                        || ((token as any).pool_type === 'jupiter' ? `https://static-create.jup.ag/images/${token.mint_address}` : null)
                                      
                                      return imageUrl ? (
                                        <Image
                                          src={imageUrl}
                                          alt={token.name}
                                          fill
                                          className="object-cover"
                                        />
                                      ) : (
                                        <div className="absolute inset-0 flex items-center justify-center">
                                          <span className="text-[var(--ocean-deep)] font-bold">
                                            {token.symbol.slice(0, 2)}
                                          </span>
                                        </div>
                                      )
                                    })()}
                                  </div>
                                  <div>
                                    <h3 className="font-semibold text-[var(--text-primary)]">{token.name}</h3>
                                    <div className="flex items-center gap-2">
                                      <p className="text-sm text-[var(--text-secondary)]">${token.symbol}</p>
                                      {/* Pool type badge */}
                                      {(token as any).pool_type === 'jupiter' && (
                                        <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-green-500/20 text-green-400">
                                          JUP
                                        </span>
                                      )}
                                      {(token as any).pool_type === 'token22' && (
                                        <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-purple-500/20 text-purple-400">
                                          T22
                                        </span>
                                      )}
                                      {(token as any).pool_type === 'bonk' && (
                                        <span className={cn(
                                          "text-[9px] px-1.5 py-0.5 rounded font-medium",
                                          (token as any).quote_mint === 'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB'
                                            ? "bg-amber-500/20 text-amber-400"
                                            : "bg-orange-500/10 text-orange-400"
                                        )}>
                                          {(token as any).quote_mint === 'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB' ? 'USD1' : 'BONK'}
                                        </span>
                                      )}
                                      <span className="text-[10px] text-[var(--text-muted)]">•</span>
                                      <p className="text-[10px] text-[var(--aqua-primary)]">
                                        MCap: ${formatNumber(token.market_cap || 0)}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-medium text-[var(--text-primary)]">
                                    {formatNumber(token.market_cap)} SOL
                                  </p>
                                  <p
                                    className={cn(
                                      "text-xs",
                                      (token.change_24h || 0) >= 0 ? "text-[var(--success)]" : "text-[var(--error)]",
                                    )}
                                  >
                                    {(token.change_24h || 0) >= 0 ? "+" : ""}
                                    {(token.change_24h || 0).toFixed(2)}%
                                  </p>
                                </div>
                              </div>
                            </GlassPanel>
                          </Link>
                        ))
                      )}
                    </div>
                  )}

                  {activeTab === "activity" && (
                    <GlassPanel className="p-6">
                      <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Recent Activity</h2>
                      {dataLoading ? (
                        <div className="text-center py-8">
                          <div className="w-6 h-6 border-2 border-[var(--aqua-primary)] border-t-transparent rounded-full animate-spin mx-auto" />
                        </div>
                      ) : trades.length === 0 ? (
                        <p className="text-center py-8 text-[var(--text-muted)]">No trading activity yet</p>
                      ) : (
                        <div className="space-y-2">
                          {trades.map((trade) => (
                            <div
                              key={trade.id}
                              className="flex items-center justify-between py-3 border-b border-[var(--glass-border)] last:border-0"
                            >
                              <div className="flex items-center gap-3">
                                <div
                                  className={cn(
                                    "w-8 h-8 rounded-lg flex items-center justify-center",
                                    trade.trade_type === "buy" ? "bg-[var(--success)]/20" : "bg-[var(--error)]/20",
                                  )}
                                >
                                  <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 14 14"
                                    fill="none"
                                    stroke={trade.trade_type === "buy" ? "var(--success)" : "var(--error)"}
                                    strokeWidth="2"
                                  >
                                    <path
                                      d={trade.trade_type === "buy" ? "M7 11V3M3 7l4-4 4 4" : "M7 3v8M3 7l4 4 4-4"}
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-[var(--text-primary)]">
                                    {trade.trade_type === "buy" ? "Bought" : "Sold"}
                                  </p>
                                  <p className="text-xs text-[var(--text-muted)]">
                                    {new Date(trade.created_at).toLocaleDateString()}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-medium text-[var(--text-primary)]">
                                  {formatNumber(trade.amount_tokens)}
                                </p>
                                <p className="text-xs text-[var(--text-secondary)]">
                                  {trade.amount_sol.toFixed(4)} SOL
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </GlassPanel>
                  )}

                  {activeTab === "referrals" && (
                    <ReferralPanel />
                  )}

                  {activeTab === "settings" && (
                    <div className="space-y-4">
                      {/* Trading Settings */}
                      <GlassPanel className="p-5">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wide">Trading Settings</h3>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-[var(--aqua-primary)]/20 text-[var(--aqua-primary)] font-medium">Auto-saved</span>
                        </div>
                        
                        {/* Slippage */}
                        <div className="mb-5">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Slippage Tolerance</span>
                            <span className="text-xs font-mono text-[var(--aqua-primary)]">{slippage}%</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {[0.1, 0.5, 1, 2, 3, 5, 10].map((value) => (
                              <button
                                key={value}
                                onClick={() => handleSlippageChange(value)}
                                className={cn(
                                  "px-3 py-1.5 rounded text-xs font-medium transition-all",
                                  !isCustomSlippage && slippage === value
                                    ? "bg-[var(--aqua-primary)] text-[var(--ocean-deep)]"
                                    : "bg-[var(--ocean-surface)] text-[var(--text-secondary)] hover:bg-[var(--aqua-primary)]/20 hover:text-[var(--aqua-primary)]"
                                )}
                              >
                                {value}%
                              </button>
                            ))}
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.1"
                              value={isCustomSlippage ? customSlippage : ""}
                              onChange={(e) => handleCustomSlippageChange(e.target.value)}
                              onFocus={() => setIsCustomSlippage(true)}
                              placeholder="Custom"
                              className="w-24 px-3 py-1.5 rounded bg-[var(--ocean-surface)] border border-[var(--glass-border)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--aqua-primary)]"
                            />
                            <span className="text-xs text-[var(--text-muted)]">%</span>
                          </div>
                        </div>

                        {/* Priority Fee */}
                        <div className="mb-5 pt-4 border-t border-[var(--glass-border)]">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Priority Fee</span>
                            <span className="text-xs font-mono text-[var(--aqua-primary)]">{priorityFee} SOL</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {[
                              { value: 0.00005, label: "0.00005" },
                              { value: 0.0001, label: "0.0001" },
                              { value: 0.0005, label: "0.0005" },
                              { value: 0.001, label: "0.001" },
                              { value: 0.005, label: "0.005" },
                            ].map(({ value, label }) => (
                              <button
                                key={value}
                                onClick={() => handlePriorityFeeChange(value)}
                                className={cn(
                                  "px-3 py-1.5 rounded text-xs font-mono transition-all",
                                  !isCustomPriorityFee && priorityFee === value
                                    ? "bg-[var(--aqua-primary)] text-[var(--ocean-deep)]"
                                    : "bg-[var(--ocean-surface)] text-[var(--text-secondary)] hover:bg-[var(--aqua-primary)]/20 hover:text-[var(--aqua-primary)]"
                                )}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min="0"
                              step="0.00001"
                                value={isCustomPriorityFee ? customPriorityFee : ""}
                                onChange={(e) => handleCustomPriorityFeeChange(e.target.value)}
                                onFocus={() => setIsCustomPriorityFee(true)}
                              placeholder="Custom"
                              className="w-28 px-3 py-1.5 rounded bg-[var(--ocean-surface)] border border-[var(--glass-border)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--aqua-primary)]"
                              />
                            <span className="text-xs text-[var(--text-muted)]">SOL</span>
                          </div>
                        </div>
                        
                        {/* Jito Tip */}
                        <div className="pt-4 border-t border-[var(--glass-border)]">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Jito Bundle Tip</span>
                            <span className="text-xs font-mono text-[var(--aqua-primary)]">{jitoTip} SOL</span>
                            </div>
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {[
                              { value: 0, label: "Off" },
                              { value: 0.00005, label: "0.00005" },
                              { value: 0.0001, label: "0.0001" },
                              { value: 0.0005, label: "0.0005" },
                              { value: 0.001, label: "0.001" },
                            ].map(({ value, label }) => (
                              <button
                                key={value}
                                onClick={() => handleJitoTipChange(value)}
                                className={cn(
                                  "px-3 py-1.5 rounded text-xs font-mono transition-all",
                                  !isCustomJitoTip && jitoTip === value
                                    ? "bg-[var(--aqua-primary)] text-[var(--ocean-deep)]"
                                    : "bg-[var(--ocean-surface)] text-[var(--text-secondary)] hover:bg-[var(--aqua-primary)]/20 hover:text-[var(--aqua-primary)]"
                                )}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="0"
                              step="0.00001"
                              value={isCustomJitoTip ? customJitoTip : ""}
                              onChange={(e) => handleCustomJitoTipChange(e.target.value)}
                              onFocus={() => setIsCustomJitoTip(true)}
                              placeholder="Custom"
                              className="w-28 px-3 py-1.5 rounded bg-[var(--ocean-surface)] border border-[var(--glass-border)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--aqua-primary)]"
                            />
                            <span className="text-xs text-[var(--text-muted)]">SOL</span>
                          </div>
                          <p className="text-[10px] text-[var(--text-muted)] mt-2">
                            Jito tips prioritize your transactions in the block. Higher tips = faster execution.
                          </p>
                        </div>
                      </GlassPanel>
                      
                      {/* Current Active Settings Summary */}
                      <GlassPanel className="p-4">
                        <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Active Configuration</h4>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="text-center p-3 rounded-lg bg-[var(--ocean-surface)]">
                            <p className="text-lg font-bold font-mono text-[var(--aqua-primary)]">{slippage}%</p>
                            <p className="text-[10px] text-[var(--text-muted)] uppercase">Slippage</p>
                          </div>
                          <div className="text-center p-3 rounded-lg bg-[var(--ocean-surface)]">
                            <p className="text-lg font-bold font-mono text-[var(--aqua-primary)]">{priorityFee}</p>
                            <p className="text-[10px] text-[var(--text-muted)] uppercase">Priority</p>
                          </div>
                          <div className="text-center p-3 rounded-lg bg-[var(--ocean-surface)]">
                            <p className="text-lg font-bold font-mono text-[var(--aqua-primary)]">{jitoTip}</p>
                            <p className="text-[10px] text-[var(--text-muted)] uppercase">Jito Tip</p>
                        </div>
                      </div>
                    </GlassPanel>
                    </div>
                  )}
                </motion.div>
              </>
            ) : (
              <GlassPanel className="p-12 text-center max-w-lg mx-auto">
                <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-[var(--aqua-primary)]/20 to-[var(--warm-coral)]/20 flex items-center justify-center">
                  <Wallet className="w-10 h-10 text-[var(--aqua-primary)]" />
                </div>
                <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">Connect Your Wallet</h2>
                <p className="text-[var(--text-secondary)] mb-6">View your portfolio, created tokens, and activity</p>
                <button onClick={() => setIsOnboarding(true)} className="btn-primary inline-flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  Connect Wallet
                </button>
              </GlassPanel>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
