-- ============================================================================
-- AQUA Launchpad - Fix Column Names
-- Ensures all column names use snake_case convention
-- ============================================================================

-- First, check and rename columns in wallets table if they exist with wrong names
DO $$
BEGIN
    -- Check if publicKey exists (camelCase) and rename to public_key
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wallets' AND column_name = 'publicKey') THEN
        ALTER TABLE wallets RENAME COLUMN "publicKey" TO public_key;
    END IF;
    
    -- Check if sessionId exists (camelCase) and rename to session_id
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wallets' AND column_name = 'sessionId') THEN
        ALTER TABLE wallets RENAME COLUMN "sessionId" TO session_id;
    END IF;
    
    -- Check if encryptedPrivateKey exists (camelCase) and rename to encrypted_private_key
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wallets' AND column_name = 'encryptedPrivateKey') THEN
        ALTER TABLE wallets RENAME COLUMN "encryptedPrivateKey" TO encrypted_private_key;
    END IF;
    
    -- Check if isPrimary exists (camelCase) and rename to is_primary
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wallets' AND column_name = 'isPrimary') THEN
        ALTER TABLE wallets RENAME COLUMN "isPrimary" TO is_primary;
    END IF;
    
    -- Check if userId exists (camelCase) and rename to user_id
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wallets' AND column_name = 'userId') THEN
        ALTER TABLE wallets RENAME COLUMN "userId" TO user_id;
    END IF;
    
    -- Check if createdAt exists (camelCase) and rename to created_at
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wallets' AND column_name = 'createdAt') THEN
        ALTER TABLE wallets RENAME COLUMN "createdAt" TO created_at;
    END IF;
    
    -- Check if updatedAt exists (camelCase) and rename to updated_at
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wallets' AND column_name = 'updatedAt') THEN
        ALTER TABLE wallets RENAME COLUMN "updatedAt" TO updated_at;
    END IF;
END $$;

-- Ensure all required columns exist with correct snake_case names
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wallets' AND column_name = 'session_id') THEN
        ALTER TABLE wallets ADD COLUMN session_id TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wallets' AND column_name = 'public_key') THEN
        ALTER TABLE wallets ADD COLUMN public_key VARCHAR(44);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wallets' AND column_name = 'encrypted_private_key') THEN
        ALTER TABLE wallets ADD COLUMN encrypted_private_key TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wallets' AND column_name = 'label') THEN
        ALTER TABLE wallets ADD COLUMN label TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wallets' AND column_name = 'is_primary') THEN
        ALTER TABLE wallets ADD COLUMN is_primary BOOLEAN DEFAULT FALSE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wallets' AND column_name = 'user_id') THEN
        ALTER TABLE wallets ADD COLUMN user_id UUID;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wallets' AND column_name = 'created_at') THEN
        ALTER TABLE wallets ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wallets' AND column_name = 'updated_at') THEN
        ALTER TABLE wallets ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- Make sure NOT NULL constraints are in place
-- (only after ensuring columns exist)
-- Skip this for now to avoid errors if data exists

