-- Dice Game Chat Messages Table
-- Run this in your Supabase SQL editor

-- Create chat_messages table for dice game live chat
CREATE TABLE IF NOT EXISTS chat_messages (
    id SERIAL PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_wallet ON chat_messages(wallet_address);

-- Enable RLS
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read messages
CREATE POLICY "Anyone can read chat messages" ON chat_messages
    FOR SELECT USING (true);

-- Allow authenticated users to insert messages
CREATE POLICY "Authenticated users can insert messages" ON chat_messages
    FOR INSERT WITH CHECK (true);

-- Optional: Auto-delete old messages after 7 days
-- CREATE OR REPLACE FUNCTION delete_old_chat_messages()
-- RETURNS void AS $$
-- BEGIN
--     DELETE FROM chat_messages WHERE created_at < NOW() - INTERVAL '7 days';
-- END;
-- $$ LANGUAGE plpgsql;

-- Optional: Create system_config entry for service_salt if not exists
-- This is needed for the dice server to decrypt wallet private keys
-- INSERT INTO system_config (key, value) 
-- VALUES ('service_salt', 'your-service-salt-here')
-- ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE chat_messages IS 'Live chat messages for the Aqua Dice game';

