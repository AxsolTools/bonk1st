-- Migration: Fix cron job authentication
-- Uses Supabase Vault to securely store and retrieve the service role key

-- First, enable the vault extension if not already enabled
CREATE EXTENSION IF NOT EXISTS supabase_vault;

-- Store the service role key in vault (this will be done manually via dashboard)
-- The cron jobs will retrieve it from vault at runtime

-- Alternative approach: Use a secure secrets table
-- This table is only accessible by the service role

CREATE TABLE IF NOT EXISTS _internal_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_name TEXT UNIQUE NOT NULL,
  key_value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Revoke all access from public and authenticated roles
REVOKE ALL ON _internal_secrets FROM PUBLIC;
REVOKE ALL ON _internal_secrets FROM authenticated;
REVOKE ALL ON _internal_secrets FROM anon;

-- Only service_role can access this table
GRANT ALL ON _internal_secrets TO service_role;

-- Enable RLS but allow service_role bypass
ALTER TABLE _internal_secrets ENABLE ROW LEVEL SECURITY;

-- Drop existing cron jobs if they exist (to recreate with new auth)
SELECT cron.unschedule('token22-liquidity-engine') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'token22-liquidity-engine');
SELECT cron.unschedule('pour-rate-engine') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pour-rate-engine');
SELECT cron.unschedule('tide-harvest-engine') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'tide-harvest-engine');
SELECT cron.unschedule('evaporation-engine') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'evaporation-engine');
SELECT cron.unschedule('price-updater') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'price-updater');
SELECT cron.unschedule('metrics-updater') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'metrics-updater');

-- Recreate cron jobs using the secrets table for authentication
-- Token22 Liquidity Engine - runs every 15 minutes
SELECT cron.schedule(
  'token22-liquidity-engine',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://rbmzrqsnsvzgoxzpynky.supabase.co/functions/v1/token22-liquidity-engine',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT key_value FROM _internal_secrets WHERE key_name = 'service_role_key')
    ),
    body := jsonb_build_object('source', 'cron')
  );
  $$
);

-- Pump.fun Pour Rate Engine - runs every 15 minutes
SELECT cron.schedule(
  'pour-rate-engine',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://rbmzrqsnsvzgoxzpynky.supabase.co/functions/v1/pour-rate-engine',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT key_value FROM _internal_secrets WHERE key_name = 'service_role_key')
    ),
    body := jsonb_build_object('source', 'cron')
  );
  $$
);

-- Tide Harvest Engine (Pump.fun creator rewards) - runs every 30 minutes
SELECT cron.schedule(
  'tide-harvest-engine',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://rbmzrqsnsvzgoxzpynky.supabase.co/functions/v1/tide-harvest-engine',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT key_value FROM _internal_secrets WHERE key_name = 'service_role_key')
    ),
    body := jsonb_build_object('source', 'cron')
  );
  $$
);

-- Evaporation Engine (burn mechanics) - runs every hour
SELECT cron.schedule(
  'evaporation-engine',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://rbmzrqsnsvzgoxzpynky.supabase.co/functions/v1/evaporation-engine',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT key_value FROM _internal_secrets WHERE key_name = 'service_role_key')
    ),
    body := jsonb_build_object('source', 'cron')
  );
  $$
);

-- Price Updater - runs every 5 minutes
SELECT cron.schedule(
  'price-updater',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://rbmzrqsnsvzgoxzpynky.supabase.co/functions/v1/price-updater',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT key_value FROM _internal_secrets WHERE key_name = 'service_role_key')
    ),
    body := jsonb_build_object('source', 'cron')
  );
  $$
);

-- Metrics Updater - runs every 10 minutes
SELECT cron.schedule(
  'metrics-updater',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://rbmzrqsnsvzgoxzpynky.supabase.co/functions/v1/metrics-updater',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT key_value FROM _internal_secrets WHERE key_name = 'service_role_key')
    ),
    body := jsonb_build_object('source', 'cron')
  );
  $$
);

-- IMPORTANT: After running this migration, you must insert the service role key:
-- Run this in SQL Editor (DO NOT commit to git):
-- INSERT INTO _internal_secrets (key_name, key_value) VALUES ('service_role_key', 'YOUR_SERVICE_ROLE_KEY_HERE');

