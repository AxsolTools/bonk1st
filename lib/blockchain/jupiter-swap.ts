/**
 * AQUA Launchpad - Jupiter Swap Integration
 * 
 * Provides SOL <-> USD1 auto-conversion for Bonk.fun token creation
 * Uses Jupiter V6 API for best price routing
 */

import { 
  Connection, 
  Keypair, 
  VersionedTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { QUOTE_MINTS } from './pumpfun';

// ============================================================================
// CONFIGURATION
// ============================================================================

// Use new Metis Swap API if API key is available, otherwise fallback to v6
const JUPITER_API_KEY = process.env.JUPITER_API_KEY || '';
const JUPITER_API_BASE = JUPITER_API_KEY 
  ? 'https://api.jup.ag/swap/v1' 
  : (process.env.JUPITER_API_BASE || 'https://quote-api.jup.ag/v6');
const JUPITER_PRICE_API = JUPITER_API_KEY 
  ? 'https://api.jup.ag/price/v2' 
  : 'https://price.jup.ag/v4';
const USE_NEW_API = !!JUPITER_API_KEY;

// USD1 has 6 decimals
const USD1_DECIMALS = 6;
const USD1_MULTIPLIER = 10 ** USD1_DECIMALS;

// ============================================================================
// TYPES
// ============================================================================

// Full Jupiter quote response - we pass this directly to the swap endpoint
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type JupiterQuoteResponse = Record<string, any> & {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  priceImpactPct: string;
  slippageBps: number;
  routePlan: any[];
};

export interface SwapQuote {
  // Raw quote response from Jupiter - passed directly to swap endpoint
  rawQuote: JupiterQuoteResponse;
  // Convenience accessors
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  priceImpactPct: string;
  slippageBps: number;
  routePlan: any[];
  timestamp: number;
}

export interface SwapResult {
  success: boolean;
  inputAmount: number;
  outputAmount: number;
  txSignature?: string;
  error?: string;
}

// ============================================================================
// PRICE FUNCTIONS
// ============================================================================

/**
 * Get current USD1 price in SOL
 */
export async function getUsd1PriceInSol(): Promise<number> {
  try {
    const headers: Record<string, string> = { 'Accept': 'application/json' };
    if (JUPITER_API_KEY) {
      headers['x-api-key'] = JUPITER_API_KEY;
    }
    
    // New API format: /price/v2?ids=... vs old: /v4/price?ids=...
    const url = USE_NEW_API
      ? `${JUPITER_PRICE_API}?ids=${QUOTE_MINTS.USD1}`
      : `${JUPITER_PRICE_API}/price?ids=${QUOTE_MINTS.USD1}&vsToken=${QUOTE_MINTS.WSOL}`;
      
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      throw new Error(`Jupiter price API error: ${response.status}`);
    }
    
    const data = await response.json();
    const price = data?.data?.[QUOTE_MINTS.USD1]?.price;
    
    if (typeof price !== 'number') {
      throw new Error('Invalid price response');
    }
    
    return price;
  } catch (error) {
    console.error('[JUPITER] Failed to get USD1 price:', error);
    // Fallback: Approximate USD1 at ~$1, SOL at ~$130
    return 0.0077; // ~1/130
  }
}

/**
 * Get current SOL price in USD1
 */
export async function getSolPriceInUsd1(): Promise<number> {
  const usd1InSol = await getUsd1PriceInSol();
  return usd1InSol > 0 ? 1 / usd1InSol : 130; // Default ~$130
}

/**
 * Convert SOL amount to equivalent USD1 amount
 */
export async function solToUsd1Amount(solAmount: number): Promise<number> {
  const solPrice = await getSolPriceInUsd1();
  return solAmount * solPrice;
}

/**
 * Convert USD1 amount to equivalent SOL amount  
 */
export async function usd1ToSolAmount(usd1Amount: number): Promise<number> {
  const usd1Price = await getUsd1PriceInSol();
  return usd1Amount * usd1Price;
}

// ============================================================================
// QUOTE FUNCTIONS
// ============================================================================

