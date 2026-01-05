// @ts-nocheck - Supabase table types are dynamically generated
/**
 * AQUA Launchpad - Referral Stats API
 * 
 * GET: Get user's referral statistics from database
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
      // Return default stats for users without an account
      return NextResponse.json({
        success: true,
        data: {
          enabled: REFERRAL_CONFIG.enabled,
          totalReferred: 0,
          activeReferrals: 0,
          totalEarnings: 0,
          pendingEarnings: 0,
          claimableAmount: 0,
          lastClaimAt: null,
          minClaimAmount: REFERRAL_CONFIG.minClaimSol,
          sharePercent: REFERRAL_CONFIG.sharePercent,
        },
      });
    }
    
    // Get referral record from database
    const { data: referral, error: referralError } = await adminClient
      .from('referrals')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (referralError && referralError.code !== 'PGRST116') {
      console.error('[REFERRAL_STATS] Database error:', referralError);
    }
    
    // If no referral record exists, create one
    if (!referral) {
      // Generate a unique referral code
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let referralCode = '';
      for (let i = 0; i < 8; i++) {
        referralCode += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      
      // Create the referral record
      await adminClient
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
      
      return NextResponse.json({
        success: true,
        data: {
          enabled: REFERRAL_CONFIG.enabled,
          totalReferred: 0,
          activeReferrals: 0,
          totalEarnings: 0,
          pendingEarnings: 0,
          claimableAmount: 0,
          lastClaimAt: null,
          minClaimAmount: REFERRAL_CONFIG.minClaimSol,
          sharePercent: REFERRAL_CONFIG.sharePercent,
        },
      });
    }
    
    // Calculate cooldown
    const lastClaimTime = referral.last_claim_at 
      ? new Date(referral.last_claim_at).getTime() 
      : 0;
    const cooldownEnd = lastClaimTime + (REFERRAL_CONFIG.claimCooldownSeconds * 1000);
    const cooldownActive = Date.now() < cooldownEnd;
    
    // Get active referrals count (users who traded in last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    const { data: activeUsers } = await adminClient
      .from('referral_earnings')
      .select('source_user_id')
      .eq('referrer_id', userId)
      .gte('created_at', thirtyDaysAgo);
    
    // Get unique active users
    const activeUserIds = activeUsers ? new Set(activeUsers.map((e: { source_user_id: string }) => e.source_user_id)) : new Set();
    
    // Check if can claim
    const pendingEarnings = Number(referral.pending_earnings) || 0;
    const canClaim = 
      pendingEarnings >= REFERRAL_CONFIG.minClaimSol && 
      !cooldownActive;
    
    return NextResponse.json({
      success: true,
      data: {
        enabled: REFERRAL_CONFIG.enabled,
        totalReferred: Number(referral.referral_count) || 0,
        activeReferrals: activeUserIds.size,
        totalEarnings: Number(referral.total_earnings) || 0,
        pendingEarnings: pendingEarnings,
        claimableAmount: pendingEarnings,
        totalClaimed: Number(referral.total_claimed) || 0,
        claimCount: Number(referral.claim_count) || 0,
        lastClaimAt: referral.last_claim_at || null,
        canClaim,
        cooldownActive,
        cooldownRemaining: cooldownActive ? cooldownEnd - Date.now() : 0,
        minClaimAmount: REFERRAL_CONFIG.minClaimSol,
        sharePercent: REFERRAL_CONFIG.sharePercent,
      },
    });
    
  } catch (error) {
    console.error('[API] Referral stats error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get referral stats',
      },
      { status: 500 }
    );
  }
}
