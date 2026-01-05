/**
 * Volume Bot Executor - Supabase Edge Function
 * 
 * This Edge Function executes scheduled volume bot trades.
 * It is triggered by pg_cron every minute to check for active sessions
 * and execute trades according to their configuration.
 * 
 * Flow:
 * 1. Query active volume bot sessions
 * 2. For each session, check if it's time for the next trade
 * 3. Generate execution plan based on strategy
 * 4. Execute trades via PumpPortal or Jupiter
 * 5. Log results to database
 * 6. Handle errors and emergency stops
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

// Environment variables
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const HELIUS_API_KEY = Deno.env.get('HELIUS_API_KEY') || Deno.env.get('NEXT_PUBLIC_HELIUS_API_KEY')
const RPC_URL = HELIUS_API_KEY 
  ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
  : 'https://api.mainnet-beta.solana.com'

// Constants
const PLATFORM_FEE_PERCENT = 2
const MIN_TRADE_INTERVAL_MS = 3000 // Minimum 3 seconds between trades

// Types
interface VolumeSession {
  id: string
  user_id: string
  settings_id: string
  token_mint: string
  status: string
  target_volume_sol: number
  executed_volume_sol: number
  last_trade_at: string | null
}

interface VolumeSettings {
  id: string
  strategy: 'DBPM' | 'PLD' | 'CMWA'
  min_tx_sol: number
  max_tx_sol: number
  trade_interval_ms: number
  buy_pressure_percent: number
  wallet_ids: string[]
  wallet_addresses: string[]
  emergency_stop_enabled: boolean
  min_sol_balance: number
  max_session_loss_sol: number
  max_price_drop_percent: number
  platform: 'pumpfun' | 'jupiter' | 'raydium'
  slippage_bps: number
}

// Main handler
Deno.serve(async (req) => {
  try {
    // Verify authorization
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.includes(SUPABASE_SERVICE_ROLE_KEY)) {
      console.log('[VOLUME_BOT_EXECUTOR] Unauthorized request')
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    }

    console.log('[VOLUME_BOT_EXECUTOR] Starting execution cycle...')

    // Create Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Get active sessions
    const { data: sessions, error: sessionsError } = await supabase
      .from('volume_bot_sessions')
      .select(`
        id,
        user_id,
        settings_id,
        token_mint,
        status,
        target_volume_sol,
        executed_volume_sol,
        updated_at
      `)
      .eq('status', 'running')
      .limit(50)

    if (sessionsError) {
      console.error('[VOLUME_BOT_EXECUTOR] Failed to fetch sessions:', sessionsError)
      throw sessionsError
    }

    if (!sessions || sessions.length === 0) {
      console.log('[VOLUME_BOT_EXECUTOR] No active sessions found')
      return new Response(JSON.stringify({ message: 'No active sessions', processed: 0 }))
    }

    console.log(`[VOLUME_BOT_EXECUTOR] Found ${sessions.length} active sessions`)

    let processed = 0
    let errors = 0

    // Process each session
    for (const session of sessions) {
      try {
        await processSession(supabase, session as VolumeSession)
        processed++
      } catch (err) {
        console.error(`[VOLUME_BOT_EXECUTOR] Session ${session.id} failed:`, err)
        errors++
        
        // Update session status to error
        await supabase
          .from('volume_bot_sessions')
          .update({
            status: 'error',
            error_message: err instanceof Error ? err.message : 'Unknown error',
            stopped_at: new Date().toISOString()
          })
          .eq('id', session.id)
      }
    }

    console.log(`[VOLUME_BOT_EXECUTOR] Completed: ${processed} processed, ${errors} errors`)

    return new Response(JSON.stringify({
      success: true,
      processed,
      errors,
      timestamp: new Date().toISOString()
    }))
  } catch (error) {
    console.error('[VOLUME_BOT_EXECUTOR] Fatal error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500 }
    )
  }
})

/**
 * Process a single volume bot session
 */
