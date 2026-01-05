/**
 * AQUA Launchpad - Token22 Parameters API
 * 
 * Manages Token-2022 specific settings:
 * - Liquidity engine (auto-harvest, auto-add-liquidity)
 * - Fee distribution (burn %, liquidity %, creator %)
 * - Harvest intervals and minimums
 */

import { type NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

// ============================================================================
// TYPES
// ============================================================================

interface Token22ParametersUpdate {
  // Liquidity Engine
  liquidityEngineEnabled?: boolean;
  autoHarvestEnabled?: boolean;
  autoAddLiquidityEnabled?: boolean;
  harvestIntervalMinutes?: number;
  minHarvestAmountTokens?: number;
  
  // Fee Distribution (must sum to 100)
  feeToLiquidityPercent?: number;
  feeToBurnPercent?: number;
  feeToCreatorPercent?: number;
  
  // Burn Mechanics
  burnEnabled?: boolean;
  burnOnHarvestPercent?: number;
}

// ============================================================================
// GET - Fetch Token22 parameters
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tokenId = searchParams.get('tokenId');
    const mintAddress = searchParams.get('mint');

    if (!tokenId && !mintAddress) {
      return NextResponse.json(
        { success: false, error: { code: 4002, message: 'Token ID or mint address required' } },
        { status: 400 }
      );
    }

    const adminClient = getAdminClient();

    // Build query
    // Cast to any to bypass strict Supabase typing (table schema not in generated types)
    let query = (adminClient
      .from('token22_parameters') as any)
      .select('*');

    if (tokenId) {
      query = query.eq('token_id', tokenId);
    } else if (mintAddress) {
      // Join with tokens table to find by mint address
      const { data: token } = await (adminClient
        .from('tokens') as any)
        .select('id')
        .eq('mint_address', mintAddress)
        .single();

      if (!token) {
        return NextResponse.json(
          { success: false, error: { code: 4004, message: 'Token not found' } },
          { status: 404 }
        );
      }

      query = query.eq('token_id', token.id);
    }

    const { data: params, error } = await query.single();

    if (error && error.code !== 'PGRST116') {
      console.error('[TOKEN22-PARAMS] Query error:', error);
      return NextResponse.json(
        { success: false, error: { code: 4000, message: 'Failed to fetch parameters' } },
        { status: 500 }
      );
    }

    // Return empty defaults if no parameters exist yet
    if (!params) {
      return NextResponse.json({
        success: true,
        data: {
          liquidityEngineEnabled: false,
          autoHarvestEnabled: false,
          autoAddLiquidityEnabled: false,
          harvestIntervalMinutes: 60,
          minHarvestAmountTokens: 0,
          feeToLiquidityPercent: 50,
          feeToBurnPercent: 25,
          feeToCreatorPercent: 25,
          burnEnabled: false,
          burnOnHarvestPercent: 0,
          lastHarvestAt: null,
          totalHarvestedTokens: '0',
          totalBurnedTokens: '0',
          totalAddedToLiquiditySol: 0,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        liquidityEngineEnabled: params.liquidity_engine_enabled,
        autoHarvestEnabled: params.auto_harvest_enabled,
        autoAddLiquidityEnabled: params.auto_add_liquidity_enabled,
        harvestIntervalMinutes: params.harvest_interval_minutes,
        minHarvestAmountTokens: params.min_harvest_amount_tokens,
        feeToLiquidityPercent: params.fee_to_liquidity_percent,
        feeToBurnPercent: params.fee_to_burn_percent,
        feeToCreatorPercent: params.fee_to_creator_percent,
        burnEnabled: params.burn_enabled,
        burnOnHarvestPercent: params.burn_on_harvest_percent,
        lastHarvestAt: params.last_harvest_at,
        totalHarvestedTokens: params.total_harvested_tokens,
        totalBurnedTokens: params.total_burned_tokens,
        totalAddedToLiquiditySol: params.total_added_to_liquidity_sol,
      },
    });
  } catch (error) {
    console.error('[TOKEN22-PARAMS] GET error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 4000,
          message: 'Failed to fetch parameters',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST - Create or update Token22 parameters
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    // Get auth headers
    const sessionId = request.headers.get('x-session-id');
    const walletAddress = request.headers.get('x-wallet-address');

    if (!sessionId || !walletAddress) {
      return NextResponse.json(
        { success: false, error: { code: 1001, message: 'Wallet connection required' } },
        { status: 401 }
      );
    }

    const adminClient = getAdminClient();
    const body = await request.json();
    const { tokenId, mintAddress, ...updates } = body as Token22ParametersUpdate & { tokenId?: string; mintAddress?: string };

    // Validate tokenId or mintAddress
    let resolvedTokenId = tokenId;
    
    if (!tokenId && mintAddress) {
      const { data: token } = await (adminClient
        .from('tokens') as any)
        .select('id, creator_wallet')
        .eq('mint_address', mintAddress)
        .single();

      if (!token) {
        return NextResponse.json(
          { success: false, error: { code: 4004, message: 'Token not found' } },
          { status: 404 }
        );
      }

      // Verify caller is the creator
      if (token.creator_wallet?.toLowerCase() !== walletAddress.toLowerCase()) {
        return NextResponse.json(
          { success: false, error: { code: 1002, message: 'Only token creator can update parameters' } },
          { status: 403 }
        );
      }

      resolvedTokenId = token.id;
    }

    if (!resolvedTokenId) {
      return NextResponse.json(
        { success: false, error: { code: 4002, message: 'Token ID or mint address required' } },
        { status: 400 }
      );
    }

    // Validate fee distribution sums to 100
    if (
      updates.feeToLiquidityPercent !== undefined ||
      updates.feeToBurnPercent !== undefined ||
      updates.feeToCreatorPercent !== undefined
    ) {
      // Get current values for any not being updated
      const { data: current } = await (adminClient
        .from('token22_parameters') as any)
        .select('fee_to_liquidity_percent, fee_to_burn_percent, fee_to_creator_percent')
        .eq('token_id', resolvedTokenId)
        .single();

      const liquidityPct = updates.feeToLiquidityPercent ?? current?.fee_to_liquidity_percent ?? 50;
      const burnPct = updates.feeToBurnPercent ?? current?.fee_to_burn_percent ?? 25;
      const creatorPct = updates.feeToCreatorPercent ?? current?.fee_to_creator_percent ?? 25;

      if (liquidityPct + burnPct + creatorPct !== 100) {
        return NextResponse.json(
          { success: false, error: { code: 4003, message: 'Fee distribution must sum to 100%' } },
          { status: 400 }
        );
      }
    }

    // Build update object
    const updateData: Record<string, unknown> = {};
    
    if (updates.liquidityEngineEnabled !== undefined) updateData.liquidity_engine_enabled = updates.liquidityEngineEnabled;
    if (updates.autoHarvestEnabled !== undefined) updateData.auto_harvest_enabled = updates.autoHarvestEnabled;
    if (updates.autoAddLiquidityEnabled !== undefined) updateData.auto_add_liquidity_enabled = updates.autoAddLiquidityEnabled;
    if (updates.harvestIntervalMinutes !== undefined) updateData.harvest_interval_minutes = updates.harvestIntervalMinutes;
    if (updates.minHarvestAmountTokens !== undefined) updateData.min_harvest_amount_tokens = updates.minHarvestAmountTokens;
    if (updates.feeToLiquidityPercent !== undefined) updateData.fee_to_liquidity_percent = updates.feeToLiquidityPercent;
    if (updates.feeToBurnPercent !== undefined) updateData.fee_to_burn_percent = updates.feeToBurnPercent;
    if (updates.feeToCreatorPercent !== undefined) updateData.fee_to_creator_percent = updates.feeToCreatorPercent;
    if (updates.burnEnabled !== undefined) updateData.burn_enabled = updates.burnEnabled;
    if (updates.burnOnHarvestPercent !== undefined) updateData.burn_on_harvest_percent = updates.burnOnHarvestPercent;

    // Upsert parameters
    const { data, error } = await (adminClient
      .from('token22_parameters') as any)
      .upsert({
        token_id: resolvedTokenId,
        dev_wallet_address: walletAddress,
        ...updateData,
      }, {
        onConflict: 'token_id',
      })
      .select()
      .single();

    if (error) {
      console.error('[TOKEN22-PARAMS] Upsert error:', error);
      return NextResponse.json(
        { success: false, error: { code: 4000, message: 'Failed to update parameters' } },
        { status: 500 }
      );
    }

    console.log(`[TOKEN22-PARAMS] Updated parameters for token ${resolvedTokenId}`);

    return NextResponse.json({
      success: true,
      data: {
        tokenId: resolvedTokenId,
        liquidityEngineEnabled: data.liquidity_engine_enabled,
        autoHarvestEnabled: data.auto_harvest_enabled,
        autoAddLiquidityEnabled: data.auto_add_liquidity_enabled,
        harvestIntervalMinutes: data.harvest_interval_minutes,
        feeToLiquidityPercent: data.fee_to_liquidity_percent,
        feeToBurnPercent: data.fee_to_burn_percent,
        feeToCreatorPercent: data.fee_to_creator_percent,
      },
    });
  } catch (error) {
    console.error('[TOKEN22-PARAMS] POST error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 4000,
          message: 'Failed to update parameters',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
}

