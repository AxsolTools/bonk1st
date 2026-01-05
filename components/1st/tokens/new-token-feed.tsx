"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { GoldCard, GoldCardHeader } from "../ui/gold-card"
import { GoldButton } from "../ui/gold-button"
import { GoldBadge, PoolBadge, BlockBadge, TokenLogo } from "../ui/gold-badge"
import { GoldInput, GoldToggle, GoldSelect } from "../ui/gold-input"
import { SwapPanel1st } from "../swap/swap-panel-1st"
import { use1stSniper } from "@/hooks/use-1st-sniper"
import { formatTimeAgo, formatUsd, type NewTokenEvent, type TargetPool } from "@/lib/1st/sniper-config"

interface TokenModalProps {
  token: NewTokenEvent | null
  isOpen: boolean
  onClose: () => void
}

// Token Detail Modal with Swap Panel
function TokenModal({ token, isOpen, onClose }: TokenModalProps) {
  if (!isOpen || !token) return null
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-[#0A0A0A] border border-[#D4AF37]/30 rounded-xl shadow-[0_0_50px_rgba(212,175,55,0.2)]">
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between p-4 bg-[#0A0A0A] border-b border-[#D4AF37]/20 z-10">
          <div className="flex items-center gap-3">
            <TokenLogo src={token.tokenLogo} symbol={token.tokenSymbol || '??'} size="lg" />
            <div>
              <h2 className="text-xl font-bold text-white">
                ${token.tokenSymbol || 'UNKNOWN'}
              </h2>
              <p className="text-xs text-white/50">{token.tokenName || 'Unknown Token'}</p>
            </div>
            <PoolBadge pool={token.pool} />
            <BlockBadge block={token.creationBlock} isBlockZero={token.creationBlock === 0} />
          </div>
          
          <button
            onClick={onClose}
            className="p-2 text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
          {/* Left - Token Info & Metrics */}
          <div className="space-y-4">
            {/* Token Address */}
            <GoldCard variant="default">
              <p className="text-xs text-white/50 uppercase tracking-wider mb-1">Token Mint</p>
              <p className="font-mono text-sm text-[#D4AF37] break-all">{token.tokenMint}</p>
              <div className="flex gap-2 mt-2">
                <a
                  href={`https://solscan.io/token/${token.tokenMint}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-white/50 hover:text-[#D4AF37] transition-colors"
                >
                  Solscan →
                </a>
                <a
                  href={`https://dexscreener.com/solana/${token.tokenMint}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-white/50 hover:text-[#D4AF37] transition-colors"
                >
                  DexScreener →
                </a>
              </div>
            </GoldCard>
            
            {/* Metrics */}
            <GoldCard variant="default">
              <p className="text-xs text-white/50 uppercase tracking-wider mb-3">Token Metrics</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] text-white/40">Initial Liquidity</p>
                  <p className="text-lg font-bold text-[#D4AF37]">
                    {formatUsd(token.initialLiquidityUsd)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-white/40">Market Cap</p>
                  <p className="text-lg font-bold text-white">
                    {formatUsd(token.initialMarketCap)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-white/40">Creation Block</p>
                  <p className="text-lg font-bold text-white font-mono">
                    {token.creationBlock.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-white/40">Age</p>
                  <p className="text-lg font-bold text-white">
                    {formatTimeAgo(token.creationTimestamp)}
                  </p>
                </div>
              </div>
            </GoldCard>
            
            {/* Creator Info */}
            <GoldCard variant="default">
              <p className="text-xs text-white/50 uppercase tracking-wider mb-2">Creator</p>
              <p className="font-mono text-sm text-white/70 break-all">
                {token.creatorWallet || 'Unknown'}
              </p>
              
              <div className="flex gap-2 mt-3">
                {token.hasWebsite && <GoldBadge variant="success" size="xs">Website</GoldBadge>}
                {token.hasTwitter && <GoldBadge variant="info" size="xs">Twitter</GoldBadge>}
                {token.hasTelegram && <GoldBadge variant="info" size="xs">Telegram</GoldBadge>}
                {!token.hasWebsite && !token.hasTwitter && !token.hasTelegram && (
                  <GoldBadge variant="warning" size="xs">No Socials</GoldBadge>
                )}
              </div>
            </GoldCard>
            
            {/* Filter Results */}
            {token.filterResults.length > 0 && (
              <GoldCard variant="default">
                <p className="text-xs text-white/50 uppercase tracking-wider mb-2">Filter Results</p>
                <div className="space-y-1">
                  {token.filterResults.map((filter, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs">
                      <span className="text-white/60">{filter.filter}</span>
                      <span className={filter.passed ? 'text-[#00FF41]' : 'text-[#FF3333]'}>
                        {filter.passed ? '✓ PASS' : '✗ FAIL'}
                      </span>
                    </div>
                  ))}
                </div>
              </GoldCard>
            )}
          </div>
          
          {/* Right - Swap Panel */}
          <div>
            <SwapPanel1st
              tokenMint={token.tokenMint}
              tokenSymbol={token.tokenSymbol}
              tokenName={token.tokenName}
              tokenLogo={token.tokenLogo}
              pool={token.pool}
              onSuccess={(tx) => {
                console.log('Swap success:', tx)
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// Main Token Feed Component
export function NewTokenFeed() {
  const { newTokens, config, wsConnected, addLog } = use1stSniper()
  
  const [selectedToken, setSelectedToken] = React.useState<NewTokenEvent | null>(null)
  const [filter, setFilter] = React.useState<'all' | TargetPool>('all')
  const [showPassedOnly, setShowPassedOnly] = React.useState(false)
  
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
          {filteredTokens.map((token, idx) => (
            <GoldCard
              key={`${token.tokenMint}-${idx}`}
              variant={token.passesFilters ? 'highlight' : 'default'}
              className="cursor-pointer hover:scale-[1.02] transition-transform"
              onClick={() => setSelectedToken(token)}
            >
              <div className="flex items-start gap-3">
                <TokenLogo 
                  src={token.tokenLogo} 
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
                    {formatUsd(token.initialLiquidityUsd)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-white/40">MC</p>
                  <p className="text-xs font-semibold text-white">
                    {formatUsd(token.initialMarketCap)}
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
                    setSelectedToken(token)
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
          ))}
        </div>
      )}
      
      {/* Token Modal */}
      <TokenModal
        token={selectedToken}
        isOpen={!!selectedToken}
        onClose={() => setSelectedToken(null)}
      />
    </div>
  )
}

