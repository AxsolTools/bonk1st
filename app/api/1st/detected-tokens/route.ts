/**
 * BONK1ST - Detected Tokens API
 * 
 * Persists tokens detected by the sniper WebSocket to Supabase
 * GET: Load detected tokens for a session
 * POST: Save a new detected token
 * DELETE: Clear detected tokens for a session
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// GET - Load detected tokens for a session
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('sessionId')
    const pool = searchParams.get('pool') // Optional filter
    const limit = parseInt(searchParams.get('limit') || '100')
    
    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'Session ID required' },
        { status: 400 }
      )
    }
    
    const supabase = await createClient()
    
    let query = supabase
      .from('sniper_detected_tokens')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(limit)
    
    // Filter by pool type if specified
    if (pool && pool !== 'all') {
      query = query.eq('pool', pool)
    }
    
    const { data, error } = await query
    
    if (error) {
      console.error('[DETECTED-TOKENS] Load error:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to load detected tokens' },
        { status: 500 }
      )
    }
    
    // Transform to match NewTokenEvent interface
    const tokens = (data || []).map(row => ({
      tokenMint: row.token_mint,
      tokenSymbol: row.token_symbol,
      tokenName: row.token_name,
      tokenLogo: row.token_logo,
      pool: row.pool,
      quoteMint: row.quote_mint,
      creationBlock: row.creation_block,
      creationTimestamp: new Date(row.creation_timestamp).getTime(),
      creationTxSignature: row.creation_tx_signature,
      creatorWallet: row.creator_wallet,
      initialLiquidityUsd: parseFloat(row.initial_liquidity_usd) || 0,
      initialMarketCap: parseFloat(row.initial_market_cap) || 0,
      hasWebsite: row.has_website,
      hasTwitter: row.has_twitter,
      hasTelegram: row.has_telegram,
      passesFilters: row.passes_filters,
      filterResults: row.filter_results || [],
    }))
    
    return NextResponse.json({
      success: true,
      data: tokens,
      count: tokens.length,
    })
  } catch (error) {
    console.error('[DETECTED-TOKENS] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST - Save a detected token
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sessionId, token } = body
    
    if (!sessionId || !token?.tokenMint) {
      return NextResponse.json(
        { success: false, error: 'Session ID and token data required' },
        { status: 400 }
      )
    }
    
    const supabase = await createClient()
    
    // Upsert the detected token
    const { data, error } = await supabase
      .from('sniper_detected_tokens')
      .upsert({
        token_mint: token.tokenMint,
        token_symbol: token.tokenSymbol,
        token_name: token.tokenName,
        token_logo: token.tokenLogo,
        pool: token.pool,
        quote_mint: token.quoteMint,
        creation_block: token.creationBlock || 0,
        creation_timestamp: token.creationTimestamp 
          ? new Date(token.creationTimestamp).toISOString() 
          : new Date().toISOString(),
        creation_tx_signature: token.creationTxSignature,
        creator_wallet: token.creatorWallet,
        initial_liquidity_usd: token.initialLiquidityUsd || 0,
        initial_market_cap: token.initialMarketCap || 0,
        has_website: token.hasWebsite || false,
        has_twitter: token.hasTwitter || false,
        has_telegram: token.hasTelegram || false,
        passes_filters: token.passesFilters || false,
        filter_results: token.filterResults || [],
        session_id: sessionId,
      }, {
        onConflict: 'token_mint,session_id',
        ignoreDuplicates: false,
      })
      .select()
      .single()
    
    if (error) {
      console.error('[DETECTED-TOKENS] Save error:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to save detected token' },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      success: true,
      data: data,
    })
  } catch (error) {
    console.error('[DETECTED-TOKENS] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE - Clear detected tokens for a session
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('sessionId')
    const tokenMint = searchParams.get('tokenMint') // Optional: delete specific token
    
    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'Session ID required' },
        { status: 400 }
      )
    }
    
    const supabase = await createClient()
    
    let query = supabase
      .from('sniper_detected_tokens')
      .delete()
      .eq('session_id', sessionId)
    
    // Delete specific token if specified
    if (tokenMint) {
      query = query.eq('token_mint', tokenMint)
    }
    
    const { error } = await query
    
    if (error) {
      console.error('[DETECTED-TOKENS] Delete error:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to delete detected tokens' },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      success: true,
      message: tokenMint 
        ? `Deleted token ${tokenMint}` 
        : 'Cleared all detected tokens',
    })
  } catch (error) {
    console.error('[DETECTED-TOKENS] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

