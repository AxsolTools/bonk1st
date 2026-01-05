-- Create earn_activity table for tracking all Earn platform activity
-- This powers the real-time ticker and analytics on the Earn page

CREATE TABLE IF NOT EXISTS public.earn_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- User info (nullable for privacy if needed)
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  wallet_address TEXT NOT NULL,
  
  -- Activity details
  activity_type TEXT NOT NULL CHECK (activity_type IN ('deposit', 'withdraw', 'claim')),
  vault_symbol TEXT NOT NULL, -- 'jlUSDC', 'jlSOL'
  vault_address TEXT,
  asset_symbol TEXT NOT NULL, -- 'USDC', 'SOL'
  
  -- Amounts
  propel_amount DECIMAL(20, 9) DEFAULT 0, -- PROPEL tokens swapped (for swap-to-earn)
  underlying_amount DECIMAL(20, 9) NOT NULL, -- Underlying asset amount (USDC/SOL)
  shares_amount DECIMAL(20, 9) DEFAULT 0, -- Vault shares received/redeemed
  usd_value DECIMAL(20, 2) DEFAULT 0, -- USD value at time of activity
  
  -- Transaction info
  tx_signature TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Indexes for fast queries
  CONSTRAINT earn_activity_wallet_idx UNIQUE (id)
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS earn_activity_created_at_idx ON public.earn_activity(created_at DESC);
CREATE INDEX IF NOT EXISTS earn_activity_wallet_idx ON public.earn_activity(wallet_address);
CREATE INDEX IF NOT EXISTS earn_activity_type_idx ON public.earn_activity(activity_type);
CREATE INDEX IF NOT EXISTS earn_activity_vault_idx ON public.earn_activity(vault_symbol);

-- Create earn_stats table for aggregated platform metrics
-- Updated periodically or via triggers
CREATE TABLE IF NOT EXISTS public.earn_stats (
  id TEXT PRIMARY KEY DEFAULT 'global', -- Single row for global stats
  
  -- TVL metrics
  total_tvl_usd DECIMAL(20, 2) DEFAULT 0,
  tvl_usdc DECIMAL(20, 9) DEFAULT 0,
  tvl_sol DECIMAL(20, 9) DEFAULT 0,
  
  -- PROPEL metrics
  total_propel_deposited DECIMAL(20, 9) DEFAULT 0,
  total_propel_deposited_usd DECIMAL(20, 2) DEFAULT 0,
  
  -- Earnings metrics
  total_yield_earned_usd DECIMAL(20, 2) DEFAULT 0,
  total_yield_earned_usdc DECIMAL(20, 9) DEFAULT 0,
  total_yield_earned_sol DECIMAL(20, 9) DEFAULT 0,
  
  -- Position metrics
  active_positions INTEGER DEFAULT 0,
  total_unique_users INTEGER DEFAULT 0,
  
  -- Volume metrics
  volume_24h_usd DECIMAL(20, 2) DEFAULT 0,
  volume_7d_usd DECIMAL(20, 2) DEFAULT 0,
  volume_30d_usd DECIMAL(20, 2) DEFAULT 0,
  
  -- APY metrics
  avg_apy DECIMAL(10, 4) DEFAULT 0,
  
  -- Timestamps
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert initial global stats row
INSERT INTO public.earn_stats (id) VALUES ('global') ON CONFLICT (id) DO NOTHING;

-- Enable RLS
ALTER TABLE public.earn_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.earn_stats ENABLE ROW LEVEL SECURITY;

-- Allow read access to earn_activity (public for ticker)
CREATE POLICY "Allow public read access to earn_activity"
  ON public.earn_activity FOR SELECT
  USING (true);

-- Allow insert for authenticated service role
CREATE POLICY "Allow service role to insert earn_activity"
  ON public.earn_activity FOR INSERT
  WITH CHECK (true);

-- Allow read access to earn_stats (public)
CREATE POLICY "Allow public read access to earn_stats"
  ON public.earn_stats FOR SELECT
  USING (true);

-- Allow update for service role
CREATE POLICY "Allow service role to update earn_stats"
  ON public.earn_stats FOR UPDATE
  USING (true);

-- Function to update earn_stats after activity
CREATE OR REPLACE FUNCTION update_earn_stats_on_activity()
RETURNS TRIGGER AS $$
BEGIN
  -- Update stats based on activity type
  IF NEW.activity_type = 'deposit' THEN
    UPDATE public.earn_stats
    SET 
      total_tvl_usd = total_tvl_usd + COALESCE(NEW.usd_value, 0),
      total_propel_deposited = total_propel_deposited + COALESCE(NEW.propel_amount, 0),
      volume_24h_usd = volume_24h_usd + COALESCE(NEW.usd_value, 0),
      active_positions = active_positions + 1,
      last_updated = NOW()
    WHERE id = 'global';
    
    -- Update asset-specific TVL
    IF NEW.asset_symbol = 'USDC' THEN
      UPDATE public.earn_stats SET tvl_usdc = tvl_usdc + COALESCE(NEW.underlying_amount, 0) WHERE id = 'global';
    ELSIF NEW.asset_symbol = 'SOL' THEN
      UPDATE public.earn_stats SET tvl_sol = tvl_sol + COALESCE(NEW.underlying_amount, 0) WHERE id = 'global';
    END IF;
    
  ELSIF NEW.activity_type = 'withdraw' THEN
    UPDATE public.earn_stats
    SET 
      total_tvl_usd = GREATEST(0, total_tvl_usd - COALESCE(NEW.usd_value, 0)),
      volume_24h_usd = volume_24h_usd + COALESCE(NEW.usd_value, 0),
      active_positions = GREATEST(0, active_positions - 1),
      last_updated = NOW()
    WHERE id = 'global';
    
    -- Update asset-specific TVL
    IF NEW.asset_symbol = 'USDC' THEN
      UPDATE public.earn_stats SET tvl_usdc = GREATEST(0, tvl_usdc - COALESCE(NEW.underlying_amount, 0)) WHERE id = 'global';
    ELSIF NEW.asset_symbol = 'SOL' THEN
      UPDATE public.earn_stats SET tvl_sol = GREATEST(0, tvl_sol - COALESCE(NEW.underlying_amount, 0)) WHERE id = 'global';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic stats updates
DROP TRIGGER IF EXISTS earn_activity_stats_trigger ON public.earn_activity;
CREATE TRIGGER earn_activity_stats_trigger
  AFTER INSERT ON public.earn_activity
  FOR EACH ROW
  EXECUTE FUNCTION update_earn_stats_on_activity();

-- Function to reset 24h volume (call via cron job)
CREATE OR REPLACE FUNCTION reset_24h_volume()
RETURNS void AS $$
BEGIN
  UPDATE public.earn_stats
  SET volume_24h_usd = 0, last_updated = NOW()
  WHERE id = 'global';
END;
$$ LANGUAGE plpgsql;