/**
 * Get quote for swapping SOL to USD1
 */
export async function getSwapSolToUsd1Quote(
  solAmount: number,
  slippageBps: number = 50
): Promise<SwapQuote | null> {
  try {
    const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);
    
    const url = `${JUPITER_API_BASE}/quote?inputMint=${QUOTE_MINTS.WSOL}&outputMint=${QUOTE_MINTS.USD1}&amount=${lamports}&slippageBps=${slippageBps}`;
    
    const headers: Record<string, string> = { 'Accept': 'application/json' };
    if (JUPITER_API_KEY) {
      headers['x-api-key'] = JUPITER_API_KEY;
    }
    
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Jupiter quote error: ${response.status} - ${errorText}`);
    }
    
    const quote = await response.json();
    
    return {
      rawQuote: quote, // Pass full response to swap endpoint
      inputMint: quote.inputMint,
      outputMint: quote.outputMint,
      inAmount: quote.inAmount,
      outAmount: quote.outAmount,
      priceImpactPct: quote.priceImpactPct,
      slippageBps: quote.slippageBps,
      routePlan: quote.routePlan,
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error('[JUPITER] Failed to get SOL->USD1 quote:', error);
    return null;
  }
}

/**
 * Get quote for swapping USD1 to SOL
 */
export async function getSwapUsd1ToSolQuote(
  usd1Amount: number,
  slippageBps: number = 50
): Promise<SwapQuote | null> {
  try {
    const usd1Units = Math.floor(usd1Amount * USD1_MULTIPLIER);
    
    const url = `${JUPITER_API_BASE}/quote?inputMint=${QUOTE_MINTS.USD1}&outputMint=${QUOTE_MINTS.WSOL}&amount=${usd1Units}&slippageBps=${slippageBps}`;
    
    const headers: Record<string, string> = { 'Accept': 'application/json' };
    if (JUPITER_API_KEY) {
      headers['x-api-key'] = JUPITER_API_KEY;
    }
    
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Jupiter quote error: ${response.status} - ${errorText}`);
    }
    
    const quote = await response.json();
    
    return {
      rawQuote: quote, // Pass full response to swap endpoint
      inputMint: quote.inputMint,
      outputMint: quote.outputMint,
      inAmount: quote.inAmount,
      outAmount: quote.outAmount,
      priceImpactPct: quote.priceImpactPct,
      slippageBps: quote.slippageBps,
      routePlan: quote.routePlan,
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error('[JUPITER] Failed to get USD1->SOL quote:', error);
    return null;
  }
}

// ============================================================================
// SWAP EXECUTION
// ============================================================================

/**
 * Execute swap from SOL to USD1
 */
export async function swapSolToUsd1(
  connection: Connection,
  walletKeypair: Keypair,
  solAmount: number,
  slippageBps: number = 50
): Promise<SwapResult> {
  try {
    console.log(`[JUPITER] Swapping ${solAmount} SOL -> USD1...`);
    
    // Get quote
    const quote = await getSwapSolToUsd1Quote(solAmount, slippageBps);
    if (!quote) {
      return { success: false, inputAmount: solAmount, outputAmount: 0, error: 'Failed to get quote' };
    }
    
    // Validate quote age
    const quoteAge = Date.now() - quote.timestamp;
    if (quoteAge > 30000) {
      return { success: false, inputAmount: solAmount, outputAmount: 0, error: 'Quote expired' };
    }
    
    // Get swap transaction
    const swapHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (JUPITER_API_KEY) {
      swapHeaders['x-api-key'] = JUPITER_API_KEY;
    }
    
    const swapResponse = await fetch(`${JUPITER_API_BASE}/swap`, {
      method: 'POST',
      headers: swapHeaders,
      body: JSON.stringify({
        quoteResponse: quote.rawQuote, // Pass full Jupiter quote response
        userPublicKey: walletKeypair.publicKey.toBase58(),
        wrapAndUnwrapSol: true,
        useSharedAccounts: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 100000, // 0.0001 SOL
      }),
    });
    
    if (!swapResponse.ok) {
      const errorText = await swapResponse.text();
      throw new Error(`Jupiter swap error: ${swapResponse.status} - ${errorText}`);
    }
    
    const { swapTransaction } = await swapResponse.json();
    
    // Sign and send
    const txBuffer = Buffer.from(swapTransaction, 'base64');
    const tx = VersionedTransaction.deserialize(txBuffer);
    tx.sign([walletKeypair]);
    
    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });
    
    await connection.confirmTransaction(signature, 'confirmed');
    
    const outputAmount = parseInt(quote.outAmount) / USD1_MULTIPLIER;
    console.log(`[JUPITER] ✅ Swapped ${solAmount} SOL -> ${outputAmount.toFixed(2)} USD1 (using ${USE_NEW_API ? 'Metis' : 'v6'} API)`);
    
    return {
      success: true,
      inputAmount: solAmount,
      outputAmount,
      txSignature: signature,
    };
    
  } catch (error) {
    console.error('[JUPITER] SOL->USD1 swap failed:', error);
    return {
      success: false,
      inputAmount: solAmount,
      outputAmount: 0,
      error: error instanceof Error ? error.message : 'Swap failed',
    };
  }
}

