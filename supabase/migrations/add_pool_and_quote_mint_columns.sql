-- ============================================================================
-- Add pool_type and quote_mint columns to tokens table
-- For tracking which pool (pump/bonk/jupiter/token22) and quote currency (WSOL/USD1)
-- ============================================================================

-- Add pool_type column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tokens' AND column_name = 'pool_type'
    ) THEN
        ALTER TABLE tokens ADD COLUMN pool_type VARCHAR(20) DEFAULT NULL;
        COMMENT ON COLUMN tokens.pool_type IS 'Token creation method: pump, bonk, jupiter, token22';
    END IF;
END $$;

-- Add quote_mint column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tokens' AND column_name = 'quote_mint'
    ) THEN
        ALTER TABLE tokens ADD COLUMN quote_mint VARCHAR(44) DEFAULT NULL;
        COMMENT ON COLUMN tokens.quote_mint IS 'Quote currency mint address (WSOL or USD1)';
    END IF;
END $$;

-- Add is_platform_token column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tokens' AND column_name = 'is_platform_token'
    ) THEN
        ALTER TABLE tokens ADD COLUMN is_platform_token BOOLEAN DEFAULT FALSE;
        COMMENT ON COLUMN tokens.is_platform_token IS 'True if token was created on PROPEL/AQUA platform';
    END IF;
END $$;

-- Add dbc_pool_address column if it doesn't exist (for Jupiter DBC)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tokens' AND column_name = 'dbc_pool_address'
    ) THEN
        ALTER TABLE tokens ADD COLUMN dbc_pool_address VARCHAR(44) DEFAULT NULL;
        COMMENT ON COLUMN tokens.dbc_pool_address IS 'Jupiter DBC pool address';
    END IF;
END $$;

-- Refresh schema cache (Supabase PostgREST)
NOTIFY pgrst, 'reload schema';

