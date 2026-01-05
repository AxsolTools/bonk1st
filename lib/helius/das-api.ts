/**
 * Helius DAS (Digital Asset Standard) API
 * Provides comprehensive token metadata and asset information
 * 
 * CREDIT COSTS: ~10 credits per call
 * RATE LIMIT: 10 req/s on Developer plan
 * 
 * Benefits over other sources:
 * - Rich metadata (name, symbol, image, description)
 * - Token supply information
 * - Creator/authority info
 * - Verified status
 * - All in one API call
 */

const HELIUS_API_KEY = process.env.HELIUS_API_KEY || process.env.NEXT_PUBLIC_HELIUS_API_KEY

interface TokenMetadata {
  address: string
  name: string
  symbol: string
  decimals: number
  logoUri: string
  description: string
  supply: number
  isNft: boolean
  isFungible: boolean
  creators: Array<{
    address: string
    share: number
    verified: boolean
  }>
  authority: string | null
  updateAuthority: string | null
  mintAuthority: string | null
  freezeAuthority: string | null
}

interface TokenAccount {
  address: string
  mint: string
  owner: string
  amount: number
  decimals: number
}

interface DASAsset {
  id: string
  interface: string
  content?: {
    metadata?: {
      name?: string
      symbol?: string
      description?: string
    }
    links?: {
      image?: string
      external_url?: string
    }
    files?: Array<{
      uri?: string
      mime?: string
    }>
    json_uri?: string
  }
  authorities?: Array<{
    address: string
    scopes: string[]
  }>
  compression?: {
    compressed: boolean
  }
  grouping?: Array<{
    group_key: string
    group_value: string
  }>
  royalty?: {
    royalty_model: string
    target: string | null
    percent: number
    basis_points: number
    primary_sale_happened: boolean
    locked: boolean
  }
  creators?: Array<{
    address: string
    share: number
    verified: boolean
  }>
  ownership?: {
    frozen: boolean
    delegated: boolean
    delegate: string | null
    ownership_model: string
    owner: string
  }
  supply?: {
    print_max_supply: number
    print_current_supply: number
    edition_nonce: number | null
  }
  mutable: boolean
  burnt: boolean
  token_info?: {
    symbol?: string
    balance?: number
    supply?: number
    decimals?: number
    token_program?: string
    price_info?: {
      price_per_token?: number
      currency?: string
    }
  }
}

interface DASTokenAccountResult {
  total: number
  limit: number
  page: number
  items: Array<{
    id: string
    token_info?: {
      balance?: number
      decimals?: number
      symbol?: string
    }
  }>
}

// Cache for DAS responses
const dasCache = new Map<string, { data: unknown; timestamp: number }>()
const CACHE_TTL = 30000 // 30 seconds

function getCached<T>(key: string): T | null {
  const cached = dasCache.get(key)
  if (!cached) return null
  if (Date.now() - cached.timestamp > CACHE_TTL) {
    dasCache.delete(key)
    return null
  }
  return cached.data as T
}

function setCache(key: string, data: unknown): void {
  dasCache.set(key, { data, timestamp: Date.now() })
}

/**
 * Get comprehensive asset/token information using DAS getAsset
 * 
 * @param address - Token mint address
 * @returns TokenMetadata with all available info
 */
