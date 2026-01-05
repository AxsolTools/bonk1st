/**
 * Token Metadata API - Uses Helius DAS API for comprehensive token info
 * 
 * CREDIT COSTS: 10 credits per call
 * 
 * Returns:
 * - Token name, symbol, decimals
 * - Logo/image URI
 * - Description
 * - Supply information
 * - Creator/authority info
 */

import { NextRequest, NextResponse } from 'next/server'

const HELIUS_API_KEY = process.env.HELIUS_API_KEY

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
    price_info?: {
      price_per_token?: number
    }
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await context.params

    if (!address) {
      return NextResponse.json(
        { success: false, error: 'Token address required' },
        { status: 400 }
      )
    }

    // Try DAS API first
    if (HELIUS_API_KEY) {
      const dasResponse = await fetchFromDAS(address)
      if (dasResponse) {
        return NextResponse.json({
          success: true,
          data: dasResponse,
          source: 'helius-das',
        })
      }
    }

    // Fallback to DexScreener
    const dexResponse = await fetchFromDexScreener(address)
    if (dexResponse) {
      return NextResponse.json({
        success: true,
        data: dexResponse,
        source: 'dexscreener',
      })
    }

    return NextResponse.json(
      { success: false, error: 'Token metadata not found' },
      { status: 404 }
    )
  } catch (error) {
    console.error('[TOKEN-METADATA] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch metadata' },
      { status: 500 }
    )
  }
}

async function fetchFromDAS(address: string) {
  try {
    const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`, {
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

    if (!response.ok) return null

    const data = await response.json()
    const asset: DASAsset = data.result

    if (!asset) return null

    return {
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
  } catch (error) {
    console.error('[TOKEN-METADATA] DAS error:', error)
    return null
  }
}

async function fetchFromDexScreener(address: string) {
  try {
    const response = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${address}`,
      {
        headers: {
          'User-Agent': 'AQUA-Launchpad/1.0',
        },
      }
    )

    if (!response.ok) return null

    const data = await response.json()
    const pair = data.pairs?.[0]

    if (!pair?.baseToken) return null

    return {
      address,
      name: pair.baseToken.name || 'Unknown',
      symbol: pair.baseToken.symbol || 'UNKNOWN',
      decimals: 6, // Default for most Solana tokens
      logoUri: pair.info?.imageUrl || `https://dd.dexscreener.com/ds-data/tokens/solana/${address}.png`,
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
  } catch (error) {
    console.error('[TOKEN-METADATA] DexScreener error:', error)
    return null
  }
}
