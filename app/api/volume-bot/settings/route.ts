/**
 * Volume Bot Settings API
 * 
 * 🎮 Configure your money printer
 * 
 * GET /api/volume-bot/settings?tokenMint=xxx
 *   → Get settings for a token
 * 
 * POST /api/volume-bot/settings
 *   → Create or update settings
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSettings, saveSettings } from '@/lib/volume-bot';

// Get authenticated user from session headers
function getAuthFromHeaders(request: NextRequest): { sessionId: string; userId: string } | null {
  const sessionId = request.headers.get('x-session-id');
  const userId = request.headers.get('x-user-id') || sessionId;
  
  if (!sessionId) return null;
  
  return { sessionId, userId: userId || sessionId };
}

export async function GET(request: NextRequest) {
  try {
    const auth = getAuthFromHeaders(request);
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    
    const { searchParams } = new URL(request.url);
    const tokenMint = searchParams.get('tokenMint');
    
    if (!tokenMint) {
      return NextResponse.json({ success: false, error: 'tokenMint is required' }, { status: 400 });
    }
    
    const settings = await getSettings(auth.sessionId, tokenMint);
    
    return NextResponse.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error('[VOLUME_BOT_API] GET settings error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to get settings' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = getAuthFromHeaders(request);
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await request.json();
    const { tokenMint, settings } = body;
    
    if (!tokenMint) {
      return NextResponse.json({ success: false, error: 'tokenMint is required' }, { status: 400 });
    }
    
    // Validate settings
    if (settings) {
      // Buy pressure must be 0-100
      if (settings.buyPressurePercent !== undefined) {
        if (settings.buyPressurePercent < 0 || settings.buyPressurePercent > 100) {
          return NextResponse.json({ 
            success: false,
            error: 'buyPressurePercent must be between 0 and 100',
          }, { status: 400 });
        }
      }
      
      // Target volume must be positive
      if (settings.targetVolumeSol !== undefined && settings.targetVolumeSol <= 0) {
        return NextResponse.json({ 
          success: false,
          error: 'targetVolumeSol must be positive',
        }, { status: 400 });
      }
      
      // Emergency stop should stay enabled (strong warning)
      if (settings.emergencyStopEnabled === false) {
        console.warn(`[VOLUME_BOT] ⚠️ Session ${auth.sessionId} disabled emergency stop!`);
      }
    }
    
    const savedSettings = await saveSettings(auth.sessionId, tokenMint, settings || {});
    
    return NextResponse.json({
      success: true,
      data: savedSettings,
    });
  } catch (error) {
    console.error('[VOLUME_BOT_API] POST settings error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to save settings' },
      { status: 500 }
    );
  }
}