export async function getAsset(address: string): Promise<TokenMetadata | null> {
  const cacheKey = `asset-${address}`
  const cached = getCached<TokenMetadata>(cacheKey)
  if (cached) return cached

  const apiKey = HELIUS_API_KEY
  if (!apiKey) {
    console.warn('[DAS] No Helius API key configured')
    return null
  }

  try {
    const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'getAsset',
        method: 'getAsset',
        params: {
          id: address,
          displayOptions: {
            showFungible: true,
          },
        },
      }),
    })

    if (!response.ok) {
      console.warn('[DAS] API error:', response.status)
      return null
    }

    const data = await response.json()
    const asset: DASAsset = data.result

    if (!asset) {
      return null
    }

    const metadata: TokenMetadata = {
      address: asset.id,
      name: asset.content?.metadata?.name || asset.token_info?.symbol || 'Unknown',
      symbol: asset.content?.metadata?.symbol || asset.token_info?.symbol || 'UNKNOWN',
      decimals: asset.token_info?.decimals || 0,
      logoUri: asset.content?.links?.image || asset.content?.files?.[0]?.uri || '',
      description: asset.content?.metadata?.description || '',
      supply: asset.token_info?.supply || 0,
      isNft: asset.interface === 'V1_NFT' || asset.interface === 'ProgrammableNFT',
      isFungible: asset.interface === 'FungibleToken' || asset.interface === 'FungibleAsset',
      creators: asset.creators || [],
      authority: asset.authorities?.[0]?.address || null,
      updateAuthority: asset.authorities?.find(a => a.scopes.includes('metadata'))?.address || null,
      mintAuthority: asset.authorities?.find(a => a.scopes.includes('mint'))?.address || null,
      freezeAuthority: asset.authorities?.find(a => a.scopes.includes('freeze'))?.address || null,
    }

    setCache(cacheKey, metadata)
    return metadata
  } catch (error) {
    console.error('[DAS] getAsset error:', error)
    return null
  }
}

/**
 * Get multiple assets in a single call (more efficient than multiple getAsset calls)
 * 
 * @param addresses - Array of token mint addresses
 * @returns Array of TokenMetadata
 */
export async function getAssetBatch(addresses: string[]): Promise<TokenMetadata[]> {
  if (addresses.length === 0) return []

  // Check cache first
  const results: TokenMetadata[] = []
  const uncached: string[] = []

  for (const addr of addresses) {
    const cached = getCached<TokenMetadata>(`asset-${addr}`)
    if (cached) {
      results.push(cached)
    } else {
      uncached.push(addr)
    }
  }

  if (uncached.length === 0) return results

  const apiKey = HELIUS_API_KEY
  if (!apiKey) {
    return results
  }

  try {
    const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'getAssetBatch',
        method: 'getAssetBatch',
        params: {
          ids: uncached,
          displayOptions: {
            showFungible: true,
          },
        },
      }),
    })

    if (!response.ok) {
      return results
    }

    const data = await response.json()
    const assets: DASAsset[] = data.result || []

    for (const asset of assets) {
      if (!asset) continue

      const metadata: TokenMetadata = {
        address: asset.id,
        name: asset.content?.metadata?.name || asset.token_info?.symbol || 'Unknown',
        symbol: asset.content?.metadata?.symbol || asset.token_info?.symbol || 'UNKNOWN',
        decimals: asset.token_info?.decimals || 0,
        logoUri: asset.content?.links?.image || asset.content?.files?.[0]?.uri || '',
        description: asset.content?.metadata?.description || '',
        supply: asset.token_info?.supply || 0,
        isNft: asset.interface === 'V1_NFT' || asset.interface === 'ProgrammableNFT',
        isFungible: asset.interface === 'FungibleToken' || asset.interface === 'FungibleAsset',
        creators: asset.creators || [],
        authority: asset.authorities?.[0]?.address || null,
        updateAuthority: asset.authorities?.find(a => a.scopes.includes('metadata'))?.address || null,
        mintAuthority: asset.authorities?.find(a => a.scopes.includes('mint'))?.address || null,
        freezeAuthority: asset.authorities?.find(a => a.scopes.includes('freeze'))?.address || null,
      }

      setCache(`asset-${asset.id}`, metadata)
      results.push(metadata)
    }
  } catch (error) {
    console.error('[DAS] getAssetBatch error:', error)
  }

  return results
}

/**
 * Get token accounts for a wallet
 * 
 * @param ownerAddress - Wallet address
 * @param page - Page number (1-indexed)
 * @param limit - Results per page (max 1000)
 * @returns Array of TokenAccount
 */
