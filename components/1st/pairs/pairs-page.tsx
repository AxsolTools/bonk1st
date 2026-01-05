"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { GoldCard, GoldCardHeader, StatCard } from "../ui/gold-card"
import { GoldBadge, PoolBadge, TokenLogo } from "../ui/gold-badge"
import { GoldButton } from "../ui/gold-button"
import { GoldToggle, GoldInput } from "../ui/gold-input"
import { SwapPanel1st } from "../swap/swap-panel-1st"
import { use1stSniper } from "@/hooks/use-1st-sniper"
import { formatUsd, formatTimeAgo, type TargetPool } from "@/lib/1st/sniper-config"

// Pool configuration
const POOL_CONFIGS: {
  id: TargetPool
  name: string
  description: string
  quoteCurrency: string
  color: string
}[] = [
  {
    id: 'bonk-usd1',
    name: 'BONK/USD1',
    description: 'LaunchLab pools paired with USD1 stablecoin',
    quoteCurrency: 'USD1',
    color: '#D4AF37',
  },
  {
    id: 'bonk-sol',
    name: 'BONK/SOL',
    description: 'LaunchLab pools paired with SOL',
    quoteCurrency: 'SOL',
    color: '#9945FF',
  },
  {
    id: 'pump',
    name: 'Pump.fun',
    description: 'Pump.fun bonding curve tokens',
    quoteCurrency: 'SOL',
    color: '#00FFFF',
  },
  {
    id: 'raydium',
    name: 'Raydium AMM',
    description: 'Standard Raydium V4 liquidity pools',
    quoteCurrency: 'SOL',
    color: '#00FF41',
  },
]

// Pool Card Component
function PoolCard({ 
  pool, 
  tokenCount,
  isMonitored,
  onToggleMonitor,
}: {
  pool: typeof POOL_CONFIGS[0]
  tokenCount: number
  isMonitored: boolean
  onToggleMonitor: () => void
}) {
  return (
    <GoldCard 
      variant={isMonitored ? 'highlight' : 'default'}
      className="relative overflow-hidden"
    >
      {/* Color accent */}
      <div 
        className="absolute top-0 left-0 right-0 h-1"
        style={{ backgroundColor: pool.color }}
      />
      
      <div className="pt-2">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-lg font-bold text-white">{pool.name}</h3>
            <p className="text-xs text-white/50">{pool.description}</p>
          </div>
          
          <GoldToggle
            checked={isMonitored}
            onChange={onToggleMonitor}
            size="sm"
          />
        </div>
        
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="p-2 bg-[#0A0A0A] rounded-lg">
            <p className="text-[10px] text-white/40">Quote Currency</p>
            <p className="text-sm font-semibold" style={{ color: pool.color }}>
              {pool.quoteCurrency}
            </p>
          </div>
          <div className="p-2 bg-[#0A0A0A] rounded-lg">
            <p className="text-[10px] text-white/40">Tokens Detected</p>
            <p className="text-sm font-semibold text-white">
              {tokenCount}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <GoldBadge 
            variant={isMonitored ? 'success' : 'default'} 
            size="xs" 
            dot 
            pulse={isMonitored}
          >
            {isMonitored ? 'MONITORING' : 'INACTIVE'}
          </GoldBadge>
        </div>
      </div>
    </GoldCard>
  )
}

