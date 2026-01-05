-- ============================================================================
-- AQUA Launchpad - Anti-Sniper Tables
-- Run this migration to add anti-sniper monitoring functionality
-- ============================================================================

-- Anti-Sniper Monitors Table
-- Stores active monitoring sessions for newly launched tokens
CREATE TABLE IF NOT EXISTS anti_sniper_monitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_mint VARCHAR(64) NOT NULL,
  session_id VARCHAR(255) NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  launch_slot BIGINT NOT NULL,
  user_wallets TEXT[] DEFAULT '{}',
  total_supply NUMERIC(30, 10) NOT NULL,
  decimals INTEGER NOT NULL DEFAULT 6,
  status VARCHAR(32) NOT NULL DEFAULT 'active', -- active, triggered, expired, error
  triggered BOOLEAN NOT NULL DEFAULT FALSE,
  trigger_trade JSONB,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  triggered_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_anti_sniper_monitors_token ON anti_sniper_monitors(token_mint);
CREATE INDEX IF NOT EXISTS idx_anti_sniper_monitors_session ON anti_sniper_monitors(session_id);
CREATE INDEX IF NOT EXISTS idx_anti_sniper_monitors_status ON anti_sniper_monitors(status);
CREATE INDEX IF NOT EXISTS idx_anti_sniper_monitors_active ON anti_sniper_monitors(token_mint, status) 
  WHERE status = 'active';

-- Anti-Sniper Events Table
-- Logs all anti-sniper trigger events and sell executions
CREATE TABLE IF NOT EXISTS anti_sniper_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_mint VARCHAR(64) NOT NULL,
  session_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(32) NOT NULL, -- sniper_detected, take_profit, manual
  trigger_trade JSONB, -- Details of the trade that triggered the event
  wallets_sold TEXT[] DEFAULT '{}',
  total_tokens_sold NUMERIC(30, 10) DEFAULT 0,
  total_sol_received NUMERIC(20, 9) DEFAULT 0,
  results JSONB, -- Array of per-wallet results
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for event lookups
CREATE INDEX IF NOT EXISTS idx_anti_sniper_events_token ON anti_sniper_events(token_mint);
CREATE INDEX IF NOT EXISTS idx_anti_sniper_events_session ON anti_sniper_events(session_id);
CREATE INDEX IF NOT EXISTS idx_anti_sniper_events_created ON anti_sniper_events(created_at DESC);

-- Add metadata column to trades table if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'trades' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE trades ADD COLUMN metadata JSONB;
  END IF;
END $$;

-- Add source column to trades table if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'trades' AND column_name = 'source'
  ) THEN
    ALTER TABLE trades ADD COLUMN source VARCHAR(32) DEFAULT 'manual';
  END IF;
END $$;

-- Updated at trigger for anti_sniper_monitors
CREATE OR REPLACE FUNCTION update_anti_sniper_monitors_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_anti_sniper_monitors_updated_at ON anti_sniper_monitors;
CREATE TRIGGER trigger_anti_sniper_monitors_updated_at
  BEFORE UPDATE ON anti_sniper_monitors
  FOR EACH ROW
  EXECUTE FUNCTION update_anti_sniper_monitors_updated_at();

-- Enable RLS
ALTER TABLE anti_sniper_monitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE anti_sniper_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for anti_sniper_monitors
CREATE POLICY "Users can view their own monitors"
  ON anti_sniper_monitors FOR SELECT
  USING (session_id = current_setting('app.session_id', true));

CREATE POLICY "Service role can manage all monitors"
  ON anti_sniper_monitors FOR ALL
  USING (auth.role() = 'service_role');

-- RLS Policies for anti_sniper_events  
CREATE POLICY "Users can view their own events"
  ON anti_sniper_events FOR SELECT
  USING (session_id = current_setting('app.session_id', true));

CREATE POLICY "Service role can manage all events"
  ON anti_sniper_events FOR ALL
  USING (auth.role() = 'service_role');

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON anti_sniper_monitors TO authenticated;
GRANT SELECT, INSERT ON anti_sniper_events TO authenticated;
GRANT ALL ON anti_sniper_monitors TO service_role;
GRANT ALL ON anti_sniper_events TO service_role;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE anti_sniper_monitors IS 'Active anti-sniper monitoring sessions for token launches';
COMMENT ON TABLE anti_sniper_events IS 'Log of anti-sniper trigger events and auto-sell executions';

COMMENT ON COLUMN anti_sniper_monitors.config IS 'JSON config: enabled, thresholds, wallets, etc.';
COMMENT ON COLUMN anti_sniper_monitors.user_wallets IS 'Addresses to ignore (user own wallets)';
COMMENT ON COLUMN anti_sniper_monitors.launch_slot IS 'Solana slot when token was launched';
COMMENT ON COLUMN anti_sniper_monitors.trigger_trade IS 'Details of sniper trade that triggered protection';

COMMENT ON COLUMN anti_sniper_events.event_type IS 'sniper_detected, take_profit, or manual';
COMMENT ON COLUMN anti_sniper_events.trigger_trade IS 'The external trade that triggered the auto-sell';
COMMENT ON COLUMN anti_sniper_events.results IS 'Per-wallet sell results with signatures';

