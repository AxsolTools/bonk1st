"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Token } from "@/lib/types/database"
import { TokenHeader } from "@/components/token/token-header"
import { TokenChart } from "@/components/token/token-chart"
import { TradePanel } from "@/components/token/trade-panel"
import { MetricsGrid } from "@/components/token/metrics-grid"
import { TokenInfo } from "@/components/token/token-info"
import { TransactionHistory } from "@/components/token/transaction-history"
import { BoostSection } from "@/components/token/boost-section"
import { VoteBoostPanel } from "@/components/token/vote-boost-panel"
import { TokenPourOverlay } from "@/components/token/token-pour-overlay"
import { TokenChat } from "@/components/token/token-chat"
import { TokenComments } from "@/components/token/token-comments"
import { Token22SettingsPanel } from "@/components/dashboard/token22-settings-panel"
import { TokenParametersPanel } from "@/components/dashboard/token-parameters-panel"
import { VolumeBotQuickControls } from "@/components/token/volume-bot-quick-controls"
import { useAuth } from "@/components/providers/auth-provider"
import Link from "next/link"

interface TokenDashboardProps {
  address: string
}

interface OnChainTokenData {
  name: string
  symbol: string
  decimals: number
  supply: number
  image?: string
  description?: string
  uri?: string
}

