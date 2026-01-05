-- ============================================================================
-- AQUA Launchpad - Platform Fees Migration
-- Tracks 2% platform fee on all transactions
-- ============================================================================

-- Create platform_fees table
CREATE TABLE IF NOT EXISTS platform_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  wallet_address VARCHAR(44) NOT NULL,
  
  -- Transaction reference
  source_transaction_id UUID,
  source_tx_signature VARCHAR(88),
  operation_type VARCHAR(50) NOT NULL CHECK (operation_type IN (
    'token_create', 'token_buy', 'token_sell', 
    'add_liquidity', 'remove_liquidity', 'claim_rewards'
  )),
  
  -- Amounts (all in lamports for precision)
  transaction_amount_lamports BIGINT NOT NULL,
  fee_amount_lamports BIGINT NOT NULL,
  fee_percentage DECIMAL(5,2) DEFAULT 2.0,
  
  -- Referral split (if applicable)
  referral_split_lamports BIGINT DEFAULT 0,
  referrer_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- Fee collection transaction
  fee_tx_signature VARCHAR(88),
  fee_collected_at TIMESTAMPTZ,
  
  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'collected', 'failed', 'refunded')),
  error_message TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Platform fee configuration (singleton table)
CREATE TABLE IF NOT EXISTS platform_fee_config (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- Singleton
  fee_percent DECIMAL(5,2) DEFAULT 2.0,
  referral_share_percent DECIMAL(5,2) DEFAULT 50.0,
  developer_wallet VARCHAR(44) NOT NULL,
  min_fee_lamports BIGINT DEFAULT 1,
  is_active BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES users(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_platform_fees_user ON platform_fees(user_id);
CREATE INDEX IF NOT EXISTS idx_platform_fees_status ON platform_fees(status);
CREATE INDEX IF NOT EXISTS idx_platform_fees_created ON platform_fees(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_fees_operation ON platform_fees(operation_type);

-- Enable RLS
ALTER TABLE platform_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_fee_config ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can read own fees" ON platform_fees
  FOR SELECT USING (
    wallet_address = current_setting('app.current_wallet', true)
  );

CREATE POLICY "Service can manage fees" ON platform_fees
  FOR ALL USING (current_setting('app.service_role', true) = 'true');

CREATE POLICY "Anyone can read fee config" ON platform_fee_config
  FOR SELECT USING (true);

CREATE POLICY "Only service can update fee config" ON platform_fee_config
  FOR ALL USING (current_setting('app.service_role', true) = 'true');

-- Trigger for updated_at
CREATE TRIGGER platform_fees_updated_at
  BEFORE UPDATE ON platform_fees
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to calculate platform fee
CREATE OR REPLACE FUNCTION calculate_platform_fee(transaction_lamports BIGINT)
RETURNS BIGINT AS $$
DECLARE
  config RECORD;
  fee BIGINT;
BEGIN
  SELECT * INTO config FROM platform_fee_config WHERE id = 1;
  
  IF config IS NULL OR NOT config.is_active THEN
    RETURN 0;
  END IF;
  
  -- Calculate 2% fee (multiply by 2, divide by 100)
  fee := (transaction_lamports * 2) / 100;
  
  -- Ensure minimum fee
  IF fee < config.min_fee_lamports THEN
    fee := config.min_fee_lamports;
  END IF;
  
  RETURN fee;
END;
$$ LANGUAGE plpgsql;

