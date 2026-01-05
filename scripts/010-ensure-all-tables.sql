-- ============================================================================
-- AQUA Launchpad - Ensure All Tables Exist
-- This migration ensures all required tables exist with correct schema
-- ============================================================================

-- Create system_config table if not exists
CREATE TABLE IF NOT EXISTS system_config (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create wallets table with all required columns
CREATE TABLE IF NOT EXISTS wallets (
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

-- Create users table if not exists
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    main_wallet_address VARCHAR(44) UNIQUE NOT NULL,
    referral_code VARCHAR(10) UNIQUE,
    referred_by UUID REFERENCES users(id),
    username VARCHAR(50),
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_wallets_session_id ON wallets(session_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallets_session_public_key ON wallets(session_id, public_key);
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);

-- Add user_id foreign key if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'wallets' AND column_name = 'user_id'
    ) THEN
        ALTER TABLE wallets ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Enable RLS
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to recreate them
DROP POLICY IF EXISTS "Service role access only" ON system_config;
DROP POLICY IF EXISTS "Allow wallet creation" ON wallets;
DROP POLICY IF EXISTS "Allow reading own wallets" ON wallets;
DROP POLICY IF EXISTS "Allow updating own wallets" ON wallets;
DROP POLICY IF EXISTS "Allow deleting own wallets" ON wallets;
DROP POLICY IF EXISTS "Users can view their own record" ON users;
DROP POLICY IF EXISTS "Service role can manage users" ON users;

-- system_config: Only service role can access
CREATE POLICY "Service role access only" ON system_config
    FOR ALL USING (true);

-- wallets: Allow all operations (session-based auth)
CREATE POLICY "Allow wallet creation" ON wallets
    FOR INSERT WITH CHECK (true);
    
CREATE POLICY "Allow reading own wallets" ON wallets
    FOR SELECT USING (true);
    
CREATE POLICY "Allow updating own wallets" ON wallets
    FOR UPDATE USING (true);

CREATE POLICY "Allow deleting own wallets" ON wallets
    FOR DELETE USING (true);

-- users: Allow operations
CREATE POLICY "Users can view their own record" ON users
    FOR SELECT USING (true);
    
CREATE POLICY "Service role can manage users" ON users
    FOR ALL USING (true);

-- Create tokens table
CREATE TABLE IF NOT EXISTS tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mint_address VARCHAR(44) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    symbol VARCHAR(10) NOT NULL,
    description TEXT,
    image_url TEXT,
    creator_wallet VARCHAR(44) NOT NULL,
    creator_user_id UUID REFERENCES users(id),
    bonding_curve_address VARCHAR(44),
    migration_status VARCHAR(20) DEFAULT 'bonding',
    initial_supply BIGINT,
    current_supply BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view tokens" ON tokens;
DROP POLICY IF EXISTS "Creators can update their tokens" ON tokens;
CREATE POLICY "Anyone can view tokens" ON tokens FOR SELECT USING (true);
CREATE POLICY "Creators can update their tokens" ON tokens FOR ALL USING (true);

-- Create token_parameters table
CREATE TABLE IF NOT EXISTS token_parameters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_id UUID REFERENCES tokens(id) ON DELETE CASCADE,
    mint_address VARCHAR(44) NOT NULL,
    pour_rate_percent NUMERIC(5,2) DEFAULT 1.00,
    fee_to_liquidity_percent NUMERIC(5,2) DEFAULT 50.00,
    evaporation_enabled BOOLEAN DEFAULT false,
    evaporation_rate_percent NUMERIC(5,2) DEFAULT 0.00,
    auto_buyback_enabled BOOLEAN DEFAULT true,
    min_liquidity_threshold NUMERIC(18,9) DEFAULT 0.1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT valid_pour_rate CHECK (pour_rate_percent >= 0 AND pour_rate_percent <= 100),
    CONSTRAINT valid_fee_allocation CHECK (fee_to_liquidity_percent >= 0 AND fee_to_liquidity_percent <= 100),
    CONSTRAINT valid_evaporation_rate CHECK (evaporation_rate_percent >= 0 AND evaporation_rate_percent <= 10)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_token_parameters_mint ON token_parameters(mint_address);
ALTER TABLE token_parameters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view token parameters" ON token_parameters;
DROP POLICY IF EXISTS "Creators can manage their token parameters" ON token_parameters;
CREATE POLICY "Anyone can view token parameters" ON token_parameters FOR SELECT USING (true);
CREATE POLICY "Creators can manage their token parameters" ON token_parameters FOR ALL USING (true);

-- Create referrals table
CREATE TABLE IF NOT EXISTS referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_id UUID REFERENCES users(id) ON DELETE CASCADE,
    referred_id UUID REFERENCES users(id) ON DELETE CASCADE,
    referral_code VARCHAR(10) NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(referred_id)
);

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "referrals_select" ON referrals;
DROP POLICY IF EXISTS "referrals_insert" ON referrals;
CREATE POLICY "referrals_select" ON referrals FOR SELECT USING (true);
CREATE POLICY "referrals_insert" ON referrals FOR INSERT WITH CHECK (true);

