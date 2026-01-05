/**
 * AQUA Launchpad - Token Price API
 * 
 * Returns token price in USD and SOL
 * No authentication required - public endpoint
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTokenPrice, getSolPrice, getSourceHealth } from '@/lib/price';

export const revalidate = 10; // Cache for 10 seconds

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ mint: string }> }
) {
  try {
    const { mint } = await params;
    
    if (!mint || mint.length < 32) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 4001,
            message: 'Invalid mint address',
          },
        },
        { status: 400 }
      );
    }
    
    // Fetch token price and SOL price in parallel
    const [tokenPrice, solPrice] = await Promise.all([
      getTokenPrice(mint),
      getSolPrice(),
    ]);
    
    // Calculate price in SOL
    const priceInSol = tokenPrice.price / solPrice.price;
    
    return NextResponse.json({
      success: true,
      data: {
        mint,
        priceUsd: tokenPrice.price,
        priceSol: priceInSol,
        priceUsdFormatted: tokenPrice.price >= 0.01 
          ? `$${tokenPrice.price.toFixed(4)}`
          : `$${tokenPrice.price.toExponential(2)}`,
        priceSolFormatted: priceInSol >= 0.001
          ? `${priceInSol.toFixed(6)} SOL`
          : `${priceInSol.toExponential(2)} SOL`,
        solPrice: solPrice.price,
        source: tokenPrice.source,
        timestamp: tokenPrice.timestamp,
        confidence: tokenPrice.confidence,
      },
    });
  } catch (error) {
    console.error('[API] Token price error:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 6002,
          message: 'Failed to fetch token price',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        sourceHealth: getSourceHealth(),
      },
      { status: 500 }
    );
  }
}

