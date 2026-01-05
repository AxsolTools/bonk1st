-- ============================================================================
-- Volume Bot (HSMAC) Database Schema
-- ============================================================================
-- This migration creates all tables required for the Volume Bot functionality,
-- supporting multi-user, multi-token, multi-wallet operations with full
-- persistence and isolation between users.
-- ============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- VOLUME BOT SETTINGS
-- Stores user-level and token-level volume bot configuration
-- ============================================================================
CREATE TABLE IF NOT EXISTS volume_bot_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_mint TEXT NOT NULL,
  
  -- Strategy Selection
  -- DBPM = Dynamic Buy-Pressure Maintenance (default, aggressive buys)
  -- PLD = Predictive Liquidity-Depth counter-buy (defensive)
  -- CMWA = Concurrent Multi-Wallet Arbitrage (advanced)
  strategy TEXT NOT NULL DEFAULT 'DBPM' CHECK (strategy IN ('DBPM', 'PLD', 'CMWA')),
  
  -- Core Volume Settings
  -- Target volume per session in SOL (how much you want to pump 💰)
  target_volume_sol DECIMAL(18, 8) NOT NULL DEFAULT 1.0,
  
  -- Min/Max SOL per transaction (keeps trades looking natural)
  min_tx_sol DECIMAL(18, 8) NOT NULL DEFAULT 0.01,
  max_tx_sol DECIMAL(18, 8) NOT NULL DEFAULT 0.1,
  
  -- Interval between trades in milliseconds (faster = more aggressive)
  trade_interval_ms INTEGER NOT NULL DEFAULT 5000,
  
  -- Buy pressure percentage (higher = more buys than sells, 50 = balanced)
  buy_pressure_percent INTEGER NOT NULL DEFAULT 70 CHECK (buy_pressure_percent >= 0 AND buy_pressure_percent <= 100),
  
  -- Wallet Configuration
  -- How many wallets to use simultaneously (more = harder to track)
  active_wallet_count INTEGER NOT NULL DEFAULT 3,
  
  -- Wallet rotation mode: 'random', 'round-robin', 'weighted'
  wallet_rotation_mode TEXT NOT NULL DEFAULT 'random' CHECK (wallet_rotation_mode IN ('random', 'round-robin', 'weighted')),
  
  -- Emergency Stop Settings (CRITICAL - don't get rekt! 🚨)
  emergency_stop_enabled BOOLEAN NOT NULL DEFAULT true,
  
  -- Stop if SOL balance drops below this (per wallet)
  min_sol_balance DECIMAL(18, 8) NOT NULL DEFAULT 0.05,
  
  -- Stop if total session loss exceeds this in SOL
  max_session_loss_sol DECIMAL(18, 8) NOT NULL DEFAULT 0.5,
  
  -- Stop if price drops more than this percentage from start
  max_price_drop_percent DECIMAL(5, 2) NOT NULL DEFAULT 20.0,
  
  -- Smart Profit Settings (the alpha 🧠)
  smart_profit_enabled BOOLEAN NOT NULL DEFAULT false,
  
  -- Session ID for wallet decryption
  session_id TEXT,
  
  -- Wallet configuration
  wallet_ids TEXT[] DEFAULT '{}',
  wallet_addresses TEXT[] DEFAULT '{}',
  
  -- Position tracking
  average_entry_price DECIMAL(24, 12) DEFAULT 0,
  total_tokens_held DECIMAL(24, 8) DEFAULT 0,
  total_sol_invested DECIMAL(18, 8) DEFAULT 0,
  
  -- Take profit settings
  take_profit_enabled BOOLEAN NOT NULL DEFAULT true,
  take_profit_percent DECIMAL(5, 2) DEFAULT 50.0,
  take_profit_sell_percent DECIMAL(5, 2) DEFAULT 50.0,
  
  -- Stop loss settings
  stop_loss_enabled BOOLEAN NOT NULL DEFAULT true,
  stop_loss_percent DECIMAL(5, 2) DEFAULT 20.0,
  
  -- Trailing stop settings
  trailing_stop_enabled BOOLEAN NOT NULL DEFAULT false,
  trailing_stop_percent DECIMAL(5, 2) DEFAULT 10.0,
  trailing_stop_activation_percent DECIMAL(5, 2) DEFAULT 20.0,
  
  -- Emergency stop settings
  emergency_stop_loss_percent DECIMAL(5, 2) DEFAULT 50.0,
  
  -- Execution settings
  slippage_bps INTEGER NOT NULL DEFAULT 500,
  platform TEXT NOT NULL DEFAULT 'jupiter' CHECK (platform IN ('pumpfun', 'jupiter', 'raydium')),
  
  -- Anti-Detection Settings (stay under the radar 🥷)
  -- Add random delays between trades
  randomize_timing BOOLEAN NOT NULL DEFAULT true,
  
  -- Vary transaction amounts randomly
  randomize_amounts BOOLEAN NOT NULL DEFAULT true,
  
  -- Amount variation percentage (e.g., 20 = ±20% from target)
  amount_variance_percent INTEGER NOT NULL DEFAULT 20,
  
  -- Use Jito bundles for atomic execution
  use_jito_bundles BOOLEAN NOT NULL DEFAULT true,
  
  -- Priority fee settings
  priority_fee_mode TEXT NOT NULL DEFAULT 'medium' CHECK (priority_fee_mode IN ('low', 'medium', 'high', 'turbo')),
  
  -- Session Control
  is_active BOOLEAN NOT NULL DEFAULT false,
  auto_restart BOOLEAN NOT NULL DEFAULT false,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_executed_at TIMESTAMPTZ,
  
  -- Ensure one setting per user per token
  UNIQUE(user_id, token_mint)
);

