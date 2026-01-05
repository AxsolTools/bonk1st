-- ============================================================================
-- AQUA Launchpad - Fix Wallets Table
-- Adds missing columns to match API requirements
-- ============================================================================

-- Add missing columns if they don't exist
DO $$ 
BEGIN
    -- Add user_id column if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'wallets' AND column_name = 'user_id') THEN
        ALTER TABLE wallets ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Ensure all required columns exist with correct types
ALTER TABLE wallets 
    ALTER COLUMN encrypted_private_key TYPE TEXT,
    ALTER COLUMN public_key TYPE VARCHAR(44);

-- Create system_config table for fallback encryption salt
CREATE TABLE IF NOT EXISTS system_config (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on system_config
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

-- Only service role can access system_config
CREATE POLICY "Service role access only" ON system_config
    FOR ALL USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

-- Update wallets RLS policies
DROP POLICY IF EXISTS "Allow wallet creation" ON wallets;
DROP POLICY IF EXISTS "Allow reading own wallets" ON wallets;
DROP POLICY IF EXISTS "Allow updating own wallets" ON wallets;

CREATE POLICY "Allow wallet creation" ON wallets
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow reading own wallets" ON wallets
    FOR SELECT USING (true);

CREATE POLICY "Allow updating own wallets" ON wallets
    FOR UPDATE USING (true);

CREATE POLICY "Allow deleting own wallets" ON wallets
    FOR DELETE USING (true);

