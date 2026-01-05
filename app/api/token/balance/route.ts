/**
 * Token Balance API
 * 
 * GET /api/token/balance?wallet={walletAddress}&mint={tokenMint}
 * Fetches the balance of a specific SPL token for a wallet
 */

import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token';

export const dynamic = 'force-dynamic';

const RPC_URL = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const walletAddress = searchParams.get('wallet');
    const tokenMint = searchParams.get('mint');
    
    if (!walletAddress || !tokenMint) {
      return NextResponse.json(
        { success: false, error: { message: 'Missing wallet or mint parameter', code: 2003 } },
        { status: 400 }
      );
    }
    
    // Validate addresses
    let walletPubkey: PublicKey;
    let mintPubkey: PublicKey;
    
    try {
      walletPubkey = new PublicKey(walletAddress);
      mintPubkey = new PublicKey(tokenMint);
    } catch {
      return NextResponse.json(
        { success: false, error: { message: 'Invalid wallet or mint address', code: 2003 } },
        { status: 400 }
      );
    }
    
    const connection = new Connection(RPC_URL, 'confirmed');
    
    // Get the associated token account address
    const ataAddress = await getAssociatedTokenAddress(mintPubkey, walletPubkey);
    
    let balance = 0;
    let rawBalance = '0';
    
    try {
      const tokenAccount = await getAccount(connection, ataAddress);
      rawBalance = tokenAccount.amount.toString();
      
      // Get token decimals
      // For simplicity, we'll assume 6 decimals (common for most SPL tokens)
      // In production, you'd fetch this from the mint account
      const decimals = 6;
      balance = Number(tokenAccount.amount) / Math.pow(10, decimals);
      
    } catch (err: any) {
      // Account doesn't exist = 0 balance
      if (err.name === 'TokenAccountNotFoundError') {
        balance = 0;
        rawBalance = '0';
      } else {
        console.error('[API/TOKEN/BALANCE] Error fetching token account:', err);
        // Return 0 balance on error
        balance = 0;
        rawBalance = '0';
      }
    }
    
    return NextResponse.json({
      success: true,
      data: {
        wallet: walletAddress,
        mint: tokenMint,
        balance,
        rawBalance,
        ataAddress: ataAddress.toBase58(),
      },
      timestamp: Date.now(),
    });
    
  } catch (error) {
    console.error('[API/TOKEN/BALANCE] Error:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Failed to fetch token balance',
          code: 'BALANCE_FETCH_ERROR',
        },
      },
      { status: 500 }
    );
  }
}

