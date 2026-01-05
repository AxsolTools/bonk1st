/**
 * AQUA Launchpad - PumpDotFun SDK Wrapper
 * 
 * Direct on-chain fallback when PumpPortal API is unavailable
 * Uses the official pumpdotfun-sdk cloned to lib/vendor/pumpdotfun-sdk
 * 
 * @see https://github.com/rckprtr/pumpdotfun-sdk
 */

import { 
  Connection, 
  Keypair, 
  PublicKey,
  LAMPORTS_PER_SOL,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { TradeResult } from './pumpfun';

// ============================================================================
// CONFIGURATION
// ============================================================================

// The SDK requires @coral-xyz/anchor which may not be installed
// We use dynamic imports to handle this gracefully
let PumpFunSDKClass: any = null;
let AnchorProvider: any = null;
let BN: any = null;
let sdkLoadAttempted = false;
let sdkAvailable = false;

// ============================================================================
// SDK INITIALIZATION
// ============================================================================

/**
 * Dynamically load the PumpDotFun SDK
 * Returns true if SDK is available
 */
async function loadSDK(): Promise<boolean> {
  if (sdkLoadAttempted) {
    return sdkAvailable;
  }
  
  sdkLoadAttempted = true;
  
  try {
    // Load dependencies
    const anchor = await import('@coral-xyz/anchor');
    AnchorProvider = anchor.AnchorProvider;
    
    // Load BN
    const bnModule = await import('bn.js');
    BN = bnModule.default || bnModule;
    
    // Load the SDK from npm package (installed via pnpm)
    const sdk = await import('pumpdotfun-sdk');
    PumpFunSDKClass = sdk.PumpFunSDK;
    sdkAvailable = true;
    console.log('[PUMP-SDK] SDK loaded successfully');
    return true;
  } catch (error) {
    console.warn('[PUMP-SDK] SDK not available:', error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * Create SDK instance with connection and wallet
 */
async function createSDKInstance(connection: Connection, wallet: Keypair): Promise<any | null> {
  const isLoaded = await loadSDK();
  if (!isLoaded || !PumpFunSDKClass || !AnchorProvider) {
    return null;
  }
  
  try {
    // Create a minimal wallet adapter for the Anchor provider
    const walletAdapter = {
      publicKey: wallet.publicKey,
      signTransaction: async (tx: Transaction) => {
        tx.sign(wallet);
        return tx;
      },
      signAllTransactions: async (txs: Transaction[]) => {
        txs.forEach(tx => tx.sign(wallet));
        return txs;
      },
    };
    
    const provider = new AnchorProvider(connection, walletAdapter, {
      commitment: 'confirmed',
    });
    
    return new PumpFunSDKClass(provider);
  } catch (error) {
    console.error('[PUMP-SDK] Failed to create SDK instance:', error);
    return null;
  }
}

// ============================================================================
// TRADING VIA SDK
// ============================================================================

/**
 * Buy tokens using PumpDotFun SDK directly
 * This bypasses the PumpPortal API and interacts directly with the blockchain
 */
export async function buyViaSDK(
  connection: Connection,
  tokenMint: string,
  walletKeypair: Keypair,
  amountSol: number,
  slippageBps: number = 500
): Promise<TradeResult> {
  try {
    const sdk = await createSDKInstance(connection, walletKeypair);
    
    if (!sdk) {
      return {
        success: false,
        error: 'PumpDotFun SDK not available - dependencies missing',
      };
    }
    
    console.log(`[PUMP-SDK] Buying ${amountSol} SOL worth of ${tokenMint.slice(0, 8)}... via SDK`);
    
    const mintPubkey = new PublicKey(tokenMint);
    const amountLamports = BigInt(Math.floor(amountSol * LAMPORTS_PER_SOL));
    const slippageBigInt = BigInt(slippageBps);
    
    // Execute buy using SDK
    const result = await sdk.buy(
      walletKeypair,
      mintPubkey,
      amountLamports,
      slippageBigInt,
      undefined, // priorityFees
      'confirmed',
      'finalized'
    );
    
    if (!result.success) {
      throw new Error(result.error || 'SDK buy transaction failed');
    }
    
    console.log(`[PUMP-SDK] Buy successful: ${result.signature}`);
    
    return {
      success: true,
      txSignature: result.signature,
      amountSol,
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'SDK buy failed';
    console.error('[PUMP-SDK] Buy error:', {
      message: errorMessage,
      mint: tokenMint,
      amount: amountSol,
    });
    return {
      success: false,
      error: `SDK: ${errorMessage}`,
    };
  }
}

/**
 * Sell tokens using PumpDotFun SDK directly
 */
export async function sellViaSDK(
  connection: Connection,
  tokenMint: string,
  walletKeypair: Keypair,
  amountTokens: number,
  slippageBps: number = 500
): Promise<TradeResult> {
  try {
    const sdk = await createSDKInstance(connection, walletKeypair);
    
    if (!sdk) {
      return {
        success: false,
        error: 'PumpDotFun SDK not available - dependencies missing',
      };
    }
    
    console.log(`[PUMP-SDK] Selling ${amountTokens} tokens of ${tokenMint.slice(0, 8)}... via SDK`);
    
    const mintPubkey = new PublicKey(tokenMint);
    // Pump.fun tokens use 6 decimals
    const tokenAmount = BigInt(Math.floor(amountTokens * 1e6));
    const slippageBigInt = BigInt(slippageBps);
    
    // Execute sell using SDK
    const result = await sdk.sell(
      walletKeypair,
      mintPubkey,
      tokenAmount,
      slippageBigInt,
      undefined, // priorityFees
      'confirmed',
      'finalized'
    );
    
    if (!result.success) {
      throw new Error(result.error || 'SDK sell transaction failed');
    }
    
    console.log(`[PUMP-SDK] Sell successful: ${result.signature}`);
    
    return {
      success: true,
      txSignature: result.signature,
      amountTokens,
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'SDK sell failed';
    console.error('[PUMP-SDK] Sell error:', {
      message: errorMessage,
      mint: tokenMint,
      amount: amountTokens,
    });
    return {
      success: false,
      error: `SDK: ${errorMessage}`,
    };
  }
}

/**
 * Check if SDK is available for fallback
 */
export async function isSDKAvailable(): Promise<boolean> {
  return await loadSDK();
}

/**
 * Get bonding curve account info via SDK
 */
export async function getBondingCurveInfo(
  connection: Connection,
  tokenMint: string
): Promise<{
  virtualTokenReserves: bigint;
  virtualSolReserves: bigint;
  realTokenReserves: bigint;
  realSolReserves: bigint;
  tokenTotalSupply: bigint;
  complete: boolean;
} | null> {
  try {
    const sdk = await createSDKInstance(connection, Keypair.generate());
    
    if (!sdk) {
      return null;
    }
    
    const mintPubkey = new PublicKey(tokenMint);
    const bondingCurveAccount = await sdk.getBondingCurveAccount(mintPubkey);
    
    if (!bondingCurveAccount) {
      return null;
    }
    
    return {
      virtualTokenReserves: bondingCurveAccount.virtualTokenReserves,
      virtualSolReserves: bondingCurveAccount.virtualSolReserves,
      realTokenReserves: bondingCurveAccount.realTokenReserves,
      realSolReserves: bondingCurveAccount.realSolReserves,
      tokenTotalSupply: bondingCurveAccount.tokenTotalSupply,
      complete: bondingCurveAccount.complete,
    };
    
  } catch (error) {
    console.error('[PUMP-SDK] Get bonding curve error:', error);
    return null;
  }
}
