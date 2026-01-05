-- =====================================================
-- AQUA Launchpad - Platform Configuration Setup
-- Migration 014: Initialize platform fee configuration
-- =====================================================

-- Insert default platform fee configuration
INSERT INTO platform_fee_config (
  fee_percent,
  referral_share_percent,
  developer_wallet,
  min_fee_lamports,
  is_active,
  updated_at
) VALUES (
  2.0,                                          -- 2% platform fee
  50.0,                                         -- 50% referral share
  'YOUR_DEVELOPER_WALLET_ADDRESS_HERE',         -- CHANGE THIS to your wallet
  1000,                                         -- Minimum fee: 0.000001 SOL
  true,
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  fee_percent = EXCLUDED.fee_percent,
  referral_share_percent = EXCLUDED.referral_share_percent,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- Create referral system config table if not exists
CREATE TABLE IF NOT EXISTS referral_config (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled BOOLEAN DEFAULT true,
  share_percent NUMERIC DEFAULT 50,
  min_claim_sol NUMERIC DEFAULT 0.01,
  claim_cooldown_seconds INTEGER DEFAULT 3600,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default referral config
INSERT INTO referral_config (enabled, share_percent, min_claim_sol, claim_cooldown_seconds)
VALUES (true, 50, 0.01, 3600)
ON CONFLICT (id) DO NOTHING;

-- Done

