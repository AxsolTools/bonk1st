-- ============================================================================
-- BONK1ST Sniper - Detected Tokens Table
-- Stores tokens detected by the WebSocket sniper for persistence across refreshes
-- ============================================================================

-- Create sniper_detected_tokens table if it doesn't exist
CREATE TABLE IF NOT EXISTS sniper_detected_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Token identification
    token_mint VARCHAR(44) NOT NULL,
    token_symbol VARCHAR(20),
    token_name VARCHAR(100),
    token_logo TEXT,
    
    -- Pool information
    pool VARCHAR(20) NOT NULL, -- 'bonk-usd1', 'bonk-sol', 'pump'
    quote_mint VARCHAR(44),
    
    -- Creation details
    creation_block BIGINT NOT NULL DEFAULT 0,
    creation_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    creation_tx_signature VARCHAR(100),
    creator_wallet VARCHAR(44),
    
    -- Metrics at detection time
    initial_liquidity_usd DECIMAL(20, 6) DEFAULT 0,
    initial_market_cap DECIMAL(20, 6) DEFAULT 0,
    
    -- Social indicators
    has_website BOOLEAN DEFAULT FALSE,
    has_twitter BOOLEAN DEFAULT FALSE,
    has_telegram BOOLEAN DEFAULT FALSE,
    
    -- Filter results
    passes_filters BOOLEAN DEFAULT FALSE,
    filter_results JSONB DEFAULT '[]'::jsonb,
    
    -- Session tracking (which user detected it)
    session_id VARCHAR(100),
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Unique constraint on token_mint per session
    UNIQUE(token_mint, session_id)
);

-- Create indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_sniper_detected_tokens_session 
    ON sniper_detected_tokens(session_id);
CREATE INDEX IF NOT EXISTS idx_sniper_detected_tokens_pool 
    ON sniper_detected_tokens(pool);
CREATE INDEX IF NOT EXISTS idx_sniper_detected_tokens_created 
    ON sniper_detected_tokens(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sniper_detected_tokens_mint 
    ON sniper_detected_tokens(token_mint);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_sniper_detected_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_sniper_detected_tokens_updated_at ON sniper_detected_tokens;
CREATE TRIGGER trigger_update_sniper_detected_tokens_updated_at
    BEFORE UPDATE ON sniper_detected_tokens
    FOR EACH ROW
    EXECUTE FUNCTION update_sniper_detected_tokens_updated_at();

-- Enable RLS
ALTER TABLE sniper_detected_tokens ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own detected tokens
CREATE POLICY "Users can read own detected tokens" ON sniper_detected_tokens
    FOR SELECT USING (true);

-- Policy: Users can insert their own detected tokens
CREATE POLICY "Users can insert detected tokens" ON sniper_detected_tokens
    FOR INSERT WITH CHECK (true);

-- Policy: Users can update their own detected tokens
CREATE POLICY "Users can update own detected tokens" ON sniper_detected_tokens
    FOR UPDATE USING (true);

-- Policy: Users can delete their own detected tokens
CREATE POLICY "Users can delete own detected tokens" ON sniper_detected_tokens
    FOR DELETE USING (true);

-- Add comment
COMMENT ON TABLE sniper_detected_tokens IS 'Stores tokens detected by BONK1ST sniper WebSocket for persistence';

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';

