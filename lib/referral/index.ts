/**
 * AQUA Launchpad - Referral Module
 * 
 * Complete referral system with:
 * - Code generation and tracking
 * - Earnings management
 * - Secure claim payouts
 */

export {
  // Types
  type ReferralStats,
  type ReferralEarningsResult,
  type ClaimResult,
  
  // Configuration
  REFERRAL_CONFIG,
  
  // Code management
  getOrCreateReferral,
  applyReferralCode,
  
  // Earnings
  calculateReferrerShare,
  addReferralEarnings,
  getReferrer,
  
  // Stats
  getReferralStats,
  
  // Claims
  processClaim,
} from './manager';

export {
  // Payout types
  type PayoutResult,
  type PayoutWalletStatus,
  
  // Payout functions
  executeReferralPayout,
  getPayoutWalletStatus,
  getPayoutWalletPublicKey,
  healthCheck,
} from './payout';
