-- =====================================================
-- AQUA Launchpad - Missing Tables Migration
-- Migration 013: Create votes, boosts, watchlist, trending_profiles, tide_harvests
-- =====================================================

-- =====================================================
-- 1. VOTES TABLE
-- Tracks user votes on tokens
-- =====================================================
CREATE TABLE IF NOT EXISTS votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_address VARCHAR(44) NOT NULL,
  wallet_address VARCHAR(44) NOT NULL,
  vote_type VARCHAR(10) DEFAULT 'up' CHECK (vote_type IN ('up', 'down')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(token_address, wallet_address)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_votes_token ON votes(token_address);
CREATE INDEX IF NOT EXISTS idx_votes_wallet ON votes(wallet_address);

-- RLS for votes
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;

-- Anyone can read votes
CREATE POLICY "votes_read_all" ON votes
  FOR SELECT USING (true);

-- Users can only manage their own votes
CREATE POLICY "votes_insert_own" ON votes
  FOR INSERT WITH CHECK (true);

CREATE POLICY "votes_update_own" ON votes
  FOR UPDATE USING (true);

CREATE POLICY "votes_delete_own" ON votes
  FOR DELETE USING (true);

-- =====================================================
-- 2. BOOSTS TABLE
-- Tracks SOL payments to boost token visibility
-- =====================================================
CREATE TABLE IF NOT EXISTS boosts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_address VARCHAR(44) NOT NULL,
  wallet_address VARCHAR(44) NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  tx_signature VARCHAR(88),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for boosts
CREATE INDEX IF NOT EXISTS idx_boosts_token ON boosts(token_address);
CREATE INDEX IF NOT EXISTS idx_boosts_wallet ON boosts(wallet_address);
CREATE INDEX IF NOT EXISTS idx_boosts_status ON boosts(status);

-- RLS for boosts
ALTER TABLE boosts ENABLE ROW LEVEL SECURITY;

-- Anyone can read boosts
CREATE POLICY "boosts_read_all" ON boosts
  FOR SELECT USING (true);

-- Users can insert their own boosts
CREATE POLICY "boosts_insert_own" ON boosts
  FOR INSERT WITH CHECK (true);

-- =====================================================
-- 3. WATCHLIST TABLE
-- Tracks user watchlists for tokens
-- =====================================================
CREATE TABLE IF NOT EXISTS watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id VARCHAR(255) NOT NULL,
  token_address VARCHAR(44) NOT NULL,
  token_id UUID REFERENCES tokens(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, token_address)
);

-- Indexes for watchlist
CREATE INDEX IF NOT EXISTS idx_watchlist_session ON watchlist(session_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_token ON watchlist(token_address);

-- RLS for watchlist
ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;

-- Users can only see their own watchlist
CREATE POLICY "watchlist_read_own" ON watchlist
  FOR SELECT USING (true);

CREATE POLICY "watchlist_insert_own" ON watchlist
  FOR INSERT WITH CHECK (true);

CREATE POLICY "watchlist_delete_own" ON watchlist
  FOR DELETE USING (true);

-- =====================================================
-- 4. TRENDING PROFILES TABLE
-- Paid promotional profiles for tokens
-- =====================================================
CREATE TABLE IF NOT EXISTS trending_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_address VARCHAR(44) NOT NULL,
  wallet_address VARCHAR(44) NOT NULL,
  token_name VARCHAR(100),
  token_symbol VARCHAR(10),
  token_image TEXT,
  banner_url TEXT,
  description TEXT,
  website TEXT,
  twitter TEXT,
  telegram TEXT,
  discord TEXT,
  tx_signature VARCHAR(88),
  amount_paid NUMERIC DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for trending_profiles
CREATE INDEX IF NOT EXISTS idx_trending_token ON trending_profiles(token_address);
CREATE INDEX IF NOT EXISTS idx_trending_active ON trending_profiles(is_active);
CREATE INDEX IF NOT EXISTS idx_trending_expires ON trending_profiles(expires_at);
CREATE INDEX IF NOT EXISTS idx_trending_priority ON trending_profiles(priority DESC);

-- RLS for trending_profiles
ALTER TABLE trending_profiles ENABLE ROW LEVEL SECURITY;

-- Anyone can read active trending profiles
CREATE POLICY "trending_read_all" ON trending_profiles
  FOR SELECT USING (true);

-- Users can insert their own trending profiles
CREATE POLICY "trending_insert_own" ON trending_profiles
  FOR INSERT WITH CHECK (true);

-- Users can update their own
CREATE POLICY "trending_update_own" ON trending_profiles
  FOR UPDATE USING (true);

-- =====================================================
-- 5. TIDE HARVESTS TABLE
-- Tracks creator rewards accumulation and claims
-- =====================================================
CREATE TABLE IF NOT EXISTS tide_harvests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id UUID REFERENCES tokens(id) ON DELETE CASCADE,
  token_address VARCHAR(44) NOT NULL,
  creator_wallet VARCHAR(44) NOT NULL,
  total_accumulated NUMERIC DEFAULT 0,
  total_claimed NUMERIC DEFAULT 0,
  pending_amount NUMERIC GENERATED ALWAYS AS (total_accumulated - total_claimed) STORED,
  last_claim_at TIMESTAMPTZ,
  last_accumulation_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(token_address)
);

