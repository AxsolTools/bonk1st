/**
 * Industrial-Grade Multi-Source Solana Token Feed
 * 
 * CONTINUOUS ACCUMULATION MODEL:
 * - Fetches from ALL sources on each poll
 * - Accumulates tokens in a growing cache
 * - Never loses tokens - only adds new ones
 * - Supports unlimited pagination through accumulated data
 * 
 * Sources:
 * - DexScreener: Active trading pairs, boosts, profiles
 * - Jupiter: Verified tokens, price data
 * - Helius: On-chain data, new tokens via DAS
 * - Birdeye: Token analytics
 * - Pump.fun: Pre-migration bonding curve tokens
 * - Pre-Pump Engine: Real-time pump detection signals
 */

import { getCachedSignal } from './prepump-engine'

// ============================================================================
// TYPES
// ============================================================================

export interface TokenData {
  address: string
  symbol: string
  name: string
  price: number
  priceChange24h: number
  priceChange1h: number
  priceChange5m: number
  volume24h: number
  volume6h: number
  volume1h: number
  volume5m: number
  liquidity: number
  marketCap: number
  fdv: number
  pairCreatedAt: number
  pairAddress: string
  logo: string
  dexId: string
  txns24h: { buys: number; sells: number }
  txns6h: { buys: number; sells: number }
  txns1h: { buys: number; sells: number }
  txns5m: { buys: number; sells: number }
  holders?: number
  source: string
  trendingScore?: number
  buySignal?: number
  sellSignal?: number
  riskScore?: number
  momentumScore?: number
  isPumpFun?: boolean
  isMigrated?: boolean
  bondingCurveProgress?: number
  hasDexScreenerProfile?: boolean
  hasDexScreenerBoost?: boolean
  boostAmount?: number
  hasEnhancedProfile?: boolean
  profileUpdatedAt?: number
  volumeToMcapRatio?: number
  buyPressure?: number
  liquidityScore?: number
  volatility24h?: number
  accumulationScore?: number
  lastUpdated: number // When this token was last updated
  
  // Pre-pump detection signals (from prepump-engine)
  prePumpScore?: number           // 0-100 composite score
  prePumpSignals?: {
    freshWalletInflux: number     // 0-100
    walletVelocity: number        // 0-100
    txClustering: number          // 0-100
    bondingVelocity: number       // 0-100
    sellAbsence: number           // 0-100
    buySizeShift: number          // 0-100
  }
  prePumpAlerts?: string[]        // Alert messages
  freshWalletRate?: number        // % of txns from fresh wallets
  coordinatedWallets?: number     // Number of coordinated wallets detected
}

export interface FeedResult {
  tokens: TokenData[]
  total: number
  hasMore: boolean
  sources: string[]
  fetchTime: number
}

// ============================================================================
// MASTER TOKEN ACCUMULATOR
// ============================================================================

// This is the MASTER cache - it accumulates ALL tokens ever seen
// and updates them with fresh data on each poll
const MASTER_TOKEN_CACHE = new Map<string, TokenData>()
let lastMasterFetch = 0
let isFetching = false

// Configuration
const HELIUS_API_KEY = process.env.HELIUS_API_KEY || ''
const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY || ''

// Rate limiting per source
const sourceState: Record<string, { lastCall: number; errorCount: number }> = {}
const MIN_INTERVAL: Record<string, number> = {
  dexscreener: 200,
  jupiter: 300,
  helius: 150,
  birdeye: 500,
  pumpfun: 300,
}

// ============================================================================
// UTILITIES
// ============================================================================

function canCallSource(source: string): boolean {
  const state = sourceState[source]
  if (!state) return true
  const minInterval = MIN_INTERVAL[source] || 200
  // If too many errors, back off
  const backoff = Math.min(state.errorCount * 1000, 30000)
  return Date.now() - state.lastCall >= minInterval + backoff
}

function recordSourceCall(source: string, success: boolean) {
  const state = sourceState[source] || { lastCall: 0, errorCount: 0 }
  sourceState[source] = {
    lastCall: Date.now(),
    errorCount: success ? 0 : state.errorCount + 1,
  }
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = 12000): Promise<Response> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    clearTimeout(id)
    return response
  } catch (error) {
    clearTimeout(id)
    throw error
  }
}

