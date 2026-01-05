/**
 * AQUA Launchpad - Token Parameters API
 * 
 * GET: Fetch token parameters (public)
 * PATCH: Update token parameters (creator only)
 * 
 * Handles:
 * - Pour Rate settings
 * - Evaporation settings
 * - Fee distribution
 * - Trading controls
 * - Tide Harvest (auto-claim) settings
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';

interface TokenParams {
  pour_enabled?: boolean;
  pour_rate_percent?: number;
  pour_interval_seconds?: number;
  pour_source?: 'fees' | 'treasury' | 'both';
  pour_max_per_interval_sol?: number;
  pour_min_trigger_sol?: number;
  
  evaporation_enabled?: boolean;
  evaporation_rate_percent?: number;
  evaporation_interval_seconds?: number;
  evaporation_source?: 'fees' | 'treasury' | 'both';
  
  fee_to_liquidity_percent?: number;
  fee_to_creator_percent?: number;
  
  auto_claim_enabled?: boolean;
  claim_threshold_sol?: number;
  claim_interval_seconds?: number;
  claim_destination_wallet?: string;
  
  max_buy_percent?: number;
  max_sell_percent?: number;
  cooldown_seconds?: number;
  anti_snipe_blocks?: number;
  
  migration_target?: 'raydium' | 'meteora' | 'orca' | 'pumpswap';
  post_migration_pour_enabled?: boolean;
  treasury_wallet?: string;
  
  dev_wallet_address?: string;
  dev_wallet_auto_enabled?: boolean;
}

// GET - Fetch token parameters
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;
    
    if (!address) {
      return NextResponse.json(
        { success: false, error: { code: 4001, message: 'Token address required' } },
        { status: 400 }
      );
    }
    
    const supabase = await createClient();
    
    // Get token and parameters
    const { data: token, error: tokenError } = await supabase
      .from('tokens')
      .select(`
        id,
        mint_address,
        name,
        symbol,
        creator_wallet,
        stage,
        token_parameters (*)
      `)
      .eq('mint_address', address)
      .single();
    
    if (tokenError || !token) {
      return NextResponse.json(
        { success: false, error: { code: 4001, message: 'Token not found' } },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      data: {
        tokenId: token.id,
        mintAddress: token.mint_address,
        name: token.name,
        symbol: token.symbol,
        creatorWallet: token.creator_wallet,
        stage: token.stage,
        parameters: token.token_parameters,
      },
    });
    
  } catch (error) {
    console.error('[API] Token parameters GET error:', error);
    return NextResponse.json(
      { success: false, error: { code: 4000, message: 'Failed to fetch parameters' } },
      { status: 500 }
    );
  }
}

// PATCH - Update token parameters (creator only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;
    const walletAddress = request.headers.get('x-wallet-address');
    const userId = request.headers.get('x-user-id');
    
    if (!walletAddress) {
      return NextResponse.json(
        { success: false, error: { code: 1001, message: 'Wallet connection required' } },
        { status: 401 }
      );
    }
    
    const adminClient = getAdminClient();
    
    // Verify token exists and user is creator
    // Cast to any to bypass strict Supabase typing (table schema not in generated types)
    const { data: token, error: tokenError } = await (adminClient
      .from('tokens') as any)
      .select('id, creator_wallet')
      .eq('mint_address', address)
      .single();
    
    if (tokenError || !token) {
      return NextResponse.json(
        { success: false, error: { code: 4001, message: 'Token not found' } },
        { status: 404 }
      );
    }
    
    // Verify ownership
    if (token.creator_wallet !== walletAddress) {
      return NextResponse.json(
        { success: false, error: { code: 4003, message: 'Only the token creator can update parameters' } },
        { status: 403 }
      );
    }
    
    const body: TokenParams = await request.json();
    
    // Validate parameters
    const validationError = validateParameters(body);
    if (validationError) {
      return NextResponse.json(
        { success: false, error: { code: 4003, message: validationError } },
        { status: 400 }
      );
    }
    
    // Get current parameters for optimistic locking
    const { data: currentParams } = await (adminClient
      .from('token_parameters') as any)
      .select('version')
      .eq('token_id', token.id)
      .single();
    
    // Build update object
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
      updated_by: userId,
    };
    
    // Map allowed fields
    const allowedFields: (keyof TokenParams)[] = [
      'pour_enabled', 'pour_rate_percent', 'pour_interval_seconds',
      'pour_source', 'pour_max_per_interval_sol', 'pour_min_trigger_sol',
      'evaporation_enabled', 'evaporation_rate_percent', 'evaporation_interval_seconds',
      'evaporation_source',
      'fee_to_liquidity_percent', 'fee_to_creator_percent',
      'auto_claim_enabled', 'claim_threshold_sol', 'claim_interval_seconds',
      'claim_destination_wallet',
      'max_buy_percent', 'max_sell_percent', 'cooldown_seconds', 'anti_snipe_blocks',
      'migration_target', 'post_migration_pour_enabled', 'treasury_wallet',
      'dev_wallet_address', 'dev_wallet_auto_enabled',
    ];
    
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }
    
    // Update parameters
    const { data: updated, error: updateError } = await (adminClient
      .from('token_parameters') as any)
      .update(updateData)
      .eq('token_id', token.id)
      .select()
      .single();
    
    if (updateError) {
      console.error('[API] Parameter update error:', updateError);
      return NextResponse.json(
        { success: false, error: { code: 4003, message: 'Failed to update parameters' } },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      data: {
        parameters: updated,
        version: updated.version,
      },
    });
    
  } catch (error) {
    console.error('[API] Token parameters PATCH error:', error);
    return NextResponse.json(
      { success: false, error: { code: 4000, message: 'Failed to update parameters' } },
      { status: 500 }
    );
  }
}

// Parameter validation
function validateParameters(params: TokenParams): string | null {
  // Pour rate validation
  if (params.pour_rate_percent !== undefined) {
    if (params.pour_rate_percent < 0 || params.pour_rate_percent > 100) {
      return 'Pour rate must be between 0 and 100';
    }
  }
  
  if (params.pour_interval_seconds !== undefined) {
    if (params.pour_interval_seconds < 300) {
      return 'Pour interval must be at least 300 seconds (5 minutes)';
    }
  }
  
  // Evaporation validation
  if (params.evaporation_rate_percent !== undefined) {
    if (params.evaporation_rate_percent < 0 || params.evaporation_rate_percent > 5) {
      return 'Evaporation rate must be between 0 and 5';
    }
  }
  
  // Fee distribution validation
  if (params.fee_to_liquidity_percent !== undefined || params.fee_to_creator_percent !== undefined) {
    const liquidityPercent = params.fee_to_liquidity_percent ?? 25;
    const creatorPercent = params.fee_to_creator_percent ?? 75;
    
    if (liquidityPercent + creatorPercent !== 100) {
      return 'Fee distribution must total 100%';
    }
  }
  
  // Trading controls validation
  if (params.max_buy_percent !== undefined) {
    if (params.max_buy_percent <= 0 || params.max_buy_percent > 100) {
      return 'Max buy percent must be between 0 and 100';
    }
  }
  
  if (params.max_sell_percent !== undefined) {
    if (params.max_sell_percent <= 0 || params.max_sell_percent > 100) {
      return 'Max sell percent must be between 0 and 100';
    }
  }
  
  if (params.cooldown_seconds !== undefined) {
    if (params.cooldown_seconds < 0) {
      return 'Cooldown cannot be negative';
    }
  }
  
  return null;
}

