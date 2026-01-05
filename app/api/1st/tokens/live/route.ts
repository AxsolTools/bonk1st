/**
 * BONK1ST - Live BONK Token Feed
 * 
 * Directly fetches from DexScreener with bonk-specific search
 * Returns tokens that:
 * - End with "bonk" in address
 * - Are from bonk.fun / letsbonk.fun
 * - Have USD1 or SOL pairs
 */

import { NextResponse } from 'next/server'

export const revalidate = 0
export const dynamic = 'force-dynamic'

// Rate limiting
let lastFetch = 0
const MIN_INTERVAL = 3000 // 3 seconds

interface DexScreenerPair {
  chainId: string
  dexId: string
  url: string
  pairAddress: string
  baseToken: {
    address: string
    name: string
    symbol: string
  }
  quoteToken: {
    address: string
    name: string
    symbol: string
  }
  priceNative: string
  priceUsd: string
  txns: {
    m5: { buys: number; sells: number }
    h1: { buys: number; sells: number }
    h6: { buys: number; sells: number }
    h24: { buys: number; sells: number }
  }
  volume: {
    m5: number
    h1: number
    h6: number
    h24: number
  }
  priceChange: {
    m5: number
    h1: number
    h6: number
    h24: number
  }
  liquidity: {
    usd: number
    base: number
    quote: number
  }
  fdv: number
  marketCap: number
  pairCreatedAt: number
  info?: {
    imageUrl?: string
    websites?: { url: string }[]
    socials?: { type: string; url: string }[]
  }
}

interface BonkToken {
  address: string
  symbol: string
  name: string
  logo: string
  price: number
  priceChange5m: number
  priceChange1h: number
  priceChange24h: number
  volume5m: number
  volume1h: number
  volume24h: number
  liquidity: number
  marketCap: number
  fdv: number
  txns5m: { buys: number; sells: number }
  txns1h: { buys: number; sells: number }
  txns24h: { buys: number; sells: number }
  pairCreatedAt: number
  pairAddress: string
  dexId: string
  quoteToken: string
  poolType: 'bonk-usd1' | 'bonk-sol' | 'other'
  isBonkAddress: boolean
  source: string
}

const USD1_MINT = 'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB'
const WSOL_MINT = 'So11111111111111111111111111111111111111112'

async function fetchWithTimeout(url: string, timeout = 10000): Promise<Response> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(url, { signal: controller.signal })
    clearTimeout(id)
    return response
  } catch (error) {
    clearTimeout(id)
    throw error
  }
}