-- ============================================================================
-- VOLUME BOT SESSIONS
-- Tracks individual bot sessions with full execution history
-- ============================================================================
CREATE TABLE IF NOT EXISTS volume_bot_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  settings_id UUID NOT NULL REFERENCES volume_bot_settings(id) ON DELETE CASCADE,
  token_mint TEXT NOT NULL,
  
  -- Session Status
  -- 'pending' = waiting to start
  -- 'running' = actively executing trades
  -- 'paused' = temporarily stopped
  -- 'stopped' = manually stopped
  -- 'completed' = finished target volume
  -- 'emergency_stopped' = stopped due to safety triggers
  -- 'error' = stopped due to error
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'running', 'paused', 'stopped', 'completed', 'emergency_stopped', 'error'
  )),
  
  -- Session Metrics
  target_volume_sol DECIMAL(18, 8) NOT NULL,
  executed_volume_sol DECIMAL(18, 8) NOT NULL DEFAULT 0,
  
  -- Trade counts
  total_trades INTEGER NOT NULL DEFAULT 0,
  successful_trades INTEGER NOT NULL DEFAULT 0,
  failed_trades INTEGER NOT NULL DEFAULT 0,
  buy_count INTEGER NOT NULL DEFAULT 0,
  sell_count INTEGER NOT NULL DEFAULT 0,
  
  -- Financial metrics (in SOL)
  total_sol_spent DECIMAL(18, 8) NOT NULL DEFAULT 0,
  total_sol_received DECIMAL(18, 8) NOT NULL DEFAULT 0,
  total_fees_paid DECIMAL(18, 8) NOT NULL DEFAULT 0,
  net_pnl_sol DECIMAL(18, 8) NOT NULL DEFAULT 0,
  
  -- Token metrics
  tokens_bought DECIMAL(24, 8) NOT NULL DEFAULT 0,
  tokens_sold DECIMAL(24, 8) NOT NULL DEFAULT 0,
  average_buy_price DECIMAL(24, 12),
  average_sell_price DECIMAL(24, 12),
  
  -- Price tracking
  start_price DECIMAL(24, 12),
  current_price DECIMAL(24, 12),
  peak_price DECIMAL(24, 12),
  lowest_price DECIMAL(24, 12),
  
  -- Emergency stop reason (if applicable)
  stop_reason TEXT,
  
  -- Error details (if applicable)
  error_message TEXT,
  error_details JSONB,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  stopped_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- VOLUME BOT EXECUTIONS
-- Individual trade executions within a session
-- ============================================================================
CREATE TABLE IF NOT EXISTS volume_bot_executions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES volume_bot_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_mint TEXT,
  
  -- Trade Details
  trade_type TEXT NOT NULL CHECK (trade_type IN ('buy', 'sell')),
  wallet_id UUID,
  wallet_address TEXT,
  
  -- Execution type (for Smart Profit tracking)
  execution_type TEXT CHECK (execution_type IN (
    'volume_bot', 'take_profit', 'stop_loss', 'trailing_stop', 'emergency_stop'
  )),
  
  -- Smart Profit specific fields
  trigger_price DECIMAL(24, 12),
  execution_price DECIMAL(24, 12),
  tokens_sold DECIMAL(24, 8),
  sol_received DECIMAL(18, 8),
  profit_percent DECIMAL(8, 4),
  signatures TEXT[],
  error TEXT,
  metadata JSONB,
  
  -- Amounts
  sol_amount DECIMAL(18, 8) NOT NULL,
  token_amount DECIMAL(24, 8),
  price_per_token DECIMAL(24, 12),
  
  -- Transaction Details
  tx_signature TEXT,
  tx_status TEXT NOT NULL DEFAULT 'pending' CHECK (tx_status IN (
    'pending', 'submitted', 'confirmed', 'finalized', 'failed', 'timeout'
  )),
  
  -- Execution method
  execution_method TEXT NOT NULL DEFAULT 'jupiter' CHECK (execution_method IN (
    'jupiter', 'pumpfun', 'raydium', 'jito_bundle'
  )),
  
  -- Jito bundle info (if applicable)
  bundle_id TEXT,
  bundle_index INTEGER,
  
  -- Fees
  priority_fee_lamports BIGINT,
  jito_tip_lamports BIGINT,
  
  -- Timing
  planned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  
  -- Error info
  error_code TEXT,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- VOLUME BOT WALLET OVERRIDES
