-- ============================================================================
-- AQUA Launchpad - System Errors Table
-- For tracking critical errors that require manual intervention
-- ============================================================================

-- Create system_errors table for audit and recovery
CREATE TABLE IF NOT EXISTS system_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  error_type VARCHAR(100) NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  claim_id VARCHAR(100),
  amount DECIMAL(18,9),
  destination_wallet VARCHAR(44),
  tx_signature VARCHAR(88),
  details JSONB,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by VARCHAR(100),
  resolution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying unresolved errors
CREATE INDEX IF NOT EXISTS idx_system_errors_unresolved 
  ON system_errors(resolved, created_at DESC) 
  WHERE resolved = FALSE;

-- Index for user-specific error lookup
CREATE INDEX IF NOT EXISTS idx_system_errors_user 
  ON system_errors(user_id, created_at DESC);

-- Index for claim-specific error lookup
CREATE INDEX IF NOT EXISTS idx_system_errors_claim 
  ON system_errors(claim_id);

-- ============================================================================
-- Update referral_claims table with additional fields
-- ============================================================================

-- Add new columns if they don't exist
DO $$ 
BEGIN
  -- Add error_message column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'referral_claims' AND column_name = 'error_message'
  ) THEN
    ALTER TABLE referral_claims ADD COLUMN error_message TEXT;
  END IF;

  -- Add error_code column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'referral_claims' AND column_name = 'error_code'
  ) THEN
    ALTER TABLE referral_claims ADD COLUMN error_code VARCHAR(50);
  END IF;

  -- Add completed_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'referral_claims' AND column_name = 'completed_at'
  ) THEN
    ALTER TABLE referral_claims ADD COLUMN completed_at TIMESTAMPTZ;
  END IF;

  -- Add updated_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'referral_claims' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE referral_claims ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- Create indexes for claim lookups
CREATE INDEX IF NOT EXISTS idx_referral_claims_status 
  ON referral_claims(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_referral_claims_user 
  ON referral_claims(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_referral_claims_claim_id 
  ON referral_claims(claim_id);

-- ============================================================================
-- Platform Fee Config Table (for payout wallet settings)
-- ============================================================================

CREATE TABLE IF NOT EXISTS platform_fee_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_wallet VARCHAR(44) NOT NULL,
  referral_payout_wallet VARCHAR(44),
  fee_percentage DECIMAL(5,2) DEFAULT 2.00,
  referral_share_percentage DECIMAL(5,2) DEFAULT 50.00,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Only one active config at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_fee_config_active 
  ON platform_fee_config(is_active) 
  WHERE is_active = TRUE;

-- ============================================================================
-- RLS Policies
-- ============================================================================

-- system_errors should only be accessible by admin
ALTER TABLE system_errors ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Admin access only" ON system_errors;

-- Create admin-only policy
CREATE POLICY "Admin access only" ON system_errors
  FOR ALL USING (FALSE);

-- platform_fee_config should only be accessible by admin
ALTER TABLE platform_fee_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin access only" ON platform_fee_config;

CREATE POLICY "Admin access only" ON platform_fee_config
  FOR ALL USING (FALSE);

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE system_errors IS 'Critical errors requiring manual intervention (e.g., failed claim rollbacks)';
COMMENT ON TABLE platform_fee_config IS 'Platform fee and payout wallet configuration';
COMMENT ON COLUMN system_errors.error_type IS 'Type of error (e.g., REFERRAL_CLAIM_ROLLBACK_FAILED)';
COMMENT ON COLUMN system_errors.resolved IS 'Whether the error has been manually resolved';

