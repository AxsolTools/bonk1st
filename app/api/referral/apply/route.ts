/**
 * AQUA Launchpad - Apply Referral Code API
 * 
 * POST: Apply a referral code to current user
 */

import { NextRequest, NextResponse } from 'next/server';
import { applyReferralCode, REFERRAL_CONFIG } from '@/lib/referral';

export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    
    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 5000,
            message: 'Authentication required',
          },
        },
        { status: 401 }
      );
    }
    
    if (!REFERRAL_CONFIG.enabled) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 5005,
            message: 'Referral system is currently disabled',
          },
        },
        { status: 503 }
      );
    }
    
    const body = await request.json();
    const { code } = body;
    
    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 5001,
            message: 'Referral code is required',
          },
        },
        { status: 400 }
      );
    }
    
    const result = await applyReferralCode(userId, code);
    
    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 5001,
            message: result.error || 'Failed to apply referral code',
          },
        },
        { status: 400 }
      );
    }
    
    return NextResponse.json({
      success: true,
      data: {
        applied: true,
        referrerId: result.referrerId,
        message: 'Referral code applied successfully!',
      },
    });
    
  } catch (error) {
    console.error('[API] Apply referral error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 5000,
          message: 'Failed to apply referral code',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
}

