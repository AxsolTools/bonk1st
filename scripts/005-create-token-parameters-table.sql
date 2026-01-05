-- ============================================================================
-- AQUA Launchpad - Token Parameters Migration
-- Comprehensive token creator settings with audit trail
-- ============================================================================

-- Create tokens table (if not exists) - enhanced version
CREATE TABLE IF NOT EXISTS tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES users(id) ON DELETE SET NULL,
  creator_wallet VARCHAR(44) NOT NULL,
  
  -- Token identity
  mint_address VARCHAR(44) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  symbol VARCHAR(10) NOT NULL,
  description TEXT,
  image_url TEXT,
  metadata_uri TEXT,
  
  -- Token specs
  total_supply DECIMAL(30,0) NOT NULL,
  decimals INTEGER DEFAULT 9,
  
  -- Pricing (DECIMAL for precision)
  price_sol DECIMAL(18,9) DEFAULT 0,
  price_usd DECIMAL(18,6) DEFAULT 0,
  
  -- Market data
  market_cap DECIMAL(18,2) DEFAULT 0,
  current_liquidity DECIMAL(18,9) DEFAULT 0,
  volume_24h DECIMAL(18,9) DEFAULT 0,
  change_24h DECIMAL(8,4) DEFAULT 0,
  holders INTEGER DEFAULT 0,
  
  -- AQUA metrics
  water_level DECIMAL(8,4) DEFAULT 0,
  constellation_strength DECIMAL(8,4) DEFAULT 0,
  
  -- Stage tracking
  stage VARCHAR(20) DEFAULT 'bonding' CHECK (stage IN ('bonding', 'migrating', 'migrated')),
  migration_threshold DECIMAL(18,9) DEFAULT 85,
  bonding_curve_progress DECIMAL(5,2) DEFAULT 0,
  migrated_at TIMESTAMPTZ,
  migration_pool_address VARCHAR(44),
  
  -- Social links
  website TEXT,
  twitter TEXT,
  telegram TEXT,
  discord TEXT,
  
  -- Launch details
  launch_tx_signature VARCHAR(88),
  initial_buy_sol DECIMAL(18,9) DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create token_parameters table (comprehensive creator settings)
