/**
 * Batch Token Metadata API - Fetch metadata for multiple tokens at once
 * Uses Helius DAS getAssetBatch for efficiency
 * 
 * CREDIT COSTS: ~10 credits per batch (more efficient than individual calls)
 */

import { NextRequest, NextResponse } from 'next/server'

const HELIUS_API_KEY = process.env.HELIUS_API_KEY
const MAX_BATCH_SIZE = 100

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
    }
    files?: Array<{
      uri?: string
    }>
  }
  authorities?: Array<{
    address: string
    scopes: string[]
  }>
  creators?: Array<{
    address: string
    share: number
    verified: boolean
  }>
  token_info?: {
    symbol?: string
    supply?: number
    decimals?: number
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const addresses: string[] = body.addresses || []

    if (addresses.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No addresses provided' },
        { status: 400 }
      )
    }

    // Limit batch size
    const limitedAddresses = addresses.slice(0, MAX_BATCH_SIZE)

    // Try DAS API batch
    if (HELIUS_API_KEY) {
      const dasResponse = await fetchBatchFromDAS(limitedAddresses)
      if (dasResponse && Object.keys(dasResponse).length > 0) {
        return NextResponse.json({
          success: true,
          data: dasResponse,
          source: 'helius-das',
        })
      }
    }

    // Fallback to individual DexScreener calls (limited)
    const dexResponse = await fetchBatchFromDexScreener(limitedAddresses.slice(0, 10))
    
    return NextResponse.json({
      success: true,
      data: dexResponse,
      source: 'dexscreener',
    })
  } catch (error) {
    console.error('[BATCH-METADATA] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch metadata' },
      { status: 500 }
    )
  }
}

async function fetchBatchFromDAS(addresses: string[]): Promise<Record<string, unknown>> {
  try {
    const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'getAssetBatch',
        method: 'getAssetBatch',
        params: {
          ids: addresses,
          displayOptions: {
            showFungible: true,
          },
        },
      }),
    })

    if (!response.ok) return {}

    const data = await response.json()
    const assets: DASAsset[] = data.result || []

    const result: Record<string, unknown> = {}

    for (const asset of assets) {
      if (!asset) continue

      result[asset.id] = {
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
    }

    return result
  } catch (error) {
    console.error('[BATCH-METADATA] DAS error:', error)
    return {}
  }
}

async function fetchBatchFromDexScreener(addresses: string[]): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {}

  // DexScreener supports comma-separated addresses
  try {
    const batchUrl = `https://api.dexscreener.com/tokens/v1/solana/${addresses.join(',')}`
    const response = await fetch(batchUrl, {
      headers: { 'User-Agent': 'AQUA-Launchpad/1.0' },
    })

    if (response.ok) {
      const pairs = await response.json()
      
      for (const pair of pairs || []) {
        if (!pair?.baseToken?.address) continue
        
        result[pair.baseToken.address] = {
          address: pair.baseToken.address,
          name: pair.baseToken.name || 'Unknown',
          symbol: pair.baseToken.symbol || 'UNKNOWN',
          decimals: 6,
          logoUri: pair.info?.imageUrl || `https://dd.dexscreener.com/ds-data/tokens/solana/${pair.baseToken.address}.png`,
          description: '',
          supply: 0,
          isNft: false,
          isFungible: true,
          creators: [],
          authority: null,
          updateAuthority: null,
          mintAuthority: null,
          freezeAuthority: null,
        }
      }
    }
  } catch (error) {
    console.error('[BATCH-METADATA] DexScreener error:', error)
  }

  return result
}