// ============================================================================
// DEXSCREENER FETCHER
// ============================================================================

async function fetchFromDexScreener(): Promise<TokenData[]> {
  if (!canCallSource('dexscreener')) return []
  
  const tokens: TokenData[] = []
  const boostedTokens = new Map<string, { amount: number }>()
  const profileTokens = new Set<string>()
  
  try {
    // Fetch from ALL DexScreener endpoints
    const endpoints = [
      { url: 'https://api.dexscreener.com/token-boosts/latest/v1', type: 'boost' },
      { url: 'https://api.dexscreener.com/token-boosts/top/v1', type: 'boost' },
      { url: 'https://api.dexscreener.com/token-profiles/latest/v1', type: 'profile' },
      { url: 'https://api.dexscreener.com/latest/dex/search?q=solana', type: 'search' },
      { url: 'https://api.dexscreener.com/latest/dex/search?q=pump', type: 'search' },
      { url: 'https://api.dexscreener.com/latest/dex/search?q=sol', type: 'search' },
    ]

    const results = await Promise.allSettled(
      endpoints.map(({ url }) => fetchWithTimeout(url).then(r => r.json()).catch(() => null))
    )

    const addressesToFetch: string[] = []
    const seenAddresses = new Set<string>()

    // Process results
    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      const { type } = endpoints[i]
      
      if (result.status !== 'fulfilled' || !result.value) continue
      const data = result.value

      if (type === 'boost' && Array.isArray(data)) {
        for (const item of data) {
          if (item.chainId === 'solana' && item.tokenAddress) {
            const existing = boostedTokens.get(item.tokenAddress)
            boostedTokens.set(item.tokenAddress, {
              amount: Math.max(existing?.amount || 0, item.amount || 1),
            })
            if (!seenAddresses.has(item.tokenAddress)) {
              seenAddresses.add(item.tokenAddress)
              addressesToFetch.push(item.tokenAddress)
            }
          }
        }
      } else if (type === 'profile' && Array.isArray(data)) {
        for (const item of data) {
          if (item.chainId === 'solana' && item.tokenAddress) {
            profileTokens.add(item.tokenAddress)
            if (!seenAddresses.has(item.tokenAddress)) {
              seenAddresses.add(item.tokenAddress)
              addressesToFetch.push(item.tokenAddress)
            }
          }
        }
      } else if (type === 'search' && data.pairs) {
        for (const pair of data.pairs) {
          if (pair.chainId === 'solana' && pair.baseToken?.address) {
            const addr = pair.baseToken.address
            if (!seenAddresses.has(addr)) {
              seenAddresses.add(addr)
              tokens.push(parseDexPair(pair, boostedTokens.get(addr), profileTokens.has(addr)))
            }
          }
        }
      }
    }

    // Batch fetch remaining addresses (in chunks of 30)
    for (let i = 0; i < addressesToFetch.length; i += 30) {
      const chunk = addressesToFetch.slice(i, i + 30)
      try {
        const res = await fetchWithTimeout(
          `https://api.dexscreener.com/tokens/v1/solana/${chunk.join(',')}`
        )
        if (res.ok) {
          const pairs = await res.json()
          for (const pair of pairs || []) {
            const addr = pair.baseToken?.address
            if (addr && !tokens.some(t => t.address === addr)) {
              tokens.push(parseDexPair(pair, boostedTokens.get(addr), profileTokens.has(addr)))
            }
          }
        }
      } catch (e) {
        continue
      }
    }

    recordSourceCall('dexscreener', true)
    return tokens
  } catch (error) {
    recordSourceCall('dexscreener', false)
    console.error('[FEED] DexScreener error:', error)
    return []
  }
}

