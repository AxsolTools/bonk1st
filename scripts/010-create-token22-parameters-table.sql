-- ============================================================================
-- Token22 Parameters Table
-- ============================================================================
-- Stores Token-2022 specific settings including:
-- - Liquidity engine parameters (auto-harvest, auto-add-liquidity)
-- - Fee distribution settings (burn %, liquidity %, creator %)
-- - Harvest tracking and state
-- ============================================================================

-- Create table for Token-2022 specific parameters
CREATE TABLE IF NOT EXISTS token22_parameters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id UUID NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
  
  -- ========== LIQUIDITY ENGINE SETTINGS ==========
  liquidity_engine_enabled BOOLEAN DEFAULT FALSE,
  auto_harvest_enabled BOOLEAN DEFAULT FALSE,
  auto_add_liquidity_enabled BOOLEAN DEFAULT FALSE,
  
  -- Harvest configuration
  harvest_interval_minutes INTEGER DEFAULT 60, -- How often to harvest (default 1 hour)
  min_harvest_amount_tokens DECIMAL(24, 9) DEFAULT 0, -- Minimum tokens before harvest triggers
  
  -- ========== FEE DISTRIBUTION ==========
  -- These must sum to 100
  fee_to_liquidity_percent INTEGER DEFAULT 50 CHECK (fee_to_liquidity_percent >= 0 AND fee_to_liquidity_percent <= 100),
  fee_to_burn_percent INTEGER DEFAULT 25 CHECK (fee_to_burn_percent >= 0 AND fee_to_burn_percent <= 100),
  fee_to_creator_percent INTEGER DEFAULT 25 CHECK (fee_to_creator_percent >= 0 AND fee_to_creator_percent <= 100),
  
  -- ========== BURN MECHANICS ==========
  burn_enabled BOOLEAN DEFAULT FALSE,
  burn_on_harvest_percent INTEGER DEFAULT 0 CHECK (burn_on_harvest_percent >= 0 AND burn_on_harvest_percent <= 100),
  
  -- ========== STATE TRACKING ==========
  last_harvest_at TIMESTAMPTZ,
  total_harvested_tokens TEXT DEFAULT '0', -- Stored as string for BigInt precision
  total_burned_tokens TEXT DEFAULT '0',
  total_added_to_liquidity_sol DECIMAL(24, 9) DEFAULT 0,
  total_sent_to_creator_tokens TEXT DEFAULT '0',
  
  -- ========== AUTHORITY ==========
  dev_wallet_address TEXT NOT NULL,
  withdraw_withheld_authority TEXT, -- Wallet authorized to withdraw fees
  transfer_fee_config_authority TEXT, -- Wallet authorized to change fee config
  
  -- ========== TIMESTAMPS ==========
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(token_id),
  CONSTRAINT fee_distribution_sum CHECK (
    fee_to_liquidity_percent + fee_to_burn_percent + fee_to_creator_percent = 100
  )
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_token22_params_token_id ON token22_parameters(token_id);
CREATE INDEX IF NOT EXISTS idx_token22_params_engine_enabled ON token22_parameters(liquidity_engine_enabled) WHERE liquidity_engine_enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_token22_params_last_harvest ON token22_parameters(last_harvest_at);

-- ============================================================================
-- Liquidity Engine Logs Table
-- ============================================================================
-- Logs all automated actions taken by the liquidity engines

CREATE TABLE IF NOT EXISTS liquidity_engine_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id UUID NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
  
  -- Action details
  action_type TEXT NOT NULL, -- 'token22_harvest', 'token22_burn', 'token22_liquidity', 'pumpfun_buyback', etc.
  
  -- Amounts
  harvested_amount TEXT, -- Tokens harvested
  burned_amount TEXT, -- Tokens burned
  liquidity_added_amount TEXT, -- Tokens added to liquidity
  liquidity_added_sol DECIMAL(24, 9), -- SOL equivalent added
  
  -- Transaction
  tx_signature TEXT,
  tx_status TEXT DEFAULT 'pending', -- 'pending', 'confirmed', 'failed'
  
  -- Error tracking
  error_message TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_liquidity_logs_token_id ON liquidity_engine_logs(token_id);
CREATE INDEX IF NOT EXISTS idx_liquidity_logs_action_type ON liquidity_engine_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_liquidity_logs_created_at ON liquidity_engine_logs(created_at DESC);

-- ============================================================================
-- Update trigger for updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_token22_parameters_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_token22_parameters_updated_at ON token22_parameters;
CREATE TRIGGER trigger_token22_parameters_updated_at
  BEFORE UPDATE ON token22_parameters
  FOR EACH ROW
  EXECUTE FUNCTION update_token22_parameters_updated_at();

-- ============================================================================
-- RLS Policies
-- ============================================================================

ALTER TABLE token22_parameters ENABLE ROW LEVEL SECURITY;
ALTER TABLE liquidity_engine_logs ENABLE ROW LEVEL SECURITY;

-- Token22 parameters: Only creator can view/edit
CREATE POLICY "Token22 parameters are viewable by creator" ON token22_parameters
  FOR SELECT USING (
    dev_wallet_address IN (
      SELECT public_key FROM wallets WHERE session_id = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );

CREATE POLICY "Token22 parameters are editable by creator" ON token22_parameters
  FOR UPDATE USING (
    dev_wallet_address IN (
      SELECT public_key FROM wallets WHERE session_id = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );

-- Logs: Viewable by token creator
CREATE POLICY "Liquidity logs are viewable by creator" ON liquidity_engine_logs
  FOR SELECT USING (
    token_id IN (
      SELECT id FROM tokens WHERE creator_wallet IN (
        SELECT public_key FROM wallets WHERE session_id = current_setting('request.jwt.claims', true)::json->>'sub'
      )
    )
  );

-- Service role bypass for engine operations
CREATE POLICY "Service role can manage token22_parameters" ON token22_parameters
  FOR ALL USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

CREATE POLICY "Service role can manage liquidity_logs" ON liquidity_engine_logs
  FOR ALL USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE token22_parameters IS 'Token-2022 specific settings including liquidity engine, fee distribution, and burn mechanics';
COMMENT ON TABLE liquidity_engine_logs IS 'Audit log for all automated liquidity engine actions';
COMMENT ON COLUMN token22_parameters.fee_to_liquidity_percent IS 'Percentage of harvested fees to add to liquidity pool';
COMMENT ON COLUMN token22_parameters.fee_to_burn_percent IS 'Percentage of harvested fees to burn';
COMMENT ON COLUMN token22_parameters.fee_to_creator_percent IS 'Percentage of harvested fees to send to creator wallet';

