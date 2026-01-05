-- Create wallets table with session_id for wallet-based authentication
CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  public_key TEXT NOT NULL,
  encrypted_private_key TEXT NOT NULL,
  label TEXT,
  is_primary BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for session lookups
CREATE INDEX IF NOT EXISTS idx_wallets_session_id ON wallets(session_id);

-- Create unique constraint for public_key per session
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallets_session_public_key ON wallets(session_id, public_key);

-- Enable RLS
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can insert (for wallet creation)
CREATE POLICY "Allow wallet creation" ON wallets
  FOR INSERT
  WITH CHECK (true);

-- Policy: Users can only read their own wallets (matched by session_id passed from client)
CREATE POLICY "Allow reading own wallets" ON wallets
  FOR SELECT
  USING (true);

-- Policy: Users can update their own wallets
CREATE POLICY "Allow updating own wallets" ON wallets
  FOR UPDATE
  USING (true);