export function TokenDashboard({ address }: TokenDashboardProps) {
  const { activeWallet, mainWallet } = useAuth()
  const [token, setToken] = useState<Token | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isExternal, setIsExternal] = useState(false) // True if token was NOT created on PROPEL platform
  const [isToken22, setIsToken22] = useState(false) // True if token is Token-2022 standard
  
  const walletAddress = activeWallet?.public_key || mainWallet?.public_key

  useEffect(() => {
    const supabase = createClient()
    let channel: ReturnType<typeof supabase.channel> | null = null

    const fetchData = async (retryCount = 0) => {
      console.log(`[DEBUG] Fetching token data for address: ${address}`)
      
      // First try to fetch from database
      const { data: tokenData, error: tokenError } = await supabase
        .from("tokens")
        .select("*, token_parameters(*)")
        .eq("mint_address", address)
        .single()
      
      console.log(`[DEBUG] Supabase response:`, { tokenData, tokenError })

      if (tokenError) {
        // If token not found in DB, try fetching from on-chain
        if (tokenError.code === 'PGRST116') {
          console.log(`[TOKEN] Token not in database, fetching from chain...`)
          const onChainToken = await fetchTokenFromChain(address)
          
          if (onChainToken) {
            setToken(onChainToken)
            setIsExternal(true)
            setIsLoading(false)
            return
          }
          
          // If we still can't find it, maybe it's newly created - retry a few times
          if (retryCount < 2) {
            console.log(`[TOKEN] Retrying in ${(retryCount + 1) * 1000}ms... (attempt ${retryCount + 1}/2)`)
            await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 1000))
            return fetchData(retryCount + 1)
          }
        }
        
        setError("Token not found. Please check the contract address.")
        setIsLoading(false)
        return
      }

      // Token found in database
      console.log(`[DEBUG] Token found in DB:`, {
        mint_address: tokenData.mint_address,
        name: tokenData.name,
        symbol: tokenData.symbol,
        stage: tokenData.stage,
        market_cap: tokenData.market_cap,
        price_sol: tokenData.price_sol,
        image_url: tokenData.image_url,
      })
      
      const tokenWithMetrics = {
        ...tokenData,
        pour_rate: tokenData.token_parameters?.pour_rate_percent ?? 0,
        evaporation_rate: tokenData.token_parameters?.evaporation_rate_percent ?? 0,
        total_evaporated: tokenData.token_parameters?.total_evaporated ?? 0,
      } as Token
      setToken(tokenWithMetrics)
      // Use is_platform_token field if available, otherwise check for creator_id
      setIsExternal(!(tokenData.is_platform_token ?? (tokenData.creator_id !== null)))
      // Check if token is Token-2022 (has token_standard field or token22_parameters)
      setIsToken22(tokenData.token_standard === 'token22' || !!tokenData.token22_parameters)
      setIsLoading(false)
      
      console.log(`[DEBUG] Token state set, stage: ${tokenData.stage}, isExternal: false`)

      // Set up real-time subscription for token updates
      channel = supabase
        .channel(`token-dashboard-${tokenData.id}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "tokens", filter: `mint_address=eq.${address}` },
          (payload) => {
            setToken(prev => ({
              ...(payload.new as Token),
              token_parameters: prev?.token_parameters,
              pour_rate: prev?.pour_rate,
              evaporation_rate: prev?.evaporation_rate,
              total_evaporated: prev?.total_evaporated,
            }))
          },
        )
        .subscribe()
    }

    fetchData()

    return () => {
      if (channel) {
        supabase.removeChannel(channel)
      }
    }
  }, [address])

  // Fetch token data from on-chain (for tokens not created on our platform)
  async function fetchTokenFromChain(mintAddress: string): Promise<Token | null> {
    try {
      console.log(`[TOKEN] Fetching on-chain data for ${mintAddress}`)

      // Try to get token metadata from our API
      const metadataResponse = await fetch(`/api/token/${mintAddress}/metadata`)
      let metadata: OnChainTokenData | null = null
      
      if (metadataResponse.ok) {
        const metadataResult = await metadataResponse.json()
        if (metadataResult.success) {
          metadata = metadataResult.data
        }
      }

      // If our API doesn't have it, try DexScreener for basic info
      if (!metadata) {
        const dexResponse = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mintAddress}`)
        if (dexResponse.ok) {
          const dexData = await dexResponse.json()
          if (dexData.pairs && dexData.pairs.length > 0) {
            const pair = dexData.pairs[0]
            metadata = {
              name: pair.baseToken?.name || "Unknown Token",
              symbol: pair.baseToken?.symbol || "???",
              decimals: 9, // Default for most Solana tokens
              supply: 0,
              image: pair.info?.imageUrl || `https://dd.dexscreener.com/ds-data/tokens/solana/${mintAddress}.png`,
            }
          }
        }
      }

      // Try Jupiter for token info
      if (!metadata) {
        const jupResponse = await fetch(`https://tokens.jup.ag/token/${mintAddress}`)
        if (jupResponse.ok) {
          const jupData = await jupResponse.json()
          if (jupData) {
            metadata = {
              name: jupData.name || "Unknown Token",
              symbol: jupData.symbol || "???",
              decimals: jupData.decimals || 9,
              supply: jupData.daily_volume ? 0 : 0,
              image: jupData.logoURI || `https://dd.dexscreener.com/ds-data/tokens/solana/${mintAddress}.png`,
            }
          }
        }
      }

      // If still no metadata, create minimal token data
      if (!metadata) {
        // Try to get basic on-chain data
        const priceResponse = await fetch(`/api/price/token?mint=${mintAddress}`)
        if (priceResponse.ok) {
          const priceData = await priceResponse.json()
          if (priceData.success) {
            metadata = {
              name: "External Token",
              symbol: mintAddress.slice(0, 6).toUpperCase(),
              decimals: 9,
              supply: 0,
            }
          }
        }
      }

      if (!metadata) {
        console.warn(`[TOKEN] Could not fetch metadata for ${mintAddress}`)
        return null
      }

      // Fetch price data
      let priceUsd = 0
      let priceSol = 0
      let marketCap = 0

      try {
        const priceResponse = await fetch(`/api/price/token?mint=${mintAddress}`)
        if (priceResponse.ok) {
          const priceData = await priceResponse.json()
          if (priceData.success && priceData.data) {
            priceUsd = priceData.data.priceUsd || 0
            priceSol = priceData.data.priceSol || 0
            marketCap = priceData.data.marketCap || 0
          }
        }
      } catch (e) {
        console.warn('[TOKEN] Failed to fetch price:', e)
      }

      // Create a Token-like object for external tokens
      const externalToken: Token = {
        id: `external-${mintAddress}`,
        creator_id: null,
        creator_wallet: "",
        mint_address: mintAddress,
        name: metadata.name,
        symbol: metadata.symbol,
        description: metadata.description || `External token: ${mintAddress}`,
        image_url: metadata.image || metadata.logoUri || "",
        metadata_uri: metadata.uri || "",
        total_supply: metadata.supply || 0,
        decimals: metadata.decimals,
        stage: "external" as Token["stage"],
        website: null,
        twitter: null,
        telegram: null,
        discord: null,
        launch_tx_signature: null,
        initial_buy_sol: 0,
        price_sol: priceSol,
        price_usd: priceUsd,
        market_cap: marketCap,
        market_cap_usd: marketCap,
        current_liquidity: 0,
        volume_24h: 0,
        change_24h: 0,
        holders: 0,
        water_level: 50,
        constellation_strength: 50,
        migration_threshold: 69000,
        bonding_curve_progress: 0,
        migrated_at: null,
        migration_pool_address: null,
        vote_count: 0,
        boost_amount: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        pour_rate: 0,
        evaporation_rate: 0,
        total_evaporated: 0,
      }

      return externalToken
    } catch (error) {
      console.error('[TOKEN] Error fetching from chain:', error)
      return null
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="spinner" />
          <p className="text-sm text-[var(--text-muted)]">Loading token data...</p>
        </div>
      </div>
    )
  }

  if (error || !token) {
    return (
      <div className="card p-8 max-w-md mx-auto text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center">
          <svg className="w-8 h-8 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Token Not Found</h2>
        <p className="text-sm text-[var(--text-muted)] mb-2">We couldn&apos;t find this token on-chain.</p>
        <p className="text-xs text-[var(--text-muted)] mb-4 font-mono break-all bg-[var(--bg-secondary)] p-2 rounded">{address}</p>
        <Link href="/" className="btn-primary">
          Back to Discover
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* External token banner */}
      {isExternal && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center gap-3">
          <svg className="w-5 h-5 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-amber-400">External Token</p>
            <p className="text-xs text-amber-400/70">This token was not created on PROPEL. Some features may be limited.</p>
          </div>
        </div>
      )}

      {/* Pour effect overlay - only for platform tokens */}
      {!isExternal && (
        <TokenPourOverlay tokenId={token.id} tokenSymbol={token.symbol} creatorWallet={token.creator_wallet || ""} />
      )}

      {/* Token Header */}
      <TokenHeader token={token} />

      {/* Main Grid: Chart + Trade Panel + Chat */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Left Side: Chart + Recent Transactions */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-3">
          <TokenChart mintAddress={token.mint_address} tokenSymbol={token.symbol} />
          <TransactionHistory tokenAddress={token.mint_address} tokenId={token.id} />
        </div>

        {/* Right Side: Trade Panel + Volume Bot + Live Chat */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-3">
          <TradePanel token={token} />
          <VolumeBotQuickControls 
            tokenMint={token.mint_address} 
            tokenSymbol={token.symbol}
            currentPrice={token.price_sol || 0}
          />
          <TokenChat tokenAddress={token.mint_address} />
        </div>
      </div>

      {/* Second Row: Token Info + Community */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        <div className="xl:col-span-1">
          <TokenInfo token={token} />
        </div>
        <div className="xl:col-span-2">
          <VoteBoostPanel tokenAddress={token.mint_address} tokenName={token.name} />
        </div>
      </div>

      {/* Metrics Row - only for platform tokens */}
      {!isExternal && <MetricsGrid token={token} isToken22={isToken22} />}

      {/* Comments & Boost Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <TokenComments tokenAddress={token.mint_address} />
        <BoostSection tokenAddress={token.mint_address} />
      </div>
      
      {/* Creator Settings Panel - only visible to token creator */}
      {!isExternal && walletAddress && token.creator_wallet && 
        walletAddress.toLowerCase() === token.creator_wallet.toLowerCase() && (
        <div className="mt-6">
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">
            Creator Settings
          </h2>
          {isToken22 ? (
            <Token22SettingsPanel 
              tokenId={token.id}
              mintAddress={token.mint_address}
              tokenSymbol={token.symbol}
              isCreator={true}
            />
          ) : (
            <TokenParametersPanel tokenAddress={token.mint_address} />
          )}
        </div>
      )}
    </div>
  )
}
