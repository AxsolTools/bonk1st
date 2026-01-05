-- ============================================================================
-- AQUA Launchpad - Users Table Migration
-- Creates the users table for wallet-based authentication
-- ============================================================================

-- Create users table (main account linked to primary wallet)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  main_wallet_address VARCHAR(44) UNIQUE NOT NULL,
  username VARCHAR(50),
  avatar_url TEXT,
  email VARCHAR(255),
  is_verified BOOLEAN DEFAULT FALSE,
  total_transactions INTEGER DEFAULT 0,
  total_volume_sol DECIMAL(18,9) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_main_wallet ON users(main_wallet_address);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can read all profiles" ON users
  FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (main_wallet_address = current_setting('app.current_wallet', true));

CREATE POLICY "Allow user creation" ON users
  FOR INSERT WITH CHECK (true);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

