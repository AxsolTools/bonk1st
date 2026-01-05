/**
 * AQUA Launchpad - Token Price API
 * Fetches token prices from multiple sources with proper fallback cascade
 * Based on the working implementation in raydiumspltoken/price_pipeline.js
 */

import { NextRequest, NextResponse } from "next/server"
import { Connection, PublicKey } from "@solana/web3.js"

// ============================================================================
// CONSTANTS
// ============================================================================

const SOL_MINT = "So11111111111111111111111111111111111111112"
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
const USDC_DECIMALS = 6

const HELIUS_RPC = process.env.HELIUS_RPC_URL || "https://api.mainnet-beta.solana.com"
const connection = new Connection(HELIUS_RPC, "confirmed")

// ============================================================================
// PRICE SOURCES (in order of priority)
// ============================================================================

interface PriceResult {
  price: number
  source: string
}

/**
 * Fetch from Jupiter Metis Swap Quote API (most accurate for any token)
 * Uses the new Metis Swap API with API key support
 */
async function fetchFromJupiterQuote(tokenMint: string, decimals: number = 6): Promise<PriceResult> {
  const amount = BigInt(Math.pow(10, decimals))
  const jupiterApiKey = process.env.JUPITER_API_KEY || ''
  
  const params = new URLSearchParams({
    inputMint: tokenMint,
    outputMint: USDC_MINT,
    amount: amount.toString(),
    slippageBps: "50",
    restrictIntermediateTokens: "true"
  })

  // Try Metis API first (with API key), then fallback to legacy
  const endpoints = [
    { url: `https://api.jup.ag/swap/v1/quote?${params}`, useApiKey: true },
    { url: `https://quote-api.jup.ag/v6/quote?${params}`, useApiKey: false },
  ]

  let lastError: Error | null = null

  for (const endpoint of endpoints) {
    try {
      const headers: Record<string, string> = { "Accept": "application/json" }
      if (endpoint.useApiKey && jupiterApiKey) {
        headers["x-api-key"] = jupiterApiKey
      }

      const response = await fetch(endpoint.url, {
        headers,
        signal: AbortSignal.timeout(5000)
      })

      if (!response.ok) {
        throw new Error(`Jupiter quote failed: ${response.status}`)
      }

      const data = await response.json()
      const outAmount = data.outAmount || data.data?.outAmount
      const inAmount = data.inAmount || data.data?.inAmount || amount.toString()

      if (!outAmount || !inAmount) throw new Error("Quote response missing amounts")

      const inAmountNum = BigInt(inAmount)
      const outAmountNum = BigInt(outAmount)
      
      if (inAmountNum === BigInt(0) || outAmountNum === BigInt(0)) throw new Error("Zero amount in Jupiter quote")

      const tokenUnits = Number(inAmountNum) / Math.pow(10, decimals)
      const usdcUnits = Number(outAmountNum) / Math.pow(10, USDC_DECIMALS)

      if (!Number.isFinite(tokenUnits) || tokenUnits <= 0 || !Number.isFinite(usdcUnits) || usdcUnits <= 0) {
        throw new Error("Invalid amounts from Jupiter quote")
      }

      return {
        price: usdcUnits / tokenUnits,
        source: endpoint.useApiKey ? "jupiter_metis_quote" : "jupiter_quote"
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      continue
    }
  }

  throw lastError || new Error("All Jupiter quote endpoints failed")
}

/**
 * Jupiter Price API v2 - uses API key for authenticated requests
 */
async function fetchFromJupiterPriceV2(tokenMint: string): Promise<PriceResult> {
  const jupiterApiKey = process.env.JUPITER_API_KEY
  
  if (!jupiterApiKey) {
    throw new Error("Jupiter API key not configured")
  }

  const response = await fetch(`https://api.jup.ag/price/v2?ids=${tokenMint}`, {
    headers: { 
      "Accept": "application/json",
      "x-api-key": jupiterApiKey
    },
    signal: AbortSignal.timeout(4000)
  })

  if (!response.ok) throw new Error(`Jupiter Price v2 failed: ${response.status}`)

  const data = await response.json()
  const tokenData = data.data?.[tokenMint]
  const price = tokenData?.price

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("Jupiter Price v2 returned invalid price")
  }

  return { price, source: "jupiter_price_v2" }
}

