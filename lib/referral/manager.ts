// @ts-nocheck - Supabase table types are dynamically generated
/**
 * AQUA Launchpad - Referral Manager
 * 
 * Handles referral tracking, earnings, and claims
 * Adapted from HelperScripts/services/ReferralManager.js
 * 
 * Features:
 * - Unique referral code per user (linked to main wallet)
 * - 50% of platform fees go to referrer
 * - Fixed-point arithmetic to prevent floating point errors
 * - Race condition protection for claims
 */

import { createClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { 
  solToLamports, 
  lamportsToSol, 
  formatSol 
} from '@/lib/precision';

// Database row types (Supabase type inference workaround)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbRow = Record<string, any>;

// ============================================================================
// TYPES
// ============================================================================

export interface ReferralStats {
  referralCode: string;
  referralCount: number;
  pendingEarnings: number; // SOL
  totalEarnings: number;
  totalClaimed: number;
  claimCount: number;
  canClaim: boolean;
  cooldownActive: boolean;
  cooldownRemaining: number; // ms
  cooldownRemainingFormatted: string;
  minClaimAmount: number;
  referrerSharePercent: number;
  wasReferred: boolean;
  referredByCode: string | null;
}

export interface ReferralEarningsResult {
  success: boolean;
  referrerId?: string;
  amount?: number;
  newPending?: number;
  error?: string;
}

export interface ClaimResult {
  success: boolean;
  claimId?: string;
  amount?: number;
  txSignature?: string;
  error?: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export const REFERRAL_CONFIG = {
  enabled: process.env.REFERRAL_ENABLED === 'true',
  sharePercent: parseInt(process.env.REFERRAL_SHARE_PERCENT || '50', 10),
  minClaimSol: parseFloat(process.env.REFERRAL_MIN_CLAIM_SOL || '0.01'),
  claimCooldownSeconds: parseInt(process.env.REFERRAL_CLAIM_COOLDOWN || '3600', 10),
};

// ============================================================================
// REFERRAL CODE MANAGEMENT
// ============================================================================

/**
 * Generate a unique 8-character referral code
 */
function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid confusing chars
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Get or create referral record for user
 * Creates unique referral code linked to user's main wallet
 */
export async function getOrCreateReferral(userId: string): Promise<{
  referralCode: string;
  isNew: boolean;
}> {
  const adminClient = getAdminClient();
  
  // Check if referral record exists
  const { data: existing } = await adminClient
    .from('referrals')
    .select('referral_code')
    .eq('user_id', userId)
    .single();
  
  if (existing?.referral_code) {
    return { referralCode: existing.referral_code, isNew: false };
  }
  
  // Generate unique code
  let code = generateReferralCode();
  let attempts = 0;
  
  while (attempts < 10) {
    const { data: exists } = await adminClient
      .from('referrals')
      .select('id')
      .eq('referral_code', code)
      .single();
    
    if (!exists) break;
    code = generateReferralCode();
    attempts++;
  }
  
  // Create new referral record
  const { error } = await adminClient
    .from('referrals')
    .insert({
      user_id: userId,
      referral_code: code,
      pending_earnings: 0,
      total_earnings: 0,
      total_claimed: 0,
      referral_count: 0,
      claim_count: 0,
    });
  
  if (error) {
    throw new Error(`Failed to create referral: ${error.message}`);
  }
  
  return { referralCode: code, isNew: true };
}

/**
 * Apply a referral code to a new user
 * Links the new user to their referrer
 */
export async function applyReferralCode(
  newUserId: string,
  referralCode: string
): Promise<{
  success: boolean;
  referrerId?: string;
  error?: string;
}> {
  if (!REFERRAL_CONFIG.enabled) {
    return { success: false, error: 'Referral system disabled' };
  }
  
  const adminClient = getAdminClient();
  const normalizedCode = referralCode.trim().toUpperCase();
  
  // Find referrer by code
  const { data: referrer } = await adminClient
    .from('referrals')
    .select('user_id')
    .eq('referral_code', normalizedCode)
    .single();
  
  if (!referrer) {
    return { success: false, error: 'Invalid referral code' };
  }
  
  // Prevent self-referral
  if (referrer.user_id === newUserId) {
    return { success: false, error: 'Cannot use your own referral code' };
  }
  
  // Check if user already has a referrer
  const { data: existingReferral } = await adminClient
    .from('referrals')
    .select('referred_by')
    .eq('user_id', newUserId)
    .single();
  
  if (existingReferral?.referred_by) {
    return { success: false, error: 'You have already been referred' };
  }
  
  // Ensure new user has a referral record
  await getOrCreateReferral(newUserId);
  
  // Link the referral
  const { error: updateError } = await adminClient
    .from('referrals')
    .update({
      referred_by: referrer.user_id,
      referred_by_code: normalizedCode,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', newUserId);
  
  if (updateError) {
    return { success: false, error: 'Failed to apply referral code' };
  }
  
  // Increment referrer's count
  await adminClient.rpc('increment_referral_count', {
    referrer_user_id: referrer.user_id,
  });
  
  console.log(`[REFERRAL] ${newUserId} referred by ${referrer.user_id} (code: ${normalizedCode})`);
  
  return { success: true, referrerId: referrer.user_id };
}

// ============================================================================
// EARNINGS MANAGEMENT
// ============================================================================

/**
 * Calculate referrer share from platform fee
 */
export function calculateReferrerShare(feeSol: number): number {
  if (!REFERRAL_CONFIG.enabled) return 0;
  return feeSol * (REFERRAL_CONFIG.sharePercent / 100);
}

/**
 * Add earnings to referrer's pending balance
 * Called when a referred user pays a platform fee
 */
export async function addReferralEarnings(
  referrerUserId: string,
  amountSol: number,
  sourceUserId: string,
  operationType: string
): Promise<ReferralEarningsResult> {
  if (!REFERRAL_CONFIG.enabled) {
    return { success: false, error: 'Referral system disabled' };
  }
  
  // Validate amount
  if (!Number.isFinite(amountSol) || amountSol <= 0 || amountSol > 1000) {
    console.warn(`[REFERRAL] Invalid earnings amount rejected: ${amountSol}`);
    return { success: false, error: 'Invalid earnings amount' };
  }
  
  const adminClient = getAdminClient();
  
  // Use fixed-point math (9 decimal places for SOL)
  const roundedAmount = Math.round(amountSol * 1e9) / 1e9;
  
  // Get current referral record
  const { data: referral } = await adminClient
    .from('referrals')
    .select('pending_earnings, total_earnings')
    .eq('user_id', referrerUserId)
    .single();
  
  if (!referral) {
    return { success: false, error: 'Referrer not found' };
  }
  
  // Update earnings with fixed-point arithmetic
  const newPending = Math.round((referral.pending_earnings + roundedAmount) * 1e9) / 1e9;
  const newTotal = Math.round((referral.total_earnings + roundedAmount) * 1e9) / 1e9;
  
  const { error: updateError } = await adminClient
    .from('referrals')
    .update({
      pending_earnings: newPending,
      total_earnings: newTotal,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', referrerUserId);
  
  if (updateError) {
    return { success: false, error: 'Failed to update earnings' };
  }
  
  // Log the earning
  await adminClient.from('referral_earnings').insert({
    referrer_id: referrerUserId,
    source_user_id: sourceUserId,
    operation_type: operationType,
    fee_amount: amountSol * 2, // Total fee (referrer gets 50%)
    referrer_share: roundedAmount,
  });
  
  console.log(`[REFERRAL] +${roundedAmount.toFixed(9)} SOL to ${referrerUserId} | Pending: ${newPending.toFixed(6)}`);
  
  return {
    success: true,
    referrerId: referrerUserId,
    amount: roundedAmount,
    newPending,
  };
}

/**
 * Get the referrer ID for a user (if they were referred)
 */
export async function getReferrer(userId: string): Promise<string | null> {
  const adminClient = getAdminClient();
  
  const { data } = await adminClient
    .from('referrals')
    .select('referred_by')
    .eq('user_id', userId)
    .single();
  
  return data?.referred_by || null;
}

// ============================================================================
// STATS & DASHBOARD
// ============================================================================

/**
 * Get referral stats for user dashboard
 */
export async function getReferralStats(userId: string): Promise<ReferralStats> {
  const adminClient = getAdminClient();
  
  // Get or create referral record
  const { referralCode } = await getOrCreateReferral(userId);
  
  // Fetch full referral data
  const { data: referral } = await adminClient
    .from('referrals')
    .select('*')
    .eq('user_id', userId)
    .single();
  
  if (!referral) {
    throw new Error('Referral record not found');
  }
  
  // Calculate cooldown
  const lastClaimTime = referral.last_claim_at 
    ? new Date(referral.last_claim_at).getTime() 
    : 0;
  const cooldownEnd = lastClaimTime + (REFERRAL_CONFIG.claimCooldownSeconds * 1000);
  const cooldownRemaining = Math.max(0, cooldownEnd - Date.now());
  const cooldownActive = cooldownRemaining > 0;
  
  // Check if can claim
  const canClaim = 
    referral.pending_earnings >= REFERRAL_CONFIG.minClaimSol && 
    !cooldownActive;
  
  return {
    referralCode,
    referralCount: referral.referral_count || 0,
    pendingEarnings: referral.pending_earnings || 0,
    totalEarnings: referral.total_earnings || 0,
    totalClaimed: referral.total_claimed || 0,
    claimCount: referral.claim_count || 0,
    canClaim,
    cooldownActive,
    cooldownRemaining,
    cooldownRemainingFormatted: formatDuration(cooldownRemaining),
    minClaimAmount: REFERRAL_CONFIG.minClaimSol,
    referrerSharePercent: REFERRAL_CONFIG.sharePercent,
    wasReferred: !!referral.referred_by,
    referredByCode: referral.referred_by_code || null,
  };
}

// ============================================================================
// CLAIMS
// ============================================================================
// NOTE: Claim processing is handled by /api/referral/claim/route.ts
// which uses lib/referral/payout.ts for the actual SOL transfer.
// This ensures proper use of REFERRAL_PAYOUT_WALLET environment variable.
// ============================================================================

// ============================================================================
// NOTE: SOL transfers are handled by lib/referral/payout.ts
// The executeReferralPayout function uses REFERRAL_PAYOUT_WALLET env var
// ============================================================================

// ============================================================================
// UTILITIES
// ============================================================================

function formatDuration(ms: number): string {
  if (ms <= 0) return '0s';
  
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

