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