CREATE TABLE IF NOT EXISTS token_parameters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id UUID REFERENCES tokens(id) ON DELETE CASCADE UNIQUE NOT NULL,
  creator_wallet VARCHAR(44) NOT NULL,
  
  -- ========== POUR RATE SETTINGS (Liquidity Addition) ==========
  pour_enabled BOOLEAN DEFAULT TRUE,
  pour_rate_percent DECIMAL(5,2) DEFAULT 50.0 
    CHECK (pour_rate_percent >= 0 AND pour_rate_percent <= 100),
  pour_interval_seconds INTEGER DEFAULT 3600 
    CHECK (pour_interval_seconds >= 300), -- Min 5 minutes
  pour_source VARCHAR(20) DEFAULT 'fees' 
    CHECK (pour_source IN ('fees', 'treasury', 'both')),
  pour_max_per_interval_sol DECIMAL(18,9) DEFAULT 1.0,
  pour_min_trigger_sol DECIMAL(18,9) DEFAULT 0.01,
  pour_last_executed_at TIMESTAMPTZ,
  pour_total_added_sol DECIMAL(18,9) DEFAULT 0,
  
  -- ========== EVAPORATION SETTINGS (Token Burning) ==========
  evaporation_enabled BOOLEAN DEFAULT FALSE,
  evaporation_rate_percent DECIMAL(5,4) DEFAULT 0 
    CHECK (evaporation_rate_percent >= 0 AND evaporation_rate_percent <= 5),
  evaporation_interval_seconds INTEGER DEFAULT 86400, -- Daily default
  evaporation_source VARCHAR(20) DEFAULT 'fees' 
    CHECK (evaporation_source IN ('fees', 'treasury', 'both')),
  evaporation_last_executed_at TIMESTAMPTZ,
  total_evaporated DECIMAL(30,9) DEFAULT 0,
  
  -- ========== FEE DISTRIBUTION ==========
  fee_to_liquidity_percent DECIMAL(5,2) DEFAULT 25.0 
    CHECK (fee_to_liquidity_percent >= 0 AND fee_to_liquidity_percent <= 100),
  fee_to_creator_percent DECIMAL(5,2) DEFAULT 75.0
    CHECK (fee_to_creator_percent >= 0 AND fee_to_creator_percent <= 100),
  
  -- ========== TIDE HARVEST (Creator Rewards) ==========
  auto_claim_enabled BOOLEAN DEFAULT TRUE,
  claim_threshold_sol DECIMAL(18,9) DEFAULT 0.01,
  claim_interval_seconds INTEGER DEFAULT 3600,
  claim_destination_wallet VARCHAR(44),
  total_claimed_sol DECIMAL(18,9) DEFAULT 0,
  pending_rewards_sol DECIMAL(18,9) DEFAULT 0,
  last_claim_at TIMESTAMPTZ,
  last_claim_signature VARCHAR(88),
  
  -- ========== TRADING CONTROLS ==========
  max_buy_percent DECIMAL(5,2) DEFAULT 100 
    CHECK (max_buy_percent > 0 AND max_buy_percent <= 100),
  max_sell_percent DECIMAL(5,2) DEFAULT 100 
    CHECK (max_sell_percent > 0 AND max_sell_percent <= 100),
  cooldown_seconds INTEGER DEFAULT 0 CHECK (cooldown_seconds >= 0),
  anti_snipe_blocks INTEGER DEFAULT 0,
  
  -- ========== ADVANCED SETTINGS ==========
  migration_target VARCHAR(20) DEFAULT 'raydium' 
    CHECK (migration_target IN ('raydium', 'meteora', 'orca', 'pumpswap')),
  post_migration_pour_enabled BOOLEAN DEFAULT TRUE,
  treasury_wallet VARCHAR(44),
  treasury_balance_sol DECIMAL(18,9) DEFAULT 0,
  
  -- ========== DEV WALLET CONTROL ==========
  dev_wallet_address VARCHAR(44),
  dev_wallet_auto_enabled BOOLEAN DEFAULT TRUE,
  dev_wallet_last_action_at TIMESTAMPTZ,
  
  -- ========== AUDIT TRAIL ==========
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES users(id),
  version INTEGER DEFAULT 1, -- For optimistic locking
  
  -- ========== CONSTRAINTS ==========
  CONSTRAINT fee_split_valid CHECK (
    fee_to_liquidity_percent + fee_to_creator_percent = 100
  )
);

-- Token parameter change history (full audit trail)
CREATE TABLE IF NOT EXISTS token_parameter_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id UUID REFERENCES tokens(id) ON DELETE CASCADE,
  changed_by UUID REFERENCES users(id),
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  field_name VARCHAR(50) NOT NULL,
  old_value TEXT,
  new_value TEXT,
  change_reason TEXT,
  ip_address INET,
  user_agent TEXT
);

-- Pour rate execution log
CREATE TABLE IF NOT EXISTS pour_rate_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id UUID REFERENCES tokens(id) ON DELETE CASCADE,
  amount_sol DECIMAL(18,9) NOT NULL,
  source VARCHAR(20) NOT NULL,
  tx_signature VARCHAR(88),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  error_message TEXT,
  executed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Evaporation (burn) log
CREATE TABLE IF NOT EXISTS evaporation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id UUID REFERENCES tokens(id) ON DELETE CASCADE,
  amount_tokens DECIMAL(30,9) NOT NULL,
  tx_signature VARCHAR(88),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  error_message TEXT,
  executed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tide harvest (rewards claim) log
CREATE TABLE IF NOT EXISTS tide_harvest_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id UUID REFERENCES tokens(id) ON DELETE CASCADE,
  creator_id UUID REFERENCES users(id),
  amount_sol DECIMAL(18,9) NOT NULL,
  destination_wallet VARCHAR(44) NOT NULL,
  tx_signature VARCHAR(88),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  error_message TEXT,
  claimed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tokens_creator ON tokens(creator_id);