/**
 * Fetch from Jupiter Price API v4 (legacy, fallback)
 */
async function fetchFromJupiterLegacy(tokenMint: string): Promise<PriceResult> {
  const response = await fetch(`https://price.jup.ag/v4/price?ids=${tokenMint}`, {
    headers: { "Accept": "application/json" },
    signal: AbortSignal.timeout(3000)
  })

  if (!response.ok) throw new Error(`Jupiter v4 failed: ${response.status}`)

  const data = await response.json()
  const price = data.data?.[tokenMint]?.price

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("Jupiter legacy price invalid")
  }

  return { price, source: "jupiter_price_v4" }
}

/**
 * Fetch from DexScreener
 */
interface DexScreenerData {
  price: number
  volume24h: number
  txCount24h: number
}

async function fetchFromDexScreener(tokenMint: string): Promise<PriceResult> {
  const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`, {
    headers: { "Accept": "application/json" },
    signal: AbortSignal.timeout(4000)
  })

  if (!response.ok) throw new Error(`DexScreener failed: ${response.status}`)

  const data = await response.json()
  const pair = data.pairs?.find((p: { priceUsd?: string }) => 
    p.priceUsd && parseFloat(p.priceUsd) > 0
  )

  if (!pair) throw new Error("DexScreener returned no price")

  return {
    price: parseFloat(pair.priceUsd),
    source: "dexscreener"
  }
}

/**
 * Fetch extended data from DexScreener (volume, txCount)
 */
async function fetchDexScreenerExtendedData(tokenMint: string): Promise<DexScreenerData | null> {
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(4000)
    })

    if (!response.ok) return null

    const data = await response.json()
    if (!data.pairs || data.pairs.length === 0) return null

    // Aggregate data from all pairs
    let totalVolume24h = 0
    let totalTxCount24h = 0
    let bestPrice = 0

    for (const pair of data.pairs) {
      if (pair.volume?.h24) totalVolume24h += pair.volume.h24
      if (pair.txns?.h24?.buys) totalTxCount24h += pair.txns.h24.buys
      if (pair.txns?.h24?.sells) totalTxCount24h += pair.txns.h24.sells
      if (pair.priceUsd && parseFloat(pair.priceUsd) > bestPrice) {
        bestPrice = parseFloat(pair.priceUsd)
      }
    }

    return {
      price: bestPrice,
      volume24h: totalVolume24h,
      txCount24h: totalTxCount24h
    }
  } catch {
    return null
  }
}

/**
 * Fetch SOL price from Binance
 * Note: Binance may return 451 for geo-blocked regions (US, etc.)
 */
async function fetchSolFromBinance(): Promise<PriceResult> {
  const response = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT", {
    headers: { 
      "Accept": "application/json",
      "User-Agent": "AQUA-Launchpad/1.0"
    },
    signal: AbortSignal.timeout(3000)
  })

  // Binance 451 = geo-blocked, skip to next source
  if (response.status === 451) {
    throw new Error("Binance geo-blocked")
  }

  if (!response.ok) throw new Error(`Binance failed: ${response.status}`)

  const data = await response.json()
  const price = parseFloat(data.price)

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("Binance returned invalid SOL price")
  }

  return { price, source: "binance" }
}

/**
 * Fetch SOL price from CoinGecko
 * Note: CoinGecko free API has rate limits (~30 calls/minute)
 */
async function fetchSolFromCoinGecko(): Promise<PriceResult> {
  const response = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd", {
    headers: { 
      "Accept": "application/json",
      "User-Agent": "AQUA-Launchpad/1.0"
    },
    signal: AbortSignal.timeout(5000)
  })

  // CoinGecko 429 = rate limited, skip to next source
  if (response.status === 429) {
    throw new Error("CoinGecko rate limited")
  }

  if (!response.ok) throw new Error(`CoinGecko failed: ${response.status}`)

  const data = await response.json()
  const price = data.solana?.usd

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("CoinGecko returned invalid SOL price")
  }

  return { price, source: "coingecko" }
}

/**
 * Get token decimals from RPC
 */
async function getTokenDecimals(tokenMint: string): Promise<number> {
  try {
    const mintPubkey = new PublicKey(tokenMint)
    const mintInfo = await connection.getParsedAccountInfo(mintPubkey)
    
    if (mintInfo.value?.data && 'parsed' in mintInfo.value.data) {
      return mintInfo.value.data.parsed.info.decimals
    }
  } catch (error) {
    console.warn(`[TOKEN-PRICE] Could not get decimals for ${tokenMint}:`, error)
  }
  return 6 // Default for pump.fun tokens
}

/**
 * Get circulating supply from RPC (NOT database)
 */
async function getCirculatingSupply(tokenMint: string): Promise<number> {
  try {
    const mintPubkey = new PublicKey(tokenMint)
    const supply = await connection.getTokenSupply(mintPubkey)
    return supply.value.uiAmount || 0
  } catch (error) {
    console.warn(`[TOKEN-PRICE] Could not get supply for ${tokenMint}:`, error)
    return 0
  }
}

/**
 * Resolve token price using cascade of sources
 * Order: DexScreener (reliable) -> Jupiter Quote -> Jupiter Price v2 -> Jupiter legacy
 * Jupiter Price v2 uses API key for authenticated requests
 */
async function resolveTokenPrice(tokenMint: string, decimals: number): Promise<PriceResult> {
  const errors: { source: string; message: string }[] = []
  
  // Ordered sources for token prices - DexScreener first (most reliable, no auth)
  // Jupiter Quote uses Metis API with API key, then v2 price API, then legacy v4
  const sources = [
    { name: "dexscreener", fetch: () => fetchFromDexScreener(tokenMint) },
    { name: "jupiter_quote", fetch: () => fetchFromJupiterQuote(tokenMint, decimals) },
    { name: "jupiter_price_v2", fetch: () => fetchFromJupiterPriceV2(tokenMint) },
    { name: "jupiter_price_v4", fetch: () => fetchFromJupiterLegacy(tokenMint) }
  ]

  for (const source of sources) {
    try {
      const result = await source.fetch()
      console.log(`[TOKEN-PRICE] ${tokenMint.slice(0, 8)}: $${result.price.toExponential(2)} from ${result.source}`)
      return result
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      errors.push({ source: source.name, message: msg })
    }
  }

  console.error(`[TOKEN-PRICE] All sources failed for ${tokenMint}:`, errors)
  throw new Error("All price sources failed")
}

/**
 * Fetch SOL price from DexScreener (most reliable - no auth/geo issues)
 */
async function fetchSolFromDexScreener(): Promise<PriceResult> {
  // Use wrapped SOL on DexScreener
  const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${SOL_MINT}`, {
    headers: { 
      "Accept": "application/json",
      "User-Agent": "AQUA-Launchpad/1.0"
    },
    signal: AbortSignal.timeout(4000)
  })

  if (!response.ok) throw new Error(`DexScreener SOL failed: ${response.status}`)

  const data = await response.json()
  // Find SOL/USDC or SOL/USDT pair
  const pair = data.pairs?.find((p: { priceUsd?: string; baseToken?: { symbol?: string } }) => 
    p.priceUsd && parseFloat(p.priceUsd) > 0 && 
    (p.baseToken?.symbol === 'SOL' || p.baseToken?.symbol === 'WSOL')
  )

  if (!pair) throw new Error("DexScreener returned no SOL price")

  const price = parseFloat(pair.priceUsd)
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("DexScreener returned invalid SOL price")
  }

  return { price, source: "dexscreener" }
}

