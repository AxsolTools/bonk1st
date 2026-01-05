-- ============================================================================
-- AQUA Launchpad - Users Table Migration
-- Creates the users table for wallet-based authentication
-- ============================================================================

-- Create users table (main account linked to primary wallet)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  main_wallet_address VARCHAR(44) UNIQUE NOT NULL,
  username VARCHAR(50),
  avatar_url TEXT,
  email VARCHAR(255),
  is_verified BOOLEAN DEFAULT FALSE,
  total_transactions INTEGER DEFAULT 0,
  total_volume_sol DECIMAL(18,9) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_main_wallet ON users(main_wallet_address);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can read all profiles" ON users
  FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (main_wallet_address = current_setting('app.current_wallet', true));

CREATE POLICY "Allow user creation" ON users
  FOR INSERT WITH CHECK (true);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

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

-- ============================================================================
-- AQUA Launchpad - Chat & Comments Migration
-- Real-time chat and persistent comments per token
-- ============================================================================

-- ========== TOKEN CHAT (Real-time, Global, Persistent) ==========
CREATE TABLE IF NOT EXISTS token_chat (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id UUID REFERENCES tokens(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  wallet_address VARCHAR(44) NOT NULL,
  
  -- Message content
  message TEXT NOT NULL CHECK (char_length(message) <= 500),
  
  -- Metadata
  username VARCHAR(50),
  avatar_url TEXT,
  
  -- Moderation
  is_hidden BOOLEAN DEFAULT FALSE,
  hidden_by UUID REFERENCES users(id),
  hidden_at TIMESTAMPTZ,
  hidden_reason TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== TOKEN COMMENTS (Persistent, Threaded) ==========
CREATE TABLE IF NOT EXISTS token_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id UUID REFERENCES tokens(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  wallet_address VARCHAR(44) NOT NULL,
  parent_id UUID REFERENCES token_comments(id) ON DELETE CASCADE, -- For replies
  
  -- Comment content
  content TEXT NOT NULL CHECK (char_length(content) <= 2000),
  
  -- Metadata
  username VARCHAR(50),
  avatar_url TEXT,
  
  -- Engagement
  likes_count INTEGER DEFAULT 0,
  replies_count INTEGER DEFAULT 0,
  
  -- Edit history
  is_edited BOOLEAN DEFAULT FALSE,
  edited_at TIMESTAMPTZ,
  original_content TEXT,
  
  -- Moderation
  is_hidden BOOLEAN DEFAULT FALSE,
  hidden_by UUID REFERENCES users(id),
  hidden_at TIMESTAMPTZ,
  hidden_reason TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== COMMENT LIKES ==========
CREATE TABLE IF NOT EXISTS comment_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID REFERENCES token_comments(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  wallet_address VARCHAR(44) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Prevent duplicate likes
  CONSTRAINT unique_comment_like UNIQUE (comment_id, wallet_address)
);

-- ========== CHAT STATISTICS (Aggregated) ==========
CREATE TABLE IF NOT EXISTS token_chat_stats (
  token_id UUID PRIMARY KEY REFERENCES tokens(id) ON DELETE CASCADE,
  total_messages INTEGER DEFAULT 0,
  total_comments INTEGER DEFAULT 0,
  total_likes INTEGER DEFAULT 0,
  unique_chatters INTEGER DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  last_comment_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_chat_token ON token_chat(token_id);
CREATE INDEX IF NOT EXISTS idx_chat_created ON token_chat(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_wallet ON token_chat(wallet_address);
CREATE INDEX IF NOT EXISTS idx_chat_not_hidden ON token_chat(token_id, created_at DESC) WHERE is_hidden = FALSE;

CREATE INDEX IF NOT EXISTS idx_comments_token ON token_comments(token_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON token_comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_comments_created ON token_comments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_not_hidden ON token_comments(token_id, created_at DESC) WHERE is_hidden = FALSE;

CREATE INDEX IF NOT EXISTS idx_likes_comment ON comment_likes(comment_id);
CREATE INDEX IF NOT EXISTS idx_likes_user ON comment_likes(user_id);

-- Enable RLS
ALTER TABLE token_chat ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_chat_stats ENABLE ROW LEVEL SECURITY;

-- ========== POLICIES FOR CHAT ==========
-- Anyone can read non-hidden chat messages
CREATE POLICY "Anyone can read chat" ON token_chat
  FOR SELECT USING (is_hidden = FALSE);

-- Authenticated users can insert chat messages
CREATE POLICY "Users can post chat" ON token_chat
  FOR INSERT WITH CHECK (
    wallet_address = current_setting('app.current_wallet', true)
  );

-- Token creators can hide messages on their token
CREATE POLICY "Creators can moderate chat" ON token_chat
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM tokens 
      WHERE tokens.id = token_chat.token_id 
      AND tokens.creator_wallet = current_setting('app.current_wallet', true)
    )
  );

-- ========== POLICIES FOR COMMENTS ==========
-- Anyone can read non-hidden comments
CREATE POLICY "Anyone can read comments" ON token_comments
  FOR SELECT USING (is_hidden = FALSE);

-- Authenticated users can post comments
CREATE POLICY "Users can post comments" ON token_comments
  FOR INSERT WITH CHECK (
    wallet_address = current_setting('app.current_wallet', true)
  );

-- Users can edit their own comments
CREATE POLICY "Users can edit own comments" ON token_comments
  FOR UPDATE USING (
    wallet_address = current_setting('app.current_wallet', true)
  );

-- Token creators can moderate comments
CREATE POLICY "Creators can moderate comments" ON token_comments
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM tokens 
      WHERE tokens.id = token_comments.token_id 
      AND tokens.creator_wallet = current_setting('app.current_wallet', true)
    )
  );

-- ========== POLICIES FOR LIKES ==========
CREATE POLICY "Anyone can read likes" ON comment_likes
  FOR SELECT USING (true);

CREATE POLICY "Users can like comments" ON comment_likes
  FOR INSERT WITH CHECK (
    wallet_address = current_setting('app.current_wallet', true)
  );

CREATE POLICY "Users can unlike their likes" ON comment_likes
  FOR DELETE USING (
    wallet_address = current_setting('app.current_wallet', true)
  );

-- ========== POLICIES FOR STATS ==========
CREATE POLICY "Anyone can read chat stats" ON token_chat_stats
  FOR SELECT USING (true);

-- ========== TRIGGERS ==========

-- Update comment reply count when reply is added
CREATE OR REPLACE FUNCTION update_comment_replies_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.parent_id IS NOT NULL THEN
    UPDATE token_comments SET replies_count = replies_count + 1 WHERE id = NEW.parent_id;
  ELSIF TG_OP = 'DELETE' AND OLD.parent_id IS NOT NULL THEN
    UPDATE token_comments SET replies_count = replies_count - 1 WHERE id = OLD.parent_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER comment_replies_count
  AFTER INSERT OR DELETE ON token_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_comment_replies_count();

-- Update comment likes count
CREATE OR REPLACE FUNCTION update_comment_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE token_comments SET likes_count = likes_count + 1 WHERE id = NEW.comment_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE token_comments SET likes_count = likes_count - 1 WHERE id = OLD.comment_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER comment_likes_count
  AFTER INSERT OR DELETE ON comment_likes
  FOR EACH ROW
  EXECUTE FUNCTION update_comment_likes_count();

-- Update token chat stats
CREATE OR REPLACE FUNCTION update_token_chat_stats()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO token_chat_stats (token_id, total_messages, last_message_at)
  VALUES (NEW.token_id, 1, NOW())
  ON CONFLICT (token_id) DO UPDATE SET
    total_messages = token_chat_stats.total_messages + 1,
    last_message_at = NOW(),
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER chat_stats_update
  AFTER INSERT ON token_chat
  FOR EACH ROW
  EXECUTE FUNCTION update_token_chat_stats();

-- Update token comment stats
CREATE OR REPLACE FUNCTION update_token_comment_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO token_chat_stats (token_id, total_comments, last_comment_at)
    VALUES (NEW.token_id, 1, NOW())
    ON CONFLICT (token_id) DO UPDATE SET
      total_comments = token_chat_stats.total_comments + 1,
      last_comment_at = NOW(),
      updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER comment_stats_update
  AFTER INSERT ON token_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_token_comment_stats();

-- Trigger for updated_at on comments
CREATE TRIGGER comments_updated_at
  BEFORE UPDATE ON token_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ========== ENABLE REALTIME ==========
-- These need to be run separately in Supabase dashboard or via CLI
-- ALTER PUBLICATION supabase_realtime ADD TABLE token_chat;
-- ALTER PUBLICATION supabase_realtime ADD TABLE token_comments;
-- ALTER PUBLICATION supabase_realtime ADD TABLE comment_likes;

-- ============================================================================
-- AQUA Launchpad - Trades & Price History Migration
-- Comprehensive trade tracking and price history for charts
-- ============================================================================

-- ========== TRADES TABLE ==========
CREATE TABLE IF NOT EXISTS trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id UUID REFERENCES tokens(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  wallet_address VARCHAR(44) NOT NULL,
  
  -- Trade details
  trade_type VARCHAR(10) NOT NULL CHECK (trade_type IN ('buy', 'sell')),
  
  -- Amounts (using DECIMAL for precision)
  amount_tokens DECIMAL(30,9) NOT NULL,
  amount_sol DECIMAL(18,9) NOT NULL,
  amount_usd DECIMAL(18,6),
  price_per_token_sol DECIMAL(18,12) NOT NULL,
  price_per_token_usd DECIMAL(18,12),
  
  -- Fees
  platform_fee_lamports BIGINT DEFAULT 0,
  network_fee_lamports BIGINT DEFAULT 0,
  slippage_percent DECIMAL(5,2),
  
  -- Transaction
  tx_signature VARCHAR(88) UNIQUE NOT NULL,
  block_time TIMESTAMPTZ,
  slot BIGINT,
  
  -- Status
  status VARCHAR(20) DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed', 'failed')),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== PRICE HISTORY (For Charts) ==========
CREATE TABLE IF NOT EXISTS price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id UUID REFERENCES tokens(id) ON DELETE CASCADE,
  
  -- OHLCV data
  timestamp TIMESTAMPTZ NOT NULL,
  timeframe VARCHAR(10) NOT NULL CHECK (timeframe IN ('1m', '5m', '15m', '1h', '4h', '1d')),
  
  open_sol DECIMAL(18,12) NOT NULL,
  high_sol DECIMAL(18,12) NOT NULL,
  low_sol DECIMAL(18,12) NOT NULL,
  close_sol DECIMAL(18,12) NOT NULL,
  
  open_usd DECIMAL(18,12),
  high_usd DECIMAL(18,12),
  low_usd DECIMAL(18,12),
  close_usd DECIMAL(18,12),
  
  volume_sol DECIMAL(18,9) DEFAULT 0,
  volume_usd DECIMAL(18,6) DEFAULT 0,
  volume_tokens DECIMAL(30,9) DEFAULT 0,
  
  trade_count INTEGER DEFAULT 0,
  
  -- Unique per token/timeframe/timestamp
  CONSTRAINT unique_price_point UNIQUE (token_id, timeframe, timestamp)
);

-- ========== LIQUIDITY HISTORY ==========
CREATE TABLE IF NOT EXISTS liquidity_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id UUID REFERENCES tokens(id) ON DELETE CASCADE,
  
  timestamp TIMESTAMPTZ NOT NULL,
  liquidity_sol DECIMAL(18,9) NOT NULL,
  liquidity_usd DECIMAL(18,6),
  water_level DECIMAL(8,4),
  
  -- Source of liquidity change
  source VARCHAR(20) CHECK (source IN ('pour', 'trade', 'migration', 'manual')),
  change_amount_sol DECIMAL(18,9),
  tx_signature VARCHAR(88),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== HOLDER SNAPSHOTS ==========
CREATE TABLE IF NOT EXISTS holder_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id UUID REFERENCES tokens(id) ON DELETE CASCADE,
  
  timestamp TIMESTAMPTZ NOT NULL,
  holder_count INTEGER NOT NULL,
  
  -- Top holders breakdown
  top_10_percent DECIMAL(5,2),
  top_50_percent DECIMAL(5,2),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_trades_token ON trades(token_id);
CREATE INDEX IF NOT EXISTS idx_trades_wallet ON trades(wallet_address);
CREATE INDEX IF NOT EXISTS idx_trades_created ON trades(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_type ON trades(trade_type);
CREATE INDEX IF NOT EXISTS idx_trades_signature ON trades(tx_signature);

CREATE INDEX IF NOT EXISTS idx_price_history_token_tf ON price_history(token_id, timeframe);
CREATE INDEX IF NOT EXISTS idx_price_history_time ON price_history(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_price_history_lookup ON price_history(token_id, timeframe, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_liquidity_history_token ON liquidity_history(token_id);
CREATE INDEX IF NOT EXISTS idx_liquidity_history_time ON liquidity_history(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_holder_snapshots_token ON holder_snapshots(token_id);

-- Enable RLS
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE liquidity_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE holder_snapshots ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Anyone can read trades" ON trades
  FOR SELECT USING (true);

CREATE POLICY "Service can insert trades" ON trades
  FOR INSERT WITH CHECK (current_setting('app.service_role', true) = 'true');

CREATE POLICY "Anyone can read price history" ON price_history
  FOR SELECT USING (true);

CREATE POLICY "Service can manage price history" ON price_history
  FOR ALL USING (current_setting('app.service_role', true) = 'true');

CREATE POLICY "Anyone can read liquidity history" ON liquidity_history
  FOR SELECT USING (true);

CREATE POLICY "Anyone can read holder snapshots" ON holder_snapshots
  FOR SELECT USING (true);

-- ========== FUNCTION: Aggregate price history from trades ==========
CREATE OR REPLACE FUNCTION aggregate_price_candle(
  p_token_id UUID,
  p_timeframe VARCHAR(10),
  p_timestamp TIMESTAMPTZ
)
RETURNS VOID AS $$
DECLARE
  v_interval INTERVAL;
  v_start TIMESTAMPTZ;
  v_end TIMESTAMPTZ;
  v_ohlcv RECORD;
BEGIN
  -- Determine interval based on timeframe
  v_interval := CASE p_timeframe
    WHEN '1m' THEN INTERVAL '1 minute'
    WHEN '5m' THEN INTERVAL '5 minutes'
    WHEN '15m' THEN INTERVAL '15 minutes'
    WHEN '1h' THEN INTERVAL '1 hour'
    WHEN '4h' THEN INTERVAL '4 hours'
    WHEN '1d' THEN INTERVAL '1 day'
    ELSE INTERVAL '1 hour'
  END;
  
  -- Calculate period boundaries
  v_start := date_trunc('minute', p_timestamp);
  v_end := v_start + v_interval;
  
  -- Aggregate trades into OHLCV
  SELECT
    MIN(price_per_token_sol) FILTER (WHERE created_at = (SELECT MIN(created_at) FROM trades WHERE token_id = p_token_id AND created_at >= v_start AND created_at < v_end)) as open_sol,
    MAX(price_per_token_sol) as high_sol,
    MIN(price_per_token_sol) as low_sol,
    MIN(price_per_token_sol) FILTER (WHERE created_at = (SELECT MAX(created_at) FROM trades WHERE token_id = p_token_id AND created_at >= v_start AND created_at < v_end)) as close_sol,
    SUM(amount_sol) as volume_sol,
    SUM(amount_tokens) as volume_tokens,
    COUNT(*) as trade_count
  INTO v_ohlcv
  FROM trades
  WHERE token_id = p_token_id
    AND created_at >= v_start
    AND created_at < v_end
    AND status = 'confirmed';
  
  -- Insert or update price history
  IF v_ohlcv.trade_count > 0 THEN
    INSERT INTO price_history (
      token_id, timeframe, timestamp,
      open_sol, high_sol, low_sol, close_sol,
      volume_sol, volume_tokens, trade_count
    ) VALUES (
      p_token_id, p_timeframe, v_start,
      v_ohlcv.open_sol, v_ohlcv.high_sol, v_ohlcv.low_sol, v_ohlcv.close_sol,
      v_ohlcv.volume_sol, v_ohlcv.volume_tokens, v_ohlcv.trade_count
    )
    ON CONFLICT (token_id, timeframe, timestamp) DO UPDATE SET
      high_sol = GREATEST(price_history.high_sol, EXCLUDED.high_sol),
      low_sol = LEAST(price_history.low_sol, EXCLUDED.low_sol),
      close_sol = EXCLUDED.close_sol,
      volume_sol = EXCLUDED.volume_sol,
      volume_tokens = EXCLUDED.volume_tokens,
      trade_count = EXCLUDED.trade_count;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ========== TRIGGER: Update token stats on trade ==========
CREATE OR REPLACE FUNCTION update_token_on_trade()
RETURNS TRIGGER AS $$
BEGIN
  -- Update token price and volume
  UPDATE tokens SET
    price_sol = NEW.price_per_token_sol,
    price_usd = NEW.price_per_token_usd,
    volume_24h = (
      SELECT COALESCE(SUM(amount_sol), 0)
      FROM trades
      WHERE token_id = NEW.token_id
        AND created_at > NOW() - INTERVAL '24 hours'
        AND status = 'confirmed'
    ),
    updated_at = NOW()
  WHERE id = NEW.token_id;
  
  -- Aggregate 1-minute candle
  PERFORM aggregate_price_candle(NEW.token_id, '1m', NEW.created_at);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trade_update_token
  AFTER INSERT ON trades
  FOR EACH ROW
  WHEN (NEW.status = 'confirmed')
  EXECUTE FUNCTION update_token_on_trade();

-- ============================================================================
-- AQUA Launchpad - Helper Functions and Cron Jobs
-- ============================================================================

-- Function to increment referral count atomically
CREATE OR REPLACE FUNCTION increment_referral_count(referrer_user_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE referrals 
  SET referral_count = referral_count + 1,
      updated_at = NOW()
  WHERE user_id = referrer_user_id;
END;
$$ LANGUAGE plpgsql;

-- Function to create system_config table if not exists (for fallback encryption salt)
CREATE OR REPLACE FUNCTION create_system_config_if_not_exists()
RETURNS VOID AS $$
BEGIN
  CREATE TABLE IF NOT EXISTS system_config (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
END;
$$ LANGUAGE plpgsql;

-- Function to get aggregated token stats
CREATE OR REPLACE FUNCTION get_token_stats(token_mint VARCHAR(44))
RETURNS TABLE (
  total_volume_sol DECIMAL,
  total_trades BIGINT,
  unique_traders BIGINT,
  avg_trade_size_sol DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(amount_sol), 0) as total_volume_sol,
    COUNT(*) as total_trades,
    COUNT(DISTINCT wallet_address) as unique_traders,
    COALESCE(AVG(amount_sol), 0) as avg_trade_size_sol
  FROM trades t
  JOIN tokens tok ON t.token_id = tok.id
  WHERE tok.mint_address = token_mint
  AND t.status = 'confirmed';
END;
$$ LANGUAGE plpgsql;

-- Function to get leaderboard
CREATE OR REPLACE FUNCTION get_referral_leaderboard(limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
  user_id UUID,
  referral_code VARCHAR(8),
  referral_count INTEGER,
  total_earnings DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.user_id,
    r.referral_code,
    r.referral_count,
    r.total_earnings
  FROM referrals r
  WHERE r.referral_count > 0
  ORDER BY r.total_earnings DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- CRON JOBS (requires pg_cron extension)
-- Run these manually in Supabase SQL editor after enabling pg_cron
-- ============================================================================

-- Enable pg_cron (run once as superuser)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule pour rate engine to run every 5 minutes
-- SELECT cron.schedule(
--   'pour-rate-engine',
--   '*/5 * * * *',
--   $$
--   SELECT net.http_post(
--     url := 'YOUR_SUPABASE_EDGE_FUNCTION_URL/pour-rate-engine',
--     headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
--     body := '{}'::jsonb
--   ) AS request_id;
--   $$
-- );

-- Schedule price aggregation every minute
-- SELECT cron.schedule(
--   'price-aggregator',
--   '* * * * *',
--   $$
--   -- Update token USD prices based on SOL price
--   UPDATE tokens t
--   SET 
--     price_usd = t.price_sol * (
--       SELECT AVG(close_usd / close_sol) 
--       FROM price_history 
--       WHERE timeframe = '1m' 
--       AND timestamp > NOW() - INTERVAL '5 minutes'
--     ),
--     updated_at = NOW()
--   WHERE t.price_sol > 0;
--   $$
-- );

-- Schedule 24h volume calculation every hour
-- SELECT cron.schedule(
--   'volume-calculator',
--   '0 * * * *',
--   $$
--   UPDATE tokens t
--   SET 
--     volume_24h = COALESCE((
--       SELECT SUM(amount_sol)
--       FROM trades
--       WHERE token_id = t.id
--       AND created_at > NOW() - INTERVAL '24 hours'
--       AND status = 'confirmed'
--     ), 0),
--     updated_at = NOW();
--   $$
-- );

-- Schedule holder count update every hour
-- SELECT cron.schedule(
--   'holder-counter',
--   '30 * * * *',
--   $$
--   -- This would ideally query on-chain data via Helius
--   -- For now, approximate from trade data
--   UPDATE tokens t
--   SET 
--     holders = COALESCE((
--       SELECT COUNT(DISTINCT wallet_address)
--       FROM trades
--       WHERE token_id = t.id
--       AND trade_type = 'buy'
--       AND status = 'confirmed'
--     ), 0),
--     updated_at = NOW();
--   $$
-- );

-- ============================================================================
-- REALTIME SUBSCRIPTIONS
-- Run these manually in Supabase dashboard
-- ============================================================================

-- Enable realtime for chat
-- ALTER PUBLICATION supabase_realtime ADD TABLE token_chat;

-- Enable realtime for comments
-- ALTER PUBLICATION supabase_realtime ADD TABLE token_comments;

-- Enable realtime for token updates
-- ALTER PUBLICATION supabase_realtime ADD TABLE tokens;

-- Enable realtime for trades
-- ALTER PUBLICATION supabase_realtime ADD TABLE trades;

-- Enable realtime for price history
-- ALTER PUBLICATION supabase_realtime ADD TABLE price_history;