function parseDexPair(pair: any, boostData?: { amount: number }, hasProfile?: boolean): TokenData {
  const address = pair.baseToken?.address || ''
  const isPumpFun = pair.dexId === 'pumpfun' || pair.url?.includes('pump.fun')
  
  const volume24h = pair.volume?.h24 || 0
  const marketCap = pair.marketCap || pair.fdv || 0
  const volumeToMcapRatio = marketCap > 0 ? (volume24h / marketCap) * 100 : 0
  
  const txns24h = { buys: pair.txns?.h24?.buys || 0, sells: pair.txns?.h24?.sells || 0 }
  const totalTxns = txns24h.buys + txns24h.sells
  const buyPressure = totalTxns > 0 ? (txns24h.buys / totalTxns) * 100 : 50
  
  const liquidity = pair.liquidity?.usd || 0
  let liquidityScore = 50
  if (marketCap > 0) {
    const liqRatio = liquidity / marketCap
    if (liqRatio > 0.3) liquidityScore = 90
    else if (liqRatio > 0.15) liquidityScore = 75
    else if (liqRatio > 0.05) liquidityScore = 60
    else if (liqRatio > 0.02) liquidityScore = 40
    else liquidityScore = 20
  }
  
  return {
    address,
    symbol: pair.baseToken?.symbol || 'UNKNOWN',
    name: pair.baseToken?.name || 'Unknown Token',
    price: parseFloat(pair.priceUsd) || 0,
    priceChange24h: pair.priceChange?.h24 || 0,
    priceChange1h: pair.priceChange?.h1 || 0,
    priceChange5m: pair.priceChange?.m5 || 0,
    volume24h,
    volume6h: pair.volume?.h6 || 0,
    volume1h: pair.volume?.h1 || 0,
    volume5m: pair.volume?.m5 || 0,
    liquidity,
    marketCap,
    fdv: pair.fdv || 0,
    pairCreatedAt: pair.pairCreatedAt || Date.now(),
    pairAddress: pair.pairAddress || '',
    logo: pair.info?.imageUrl || `https://dd.dexscreener.com/ds-data/tokens/solana/${address}.png`,
    dexId: pair.dexId || 'unknown',
    txns24h,
    txns6h: { buys: pair.txns?.h6?.buys || 0, sells: pair.txns?.h6?.sells || 0 },
    txns1h: { buys: pair.txns?.h1?.buys || 0, sells: pair.txns?.h1?.sells || 0 },
    txns5m: { buys: pair.txns?.m5?.buys || 0, sells: pair.txns?.m5?.sells || 0 },
    source: 'dexscreener',
    isPumpFun,
    isMigrated: isPumpFun && pair.dexId !== 'pumpfun',
    hasDexScreenerProfile: hasProfile || !!pair.info?.imageUrl,
    hasDexScreenerBoost: !!boostData,
    boostAmount: boostData?.amount || 0,
    hasEnhancedProfile: !!pair.info?.websites?.length || !!pair.info?.socials?.length,
    volumeToMcapRatio,
    buyPressure,
    liquidityScore,
    volatility24h: Math.abs(pair.priceChange?.h24 || 0),
    lastUpdated: Date.now(),
  }
}

// ============================================================================
// JUPITER FETCHER
// ============================================================================

// Jupiter API deprecated lite-api.jup.ag and now requires paid API key
// Skipping Jupiter entirely - using DexScreener, Helius, Birdeye, PumpFun instead
async function fetchFromJupiter(): Promise<TokenData[]> {
  // Jupiter API now requires API key signup - disabled
  return []
}

// ============================================================================
// HELIUS FETCHER (DAS API)
// ============================================================================

async function fetchFromHelius(): Promise<TokenData[]> {
  if (!HELIUS_API_KEY || !canCallSource('helius')) return []
  
  const tokens: TokenData[] = []
  
  try {
    const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
    
    const response = await fetchWithTimeout(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'searchAssets',
        params: {
          ownerAddress: null,
          tokenType: 'fungible',
          displayOptions: { showFungible: true },
          sortBy: { sortBy: 'created', sortDirection: 'desc' },
          limit: 100,
        },
      }),
    })
    
    if (response.ok) {
      const data = await response.json()
      const assets = data.result?.items || []
      
      for (const asset of assets) {
        if (!asset.id) continue
        tokens.push({
          address: asset.id,
          symbol: asset.content?.metadata?.symbol || 'NEW',
          name: asset.content?.metadata?.name || 'New Token',
          price: 0,
          priceChange24h: 0,
          priceChange1h: 0,
          priceChange5m: 0,
          volume24h: 0,
          volume6h: 0,
          volume1h: 0,
          volume5m: 0,
          liquidity: 0,
          marketCap: 0,
          fdv: 0,
          pairCreatedAt: Date.now(),
          pairAddress: '',
          logo: asset.content?.links?.image || asset.content?.files?.[0]?.uri || '',
          dexId: 'helius',
          txns24h: { buys: 0, sells: 0 },
          txns6h: { buys: 0, sells: 0 },
          txns1h: { buys: 0, sells: 0 },
          txns5m: { buys: 0, sells: 0 },
          source: 'helius',
          lastUpdated: Date.now(),
        })
      }
    }
    
    recordSourceCall('helius', true)
    return tokens
  } catch (error) {
    recordSourceCall('helius', false)
    console.error('[FEED] Helius error:', error)
    return []
  }
}

