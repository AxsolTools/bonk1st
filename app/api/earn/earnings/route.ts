/**
 * PROPEL Earn - Earnings API
 * 
 * GET /api/earn/earnings?wallet={walletAddress}
 * Fetches user's accumulated earnings from earn positions
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUserEarnings, getUserPositions } from '@/lib/blockchain/jupiter-earn';
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
      const supabase = await createClient();
      const { data: wallets, error } = await supabase
        .from('wallets')
        .select('public_key')
        .eq('session_id', sessionId);
      
      if (error) {
        console.error('[API/EARN/EARNINGS] Wallet fetch error:', error);
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
          earnings: [],
          totalEarnedUsd: 0,
        },
      });
    }
    
    console.log(`[API/EARN/EARNINGS] Fetching earnings for ${walletsToQuery.length} wallet(s)...`);
    
    // Fetch earnings for all wallets
    const allEarnings = [];
    let totalEarnedUsd = 0;
    
    for (const wallet of walletsToQuery) {
      const earnings = await getUserEarnings(wallet);
      
      for (const earning of earnings) {
        allEarnings.push({
          ...earning,
          walletAddress: wallet,
        });
        totalEarnedUsd += earning.earnedValueUsd;
      }
    }
    
    console.log(`[API/EARN/EARNINGS] Found earnings for ${allEarnings.length} positions, total: $${totalEarnedUsd.toFixed(2)}`);
    
    return NextResponse.json({
      success: true,
      data: {
        earnings: allEarnings,
        totalEarnedUsd,
        walletCount: walletsToQuery.length,
      },
      timestamp: Date.now(),
    });
    
  } catch (error) {
    console.error('[API/EARN/EARNINGS] Error:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Failed to fetch earnings',
          code: 'EARNINGS_FETCH_ERROR',
        },
      },
      { status: 500 }
    );
  }
}

