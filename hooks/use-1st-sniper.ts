"use client"

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/components/providers/auth-provider'
import { useLogsSubscription, useWebSocketState } from '@/hooks/use-helius-websocket'
import { createClient } from '@/lib/supabase/client'
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
  CONFIG_PREFIX: 'bonk1st_sniper_config:v2:',
  HISTORY: 'bonk1st_snipe_history',
  STATS: 'bonk1st_session_stats',
  NEW_TOKENS: 'bonk1st_new_tokens',
}

function getConfigStorageKey(sessionId: string | null | undefined, userId: string | null | undefined) {
  const id = sessionId || userId || 'anon'
  return `${STORAGE_KEYS.CONFIG_PREFIX}${id}`
}

function stripRuntimeFields(cfg: SniperConfig): Omit<SniperConfig, 'enabled'> {
  // `enabled` is runtime (armed/disarmed) and should not mark config "dirty".
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { enabled, ...rest } = cfg
  return rest
}

function stableStringify(obj: unknown) {
  return JSON.stringify(obj)
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
  const wsState = useWebSocketState()
  
  // Log WebSocket state changes
  useEffect(() => {
    if (DEBUG_MODE) {
      console.log('[BONK1ST DEBUG] WebSocket state:', wsState)
    }
  }, [wsState])
  
  // Core state
  const [config, setConfigState] = useState<SniperConfig>(DEFAULT_SNIPER_CONFIG)
  const [savedConfigHash, setSavedConfigHash] = useState<string | null>(null)
  const [isConfigSaving, setIsConfigSaving] = useState(false)
  const [lastConfigSavedAt, setLastConfigSavedAt] = useState<number | null>(null)
  const [isConfigLoaded, setIsConfigLoaded] = useState(false)
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
  const lastSnipeAtRef = useRef<number>(0)
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
  
  // Load config (per-user): localStorage first, then Supabase (if available)
  useEffect(() => {
    const load = async () => {
      const key = getConfigStorageKey(sessionId, userId)
      let loaded: SniperConfig | null = null

      // 1) Local fallback (fast)
      try {
        const stored = localStorage.getItem(key)
        if (stored) {
          const parsed = JSON.parse(stored)
          loaded = { ...DEFAULT_SNIPER_CONFIG, ...parsed, enabled: false }
        }
      } catch (error) {
        console.error('[BONK1ST] Failed to load local config:', error)
      }

      // 2) Supabase source of truth (per-session)
      try {
        if (userId) {
          const supabase = createClient()
          const { data, error } = await supabase
            .from('sniper_configs')
            .select('config, updated_at')
            .eq('session_id', userId)
            .single()

          if (!error && data?.config) {
            loaded = { ...DEFAULT_SNIPER_CONFIG, ...(data.config as any), enabled: false }
          } else if (loaded) {
            // If Supabase doesn't have it yet but we do locally, seed it once.
            await supabase.from('sniper_configs').upsert({
              session_id: userId,
              config: stripRuntimeFields(loaded),
              config_version: 1,
            })
          }
        }
      } catch (error) {
        // Silent fallback to local config
        console.debug('[BONK1ST] Supabase config load failed (using local):', error)
      }

      const finalConfig = loaded ?? { ...DEFAULT_SNIPER_CONFIG }
      setConfigState(finalConfig)
      const hash = stableStringify(stripRuntimeFields(finalConfig))
      setSavedConfigHash(hash)
      setLastConfigSavedAt(Date.now())
      setIsConfigLoaded(true)
      addLog('info', '⚙️ Loaded sniper configuration')
    }

    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, sessionId])
  
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
  
  const isConfigDirty = (() => {
    if (!savedConfigHash) return false
    const currentHash = stableStringify(stripRuntimeFields(config))
    return currentHash !== savedConfigHash
  })()

  // Update draft config (does NOT persist)
  const setConfig = useCallback((updates: Partial<SniperConfig>) => {
    setConfigState(prev => ({ ...prev, ...updates }))
  }, [])

  const saveConfig = useCallback(async () => {
    const validation = validateConfig(config)
    if (!validation.valid) {
      addLog('error', `❌ Invalid config: ${validation.errors.join(', ')}`)
      return false
    }

    setIsConfigSaving(true)
    const key = getConfigStorageKey(sessionId, userId)
    const configToPersist: SniperConfig = { ...config, enabled: false }

    try {
      // Local always
      localStorage.setItem(key, JSON.stringify(stripRuntimeFields(configToPersist)))

      // Supabase best-effort
      if (userId) {
        const supabase = createClient()
        await supabase.from('sniper_configs').upsert({
          session_id: userId,
          config: stripRuntimeFields(configToPersist),
          config_version: 1,
        })
      }

      const hash = stableStringify(stripRuntimeFields(configToPersist))
      setSavedConfigHash(hash)
      setLastConfigSavedAt(Date.now())
      addLog('success', '✅ Configuration saved')

      // If currently armed, apply saved config immediately (preserve enabled=true)
      setConfigState(prev => ({ ...configToPersist, enabled: prev.enabled }))
      return true
    } catch (error) {
      console.error('[BONK1ST] Failed to save config:', error)
      addLog('error', '❌ Failed to save configuration')
      return false
    } finally {
      setIsConfigSaving(false)
    }
  }, [config, userId, sessionId, addLog])
  
  // Save history to localStorage
  useEffect(() => {
    if (history.length > 0) {
      localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history.slice(-100))) // Keep last 100
    }
  }, [history])
  
  // Load detected tokens from Supabase on mount
  useEffect(() => {
    const loadTokensFromSupabase = async () => {
      try {
        const supabase = createClient()
        
        // Get tokens from last 24 hours, ordered by newest first
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        
        const { data, error } = await supabase
          .from('sniper_detected_tokens')
          .select('*')
          .gte('creation_timestamp', twentyFourHoursAgo)
          .order('creation_timestamp', { ascending: false })
          .limit(50)
        
        if (error) {
          console.error('[BONK1ST] Failed to load tokens from Supabase:', error)
          return
        }
        
        if (data && data.length > 0) {
          // Convert Supabase format to NewTokenEvent format
          const tokens: NewTokenEvent[] = data.map(row => ({
            tokenMint: row.token_mint,
            tokenSymbol: row.token_symbol || undefined,
            tokenName: row.token_name || undefined,
            tokenLogo: row.token_logo || undefined,
            pool: row.pool as TargetPool,
            quoteMint: row.quote_mint || '',
            creationBlock: row.creation_block || 0,
            creationTimestamp: new Date(row.creation_timestamp).getTime(),
            creationTxSignature: row.creation_tx_signature || '',
            creatorWallet: row.creator_wallet || '',
            initialLiquidityUsd: Number(row.initial_liquidity_usd) || 0,
            initialMarketCap: Number(row.initial_market_cap) || 0,
            hasWebsite: row.has_website || false,
            hasTwitter: row.has_twitter || false,
            hasTelegram: row.has_telegram || false,
            passesFilters: row.passes_filters || false,
            filterResults: row.filter_results || [],
          }))
          
          setNewTokens(tokens)
          console.log(`[BONK1ST] Loaded ${tokens.length} tokens from Supabase`)
        }
      } catch (error) {
        console.error('[BONK1ST] Error loading tokens:', error)
      }
    }
    
    loadTokensFromSupabase()
  }, [])
  
  // Save a new token to Supabase
  const saveTokenToSupabase = useCallback(async (token: NewTokenEvent) => {
    try {
      const supabase = createClient()
      
      const { error } = await supabase
        .from('sniper_detected_tokens')
        .upsert({
          token_mint: token.tokenMint,
          token_symbol: token.tokenSymbol || null,
          token_name: token.tokenName || null,
          token_logo: token.tokenLogo || null,
          pool: token.pool,
          quote_mint: token.quoteMint || null,
          creation_block: token.creationBlock,
          creation_timestamp: new Date(token.creationTimestamp).toISOString(),
          creation_tx_signature: token.creationTxSignature || null,
          creator_wallet: token.creatorWallet || null,
          initial_liquidity_usd: token.initialLiquidityUsd,
          initial_market_cap: token.initialMarketCap,
          has_website: token.hasWebsite,
          has_twitter: token.hasTwitter,
          has_telegram: token.hasTelegram,
          passes_filters: token.passesFilters,
          filter_results: token.filterResults,
          session_id: userId || null,
        }, {
          onConflict: 'token_mint,session_id',
          ignoreDuplicates: true,
        })
      
      if (error) {
        console.error('[BONK1ST] Failed to save token to Supabase:', error)
      } else {
        console.log(`[BONK1ST] Saved token ${token.tokenSymbol || token.tokenMint.slice(0,8)} to Supabase`)
      }
    } catch (error) {
      console.error('[BONK1ST] Error saving token:', error)
    }
  }, [userId])
  
  // Fetch token metadata from existing backend APIs
  // /api/token/[address]/metadata - for symbol, name, logo (indexed metadata + DexScreener)
  // /api/token/[address]/stats - for liquidity, holders, etc.
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
        fetch(`/api/token/${tokenMint}/metadata`),
        fetch(`/api/token/${tokenMint}/stats`),
      ])
      
      let symbol: string | undefined
      let name: string | undefined
      let logo: string | undefined
      let liquidity: number | undefined
      let marketCap: number | undefined
      
      // Parse metadata response (symbol, name, logo, price, marketCap)
      if (metadataRes.ok) {
        const metaData = await metadataRes.json()
        if (metaData.success && metaData.data) {
          symbol = metaData.data.symbol
          name = metaData.data.name
          // API returns logoUri, logo, or image
          logo = metaData.data.logoUri || metaData.data.logo || metaData.data.image
          // Indexed metadata may provide price and market cap for some tokens
          if (metaData.data.marketCap && metaData.data.marketCap > 0) {
            marketCap = metaData.data.marketCap
          }
        }
      }
      
      // Parse stats response (liquidity, etc.)
      if (statsRes.ok) {
        const statsData = await statsRes.json()
        if (statsData.success && statsData.data) {
          liquidity = statsData.data.liquidity || 0
          // Use bonding curve SOL value if no liquidity yet
          if (!liquidity && statsData.data.bondingCurveSol) {
            liquidity = statsData.data.bondingCurveSol * 150 // SOL price ~$150
          }
          // Only use stats marketCap if we don't already have one from metadata
          if (!marketCap) {
            marketCap = statsData.data.marketCap || (liquidity ? liquidity * 2 : 0)
          }
        }
      }
      
      // Don't use DexScreener CDN fallback - it 404s for new tokens
      // The UI will show token initials instead
      
      return { symbol, name, logo, liquidity, marketCap }
    } catch (error) {
      console.error('[BONK1ST] Failed to fetch token metadata:', error)
      // Return DexScreener CDN logo as fallback
      return {
        logo: `https://dd.dexscreener.com/ds-data/tokens/solana/${tokenMint}.png`
      }
    }
  }, [])

  const fetchLivePrice = useCallback(async (mint: string) => {
    try {
      const res = await fetch(`/api/price/token?mint=${mint}`)
      if (!res.ok) return null
      const json = await res.json()
      if (!json?.success || !json?.data) return null
      return {
        priceSol: Number(json.data.priceSol) || 0,
        priceUsd: Number(json.data.priceUsd) || 0,
      }
    } catch {
      return null
    }
  }, [])
  
  // Handle LaunchLab logs (BONK/USD1 and BONK/SOL pools)
  const handleLaunchLabLogs = useCallback(async (data: unknown) => {
    try {
      // WebSocket returns data in nested format: { value: { signature, logs, slot, err } }
      // or directly as { signature, logs, slot, err }
      const rawData = data as Record<string, unknown>
      const logData = (rawData.value || rawData) as { 
        signature?: string
        logs?: string[]
        slot?: number
        err?: unknown 
      }
      
      // Extract logs array - handle various response formats
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
      
      // Check if token already exists (avoid duplicates) - use Set for O(1) lookup
      setNewTokens(prev => {
        // Check if this exact token mint already exists
        const exists = prev.some(t => t.tokenMint === newToken.tokenMint)
        if (exists) {
          console.log(`[BONK1ST] Token ${parsed.tokenMint.slice(0,8)} already exists, skipping`)
          return prev
        }
        
        // Update stats
        setStats(s => ({ ...s, tokensDetected: s.tokensDetected + 1 }))
        
        // Save to Supabase for persistence (async, don't wait)
        saveTokenToSupabase(newToken)
        
        addLog(
          'detection', 
          `🆕 NEW ${pool.toUpperCase()}: ${metadata.symbol || parsed.tokenMint.slice(0, 8)}...`, 
          { tokenMint: parsed.tokenMint, slot: logData.slot, pool }, 
          parsed.tokenMint, 
          logData.signature
        )
        
        // Add to list (most recent first) and ensure no duplicates
        // Use Map to deduplicate by tokenMint, then convert back to array
        const tokenMap = new Map<string, NewTokenEvent>()
        // Add new token first (most recent)
        tokenMap.set(newToken.tokenMint, newToken)
        // Add existing tokens (skip if duplicate)
        prev.forEach(token => {
          if (!tokenMap.has(token.tokenMint)) {
            tokenMap.set(token.tokenMint, token)
          }
        })
        
        // Convert back to array, sorted by creation timestamp (most recent first)
        return Array.from(tokenMap.values())
          .sort((a, b) => b.creationTimestamp - a.creationTimestamp)
          .slice(0, 100) // Keep max 100 tokens
      })
      
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
  }, [addLog, fetchTokenMetadata])
  
  // Handle Pump.fun logs
  const handlePumpFunLogs = useCallback(async (data: unknown) => {
    try {
      // WebSocket returns data in nested format
      const rawData = data as Record<string, unknown>
      const logData = (rawData.value || rawData) as { 
        signature?: string
        logs?: string[]
        slot?: number
        err?: unknown 
      }
      
      // Extract logs array - handle various response formats
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
      
      // Check if token already exists (avoid duplicates) - use Map for O(1) lookup
      setNewTokens(prev => {
        // Check if this exact token mint already exists
        const exists = prev.some(t => t.tokenMint === newToken.tokenMint)
        if (exists) {
          console.log(`[BONK1ST] Token ${parsed.tokenMint.slice(0,8)} already exists, skipping`)
          return prev
        }
        
        setStats(s => ({ ...s, tokensDetected: s.tokensDetected + 1 }))
        
        // Save to Supabase for persistence (async, don't wait)
        saveTokenToSupabase(newToken)
        
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
            setStats(s => ({ ...s, tokensFiltered: s.tokensFiltered + 1 }))
          }
        }
        
        // Add to list (most recent first) and ensure no duplicates
        // Use Map to deduplicate by tokenMint, then convert back to array
        const tokenMap = new Map<string, NewTokenEvent>()
        // Add new token first (most recent)
        tokenMap.set(newToken.tokenMint, newToken)
        // Add existing tokens (skip if duplicate)
        prev.forEach(token => {
          if (!tokenMap.has(token.tokenMint)) {
            tokenMap.set(token.tokenMint, token)
          }
        })
        
        // Convert back to array, sorted by creation timestamp (most recent first)
        return Array.from(tokenMap.values())
          .sort((a, b) => b.creationTimestamp - a.creationTimestamp)
          .slice(0, 100) // Keep max 100 tokens
      })
    } catch (error) {
      console.error('[BONK1ST] Error parsing Pump.fun logs:', error)
    }
  }, [addLog, fetchTokenMetadata])
  
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
      addLog('error', '❌ REAL-TIME KEY NOT CONFIGURED! WebSocket monitoring will not work.')
      console.error('[BONK1ST] ❌ Real-time key is not set. WebSocket monitoring will not work.')
      return
    }
    
    // NEVER expose API keys in logs - just confirm it exists
    addLog('info', '🔑 Real-time API configured ✓')
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

    // Cooldown enforcement
    const cooldownMs = Math.max(0, (configRef.current.cooldownBetweenSnipes || 0) * 1000)
    if (cooldownMs > 0 && Date.now() - lastSnipeAtRef.current < cooldownMs) {
      const remaining = Math.ceil((cooldownMs - (Date.now() - lastSnipeAtRef.current)) / 1000)
      addLog('warning', `⏳ Cooldown active (${remaining}s remaining)`)
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

      // Enforce max per-snipe (approximate for USD1 buys using $150/SOL)
      const maxSingle = configRef.current.maxSingleSnipeSol || 0
      if (maxSingle > 0) {
        const approxSol = (configRef.current.useUsd1 && token.pool === 'bonk-usd1') ? (snipeAmount / 150) : snipeAmount
        if (approxSol > maxSingle) {
          addLog('warning', `⚠️ Max single snipe (${maxSingle} SOL) exceeded`)
          return
        }
      }

      const attempts = configRef.current.retryOnFail ? Math.max(1, 1 + (configRef.current.maxRetries || 0)) : 1
      let data: any = null
      let lastError: string | null = null

      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          if (attempt > 1) addLog('info', `🔁 Retry ${attempt}/${attempts}...`, { tokenMint: token.tokenMint })

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
              priorityFeeLamports: configRef.current.priorityFeeLamports,
              pool: token.pool.startsWith('bonk') ? 'bonk' : 'pump',
              quoteMint,
              autoConvertUsd1: false,
            }),
          })

          data = await response.json()

          if (!response.ok) {
            throw new Error(data?.error?.message || 'Snipe failed')
          }

          lastError = null
          break
        } catch (e) {
          lastError = e instanceof Error ? e.message : 'Unknown error'
          if (attempt < attempts) {
            await new Promise(resolve => setTimeout(resolve, 500 * attempt))
          }
        }
      }

      if (lastError) throw new Error(lastError)

      lastSnipeAtRef.current = Date.now()
      
      // Create active snipe record
      const activeSnipe: ActiveSnipe = {
        id: generateId(),
        tokenMint: token.tokenMint,
        tokenSymbol: token.tokenSymbol || 'UNKNOWN',
        tokenName: token.tokenName || 'Unknown Token',
        tokenLogo: token.tokenLogo,
        pool: token.pool,
        creatorWallet: token.creatorWallet,
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

      // Fetch entry price once to initialize thresholds for auto-sell / PnL
      const entryPrice = await fetchLivePrice(token.tokenMint)
      if (entryPrice?.priceSol) {
        const entryPriceSol = entryPrice.priceSol
        const entryPriceUsd = entryPrice.priceUsd || 0
        const takeProfitMult = 1 + (configRef.current.takeProfitPercent / 100)
        const stopLossMult = 1 - (configRef.current.stopLossPercent / 100)
        activeSnipe.entryPriceSol = entryPriceSol
        activeSnipe.entryPriceUsd = entryPriceUsd
        activeSnipe.currentPriceSol = entryPriceSol
        activeSnipe.currentPriceUsd = entryPriceUsd
        activeSnipe.peakPriceSol = entryPriceSol
        activeSnipe.takeProfitPrice = entryPriceSol * takeProfitMult
        activeSnipe.stopLossPrice = entryPriceSol * stopLossMult
        if (configRef.current.trailingStopEnabled) {
          activeSnipe.trailingStopPrice = entryPriceSol * (1 - (configRef.current.trailingStopPercent / 100))
        }
        if (configRef.current.sellAfterSeconds > 0) {
          activeSnipe.sellAfterTimestamp = activeSnipe.entryTimestamp + (configRef.current.sellAfterSeconds * 1000)
        }
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

  // Auto-sell engine (take profit / stop loss / trailing stop / time-based)
  useEffect(() => {
    if (!isAuthenticated || !activeWallet) return
    if (!configRef.current.autoSellEnabled) return
    if (activeSnipes.length === 0) return

    let cancelled = false
    const inFlight = new Set<string>()

    const sellPosition = async (snipe: ActiveSnipe, trigger: any) => {
      if (inFlight.has(snipe.id)) return
      inFlight.add(snipe.id)
      try {
        const sellPct = Math.max(1, Math.min(100, configRef.current.sellPercentOnTrigger || 100))
        const amountToSell = snipe.amountTokens * (sellPct / 100)
        if (!amountToSell || amountToSell <= 0) return

        addLog('sell', `💰 AUTO-SELL (${trigger}): ${snipe.tokenSymbol}`, { tokenMint: snipe.tokenMint }, snipe.tokenMint)

        const response = await fetch('/api/trade', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-session-id': sessionId || userId || '',
            'x-wallet-address': activeWallet.public_key,
            'x-user-id': userId || '',
          },
          body: JSON.stringify({
            action: 'sell',
            tokenMint: snipe.tokenMint,
            amount: amountToSell,
            slippageBps: configRef.current.slippageBps,
            priorityFeeLamports: configRef.current.priorityFeeLamports,
            pool: snipe.pool.startsWith('bonk') ? 'bonk' : 'pump',
          }),
        })

        const data = await response.json()
        if (!response.ok) throw new Error(data?.error?.message || 'Auto-sell failed')

        setActiveSnipes(prev => prev.map(p => {
          if (p.id !== snipe.id) return p
          const now = Date.now()
          const remaining = Math.max(0, p.amountTokens - amountToSell)
          const isFullySold = remaining <= 0.0000001
          return {
            ...p,
            amountTokens: remaining,
            status: isFullySold ? 'sold' : p.status,
            exitTimestamp: isFullySold ? now : p.exitTimestamp,
            exitTxSignature: data?.data?.txSignature || p.exitTxSignature,
            exitTrigger: isFullySold ? trigger : p.exitTrigger,
          }
        }))

      } catch (e) {
        addLog('error', `❌ Auto-sell failed: ${e instanceof Error ? e.message : 'Unknown error'}`, { tokenMint: snipe.tokenMint }, snipe.tokenMint)
      } finally {
        inFlight.delete(snipe.id)
      }
    }

    const tick = async () => {
      const snapshot = activeSnipes
      for (const snipe of snapshot) {
        if (cancelled) return
        if (snipe.status !== 'success') continue

        const live = await fetchLivePrice(snipe.tokenMint)
        if (!live || !live.priceSol) continue

        setActiveSnipes(prev => prev.map(p => {
          if (p.id !== snipe.id) return p
          const entryCostSol = (p.entryPriceSol || live.priceSol) * (p.amountTokens || 0)
          const valueSol = live.priceSol * (p.amountTokens || 0)
          const pnlSol = valueSol - entryCostSol
          const pnlPercent = entryCostSol > 0 ? (pnlSol / entryCostSol) * 100 : 0

          const nextPeak = Math.max(p.peakPriceSol || 0, live.priceSol)
          const trailingStopPrice = configRef.current.trailingStopEnabled
            ? nextPeak * (1 - (configRef.current.trailingStopPercent / 100))
            : p.trailingStopPrice

          return {
            ...p,
            currentPriceSol: live.priceSol,
            currentPriceUsd: live.priceUsd,
            currentValueSol: valueSol,
            pnlSol,
            pnlPercent,
            peakPriceSol: nextPeak,
            trailingStopPrice,
          }
        }))

        // Trigger evaluation (uses current config)
        const now = Date.now()
        const takeProfitHit = snipe.takeProfitPrice > 0 && live.priceSol >= snipe.takeProfitPrice
        const stopLossHit = snipe.stopLossPrice > 0 && live.priceSol <= snipe.stopLossPrice
        const trailingHit = !!configRef.current.trailingStopEnabled && !!snipe.trailingStopPrice && live.priceSol <= snipe.trailingStopPrice
        const timeHit = !!snipe.sellAfterTimestamp && now >= snipe.sellAfterTimestamp

        if (takeProfitHit) await sellPosition(snipe, 'take_profit')
        else if (stopLossHit) await sellPosition(snipe, 'stop_loss')
        else if (trailingHit) await sellPosition(snipe, 'trailing_stop')
        else if (timeHit) await sellPosition(snipe, 'time_based')
      }
    }

    const interval = setInterval(() => {
      tick().catch(() => {})
    }, 5000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [activeSnipes, isAuthenticated, activeWallet, fetchLivePrice, addLog, sessionId, userId])
  
  // Arm sniper (always ensures saved config is what's used)
  const armSniper = useCallback(async () => {
    if (!isAuthenticated) {
      addLog('error', '❌ Connect wallet to arm sniper')
      return
    }
    
    if (!isConfigLoaded) {
      addLog('warning', '⏳ Loading config...')
      return
    }

    // If there are unsaved changes, save them so the running sniper uses saved config.
    if (isConfigDirty) {
      const ok = await saveConfig()
      if (!ok) return
    }

    const validation = validateConfig(configRef.current)
    if (!validation.valid) {
      addLog('error', `❌ Invalid config: ${validation.errors.join(', ')}`)
      return
    }
    
    // Enable monitoring
    setConfig({ enabled: true })
    setStatus('armed')
    setStats(prev => ({ ...prev, sessionStartTime: Date.now() }))
    
    addLog('success', '🟢 SNIPER ARMED - Hunting for new tokens...')
    addLog('info', `🎯 Targets: ${configRef.current.targetPools.map(p => p.toUpperCase()).join(', ')}`)
    addLog('info', `💰 Buy: ${configRef.current.useUsd1 ? configRef.current.buyAmountUsd1 + ' USD1' : configRef.current.buyAmountSol + ' SOL'}`)
    addLog('info', `📊 Slippage: ${(configRef.current.slippageBps / 100).toFixed(1)}%`)
  }, [isAuthenticated, addLog, setConfig, isConfigDirty, saveConfig, isConfigLoaded])
  
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
    saveConfig,
    isConfigDirty,
    isConfigSaving,
    lastConfigSavedAt,
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
