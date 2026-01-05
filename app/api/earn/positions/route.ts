/**
 * PROPEL Earn - Positions API
 * 
 * GET /api/earn/positions?wallet={walletAddress}
 * Fetches user's earn positions with current values
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUserPositions } from '@/lib/blockchain/jupiter-earn';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const walletAddress = searchParams.get('wallet');
    
    // Auth validation
    const sessionId = request.headers.get('x-session-id');
    
    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: { message: 'Authentication required', code: 1001 } },
        { status: 401 }
      );
    }
    
    // If no wallet specified, get all wallets for this session
    let walletsToQuery: string[] = [];
    
    if (walletAddress) {
      walletsToQuery = [walletAddress];
    } else {
      // Fetch user's wallets from database
      const supabase = await createClient();
      const { data: wallets, error } = await supabase
        .from('wallets')
        .select('public_key')
        .eq('session_id', sessionId);
      
      if (error) {
        console.error('[API/EARN/POSITIONS] Wallet fetch error:', error);
        return NextResponse.json(
          { success: false, error: { message: 'Failed to fetch wallets', code: 1003 } },
          { status: 500 }
        );
      }
      
      walletsToQuery = wallets?.map(w => w.public_key) || [];
    }
    
    if (walletsToQuery.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          positions: [],
          totalValueUsd: 0,
        },
      });
    }
    
    console.log(`[API/EARN/POSITIONS] Fetching positions for ${walletsToQuery.length} wallet(s)...`);
    
    // Fetch positions for all wallets
    const allPositions = [];
    let totalValueUsd = 0;
    
    for (const wallet of walletsToQuery) {
      const positions = await getUserPositions(wallet);
      
      for (const position of positions) {
        allPositions.push({
          ...position,
          walletAddress: wallet,
        });
        totalValueUsd += position.underlyingValueUsd;
      }
    }
    
    console.log(`[API/EARN/POSITIONS] Found ${allPositions.length} positions, total value: $${totalValueUsd.toFixed(2)}`);
    
    return NextResponse.json({
      success: true,
      data: {
        positions: allPositions,
        totalValueUsd,
        walletCount: walletsToQuery.length,
      },
      timestamp: Date.now(),
    });
    
  } catch (error) {
    console.error('[API/EARN/POSITIONS] Error:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Failed to fetch positions',
          code: 'POSITIONS_FETCH_ERROR',
        },
      },
      { status: 500 }
    );
  }
}

