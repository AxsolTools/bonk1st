/**
 * Volume Bot Smart Profit API
 * 
 * Endpoints for managing Smart Profit settings and monitoring
 * 
 * GET: Retrieve current settings and state
 * POST: Update settings or trigger actions
 * DELETE: Stop monitoring
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import {
  SmartProfitManager,
  loadSmartProfitSettings,
  saveSmartProfitSettings,
  SmartProfitSettings
} from '@/lib/volume-bot';

// Active managers by userId:tokenMint
const activeManagers = new Map<string, SmartProfitManager>();

// ============================================================================
// GET - Retrieve settings and state
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const sessionId = request.headers.get('x-session-id');
    const userId = request.headers.get('x-user-id') || sessionId;

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const tokenMint = searchParams.get('tokenMint');

    if (!tokenMint) {
      return NextResponse.json(
        { success: false, error: 'tokenMint is required' },
        { status: 400 }
      );
    }

    // Get settings from database - use sessionId as the key
    const settings = await loadSmartProfitSettings(sessionId, tokenMint);

    // Get current state if manager is active
    const managerKey = `${sessionId}:${tokenMint}`;
    const manager = activeManagers.get(managerKey);
    const state = manager?.getState() || null;

    return NextResponse.json({
      success: true,
      data: {
        settings,
        state,
        isActive: manager?.getState().isMonitoring || false
      }
    });
  } catch (error) {
    console.error('[SMART_PROFIT_API] GET error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST - Update settings or trigger actions
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const sessionId = request.headers.get('x-session-id');
    const userId = request.headers.get('x-user-id') || sessionId;

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { action, tokenMint, settings: newSettings } = body;

    if (!tokenMint) {
      return NextResponse.json(
        { success: false, error: 'tokenMint is required' },
        { status: 400 }
      );
    }

    const managerKey = `${sessionId}:${tokenMint}`;

    // Handle different actions
    switch (action) {
      case 'start': {
        // Start monitoring
        if (activeManagers.has(managerKey)) {
          return NextResponse.json({
            success: true,
            message: 'Monitoring already active'
          });
        }

        // Load or create settings
        const loadedSettings = await loadSmartProfitSettings(sessionId, tokenMint);
        
        let settings: SmartProfitSettings = loadedSettings || {
          // Create default settings
          enabled: true,
          tokenMint,
          userId: sessionId,
          sessionId,
          walletIds: newSettings?.walletIds || [],
          walletAddresses: newSettings?.walletAddresses || [],
          averageEntryPrice: newSettings?.averageEntryPrice || 0,
          totalTokensHeld: newSettings?.totalTokensHeld || 0,
          totalSolInvested: newSettings?.totalSolInvested || 0,
          takeProfitEnabled: true,
          takeProfitPercent: 50,
          takeProfitSellPercent: 50,
          stopLossEnabled: true,
          stopLossPercent: 20,
          trailingStopEnabled: false,
          trailingStopPercent: 10,
          trailingStopActivationPercent: 20,
          emergencyStopEnabled: true,
          emergencyStopLossPercent: 50,
          slippageBps: 500,
          platform: 'jupiter'
        };

        // Merge with any new settings provided
        if (newSettings) {
          settings = { ...settings, ...newSettings, sessionId };
        }

        // Create and start manager
        const manager = new SmartProfitManager(settings);
        await manager.startMonitoring();
        activeManagers.set(managerKey, manager);

        // Save settings
        await saveSmartProfitSettings(settings);

        return NextResponse.json({
          success: true,
          message: 'Smart Profit monitoring started',
          state: manager.getState()
        });
      }

      case 'stop': {
        // Stop monitoring
        const manager = activeManagers.get(managerKey);
        if (manager) {
          manager.stopMonitoring();
          activeManagers.delete(managerKey);
        }

        return NextResponse.json({
          success: true,
          message: 'Smart Profit monitoring stopped'
        });
      }

      case 'emergency_stop': {
        // Emergency stop - sell all immediately
        const manager = activeManagers.get(managerKey);
        if (manager) {
          await manager.triggerEmergencyStop();
          activeManagers.delete(managerKey);
        }

        return NextResponse.json({
          success: true,
          message: 'Emergency stop executed'
        });
      }

      case 'update_settings': {
        // Update settings
        if (!newSettings) {
          return NextResponse.json(
            { success: false, error: 'settings object required' },
            { status: 400 }
          );
        }

        // Load existing settings
        let settings = await loadSmartProfitSettings(sessionId, tokenMint);
        if (!settings) {
          return NextResponse.json(
            { success: false, error: 'No existing settings found. Start monitoring first.' },
            { status: 404 }
          );
        }

        // Merge settings
        settings = { ...settings, ...newSettings };

        // Save to database
        await saveSmartProfitSettings(settings);

        // Update active manager if running
        const manager = activeManagers.get(managerKey);
        if (manager) {
          manager.updateSettings(settings);
        }

        return NextResponse.json({
          success: true,
          message: 'Settings updated',
          settings
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[SMART_PROFIT_API] POST error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE - Stop monitoring and clean up
// ============================================================================

export async function DELETE(request: NextRequest) {
  try {
    const sessionId = request.headers.get('x-session-id');

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const tokenMint = searchParams.get('tokenMint');

    if (!tokenMint) {
      return NextResponse.json(
        { success: false, error: 'tokenMint is required' },
        { status: 400 }
      );
    }

    const managerKey = `${sessionId}:${tokenMint}`;
    const manager = activeManagers.get(managerKey);

    if (manager) {
      manager.stopMonitoring();
      activeManagers.delete(managerKey);
    }

    return NextResponse.json({
      success: true,
      message: 'Smart Profit monitoring stopped and cleaned up'
    });
  } catch (error) {
    console.error('[SMART_PROFIT_API] DELETE error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

