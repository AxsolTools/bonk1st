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

