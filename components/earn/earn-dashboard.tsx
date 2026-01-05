"use client"

import { useState, useEffect, useCallback } from "react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/components/providers/auth-provider"
import { VaultCard } from "./vault-card"
import { PositionCard } from "./position-card"
import { EarningsSummary } from "./earnings-summary"
import { DepositModal } from "./deposit-modal"
import { WithdrawModal } from "./withdraw-modal"
import { EarnActivityFeed } from "./earn-activity-feed"

interface Vault {
  id: number
  address: string
  name: string
  symbol: string
  decimals: number
  asset: {
    address: string
    symbol: string
    name: string
    decimals: number
    logoUrl: string
    priceUsd: number
  }
  apy: number
  apyFormatted: string
  tvlUsd: number
  tvlFormatted: string
  availableLiquidity: number
  supplyRate: number
  rewardsRate: number
}

interface Position {
  vaultAddress: string
  vaultSymbol: string
  assetSymbol: string
  shares: string
  sharesFormatted: number
  underlyingAssets: string
  underlyingAssetsFormatted: number
  underlyingValueUsd: number
  logoUrl: string
  walletAddress: string
}

interface Earnings {
  positionAddress: string
  vaultSymbol: string
  assetSymbol: string
  earnedAmount: string
  earnedAmountFormatted: number
  earnedValueUsd: number
  walletAddress: string
}

// PROPEL token mint from environment
const PROPEL_MINT = process.env.NEXT_PUBLIC_PROPEL_TOKEN_MINT || ''