// ============================================================================
// BIRDEYE FETCHER
// ============================================================================

async function fetchFromBirdeye(): Promise<TokenData[]> {
  if (!BIRDEYE_API_KEY || !canCallSource('birdeye')) return []
  
  const tokens: TokenData[] = []
  
  try {
    const response = await fetchWithTimeout(
      'https://public-api.birdeye.so/defi/tokenlist?sort_by=v24hUSD&sort_type=desc&offset=0&limit=100',
      {
        headers: {
          'X-API-KEY': BIRDEYE_API_KEY,
          'x-chain': 'solana',
        },
      }
    )
    
    if (response.ok) {
      const data = await response.json()
      const tokenList = data.data?.tokens || []
      
      for (const token of tokenList) {
        tokens.push({
          address: token.address,
          symbol: token.symbol || 'UNKNOWN',
          name: token.name || 'Unknown',
          price: token.price || 0,
          priceChange24h: token.priceChange24hPercent || 0,
          priceChange1h: token.priceChange1hPercent || 0,
          priceChange5m: 0,
          volume24h: token.v24hUSD || 0,
          volume6h: 0,
          volume1h: token.v1hUSD || 0,
          volume5m: 0,
          liquidity: token.liquidity || 0,
          marketCap: token.mc || 0,
          fdv: token.fdv || 0,
          pairCreatedAt: Date.now(),
          pairAddress: '',
          logo: token.logoURI || '',
          dexId: 'birdeye',
          txns24h: { buys: 0, sells: 0 },
          txns6h: { buys: 0, sells: 0 },
          txns1h: { buys: 0, sells: 0 },
          txns5m: { buys: 0, sells: 0 },
          holders: token.holder || 0,
          source: 'birdeye',
          lastUpdated: Date.now(),
        })
      }
    }
    
    recordSourceCall('birdeye', true)
    return tokens
  } catch (error) {
    recordSourceCall('birdeye', false)
    console.error('[FEED] Birdeye error:', error)
    return []
  }
}

// ============================================================================
// PUMP.FUN FETCHER
// ============================================================================

async function fetchFromPumpFun(): Promise<TokenData[]> {
  if (!canCallSource('pumpfun')) return []
  
  const tokens: TokenData[] = []
  
  try {
    const response = await fetchWithTimeout(
      'https://frontend-api.pump.fun/coins?limit=100&sort=created_timestamp&order=desc&includeNsfw=false'
    )
    
    if (response.ok) {
      const coins = await response.json()
      
      for (const coin of coins || []) {
        const bondingProgress = coin.bonding_curve
          ? Math.min(100, (coin.virtual_sol_reserves / 85) * 100)
          : 0
        
        tokens.push({
          address: coin.mint || coin.address,
          symbol: coin.symbol || 'PUMP',
          name: coin.name || 'Pump.fun Token',
          price: coin.usd_market_cap ? coin.usd_market_cap / (coin.total_supply || 1000000000) : 0,
          priceChange24h: 0,
          priceChange1h: 0,
          priceChange5m: 0,
          volume24h: coin.volume_24h || 0,
          volume6h: 0,
          volume1h: 0,
          volume5m: 0,
          liquidity: (coin.virtual_sol_reserves || 0) * 150,
          marketCap: coin.usd_market_cap || 0,
          fdv: coin.usd_market_cap || 0,
          pairCreatedAt: coin.created_timestamp || Date.now(),
          pairAddress: coin.bonding_curve || '',
          logo: coin.image_uri || coin.uri || '',
          dexId: 'pumpfun',
          txns24h: { buys: 0, sells: 0 },
          txns6h: { buys: 0, sells: 0 },
          txns1h: { buys: 0, sells: 0 },
          txns5m: { buys: 0, sells: 0 },
          source: 'pumpfun',
          isPumpFun: true,
          isMigrated: false,
          bondingCurveProgress: bondingProgress,
          lastUpdated: Date.now(),
        })
      }
    }
    
    recordSourceCall('pumpfun', true)
    return tokens
  } catch (error) {
    recordSourceCall('pumpfun', false)
    console.error('[FEED] Pump.fun error:', error)
    return []
  }
}

