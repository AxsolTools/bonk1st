"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Header } from "@/components/layout/header"
import { GlassPanel, GlassButton, GlassInput } from "@/components/ui/glass-panel"
import { useAuth } from "@/components/providers/auth-provider"
import { getAuthHeaders } from "@/lib/api"
import { 
  Droplets, 
  Plus, 
  Minus, 
  Lock, 
  ArrowLeft,
  AlertTriangle,
  Check,
  Loader2
} from "lucide-react"
import Link from "next/link"

interface TokenData {
  id: string
  mint_address: string
  name: string
  symbol: string
  decimals: number
  current_liquidity: number
  creator_wallet: string
}

export default function LiquidityManagementPage() {
  const params = useParams()
  const router = useRouter()
  const address = params.address as string
  const { sessionId, activeWallet } = useAuth()
  
  const [token, setToken] = useState<TokenData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Form states
  const [activeTab, setActiveTab] = useState<'add' | 'remove' | 'lock'>('add')
  const [tokenAmount, setTokenAmount] = useState('')
  const [solAmount, setSolAmount] = useState('')
  const [lpAmount, setLpAmount] = useState('')
  const [lockDays, setLockDays] = useState(30)
  const [slippage, setSlippage] = useState(1)
  
  // Action states
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null)

  useEffect(() => {
    fetchTokenData()
  }, [address])

  const fetchTokenData = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/token/${address}`, {
        headers: getAuthHeaders({
          sessionId: sessionId || '',
          walletAddress: activeWallet?.public_key || '',
        }),
      })
      
      if (!response.ok) {
        throw new Error('Token not found')
      }
      
      const data = await response.json()
      setToken(data.data || data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load token')
    } finally {
      setLoading(false)
    }
  }

  const handleAddLiquidity = async () => {
    if (!token || !activeWallet) return
    
    setIsSubmitting(true)
    setSubmitError(null)
    setSubmitSuccess(null)

    try {
      const response = await fetch('/api/token22/pool/add', {
        method: 'POST',
        headers: getAuthHeaders({
          sessionId: sessionId || '',
          walletAddress: activeWallet.public_key,
        }),
        body: JSON.stringify({
          poolAddress: '', // TODO: Get from token/pool mapping
          tokenMint: token.mint_address,
          tokenAmount,
          solAmount,
          tokenDecimals: token.decimals,
          slippageBps: slippage * 100,
        }),
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to add liquidity')
      }

      setSubmitSuccess(`Liquidity added! TX: ${data.data.txSignature.slice(0, 16)}...`)
      setTokenAmount('')
      setSolAmount('')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to add liquidity')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRemoveLiquidity = async () => {
    if (!token || !activeWallet) return
    
    setIsSubmitting(true)
    setSubmitError(null)
    setSubmitSuccess(null)

    try {
      const response = await fetch('/api/token22/pool/remove', {
        method: 'POST',
        headers: getAuthHeaders({
          sessionId: sessionId || '',
          walletAddress: activeWallet.public_key,
        }),
        body: JSON.stringify({
          poolAddress: '', // TODO: Get from token/pool mapping
          lpTokenAmount: lpAmount,
          slippageBps: slippage * 100,
        }),
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to remove liquidity')
      }

      setSubmitSuccess(`Liquidity removed! TX: ${data.data.txSignature.slice(0, 16)}...`)
      setLpAmount('')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to remove liquidity')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleLockLP = async () => {
    if (!token || !activeWallet) return
    
    setIsSubmitting(true)
    setSubmitError(null)
    setSubmitSuccess(null)

    try {
      const response = await fetch('/api/token22/pool/lock', {
        method: 'POST',
        headers: getAuthHeaders({
          sessionId: sessionId || '',
          walletAddress: activeWallet.public_key,
        }),
        body: JSON.stringify({
          poolAddress: '', // TODO: Get from token/pool mapping
          lpTokenAmount: lpAmount,
          lockDurationDays: lockDays,
        }),
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to lock LP tokens')
      }

      setSubmitSuccess(`LP locked until ${data.data.unlockDate}! TX: ${data.data.txSignature.slice(0, 16)}...`)
      setLpAmount('')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to lock LP tokens')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-950">
        <Header />
        <div className="flex items-center justify-center h-96">
          <div className="flex items-center gap-3 text-zinc-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Loading...</span>
          </div>
        </div>
      </main>
    )
  }

  if (error || !token) {
    return (
      <main className="min-h-screen bg-zinc-950">
        <Header />
        <div className="flex flex-col items-center justify-center h-96 gap-4">
          <p className="text-red-400">{error || 'Token not found'}</p>
          <Link href={`/token22/${address}`}>
            <GlassButton variant="outline">Back to Token</GlassButton>
          </Link>
        </div>
      </main>
    )
  }

  const isCreator = activeWallet?.public_key === token.creator_wallet

  if (!isCreator) {
    return (
      <main className="min-h-screen bg-zinc-950">
        <Header />
        <div className="flex flex-col items-center justify-center h-96 gap-4">
          <AlertTriangle className="w-12 h-12 text-amber-400" />
          <p className="text-amber-400">Only the token creator can manage liquidity</p>
          <Link href={`/token22/${address}`}>
            <GlassButton variant="outline">Back to Token</GlassButton>
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-zinc-950">
      <div className="fixed inset-0 bg-gradient-to-br from-zinc-950 via-zinc-950 to-cyan-950/20 pointer-events-none" />
      
      <Header />

      <div className="relative z-10 px-3 sm:px-4 lg:px-6 py-6 max-w-4xl mx-auto">
        {/* Back Link */}
        <Link
          href={`/token22/${address}`}
          className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to {token.symbol}
        </Link>

        {/* Page Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
              <Droplets className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Manage Liquidity</h1>
              <p className="text-sm text-zinc-400">{token.name} (${token.symbol})</p>
            </div>
          </div>
        </motion.div>

        {/* Current Liquidity */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8"
        >
          <div className="p-6 rounded-2xl bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/20">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <p className="text-sm text-zinc-400 mb-1">Current Liquidity</p>
                <p className="text-2xl font-bold text-cyan-400">{token.current_liquidity.toFixed(4)} SOL</p>
              </div>
              <div>
                <p className="text-sm text-zinc-400 mb-1">Your LP Tokens</p>
                <p className="text-2xl font-bold text-white">—</p>
                <p className="text-xs text-zinc-500">Fetch from chain</p>
              </div>
              <div>
                <p className="text-sm text-zinc-400 mb-1">LP Value</p>
                <p className="text-2xl font-bold text-white">—</p>
                <p className="text-xs text-zinc-500">Fetch from chain</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-6"
        >
          <div className="flex gap-2 p-1 rounded-xl bg-zinc-900/50 border border-zinc-800">
            <button
              onClick={() => setActiveTab('add')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'add'
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
            <button
              onClick={() => setActiveTab('remove')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'remove'
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Minus className="w-4 h-4" />
              Remove
            </button>
            <button
              onClick={() => setActiveTab('lock')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'lock'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Lock className="w-4 h-4" />
              Lock
            </button>
          </div>
        </motion.div>

        {/* Form Content */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <GlassPanel className="rounded-2xl">
            {/* Add Liquidity */}
            {activeTab === 'add' && (
              <div className="space-y-6">
                <div className="flex items-center gap-3 p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
                  <Plus className="w-5 h-5 text-cyan-400" />
                  <div>
                    <p className="text-sm font-medium text-white">Add Liquidity</p>
                    <p className="text-xs text-zinc-400">Deposit tokens and SOL to earn LP tokens</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <GlassInput
                    label={`${token.symbol} Amount`}
                    value={tokenAmount}
                    onChange={(e) => setTokenAmount(e.target.value)}
                    placeholder="0.00"
                  />
                  <GlassInput
                    label="SOL Amount"
                    value={solAmount}
                    onChange={(e) => setSolAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="block text-sm text-zinc-400 mb-2">Slippage Tolerance</label>
                  <div className="flex gap-2">
                    {[0.5, 1, 2, 5].map((val) => (
                      <button
                        key={val}
                        onClick={() => setSlippage(val)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          slippage === val
                            ? 'bg-cyan-500/30 text-cyan-400 border border-cyan-500/50'
                            : 'bg-zinc-800 text-zinc-400 hover:text-white'
                        }`}
                      >
                        {val}%
                      </button>
                    ))}
                  </div>
                </div>

                <GlassButton
                  onClick={handleAddLiquidity}
                  disabled={isSubmitting || !tokenAmount || !solAmount}
                  variant="primary"
                  isLoading={isSubmitting}
                  className="w-full"
                >
                  Add Liquidity
                </GlassButton>
              </div>
            )}

            {/* Remove Liquidity */}
            {activeTab === 'remove' && (
              <div className="space-y-6">
                <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                  <Minus className="w-5 h-5 text-red-400" />
                  <div>
                    <p className="text-sm font-medium text-white">Remove Liquidity</p>
                    <p className="text-xs text-zinc-400">Burn LP tokens to withdraw your assets</p>
                  </div>
                </div>

                <GlassInput
                  label="LP Tokens to Burn"
                  value={lpAmount}
                  onChange={(e) => setLpAmount(e.target.value)}
                  placeholder="0"
                  hint="Enter raw LP token amount"
                />

                <div>
                  <label className="block text-sm text-zinc-400 mb-2">Slippage Tolerance</label>
                  <div className="flex gap-2">
                    {[0.5, 1, 2, 5].map((val) => (
                      <button
                        key={val}
                        onClick={() => setSlippage(val)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          slippage === val
                            ? 'bg-red-500/30 text-red-400 border border-red-500/50'
                            : 'bg-zinc-800 text-zinc-400 hover:text-white'
                        }`}
                      >
                        {val}%
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-400/90">
                    Removing liquidity will reduce trading depth. Traders may experience higher slippage.
                  </p>
                </div>

                <GlassButton
                  onClick={handleRemoveLiquidity}
                  disabled={isSubmitting || !lpAmount}
                  variant="primary"
                  isLoading={isSubmitting}
                  className="w-full bg-gradient-to-r from-red-500 to-orange-500"
                >
                  Remove Liquidity
                </GlassButton>
              </div>
            )}

            {/* Lock LP */}
            {activeTab === 'lock' && (
              <div className="space-y-6">
                <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <Lock className="w-5 h-5 text-amber-400" />
                  <div>
                    <p className="text-sm font-medium text-white">Lock LP Tokens</p>
                    <p className="text-xs text-zinc-400">Prove commitment by locking your LP tokens</p>
                  </div>
                </div>

                <GlassInput
                  label="LP Tokens to Lock"
                  value={lpAmount}
                  onChange={(e) => setLpAmount(e.target.value)}
                  placeholder="0"
                  hint="These tokens will be locked and cannot be withdrawn"
                />

                <div>
                  <label className="block text-sm text-zinc-400 mb-2">Lock Duration</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { days: 30, label: '30 Days' },
                      { days: 90, label: '90 Days' },
                      { days: 180, label: '6 Months' },
                      { days: 365, label: '1 Year' },
                    ].map(({ days, label }) => (
                      <button
                        key={days}
                        onClick={() => setLockDays(days)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          lockDays === days
                            ? 'bg-amber-500/30 text-amber-400 border border-amber-500/50'
                            : 'bg-zinc-800 text-zinc-400 hover:text-white'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                  <p className="text-sm text-emerald-400">
                    ✓ Locking LP tokens shows traders you're committed for the long term.
                  </p>
                </div>

                <GlassButton
                  onClick={handleLockLP}
                  disabled={isSubmitting || !lpAmount}
                  variant="primary"
                  isLoading={isSubmitting}
                  className="w-full bg-gradient-to-r from-amber-500 to-orange-500"
                >
                  Lock LP Tokens for {lockDays} Days
                </GlassButton>
              </div>
            )}

            {/* Status Messages */}
            {submitError && (
              <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
                <p className="text-sm text-red-400">{submitError}</p>
              </div>
            )}

            {submitSuccess && (
              <div className="mt-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-3">
                <Check className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                <p className="text-sm text-emerald-400">{submitSuccess}</p>
              </div>
            )}
          </GlassPanel>
        </motion.div>
      </div>
    </main>
  )
}