/**
 * Execute swap from USD1 to SOL
 */
export async function swapUsd1ToSol(
  connection: Connection,
  walletKeypair: Keypair,
  usd1Amount: number,
  slippageBps: number = 50
): Promise<SwapResult> {
  try {
    console.log(`[JUPITER] Swapping ${usd1Amount} USD1 -> SOL...`);
    
    // Get quote
    const quote = await getSwapUsd1ToSolQuote(usd1Amount, slippageBps);
    if (!quote) {
      return { success: false, inputAmount: usd1Amount, outputAmount: 0, error: 'Failed to get quote' };
    }
    
    // Validate quote age
    const quoteAge = Date.now() - quote.timestamp;
    if (quoteAge > 30000) {
      return { success: false, inputAmount: usd1Amount, outputAmount: 0, error: 'Quote expired' };
    }
    
    // Get swap transaction
    const swapHeaders2: Record<string, string> = { 'Content-Type': 'application/json' };
    if (JUPITER_API_KEY) {
      swapHeaders2['x-api-key'] = JUPITER_API_KEY;
    }
    
    const swapResponse = await fetch(`${JUPITER_API_BASE}/swap`, {
      method: 'POST',
      headers: swapHeaders2,
      body: JSON.stringify({
        quoteResponse: quote.rawQuote, // Pass full Jupiter quote response
        userPublicKey: walletKeypair.publicKey.toBase58(),
        wrapAndUnwrapSol: true,
        useSharedAccounts: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 100000, // 0.0001 SOL
      }),
    });
    
    if (!swapResponse.ok) {
      const errorText = await swapResponse.text();
      throw new Error(`Jupiter swap error: ${swapResponse.status} - ${errorText}`);
    }
    
    const { swapTransaction } = await swapResponse.json();
    
    // Sign and send
    const txBuffer = Buffer.from(swapTransaction, 'base64');
    const tx = VersionedTransaction.deserialize(txBuffer);
    tx.sign([walletKeypair]);
    
    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });
    
    await connection.confirmTransaction(signature, 'confirmed');
    
    const outputAmount = parseInt(quote.outAmount) / LAMPORTS_PER_SOL;
    console.log(`[JUPITER] ✅ Swapped ${usd1Amount} USD1 -> ${outputAmount.toFixed(6)} SOL (using ${USE_NEW_API ? 'Metis' : 'v6'} API)`);
    
    return {
      success: true,
      inputAmount: usd1Amount,
      outputAmount,
      txSignature: signature,
    };
    
  } catch (error) {
    console.error('[JUPITER] USD1->SOL swap failed:', error);
    return {
      success: false,
      inputAmount: usd1Amount,
      outputAmount: 0,
      error: error instanceof Error ? error.message : 'Swap failed',
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  USD1_DECIMALS,
  USD1_MULTIPLIER,
};