// ============================================================================
// SIGNAL ALGORITHMS
// ============================================================================

function calculateBuySignal(token: TokenData): number {
  let score = 50
  
  const volumeToMcap = token.marketCap > 0 ? token.volume1h / token.marketCap : 0
  if (volumeToMcap > 0.1) score += 15
  else if (volumeToMcap > 0.05) score += 10
  else if (volumeToMcap > 0.02) score += 5
  
  const txns5m = (token.txns5m?.buys || 0) + (token.txns5m?.sells || 0)
  const buyRatio5m = txns5m > 0 ? (token.txns5m?.buys || 0) / txns5m : 0.5
  if (buyRatio5m > 0.7) score += 15
  else if (buyRatio5m > 0.6) score += 8
  else if (buyRatio5m < 0.3) score -= 15
  
  if (token.priceChange5m > 5 && token.priceChange5m < 50) score += 10
  if (token.priceChange1h > 10 && token.priceChange1h < 100) score += 8
  if (token.priceChange1h > 0 && token.priceChange24h < -20) score += 12
  
  if (token.liquidity >= 10000 && token.liquidity <= 200000) score += 10
  else if (token.liquidity >= 5000) score += 5
  else if (token.liquidity < 2000) score -= 15
  
  const ageHours = (Date.now() - token.pairCreatedAt) / 3600000
  if (ageHours < 1 && txns5m > 10) score += 15
  else if (ageHours < 6) score += 10
  
  if (token.isPumpFun && !token.isMigrated && token.bondingCurveProgress) {
    if (token.bondingCurveProgress > 80) score += 20
    else if (token.bondingCurveProgress > 60) score += 10
  }
  
  return Math.max(0, Math.min(100, Math.round(score)))
}

function calculateSellSignal(token: TokenData): number {
  let score = 20
  
  if (token.priceChange5m < -20) score += 30
  else if (token.priceChange5m < -10) score += 15
  else if (token.priceChange1h < -30) score += 25
  
  const txns5m = (token.txns5m?.buys || 0) + (token.txns5m?.sells || 0)
  const sellRatio = txns5m > 0 ? (token.txns5m?.sells || 0) / txns5m : 0.5
  if (sellRatio > 0.75) score += 25
  else if (sellRatio > 0.65) score += 15
  
  if (token.liquidity < 1000) score += 20
  else if (token.liquidity < 3000) score += 10
  
  if (token.priceChange1h > 200) score += 20
  else if (token.priceChange1h > 100) score += 10
  
  return Math.max(0, Math.min(100, Math.round(score)))
}

function calculateRiskScore(token: TokenData): number {
  let risk = 20
  
  if (token.liquidity < 1000) risk += 35
  else if (token.liquidity < 5000) risk += 25
  else if (token.liquidity < 10000) risk += 15
  
  const ageHours = (Date.now() - token.pairCreatedAt) / 3600000
  if (ageHours < 0.5) risk += 25
  else if (ageHours < 2) risk += 18
  else if (ageHours < 6) risk += 10
  
  const txns = (token.txns24h?.buys || 0) + (token.txns24h?.sells || 0)
  const sellRatio = txns > 0 ? (token.txns24h?.sells || 0) / txns : 0.5
  if (sellRatio > 0.65) risk += 15
  
  if (token.marketCap > 0 && token.liquidity > 0) {
    const mcToLiq = token.marketCap / token.liquidity
    if (mcToLiq > 50) risk += 20
    else if (mcToLiq > 20) risk += 10
  }
  
  if (token.isPumpFun && !token.isMigrated) risk += 10
  
  return Math.max(0, Math.min(100, Math.round(risk)))
}