/**
 * Resolve SOL price using dedicated sources
 * Order: DexScreener (reliable) -> CoinGecko -> Binance -> Jupiter Quote
 */
async function resolveSolPrice(): Promise<PriceResult> {
  const errors: { source: string; message: string }[] = []
  
  // SOL-specific sources - ordered by reliability
  // DexScreener first (no auth/geo issues), then CoinGecko (rate limited but stable)
  // Binance last (geo-blocked in many regions)
  const sources = [
    { name: "dexscreener", fetch: fetchSolFromDexScreener },
    { name: "coingecko", fetch: fetchSolFromCoinGecko },
    { name: "binance", fetch: fetchSolFromBinance },
    { name: "jupiter_quote", fetch: () => fetchFromJupiterQuote(SOL_MINT, 9) }
  ]

  for (const source of sources) {
    try {
      const result = await source.fetch()
      console.log(`[SOL-PRICE] $${result.price.toFixed(2)} from ${result.source}`)
      return result
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      errors.push({ source: source.name, message: msg })
    }
  }

  console.error("[SOL-PRICE] All sources failed:", errors)
  throw new Error("All SOL price sources failed")
}

// ============================================================================
// API ROUTES
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const mintAddress = searchParams.get("mint")

    if (!mintAddress) {
      return NextResponse.json({ error: "mint address is required" }, { status: 400 })
    }

    // Get decimals from RPC
    const decimals = await getTokenDecimals(mintAddress)
    
    // Get prices in parallel
    const [tokenPriceResult, solPriceResult, circulatingSupply] = await Promise.all([
      resolveTokenPrice(mintAddress, decimals).catch(() => ({ price: 0, source: "none" })),
      resolveSolPrice().catch(() => ({ price: 0, source: "none" })),
      getCirculatingSupply(mintAddress)
    ])

    const priceUsd = tokenPriceResult.price
    const solPriceUsd = solPriceResult.price
    const priceSol = solPriceUsd > 0 ? priceUsd / solPriceUsd : 0
    
    // Calculate market cap from LIVE supply
    const marketCap = priceUsd * circulatingSupply

    return NextResponse.json({
      success: true,
      data: {
        mint: mintAddress,
        priceUsd,
        priceSol,
        source: tokenPriceResult.source,
        marketCap,
        circulatingSupply,
        decimals
      },
      solPriceUsd
    })
  } catch (error) {
    console.error("[TOKEN-PRICE] Error:", error)
    return NextResponse.json({ error: "Failed to fetch token price" }, { status: 500 })
  }
}

