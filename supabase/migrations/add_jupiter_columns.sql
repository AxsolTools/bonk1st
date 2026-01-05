-- Add Jupiter DBC pool columns and platform tracking to tokens table
-- Run this in Supabase SQL Editor

-- Add pool_type column to identify token creation method
ALTER TABLE tokens 
ADD COLUMN IF NOT EXISTS pool_type TEXT DEFAULT NULL;

-- Add dbc_pool_address for Jupiter DBC tokens
ALTER TABLE tokens 
ADD COLUMN IF NOT EXISTS dbc_pool_address TEXT DEFAULT NULL;

-- Add is_platform_token to explicitly mark tokens created on our platform
-- This is the definitive marker - if true, token was created on PROPEL
ALTER TABLE tokens 
ADD COLUMN IF NOT EXISTS is_platform_token BOOLEAN DEFAULT FALSE;

-- Add index for faster pool_type queries
CREATE INDEX IF NOT EXISTS idx_tokens_pool_type ON tokens(pool_type);

-- Add index for dbc_pool_address lookups
CREATE INDEX IF NOT EXISTS idx_tokens_dbc_pool_address ON tokens(dbc_pool_address);

-- Add index for platform token queries
CREATE INDEX IF NOT EXISTS idx_tokens_is_platform_token ON tokens(is_platform_token);

-- Update existing tokens that were created on our platform (have creator_id)
UPDATE tokens 
SET is_platform_token = TRUE,
    pool_type = COALESCE(pool_type, 'pump')
WHERE creator_id IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN tokens.pool_type IS 'Token creation method: pump, jupiter, token22, bonk';
COMMENT ON COLUMN tokens.dbc_pool_address IS 'Jupiter Dynamic Bonding Curve pool address';
COMMENT ON COLUMN tokens.is_platform_token IS 'True if token was created on PROPEL platform';

