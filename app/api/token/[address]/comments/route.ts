/**
 * AQUA Launchpad - Token Comments API
 * 
 * GET: Fetch comments (threaded, paginated)
 * POST: Post a new comment
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';

// GET - Fetch comments
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);
    const offset = parseInt(searchParams.get('offset') || '0');
    const parentId = searchParams.get('parentId'); // For fetching replies
    
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
      .from('token_comments')
      .select(`
        id,
        wallet_address,
        parent_id,
        content,
        username,
        avatar_url,
        likes_count,
        replies_count,
        is_edited,
        created_at,
        updated_at
      `)
      .eq('token_id', token.id)
      .eq('is_hidden', false);
    
    if (parentId) {
      query = query.eq('parent_id', parentId);
    } else {
      query = query.is('parent_id', null); // Top-level comments only
    }
    
    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    const { data: comments, error, count } = await query;
    
    if (error) {
      throw error;
    }
    
    // Get total count for top-level comments
    const { count: totalCount } = await supabase
      .from('token_comments')
      .select('*', { count: 'exact', head: true })
      .eq('token_id', token.id)
      .eq('is_hidden', false)
      .is('parent_id', null);
    
    return NextResponse.json({
      success: true,
      data: {
        comments: comments || [],
        total: totalCount || 0,
        hasMore: (comments?.length || 0) === limit,
        offset,
        limit,
      },
    });
    
  } catch (error) {
    console.error('[API] Comments GET error:', error);
    return NextResponse.json(
      { success: false, error: { code: 4000, message: 'Failed to fetch comments' } },
      { status: 500 }
    );
  }
}

// POST - Create a comment
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
    const { content, parentId, username, avatarUrl } = body;
    
    // Validate content
    if (!content || typeof content !== 'string') {
      return NextResponse.json(
        { success: false, error: { code: 4002, message: 'Content is required' } },
        { status: 400 }
      );
    }
    
    if (content.length > 2000) {
      return NextResponse.json(
        { success: false, error: { code: 4002, message: 'Comment too long (max 2000 characters)' } },
        { status: 400 }
      );
    }
    
    const adminClient = getAdminClient();
    
    // Get token ID
    // Cast to any to bypass strict Supabase typing (table schema not in generated types)
    const { data: token } = await (adminClient
      .from('tokens') as any)
      .select('id')
      .eq('mint_address', address)
      .single();
    
    if (!token) {
      return NextResponse.json(
        { success: false, error: { code: 4001, message: 'Token not found' } },
        { status: 404 }
      );
    }
    
    // Verify parent exists if replying
    if (parentId) {
      const { data: parent } = await (adminClient
        .from('token_comments') as any)
        .select('id')
        .eq('id', parentId)
        .eq('token_id', token.id)
        .single();
      
      if (!parent) {
        return NextResponse.json(
          { success: false, error: { code: 4002, message: 'Parent comment not found' } },
          { status: 400 }
        );
      }
    }
    
    // Insert comment
    const { data: comment, error } = await (adminClient
      .from('token_comments') as any)
      .insert({
        token_id: token.id,
        user_id: userId,
        wallet_address: walletAddress,
        parent_id: parentId || null,
        content: content.trim(),
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
        comment,
      },
    });
    
  } catch (error) {
    console.error('[API] Comments POST error:', error);
    return NextResponse.json(
      { success: false, error: { code: 4000, message: 'Failed to post comment' } },
      { status: 500 }
    );
  }
}

