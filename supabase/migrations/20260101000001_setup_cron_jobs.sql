-- Migration: Setup pg_cron jobs for automated liquidity engines
-- Description: Creates cron jobs to trigger the liquidity engine Edge Functions

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant usage on cron schema to postgres
GRANT USAGE ON SCHEMA cron TO postgres;

-- Token22 Liquidity Engine - runs every 15 minutes
-- This job calls the Edge Function to process Token22 fee harvesting and distribution
SELECT cron.schedule(
  'token22-liquidity-engine',
  '*/15 * * * *', -- Every 15 minutes
  $$
  SELECT net.http_post(
    url := 'https://rbmzrqsnsvzgoxzpynky.supabase.co/functions/v1/token22-liquidity-engine',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object('source', 'cron')
  );
  $$
);

-- Pump.fun Pour Rate Engine - runs every 15 minutes
SELECT cron.schedule(
  'pour-rate-engine',
  '*/15 * * * *', -- Every 15 minutes
  $$
  SELECT net.http_post(
    url := 'https://rbmzrqsnsvzgoxzpynky.supabase.co/functions/v1/pour-rate-engine',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object('source', 'cron')
  );
  $$
);

-- Tide Harvest Engine (Pump.fun creator rewards) - runs every 30 minutes
SELECT cron.schedule(
  'tide-harvest-engine',
  '*/30 * * * *', -- Every 30 minutes
  $$
  SELECT net.http_post(
    url := 'https://rbmzrqsnsvzgoxzpynky.supabase.co/functions/v1/tide-harvest-engine',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object('source', 'cron')
  );
  $$
);

-- Evaporation Engine (burn mechanics) - runs every hour
SELECT cron.schedule(
  'evaporation-engine',
  '0 * * * *', -- Every hour on the hour
  $$
  SELECT net.http_post(
    url := 'https://rbmzrqsnsvzgoxzpynky.supabase.co/functions/v1/evaporation-engine',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object('source', 'cron')
  );
  $$
);

-- Price Updater - runs every 5 minutes
SELECT cron.schedule(
  'price-updater',
  '*/5 * * * *', -- Every 5 minutes
  $$
  SELECT net.http_post(
    url := 'https://rbmzrqsnsvzgoxzpynky.supabase.co/functions/v1/price-updater',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object('source', 'cron')
  );
  $$
);

-- Metrics Updater - runs every 10 minutes
SELECT cron.schedule(
  'metrics-updater',
  '*/10 * * * *', -- Every 10 minutes
  $$
  SELECT net.http_post(
    url := 'https://rbmzrqsnsvzgoxzpynky.supabase.co/functions/v1/metrics-updater',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object('source', 'cron')
  );
  $$
);

-- Create a view to easily check cron job status
CREATE OR REPLACE VIEW cron_job_status AS
SELECT 
  jobid,
  jobname,
  schedule,
  active,
  database,
  username
FROM cron.job
ORDER BY jobname;

-- Grant access to the view
GRANT SELECT ON cron_job_status TO authenticated;
GRANT SELECT ON cron_job_status TO service_role;

-- Comment for documentation
COMMENT ON VIEW cron_job_status IS 'View to check the status of all scheduled cron jobs for automated liquidity engines';