async function processSession(supabase: ReturnType<typeof createClient>, session: VolumeSession) {
  // Load settings
  const { data: settings, error: settingsError } = await supabase
    .from('volume_bot_settings')
    .select('*')
    .eq('id', session.settings_id)
    .single()

  if (settingsError || !settings) {
    throw new Error(`Failed to load settings for session ${session.id}`)
  }

  const typedSettings = settings as unknown as VolumeSettings

  // Check if enough time has passed since last trade
  const lastTradeAt = session.last_trade_at ? new Date(session.last_trade_at).getTime() : 0
  const timeSinceLastTrade = Date.now() - lastTradeAt
  
  if (timeSinceLastTrade < Math.max(typedSettings.trade_interval_ms, MIN_TRADE_INTERVAL_MS)) {
    console.log(`[VOLUME_BOT_EXECUTOR] Session ${session.id}: Waiting for next trade interval`)
    return
  }

  // Check if target volume reached
  if (session.executed_volume_sol >= session.target_volume_sol) {
    console.log(`[VOLUME_BOT_EXECUTOR] Session ${session.id}: Target volume reached, completing`)
    await supabase
      .from('volume_bot_sessions')
      .update({ status: 'completed', stopped_at: new Date().toISOString() })
      .eq('id', session.id)
    return
  }

  // Check emergency stop conditions
  if (typedSettings.emergency_stop_enabled) {
    const shouldStop = await checkEmergencyConditions(supabase, session, typedSettings)
    if (shouldStop.stop) {
      console.log(`[VOLUME_BOT_EXECUTOR] Session ${session.id}: Emergency stop - ${shouldStop.reason}`)
      await supabase
        .from('volume_bot_sessions')
        .update({
          status: 'emergency_stopped',
          stop_reason: shouldStop.reason,
          stopped_at: new Date().toISOString()
        })
        .eq('id', session.id)
      return
    }
  }

  // Determine trade type based on strategy and buy pressure
  const isBuy = determineTrade(typedSettings.strategy, typedSettings.buy_pressure_percent)
  const tradeType = isBuy ? 'buy' : 'sell'

  // Calculate trade amount (random within min/max)
  const tradeAmount = typedSettings.min_tx_sol + 
    Math.random() * (typedSettings.max_tx_sol - typedSettings.min_tx_sol)

  // Select wallet for trade
  const walletIndex = Math.floor(Math.random() * typedSettings.wallet_ids.length)
  const walletId = typedSettings.wallet_ids[walletIndex]
  const walletAddress = typedSettings.wallet_addresses[walletIndex]

  console.log(`[VOLUME_BOT_EXECUTOR] Session ${session.id}: Executing ${tradeType} of ${tradeAmount.toFixed(4)} SOL via wallet ${walletAddress.slice(0, 8)}...`)

  // Create execution record
  const { data: execution, error: execError } = await supabase
    .from('volume_bot_executions')
    .insert({
      session_id: session.id,
      user_id: session.user_id,
      token_mint: session.token_mint,
      trade_type: tradeType,
      wallet_id: walletId,
      wallet_address: walletAddress,
      sol_amount: tradeAmount,
      execution_type: 'volume_bot',
      tx_status: 'pending',
      execution_method: typedSettings.platform,
      planned_at: new Date().toISOString()
    })
    .select()
    .single()

  if (execError) {
    throw new Error(`Failed to create execution record: ${execError.message}`)
  }

  // Note: Actual trade execution would happen here via PumpPortal/Jupiter API
  // For now, we log the planned trade and mark it as pending
  // The frontend or a separate worker can pick up pending executions
  
  // Update session metrics
  await supabase
    .from('volume_bot_sessions')
    .update({
      executed_volume_sol: session.executed_volume_sol + tradeAmount,
      total_trades: session.executed_volume_sol > 0 ? session.target_volume_sol + 1 : 1,
      [isBuy ? 'buy_count' : 'sell_count']: session.executed_volume_sol > 0 ? 1 : 1,
      updated_at: new Date().toISOString()
    })
    .eq('id', session.id)

  console.log(`[VOLUME_BOT_EXECUTOR] Session ${session.id}: Trade planned, execution ID ${execution?.id}`)
}

/**
 * Determine if trade should be buy or sell based on strategy
 */
function determineTrade(strategy: string, buyPressurePercent: number): boolean {
  const random = Math.random() * 100
  
  switch (strategy) {
    case 'DBPM':
      // Dynamic Buy-Pressure: Use buy pressure directly
      return random < buyPressurePercent
    
    case 'PLD':
      // Predictive Liquidity: More balanced with slight buy bias
      return random < Math.max(buyPressurePercent, 55)
    
    case 'CMWA':
      // Multi-Wallet Arbitrage: Alternating pattern
      return Math.random() < 0.5
    
    default:
      return random < buyPressurePercent
  }
}

/**
 * Check emergency stop conditions
 */
async function checkEmergencyConditions(
  supabase: ReturnType<typeof createClient>,
  session: VolumeSession,
  settings: VolumeSettings
): Promise<{ stop: boolean; reason?: string }> {
  // Check session loss
  const { data: sessionData } = await supabase
    .from('volume_bot_sessions')
    .select('net_pnl_sol, start_price, current_price')
    .eq('id', session.id)
    .single()

  if (sessionData) {
    // Check max session loss
    if (sessionData.net_pnl_sol && sessionData.net_pnl_sol < -settings.max_session_loss_sol) {
      return { stop: true, reason: `Max session loss exceeded: ${sessionData.net_pnl_sol} SOL` }
    }

    // Check max price drop
    if (sessionData.start_price && sessionData.current_price) {
      const priceDropPercent = ((sessionData.start_price - sessionData.current_price) / sessionData.start_price) * 100
      if (priceDropPercent > settings.max_price_drop_percent) {
        return { stop: true, reason: `Price dropped ${priceDropPercent.toFixed(2)}%` }
      }
    }
  }

  return { stop: false }
}