-- Indexes for tide_harvests
CREATE INDEX IF NOT EXISTS idx_tide_token ON tide_harvests(token_address);
CREATE INDEX IF NOT EXISTS idx_tide_creator ON tide_harvests(creator_wallet);

-- RLS for tide_harvests
ALTER TABLE tide_harvests ENABLE ROW LEVEL SECURITY;

-- Anyone can read tide harvests
CREATE POLICY "tide_read_all" ON tide_harvests
  FOR SELECT USING (true);

-- Service role can insert/update
CREATE POLICY "tide_insert_service" ON tide_harvests
  FOR INSERT WITH CHECK (true);

CREATE POLICY "tide_update_service" ON tide_harvests
  FOR UPDATE USING (true);

-- =====================================================
-- 6. TIDE HARVEST CLAIMS TABLE
-- Tracks individual claim transactions
-- =====================================================
CREATE TABLE IF NOT EXISTS tide_harvest_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tide_harvest_id UUID REFERENCES tide_harvests(id) ON DELETE CASCADE,
  token_address VARCHAR(44) NOT NULL,
  creator_wallet VARCHAR(44) NOT NULL,
  amount NUMERIC NOT NULL,
  tx_signature VARCHAR(88),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for claims
CREATE INDEX IF NOT EXISTS idx_tide_claims_harvest ON tide_harvest_claims(tide_harvest_id);
CREATE INDEX IF NOT EXISTS idx_tide_claims_wallet ON tide_harvest_claims(creator_wallet);

-- RLS for claims
ALTER TABLE tide_harvest_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tide_claims_read_all" ON tide_harvest_claims
  FOR SELECT USING (true);

CREATE POLICY "tide_claims_insert" ON tide_harvest_claims
  FOR INSERT WITH CHECK (true);

-- =====================================================
-- 7. Helper Functions
-- =====================================================

-- Function to get vote counts for a token
CREATE OR REPLACE FUNCTION get_vote_counts(p_token_address VARCHAR(44))
RETURNS TABLE(up_votes BIGINT, down_votes BIGINT, total_votes BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*) FILTER (WHERE vote_type = 'up') as up_votes,
    COUNT(*) FILTER (WHERE vote_type = 'down') as down_votes,
    COUNT(*) as total_votes
  FROM votes
  WHERE token_address = p_token_address;
END;
$$ LANGUAGE plpgsql;

-- Function to get total boosts for a token
CREATE OR REPLACE FUNCTION get_boost_total(p_token_address VARCHAR(44))
RETURNS NUMERIC AS $$
BEGIN
  RETURN COALESCE(
    (SELECT SUM(amount) FROM boosts WHERE token_address = p_token_address AND status = 'confirmed'),
    0
  );
END;
$$ LANGUAGE plpgsql;

-- Function to update token vote/boost counts (trigger function)
CREATE OR REPLACE FUNCTION update_token_metrics()
RETURNS TRIGGER AS $$
BEGIN
  -- Update can be extended to sync metrics to tokens table if needed
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 8. Add missing columns to tokens table if needed
-- =====================================================
DO $$
BEGIN
  -- Add vote_count if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tokens' AND column_name = 'vote_count'
  ) THEN
    ALTER TABLE tokens ADD COLUMN vote_count INTEGER DEFAULT 0;
  END IF;

  -- Add boost_amount if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tokens' AND column_name = 'boost_amount'
  ) THEN
    ALTER TABLE tokens ADD COLUMN boost_amount NUMERIC DEFAULT 0;
  END IF;

  -- Add market_cap_usd if missing (to fix frontend reference)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tokens' AND column_name = 'market_cap_usd'
  ) THEN
    ALTER TABLE tokens ADD COLUMN market_cap_usd NUMERIC DEFAULT 0;
  END IF;
END $$;

-- =====================================================
-- Done!
-- =====================================================