// POST for batch price fetching
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { mints } = body

    if (!mints || !Array.isArray(mints) || mints.length === 0) {
      return NextResponse.json({ error: "mints array is required" }, { status: 400 })
    }

    if (mints.length > 50) {
      return NextResponse.json({ error: "Maximum 50 mints per request" }, { status: 400 })
    }

    // Get SOL price first
    const solPriceResult = await resolveSolPrice().catch(() => ({ price: 150, source: "fallback" }))
    const solPriceUsd = solPriceResult.price

    // Fetch prices in parallel (limit concurrency)
    const prices: Record<string, { 
      priceUsd: number
      priceSol: number
      source: string
      marketCap: number
      volume24h?: number
      txCount24h?: number
    }> = {}

    const batchSize = 10
    for (let i = 0; i < mints.length; i += batchSize) {
      const batch = mints.slice(i, i + batchSize)
      
      await Promise.all(
        batch.map(async (mint: string) => {
          try {
            const decimals = await getTokenDecimals(mint)
            const [priceResult, supply, dexData] = await Promise.all([
              resolveTokenPrice(mint, decimals).catch(() => ({ price: 0, source: "none" })),
              getCirculatingSupply(mint),
              fetchDexScreenerExtendedData(mint)
            ])
            
            prices[mint] = {
              priceUsd: priceResult.price,
              priceSol: solPriceUsd > 0 ? priceResult.price / solPriceUsd : 0,
              source: priceResult.source,
              marketCap: priceResult.price * supply,
              volume24h: dexData?.volume24h || 0,
              txCount24h: dexData?.txCount24h || 0
            }
          } catch {
            prices[mint] = { priceUsd: 0, priceSol: 0, source: "error", marketCap: 0, volume24h: 0, txCount24h: 0 }
          }
        })
      )
    }

    return NextResponse.json({
      success: true,
      data: prices,
      solPriceUsd
    })
  } catch (error) {
    console.error("[TOKEN-PRICE] POST Error:", error)
    return NextResponse.json({ error: "Failed to fetch token prices" }, { status: 500 })
  }
}
