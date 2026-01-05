"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { motion } from "framer-motion"
import { Header } from "@/components/layout/header"
import { FintechCard, FeatureCard } from "@/components/ui/fintech-card"
import { GlassPanel, GlassButton } from "@/components/ui/glass-panel"
import { useAuth } from "@/components/providers/auth-provider"
import { getAuthHeaders } from "@/lib/api"
import { 
  Droplets, 
  TrendingUp, 
  Users, 
  Zap, 
  ExternalLink, 
  Copy, 
  Check,
  Shield,
  Lock,
  Coins,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react"
import Link from "next/link"

interface TokenData {
  id: string
  mint_address: string
  name: string
  symbol: string
  description: string
  image_url: string
  total_supply: number
  decimals: number
  stage: string
  price_sol: number
  price_usd: number
  market_cap: number
  current_liquidity: number
  volume_24h: number
  change_24h: number
  holders: number
  creator_wallet: string
  website?: string
  twitter?: string
  telegram?: string
  discord?: string
}

export default function Token22DetailPage() {
  const params = useParams()
  const address = params.address as string
  const { sessionId, activeWallet } = useAuth()
  
  const [token, setToken] = useState<TokenData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

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

  const copyAddress = async () => {
    await navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-950">
        <Header />
        <div className="flex items-center justify-center h-96">
          <div className="flex items-center gap-3 text-zinc-500">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span>Loading token...</span>
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
          <Link href="/launch22">
            <GlassButton variant="primary">Launch a Token</GlassButton>
          </Link>
        </div>
      </main>
    )
  }

  const isCreator = activeWallet?.public_key === token.creator_wallet

  return (
    <main className="min-h-screen bg-zinc-950">
      <div className="fixed inset-0 bg-gradient-to-br from-zinc-950 via-zinc-950 to-emerald-950/20 pointer-events-none" />
      
      <Header />

      <div className="relative z-10 px-3 sm:px-4 lg:px-6 py-6 max-w-[1400px] mx-auto">
        {/* Token Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-start gap-6 mb-6">
            {/* Token Image */}
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 flex items-center justify-center overflow-hidden border-2 border-white/10">
              {token.image_url ? (
                <img src={token.image_url} alt={token.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-4xl">🪙</span>
              )}
            </div>

            {/* Token Info */}
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold text-white">{token.name}</h1>
                <span className="px-2 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-xs font-medium text-emerald-400">
                  Token-2022
                </span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  token.stage === 'live' 
                    ? 'bg-cyan-500/20 border border-cyan-500/30 text-cyan-400'
                    : 'bg-amber-500/20 border border-amber-500/30 text-amber-400'
                }`}>
                  {token.stage === 'live' ? 'Live on Raydium' : 'Pending LP'}
                </span>
              </div>
              <p className="text-lg text-cyan-400 font-medium mb-2">${token.symbol}</p>
              <p className="text-sm text-zinc-400 max-w-2xl">{token.description}</p>
            </div>
          </div>

          {/* Address Bar */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-900/50 border border-zinc-800">
            <span className="text-xs text-zinc-500">Contract:</span>
            <code className="text-sm text-white font-mono flex-1 truncate">{address}</code>
            <button
              onClick={copyAddress}
              className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-zinc-400" />}
            </button>
            <a
              href={`https://solscan.io/token/${address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors"
            >
              <ExternalLink className="w-4 h-4 text-zinc-400" />
            </a>
          </div>
        </motion.div>

        {/* Stats Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8"
        >
          <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800">
            <p className="text-xs text-zinc-500 mb-1">Price</p>
            <p className="text-xl font-bold text-white">
              {token.price_sol > 0 ? `${token.price_sol.toFixed(9)} SOL` : '—'}
            </p>
            {token.change_24h !== 0 && (
              <p className={`text-xs flex items-center gap-1 mt-1 ${
                token.change_24h > 0 ? 'text-emerald-400' : 'text-red-400'
              }`}>
                {token.change_24h > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {Math.abs(token.change_24h).toFixed(2)}%
              </p>
            )}
          </div>
          <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800">
            <p className="text-xs text-zinc-500 mb-1">Market Cap</p>
            <p className="text-xl font-bold text-white">
              {token.market_cap > 0 ? `${token.market_cap.toFixed(2)} SOL` : '—'}
            </p>
          </div>
          <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800">
            <p className="text-xs text-zinc-500 mb-1">Liquidity</p>
            <p className="text-xl font-bold text-cyan-400">
              {token.current_liquidity > 0 ? `${token.current_liquidity.toFixed(2)} SOL` : '—'}
            </p>
          </div>
          <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800">
            <p className="text-xs text-zinc-500 mb-1">Holders</p>
            <p className="text-xl font-bold text-white">{token.holders || 1}</p>
          </div>
        </motion.div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Token Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Token-2022 Features */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <GlassPanel title="Token-2022 Features" className="rounded-2xl">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-white/5">
                    <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                      <Coins className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">Total Supply</p>
                      <p className="text-xs text-zinc-400">{token.total_supply.toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-white/5">
                    <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                      <Shield className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">Decimals</p>
                      <p className="text-xs text-zinc-400">{token.decimals}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-500/10">
                    <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                      <Zap className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">Transfer Fee</p>
                      <p className="text-xs text-amber-400">Enabled (check on-chain)</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-cyan-500/10">
                    <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                      <Droplets className="w-5 h-5 text-cyan-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">Raydium Pool</p>
                      <p className="text-xs text-cyan-400">{token.stage === 'live' ? 'Active' : 'Not created'}</p>
                    </div>
                  </div>
                </div>
              </GlassPanel>
            </motion.div>

            {/* Social Links */}
            {(token.website || token.twitter || token.telegram || token.discord) && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <GlassPanel title="Links" className="rounded-2xl">
                  <div className="flex flex-wrap gap-3">
                    {token.website && (
                      <a
                        href={token.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-sm text-white"
                      >
                        🌐 Website <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    {token.twitter && (
                      <a
                        href={token.twitter}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-sm text-white"
                      >
                        𝕏 Twitter <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    {token.telegram && (
                      <a
                        href={token.telegram}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-sm text-white"
                      >
                        ✈️ Telegram <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    {token.discord && (
                      <a
                        href={token.discord}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-sm text-white"
                      >
                        💬 Discord <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </GlassPanel>
              </motion.div>
            )}
          </div>

          {/* Right Column - Actions */}
          <div className="space-y-6">
            {/* Trade Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
            >
              <GlassPanel title="Trade" className="rounded-2xl">
                <div className="space-y-4">
                  <a
                    href={`https://raydium.io/swap/?inputMint=sol&outputMint=${address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium hover:opacity-90 transition-opacity"
                  >
                    Trade on Raydium <ExternalLink className="w-4 h-4" />
                  </a>
                  <a
                    href={`https://jup.ag/swap/SOL-${address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-zinc-800 text-white font-medium hover:bg-zinc-700 transition-colors"
                  >
                    Trade on Jupiter <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </GlassPanel>
            </motion.div>

            {/* Creator Actions */}
            {isCreator && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <GlassPanel title="Creator Controls" className="rounded-2xl">
                  <div className="space-y-3">
                    <Link
                      href={`/token22/${address}/liquidity`}
                      className="flex items-center justify-between w-full p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 hover:bg-cyan-500/20 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Droplets className="w-5 h-5 text-cyan-400" />
                        <span className="text-sm font-medium text-white">Manage Liquidity</span>
                      </div>
                      <ArrowUpRight className="w-4 h-4 text-cyan-400" />
                    </Link>
                    <button
                      className="flex items-center justify-between w-full p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 transition-colors"
                      onClick={() => {/* TODO: Harvest fees */}}
                    >
                      <div className="flex items-center gap-3">
                        <Zap className="w-5 h-5 text-amber-400" />
                        <span className="text-sm font-medium text-white">Harvest Transfer Fees</span>
                      </div>
                      <ArrowUpRight className="w-4 h-4 text-amber-400" />
                    </button>
                  </div>
                </GlassPanel>
              </motion.div>
            )}

            {/* Quick Stats */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
            >
              <GlassPanel title="Stats" className="rounded-2xl">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-400">24h Volume</span>
                    <span className="text-sm font-medium text-white">
                      {token.volume_24h > 0 ? `${token.volume_24h.toFixed(2)} SOL` : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-400">24h Change</span>
                    <span className={`text-sm font-medium ${
                      token.change_24h > 0 ? 'text-emerald-400' : token.change_24h < 0 ? 'text-red-400' : 'text-white'
                    }`}>
                      {token.change_24h !== 0 ? `${token.change_24h > 0 ? '+' : ''}${token.change_24h.toFixed(2)}%` : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-400">Pool Status</span>
                    <span className={`text-sm font-medium ${
                      token.stage === 'live' ? 'text-cyan-400' : 'text-amber-400'
                    }`}>
                      {token.stage === 'live' ? 'Active' : 'Pending'}
                    </span>
                  </div>
                </div>
              </GlassPanel>
            </motion.div>
          </div>
        </div>
      </div>
    </main>
  )
}

