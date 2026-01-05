/**
 * Volume Bot Session API
 * 
 * 🚀 Control your money printer
 * 
 * POST /api/volume-bot/session (action: start)
 *   → Start a new session
 * 
 * POST /api/volume-bot/session (action: stop)
 *   → Stop a running session
 * 
 * POST /api/volume-bot/session (action: emergency_stop)
 *   → 🚨 EMERGENCY STOP - Stops everything immediately
 * 
 * GET /api/volume-bot/session?tokenMint=xxx
 *   → Get current session status
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  startSession, 
  stopSession, 
  emergencyStop,
  getSessionStatus,
  listActiveSessions
} from '@/lib/volume-bot';
import { getAdminClient } from '@/lib/supabase/admin';

// Get authenticated user from session headers
async function getAuthFromHeaders(request: NextRequest): Promise<{ sessionId: string; userId: string } | null> {
  const sessionId = request.headers.get('x-session-id');
  const userId = request.headers.get('x-user-id') || sessionId;
  
  if (!sessionId) return null;
  
  return { sessionId, userId: userId || sessionId };
}

// Get user wallets from database
async function getUserWallets(sessionId: string): Promise<Array<{
  wallet_id: string;
  user_id: string;
  session_id: string;
  wallet_address: string;
  name?: string;
}>> {
  const adminClient = getAdminClient();
  
  // Cast to any to bypass strict Supabase typing (table schema not in generated types)
  const { data, error } = await (adminClient
    .from('wallets') as any)
    .select('id, session_id, public_key, label, is_primary, user_id')
    .eq('session_id', sessionId);
  
  if (error) {
    console.error('[VOLUME_BOT] Error fetching wallets:', error);
    return [];
  }
  
  return (data || []).map((w: any) => ({
    wallet_id: w.id,
    user_id: w.user_id || sessionId,
    session_id: w.session_id,
    wallet_address: w.public_key,
    name: w.label
  }));
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthFromHeaders(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { searchParams } = new URL(request.url);
    const tokenMint = searchParams.get('tokenMint');
    
    if (tokenMint) {
      // Get specific session
      const sessionInfo = getSessionStatus(auth.sessionId, tokenMint);
      
      return NextResponse.json({
        success: true,
        data: sessionInfo ? {
          status: sessionInfo.session?.status || 'stopped',
          executedVolumeSol: sessionInfo.session?.executedVolumeSol || 0,
          targetVolumeSol: sessionInfo.session?.targetVolumeSol || 0,
          totalTrades: sessionInfo.session?.totalTrades || 0,
          successfulTrades: sessionInfo.session?.successfulTrades || 0,
          buyCount: sessionInfo.session?.buyCount || 0,
          sellCount: sessionInfo.session?.sellCount || 0,
          netPnlSol: sessionInfo.session?.netPnlSol || 0,
        } : null,
        isRunning: !!sessionInfo,
      });
    } else {
      // List all active sessions
      const sessions = listActiveSessions(auth.sessionId);
      
      return NextResponse.json({
        success: true,
        activeSessions: sessions.length,
        sessions: sessions.map(s => ({
          tokenMint: s.session.tokenMint,
          status: s.session.status,
          executedVolume: s.session.executedVolumeSol,
          targetVolume: s.session.targetVolumeSol,
          progressPercent: (s.session.executedVolumeSol / s.session.targetVolumeSol) * 100
        }))
      });
    }
  } catch (error) {
    console.error('[VOLUME_BOT_API] GET session error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to get session' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthFromHeaders(request);
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await request.json();
    const { action, tokenMint, config, walletIds, platform, currentPrice } = body;
    
    if (!tokenMint) {
      return NextResponse.json({ success: false, error: 'tokenMint is required' }, { status: 400 });
    }
    
    // Default to 'start' action if not specified (for backwards compatibility with panel)
    const actualAction = action || 'start';
    
    switch (actualAction) {
      case 'start': {
        // Get user wallets
        let wallets = await getUserWallets(auth.sessionId);
        
        // Filter by walletIds if specified
        if (walletIds && Array.isArray(walletIds) && walletIds.length > 0) {
          wallets = wallets.filter(w => walletIds.includes(w.wallet_id));
        }
        
        if (wallets.length === 0) {
          return NextResponse.json({
            success: false,
            error: 'No wallets available',
            tip: '👛 Add some wallets first! You need at least one to start the volume bot.'
          }, { status: 400 });
        }
        
        const { session, settings: savedSettings } = await startSession({
          userId: auth.sessionId,
          tokenMint,
          wallets,
          settings: config || body.settings,
          platform,
          currentPrice
        });
        
        return NextResponse.json({
          success: true,
          message: '🚀 Volume bot started! Charts go brrr now.',
          session: {
            id: session.id,
            tokenMint: session.tokenMint,
            status: session.status,
            targetVolume: session.targetVolumeSol
          },
          settings: {
            strategy: savedSettings.strategy,
            buyPressure: savedSettings.buyPressurePercent,
            tradeInterval: savedSettings.tradeIntervalMs
          },
          walletsUsed: wallets.length,
        });
      }
      
      case 'stop': {
        const stopped = await stopSession(auth.sessionId, tokenMint, 'manual');
        
        return NextResponse.json({
          success: true,
          stopped: !!stopped,
          message: stopped ? '🛑 Volume bot stopped.' : 'No active session found',
        });
      }
      
      case 'emergency_stop': {
        console.warn(`[VOLUME_BOT] 🚨 EMERGENCY STOP triggered by session ${auth.sessionId} for ${tokenMint}`);
        
        const stopped = await emergencyStop(auth.sessionId, tokenMint, {
          reason: body.reason || 'user_triggered',
          timestamp: Date.now()
        });
        
        return NextResponse.json({
          success: true,
          stopped,
          message: '🚨 EMERGENCY STOP executed! All trading halted.',
        });
      }
      
      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action',
          validActions: ['start', 'stop', 'emergency_stop'],
        }, { status: 400 });
    }
  } catch (error) {
    console.error('[VOLUME_BOT_API] POST session error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process request',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await getAuthFromHeaders(request);
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    
    const { searchParams } = new URL(request.url);
    const tokenMint = searchParams.get('tokenMint');
    
    if (!tokenMint) {
      return NextResponse.json({ success: false, error: 'tokenMint is required' }, { status: 400 });
    }
    
    const stopped = await stopSession(auth.sessionId, tokenMint, 'manual');
    
    return NextResponse.json({
      success: true,
      stopped: !!stopped,
      message: stopped ? '🛑 Volume bot stopped.' : 'No active session found',
    });
  } catch (error) {
    console.error('[VOLUME_BOT_API] DELETE session error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to stop session' },
      { status: 500 }
    );
  }
}