function calculateMomentumScore(token: TokenData): number {
  let score = 50
  
  if (token.priceChange5m > 15) score += 20
  else if (token.priceChange5m > 5) score += 12
  else if (token.priceChange5m < -10) score -= 15
  
  if (token.priceChange1h > 30) score += 15
  else if (token.priceChange1h > 10) score += 8
  else if (token.priceChange1h < -20) score -= 12
  
  const avgHourlyVol = token.volume24h / 24
  if (token.volume1h > avgHourlyVol * 3) score += 20
  else if (token.volume1h > avgHourlyVol * 2) score += 12
  else if (token.volume1h < avgHourlyVol * 0.3) score -= 15
  
  const txns5m = (token.txns5m?.buys || 0) + (token.txns5m?.sells || 0)
  if (txns5m > 50) score += 15
  else if (txns5m > 20) score += 10
  
  return Math.max(0, Math.min(100, Math.round(score)))
}

function calculateTrendingScore(token: TokenData): number {
  let score = 0
  
  score += Math.min((token.volume5m || 0) / 500, 50) * 3
  score += Math.min((token.volume1h || 0) / 5000, 50) * 2
  score += Math.min((token.volume24h || 0) / 50000, 50)
  
  const txns5m = (token.txns5m?.buys || 0) + (token.txns5m?.sells || 0)
  const txns1h = (token.txns1h?.buys || 0) + (token.txns1h?.sells || 0)
  score += Math.min(txns5m * 3, 60)
  score += Math.min(txns1h / 2, 30)
  
  score += Math.min(Math.abs(token.priceChange5m || 0) * 2, 40)
  score += Math.min(Math.abs(token.priceChange1h || 0), 30)
  
  const ageHours = (Date.now() - token.pairCreatedAt) / 3600000
  if (ageHours < 0.5) score += 60
  else if (ageHours < 1) score += 40
  else if (ageHours < 3) score += 25
  else if (ageHours < 12) score += 10
  
  const buyRatio = txns5m > 0 ? (token.txns5m?.buys || 0) / txns5m : 0.5
  if (buyRatio > 0.65) score += 20
  
  return Math.round(score)
}

// ============================================================================
// MASTER FETCH & ACCUMULATE
// ============================================================================

