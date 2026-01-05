/**
 * AQUA Launchpad - Token Burn Tracker
 * 
 * Tracks token burns (evaporation) by querying on-chain BurnChecked instructions
 * Uses Helius Transaction History API for efficient historical data
 */

import { Connection, PublicKey } from '@solana/web3.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const HELIUS_API_KEY = process.env.HELIUS_API_KEY || '';
const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com';

// SPL Token Program ID
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

// ============================================================================
// TYPES
// ============================================================================

export interface BurnData {
  totalBurned: bigint;
  burnCount: number;
  lastBurnTimestamp: number | null;
  lastBurnSignature: string | null;
}

interface HeliusTransaction {
  signature: string;
  timestamp: number;
  type: string;
  tokenTransfers?: {
    mint: string;
    tokenAmount: number;
    fromUserAccount: string;
    toUserAccount: string;
  }[];
  instructions?: {
    programId: string;
    innerInstructions?: {
      programId: string;
      data: string;
    }[];
  }[];
}

// ============================================================================
// BURN TRACKING
// ============================================================================

/**
 * Get total burned tokens for a mint address using Helius API
 */
export async function getBurnedTokens(mintAddress: string): Promise<BurnData> {
  const result: BurnData = {
    totalBurned: BigInt(0),
    burnCount: 0,
    lastBurnTimestamp: null,
    lastBurnSignature: null,
  };

  try {
    // Method 1: Use Helius Parsed Transaction History (most efficient)
    if (HELIUS_API_KEY) {
      const heliusResult = await getBurnedTokensHelius(mintAddress);
      if (heliusResult) {
        return heliusResult;
      }
    }

    // Method 2: Fallback to direct RPC query
    const rpcResult = await getBurnedTokensRPC(mintAddress);
    return rpcResult;

  } catch (error) {
    console.error('[BURN-TRACKER] Error fetching burn data:', error);
    return result;
  }
}

/**
 * Get burned tokens using Helius Enhanced Transaction History API
 */
async function getBurnedTokensHelius(mintAddress: string): Promise<BurnData | null> {
  const result: BurnData = {
    totalBurned: BigInt(0),
    burnCount: 0,
    lastBurnTimestamp: null,
    lastBurnSignature: null,
  };

  try {
    // Query Helius for all transactions involving this mint
    const response = await fetch(
      `https://api.helius.xyz/v0/addresses/${mintAddress}/transactions?api-key=${HELIUS_API_KEY}&type=BURN`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      }
    );

    if (!response.ok) {
      console.warn('[BURN-TRACKER] Helius API error:', response.status);
      return null;
    }

    const transactions: HeliusTransaction[] = await response.json();

    for (const tx of transactions) {
      // Look for token transfers that are burns (to null/burn address)
      if (tx.tokenTransfers) {
        for (const transfer of tx.tokenTransfers) {
          if (transfer.mint === mintAddress) {
            // Check if it's a burn (transfer to empty/null)
            if (!transfer.toUserAccount || transfer.toUserAccount === '') {
              result.totalBurned += BigInt(Math.floor(transfer.tokenAmount));
              result.burnCount++;

              // Track most recent burn
              if (!result.lastBurnTimestamp || tx.timestamp > result.lastBurnTimestamp) {
                result.lastBurnTimestamp = tx.timestamp;
                result.lastBurnSignature = tx.signature;
              }
            }
          }
        }
      }
    }

    console.log(`[BURN-TRACKER] Helius found ${result.burnCount} burns, total: ${result.totalBurned.toString()}`);
    return result;

  } catch (error) {
    console.warn('[BURN-TRACKER] Helius query failed:', error);
    return null;
  }
}

/**
 * Get burned tokens using direct RPC query (fallback)
 * This is less efficient but works without Helius API key
 */