-- Per-wallet customizations for specific tokens/sessions
-- ============================================================================
CREATE TABLE IF NOT EXISTS volume_bot_wallet_overrides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  settings_id UUID NOT NULL REFERENCES volume_bot_settings(id) ON DELETE CASCADE,
  wallet_id UUID NOT NULL,
  
  -- Override settings
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  
  -- Weight for weighted rotation (higher = more trades)
  weight INTEGER NOT NULL DEFAULT 1,
  
  -- Custom limits for this wallet
  max_sol_per_trade DECIMAL(18, 8),
  max_sol_total DECIMAL(18, 8),
  
  -- Wallet role
  role TEXT NOT NULL DEFAULT 'trader' CHECK (role IN ('trader', 'accumulator', 'seller')),
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(settings_id, wallet_id)
);

-- ============================================================================
-- VOLUME BOT RULES
-- User-defined rules for automated behavior
-- ============================================================================
CREATE TABLE IF NOT EXISTS volume_bot_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  settings_id UUID NOT NULL REFERENCES volume_bot_settings(id) ON DELETE CASCADE,
  
  -- Rule Definition
  rule_name TEXT NOT NULL,
  rule_type TEXT NOT NULL CHECK (rule_type IN (
    'price_trigger', 'volume_trigger', 'time_trigger', 'balance_trigger', 'custom'
  )),
  
  -- Condition (stored as JSON for flexibility)
  -- Example: {"operator": ">=", "value": 0.00001, "field": "price"}
  condition JSONB NOT NULL,
  
  -- Action to take when condition is met
  -- Example: {"action": "pause", "params": {}}
  action JSONB NOT NULL,
  
  -- Rule state
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  trigger_count INTEGER NOT NULL DEFAULT 0,
  
  -- Priority (higher = evaluated first)
  priority INTEGER NOT NULL DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Settings indexes
CREATE INDEX idx_vb_settings_user ON volume_bot_settings(user_id);
CREATE INDEX idx_vb_settings_token ON volume_bot_settings(token_mint);
CREATE INDEX idx_vb_settings_active ON volume_bot_settings(is_active) WHERE is_active = true;

-- Sessions indexes
CREATE INDEX idx_vb_sessions_user ON volume_bot_sessions(user_id);
CREATE INDEX idx_vb_sessions_settings ON volume_bot_sessions(settings_id);
CREATE INDEX idx_vb_sessions_status ON volume_bot_sessions(status);
CREATE INDEX idx_vb_sessions_running ON volume_bot_sessions(status) WHERE status = 'running';

-- Executions indexes
CREATE INDEX idx_vb_executions_session ON volume_bot_executions(session_id);
CREATE INDEX idx_vb_executions_user ON volume_bot_executions(user_id);
CREATE INDEX idx_vb_executions_wallet ON volume_bot_executions(wallet_id);
CREATE INDEX idx_vb_executions_status ON volume_bot_executions(tx_status);
CREATE INDEX idx_vb_executions_pending ON volume_bot_executions(tx_status) WHERE tx_status = 'pending';

-- Wallet overrides indexes
CREATE INDEX idx_vb_wallet_overrides_settings ON volume_bot_wallet_overrides(settings_id);
CREATE INDEX idx_vb_wallet_overrides_wallet ON volume_bot_wallet_overrides(wallet_id);

-- Rules indexes
CREATE INDEX idx_vb_rules_settings ON volume_bot_rules(settings_id);
CREATE INDEX idx_vb_rules_enabled ON volume_bot_rules(is_enabled) WHERE is_enabled = true;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE volume_bot_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE volume_bot_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE volume_bot_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE volume_bot_wallet_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE volume_bot_rules ENABLE ROW LEVEL SECURITY;

