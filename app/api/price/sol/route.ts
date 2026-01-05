/**
 * AQUA Launchpad - SOL Price API
 * 
 * Returns aggregated SOL/USD price from multiple sources
 * No authentication required - public endpoint
 */

import { NextResponse } from 'next/server';
import { getSolPrice, getSourceHealth } from '@/lib/price';

export const revalidate = 10; // Cache for 10 seconds

export async function GET() {
  try {
    const priceResult = await getSolPrice();
    
    return NextResponse.json({
      success: true,
      data: {
        price: priceResult.price,
        priceFormatted: `$${priceResult.price.toFixed(2)}`,
        source: priceResult.source,
        timestamp: priceResult.timestamp,
        confidence: priceResult.confidence,
      },
    });
  } catch (error) {
    console.error('[API] SOL price error:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 6001,
          message: 'Failed to fetch SOL price',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        sourceHealth: getSourceHealth(),
      },
      { status: 500 }
    );
  }
}

