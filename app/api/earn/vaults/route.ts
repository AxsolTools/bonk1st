/**
 * PROPEL Earn - Vaults API
 * 
 * GET /api/earn/vaults
 * Fetches all available Jupiter Earn vaults with APY, TVL, and liquidity data
 */

import { NextRequest, NextResponse } from 'next/server';
import { getEarnVaults, formatApy, formatTvl } from '@/lib/blockchain/jupiter-earn';

export const dynamic = 'force-dynamic';
export const revalidate = 60; // Cache for 60 seconds

export async function GET(request: NextRequest) {
  try {
    console.log('[API/EARN/VAULTS] Fetching vaults...');
    
    const vaults = await getEarnVaults();
    
    // Transform to frontend-friendly format
    const formattedVaults = vaults.map(vault => ({
      id: vault.id,
      address: vault.address,
      name: vault.name,
      symbol: vault.symbol,
      decimals: vault.decimals,
      asset: {
        address: vault.assetAddress,
        symbol: vault.asset.symbol,
        name: vault.asset.name,
        decimals: vault.asset.decimals,
        logoUrl: vault.asset.logoUrl,
        priceUsd: parseFloat(vault.asset.price || '0'),
      },
      // Key metrics
      apy: vault.apy,
      apyFormatted: formatApy(vault.apy),
      tvlUsd: vault.tvlUsd,
      tvlFormatted: formatTvl(vault.tvlUsd),
      availableLiquidity: vault.availableLiquidity,
      // Conversion rates
      convertToShares: vault.convertToShares,
      convertToAssets: vault.convertToAssets,
      // Rates breakdown
      supplyRate: parseFloat(vault.supplyRate || '0') / 100,
      rewardsRate: parseFloat(vault.rewardsRate || '0') / 100,
    }));
    
    console.log(`[API/EARN/VAULTS] Returning ${formattedVaults.length} vaults`);
    
    return NextResponse.json({
      success: true,
      data: formattedVaults,
      timestamp: Date.now(),
    });
    
  } catch (error) {
    console.error('[API/EARN/VAULTS] Error:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Failed to fetch vaults',
          code: 'VAULTS_FETCH_ERROR',
        },
      },
      { status: 500 }
    );
  }
}