export function EarnDashboard() {
  const { sessionId, activeWallet, wallets, isAuthenticated, setIsOnboarding } = useAuth()
  
  const [vaults, setVaults] = useState<Vault[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [earnings, setEarnings] = useState<Earnings[]>([])
  const [propelBalance, setPropelBalance] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Modal states
  const [selectedVault, setSelectedVault] = useState<Vault | null>(null)
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null)
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false)
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false)

  // Fetch vaults
  const fetchVaults = useCallback(async () => {
    try {
      const response = await fetch('/api/earn/vaults')
      const data = await response.json()
      
      if (data.success) {
        setVaults(data.data)
      } else {
        console.error('Failed to fetch vaults:', data.error)
      }
    } catch (err) {
      console.error('Vaults fetch error:', err)
    }
  }, [])

  // Fetch positions
  const fetchPositions = useCallback(async () => {
    if (!sessionId) return
    
    try {
      const response = await fetch('/api/earn/positions', {
        headers: {
          'x-session-id': sessionId,
        },
      })
      const data = await response.json()
      
      if (data.success) {
        setPositions(data.data.positions)
      }
    } catch (err) {
      console.error('Positions fetch error:', err)
    }
  }, [sessionId])

  // Fetch earnings
  const fetchEarnings = useCallback(async () => {
    if (!sessionId) return
    
    try {
      const response = await fetch('/api/earn/earnings', {
        headers: {
          'x-session-id': sessionId,
        },
      })
      const data = await response.json()
      
      if (data.success) {
        setEarnings(data.data.earnings)
      }
    } catch (err) {
      console.error('Earnings fetch error:', err)
    }
  }, [sessionId])

  // Fetch PROPEL balance
  const fetchPropelBalance = useCallback(async () => {
    if (!activeWallet || !PROPEL_MINT) return
    
    try {
      const response = await fetch(`/api/token/balance?wallet=${activeWallet.public_key}&mint=${PROPEL_MINT}`)
      const data = await response.json()
      
      if (data.success) {
        setPropelBalance(data.data?.balance || 0)
      }
    } catch (err) {
      console.error('PROPEL balance fetch error:', err)
      setPropelBalance(0)
    }
  }, [activeWallet])

  // Initial data load
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true)
      setError(null)
      
      try {
        await Promise.all([
          fetchVaults(),
          fetchPositions(),
          fetchEarnings(),
          fetchPropelBalance(),
        ])
      } catch (err) {
        setError('Failed to load earn data')
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [fetchVaults, fetchPositions, fetchEarnings, fetchPropelBalance])

  // Refresh data periodically
  useEffect(() => {
    const interval = setInterval(() => {
      fetchPositions()
      fetchEarnings()
    }, 30000)

    return () => clearInterval(interval)
  }, [fetchPositions, fetchEarnings])

  // Calculate summary stats
  const totalDeposited = positions.reduce((sum, p) => sum + p.underlyingValueUsd, 0)
  const totalEarnings = earnings.reduce((sum, e) => sum + e.earnedValueUsd, 0)
  const averageApy = positions.length > 0
    ? positions.reduce((sum, p) => {
        const vault = vaults.find(v => v.address === p.vaultAddress)
        return sum + (vault?.apy || 0)
      }, 0) / positions.length
    : 0

  const handleDepositClick = (vault: Vault) => {
    setSelectedVault(vault)
    setIsDepositModalOpen(true)
  }

  const handleWithdrawClick = (position: Position) => {
    setSelectedPosition(position)
    setIsWithdrawModalOpen(true)
  }

  const handleSuccess = () => {
    fetchPositions()
    fetchEarnings()
    fetchPropelBalance()
  }

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-4 border-[var(--aqua-primary)]/20" />
            <div className="absolute inset-0 rounded-full border-4 border-[var(--aqua-primary)] border-t-transparent animate-spin" />
          </div>
          <p className="text-[var(--text-muted)]">Loading earn data...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-10">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[var(--bg-card)] via-[var(--bg-elevated)] to-[var(--bg-card)] border border-[var(--border-subtle)] p-8 md:p-12">
        {/* Background decoration */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-[var(--aqua-primary)]/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-[var(--green)]/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
        
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="max-w-2xl">
            <h1 className="text-4xl md:text-5xl font-bold text-[var(--text-primary)] mb-4">
              PROPEL <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--aqua-primary)] to-[var(--green)]">Earn</span>
            </h1>
            <p className="text-lg text-[var(--text-secondary)] mb-2">
              Turn your idle tokens into yield-generating assets
            </p>
            <p className="text-sm text-[var(--text-muted)]">
              Deposit PROPEL in one click. We handle the swap and deposit atomically. 
              Earn passive income while you sleep.
            </p>
          </div>
          
          {/* PROPEL Balance Badge */}
          {isAuthenticated && activeWallet && PROPEL_MINT && (
            <div className="flex-shrink-0 p-5 rounded-2xl bg-gradient-to-br from-[var(--aqua-primary)]/10 to-[var(--warm-pink)]/10 border border-[var(--aqua-border)]">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[var(--aqua-primary)] to-[var(--warm-pink)] flex items-center justify-center shadow-lg shadow-[var(--aqua-primary)]/25">
                  <span className="text-lg font-bold text-white">P</span>
                </div>
                <div>
                  <p className="text-xs text-[var(--text-muted)] mb-1">Your PROPEL Balance</p>
                  <p className="text-2xl font-bold text-[var(--text-primary)] tabular-nums">
                    {propelBalance.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Earnings Summary - Only show if user has positions */}
      {positions.length > 0 && (
        <EarningsSummary
          totalDeposited={totalDeposited}
          totalEarnings={totalEarnings}
          averageApy={averageApy}
          positionCount={positions.length}
        />
      )}

      {/* Your Positions */}
      {positions.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-[var(--text-primary)]">Your Positions</h2>
              <p className="text-sm text-[var(--text-muted)] mt-1">Track your yield-generating assets</p>
            </div>
            <span className="px-3 py-1.5 rounded-full bg-[var(--green)]/10 text-[var(--green)] text-sm font-medium">
              {positions.length} active
            </span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {positions.map((position, index) => {
              const vault = vaults.find(v => v.address === position.vaultAddress)
              const positionEarnings = earnings.find(
                e => e.vaultSymbol === position.vaultSymbol && e.walletAddress === position.walletAddress
              )
              
              return (
                <PositionCard
                  key={`${position.vaultAddress}-${position.walletAddress}-${index}`}
                  position={position}
                  earnings={positionEarnings}
                  apy={vault?.apy}
                  onWithdraw={() => handleWithdrawClick(position)}
                />
              )
            })}
          </div>
        </section>
      )}

      {/* How It Works - Educational Section */}
      <section className="p-8 rounded-3xl bg-gradient-to-br from-[var(--bg-card)] to-[var(--bg-elevated)] border border-[var(--border-subtle)]">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">How You Earn Money</h2>
          <p className="text-[var(--text-muted)] max-w-2xl mx-auto">
            Your deposited assets are lent to traders and protocols across Solana who pay interest to borrow. 
            That interest flows back to you as yield. You're essentially becoming the bank.
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-[var(--aqua-primary)]/20 to-[var(--aqua-secondary)]/10 flex items-center justify-center">
              <span className="text-2xl font-bold text-[var(--aqua-primary)]">1</span>
            </div>
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Swap & Deposit</h3>
            <p className="text-sm text-[var(--text-muted)]">
              Your PROPEL tokens are automatically swapped to USDC or SOL and deposited into secure yield vaults — all in one transaction.
            </p>
          </div>
          
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-[var(--aqua-primary)]/20 to-[var(--aqua-secondary)]/10 flex items-center justify-center">
              <span className="text-2xl font-bold text-[var(--aqua-primary)]">2</span>
            </div>
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Earn Yield</h3>
            <p className="text-sm text-[var(--text-muted)]">
              Your assets earn interest from lending plus additional rewards. APY fluctuates based on market demand — when more people want to borrow, you earn more.
            </p>
          </div>
          
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-[var(--aqua-primary)]/20 to-[var(--aqua-secondary)]/10 flex items-center justify-center">
              <span className="text-2xl font-bold text-[var(--aqua-primary)]">3</span>
            </div>
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Withdraw Anytime</h3>
            <p className="text-sm text-[var(--text-muted)]">
              No lockups. No vesting. No waiting periods. Your funds stay liquid. Withdraw your deposited assets plus accumulated yield whenever you want.
            </p>
          </div>
        </div>
      </section>

      {/* Available Vaults */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-[var(--text-primary)]">Available Vaults</h2>
            <p className="text-sm text-[var(--text-muted)] mt-1">Choose where to put your assets to work</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <div className="w-2 h-2 rounded-full bg-[var(--green)] animate-pulse" />
            <span>Live rates</span>
          </div>
        </div>

        {vaults.length === 0 ? (
          <div className="p-12 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] text-center">
            <p className="text-[var(--text-muted)]">No vaults available at this time</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {vaults.map((vault) => (
              <VaultCard
                key={vault.id}
                vault={vault}
                onDeposit={isAuthenticated ? () => handleDepositClick(vault) : undefined}
              />
            ))}
          </div>
        )}
      </section>

      {/* Live Activity Feed */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <EarnActivityFeed maxItems={8} showHeader={true} />
        </div>
        <div className="space-y-4">
          {/* Quick Stats Card */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-[var(--bg-card)] to-[var(--bg-elevated)] border border-[var(--border-subtle)]">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Platform Stats</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-muted)]">Active Vaults</span>
                <span className="text-sm font-semibold text-[var(--aqua-primary)]">{vaults.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-muted)]">Your Positions</span>
                <span className="text-sm font-semibold text-[var(--green)]">{positions.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-muted)]">Total Deposited</span>
                <span className="text-sm font-semibold text-[var(--text-primary)]">
                  ${totalDeposited.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-muted)]">Total Earned</span>
                <span className="text-sm font-semibold text-[var(--warm-pink)]">
                  ${totalEarnings.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
          
          {/* PROPEL Info Card */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-[var(--aqua-primary)]/10 to-[var(--warm-pink)]/10 border border-[var(--aqua-border)]">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--aqua-primary)] to-[var(--warm-pink)] flex items-center justify-center">
                <span className="text-sm font-bold text-white">P</span>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">PROPEL Token</h3>
                <p className="text-[10px] text-[var(--text-muted)]">Swap to earn yield</p>
              </div>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              Deposit your PROPEL tokens to start earning. Your tokens are automatically swapped and deposited into yield vaults.
            </p>
          </div>
        </div>
      </section>

      {/* Why Earn Section */}
      <section className="p-8 rounded-3xl bg-gradient-to-r from-[var(--aqua-primary)]/5 via-[var(--bg-card)] to-[var(--green)]/5 border border-[var(--border-subtle)]">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-4">Why This Matters</h2>
          <p className="text-[var(--text-secondary)] mb-6">
            Tokens sitting idle is dead capital. Every day your PROPEL sits in your wallet doing nothing, 
            you're missing potential yield. Now those same tokens can generate <span className="text-[var(--aqua-primary)] font-semibold">5-15% APY</span> passive 
            income while you maintain exposure to the ecosystem.
          </p>
          <p className="text-[var(--text-muted)]">
            If you're bullish long-term anyway, why not earn yield on top of whatever price appreciation happens? 
            This turns PROPEL from a speculative hold into a productive asset. You're not just hoping number goes up — 
            you're collecting yield regardless of price action.
          </p>
        </div>
      </section>

      {/* Multi-Wallet Info */}
      {isAuthenticated && wallets.length > 1 && (
        <section className="p-6 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)]">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h13a1 1 0 0 0 1-1v-3" strokeLinecap="round" />
                <path d="M19 7h-8a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-[var(--text-primary)] mb-1">Multi-Wallet Support</h3>
              <p className="text-sm text-[var(--text-muted)]">
                You have {wallets.length} wallets connected. Your Earn positions work across all of them. 
                The dashboard aggregates everything — total deposited value, total earnings, positions per wallet — 
                giving you a complete picture of your yield farming across your entire portfolio.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Connect Wallet CTA */}
      {!isAuthenticated && (
        <section className="p-10 rounded-3xl bg-gradient-to-br from-[var(--aqua-primary)]/10 via-[var(--bg-card)] to-[var(--warm-pink)]/10 border border-[var(--aqua-border)] text-center">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-[var(--aqua-primary)] to-[var(--aqua-secondary)] flex items-center justify-center shadow-lg shadow-[var(--aqua-primary)]/25">
            <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h13a1 1 0 0 0 1-1v-3" strokeLinecap="round" />
              <path d="M19 7h-8a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z" />
              <circle cx="16" cy="12" r="1" fill="currentColor" />
            </svg>
          </div>
          <h3 className="text-2xl font-bold text-[var(--text-primary)] mb-3">
            Start Earning Today
          </h3>
          <p className="text-[var(--text-muted)] mb-6 max-w-md mx-auto">
            Connect your wallet to deposit PROPEL and start earning yield. One click deposit, withdraw anytime.
          </p>
          <button 
            onClick={() => setIsOnboarding(true)}
            className={cn(
              "px-8 py-4 rounded-xl font-semibold text-base transition-all",
              "bg-gradient-to-r from-[var(--aqua-primary)] to-[var(--aqua-secondary)]",
              "text-white shadow-lg shadow-[var(--aqua-primary)]/25",
              "hover:shadow-xl hover:shadow-[var(--aqua-primary)]/30 hover:scale-[1.02]"
            )}
          >
            Connect Wallet
          </button>
        </section>
      )}

      {/* Modals */}
      {selectedVault && (
        <DepositModal
          isOpen={isDepositModalOpen}
          onClose={() => {
            setIsDepositModalOpen(false)
            setSelectedVault(null)
          }}
          vault={selectedVault}
          propelBalance={propelBalance}
          propelMint={PROPEL_MINT}
          onSuccess={handleSuccess}
        />
      )}

      {selectedPosition && (
        <WithdrawModal
          isOpen={isWithdrawModalOpen}
          onClose={() => {
            setIsWithdrawModalOpen(false)
            setSelectedPosition(null)
          }}
          position={selectedPosition}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  )
}
