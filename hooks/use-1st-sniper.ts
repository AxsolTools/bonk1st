"use client"

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/components/providers/auth-provider'
import { useLogsSubscription, useHeliusWebSocketState } from '@/hooks/use-helius-websocket'
import type { 
  SniperConfig, 
  SniperStatus, 
  ActiveSnipe, 
  SnipeHistory,
  NewTokenEvent,
  TerminalLogEntry,
  SniperSessionStats,
  TargetPool,
} from '@/lib/1st/sniper-config'
import { 
  DEFAULT_SNIPER_CONFIG, 
  SNIPER_PROGRAMS,
  validateConfig,
  formatSol,
  parselaunchLabLog,
  parsePumpFunLog,
} from '@/lib/1st/sniper-config'

// Storage keys
const STORAGE_KEYS = {
  CONFIG: 'bonk1st_sniper_config',
  HISTORY: 'bonk1st_snipe_history',
  STATS: 'bonk1st_session_stats',
}

// Generate unique ID
const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

// Create terminal log entry
const createLog = (
  type: TerminalLogEntry['type'], 
  message: string, 
  details?: Record<string, unknown>,
  tokenMint?: string,
  txSignature?: string
): TerminalLogEntry => ({
  id: generateId(),
  timestamp: Date.now(),
  type,
  message,
  details,
  tokenMint,
  txSignature,
})

// Debug mode - set to true to see all incoming WebSocket data
const DEBUG_MODE = false

/**
 * BONK1ST Sniper Hook
 * 
 * Monitors:
 * - Raydium LaunchLab (LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj) for BONK/USD1 and BONK/SOL pools
 * - Pump.fun (6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P) for Pump tokens
 * 
 * Integrates with existing backend:
 * - /api/trade for executing trades
 * - /api/token/* for token metadata
 */
