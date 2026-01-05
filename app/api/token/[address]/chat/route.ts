/**
 * AQUA Launchpad - Token Chat API
 * 
 * GET: Fetch chat messages (paginated)
 * POST: Send a chat message
 * 
 * Real-time updates handled via Supabase Realtime subscriptions
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';

// GET - Fetch chat messages
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const before = searchParams.get('before'); // Cursor for pagination
    
    const supabase = await createClient();
    
    // Get token ID
    const { data: token } = await supabase
      .from('tokens')
      .select('id')
      .eq('mint_address', address)
      .single();
    
    if (!token) {
      return NextResponse.json(
        { success: false, error: { code: 4001, message: 'Token not found' } },
        { status: 404 }
      );
    }
    
    // Build query
    let query = supabase
      .from('token_chat')
      .select(`
        id,
        wallet_address,
        message,
        username,
        avatar_url,
        created_at
      `)
      .eq('token_id', token.id)
      .eq('is_hidden', false)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (before) {
      query = query.lt('created_at', before);
    }
    
    const { data: messages, error } = await query;
    
    if (error) {
      throw error;
    }
    
    return NextResponse.json({
      success: true,
      data: {
        messages: messages || [],
        hasMore: messages?.length === limit,
        nextCursor: messages?.length ? messages[messages.length - 1].created_at : null,
      },
    });
    
  } catch (error) {
    console.error('[API] Chat GET error:', error);
    return NextResponse.json(
      { success: false, error: { code: 4000, message: 'Failed to fetch chat' } },
      { status: 500 }
    );
  }
}

// POST - Send a chat message
export async function POST(
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
    
    const body = await request.json();
    const { message, username, avatarUrl } = body;
    
    // Validate message
    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { success: false, error: { code: 4002, message: 'Message is required' } },
        { status: 400 }
      );
    }
    
    if (message.length > 500) {
      return NextResponse.json(
        { success: false, error: { code: 4002, message: 'Message too long (max 500 characters)' } },
        { status: 400 }
      );
    }
    
    const adminClient = getAdminClient();
    
    // Get token ID
    const { data: token } = await adminClient
      .from('tokens')
      .select('id')
      .eq('mint_address', address)
      .single();
    
    if (!token) {
      return NextResponse.json(
        { success: false, error: { code: 4001, message: 'Token not found' } },
        { status: 404 }
      );
    }
    
    // Insert message
    const { data: chatMessage, error } = await adminClient
      .from('token_chat')
      .insert({
        token_id: token.id,
        user_id: userId,
        wallet_address: walletAddress,
        message: message.trim(),
        username: username || walletAddress.slice(0, 4) + '...' + walletAddress.slice(-4),
        avatar_url: avatarUrl,
      })
      .select()
      .single();
    
    if (error) {
      throw error;
    }
    
    return NextResponse.json({
      success: true,
      data: {
        message: chatMessage,
      },
    });
    
  } catch (error) {
    console.error('[API] Chat POST error:', error);
    return NextResponse.json(
      { success: false, error: { code: 4000, message: 'Failed to send message' } },
      { status: 500 }
    );
  }
}

