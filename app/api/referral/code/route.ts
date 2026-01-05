// @ts-nocheck - Supabase table types are dynamically generated
/**
 * AQUA Launchpad - Referral Code API
 * 
 * GET: Get user's referral code from database
 * Creates one if doesn't exist
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { REFERRAL_CONFIG } from '@/lib/referral';

export async function GET(request: NextRequest) {
  try {
    // Get wallet address from query params (primary auth method)
    const { searchParams } = new URL(request.url);
    const walletAddress = searchParams.get('wallet_address');
    
    // Fallback to header
    const walletFromHeader = request.headers.get('x-wallet-address');
    const userIdHeader = request.headers.get('x-user-id');
    
    const wallet = walletAddress || walletFromHeader;
    
    if (!wallet) {
      return NextResponse.json(
        {
          success: false,
          error: 'Wallet address required',
        },
        { status: 401 }
      );
    }
    
    const adminClient = getAdminClient();
    
    // Get user ID from wallet
    const { data: user } = await adminClient
      .from('users')
      .select('id')
      .eq('main_wallet_address', wallet)
      .single();
    
    const userId = user?.id || userIdHeader;
    
    if (!userId) {
      // For users without an account, generate a code from their wallet address
      const referralCode = wallet.slice(0, 8).toUpperCase();
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://propellabs.app';
      
      return NextResponse.json({
        success: true,
        data: {
          referralCode,
          isNew: true,
          sharePercent: REFERRAL_CONFIG.sharePercent,
          shareLink: `${baseUrl}?ref=${referralCode}`,
        },
      });
    }
    
    // Check if referral record exists
    const { data: existingReferral, error: fetchError } = await adminClient
      .from('referrals')
      .select('referral_code')
      .eq('user_id', userId)
      .single();
    
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://propellabs.app';
    
    if (existingReferral?.referral_code) {
      return NextResponse.json({
        success: true,
        data: {
          referralCode: existingReferral.referral_code,
          isNew: false,
          sharePercent: REFERRAL_CONFIG.sharePercent,
          shareLink: `${baseUrl}?ref=${existingReferral.referral_code}`,
        },
      });
    }
    
    // Generate a unique referral code
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let referralCode = '';
    let attempts = 0;
    let isUnique = false;
    
    while (!isUnique && attempts < 10) {
      referralCode = '';
      for (let i = 0; i < 8; i++) {
        referralCode += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      
      // Check if code already exists
      const { data: existingCode } = await adminClient
        .from('referrals')
        .select('id')
        .eq('referral_code', referralCode)
        .single();
      
      if (!existingCode) {
        isUnique = true;
      }
      attempts++;
    }
    
    // Create new referral record
    const { error: createError } = await adminClient
      .from('referrals')
      .insert({
        user_id: userId,
        referral_code: referralCode,
        pending_earnings: 0,
        total_earnings: 0,
        total_claimed: 0,
        referral_count: 0,
        claim_count: 0,
      });
    
    if (createError) {
      console.error('[REFERRAL_CODE] Failed to create referral:', createError);
      // If creation fails (e.g., race condition), try to fetch existing
      const { data: retryFetch } = await adminClient
        .from('referrals')
        .select('referral_code')
        .eq('user_id', userId)
        .single();
      
      if (retryFetch?.referral_code) {
        return NextResponse.json({
          success: true,
          data: {
            referralCode: retryFetch.referral_code,
            isNew: false,
            sharePercent: REFERRAL_CONFIG.sharePercent,
            shareLink: `${baseUrl}?ref=${retryFetch.referral_code}`,
          },
        });
      }
    }
    
    return NextResponse.json({
      success: true,
      data: {
        referralCode,
        isNew: true,
        sharePercent: REFERRAL_CONFIG.sharePercent,
        shareLink: `${baseUrl}?ref=${referralCode}`,
      },
    });
    
  } catch (error) {
    console.error('[API] Referral code error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get referral code',
      },
      { status: 500 }
    );
  }
}