async function getBurnedTokensRPC(mintAddress: string): Promise<BurnData> {
  const result: BurnData = {
    totalBurned: BigInt(0),
    burnCount: 0,
    lastBurnTimestamp: null,
    lastBurnSignature: null,
  };

  try {
    const connection = new Connection(HELIUS_RPC_URL, 'confirmed');
    const mintPubkey = new PublicKey(mintAddress);

    // Get signatures for the mint address
    const signatures = await connection.getSignaturesForAddress(mintPubkey, {
      limit: 1000,
    });

    // Process each transaction looking for burn instructions
    for (const sig of signatures) {
      try {
        const tx = await connection.getParsedTransaction(sig.signature, {
          maxSupportedTransactionVersion: 0,
        });

        if (!tx?.meta?.innerInstructions) continue;

        // Look for BurnChecked instruction
        for (const inner of tx.meta.innerInstructions) {
          for (const instruction of inner.instructions) {
            if ('parsed' in instruction && instruction.parsed?.type === 'burnChecked') {
              const info = instruction.parsed.info;
              if (info.mint === mintAddress) {
                const amount = BigInt(info.tokenAmount?.amount || '0');
                result.totalBurned += amount;
                result.burnCount++;

                // Track timestamp
                if (tx.blockTime && (!result.lastBurnTimestamp || tx.blockTime > result.lastBurnTimestamp)) {
                  result.lastBurnTimestamp = tx.blockTime;
                  result.lastBurnSignature = sig.signature;
                }
              }
            }
          }
        }

        // Also check main instructions
        for (const instruction of tx.transaction.message.instructions) {
          if ('parsed' in instruction && instruction.parsed?.type === 'burnChecked') {
            const info = instruction.parsed.info;
            if (info.mint === mintAddress) {
              const amount = BigInt(info.tokenAmount?.amount || '0');
              result.totalBurned += amount;
              result.burnCount++;

              if (tx.blockTime && (!result.lastBurnTimestamp || tx.blockTime > result.lastBurnTimestamp)) {
                result.lastBurnTimestamp = tx.blockTime;
                result.lastBurnSignature = sig.signature;
              }
            }
          }
        }
      } catch (txError) {
        // Skip individual transaction errors
        continue;
      }
    }

    console.log(`[BURN-TRACKER] RPC found ${result.burnCount} burns, total: ${result.totalBurned.toString()}`);
    return result;

  } catch (error) {
    console.error('[BURN-TRACKER] RPC query failed:', error);
    return result;
  }
}

/**
 * Get burn rate over a time period
 */
export async function getBurnRate(
  mintAddress: string,
  periodHours: number = 24
): Promise<{
  burnedInPeriod: bigint;
  burnRatePerHour: number;
}> {
  try {
    const connection = new Connection(HELIUS_RPC_URL, 'confirmed');
    const mintPubkey = new PublicKey(mintAddress);
    const cutoffTime = Math.floor(Date.now() / 1000) - (periodHours * 3600);

    let burnedInPeriod = BigInt(0);

    // Get recent signatures
    const signatures = await connection.getSignaturesForAddress(mintPubkey, {
      limit: 500,
    });

    for (const sig of signatures) {
      if (sig.blockTime && sig.blockTime < cutoffTime) break;

      try {
        const tx = await connection.getParsedTransaction(sig.signature, {
          maxSupportedTransactionVersion: 0,
        });

        if (!tx) continue;

        // Check for burn instructions
        for (const instruction of tx.transaction.message.instructions) {
          if ('parsed' in instruction && instruction.parsed?.type === 'burnChecked') {
            const info = instruction.parsed.info;
            if (info.mint === mintAddress) {
              burnedInPeriod += BigInt(info.tokenAmount?.amount || '0');
            }
          }
        }
      } catch {
        continue;
      }
    }

    const burnRatePerHour = Number(burnedInPeriod) / periodHours;

    return {
      burnedInPeriod,
      burnRatePerHour,
    };

  } catch (error) {
    console.error('[BURN-TRACKER] Error calculating burn rate:', error);
    return {
      burnedInPeriod: BigInt(0),
      burnRatePerHour: 0,
    };
  }
}

/**
 * Calculate evaporation percentage
 */
export function calculateEvaporationRate(
  totalBurned: bigint,
  totalSupply: bigint,
  decimals: number = 9
): number {
  if (totalSupply === BigInt(0)) return 0;
  
  // Calculate percentage with precision
  const burnedScaled = totalBurned * BigInt(10000); // For 2 decimal places
  const percentage = Number(burnedScaled / totalSupply) / 100;
  
  return Math.min(100, Math.max(0, percentage));
}