-- Settings policies
CREATE POLICY "Users can view own volume bot settings"
  ON volume_bot_settings FOR SELECT
  USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can create own volume bot settings"
  ON volume_bot_settings FOR INSERT
  WITH CHECK (auth.uid()::text = user_id::text);

CREATE POLICY "Users can update own volume bot settings"
  ON volume_bot_settings FOR UPDATE
  USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can delete own volume bot settings"
  ON volume_bot_settings FOR DELETE
  USING (auth.uid()::text = user_id::text);

-- Sessions policies
CREATE POLICY "Users can view own volume bot sessions"
  ON volume_bot_sessions FOR SELECT
  USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can create own volume bot sessions"
  ON volume_bot_sessions FOR INSERT
  WITH CHECK (auth.uid()::text = user_id::text);

CREATE POLICY "Users can update own volume bot sessions"
  ON volume_bot_sessions FOR UPDATE
  USING (auth.uid()::text = user_id::text);

-- Executions policies
CREATE POLICY "Users can view own volume bot executions"
  ON volume_bot_executions FOR SELECT
  USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can create own volume bot executions"
  ON volume_bot_executions FOR INSERT
  WITH CHECK (auth.uid()::text = user_id::text);

-- Wallet overrides policies
CREATE POLICY "Users can manage own wallet overrides"
  ON volume_bot_wallet_overrides FOR ALL
  USING (auth.uid()::text = user_id::text);

-- Rules policies
CREATE POLICY "Users can manage own volume bot rules"
  ON volume_bot_rules FOR ALL
  USING (auth.uid()::text = user_id::text);

-- Service role bypass for Edge Functions
CREATE POLICY "Service role full access to settings"
  ON volume_bot_settings FOR ALL
  USING (current_role = 'service_role');

CREATE POLICY "Service role full access to sessions"
  ON volume_bot_sessions FOR ALL
  USING (current_role = 'service_role');

CREATE POLICY "Service role full access to executions"
  ON volume_bot_executions FOR ALL
  USING (current_role = 'service_role');

CREATE POLICY "Service role full access to wallet overrides"
  ON volume_bot_wallet_overrides FOR ALL
  USING (current_role = 'service_role');

CREATE POLICY "Service role full access to rules"
  ON volume_bot_rules FOR ALL
  USING (current_role = 'service_role');

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_volume_bot_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER trigger_vb_settings_updated_at
  BEFORE UPDATE ON volume_bot_settings
  FOR EACH ROW EXECUTE FUNCTION update_volume_bot_updated_at();

CREATE TRIGGER trigger_vb_sessions_updated_at
  BEFORE UPDATE ON volume_bot_sessions
  FOR EACH ROW EXECUTE FUNCTION update_volume_bot_updated_at();

CREATE TRIGGER trigger_vb_wallet_overrides_updated_at
  BEFORE UPDATE ON volume_bot_wallet_overrides
  FOR EACH ROW EXECUTE FUNCTION update_volume_bot_updated_at();

CREATE TRIGGER trigger_vb_rules_updated_at
  BEFORE UPDATE ON volume_bot_rules
  FOR EACH ROW EXECUTE FUNCTION update_volume_bot_updated_at();

-- ============================================================================
-- TABLE COMMENTS
-- ============================================================================

COMMENT ON TABLE volume_bot_settings IS 
'Volume Bot Settings - Configuration for automated volume generation';

COMMENT ON TABLE volume_bot_sessions IS 
'Volume Bot Sessions - Track session execution history and metrics';

COMMENT ON TABLE volume_bot_executions IS 
'Volume Bot Executions - Individual trade records and Smart Profit executions';

COMMENT ON TABLE volume_bot_wallet_overrides IS 
'Wallet Overrides - Per-wallet customizations for specific tokens/sessions';

COMMENT ON TABLE volume_bot_rules IS 
'Bot Rules - Automated triggers based on price, volume, or time conditions';

COMMENT ON COLUMN volume_bot_settings.strategy IS 
'DBPM = Dynamic Buy-Pressure Maintenance, PLD = Predictive Liquidity-Depth, CMWA = Concurrent Multi-Wallet Arbitrage';

COMMENT ON COLUMN volume_bot_settings.buy_pressure_percent IS 
'Buy pressure percentage: Higher = more buys than sells, 50 = balanced';

COMMENT ON COLUMN volume_bot_settings.emergency_stop_enabled IS 
'Emergency stop protection - stops bot if critical thresholds are exceeded';

COMMENT ON COLUMN volume_bot_settings.smart_profit_enabled IS 
'Enable automated profit-taking and loss prevention';