CREATE INDEX IF NOT EXISTS idx_tokens_mint ON tokens(mint_address);
CREATE INDEX IF NOT EXISTS idx_tokens_stage ON tokens(stage);
CREATE INDEX IF NOT EXISTS idx_tokens_created ON tokens(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_token_params_token ON token_parameters(token_id);
CREATE INDEX IF NOT EXISTS idx_token_params_creator ON token_parameters(creator_wallet);

CREATE INDEX IF NOT EXISTS idx_param_history_token ON token_parameter_history(token_id);
CREATE INDEX IF NOT EXISTS idx_param_history_changed ON token_parameter_history(changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_pour_logs_token ON pour_rate_logs(token_id);
CREATE INDEX IF NOT EXISTS idx_evap_logs_token ON evaporation_logs(token_id);
CREATE INDEX IF NOT EXISTS idx_harvest_logs_token ON tide_harvest_logs(token_id);

-- Enable RLS
ALTER TABLE tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_parameters ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_parameter_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE pour_rate_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaporation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tide_harvest_logs ENABLE ROW LEVEL SECURITY;

-- Policies for tokens
CREATE POLICY "Anyone can read tokens" ON tokens
  FOR SELECT USING (true);

CREATE POLICY "Creators can update own tokens" ON tokens
  FOR UPDATE USING (creator_wallet = current_setting('app.current_wallet', true));

CREATE POLICY "Service can manage tokens" ON tokens
  FOR ALL USING (current_setting('app.service_role', true) = 'true');

-- Policies for token_parameters
CREATE POLICY "Anyone can read token parameters" ON token_parameters
  FOR SELECT USING (true);

CREATE POLICY "Creators can update own token parameters" ON token_parameters
  FOR UPDATE USING (creator_wallet = current_setting('app.current_wallet', true));

CREATE POLICY "Service can manage token parameters" ON token_parameters
  FOR ALL USING (current_setting('app.service_role', true) = 'true');

-- Policies for history
CREATE POLICY "Anyone can read parameter history" ON token_parameter_history
  FOR SELECT USING (true);

-- Policies for logs (read-only for users)
CREATE POLICY "Anyone can read pour logs" ON pour_rate_logs
  FOR SELECT USING (true);

CREATE POLICY "Anyone can read evaporation logs" ON evaporation_logs
  FOR SELECT USING (true);

CREATE POLICY "Anyone can read harvest logs" ON tide_harvest_logs
  FOR SELECT USING (true);

-- Triggers
CREATE TRIGGER tokens_updated_at
  BEFORE UPDATE ON tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER token_params_updated_at
  BEFORE UPDATE ON token_parameters
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger to auto-log parameter changes
CREATE OR REPLACE FUNCTION log_token_parameter_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD IS DISTINCT FROM NEW THEN
    INSERT INTO token_parameter_history (token_id, changed_by, field_name, old_value, new_value)
    SELECT NEW.token_id, NEW.updated_by, key, 
           old_row.value::text, new_row.value::text
    FROM jsonb_each(to_jsonb(OLD)) old_row
    FULL JOIN jsonb_each(to_jsonb(NEW)) new_row USING (key)
    WHERE old_row.value IS DISTINCT FROM new_row.value
    AND key NOT IN ('updated_at', 'version', 'pour_last_executed_at', 
                    'evaporation_last_executed_at', 'dev_wallet_last_action_at',
                    'pour_total_added_sol', 'total_evaporated', 'total_claimed_sol',
                    'pending_rewards_sol', 'last_claim_at', 'last_claim_signature',
                    'treasury_balance_sol');
    
    -- Increment version for optimistic locking
    NEW.version := OLD.version + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER token_params_audit
  BEFORE UPDATE ON token_parameters
  FOR EACH ROW
  EXECUTE FUNCTION log_token_parameter_change();

-- Function to create default parameters when token is created
CREATE OR REPLACE FUNCTION create_default_token_parameters()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO token_parameters (token_id, creator_wallet, dev_wallet_address)
  VALUES (NEW.id, NEW.creator_wallet, NEW.creator_wallet);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tokens_create_params
  AFTER INSERT ON tokens
  FOR EACH ROW
  EXECUTE FUNCTION create_default_token_parameters();

