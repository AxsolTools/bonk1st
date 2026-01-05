/**
 * AQUA Launchpad - Comment Like API
 * 
 * POST: Like a comment
 * DELETE: Unlike a comment
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

// POST - Like a comment
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ address: string; commentId: string }> }
) {
  try {
    const { address, commentId } = await params;
    const walletAddress = request.headers.get('x-wallet-address');
    const userId = request.headers.get('x-user-id');
    
    if (!walletAddress) {
      return NextResponse.json(
        { success: false, error: { code: 1001, message: 'Wallet connection required' } },
        { status: 401 }
      );
    }
    
    const adminClient = getAdminClient();
    
    // Verify comment exists
    // Cast to any to bypass strict Supabase typing (table schema not in generated types)
    const { data: comment } = await (adminClient
      .from('token_comments') as any)
      .select('id, likes_count')
      .eq('id', commentId)
      .single();
    
    if (!comment) {
      return NextResponse.json(
        { success: false, error: { code: 4001, message: 'Comment not found' } },
        { status: 404 }
      );
    }
    
    // Check if already liked
    const { data: existingLike } = await (adminClient
      .from('comment_likes') as any)
      .select('id')
      .eq('comment_id', commentId)
      .eq('wallet_address', walletAddress)
      .single();
    
    if (existingLike) {
      return NextResponse.json(
        { success: false, error: { code: 4002, message: 'Already liked' } },
        { status: 400 }
      );
    }
    
    // Insert like
    const { error } = await (adminClient
      .from('comment_likes') as any)
      .insert({
        comment_id: commentId,
        user_id: userId,
        wallet_address: walletAddress,
      });
    
    if (error) {
      throw error;
    }
    
    return NextResponse.json({
      success: true,
      data: {
        liked: true,
        likesCount: comment.likes_count + 1,
      },
    });
    
  } catch (error) {
    console.error('[API] Comment like error:', error);
    return NextResponse.json(
      { success: false, error: { code: 4000, message: 'Failed to like comment' } },
      { status: 500 }
    );
  }
}

// DELETE - Unlike a comment
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ address: string; commentId: string }> }
) {
  try {
    const { address, commentId } = await params;
    const walletAddress = request.headers.get('x-wallet-address');
    
    if (!walletAddress) {
      return NextResponse.json(
        { success: false, error: { code: 1001, message: 'Wallet connection required' } },
        { status: 401 }
      );
    }
    
    const adminClient = getAdminClient();
    
    // Get current like count
    const { data: comment } = await (adminClient
      .from('token_comments') as any)
      .select('likes_count')
      .eq('id', commentId)
      .single();
    
    // Delete like
    const { error } = await (adminClient
      .from('comment_likes') as any)
      .delete()
      .eq('comment_id', commentId)
      .eq('wallet_address', walletAddress);
    
    if (error) {
      throw error;
    }
    
    return NextResponse.json({
      success: true,
      data: {
        liked: false,
        likesCount: Math.max(0, (comment?.likes_count || 1) - 1),
      },
    });
    
  } catch (error) {
    console.error('[API] Comment unlike error:', error);
    return NextResponse.json(
      { success: false, error: { code: 4000, message: 'Failed to unlike comment' } },
      { status: 500 }
    );
  }
}

