-- ============================================================================
-- AQUA Launchpad - Referral System Migration
-- Implements referral tracking, earnings, and claims
-- ============================================================================

-- Create referrals table
CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  referral_code VARCHAR(8) UNIQUE NOT NULL,
  referred_by UUID REFERENCES users(id) ON DELETE SET NULL,
  referred_by_code VARCHAR(8),
  
  -- Earnings tracking (DECIMAL(18,9) for lamport precision)
  pending_earnings DECIMAL(18,9) DEFAULT 0 CHECK (pending_earnings >= 0),
  total_earnings DECIMAL(18,9) DEFAULT 0 CHECK (total_earnings >= 0),
  total_claimed DECIMAL(18,9) DEFAULT 0 CHECK (total_claimed >= 0),
  
  -- Stats
  referral_count INTEGER DEFAULT 0,
  claim_count INTEGER DEFAULT 0,
  last_claim_at TIMESTAMPTZ,
  last_claim_signature VARCHAR(88),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure user can only have one referral record
  CONSTRAINT unique_user_referral UNIQUE (user_id)
);

-- Referral earnings log (audit trail for all earnings)
CREATE TABLE IF NOT EXISTS referral_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID REFERENCES users(id) ON DELETE CASCADE,
  source_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  source_transaction_id UUID,
  operation_type VARCHAR(50) NOT NULL,
  fee_amount DECIMAL(18,9) NOT NULL,
  referrer_share DECIMAL(18,9) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Referral claims log (audit trail for all claims)
CREATE TABLE IF NOT EXISTS referral_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  claim_id VARCHAR(64) UNIQUE NOT NULL,
  amount DECIMAL(18,9) NOT NULL,
  destination_wallet VARCHAR(44) NOT NULL,
  tx_signature VARCHAR(88),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_referrals_user_id ON referrals(user_id);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals(referral_code);
CREATE INDEX IF NOT EXISTS idx_referrals_referred_by ON referrals(referred_by);
CREATE INDEX IF NOT EXISTS idx_referral_earnings_referrer ON referral_earnings(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referral_claims_user ON referral_claims(user_id);

-- Enable RLS
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_earnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_claims ENABLE ROW LEVEL SECURITY;

-- Policies for referrals
CREATE POLICY "Users can read own referral data" ON referrals
  FOR SELECT USING (
    user_id IN (SELECT id FROM users WHERE main_wallet_address = current_setting('app.current_wallet', true))
  );

CREATE POLICY "Service can manage referrals" ON referrals
  FOR ALL USING (current_setting('app.service_role', true) = 'true');

-- Policies for earnings
CREATE POLICY "Users can read own earnings" ON referral_earnings
  FOR SELECT USING (
    referrer_id IN (SELECT id FROM users WHERE main_wallet_address = current_setting('app.current_wallet', true))
  );

-- Policies for claims
CREATE POLICY "Users can read own claims" ON referral_claims
  FOR SELECT USING (
    user_id IN (SELECT id FROM users WHERE main_wallet_address = current_setting('app.current_wallet', true))
  );

-- Trigger for updated_at
CREATE TRIGGER referrals_updated_at
  BEFORE UPDATE ON referrals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to generate unique referral code
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS VARCHAR(8) AS $$
DECLARE
  new_code VARCHAR(8);
  code_exists BOOLEAN;
BEGIN
  LOOP
    -- Generate 8 character hex code
    new_code := UPPER(ENCODE(gen_random_bytes(4), 'hex'));
    
    -- Check if code exists
    SELECT EXISTS(SELECT 1 FROM referrals WHERE referral_code = new_code) INTO code_exists;
    
    EXIT WHEN NOT code_exists;
  END LOOP;
  
  RETURN new_code;
END;
$$ LANGUAGE plpgsql;