function parsePair(pair: DexScreenerPair): BonkToken {
  const address = pair.baseToken?.address || ''
  const quoteAddress = pair.quoteToken?.address || ''
  
  // Determine pool type
  let poolType: 'bonk-usd1' | 'bonk-sol' | 'other' = 'other'
  if (quoteAddress === USD1_MINT || pair.quoteToken?.symbol === 'USD1') {
    poolType = 'bonk-usd1'
  } else if (quoteAddress === WSOL_MINT || pair.quoteToken?.symbol === 'SOL' || pair.quoteToken?.symbol === 'WSOL') {
    poolType = 'bonk-sol'
  }
  
  return {
    address,
    symbol: pair.baseToken?.symbol || 'UNKNOWN',
    name: pair.baseToken?.name || 'Unknown Token',
    logo: pair.info?.imageUrl || `https://dd.dexscreener.com/ds-data/tokens/solana/${address}.png`,
    price: parseFloat(pair.priceUsd) || 0,
    priceChange5m: pair.priceChange?.m5 || 0,
    priceChange1h: pair.priceChange?.h1 || 0,
    priceChange24h: pair.priceChange?.h24 || 0,
    volume5m: pair.volume?.m5 || 0,
    volume1h: pair.volume?.h1 || 0,
    volume24h: pair.volume?.h24 || 0,
    liquidity: pair.liquidity?.usd || 0,
    marketCap: pair.marketCap || pair.fdv || 0,
    fdv: pair.fdv || 0,
    txns5m: pair.txns?.m5 || { buys: 0, sells: 0 },
    txns1h: pair.txns?.h1 || { buys: 0, sells: 0 },
    txns24h: pair.txns?.h24 || { buys: 0, sells: 0 },
    pairCreatedAt: pair.pairCreatedAt || Date.now(),
    pairAddress: pair.pairAddress || '',
    dexId: pair.dexId || 'unknown',
    quoteToken: pair.quoteToken?.symbol || 'SOL',
    poolType,
    isBonkAddress: address.toLowerCase().endsWith('bonk'),
    source: 'dexscreener',
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  
  const limit = parseInt(searchParams.get('limit') || '50')
  const poolFilter = searchParams.get('pool') as 'bonk-usd1' | 'bonk-sol' | 'all' | null
  const sortBy = searchParams.get('sort') || 'new'
  
  // Rate limiting
  const now = Date.now()
  if (now - lastFetch < MIN_INTERVAL) {
    return NextResponse.json({
      success: true,
      data: [],
      message: 'Rate limited, please wait',
      retryAfter: MIN_INTERVAL - (now - lastFetch),
    })
  }
  lastFetch = now
  
  try {
    const allTokens: BonkToken[] = []
    const seenAddresses = new Set<string>()
    
    // Search queries to find bonk tokens
    const searchQueries = [
      'bonk',           // Direct bonk search
      'letsbonk',       // letsbonk.fun tokens
      'USD1',           // USD1 paired tokens (often bonk.fun)
      'launchlab',      // LaunchLab tokens
    ]
    
    // Fetch from multiple search queries in parallel
    const searchPromises = searchQueries.map(query =>
      fetchWithTimeout(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`)
        .then(r => r.ok ? r.json() : null)
        .catch(() => null)
    )
    
    const results = await Promise.allSettled(searchPromises)
    
    for (const result of results) {
      if (result.status !== 'fulfilled' || !result.value?.pairs) continue
      
      for (const pair of result.value.pairs) {
        // Only Solana pairs
        if (pair.chainId !== 'solana') continue
        
        const address = pair.baseToken?.address
        if (!address || seenAddresses.has(address)) continue
        
        // Filter for bonk tokens
        const isBonkAddress = address.toLowerCase().endsWith('bonk')
        const isBonkDex = ['launchlab', 'bonk', 'letsbonk'].some(id => 
          (pair.dexId || '').toLowerCase().includes(id)
        )
        const isUsd1Pair = pair.quoteToken?.address === USD1_MINT || 
                          pair.quoteToken?.symbol === 'USD1'
        
        // Include if: address ends with bonk OR from bonk dex OR USD1 pair
        if (isBonkAddress || isBonkDex || isUsd1Pair) {
          seenAddresses.add(address)
          allTokens.push(parsePair(pair))
        }
      }
    }
    
    // Also fetch latest token profiles for any with "bonk" in name
    try {
      const profilesRes = await fetchWithTimeout('https://api.dexscreener.com/token-profiles/latest/v1')
      if (profilesRes.ok) {
        const profiles = await profilesRes.json()
        const bonkProfiles = (profiles || []).filter((p: any) => 
          p.chainId === 'solana' && 
          (p.tokenAddress?.toLowerCase().endsWith('bonk') ||
           p.description?.toLowerCase().includes('bonk'))
        )
        
        // Fetch token data for these profiles
        const profileAddresses = bonkProfiles
          .map((p: any) => p.tokenAddress)
          .filter((addr: string) => !seenAddresses.has(addr))
          .slice(0, 20)
        
        if (profileAddresses.length > 0) {
          const tokenRes = await fetchWithTimeout(
            `https://api.dexscreener.com/tokens/v1/solana/${profileAddresses.join(',')}`
          )
          if (tokenRes.ok) {
            const pairs = await tokenRes.json()
            for (const pair of pairs || []) {
              const addr = pair.baseToken?.address
              if (addr && !seenAddresses.has(addr)) {
                seenAddresses.add(addr)
                allTokens.push(parsePair(pair))
              }
            }
          }
        }
      }
    } catch (e) {
      // Profile fetch failed, continue with search results
    }
    
    // Filter by pool type
    let filteredTokens = allTokens
    if (poolFilter && poolFilter !== 'all') {
      filteredTokens = allTokens.filter(t => t.poolType === poolFilter)
    }
    
    // Sort
    switch (sortBy) {
      case 'new':
        filteredTokens.sort((a, b) => b.pairCreatedAt - a.pairCreatedAt)
        break
      case 'volume':
        filteredTokens.sort((a, b) => b.volume24h - a.volume24h)
        break
      case 'trending':
        filteredTokens.sort((a, b) => {
          const scoreA = (a.volume1h / Math.max(a.marketCap, 1)) * 100 + 
                        (a.txns1h.buys + a.txns1h.sells)
          const scoreB = (b.volume1h / Math.max(b.marketCap, 1)) * 100 + 
                        (b.txns1h.buys + b.txns1h.sells)
          return scoreB - scoreA
        })
        break
      case 'gainers':
        filteredTokens.sort((a, b) => b.priceChange24h - a.priceChange24h)
        break
    }
    
    // Limit results
    const limitedTokens = filteredTokens.slice(0, limit)
    
    return NextResponse.json({
      success: true,
      data: limitedTokens,
      count: limitedTokens.length,
      total: filteredTokens.length,
      stats: {
        bonkAddressCount: allTokens.filter(t => t.isBonkAddress).length,
        usd1PairCount: allTokens.filter(t => t.poolType === 'bonk-usd1').length,
        solPairCount: allTokens.filter(t => t.poolType === 'bonk-sol').length,
      },
      filters: {
        pool: poolFilter || 'all',
        sort: sortBy,
      },
    })
  } catch (error) {
    console.error('[BONK1ST] Live feed error:', error)
    
    return NextResponse.json(
      { success: false, error: 'Failed to fetch live bonk tokens', data: [] },
      { status: 500 }
    )
  }
}

