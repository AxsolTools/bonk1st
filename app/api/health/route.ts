/**
 * AQUA Launchpad - Health Check API
 * 
 * Returns system health status for Digital Ocean monitoring
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSourceHealth } from '@/lib/price';

export const revalidate = 0; // Never cache

export async function GET() {
  const startTime = Date.now();
  const checks: Record<string, { status: 'ok' | 'error'; latency?: number; error?: string }> = {};

  // Check Supabase
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      checks.supabase = { status: 'error', error: 'Missing configuration' };
    } else {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const supabaseStart = Date.now();
      await supabase.from('tokens').select('id').limit(1);
      checks.supabase = { status: 'ok', latency: Date.now() - supabaseStart };
    }
  } catch (error) {
    checks.supabase = { status: 'error', error: error instanceof Error ? error.message : 'Unknown' };
  }

  // Check Helius RPC
  try {
    const heliusUrl = process.env.HELIUS_RPC_URL;
    if (!heliusUrl) {
      checks.helius = { status: 'error', error: 'Missing configuration' };
    } else {
      const heliusStart = Date.now();
      const response = await fetch(heliusUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getHealth',
        }),
      });
      const data = await response.json();
      if (data.result === 'ok') {
        checks.helius = { status: 'ok', latency: Date.now() - heliusStart };
      } else {
        checks.helius = { status: 'error', error: data.error?.message || 'Unhealthy' };
      }
    }
  } catch (error) {
    checks.helius = { status: 'error', error: error instanceof Error ? error.message : 'Unknown' };
  }

  // Check price sources
  const priceHealth = getSourceHealth();
  const healthyPriceSources = Object.entries(priceHealth).filter(
    ([, health]) => health.consecutiveFailures < 3
  ).length;
  
  checks.priceSources = {
    status: healthyPriceSources >= 2 ? 'ok' : 'error',
    latency: Object.keys(priceHealth).length,
  };

  // Overall status
  const allOk = Object.values(checks).every(c => c.status === 'ok');
  const criticalOk = checks.supabase?.status === 'ok' && checks.helius?.status === 'ok';

  return NextResponse.json({
    status: allOk ? 'healthy' : criticalOk ? 'degraded' : 'unhealthy',
    timestamp: new Date().toISOString(),
    latency: Date.now() - startTime,
    checks,
    version: process.env.npm_package_version || '1.0.0',
  }, {
    status: criticalOk ? 200 : 503,
  });
}

