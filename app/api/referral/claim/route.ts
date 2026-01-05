// @ts-nocheck - Supabase table types are dynamically generated
/**
 * AQUA Launchpad - Referral Claim API
 * 
 * POST: Claim pending referral earnings
 * 
 * CRITICAL: This endpoint handles SOL transfers. All operations are:
 * - Atomically locked to prevent race conditions
 * - Validated before execution
 * - Logged for audit trail
 * - Rolled back on failure
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { REFERRAL_CONFIG } from '@/lib/referral';
import { 
  executeReferralPayout, 
  getPayoutWalletStatus,
  type PayoutResult 
} from '@/lib/referral/payout';

// Track in-progress claims to prevent race conditions
const claimsInProgress = new Set<string>();

// Rate limiting - max claims per minute per user
const claimAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_CLAIM_ATTEMPTS = 3;
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Get wallet address from headers and body
    const walletFromHeader = request.headers.get('x-wallet-address');
    const userIdHeader = request.headers.get('x-user-id');
    
    const body = await request.json();
    // Support both field names for compatibility
    const destinationWallet = body.destinationWallet || body.wallet_address;
    
    if (!destinationWallet || typeof destinationWallet !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: 'Destination wallet address is required',
          errorCode: 'MISSING_WALLET',
        },
        { status: 400 }
      );
    }
    
    // Validate wallet address format
    if (destinationWallet.length < 32 || destinationWallet.length > 44) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid wallet address format',
          errorCode: 'INVALID_WALLET_FORMAT',
        },
        { status: 400 }
      );
    }
    
    // Check if referral system is enabled
    if (!REFERRAL_CONFIG.enabled) {
      return NextResponse.json(
        {
          success: false,
          error: 'Referral system is currently disabled',
          errorCode: 'SYSTEM_DISABLED',
        },
        { status: 503 }
      );
    }
    
    const adminClient = getAdminClient();
    
    // Get user ID from wallet
    const lookupWallet = walletFromHeader || destinationWallet;
    const { data: user } = await adminClient
      .from('users')
      .select('id')
      .eq('main_wallet_address', lookupWallet)
      .single();
    
    const userId = user?.id || userIdHeader;
    
    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          error: 'User not found. Please connect your wallet first.',
          errorCode: 'USER_NOT_FOUND',
        },
        { status: 401 }
      );
    }
    
    // ========== RATE LIMITING ==========
    const now = Date.now();
    const userAttempts = claimAttempts.get(userId);
    
    if (userAttempts) {
      if (now < userAttempts.resetAt) {
        if (userAttempts.count >= MAX_CLAIM_ATTEMPTS) {
          const waitSeconds = Math.ceil((userAttempts.resetAt - now) / 1000);
          return NextResponse.json(
            {
              success: false,
              error: `Too many claim attempts. Please wait ${waitSeconds} seconds.`,
              errorCode: 'RATE_LIMITED',
            },
            { status: 429 }
          );
        }
        userAttempts.count++;
      } else {
        // Reset window
        userAttempts.count = 1;
        userAttempts.resetAt = now + RATE_LIMIT_WINDOW_MS;
      }
    } else {
      claimAttempts.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    }
    
    // ========== CONCURRENT CLAIM PREVENTION ==========
    if (claimsInProgress.has(userId)) {
      return NextResponse.json(
        {
          success: false,
          error: 'A claim is already in progress. Please wait.',
          errorCode: 'CLAIM_IN_PROGRESS',
        },
        { status: 429 }
      );
    }
    
    claimsInProgress.add(userId);
    
    try {
      // ========== CHECK PAYOUT SYSTEM STATUS ==========
      const payoutStatus = await getPayoutWalletStatus();
      
      if (!payoutStatus.canProcessPayouts) {
        console.error('[REFERRAL_CLAIM] Payout system unavailable:', payoutStatus.error);
        return NextResponse.json(
          {
            success: false,
            error: 'Payout system is temporarily unavailable. Please try again later.',
            errorCode: 'PAYOUT_SYSTEM_UNAVAILABLE',
          },
          { status: 503 }
        );
      }
      
      // ========== GET REFERRAL RECORD ==========
      const { data: referral, error: referralError } = await adminClient
        .from('referrals')
        .select('*')
        .eq('user_id', userId)
        .single();
      
      if (referralError || !referral) {
        return NextResponse.json(
          {
            success: false,
            error: 'No referral record found. Start referring users to earn rewards!',
            errorCode: 'NO_REFERRAL_RECORD',
          },
          { status: 404 }
        );
      }
      
      const pendingEarnings = Number(referral.pending_earnings);
      
      // ========== VALIDATE CLAIM AMOUNT ==========
      if (pendingEarnings < REFERRAL_CONFIG.minClaimSol) {
        return NextResponse.json(
          {
            success: false,
            error: `Minimum claim is ${REFERRAL_CONFIG.minClaimSol} SOL. You have ${pendingEarnings.toFixed(6)} SOL pending.`,
            errorCode: 'BELOW_MINIMUM',
          },
          { status: 400 }
        );
      }
      
      // ========== CHECK COOLDOWN ==========
      if (referral.last_claim_at) {
        const cooldownEnd = new Date(referral.last_claim_at).getTime() + 
          (REFERRAL_CONFIG.claimCooldownSeconds * 1000);
        if (Date.now() < cooldownEnd) {
          const remainingMs = cooldownEnd - Date.now();
          const remainingMins = Math.ceil(remainingMs / 60000);
          return NextResponse.json(
            {
              success: false,
              error: `Cooldown active. Try again in ${remainingMins} minute(s).`,
              errorCode: 'COOLDOWN_ACTIVE',
            },
            { status: 429 }
          );
        }
      }
      
      // ========== GENERATE UNIQUE CLAIM ID ==========
      const claimId = `claim_${userId.slice(0, 8)}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      
      console.log(`[REFERRAL_CLAIM] Processing claim ${claimId}: ${pendingEarnings} SOL to ${destinationWallet.slice(0, 8)}...`);
      
      // ========== LOCK PENDING AMOUNT (OPTIMISTIC LOCKING) ==========
      const { error: lockError, data: lockResult } = await adminClient
        .from('referrals')
        .update({
          pending_earnings: 0,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('pending_earnings', referral.pending_earnings) // Only update if amount hasn't changed
        .select();
      
      if (lockError || !lockResult || lockResult.length === 0) {
        console.warn(`[REFERRAL_CLAIM] Lock failed for ${claimId} - amount may have changed`);
        return NextResponse.json(
          {
            success: false,
            error: 'Claim amount changed. Please refresh and try again.',
            errorCode: 'OPTIMISTIC_LOCK_FAILED',
          },
          { status: 409 }
        );
      }
      
      // ========== CREATE PENDING CLAIM RECORD ==========
      const { error: claimRecordError } = await adminClient.from('referral_claims').insert({
        user_id: userId,
        claim_id: claimId,
        amount: pendingEarnings,
        destination_wallet: destinationWallet,
        status: 'pending',
        created_at: new Date().toISOString(),
      });
      
      if (claimRecordError) {
        console.error(`[REFERRAL_CLAIM] Failed to create claim record:`, claimRecordError);
        // Continue anyway - the payout is the critical part
      }
      
      // ========== EXECUTE PAYOUT ==========
      let payoutResult: PayoutResult;
      
      try {
        payoutResult = await executeReferralPayout(
          destinationWallet,
          pendingEarnings,
          claimId
        );
      } catch (payoutError) {
        console.error(`[REFERRAL_CLAIM] Payout execution error:`, payoutError);
        payoutResult = {
          success: false,
          error: payoutError instanceof Error ? payoutError.message : 'Payout failed',
          errorCode: 'PAYOUT_EXCEPTION',
        };
      }
      
      // ========== HANDLE PAYOUT RESULT ==========
      if (!payoutResult.success) {
        console.error(`[REFERRAL_CLAIM] Payout failed for ${claimId}:`, payoutResult.error);
        
        // ROLLBACK: Restore pending earnings
        const { error: rollbackError } = await adminClient
          .from('referrals')
          .update({
            pending_earnings: pendingEarnings,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId);
        
        if (rollbackError) {
          console.error(`[REFERRAL_CLAIM] CRITICAL: Rollback failed for ${claimId}:`, rollbackError);
          // Log to a separate error table for manual intervention
          await adminClient.from('system_errors').insert({
            error_type: 'REFERRAL_CLAIM_ROLLBACK_FAILED',
            user_id: userId,
            claim_id: claimId,
            amount: pendingEarnings,
            details: JSON.stringify({ rollbackError, payoutResult }),
            created_at: new Date().toISOString(),
          }).catch(console.error);
        }
        
        // Update claim record as failed
        await adminClient
          .from('referral_claims')
          .update({
            status: 'failed',
            error_message: payoutResult.error,
            error_code: payoutResult.errorCode,
            updated_at: new Date().toISOString(),
          })
          .eq('claim_id', claimId);
        
        return NextResponse.json(
          {
            success: false,
            error: payoutResult.error || 'Payout failed. Your earnings have been restored.',
            errorCode: payoutResult.errorCode || 'PAYOUT_FAILED',
          },
          { status: 500 }
        );
      }
      
      // ========== UPDATE RECORDS ON SUCCESS ==========
      const txSignature = payoutResult.txSignature;
      
      // Update referral record
      await adminClient
        .from('referrals')
        .update({
          total_claimed: Number(referral.total_claimed) + pendingEarnings,
          claim_count: (referral.claim_count || 0) + 1,
          last_claim_at: new Date().toISOString(),
          last_claim_signature: txSignature,
        })
        .eq('user_id', userId);
      
      // Update claim record as successful
      await adminClient
        .from('referral_claims')
        .update({
          tx_signature: txSignature,
          status: 'success',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('claim_id', claimId);
      
      const processingTime = Date.now() - startTime;
      console.log(`[REFERRAL_CLAIM] SUCCESS: ${claimId} | ${pendingEarnings} SOL | TX: ${txSignature} | Time: ${processingTime}ms`);
      
      return NextResponse.json({
        success: true,
        data: {
          claimId,
          amount: pendingEarnings,
          amountFormatted: `${pendingEarnings.toFixed(6)} SOL`,
          txSignature,
          explorerUrl: `https://solscan.io/tx/${txSignature}`,
          message: 'Claim processed successfully! Your SOL has been transferred.',
        },
      });
      
    } finally {
      claimsInProgress.delete(userId);
    }
    
  } catch (error) {
    console.error('[API] Referral claim error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process claim. Please try again.',
        errorCode: 'INTERNAL_ERROR',
      },
      { status: 500 }
    );
  }
}

// ========== GET: Check claim status and system health ==========
export async function GET(request: NextRequest) {
  try {
    const payoutStatus = await getPayoutWalletStatus();
    
    return NextResponse.json({
      success: true,
      data: {
        systemHealthy: payoutStatus.canProcessPayouts,
        payoutWalletConfigured: payoutStatus.configured,
        referralEnabled: REFERRAL_CONFIG.enabled,
        minClaimAmount: REFERRAL_CONFIG.minClaimSol,
        cooldownSeconds: REFERRAL_CONFIG.claimCooldownSeconds,
      },
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Failed to check claim status',
    }, { status: 500 });
  }
}
