// Jupiter API - Disabled as of Jan 2026 (requires paid API key signup)
// Using DexScreener and other free sources instead

export interface JupiterToken {
  address: string
  chainId: number
  decimals: number
  name: string
  symbol: string
  logoURI?: string
  tags?: string[]
  extensions?: {
    coingeckoId?: string
    website?: string
    twitter?: string
  }
}

export interface JupiterPrice {
  id: string
  mintSymbol: string
  vsToken: string
  vsTokenSymbol: string
  price: number
}

// Cache token list (empty - Jupiter disabled)
let tokenListCache: JupiterToken[] | null = null

// Jupiter API disabled - returns empty results
export async function getJupiterTokenList(): Promise<JupiterToken[]> {
  return tokenListCache || []
}

export async function getTokenMetadata(address: string): Promise<JupiterToken | null> {
  return null
}

export async function getTokenPrice(address: string): Promise<number | null> {
  return null
}

export async function getMultipleTokenPrices(addresses: string[]): Promise<Record<string, number>> {
  return {}
}
