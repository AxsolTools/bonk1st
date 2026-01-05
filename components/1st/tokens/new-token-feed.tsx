"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { GoldCard } from "../ui/gold-card"
import { GoldButton } from "../ui/gold-button"
import { GoldBadge, PoolBadge, BlockBadge, TokenLogo } from "../ui/gold-badge"
import { GoldToggle } from "../ui/gold-input"
import { use1stSniper } from "@/hooks/use-1st-sniper"
import { useLivePrice } from "@/hooks/use-live-price"
import { formatTimeAgo, formatUsd, type TargetPool, type NewTokenEvent } from "@/lib/1st/sniper-config"

// Individual token card with live data fetching
function LiveTokenCard({ 
  token, 
  onClick 
}: { 
  token: NewTokenEvent
  onClick: () => void 
}) {
  const [stats, setStats] = React.useState<{
    liquidity: number
    holders: number
    bondingCurveProgress: number
  } | null>(null)
  
  // Use the existing live price hook for market cap
  const { marketCap, isLoading: priceLoading } = useLivePrice(token.tokenMint)
  
  // Fetch stats from existing backend API
  React.useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch(`/api/token/${token.tokenMint}/stats`)
        if (response.ok) {
          const data = await response.json()
          if (data.success && data.data) {
            setStats({
              liquidity: data.data.liquidity || 0,
              holders: data.data.holders || 0,
              bondingCurveProgress: data.data.bondingCurveProgress || 0,
            })
          }
        }
      } catch (error) {
        console.debug('[TOKEN-CARD] Stats fetch failed:', error)
      }
    }
    
    fetchStats()
    // Poll every 10 seconds like existing components
    const interval = setInterval(fetchStats, 10_000)
    return () => clearInterval(interval)
  }, [token.tokenMint])
  
  // Use live data if available, fallback to initial values
  const displayLiquidity = stats?.liquidity || token.initialLiquidityUsd
  const displayMarketCap = marketCap > 0 ? marketCap : token.initialMarketCap
  
  return (
    <GoldCard
      variant={token.passesFilters ? 'highlight' : 'default'}
      className="cursor-pointer hover:scale-[1.02] transition-transform"
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        <TokenLogo 
          src={token.tokenLogo || `https://dd.dexscreener.com/ds-data/tokens/solana/${token.tokenMint}.png`} 
          symbol={token.tokenSymbol || '??'} 
          size="lg" 
        />
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-white truncate">
              ${token.tokenSymbol || 'UNKNOWN'}
            </span>
            {token.passesFilters && (
              <GoldBadge variant="success" size="xs">✓</GoldBadge>
            )}
          </div>
          
          <div className="flex items-center gap-2 mb-2">
            <PoolBadge pool={token.pool} />
            <BlockBadge block={token.creationBlock} />
          </div>
          
          <p className="text-[10px] text-white/40 font-mono truncate">
            {token.tokenMint}
          </p>
        </div>
      </div>
      
      <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-[#D4AF37]/10">
        <div className="text-center">
          <p className="text-[10px] text-white/40">Liquidity</p>
          <p className="text-xs font-semibold text-[#D4AF37]">
            {formatUsd(displayLiquidity)}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-white/40">MC</p>
          <p className="text-xs font-semibold text-white">
            {priceLoading ? '...' : formatUsd(displayMarketCap)}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-white/40">Age</p>
          <p className="text-xs font-semibold text-white">
            {formatTimeAgo(token.creationTimestamp)}
          </p>
        </div>
      </div>
      
      <div className="flex gap-2 mt-3">
        <GoldButton 
          variant="primary" 
          size="sm" 
          className="flex-1"
          onClick={(e) => {
            e.stopPropagation()
            onClick()
          }}
        >
          TRADE
        </GoldButton>
        <GoldButton 
          variant="ghost" 
          size="sm"
          onClick={(e) => {
            e.stopPropagation()
            window.open(`https://solscan.io/token/${token.tokenMint}`, '_blank')
          }}
        >
          ↗
        </GoldButton>
      </div>
    </GoldCard>
  )
}

// Main Token Feed Component
// Navigates to existing /token/[address] page which uses all existing backend APIs
export function NewTokenFeed() {
  const router = useRouter()
  const { newTokens, config, wsConnected, addLog } = use1stSniper()
  
  const [filter, setFilter] = React.useState<'all' | TargetPool>('all')
  const [showPassedOnly, setShowPassedOnly] = React.useState(false)
  
  // Navigate to 1st token page (uses existing backend with gold theme)
  const handleTokenClick = (tokenMint: string) => {
    router.push(`/1st/token/${tokenMint}`)
  }
  
  // Filter tokens
  const filteredTokens = React.useMemo(() => {
    return newTokens.filter(token => {
      if (filter !== 'all' && token.pool !== filter) return false
      if (showPassedOnly && !token.passesFilters) return false
      return true
    })
  }, [newTokens, filter, showPassedOnly])
  
  return (
    <div className="w-full max-w-[1920px] mx-auto px-4 lg:px-8 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#D4AF37]">NEW TOKENS</h1>
          <p className="text-xs text-white/50">Real-time detection of newly created tokens</p>
        </div>
        
        <div className="flex items-center gap-3">
          <GoldBadge variant={wsConnected ? 'success' : 'danger'} dot pulse={wsConnected}>
            {wsConnected ? 'LIVE FEED' : 'DISCONNECTED'}
          </GoldBadge>
          <GoldBadge variant="gold">
            {filteredTokens.length} tokens
          </GoldBadge>
        </div>
      </div>
      
      {/* Filters */}
      <GoldCard variant="default">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex gap-1">
            {(['all', 'bonk-usd1', 'bonk-sol', 'pump'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "px-3 py-1.5 text-xs font-semibold uppercase rounded-lg transition-all",
                  filter === f
                    ? "bg-[#D4AF37]/20 text-[#FFD700] border border-[#D4AF37]/40"
                    : "text-white/50 hover:text-white border border-transparent"
                )}
              >
                {f === 'all' ? 'ALL' : f.toUpperCase()}
              </button>
            ))}
          </div>
          
          <div className="h-6 w-px bg-white/10" />
          
          <GoldToggle
            checked={showPassedOnly}
            onChange={setShowPassedOnly}
            label="Passed Filters Only"
            size="sm"
          />
        </div>
      </GoldCard>
      
      {/* Token Grid */}
      {filteredTokens.length === 0 ? (
        <GoldCard variant="elevated" className="text-center py-12">
          <div className="text-4xl mb-4">🔍</div>
          <p className="text-white/50">No tokens detected yet</p>
          <p className="text-xs text-white/30 mt-1">
            {wsConnected 
              ? 'Waiting for new token creations...' 
              : 'Connect WebSocket to start monitoring'
            }
          </p>
        </GoldCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTokens.map((token) => (
            <LiveTokenCard
              key={token.tokenMint}
              token={token}
              onClick={() => handleTokenClick(token.tokenMint)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