export function use1stSniper() {
  // Auth context for wallet access
  const { isAuthenticated, activeWallet, sessionId, userId } = useAuth()
  
  // WebSocket state
  const wsState = useHeliusWebSocketState()
  
  // Log WebSocket state changes
  useEffect(() => {
    if (DEBUG_MODE) {
      console.log('[BONK1ST DEBUG] WebSocket state:', wsState)
    }
  }, [wsState])
  
  // Core state
  const [config, setConfigState] = useState<SniperConfig>(DEFAULT_SNIPER_CONFIG)
  const [status, setStatus] = useState<SniperStatus>('idle')
  const [activeSnipes, setActiveSnipes] = useState<ActiveSnipe[]>([])
  const [history, setHistory] = useState<SnipeHistory[]>([])
  const [logs, setLogs] = useState<TerminalLogEntry[]>([])
  const [newTokens, setNewTokens] = useState<NewTokenEvent[]>([])
  const [stats, setStats] = useState<SniperSessionStats>({
    sessionStartTime: Date.now(),
    totalSnipes: 0,
    successfulSnipes: 0,
    failedSnipes: 0,
    totalSolSpent: 0,
    totalSolReturned: 0,
    realizedPnlSol: 0,
    unrealizedPnlSol: 0,
    bestSnipePnlPercent: 0,
    worstSnipePnlPercent: 0,
    avgHoldTimeSeconds: 0,
    tokensDetected: 0,
    tokensFiltered: 0,
  })
  
  // Refs for callbacks
  const configRef = useRef(config)
  const statusRef = useRef(status)
  configRef.current = config
  statusRef.current = status
  
  // Add log entry
  const addLog = useCallback((
    type: TerminalLogEntry['type'],
    message: string,
    details?: Record<string, unknown>,
    tokenMint?: string,
    txSignature?: string
  ) => {
    const entry = createLog(type, message, details, tokenMint, txSignature)
    setLogs(prev => [...prev.slice(-500), entry]) // Keep last 500 logs
  }, [])
  
  // Load config from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.CONFIG)
      if (stored) {
        const parsed = JSON.parse(stored)
        setConfigState({ ...DEFAULT_SNIPER_CONFIG, ...parsed })
        addLog('info', '⚙️ Loaded saved configuration')
      }
    } catch (error) {
      console.error('[BONK1ST] Failed to load config:', error)
    }
  }, [addLog])
  
  // Load history from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.HISTORY)
      if (stored) {
        setHistory(JSON.parse(stored))
      }
    } catch (error) {
      console.error('[BONK1ST] Failed to load history:', error)
    }
  }, [])
  
  // Load detected tokens from Supabase on mount
  useEffect(() => {
    const loadDetectedTokens = async () => {
      const effectiveSessionId = sessionId || userId
      if (!effectiveSessionId) return
      
      try {
        const response = await fetch(`/api/1st/detected-tokens?sessionId=${effectiveSessionId}&limit=100`)
        if (response.ok) {
          const data = await response.json()
          if (data.success && data.data?.length > 0) {
            setNewTokens(data.data)
            addLog('info', `📥 Loaded ${data.data.length} previously detected tokens`)
          }
        }
      } catch (error) {
        console.error('[BONK1ST] Failed to load detected tokens:', error)
      }
    }
    
    loadDetectedTokens()
  }, [sessionId, userId, addLog])
  
  // Save detected token to Supabase (persists across refreshes)
  const saveDetectedToken = useCallback(async (token: NewTokenEvent) => {
    const effectiveSessionId = sessionId || userId
    if (!effectiveSessionId) return
    
    try {
      await fetch('/api/1st/detected-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: effectiveSessionId,
          token,
        }),
      })
    } catch (error) {
      console.error('[BONK1ST] Failed to save detected token:', error)
    }
  }, [sessionId, userId])
  
  // Save config to localStorage
  const setConfig = useCallback((updates: Partial<SniperConfig>) => {
    setConfigState(prev => {
      const newConfig = { ...prev, ...updates }
      localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(newConfig))
      return newConfig
    })
  }, [])
  
  // Save history to localStorage
  useEffect(() => {
    if (history.length > 0) {
      localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history.slice(-100))) // Keep last 100
    }
  }, [history])
  
  // Fetch token metadata from existing backend APIs
  // Uses /api/token/[address]/metadata for symbol, name, logo (DexScreener CDN)
  // Uses /api/token/[address]/stats for liquidity, marketCap
  const fetchTokenMetadata = useCallback(async (tokenMint: string): Promise<{
    symbol?: string
    name?: string
    logo?: string
    liquidity?: number
    marketCap?: number
  }> => {
    try {
      // Fetch metadata and stats in parallel from existing backend
      const [metadataRes, statsRes] = await Promise.all([
        fetch(`/api/token/${tokenMint}/metadata`).catch(() => null),
        fetch(`/api/token/${tokenMint}/stats`).catch(() => null),
      ])
      
      let symbol: string | undefined
      let name: string | undefined
      let logo: string | undefined
      let liquidity: number | undefined
      let marketCap: number | undefined
      
      // Parse metadata response (symbol, name, logo from DexScreener CDN)
      if (metadataRes?.ok) {
        const metaData = await metadataRes.json()
        if (metaData.success && metaData.data) {
          symbol = metaData.data.symbol
          name = metaData.data.name
          logo = metaData.data.logoUri || `https://dd.dexscreener.com/ds-data/tokens/solana/${tokenMint}.png`
        }
      }
      
      // Parse stats response (liquidity, volume, holders)
      if (statsRes?.ok) {
        const statsData = await statsRes.json()
        if (statsData.success && statsData.data) {
          liquidity = statsData.data.liquidity || 0
          // Estimate market cap from liquidity if not provided
          marketCap = statsData.data.liquidity ? statsData.data.liquidity * 2 : 0
        }
      }
      
      // Fallback: Try DexScreener directly if metadata API failed
      if (!symbol || !name) {
        try {
          const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`)
          if (dexRes.ok) {
            const dexData = await dexRes.json()
            const pair = dexData.pairs?.[0]
            if (pair?.baseToken) {
              symbol = symbol || pair.baseToken.symbol
              name = name || pair.baseToken.name
              logo = logo || pair.info?.imageUrl || `https://dd.dexscreener.com/ds-data/tokens/solana/${tokenMint}.png`
              liquidity = liquidity || pair.liquidity?.usd || 0
              marketCap = marketCap || pair.marketCap || pair.fdv || 0
            }
          }
        } catch (e) {
          // DexScreener fallback failed, continue with what we have
        }
      }
      
      // Final fallback for logo - always use DexScreener CDN
      if (!logo) {
        logo = `https://dd.dexscreener.com/ds-data/tokens/solana/${tokenMint}.png`
      }
      
      return { symbol, name, logo, liquidity, marketCap }
    } catch (error) {
      console.error('[BONK1ST] Failed to fetch token metadata:', error)
      // Return DexScreener CDN logo as fallback
      return { 
        logo: `https://dd.dexscreener.com/ds-data/tokens/solana/${tokenMint}.png` 
      }
    }
  }, [])
  
  // Handle LaunchLab logs (BONK/USD1 and BONK/SOL pools)
  const handleLaunchLabLogs = useCallback(async (data: unknown) => {
    try {
      // Helius WebSocket returns data in nested format: { value: { signature, logs, slot, err } }
      // or directly as { signature, logs, slot, err }
      const rawData = data as Record<string, unknown>
      const logData = (rawData.value || rawData) as { 
        signature?: string
        logs?: string[]
        slot?: number
        err?: unknown 
      }
      
      // Extract logs array - handle various Helius response formats
      const logs = logData.logs || 
                   (rawData as { result?: { value?: { logs?: string[] } } }).result?.value?.logs ||
                   []
      
      const signature = logData.signature || 
                        (rawData as { result?: { value?: { signature?: string } } }).result?.value?.signature ||
                        ''
      
      const slot = logData.slot || 
                   (rawData as { result?: { context?: { slot?: number } } }).result?.context?.slot ||
                   0
      
      // Skip if no logs
      if (!logs || logs.length === 0) {
        return
      }
      
      // DEBUG: Log incoming data (redacted)
      if (DEBUG_MODE) {
        console.log('[BONK1ST DEBUG] LaunchLab log received:', {
          signature: signature ? `${signature.slice(0, 8)}...` : 'none',
          slot,
          logsCount: logs.length,
          firstLog: logs[0]?.slice(0, 50),
        })
      }
      
      // Skip failed transactions
      if (logData.err) return
      
      // Parse the logs to detect new pool creation
      const parsed = parselaunchLabLog(logs)
      
      // DEBUG: Log parsing result
      if (DEBUG_MODE) {
        console.log('[BONK1ST DEBUG] LaunchLab parse result:', parsed)
      }
      
      if (!parsed.isNewPool || !parsed.tokenMint) {
        return
      }
      
      // Determine pool type based on quote mint
      const pool: TargetPool = parsed.quoteMint === SNIPER_PROGRAMS.USD1_MINT 
        ? 'bonk-usd1' 
        : 'bonk-sol'
      
      console.log(`[BONK1ST] 🎯 New ${pool.toUpperCase()} token detected:`, parsed.tokenMint)
      
      // Fetch token metadata
      const metadata = await fetchTokenMetadata(parsed.tokenMint)
      
      const newToken: NewTokenEvent = {
        tokenMint: parsed.tokenMint,
        tokenSymbol: metadata.symbol,
        tokenName: metadata.name,
        tokenLogo: metadata.logo,
        pool,
        quoteMint: parsed.quoteMint || SNIPER_PROGRAMS.WSOL_MINT,
        creationBlock: logData.slot,
        creationTimestamp: Date.now(),
        creationTxSignature: logData.signature,
        creatorWallet: parsed.creator || '',
        initialLiquidityUsd: metadata.liquidity || 0,
        initialMarketCap: metadata.marketCap || 0,
        hasWebsite: false,
        hasTwitter: false,
        hasTelegram: false,
        passesFilters: false,
        filterResults: [],
      }
      
      // Update stats
      setStats(prev => ({ ...prev, tokensDetected: prev.tokensDetected + 1 }))
      
      // Add to new tokens list (most recent first)
      setNewTokens(prev => [newToken, ...prev.slice(0, 99)])
      
      // Save to Supabase for persistence across refreshes
      saveDetectedToken(newToken)
      
      addLog(
        'detection', 
        `🆕 NEW ${pool.toUpperCase()}: ${metadata.symbol || parsed.tokenMint.slice(0, 8)}...`, 
        { tokenMint: parsed.tokenMint, slot: logData.slot, pool }, 
        parsed.tokenMint, 
        logData.signature
      )
      
      // Check if sniper is armed and should snipe
      if (configRef.current.enabled && statusRef.current === 'armed') {
        // Check if this pool type is targeted
        if (!configRef.current.targetPools.includes(pool)) {
          addLog('info', `Skipped: ${pool} not in target pools`, { tokenMint: parsed.tokenMint })
          return
        }
        
        // Run filters
        const filterResults = runFilters(newToken, configRef.current)
        newToken.filterResults = filterResults
        newToken.passesFilters = filterResults.every(f => f.passed)
        
        if (newToken.passesFilters) {
          addLog('snipe', `✅ FILTERS PASSED! Initiating snipe...`, { tokenMint: parsed.tokenMint }, parsed.tokenMint)
          executeSnipe(newToken)
        } else {
          setStats(prev => ({ ...prev, tokensFiltered: prev.tokensFiltered + 1 }))
          const failedFilters = filterResults.filter(f => !f.passed).map(f => f.filter)
          addLog('info', `❌ Filtered: ${failedFilters.join(', ')}`, { tokenMint: parsed.tokenMint, failedFilters }, parsed.tokenMint)
        }
      }
    } catch (error) {
      console.error('[BONK1ST] Error parsing LaunchLab logs:', error)
    }
  }, [addLog, fetchTokenMetadata, saveDetectedToken])
  
  // Handle Pump.fun logs
  const handlePumpFunLogs = useCallback(async (data: unknown) => {
    try {
      // Helius WebSocket returns data in nested format
      const rawData = data as Record<string, unknown>
      const logData = (rawData.value || rawData) as { 
        signature?: string
        logs?: string[]
        slot?: number
        err?: unknown 
      }
      
      // Extract logs array - handle various Helius response formats
      const logs = logData.logs || 
                   (rawData as { result?: { value?: { logs?: string[] } } }).result?.value?.logs ||
                   []
      
      const signature = logData.signature || 
                        (rawData as { result?: { value?: { signature?: string } } }).result?.value?.signature ||
                        ''
      
      const slot = logData.slot || 
                   (rawData as { result?: { context?: { slot?: number } } }).result?.context?.slot ||
                   0
      
      // Skip if no logs
      if (!logs || logs.length === 0) {
        return
      }
      
      // DEBUG: Log incoming data (redacted)
      if (DEBUG_MODE) {
        console.log('[BONK1ST DEBUG] Pump.fun log received:', {
          signature: signature ? `${signature.slice(0, 8)}...` : 'none',
          slot,
          logsCount: logs.length,
        })
      }
      
      // Skip failed transactions
      if (logData.err) return
      
      // Parse the logs
      const parsed = parsePumpFunLog(logs)
      
      // DEBUG: Log parsing result
      if (DEBUG_MODE) {
        console.log('[BONK1ST DEBUG] Pump.fun parse result:', parsed)
      }
      
      if (!parsed.isNewToken || !parsed.tokenMint) {
        return
      }
      
      console.log(`[BONK1ST] 🎯 New PUMP.FUN token detected:`, parsed.tokenMint)
      
      // Fetch token metadata
      const metadata = await fetchTokenMetadata(parsed.tokenMint)
      
      const newToken: NewTokenEvent = {
        tokenMint: parsed.tokenMint,
        tokenSymbol: metadata.symbol,
        tokenName: metadata.name,
        tokenLogo: metadata.logo,
        pool: 'pump',
        quoteMint: SNIPER_PROGRAMS.WSOL_MINT,
        creationBlock: logData.slot,
        creationTimestamp: Date.now(),
        creationTxSignature: logData.signature,
        creatorWallet: parsed.creator || '',
        initialLiquidityUsd: metadata.liquidity || 0,
        initialMarketCap: metadata.marketCap || 0,
        hasWebsite: false,
        hasTwitter: false,
        hasTelegram: false,
        passesFilters: false,
        filterResults: [],
      }
      
      setStats(prev => ({ ...prev, tokensDetected: prev.tokensDetected + 1 }))
      setNewTokens(prev => [newToken, ...prev.slice(0, 99)])
      
      // Save to Supabase for persistence across refreshes
      saveDetectedToken(newToken)
      
      addLog(
        'detection', 
        `🆕 NEW PUMP: ${metadata.symbol || parsed.tokenMint.slice(0, 8)}...`, 
        { tokenMint: parsed.tokenMint, slot: logData.slot }, 
        parsed.tokenMint, 
        logData.signature
      )
      
      // Check filters and snipe if enabled
      if (configRef.current.enabled && statusRef.current === 'armed' && configRef.current.targetPools.includes('pump')) {
        const filterResults = runFilters(newToken, configRef.current)
        newToken.filterResults = filterResults
        newToken.passesFilters = filterResults.every(f => f.passed)
        
        if (newToken.passesFilters) {
          addLog('snipe', `✅ FILTERS PASSED! Initiating snipe...`, { tokenMint: parsed.tokenMint }, parsed.tokenMint)
          executeSnipe(newToken)
        } else {
          setStats(prev => ({ ...prev, tokensFiltered: prev.tokensFiltered + 1 }))
        }
      }
    } catch (error) {
      console.error('[BONK1ST] Error parsing Pump.fun logs:', error)
    }
  }, [addLog, fetchTokenMetadata, saveDetectedToken])
  
  // ALWAYS subscribe to LaunchLab (BONK pools) for real-time feed display
  // Sniping only happens when status === 'armed'
  const monitorBonkPools = config.targetPools.some(p => p.startsWith('bonk'))
  useLogsSubscription(
    monitorBonkPools ? SNIPER_PROGRAMS.RAYDIUM_LAUNCHLAB : null,
    handleLaunchLabLogs
  )
  
  // ALWAYS subscribe to Pump.fun for real-time feed display
  const monitorPump = config.targetPools.includes('pump')
  useLogsSubscription(
    monitorPump ? SNIPER_PROGRAMS.PUMP_FUN : null,
    handlePumpFunLogs
  )
  
  // Log when subscriptions activate and check API key
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_HELIUS_API_KEY
    
    if (!apiKey) {
      addLog('error', '❌ HELIUS API KEY NOT CONFIGURED! Set NEXT_PUBLIC_HELIUS_API_KEY in environment variables.')
      console.error('[BONK1ST] ❌ NEXT_PUBLIC_HELIUS_API_KEY is not set. WebSocket monitoring will not work!')
      return
    }
    
    // NEVER expose API keys in logs - just confirm it exists
    addLog('info', '🔑 Helius API configured ✓')
    addLog('info', '🌐 WebSocket connection initializing...')
    
    if (monitorBonkPools) {
      addLog('info', '📡 Monitoring: Raydium LaunchLab (bonk.fun pools)')
    }
    if (monitorPump) {
      addLog('info', '📡 Monitoring: Pump.fun')
    }
  }, [monitorBonkPools, monitorPump, addLog])
  
  // Run filters on new token
  const runFilters = (token: NewTokenEvent, cfg: SniperConfig): NewTokenEvent['filterResults'] => {
    const results: NewTokenEvent['filterResults'] = []
    
    // Pool type filter
    results.push({
      filter: 'pool_type',
      passed: cfg.targetPools.includes(token.pool),
      value: token.pool,
      threshold: cfg.targetPools.join(', '),
    })
    
    // Block delay filter
    if (cfg.snipeBlockZero) {
      results.push({
        filter: 'block_zero',
        passed: true, // We're detecting at creation
        value: token.creationBlock,
        threshold: 0,
      })
    }
    
    // Liquidity filter
    if (cfg.minLiquidityUsd > 0) {
      results.push({
        filter: 'min_liquidity',
        passed: token.initialLiquidityUsd >= cfg.minLiquidityUsd,
        value: token.initialLiquidityUsd,
        threshold: cfg.minLiquidityUsd,
      })
    }
    
    // Market cap filter
    if (cfg.maxMarketCap > 0) {
      results.push({
        filter: 'max_market_cap',
        passed: token.initialMarketCap <= cfg.maxMarketCap || token.initialMarketCap === 0,
        value: token.initialMarketCap,
        threshold: cfg.maxMarketCap,
      })
    }
    
    // Blacklist filter
    const isBlacklisted = cfg.blacklistTokens.includes(token.tokenMint) || 
                          (token.creatorWallet && cfg.blacklistCreators.includes(token.creatorWallet))
    results.push({
      filter: 'blacklist',
      passed: !isBlacklisted,
      value: isBlacklisted,
      threshold: false,
    })
    
    return results
  }
  
  // Execute snipe
  const executeSnipe = async (token: NewTokenEvent) => {
    if (!isAuthenticated || !activeWallet) {
      addLog('error', '❌ Cannot snipe: No wallet connected')
      return
    }
    
    // Check concurrent snipes limit
    if (activeSnipes.length >= configRef.current.maxConcurrentSnipes) {
      addLog('warning', `⚠️ Max concurrent snipes (${configRef.current.maxConcurrentSnipes}) reached`)
      return
    }
    
    // Check daily budget
    if (stats.totalSolSpent >= configRef.current.dailyBudgetSol) {
      addLog('warning', `⚠️ Daily budget (${configRef.current.dailyBudgetSol} SOL) exhausted`)
      return
    }
    
    setStatus('sniping')
    
    const snipeAmount = configRef.current.useUsd1 && token.pool === 'bonk-usd1'
      ? configRef.current.buyAmountUsd1 
      : configRef.current.buyAmountSol
    
    const quoteMint = token.pool === 'bonk-usd1' 
      ? SNIPER_PROGRAMS.USD1_MINT 
      : SNIPER_PROGRAMS.WSOL_MINT
    
    try {
      addLog('snipe', `🎯 SNIPING: ${formatSol(snipeAmount)} ${configRef.current.useUsd1 && token.pool === 'bonk-usd1' ? 'USD1' : 'SOL'}`, { tokenMint: token.tokenMint })
      
      // Call existing trade API
      const response = await fetch('/api/trade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': sessionId || userId || '',
          'x-wallet-address': activeWallet.public_key,
          'x-user-id': userId || '',
        },
        body: JSON.stringify({
          action: 'buy',
          tokenMint: token.tokenMint,
          amount: snipeAmount,
          slippageBps: configRef.current.slippageBps,
          pool: token.pool.startsWith('bonk') ? 'bonk' : 'pump',
          quoteMint,
          autoConvertUsd1: false,
        }),
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error?.message || 'Snipe failed')
      }
      
      // Create active snipe record
      const activeSnipe: ActiveSnipe = {
        id: generateId(),
        tokenMint: token.tokenMint,
        tokenSymbol: token.tokenSymbol || 'UNKNOWN',
        tokenName: token.tokenName || 'Unknown Token',
        tokenLogo: token.tokenLogo,
        pool: token.pool,
        entryBlock: token.creationBlock,
        entryTimestamp: Date.now(),
        entryPriceSol: 0,
        entryPriceUsd: 0,
        amountSol: snipeAmount,
        amountTokens: data.data?.amountTokens || 0,
        txSignature: data.data?.txSignature || '',
        status: 'success',
        currentPriceSol: 0,
        currentPriceUsd: 0,
        currentValueSol: snipeAmount,
        currentValueUsd: 0,
        pnlSol: 0,
        pnlPercent: 0,
        peakPriceSol: 0,
        takeProfitPrice: 0,
        stopLossPrice: 0,
      }
      
      setActiveSnipes(prev => [...prev, activeSnipe])
      setStats(prev => ({
        ...prev,
        totalSnipes: prev.totalSnipes + 1,
        successfulSnipes: prev.successfulSnipes + 1,
        totalSolSpent: prev.totalSolSpent + snipeAmount,
      }))
      
      addLog(
        'success', 
        `✅ SNIPED ${activeSnipe.tokenSymbol}!`, 
        { tokenMint: token.tokenMint, amount: snipeAmount }, 
        token.tokenMint, 
        data.data?.txSignature
      )
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      addLog('error', `❌ Snipe failed: ${errorMsg}`, { tokenMint: token.tokenMint })
      setStats(prev => ({
        ...prev,
        totalSnipes: prev.totalSnipes + 1,
        failedSnipes: prev.failedSnipes + 1,
      }))
    } finally {
      setStatus('armed')
    }
  }
  
  // Arm sniper
  const armSniper = useCallback(() => {
    if (!isAuthenticated) {
      addLog('error', '❌ Connect wallet to arm sniper')
      return
    }
    
    const validation = validateConfig(config)
    if (!validation.valid) {
      addLog('error', `❌ Invalid config: ${validation.errors.join(', ')}`)
      return
    }
    
    // Enable monitoring
    setConfig({ enabled: true })
    setStatus('armed')
    setStats(prev => ({ ...prev, sessionStartTime: Date.now() }))
    
    addLog('success', '🟢 SNIPER ARMED - Hunting for new tokens...')
    addLog('info', `🎯 Targets: ${config.targetPools.map(p => p.toUpperCase()).join(', ')}`)
    addLog('info', `💰 Buy: ${config.useUsd1 ? config.buyAmountUsd1 + ' USD1' : config.buyAmountSol + ' SOL'}`)
    addLog('info', `📊 Slippage: ${(config.slippageBps / 100).toFixed(1)}%`)
  }, [isAuthenticated, config, addLog, setConfig])
  
  // Disarm sniper
  const disarmSniper = useCallback(() => {
    setConfig({ enabled: false })
    setStatus('idle')
    addLog('warning', '🔴 SNIPER DISARMED')
  }, [addLog, setConfig])
  
  // Emergency stop - sell all active positions
  const emergencyStop = useCallback(async () => {
    addLog('error', '⚡ EMERGENCY STOP - Selling all positions...')
    setStatus('paused')
    setConfig({ enabled: false })
    
    for (const snipe of activeSnipes) {
      if (snipe.status === 'success') {
        try {
          const response = await fetch('/api/trade', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-session-id': sessionId || userId || '',
              'x-wallet-address': activeWallet?.public_key || '',
              'x-user-id': userId || '',
            },
            body: JSON.stringify({
              action: 'sell',
              tokenMint: snipe.tokenMint,
              amount: snipe.amountTokens,
              slippageBps: 5000, // 50% slippage for emergency
              pool: snipe.pool.startsWith('bonk') ? 'bonk' : 'pump',
            }),
          })
          
          const data = await response.json()
          
          if (response.ok) {
            addLog('sell', `💰 Emergency sold ${snipe.tokenSymbol}`, { tokenMint: snipe.tokenMint }, snipe.tokenMint, data.data?.txSignature)
          }
        } catch (error) {
          addLog('error', `❌ Failed to sell ${snipe.tokenSymbol}`, { tokenMint: snipe.tokenMint })
        }
      }
    }
    
    setActiveSnipes([])
    setStatus('idle')
    addLog('warning', '⚡ Emergency stop complete')
  }, [activeSnipes, activeWallet, sessionId, userId, addLog, setConfig])
  
  // Manual snipe function
  const manualSnipe = useCallback(async (tokenMint: string, amount: number, pool: TargetPool) => {
    const token: NewTokenEvent = {
      tokenMint,
      pool,
      quoteMint: pool === 'bonk-usd1' ? SNIPER_PROGRAMS.USD1_MINT : SNIPER_PROGRAMS.WSOL_MINT,
      creationBlock: 0,
      creationTimestamp: Date.now(),
      creationTxSignature: '',
      creatorWallet: '',
      initialLiquidityUsd: 0,
      initialMarketCap: 0,
      hasWebsite: false,
      hasTwitter: false,
      hasTelegram: false,
      passesFilters: true,
      filterResults: [],
    }
    
    // Temporarily set buy amount
    const originalAmount = pool === 'bonk-usd1' ? config.buyAmountUsd1 : config.buyAmountSol
    if (pool === 'bonk-usd1') {
      configRef.current = { ...configRef.current, buyAmountUsd1: amount }
    } else {
      configRef.current = { ...configRef.current, buyAmountSol: amount }
    }
    
    await executeSnipe(token)
    
    // Restore original amount
    if (pool === 'bonk-usd1') {
      configRef.current = { ...configRef.current, buyAmountUsd1: originalAmount }
    } else {
      configRef.current = { ...configRef.current, buyAmountSol: originalAmount }
    }
  }, [config])
  
  // Clear logs
  const clearLogs = useCallback(() => {
    setLogs([])
    addLog('info', '🧹 Terminal cleared')
  }, [addLog])
  
  return {
    // State
    config,
    status,
    activeSnipes,
    history,
    logs,
    newTokens,
    stats,
    wsConnected: wsState.isConnected,
    
    // Actions
    setConfig,
    armSniper,
    disarmSniper,
    emergencyStop,
    manualSnipe,
    clearLogs,
    addLog,
    
    // Auth state
    isAuthenticated,
    activeWallet,
  }
}

export type Use1stSniperReturn = ReturnType<typeof use1stSniper>
