"use client"

import { useState, useEffect } from "react"
import { Header } from "@/components/layout/header"
import { GlobalPourEffect } from "@/components/visuals/global-pour-effect"
import { VolumeBotPanel } from "@/components/dashboard/volume-bot-panel"
import { useAuth } from "@/components/providers/auth-provider"
import { createClient } from "@/lib/supabase/client"
import { BarChart3, Search, ChevronRight, Settings, Activity, Wallet, Zap } from "lucide-react"
import Link from "next/link"
import Image from "next/image"

interface Token {
  id: string
  mint_address: string
  name: string
  symbol: string
  image_url?: string
  price_sol?: number
  price_usd?: number
  market_cap?: number
}

export default function VolumeBotPage() {
  const { isAuthenticated, wallets, activeWallet, setIsOnboarding } = useAuth()
  const [tokens, setTokens] = useState<Token[]>([])
  const [selectedToken, setSelectedToken] = useState<Token | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [isLoading, setIsLoading] = useState(true)

  // Load user's created tokens
  useEffect(() => {
    if (!isAuthenticated || !activeWallet) {
      setIsLoading(false)
      return
    }

    const loadTokens = async () => {
      const supabase = createClient()
      
      // Get tokens created by user's wallets
      const walletAddresses = wallets.map(w => w.public_key)
      
      const { data, error } = await supabase
        .from("tokens")
        .select("id, mint_address, name, symbol, image_url, price_sol, price_usd, market_cap")
        .in("creator_wallet", walletAddresses)
        .order("created_at", { ascending: false })

      if (!error && data) {
        setTokens(data)
        if (data.length > 0 && !selectedToken) {
          setSelectedToken(data[0])
        }
      }
      setIsLoading(false)
    }

    loadTokens()
  }, [isAuthenticated, activeWallet, wallets])

  // Filter tokens based on search
  const filteredTokens = tokens.filter(t => 
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.mint_address.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (!isAuthenticated) {
    return (
      <main className="min-h-screen bg-[var(--bg-primary)]">
        <GlobalPourEffect />
        <Header />
        
        <div className="px-4 py-16 max-w-lg mx-auto text-center">
          <div className="glass-panel p-8 rounded-2xl">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-purple-500/20 to-purple-600/20 border border-purple-500/30 flex items-center justify-center">
              <BarChart3 className="w-10 h-10 text-purple-400" />
            </div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-3">Volume Bot</h1>
            <p className="text-[var(--text-muted)] mb-6">
              Connect your wallet to access the Volume Bot and manage automated trading strategies.
            </p>
            <button 
              onClick={() => setIsOnboarding(true)}
              className="btn-primary w-full py-3"
            >
              Connect Wallet
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[var(--bg-primary)]">
      <GlobalPourEffect />
      <Header />

      <div className="px-3 sm:px-4 lg:px-6 py-4">
        <div className="max-w-7xl mx-auto">
          {/* Page Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-600/20 border border-purple-500/30 flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-purple-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-[var(--text-primary)]">Volume Bot</h1>
                <p className="text-sm text-[var(--text-muted)]">
                  Automated volume generation with Smart Profit controls
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Token Selector Sidebar */}
            <div className="lg:col-span-4 xl:col-span-3">
              <div className="glass-panel rounded-xl overflow-hidden sticky top-20">
                <div className="p-4 border-b border-[var(--border-subtle)]">
                  <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
                    <Settings className="w-4 h-4" />
                    Your Tokens
                  </h2>
                  
                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search tokens..."
                      className="input w-full pl-9 py-2 text-sm"
                    />
                  </div>
                </div>

                {/* Token List */}
                <div className="max-h-[60vh] overflow-y-auto">
                  {isLoading ? (
                    <div className="p-4 text-center">
                      <div className="spinner mx-auto mb-2" />
                      <p className="text-xs text-[var(--text-muted)]">Loading tokens...</p>
                    </div>
                  ) : filteredTokens.length === 0 ? (
                    <div className="p-6 text-center">
                      <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center">
                        <Wallet className="w-6 h-6 text-[var(--text-muted)]" />
                      </div>
                      <p className="text-sm text-[var(--text-muted)] mb-3">
                        {tokens.length === 0 
                          ? "No tokens found. Create a token first to use Volume Bot."
                          : "No tokens match your search."}
                      </p>
                      {tokens.length === 0 && (
                        <Link href="/launch" className="text-sm text-purple-400 hover:text-purple-300">
                          Create a token →
                        </Link>
                      )}
                    </div>
                  ) : (
                    filteredTokens.map((token) => (
                      <button
                        key={token.id}
                        onClick={() => setSelectedToken(token)}
                        className={`w-full flex items-center gap-3 p-3 border-b border-[var(--border-subtle)] transition-all hover:bg-[var(--bg-secondary)] ${
                          selectedToken?.id === token.id ? "bg-purple-500/10 border-l-2 border-l-purple-500" : ""
                        }`}
                      >
                        {token.image_url ? (
                          <Image
                            src={token.image_url}
                            alt={token.name}
                            width={36}
                            height={36}
                            className="w-9 h-9 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500/30 to-purple-600/30 flex items-center justify-center text-xs font-bold text-purple-400">
                            {token.symbol?.slice(0, 2)}
                          </div>
                        )}
                        <div className="flex-1 min-w-0 text-left">
                          <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                            {token.name}
                          </p>
                          <p className="text-xs text-[var(--text-muted)] font-mono">
                            {token.symbol}
                          </p>
                        </div>
                        <ChevronRight className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${
                          selectedToken?.id === token.id ? "text-purple-400" : ""
                        }`} />
                      </button>
                    ))
                  )}
                </div>

                {/* External Token Input */}
                <div className="p-4 border-t border-[var(--border-subtle)]">
                  <p className="text-xs text-[var(--text-muted)] mb-2">Or enter any token address:</p>
                  <form onSubmit={(e) => {
                    e.preventDefault()
                    const input = (e.target as HTMLFormElement).tokenAddress as HTMLInputElement
                    if (input.value) {
                      setSelectedToken({
                        id: `ext-${input.value}`,
                        mint_address: input.value,
                        name: "External Token",
                        symbol: input.value.slice(0, 4).toUpperCase(),
                      })
                    }
                  }}>
                    <input
                      name="tokenAddress"
                      type="text"
                      placeholder="Token mint address..."
                      className="input w-full text-xs font-mono mb-2"
                    />
                    <button type="submit" className="btn-secondary w-full text-xs py-2">
                      Load Token
                    </button>
                  </form>
                </div>
              </div>
            </div>

            {/* Main Content - Volume Bot Panel */}
            <div className="lg:col-span-8 xl:col-span-9">
              {selectedToken ? (
                <div className="space-y-4">
                  {/* Token Info Header */}
                  <div className="glass-panel p-4 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {selectedToken.image_url ? (
                        <Image
                          src={selectedToken.image_url}
                          alt={selectedToken.name}
                          width={48}
                          height={48}
                          className="w-12 h-12 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500/30 to-purple-600/30 flex items-center justify-center text-lg font-bold text-purple-400">
                          {selectedToken.symbol?.slice(0, 2)}
                        </div>
                      )}
                      <div>
                        <h2 className="text-lg font-bold text-[var(--text-primary)]">
                          {selectedToken.name}
                        </h2>
                        <p className="text-sm text-[var(--text-muted)] font-mono">
                          {selectedToken.mint_address.slice(0, 8)}...{selectedToken.mint_address.slice(-8)}
                        </p>
                      </div>
                    </div>
                    <Link 
                      href={`/token/${selectedToken.mint_address}`}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--bg-secondary)]/80 text-sm text-[var(--text-primary)] transition-all"
                    >
                      <Activity className="w-4 h-4" />
                      View Token Page
                    </Link>
                  </div>

                  {/* Volume Bot Panel */}
                  <VolumeBotPanel
                    tokenMint={selectedToken.mint_address}
                    tokenSymbol={selectedToken.symbol}
                    tokenDecimals={9}
                    currentPrice={selectedToken.price_sol || 0}
                  />
                </div>
              ) : (
                <div className="glass-panel p-12 rounded-xl text-center">
                  <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-[var(--bg-secondary)] flex items-center justify-center">
                    <Zap className="w-10 h-10 text-[var(--text-muted)]" />
                  </div>
                  <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
                    Select a Token
                  </h2>
                  <p className="text-[var(--text-muted)] max-w-md mx-auto">
                    Choose a token from your portfolio or enter a token address to configure the Volume Bot.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

