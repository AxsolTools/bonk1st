/**
 * Jupiter Fee Monitoring API
 * 
 * Get unclaimed fees for a Jupiter DBC pool
 */

import { type NextRequest, NextResponse } from 'next/server';
import { getJupiterFeeInfo, getJupiterPoolAddress } from '@/lib/blockchain/jupiter-studio';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mintAddress = searchParams.get('mint');
    const poolAddress = searchParams.get('pool');

    console.log('[JUPITER-FEES] GET request:', { mintAddress: mintAddress?.slice(0, 12), poolAddress: poolAddress?.slice(0, 12) });

    if (!mintAddress && !poolAddress) {
      return NextResponse.json(
        { success: false, error: { code: 4002, message: 'Either mint or pool address is required' } },
        { status: 400 }
      );
    }

    let resolvedPoolAddress = poolAddress;

    // If only mint address provided, get pool address first
    if (!resolvedPoolAddress && mintAddress) {
      try {
        console.log('[JUPITER-FEES] Looking up pool for mint:', mintAddress.slice(0, 12));
        resolvedPoolAddress = await getJupiterPoolAddress(mintAddress);
        console.log('[JUPITER-FEES] Found pool:', resolvedPoolAddress?.slice(0, 12) || 'NOT FOUND');
      } catch (error) {
        console.log('[JUPITER-FEES] No Jupiter pool found for this token (this is normal for non-Jupiter tokens)');
        // Return success:false with zero fees instead of 404/500
        // This is NOT an error - the token simply doesn't have a Jupiter pool
        return NextResponse.json({
          success: true,
          data: {
            poolAddress: null,
            totalFees: 0,
            unclaimedFees: 0,
            claimedFees: 0,
            mintAddress: mintAddress,
            notJupiterToken: true,
          },
        });
      }
    }

    if (!resolvedPoolAddress) {
      console.log('[JUPITER-FEES] No pool address resolved');
      return NextResponse.json({
        success: true,
        data: {
          poolAddress: null,
          totalFees: 0,
          unclaimedFees: 0,
          claimedFees: 0,
          mintAddress: mintAddress,
          notJupiterToken: true,
        },
      });
    }

    // Get fee info
    console.log('[JUPITER-FEES] Fetching fee info for pool:', resolvedPoolAddress.slice(0, 12));
    const feeInfo = await getJupiterFeeInfo(resolvedPoolAddress);

    console.log('[JUPITER-FEES] Fee info:', {
      unclaimedFees: feeInfo.unclaimedFees,
      totalFees: feeInfo.totalFees,
    });

    return NextResponse.json({
      success: true,
      data: {
        poolAddress: feeInfo.poolAddress,
        totalFees: feeInfo.totalFees,
        unclaimedFees: feeInfo.unclaimedFees,
        claimedFees: feeInfo.claimedFees,
        mintAddress: mintAddress || null,
      },
    });

  } catch (error) {
    console.error('[JUPITER-FEES] Error:', error);
    // Return zero fees instead of 500 error - more graceful handling
    return NextResponse.json({
      success: true,
      data: {
        poolAddress: null,
        totalFees: 0,
        unclaimedFees: 0,
        claimedFees: 0,
        mintAddress: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mintAddress, poolAddress } = body;

    if (!mintAddress && !poolAddress) {
      return NextResponse.json(
        { success: false, error: { code: 4002, message: 'Either mint or pool address is required' } },
        { status: 400 }
      );
    }

    let resolvedPoolAddress = poolAddress;

    // If only mint address provided, get pool address first
    if (!resolvedPoolAddress && mintAddress) {
      try {
        resolvedPoolAddress = await getJupiterPoolAddress(mintAddress);
      } catch (error) {
        return NextResponse.json(
          { 
            success: false, 
            error: { 
              code: 4004, 
              message: 'Could not find DBC pool for this token',
              details: error instanceof Error ? error.message : 'Unknown error'
            } 
          },
          { status: 404 }
        );
      }
    }

    // Get fee info
    const feeInfo = await getJupiterFeeInfo(resolvedPoolAddress!);

    return NextResponse.json({
      success: true,
      data: {
        poolAddress: feeInfo.poolAddress,
        totalFees: feeInfo.totalFees,
        unclaimedFees: feeInfo.unclaimedFees,
        claimedFees: feeInfo.claimedFees,
        mintAddress: mintAddress || null,
      },
    });

  } catch (error) {
    console.error('[JUPITER-FEES] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 5000,
          message: 'Failed to fetch fee information',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
}