// Single row with live data fetching
function LivePairRow({
  pair,
  onSelectPair,
}: {
  pair: {
    tokenMint: string
    tokenSymbol: string
    tokenLogo?: string
    pool: TargetPool
    initialLiquidity: number
    createdAt: number
  }
  onSelectPair: (mint: string, pool: TargetPool) => void
}) {
  const [liveData, setLiveData] = React.useState<{ 
    liquidity: number
    logo: string | null 
  }>({
    liquidity: pair.initialLiquidity,
    logo: pair.tokenLogo || null,
  })
  
  // Fetch live data from existing backend APIs
  React.useEffect(() => {
    const fetchData = async () => {
      try {
        const [metadataRes, statsRes] = await Promise.all([
          fetch(`/api/token/${pair.tokenMint}/metadata`),
          fetch(`/api/token/${pair.tokenMint}/stats`),
        ])
        
        let liquidity = pair.initialLiquidity
        let logo = pair.tokenLogo || null
        
        // Get logo from metadata
        if (metadataRes.ok) {
          const metaData = await metadataRes.json()
          if (metaData.success && metaData.data) {
            logo = metaData.data.logoUri || metaData.data.logo || metaData.data.image || logo
          }
        }
        
        // Get liquidity from stats
        if (statsRes.ok) {
          const statsData = await statsRes.json()
          if (statsData.success && statsData.data) {
            if (statsData.data.liquidity > 0) {
              liquidity = statsData.data.liquidity
            } else if (statsData.data.bondingCurveSol > 0) {
              liquidity = statsData.data.bondingCurveSol * 150
            }
          }
        }
        
        setLiveData({ liquidity, logo })
      } catch (error) {
        console.debug('[PAIR-ROW] Data fetch failed:', error)
      }
    }
    
    fetchData()
    const interval = setInterval(fetchData, 10_000)
    return () => clearInterval(interval)
  }, [pair.tokenMint, pair.initialLiquidity, pair.tokenLogo])
  
  const displayLiquidity = liveData.liquidity
  // Don't use DexScreener CDN fallback - it 404s for new tokens
  const displayLogo = liveData.logo || undefined
  
  return (
    <tr className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
      <td className="py-3 pr-4">
        <div className="flex items-center gap-2">
          <TokenLogo 
            src={displayLogo} 
            symbol={pair.tokenSymbol} 
            size="sm" 
          />
          <span className="font-semibold text-white">${pair.tokenSymbol}</span>
        </div>
      </td>
      <td className="py-3 pr-4">
        <PoolBadge pool={pair.pool} />
      </td>
      <td className="py-3 pr-4">
        <span className="text-sm text-[#D4AF37] font-mono">
          {formatUsd(displayLiquidity)}
        </span>
      </td>
      <td className="py-3 pr-4">
        <span className="text-sm text-white/50">
          {formatTimeAgo(pair.createdAt)}
        </span>
      </td>
      <td className="py-3">
        <GoldButton 
          variant="primary" 
          size="sm"
          onClick={() => onSelectPair(pair.tokenMint, pair.pool)}
        >
          TRADE
        </GoldButton>
      </td>
    </tr>
  )
}

