"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { GoldCard, GoldCardHeader, StatCard } from "../ui/gold-card"
import { GoldButton, StartSniperButton, StopSniperButton, EmergencyStopButton } from "../ui/gold-button"
import { GoldBadge, StatusBadge, PnLBadge, PoolBadge, TokenLogo } from "../ui/gold-badge"
import { TerminalLog, TerminalStatus } from "../terminal/terminal-log"
import { SniperConfigPanel } from "./sniper-config-panel"
import { use1stSniper } from "@/hooks/use-1st-sniper"
import { formatSol, formatUsd, formatPercent, formatTimeAgo } from "@/lib/1st/sniper-config"

export function SniperDashboard() {
  const {
    config,
    status,
    activeSnipes,
    logs,
    newTokens,
    stats,
    wsConnected,
    setConfig,
    armSniper,
    disarmSniper,
    emergencyStop,
    clearLogs,
    isAuthenticated,
    activeWallet,
  } = use1stSniper()
  
  const [showConfig, setShowConfig] = React.useState(false)
  
  // Check if Helius API key is configured
  const hasHeliusKey = !!process.env.NEXT_PUBLIC_HELIUS_API_KEY
  
  // Calculate totals
  const totalUnrealizedPnl = activeSnipes.reduce((sum, s) => sum + s.pnlSol, 0)
  const totalUnrealizedPnlPercent = activeSnipes.length > 0
    ? activeSnipes.reduce((sum, s) => sum + s.pnlPercent, 0) / activeSnipes.length
    : 0
  
  return (
    <div className="w-full max-w-[1920px] mx-auto px-4 lg:px-8 py-6 space-y-6">
      {/* API Key Warning */}
      {!hasHeliusKey && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-center gap-3">
          <div className="text-red-500 text-2xl">⚠️</div>
          <div>
            <p className="text-red-400 font-semibold">Helius API Key Not Configured</p>
            <p className="text-red-400/70 text-sm">
              Set <code className="bg-black/30 px-1 rounded">NEXT_PUBLIC_HELIUS_API_KEY</code> in your environment variables to enable real-time token monitoring.
            </p>
          </div>
        </div>
      )}
      {/* Top Status Bar */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <h1 className="text-2xl font-bold text-[#D4AF37]">SNIPER CONTROL</h1>
            <p className="text-xs text-white/50">Real-time token sniping for DeGENs</p>
          </div>
          <StatusBadge 
            status={status === 'armed' ? 'active' : status === 'sniping' ? 'pending' : 'inactive'} 
            label={status.toUpperCase()}
            pulse={status === 'armed' || status === 'sniping'}
          />
        </div>
        
        <div className="flex items-center gap-2">
          {!isAuthenticated ? (
            <GoldBadge variant="warning">CONNECT WALLET TO START</GoldBadge>
          ) : (
            <>
              {status === 'idle' || status === 'paused' ? (
                <StartSniperButton onClick={armSniper} disabled={!isAuthenticated} />
              ) : (
                <StopSniperButton onClick={disarmSniper} />
              )}
              <EmergencyStopButton 
                onClick={emergencyStop} 
                disabled={activeSnipes.length === 0}
              />
              <GoldButton variant="secondary" onClick={() => setShowConfig(!showConfig)}>
                {showConfig ? 'HIDE CONFIG' : 'CONFIG'}
              </GoldButton>
            </>
          )}
        </div>
      </div>
      
      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatCard 
          label="Session P&L" 
          value={formatSol(stats.realizedPnlSol + totalUnrealizedPnl)}
          suffix=" SOL"
          change={stats.realizedPnlSol + totalUnrealizedPnl > 0 ? 100 : -100}
        />
        <StatCard 
          label="Active Snipes" 
          value={activeSnipes.length}
          suffix={`/${config.maxConcurrentSnipes}`}
        />
        <StatCard 
          label="Tokens Detected" 
          value={stats.tokensDetected}
        />
        <StatCard 
          label="Success Rate" 
          value={stats.totalSnipes > 0 
            ? Math.round((stats.successfulSnipes / stats.totalSnipes) * 100) 
            : 0}
          suffix="%"
        />
        <StatCard 
          label="SOL Spent" 
          value={formatSol(stats.totalSolSpent)}
          suffix={` / ${config.dailyBudgetSol}`}
        />
        <StatCard 
          label="Best Snipe" 
          value={stats.bestSnipePnlPercent > 0 ? `+${stats.bestSnipePnlPercent.toFixed(0)}` : '0'}
          suffix="%"
        />
      </div>
      
      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column - Terminal & Active Snipes */}
        <div className="lg:col-span-7 space-y-6">
          {/* Terminal Status */}
          <TerminalStatus
            status={status}
            tokensDetected={stats.tokensDetected}
            activeSnipes={activeSnipes.length}
          />
          
          {/* Terminal Log */}
          <GoldCard variant="terminal" noPadding>
            <TerminalLog 
              logs={logs}
              maxHeight="350px"
              autoScroll
            />
          </GoldCard>
          
          {/* Active Snipes */}
          <GoldCard variant="elevated">
            <GoldCardHeader 
              title="Active Positions" 
              subtitle={`${activeSnipes.length} active snipe${activeSnipes.length !== 1 ? 's' : ''}`}
              status={activeSnipes.length > 0 ? 'active' : 'inactive'}
            />
            
            {activeSnipes.length === 0 ? (
              <div className="text-center py-8 text-white/40">
                <p className="text-sm">No active positions</p>
                <p className="text-xs mt-1">Arm the sniper to start hunting</p>
              </div>
            ) : (
              <div className="space-y-2">
                {activeSnipes.map((snipe) => (
                  <div 
                    key={snipe.id}
                    className="flex items-center gap-3 p-3 bg-[#0A0A0A] border border-[#D4AF37]/10 rounded-lg hover:border-[#D4AF37]/30 transition-colors"
                  >
                    <TokenLogo src={snipe.tokenLogo} symbol={snipe.tokenSymbol} size="md" />
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white truncate">${snipe.tokenSymbol}</span>
                        <PoolBadge pool={snipe.pool} />
                      </div>
                      <div className="flex items-center gap-2 text-xs text-white/50">
                        <span>{formatSol(snipe.amountSol)} SOL</span>
                        <span>•</span>
                        <span>{formatTimeAgo(snipe.entryTimestamp)}</span>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <PnLBadge pnlPercent={snipe.pnlPercent} />
                      <p className="text-xs text-white/50 mt-1">
                        {snipe.pnlSol >= 0 ? '+' : ''}{formatSol(snipe.pnlSol)} SOL
                      </p>
                    </div>
                    
                    <GoldButton variant="danger" size="sm">
                      SELL
                    </GoldButton>
                  </div>
                ))}
              </div>
            )}
          </GoldCard>
        </div>
        
        {/* Right Column - Config & New Tokens */}
        <div className="lg:col-span-5 space-y-6">
          {/* Quick Stats */}
          <GoldCard variant="highlight" glow={status === 'armed'}>
            <div className="text-center">
              <p className="text-xs text-white/50 uppercase tracking-wider mb-2">
                Unrealized P&L
              </p>
              <p className={cn(
                "text-3xl font-bold font-mono",
                totalUnrealizedPnl >= 0 ? "text-[#00FF41]" : "text-[#FF3333]"
              )}>
                {totalUnrealizedPnl >= 0 ? '+' : ''}{formatSol(totalUnrealizedPnl)} SOL
              </p>
              <p className={cn(
                "text-sm font-mono mt-1",
                totalUnrealizedPnlPercent >= 0 ? "text-[#00FF41]/70" : "text-[#FF3333]/70"
              )}>
                {formatPercent(totalUnrealizedPnlPercent)}
              </p>
            </div>
          </GoldCard>
          
          {/* Configuration Panel */}
          {showConfig && (
            <SniperConfigPanel
              config={config}
              onConfigChange={setConfig}
              disabled={status === 'armed' || status === 'sniping'}
            />
          )}
          
          {/* New Tokens Feed */}
          <GoldCard variant="elevated">
            <GoldCardHeader 
              title="New Tokens" 
              subtitle="Recently detected"
              status={wsConnected ? 'active' : 'inactive'}
              action={
                <GoldBadge variant={wsConnected ? 'success' : 'danger'} size="xs" dot pulse={wsConnected}>
                  {wsConnected ? 'LIVE' : 'OFFLINE'}
                </GoldBadge>
              }
            />
            
            {newTokens.length === 0 ? (
              <div className="text-center py-6 text-white/40">
                <p className="text-sm">Waiting for new tokens...</p>
                <p className="text-xs mt-1">
                  {wsConnected ? 'WebSocket connected' : 'Connecting to Helius...'}
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto first-terminal-scroll">
                {newTokens.slice(0, 10).map((token, idx) => (
                  <div 
                    key={`${token.tokenMint}-${idx}`}
                    className={cn(
                      "flex items-center gap-3 p-2 rounded-lg border transition-colors cursor-pointer",
                      token.passesFilters
                        ? "bg-[#00FF41]/5 border-[#00FF41]/20 hover:border-[#00FF41]/40"
                        : "bg-[#0A0A0A] border-white/5 hover:border-white/20"
                    )}
                  >
                    <TokenLogo 
                      src={token.tokenLogo || undefined}
                      symbol={token.tokenSymbol || '??'}
                      size="sm"
                    />
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white truncate">
                          ${token.tokenSymbol || token.tokenMint.slice(0, 8)}
                        </span>
                        <PoolBadge pool={token.pool} />
                      </div>
                      <p className="text-[10px] text-white/40 font-mono truncate">
                        {token.tokenMint}
                      </p>
                    </div>
                    
                    <div className="text-right text-[10px]">
                      <p className="text-white/50">Block {token.creationBlock}</p>
                      <p className="text-white/30">{formatTimeAgo(token.creationTimestamp)}</p>
                    </div>
                    
                    {token.passesFilters && (
                      <GoldBadge variant="success" size="xs">✓</GoldBadge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </GoldCard>
          
          {/* Connection Status */}
          <GoldCard variant="default">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-3 h-3 rounded-full",
                  wsConnected ? "bg-[#00FF41] animate-pulse" : "bg-[#FF3333]"
                )} />
                <div>
                  <p className="text-sm font-semibold text-white">
                    {wsConnected ? 'Connected to Helius' : 'Disconnected'}
                  </p>
                  <p className="text-xs text-white/50">
                    Mainnet WebSocket
                  </p>
                </div>
              </div>
              
              <div className="text-right text-xs text-white/50">
                <p>Monitoring:</p>
                <p className="text-[#D4AF37]">
                  {config.targetPools.length} pool{config.targetPools.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
          </GoldCard>
        </div>
      </div>
    </div>
  )
}