-- Create referral_earnings table
CREATE TABLE IF NOT EXISTS referral_earnings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_id UUID REFERENCES users(id) ON DELETE CASCADE,
    referred_id UUID REFERENCES users(id),
    transaction_signature VARCHAR(88) NOT NULL,
    transaction_type VARCHAR(20) NOT NULL,
    original_amount_lamports BIGINT NOT NULL,
    earning_amount_lamports BIGINT NOT NULL,
    earning_percent NUMERIC(5,2) NOT NULL,
    token_mint VARCHAR(44),
    claimed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE referral_earnings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "referral_earnings_select" ON referral_earnings;
DROP POLICY IF EXISTS "referral_earnings_insert" ON referral_earnings;
CREATE POLICY "referral_earnings_select" ON referral_earnings FOR SELECT USING (true);
CREATE POLICY "referral_earnings_insert" ON referral_earnings FOR INSERT WITH CHECK (true);

-- Create platform_fees table
CREATE TABLE IF NOT EXISTS platform_fees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_signature VARCHAR(88) NOT NULL,
    transaction_type VARCHAR(20) NOT NULL,
    user_id UUID REFERENCES users(id),
    user_wallet VARCHAR(44) NOT NULL,
    original_amount_lamports BIGINT NOT NULL,
    fee_amount_lamports BIGINT NOT NULL,
    fee_percent NUMERIC(5,2) NOT NULL,
    token_mint VARCHAR(44),
    status VARCHAR(20) DEFAULT 'collected',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE platform_fees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "platform_fees_select" ON platform_fees;
DROP POLICY IF EXISTS "platform_fees_insert" ON platform_fees;
CREATE POLICY "platform_fees_select" ON platform_fees FOR SELECT USING (true);
CREATE POLICY "platform_fees_insert" ON platform_fees FOR INSERT WITH CHECK (true);

-- Create token_chat table
CREATE TABLE IF NOT EXISTS token_chat (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_mint VARCHAR(44) NOT NULL,
    user_id UUID REFERENCES users(id),
    user_wallet VARCHAR(44) NOT NULL,
    username VARCHAR(50),
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_chat_mint ON token_chat(token_mint);
CREATE INDEX IF NOT EXISTS idx_token_chat_created ON token_chat(token_mint, created_at DESC);
ALTER TABLE token_chat ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view chat" ON token_chat;
DROP POLICY IF EXISTS "Authenticated users can post" ON token_chat;
CREATE POLICY "Anyone can view chat" ON token_chat FOR SELECT USING (true);
CREATE POLICY "Authenticated users can post" ON token_chat FOR INSERT WITH CHECK (true);

-- Create token_comments table
CREATE TABLE IF NOT EXISTS token_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_mint VARCHAR(44) NOT NULL,
    user_id UUID REFERENCES users(id),
    user_wallet VARCHAR(44) NOT NULL,
    username VARCHAR(50),
    content TEXT NOT NULL,
    parent_id UUID REFERENCES token_comments(id) ON DELETE CASCADE,
    likes_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_comments_mint ON token_comments(token_mint);
ALTER TABLE token_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view comments" ON token_comments;
DROP POLICY IF EXISTS "Authenticated users can comment" ON token_comments;
CREATE POLICY "Anyone can view comments" ON token_comments FOR SELECT USING (true);
CREATE POLICY "Authenticated users can comment" ON token_comments FOR INSERT WITH CHECK (true);

-- Create trades table
CREATE TABLE IF NOT EXISTS trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_signature VARCHAR(88) UNIQUE NOT NULL,
    user_id UUID REFERENCES users(id),
    user_wallet VARCHAR(44) NOT NULL,
    token_mint VARCHAR(44) NOT NULL,
    trade_type VARCHAR(4) NOT NULL CHECK (trade_type IN ('buy', 'sell')),
    sol_amount_lamports BIGINT NOT NULL,
    token_amount BIGINT NOT NULL,
    price_per_token NUMERIC(24,12),
    slippage_percent NUMERIC(5,2),
    platform_fee_lamports BIGINT DEFAULT 0,
    referral_fee_lamports BIGINT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending',
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_trades_user ON trades(user_wallet);
CREATE INDEX IF NOT EXISTS idx_trades_token ON trades(token_mint);
CREATE INDEX IF NOT EXISTS idx_trades_created ON trades(created_at DESC);
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trades_select" ON trades;
DROP POLICY IF EXISTS "trades_insert" ON trades;
CREATE POLICY "trades_select" ON trades FOR SELECT USING (true);
CREATE POLICY "trades_insert" ON trades FOR INSERT WITH CHECK (true);