async function fetchAndAccumulate(): Promise<void> {
  if (isFetching) return
  isFetching = true
  
  try {
    // Fetch from ALL sources in parallel
    const [dexTokens, jupTokens, heliusTokens, birdeyeTokens, pumpTokens] = await Promise.allSettled([
      fetchFromDexScreener(),
      fetchFromJupiter(),
      fetchFromHelius(),
      fetchFromBirdeye(),
      fetchFromPumpFun(),
    ])
    
    const allNewTokens: TokenData[] = []
    
    for (const result of [dexTokens, birdeyeTokens, pumpTokens, jupTokens, heliusTokens]) {
      if (result.status === 'fulfilled') {
        allNewTokens.push(...result.value)
      }
    }
    
    // Merge into master cache
    for (const token of allNewTokens) {
      const existing = MASTER_TOKEN_CACHE.get(token.address)
      
      if (existing) {
        // Update with fresh data, keeping best values
        MASTER_TOKEN_CACHE.set(token.address, {
          ...existing,
          ...token,
          // Preserve these if new data is empty
          logo: token.logo || existing.logo,
          name: token.name !== 'Unknown Token' ? token.name : existing.name,
          symbol: token.symbol !== 'UNKNOWN' ? token.symbol : existing.symbol,
          // Keep higher values for metrics
          volume24h: Math.max(token.volume24h, existing.volume24h),
          liquidity: Math.max(token.liquidity, existing.liquidity),
          marketCap: Math.max(token.marketCap, existing.marketCap),
          // Preserve flags
          hasDexScreenerBoost: token.hasDexScreenerBoost || existing.hasDexScreenerBoost,
          hasDexScreenerProfile: token.hasDexScreenerProfile || existing.hasDexScreenerProfile,
          isPumpFun: token.isPumpFun || existing.isPumpFun,
          lastUpdated: Date.now(),
        })
      } else {
        MASTER_TOKEN_CACHE.set(token.address, token)
      }
    }
    
    // Calculate scores for all tokens
    for (const [address, token] of MASTER_TOKEN_CACHE) {
      // Get pre-pump signal if available (from webhook data)
      const prePumpSignal = getCachedSignal(address)
      
      const updatedToken = {
        ...token,
        trendingScore: calculateTrendingScore(token),
        buySignal: calculateBuySignal(token),
        sellSignal: calculateSellSignal(token),
        riskScore: calculateRiskScore(token),
        momentumScore: calculateMomentumScore(token),
        // Add pre-pump detection data
        ...(prePumpSignal ? {
          prePumpScore: prePumpSignal.score,
          prePumpSignals: prePumpSignal.signals,
          prePumpAlerts: prePumpSignal.alerts,
          freshWalletRate: prePumpSignal.metrics.freshWalletRate,
          coordinatedWallets: prePumpSignal.metrics.coordinatedWallets,
        } : {}),
      }
      MASTER_TOKEN_CACHE.set(address, updatedToken)
    }
    
    lastMasterFetch = Date.now()
    console.log(`[FEED] Accumulated ${MASTER_TOKEN_CACHE.size} total tokens`)
  } finally {
    isFetching = false
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

export async function fetchMasterTokenFeed(options: {
  page?: number
  limit?: number
  sort?: 'trending' | 'new' | 'volume' | 'gainers' | 'losers' | 'buy_signal' | 'risk' | 'prepump'
} = {}): Promise<FeedResult> {
  const { page = 1, limit = 100, sort = 'trending' } = options
  const startTime = Date.now()
  
  // Fetch if cache is stale (>8 seconds) or empty
  if (MASTER_TOKEN_CACHE.size === 0 || Date.now() - lastMasterFetch > 8000) {
    await fetchAndAccumulate()
  }
  
  // Get all tokens from cache
  let allTokens = Array.from(MASTER_TOKEN_CACHE.values())
  
  // Sort
  switch (sort) {
    case 'trending':
      allTokens.sort((a, b) => (b.trendingScore || 0) - (a.trendingScore || 0))
      break
    case 'new':
      allTokens.sort((a, b) => b.pairCreatedAt - a.pairCreatedAt)
      break
    case 'volume':
      allTokens.sort((a, b) => b.volume24h - a.volume24h)
      break
    case 'gainers':
      allTokens.sort((a, b) => b.priceChange24h - a.priceChange24h)
      break
    case 'losers':
      allTokens.sort((a, b) => a.priceChange24h - b.priceChange24h)
      break
    case 'buy_signal':
      allTokens.sort((a, b) => (b.buySignal || 0) - (a.buySignal || 0))
      break
    case 'risk':
      allTokens.sort((a, b) => (a.riskScore || 0) - (b.riskScore || 0))
      break
    case 'prepump':
      // Sort by pre-pump score (highest first), then by trending for tokens without signals
      allTokens.sort((a, b) => {
        const scoreA = a.prePumpScore || 0
        const scoreB = b.prePumpScore || 0
        if (scoreA !== scoreB) return scoreB - scoreA
        return (b.trendingScore || 0) - (a.trendingScore || 0)
      })
      break
  }
  
  // Paginate
  const startIdx = (page - 1) * limit
  const pageTokens = allTokens.slice(startIdx, startIdx + limit)
  
  return {
    tokens: pageTokens,
    total: allTokens.length,
    hasMore: startIdx + limit < allTokens.length,
    sources: ['dexscreener', 'jupiter', 'helius', 'birdeye', 'pumpfun'],
    fetchTime: Date.now() - startTime,
  }
}

// Convenience exports
export async function fetchTrendingSolanaPairs(): Promise<TokenData[]> {
  const result = await fetchMasterTokenFeed({ sort: 'trending', limit: 500 })
  return result.tokens
}

export async function fetchNewSolanaTokens(): Promise<TokenData[]> {
  const result = await fetchMasterTokenFeed({ sort: 'new', limit: 300 })
  return result.tokens
}

export async function fetchAllSolanaPairs(page: number = 1): Promise<{ tokens: TokenData[]; hasMore: boolean; total: number }> {
  const result = await fetchMasterTokenFeed({ page, limit: 100, sort: 'trending' })
  return { tokens: result.tokens, hasMore: result.hasMore, total: result.total }
}

export function getMasterCacheSize(): number {
  return MASTER_TOKEN_CACHE.size
}

export function clearTokenCache() {
  MASTER_TOKEN_CACHE.clear()
  lastMasterFetch = 0
}
