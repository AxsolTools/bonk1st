-- AQUA Launchpad - Metrics Performance Indices
-- Optimizes queries for real-time metrics with 100+ simultaneous users

-- Index for active tokens (bonding curve or migrated)
CREATE INDEX IF NOT EXISTS idx_tokens_active_stage 
ON tokens(mint_address) 
WHERE stage IN ('bonding', 'migrated');

-- Index for recent liquidity history queries
CREATE INDEX IF NOT EXISTS idx_liquidity_history_recent 
ON liquidity_history(token_id, timestamp DESC);

-- Index for liquidity history by source (pour operations)
CREATE INDEX IF NOT EXISTS idx_liquidity_history_source 
ON liquidity_history(token_id, source) 
WHERE source = 'pour';

-- Index for trades by token (real-time feed)
CREATE INDEX IF NOT EXISTS idx_trades_token_recent 
ON trades(token_id, created_at DESC);

-- Index for pour rate logs by token (uses executed_at)
CREATE INDEX IF NOT EXISTS idx_pour_rate_logs_token 
ON pour_rate_logs(token_id, executed_at DESC);

-- Index for tide harvests by token
CREATE INDEX IF NOT EXISTS idx_tide_harvests_token 
ON tide_harvests(token_id);

-- Index for token parameters lookup
CREATE INDEX IF NOT EXISTS idx_token_parameters_token 
ON token_parameters(token_id);

-- Index for chat messages by token (real-time chat)
CREATE INDEX IF NOT EXISTS idx_token_chat_recent 
ON token_chat(token_id, created_at DESC);

-- Index for comments by token
CREATE INDEX IF NOT EXISTS idx_token_comments_recent 
ON token_comments(token_id, created_at DESC);

-- Index for price history queries
CREATE INDEX IF NOT EXISTS idx_price_history_recent 
ON price_history(token_id, timestamp DESC);

-- Composite index for token metrics queries
CREATE INDEX IF NOT EXISTS idx_tokens_metrics 
ON tokens(id, mint_address, water_level, constellation_strength);

-- Index for wallets by session (user lookup)
CREATE INDEX IF NOT EXISTS idx_wallets_session 
ON wallets(session_id) 
WHERE is_primary = true;

-- Index for tokens by creator (dashboard)
CREATE INDEX IF NOT EXISTS idx_tokens_creator 
ON tokens(creator_wallet);

-- Index for referral earnings (by referrer for claim queries)
CREATE INDEX IF NOT EXISTS idx_referral_earnings_referrer_recent 
ON referral_earnings(referrer_id, created_at DESC);

-- Analyze tables to update query planner statistics
ANALYZE tokens;
ANALYZE trades;
ANALYZE liquidity_history;
ANALYZE pour_rate_logs;
ANALYZE tide_harvests;
ANALYZE token_chat;
ANALYZE token_comments;
ANALYZE wallets;

-- Log completion
DO $$
BEGIN
  RAISE NOTICE '[MIGRATION] Metrics indices created successfully';
END $$;