// Recent Pairs Table
function RecentPairsTable({ 
  pairs,
  onSelectPair,
}: {
  pairs: {
    tokenMint: string
    tokenSymbol: string
    tokenLogo?: string
    pool: TargetPool
    initialLiquidity: number
    createdAt: number
  }[]
  onSelectPair: (mint: string, pool: TargetPool) => void
}) {
  if (pairs.length === 0) {
    return (
      <div className="text-center py-8 text-white/40">
        <p className="text-sm">No pairs detected yet</p>
      </div>
    )
  }
  
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="text-left text-[10px] text-white/40 uppercase tracking-wider border-b border-[#D4AF37]/10">
            <th className="pb-2 pr-4">Token</th>
            <th className="pb-2 pr-4">Pool</th>
            <th className="pb-2 pr-4">Liquidity</th>
            <th className="pb-2 pr-4">Age</th>
            <th className="pb-2">Action</th>
          </tr>
        </thead>
        <tbody>
          {pairs.map((pair) => (
            <LivePairRow
              key={pair.tokenMint}
              pair={pair}
              onSelectPair={onSelectPair}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Main Pairs Page
export function PairsPage() {
  const { config, setConfig, newTokens, wsConnected } = use1stSniper()
  
  const [selectedPair, setSelectedPair] = React.useState<{
    mint: string
    symbol: string
    pool: TargetPool
  } | null>(null)
  
  // Count tokens per pool
  const tokenCounts = React.useMemo(() => {
    const counts: Record<TargetPool, number> = {
      'bonk-usd1': 0,
      'bonk-sol': 0,
      'pump': 0,
      'raydium': 0,
    }
    
    newTokens.forEach(token => {
      counts[token.pool]++
    })
    
    return counts
  }, [newTokens])
  
  // Convert new tokens to pairs format
  const recentPairs = React.useMemo(() => {
    return newTokens.slice(0, 20).map(token => ({
      tokenMint: token.tokenMint,
      tokenSymbol: token.tokenSymbol || 'UNKNOWN',
      tokenLogo: token.tokenLogo || `https://dd.dexscreener.com/ds-data/tokens/solana/${token.tokenMint}.png`,
      pool: token.pool,
      initialLiquidity: token.initialLiquidityUsd,
      createdAt: token.creationTimestamp,
    }))
  }, [newTokens])
  
  const togglePoolMonitoring = (pool: TargetPool) => {
    const current = config.targetPools
    if (current.includes(pool)) {
      setConfig({ targetPools: current.filter(p => p !== pool) })
    } else {
      setConfig({ targetPools: [...current, pool] })
    }
  }
  
  return (
    <div className="w-full max-w-[1920px] mx-auto px-4 lg:px-8 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#D4AF37]">TRADING PAIRS</h1>
          <p className="text-xs text-white/50">Monitor and trade new liquidity pools</p>
        </div>
        
        <div className="flex items-center gap-3">
          <GoldBadge variant={wsConnected ? 'success' : 'danger'} dot pulse={wsConnected}>
            {wsConnected ? 'LIVE' : 'OFFLINE'}
          </GoldBadge>
          <GoldBadge variant="gold">
            {config.targetPools.length} pools monitored
          </GoldBadge>
        </div>
      </div>
      
      {/* Pool Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {POOL_CONFIGS.map((pool) => (
          <PoolCard
            key={pool.id}
            pool={pool}
            tokenCount={tokenCounts[pool.id]}
            isMonitored={config.targetPools.includes(pool.id)}
            onToggleMonitor={() => togglePoolMonitoring(pool.id)}
          />
        ))}
      </div>
      
      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Pairs Table */}
        <div className="lg:col-span-2">
          <GoldCard variant="elevated">
            <GoldCardHeader
              title="Recent Pairs"
              subtitle="Newly created liquidity pools"
              status={wsConnected ? 'active' : 'inactive'}
            />
            
            <RecentPairsTable
              pairs={recentPairs}
              onSelectPair={(mint, pool) => {
                const token = newTokens.find(t => t.tokenMint === mint)
                setSelectedPair({
                  mint,
                  symbol: token?.tokenSymbol || 'UNKNOWN',
                  pool,
                })
              }}
            />
          </GoldCard>
        </div>
        
        {/* Swap Panel */}
        <div>
          {selectedPair ? (
            <SwapPanel1st
              tokenMint={selectedPair.mint}
              tokenSymbol={selectedPair.symbol}
              pool={selectedPair.pool}
              onSuccess={(tx) => {
                console.log('Trade successful:', tx)
              }}
            />
          ) : (
            <GoldCard variant="elevated" className="text-center py-12">
              <div className="text-4xl mb-4">💱</div>
              <p className="text-white/50">Select a pair to trade</p>
              <p className="text-xs text-white/30 mt-1">
                Click TRADE on any pair to open the swap panel
              </p>
            </GoldCard>
          )}
        </div>
      </div>
      
      {/* Pool Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="BONK/USD1 Pairs"
          value={tokenCounts['bonk-usd1']}
          size="sm"
        />
        <StatCard
          label="BONK/SOL Pairs"
          value={tokenCounts['bonk-sol']}
          size="sm"
        />
        <StatCard
          label="Pump.fun Tokens"
          value={tokenCounts['pump']}
          size="sm"
        />
        <StatCard
          label="Raydium Pools"
          value={tokenCounts['raydium']}
          size="sm"
        />
      </div>
    </div>
  )
}

