-- ============================================================================
-- AQUA Launchpad - Schema Fix
-- Ensures all tables exist with correct structure
-- ============================================================================

-- First, check if wallets table exists and add missing columns
DO $$
BEGIN
    -- Check if wallets table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'wallets') THEN
        -- Add session_id if not exists
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wallets' AND column_name = 'session_id') THEN
            ALTER TABLE wallets ADD COLUMN session_id TEXT;
        END IF;
        
        -- Add encrypted_private_key if not exists
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wallets' AND column_name = 'encrypted_private_key') THEN
            ALTER TABLE wallets ADD COLUMN encrypted_private_key TEXT;
        END IF;
        
        -- Add public_key if not exists
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wallets' AND column_name = 'public_key') THEN
            ALTER TABLE wallets ADD COLUMN public_key VARCHAR(44);
        END IF;
        
        -- Add label if not exists
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wallets' AND column_name = 'label') THEN
            ALTER TABLE wallets ADD COLUMN label TEXT;
        END IF;
        
        -- Add is_primary if not exists
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wallets' AND column_name = 'is_primary') THEN
            ALTER TABLE wallets ADD COLUMN is_primary BOOLEAN DEFAULT FALSE;
        END IF;
        
        -- Add user_id if not exists
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wallets' AND column_name = 'user_id') THEN
            ALTER TABLE wallets ADD COLUMN user_id UUID;
        END IF;
        
        -- Add created_at if not exists
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wallets' AND column_name = 'created_at') THEN
            ALTER TABLE wallets ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
        END IF;
        
        -- Add updated_at if not exists
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wallets' AND column_name = 'updated_at') THEN
            ALTER TABLE wallets ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
        END IF;
    ELSE
        -- Create wallets table if it doesn't exist
        CREATE TABLE wallets (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            session_id TEXT NOT NULL,
            public_key VARCHAR(44) NOT NULL,
            encrypted_private_key TEXT NOT NULL,
            label TEXT,
            is_primary BOOLEAN DEFAULT FALSE,
            user_id UUID,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
    END IF;
END $$;

-- Create system_config table
CREATE TABLE IF NOT EXISTS system_config (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on both
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies
DROP POLICY IF EXISTS "Allow wallet creation" ON wallets;
DROP POLICY IF EXISTS "Allow reading own wallets" ON wallets;
DROP POLICY IF EXISTS "Allow updating own wallets" ON wallets;
DROP POLICY IF EXISTS "Allow deleting own wallets" ON wallets;
DROP POLICY IF EXISTS "Service role access only" ON system_config;

CREATE POLICY "Allow wallet creation" ON wallets FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow reading own wallets" ON wallets FOR SELECT USING (true);
CREATE POLICY "Allow updating own wallets" ON wallets FOR UPDATE USING (true);
CREATE POLICY "Allow deleting own wallets" ON wallets FOR DELETE USING (true);
CREATE POLICY "Service role access only" ON system_config FOR ALL USING (true);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_wallets_session_id ON wallets(session_id);
CREATE INDEX IF NOT EXISTS idx_wallets_public_key ON wallets(public_key);

