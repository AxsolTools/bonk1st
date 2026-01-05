/**
 * Referral Manager - Handles referral tracking, earnings, and claims
 * Adapted for SOL-based flat fees
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PublicKey, Transaction, SystemProgram, Keypair } = require('@solana/web3.js');
const { getConnection, solToLamports, lamportsToSol, sendAndConfirmTransactionWithRetry } = require('../solana_utils');

// Data paths
const DATA_DIR = path.join(__dirname, '../../data');
const REFERRAL_DB_PATH = path.join(DATA_DIR, 'referrals.json');
const CLAIM_LOG_PATH = path.join(DATA_DIR, 'claim_log.json');

// Default configuration (can be overridden by env)
const DEFAULT_CONFIG = {
  enabled: process.env.REFERRAL_ENABLED === 'true',
  referrerSharePercent: parseFloat(process.env.REFERRAL_SHARE_PERCENT) || 50,
  minClaimSol: parseFloat(process.env.REFERRAL_MIN_CLAIM_SOL) || 0.01,
  claimCooldownSeconds: parseInt(process.env.REFERRAL_CLAIM_COOLDOWN) || 3600,
  claimWalletAddress: process.env.CLAIM_WALLET_ADDRESS || null,
  claimWalletPrivateKey: process.env.CLAIM_WALLET_PRIVATE_KEY || null
};

class ReferralManager {
  constructor() {
    this.database = {
      users: {},
      codeToUser: {},
      globalStats: {
        totalReferrals: 0,
        totalEarningsDistributed: 0,
        totalClaimsPaid: 0
      }
    };
    this.config = { ...DEFAULT_CONFIG };
    this.initialized = false;
    
    // Security: Track in-progress claims to prevent race conditions
    this.claimsInProgress = new Set();
  }

  /**
   * Initialize the referral manager
   */
  async init() {
    try {
      // Ensure data directory exists
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      // Load existing database or create new
      if (fs.existsSync(REFERRAL_DB_PATH)) {
        const data = fs.readFileSync(REFERRAL_DB_PATH, 'utf-8');
        this.database = JSON.parse(data);
        console.log(`[REFERRAL] Loaded ${Object.keys(this.database.users).length} user profiles`);
      } else {
        await this.saveDatabase();
        console.log('[REFERRAL] Created new referral database');
      }

      // Reload config from env (in case it changed)
      this.config = {
        enabled: process.env.REFERRAL_ENABLED === 'true',
        referrerSharePercent: parseFloat(process.env.REFERRAL_SHARE_PERCENT) || 50,
        minClaimSol: parseFloat(process.env.REFERRAL_MIN_CLAIM_SOL) || 0.01,
        claimCooldownSeconds: parseInt(process.env.REFERRAL_CLAIM_COOLDOWN) || 3600,
        claimWalletAddress: process.env.CLAIM_WALLET_ADDRESS || null,
        claimWalletPrivateKey: process.env.CLAIM_WALLET_PRIVATE_KEY || null
      };

      this.initialized = true;
      console.log(`[REFERRAL] System ${this.config.enabled ? 'ENABLED' : 'DISABLED'} | Share: ${this.config.referrerSharePercent}% | Min claim: ${this.config.minClaimSol} SOL`);
      
      return true;
    } catch (error) {
      console.error('[REFERRAL] Init error:', error.message);
      return false;
    }
  }

  /**
   * Check if referral system is enabled
   */
  isEnabled() {
    return this.config.enabled && this.initialized;
  }

  /**
   * Get or create user profile
   */
  getOrCreateProfile(userId, username = null) {
    const id = String(userId);
    
    if (!this.database.users[id]) {
      const referralCode = this.generateReferralCode();
      
      this.database.users[id] = {
        referralCode,
        referredBy: null,
        referredByCode: null,
        referralCount: 0,
        referredUsers: [],
        pendingEarnings: 0,
        totalEarnings: 0,
        totalClaimed: 0,
        lastClaimTime: null,
        claimCount: 0,
        username: username || null,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      
      this.database.codeToUser[referralCode] = id;
      this.saveDatabase();
    } else if (username && this.database.users[id].username !== username) {
      this.database.users[id].username = username;
      this.database.users[id].updatedAt = Date.now();
      this.saveDatabase();
    }
    
    return this.database.users[id];
  }

  /**
   * Generate unique referral code
   */
  generateReferralCode() {
    let code;
    let attempts = 0;
    
    do {
      code = crypto.randomBytes(4).toString('hex').toUpperCase();
      attempts++;
    } while (this.database.codeToUser[code] && attempts < 100);
    
    return code;
  }

  /**
   * Process a referral when new user joins with code
   */
  async processReferral(newUserId, referralCode, username = null) {
    if (!this.isEnabled()) {
      return { success: false, reason: 'Referral system disabled' };
    }

    const newId = String(newUserId);
    const code = (referralCode || '').trim().toUpperCase();

    // Check if code exists
    const referrerId = this.database.codeToUser[code];
    if (!referrerId) {
      return { success: false, reason: 'Invalid referral code' };
    }

    // Prevent self-referral
    if (referrerId === newId) {
      return { success: false, reason: 'Cannot use your own referral code' };
    }

    // Get or create new user profile
    const newUserProfile = this.getOrCreateProfile(newId, username);

    // Check if already referred
    if (newUserProfile.referredBy) {
      return { success: false, reason: 'You have already been referred' };
    }

    // Get referrer profile
    const referrerProfile = this.database.users[referrerId];
    if (!referrerProfile) {
      return { success: false, reason: 'Referrer not found' };
    }

    // Link the referral
    newUserProfile.referredBy = referrerId;
    newUserProfile.referredByCode = code;
    newUserProfile.updatedAt = Date.now();

    // Update referrer stats
    referrerProfile.referralCount++;
    referrerProfile.referredUsers.push(newId);
    referrerProfile.updatedAt = Date.now();

    // Update global stats
    this.database.globalStats.totalReferrals++;

    await this.saveDatabase();

    console.log(`[REFERRAL] ${newId} referred by ${referrerId} (code: ${code})`);

    return {
      success: true,
      referrer: {
        id: referrerId,
        username: referrerProfile.username,
        code
      }
    };
  }

  /**
   * Add earnings to referrer's pending balance
   * Called when a referred user pays a fee
   */
  /**
   * Add earnings to referrer's pending balance
   * Called when a referred user pays a fee
   * SECURITY: Uses fixed-point arithmetic to prevent floating point errors
   */
  async addEarnings(referrerUserId, amountSol, sourceUserId = null, operationType = null) {
    if (!this.isEnabled()) return null;

    const referrerId = String(referrerUserId);
    const profile = this.database.users[referrerId];
    
    if (!profile) {
      console.warn(`[REFERRAL] Cannot add earnings - referrer ${referrerId} not found`);
      return null;
    }

    // SECURITY: Validate and sanitize amount
    const amount = parseFloat(amountSol);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1000) {
      console.warn(`[REFERRAL SECURITY] Invalid earnings amount rejected: ${amountSol}`);
      return null;
    }

    // SECURITY: Use fixed-point math (9 decimal places for SOL)
    // Round to 9 decimal places to avoid floating point accumulation errors
    const roundedAmount = Math.round(amount * 1e9) / 1e9;

    const previousPending = profile.pendingEarnings;
    profile.pendingEarnings = Math.round((profile.pendingEarnings + roundedAmount) * 1e9) / 1e9;
    profile.totalEarnings = Math.round((profile.totalEarnings + roundedAmount) * 1e9) / 1e9;
    profile.updatedAt = Date.now();

    this.database.globalStats.totalEarningsDistributed = 
      Math.round((this.database.globalStats.totalEarningsDistributed + roundedAmount) * 1e9) / 1e9;

    await this.saveDatabase();

    console.log(`[REFERRAL] +${roundedAmount.toFixed(9)} SOL to ${referrerId} (from ${sourceUserId || 'unknown'}, ${operationType || 'fee'}) | Pending: ${previousPending.toFixed(6)} → ${profile.pendingEarnings.toFixed(6)}`);

    return {
      referrerId,
      amount: roundedAmount,
      newPending: profile.pendingEarnings,
      totalEarnings: profile.totalEarnings
    };
  }

  /**
   * Get referrer ID for a user (if they were referred)
   */
  getReferrer(userId) {
    const profile = this.database.users[String(userId)];
    return profile?.referredBy || null;
  }

  /**
   * Calculate referrer share of a fee
   */
  calculateReferrerShare(feeSol) {
    if (!this.isEnabled()) return 0;
    return (parseFloat(feeSol) || 0) * (this.config.referrerSharePercent / 100);
  }

  /**
   * Get user stats for dashboard
   */
  getStats(userId) {
    const profile = this.getOrCreateProfile(userId);
    
    const canClaim = profile.pendingEarnings >= this.config.minClaimSol;
    const cooldownRemaining = profile.lastClaimTime 
      ? Math.max(0, (profile.lastClaimTime + this.config.claimCooldownSeconds * 1000) - Date.now())
      : 0;
    const cooldownActive = cooldownRemaining > 0;

    return {
      referralCode: profile.referralCode,
      referralCount: profile.referralCount,
      referredUsers: profile.referredUsers.length,
      pendingEarnings: profile.pendingEarnings,
      totalEarnings: profile.totalEarnings,
      totalClaimed: profile.totalClaimed,
      claimCount: profile.claimCount,
      canClaim,
      cooldownActive,
      cooldownRemaining,
      cooldownRemainingFormatted: this.formatDuration(cooldownRemaining),
      minClaimAmount: this.config.minClaimSol,
      referrerSharePercent: this.config.referrerSharePercent,
      wasReferred: !!profile.referredBy,
      referredByCode: profile.referredByCode
    };
  }

  /**
   * Process a claim request
   * SECURITY: Protected against race conditions with claim lock
   */
  async processClaim(userId, destinationAddress) {
    const userIdStr = String(userId);
    
    if (!this.isEnabled()) {
      return { success: false, reason: 'Referral system disabled' };
    }

    // SECURITY: Prevent concurrent claims (race condition protection)
    if (this.claimsInProgress.has(userIdStr)) {
      console.warn(`[REFERRAL SECURITY] Blocked concurrent claim attempt for user ${userIdStr}`);
      return { success: false, reason: 'A claim is already in progress. Please wait.' };
    }

    // Mark claim as in progress
    this.claimsInProgress.add(userIdStr);

    try {
      const profile = this.database.users[userIdStr];
      if (!profile) {
        return { success: false, reason: 'Profile not found' };
      }

      // SECURITY: Use integer math to avoid floating point issues
      const pendingLamports = Math.floor(profile.pendingEarnings * 1e9);
      const minClaimLamports = Math.floor(this.config.minClaimSol * 1e9);

      // Check minimum amount
      if (pendingLamports < minClaimLamports) {
        return { 
          success: false, 
          reason: `Minimum claim is ${this.config.minClaimSol} SOL. You have ${profile.pendingEarnings.toFixed(6)} SOL.`
        };
      }

      // Check cooldown
      if (profile.lastClaimTime) {
        const cooldownEnd = profile.lastClaimTime + (this.config.claimCooldownSeconds * 1000);
        if (Date.now() < cooldownEnd) {
          const remaining = this.formatDuration(cooldownEnd - Date.now());
          return { success: false, reason: `Cooldown active. Try again in ${remaining}.` };
        }
      }

      // Validate destination address
      let destPubkey;
      try {
        destPubkey = new PublicKey(destinationAddress);
      } catch {
        return { success: false, reason: 'Invalid destination wallet address' };
      }

      // Check claim wallet configuration
      if (!this.config.claimWalletPrivateKey) {
        return { success: false, reason: 'Claim system not configured. Contact admin.' };
      }

      // Generate unique claim ID for audit trail
      const claimId = `${userIdStr}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

      // SECURITY: Lock the pending amount ATOMICALLY
      const claimAmount = profile.pendingEarnings;
      const claimAmountLamports = Math.floor(claimAmount * 1e9);
      
      // Double-check amount hasn't changed
      if (claimAmountLamports <= 0) {
        return { success: false, reason: 'No pending earnings to claim' };
      }

      profile.pendingEarnings = 0;
      await this.saveDatabase();

      console.log(`[REFERRAL] Claim initiated: ${claimId} | ${claimAmount} SOL to ${destinationAddress}`);

      try {
        // Load claim wallet
        let claimKeypair;
        try {
          const keyData = JSON.parse(this.config.claimWalletPrivateKey);
          claimKeypair = Keypair.fromSecretKey(new Uint8Array(keyData));
        } catch {
          // Try base58 format
          const bs58 = require('bs58');
          claimKeypair = Keypair.fromSecretKey(bs58.decode(this.config.claimWalletPrivateKey));
        }

        const conn = getConnection();
        
        // SECURITY: Check claim wallet balance with buffer
        const claimWalletBalance = await conn.getBalance(claimKeypair.publicKey);
        const requiredLamports = claimAmountLamports + 10000; // Add buffer for fees
        
        if (claimWalletBalance < requiredLamports) {
          // Restore pending amount on failure
          profile.pendingEarnings = claimAmount;
          await this.saveDatabase();
          console.error(`[REFERRAL SECURITY] Claim wallet insufficient: needs ${requiredLamports}, has ${claimWalletBalance}`);
          return { success: false, reason: 'Claim wallet has insufficient funds. Contact admin.' };
        }

        // Create transfer transaction
        const transaction = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: claimKeypair.publicKey,
            toPubkey: destPubkey,
            lamports: claimAmountLamports
          })
        );

        // Send transaction
        const signature = await sendAndConfirmTransactionWithRetry(transaction, [claimKeypair], {
          skipPreflight: false,
          maxRetries: 2
        });

        // SECURITY: Update profile only after confirmed transaction
        profile.totalClaimed += claimAmount;
        profile.lastClaimTime = Date.now();
        profile.claimCount++;
        profile.updatedAt = Date.now();

        this.database.globalStats.totalClaimsPaid += claimAmount;

        await this.saveDatabase();

        // Log the claim with full audit trail
        await this.logClaim({
          claimId,
          timestamp: Date.now(),
          userId: userIdStr,
          amount: claimAmount,
          amountLamports: claimAmountLamports,
          destination: destinationAddress,
          txHash: signature,
          claimWallet: claimKeypair.publicKey.toBase58(),
          status: 'success',
          previousPending: claimAmount,
          newPending: 0,
          totalClaimedAfter: profile.totalClaimed
        });

        console.log(`[REFERRAL] ✅ Claim success: ${claimId} | ${claimAmount} SOL | TX: ${signature}`);

        return {
          success: true,
          claimId,
          amount: claimAmount,
          txHash: signature,
          destination: destinationAddress
        };

      } catch (error) {
        // SECURITY: Restore pending amount on failure
        profile.pendingEarnings = claimAmount;
        await this.saveDatabase();
        
        // Log failed claim attempt
        await this.logClaim({
          claimId,
          timestamp: Date.now(),
          userId: userIdStr,
          amount: claimAmount,
          destination: destinationAddress,
          status: 'failed',
          error: error.message
        });
        
        console.error(`[REFERRAL] ❌ Claim failed: ${claimId} | ${error.message}`);
        return { success: false, reason: `Transaction failed: ${error.message}` };
      }
    } finally {
      // SECURITY: Always release the claim lock
      this.claimsInProgress.delete(userIdStr);
    }
  }

  /**
   * Log a claim for audit
   */
  async logClaim(claimData) {
    try {
      let logs = [];
      if (fs.existsSync(CLAIM_LOG_PATH)) {
        logs = JSON.parse(fs.readFileSync(CLAIM_LOG_PATH, 'utf-8'));
      }
      logs.push(claimData);
      fs.writeFileSync(CLAIM_LOG_PATH, JSON.stringify(logs, null, 2));
    } catch (error) {
      console.error('[REFERRAL] Failed to log claim:', error.message);
    }
  }

  /**
   * Save database to disk (atomic write)
   */
  async saveDatabase() {
    try {
      const tempPath = REFERRAL_DB_PATH + '.tmp';
      fs.writeFileSync(tempPath, JSON.stringify(this.database, null, 2));
      fs.renameSync(tempPath, REFERRAL_DB_PATH);
    } catch (error) {
      console.error('[REFERRAL] Failed to save database:', error.message);
    }
  }

  /**
   * Format duration in human readable format
   */
  formatDuration(ms) {
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

  /**
   * Get global statistics
   */
  getGlobalStats() {
    return {
      totalUsers: Object.keys(this.database.users).length,
      totalReferrals: this.database.globalStats.totalReferrals,
      totalEarningsDistributed: this.database.globalStats.totalEarningsDistributed,
      totalClaimsPaid: this.database.globalStats.totalClaimsPaid,
      pendingPayouts: Object.values(this.database.users).reduce((sum, u) => sum + u.pendingEarnings, 0)
    };
  }

  /**
   * Get top referrers
   */
  getTopReferrers(limit = 10) {
    return Object.entries(this.database.users)
      .map(([id, profile]) => ({
        userId: id,
        username: profile.username,
        referralCount: profile.referralCount,
        totalEarnings: profile.totalEarnings
      }))
      .filter(u => u.referralCount > 0)
      .sort((a, b) => b.referralCount - a.referralCount)
      .slice(0, limit);
  }
}

// Export singleton instance
const referralManager = new ReferralManager();

module.exports = {
  referralManager,
  ReferralManager
};