export async function getTokenAccounts(
  ownerAddress: string,
  page = 1,
  limit = 100
): Promise<TokenAccount[]> {
  const cacheKey = `tokens-${ownerAddress}-${page}`
  const cached = getCached<TokenAccount[]>(cacheKey)
  if (cached) return cached

  const apiKey = HELIUS_API_KEY
  if (!apiKey) {
    return []
  }

  try {
    const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'getTokenAccounts',
        method: 'getTokenAccounts',
        params: {
          owner: ownerAddress,
          page,
          limit,
          displayOptions: {
            showZeroBalance: false,
          },
        },
      }),
    })

    if (!response.ok) {
      return []
    }

    const data = await response.json()
    const result: DASTokenAccountResult = data.result

    if (!result?.items) {
      return []
    }

    const accounts: TokenAccount[] = result.items.map((item) => ({
      address: item.id,
      mint: item.id, // Token account address
      owner: ownerAddress,
      amount: item.token_info?.balance || 0,
      decimals: item.token_info?.decimals || 0,
    }))

    setCache(cacheKey, accounts)
    return accounts
  } catch (error) {
    console.error('[DAS] getTokenAccounts error:', error)
    return []
  }
}

/**
 * Search for assets/tokens with filters
 * Great for discovering new tokens
 * 
 * @param options - Search options
 * @returns Array of assets matching criteria
 */
export async function searchAssets(options: {
  ownerAddress?: string
  creatorAddress?: string
  tokenType?: 'fungible' | 'nonFungible' | 'all'
  sortBy?: 'created' | 'updated' | 'recent_action'
  sortDirection?: 'asc' | 'desc'
  limit?: number
  page?: number
}): Promise<TokenMetadata[]> {
  const apiKey = HELIUS_API_KEY
  if (!apiKey) {
    return []
  }

  try {
    const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'searchAssets',
        method: 'searchAssets',
        params: {
          ...(options.ownerAddress ? { ownerAddress: options.ownerAddress } : {}),
          ...(options.creatorAddress ? { creatorAddress: options.creatorAddress } : {}),
          tokenType: options.tokenType || 'fungible',
          displayOptions: {
            showFungible: true,
          },
          sortBy: options.sortBy ? {
            sortBy: options.sortBy,
            sortDirection: options.sortDirection || 'desc',
          } : undefined,
          limit: options.limit || 50,
          page: options.page || 1,
        },
      }),
    })

    if (!response.ok) {
      return []
    }

    const data = await response.json()
    const assets: DASAsset[] = data.result?.items || []

    return assets.map((asset) => ({
      address: asset.id,
      name: asset.content?.metadata?.name || asset.token_info?.symbol || 'Unknown',
      symbol: asset.content?.metadata?.symbol || asset.token_info?.symbol || 'UNKNOWN',
      decimals: asset.token_info?.decimals || 0,
      logoUri: asset.content?.links?.image || asset.content?.files?.[0]?.uri || '',
      description: asset.content?.metadata?.description || '',
      supply: asset.token_info?.supply || 0,
      isNft: asset.interface === 'V1_NFT' || asset.interface === 'ProgrammableNFT',
      isFungible: asset.interface === 'FungibleToken' || asset.interface === 'FungibleAsset',
      creators: asset.creators || [],
      authority: asset.authorities?.[0]?.address || null,
      updateAuthority: asset.authorities?.find(a => a.scopes.includes('metadata'))?.address || null,
      mintAuthority: asset.authorities?.find(a => a.scopes.includes('mint'))?.address || null,
      freezeAuthority: asset.authorities?.find(a => a.scopes.includes('freeze'))?.address || null,
    }))
  } catch (error) {
    console.error('[DAS] searchAssets error:', error)
    return []
  }
}

export type { TokenMetadata, TokenAccount, DASAsset }

