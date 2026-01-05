/**
 * PROPEL - Jupiter Earn Integration
 * 
 * Enables PROPEL token holders to participate in Jupiter's Earn vaults
 * through atomic Swap-to-Earn transactions.
 * 
 * Key Features:
 * - Fetch available earn vaults (jlUSDC, jlSOL)
 * - Get user positions and earnings
 * - Execute Swap-to-Earn atomic transactions
 * - Withdraw from earn vaults
 * 
 * References:
 * - https://dev.jup.ag/docs/lend/earn
 * - https://dev.jup.ag/api-reference/lend/earn
 */

import {
  Connection,
  Keypair,
  PublicKey,
  VersionedTransaction,
  TransactionMessage,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const JUPITER_LEND_API = 'https://api.jup.ag/lend/v1/earn';
const JUPITER_ULTRA_API = 'https://api.jup.ag/ultra/v1';
const JUPITER_QUOTE_API = 'https://quote-api.jup.ag/v6';

// Get API key from environment
const getApiKey = () => process.env.JUPITER_API_KEY || '';

// PROPEL token mint from environment
export const getPropelMint = () => process.env.PROPEL_TOKEN_MINT || process.env.NEXT_PUBLIC_PROPEL_TOKEN_MINT || '';

// Known vault asset mints
export const EARN_ASSETS = {
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  SOL: 'So11111111111111111111111111111111111111112',
} as const;

// Known jlToken mints (yield-bearing tokens)
export const JL_TOKENS = {
  jlUSDC: '9BEcn9aPEmhSPbPQeFGjidRiEKki46fVQDyPpSQXPA2D',
  jlSOL: 'jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v',
} as const;

// ============================================================================
// TYPES
// ============================================================================

export interface EarnVault {
  id: number;
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  assetAddress: string;
  asset: {
    address: string;
    name: string;
    symbol: string;
    decimals: number;
    logoUrl: string;
    price: string;
  };
  totalAssets: string;
  totalSupply: string;
  convertToShares: string;
  convertToAssets: string;
  rewardsRate: string;
  supplyRate: string;
  totalRate: string;
  rebalanceDifference: string;
  liquiditySupplyData: {
    modeWithInterest: boolean;
    supply: string;
    withdrawalLimit: string;
    withdrawable: string;
  };
  // Computed fields
  apy: number;
  tvlUsd: number;
  availableLiquidity: number;
}

export interface UserPosition {
  vaultAddress: string;
  vaultSymbol: string;
  assetSymbol: string;
  shares: string;
  sharesFormatted: number;
  underlyingAssets: string;
  underlyingAssetsFormatted: number;
  underlyingValueUsd: number;
  logoUrl: string;
}

export interface UserEarnings {
  positionAddress: string;
  vaultSymbol: string;
  assetSymbol: string;
  earnedAmount: string;
  earnedAmountFormatted: number;
  earnedValueUsd: number;
}

export interface SwapToEarnQuote {
  inputMint: string;
  inputAmount: string;
  inputAmountFormatted: number;
  outputMint: string; // jlToken
  outputAmount: string;
  outputAmountFormatted: number;
  targetVault: EarnVault;
  intermediateAmount: string; // USDC/SOL amount before deposit
  priceImpact: number;
  estimatedApy: number;
}

export interface EarnTransactionResult {
  success: boolean;
  transaction?: string; // Base64 encoded transaction
  signature?: string;
  error?: string;
  details?: {
    inputAmount: number;
    outputAmount: number;
    vault: string;
  };
}

// ============================================================================
// API HELPERS
// ============================================================================

function getHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'x-api-key': getApiKey(),
  };
}

async function fetchWithRetry<T>(
  url: string,
  options?: RequestInit,
  retries = 3
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...getHeaders(),
          ...options?.headers,
        },
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error ${response.status}: ${errorText}`);
      }
      
      return await response.json();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`[JUPITER-EARN] Retry ${i + 1}/${retries} failed:`, lastError.message);
      
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
  }
  
  throw lastError || new Error('Unknown error');
}

// ============================================================================
// VAULT FUNCTIONS
// ============================================================================

/**
 * Fetch all available Jupiter Earn vaults
 */
export async function getEarnVaults(): Promise<EarnVault[]> {
  try {
    console.log('[JUPITER-EARN] Fetching earn vaults...');
    
    const data = await fetchWithRetry<any[]>(`${JUPITER_LEND_API}/tokens`);
    
    const vaults: EarnVault[] = data.map(vault => {
      // Calculate APY from totalRate (in 1e4 decimals)
      const totalRateBps = parseFloat(vault.totalRate || '0');
      const apy = totalRateBps / 100; // Convert to percentage
      
      // Calculate TVL
      const totalAssets = parseFloat(vault.totalAssets || '0');
      const assetPrice = parseFloat(vault.asset?.price || '0');
      const decimals = vault.asset?.decimals || 6;
      const tvlUsd = (totalAssets / Math.pow(10, decimals)) * assetPrice;
      
      // Available liquidity
      const withdrawable = parseFloat(vault.liquiditySupplyData?.withdrawable || '0');
      const availableLiquidity = withdrawable / Math.pow(10, decimals);
      
      return {
        id: vault.id,
        address: vault.address,
        name: vault.name,
        symbol: vault.symbol,
        decimals: vault.decimals,
        assetAddress: vault.assetAddress,
        asset: {
          address: vault.asset?.address || vault.assetAddress,
          name: vault.asset?.name || '',
          symbol: vault.asset?.symbol || '',
          decimals: vault.asset?.decimals || 6,
          logoUrl: vault.asset?.logo_url || '',
          price: vault.asset?.price || '0',
        },
        totalAssets: vault.totalAssets,
        totalSupply: vault.totalSupply,
        convertToShares: vault.convertToShares,
        convertToAssets: vault.convertToAssets,
        rewardsRate: vault.rewardsRate,
        supplyRate: vault.supplyRate,
        totalRate: vault.totalRate,
        rebalanceDifference: vault.rebalanceDifference,
        liquiditySupplyData: vault.liquiditySupplyData,
        apy,
        tvlUsd,
        availableLiquidity,
      };
    });
    
    console.log(`[JUPITER-EARN] Found ${vaults.length} vaults`);
    return vaults;
    
  } catch (error) {
    console.error('[JUPITER-EARN] Failed to fetch vaults:', error);
    throw error;
  }
}

/**
 * Get a specific vault by asset symbol (USDC, SOL)
 */
export async function getVaultByAsset(assetSymbol: 'USDC' | 'SOL'): Promise<EarnVault | null> {
  const vaults = await getEarnVaults();
  return vaults.find(v => v.asset.symbol.toUpperCase() === assetSymbol) || null;
}

// ============================================================================
// POSITION FUNCTIONS
// ============================================================================

/**
 * Get user's earn positions
 * API Response structure per Jupiter docs:
 * {
 *   token: { id, address, name, symbol, decimals, assetAddress, asset: {...}, ... },
 *   ownerAddress: string,
 *   shares: string,
 *   underlyingAssets: string,
 *   underlyingBalance: string,
 *   allowance: string
 * }
 */
export async function getUserPositions(walletAddress: string): Promise<UserPosition[]> {
  try {
    console.log(`[JUPITER-EARN] Fetching positions for ${walletAddress.slice(0, 8)}...`);
    
    const data = await fetchWithRetry<any[]>(
      `${JUPITER_LEND_API}/positions?users=${walletAddress}`
    );
    
    if (!data || !Array.isArray(data)) {
      console.log('[JUPITER-EARN] No positions data returned');
      return [];
    }
    
    const positions: UserPosition[] = [];
    
    for (const position of data) {
      // Skip if no token info or no shares
      if (!position.token || !position.shares || position.shares === '0') continue;
      
      const token = position.token;
      const asset = token.asset || {};
      
      const shares = parseFloat(position.shares || '0');
      const decimals = token.decimals || 6;
      const assetDecimals = asset.decimals || 6;
      const sharesFormatted = shares / Math.pow(10, decimals);
      
      // Use the underlyingAssets from API response directly
      const underlyingAssets = parseFloat(position.underlyingAssets || '0');
      const underlyingAssetsFormatted = underlyingAssets / Math.pow(10, assetDecimals);
      
      const assetPrice = parseFloat(asset.price || '0');
      const underlyingValueUsd = underlyingAssetsFormatted * assetPrice;
      
      positions.push({
        vaultAddress: token.address,
        vaultSymbol: token.symbol,
        assetSymbol: asset.symbol || '',
        shares: position.shares,
        sharesFormatted,
        underlyingAssets: position.underlyingAssets,
        underlyingAssetsFormatted,
        underlyingValueUsd,
        logoUrl: asset.logo_url || '',
      });
    }
    
    console.log(`[JUPITER-EARN] Found ${positions.length} positions`);
    return positions;
    
  } catch (error) {
    console.error('[JUPITER-EARN] Failed to fetch positions:', error);
    return [];
  }
}

/**
 * Get user's earnings from positions
 * API Response structure per Jupiter docs:
 * {
 *   address: string (position/vault address),
 *   ownerAddress: string,
 *   totalDeposits: string,
 *   totalWithdraws: string,
 *   totalBalance: string,
 *   totalAssets: string,
 *   earnings: string
 * }
 * 
 * Note: The earnings endpoint requires position addresses.
 * We first fetch positions, then query earnings for each.
 */
export async function getUserEarnings(
  walletAddress: string,
  positionAddresses?: string[]
): Promise<UserEarnings[]> {
  try {
    console.log(`[JUPITER-EARN] Fetching earnings for ${walletAddress.slice(0, 8)}...`);
    
    // First get positions if not provided
    let positions = positionAddresses;
    if (!positions || positions.length === 0) {
      const userPositions = await getUserPositions(walletAddress);
      positions = userPositions.map(p => p.vaultAddress);
    }
    
    if (!positions || positions.length === 0) {
      console.log('[JUPITER-EARN] No positions found for earnings query');
      return [];
    }
    
    const url = `${JUPITER_LEND_API}/earnings?user=${walletAddress}&positions=${positions.join(',')}`;
    
    // The API may return a single object or array
    const data = await fetchWithRetry<any>(url);
    
    // Get vaults for price info
    const vaults = await getEarnVaults();
    const vaultMap = new Map(vaults.map(v => [v.address, v]));
    
    // Handle both single object and array responses
    const earningsArray = Array.isArray(data) ? data : [data];
    
    const earnings: UserEarnings[] = [];
    
    for (const earning of earningsArray) {
      if (!earning || !earning.address) continue;
      
      const vault = vaultMap.get(earning.address);
      const decimals = vault?.asset.decimals || 6;
      const earnedAmount = parseFloat(earning.earnings || '0');
      const earnedAmountFormatted = earnedAmount / Math.pow(10, decimals);
      const assetPrice = parseFloat(vault?.asset.price || '0');
      
      earnings.push({
        positionAddress: earning.address,
        vaultSymbol: vault?.symbol || '',
        assetSymbol: vault?.asset.symbol || '',
        earnedAmount: earning.earnings || '0',
        earnedAmountFormatted,
        earnedValueUsd: earnedAmountFormatted * assetPrice,
      });
    }
    
    console.log(`[JUPITER-EARN] Found earnings for ${earnings.length} positions`);
    return earnings;
    
  } catch (error) {
    console.error('[JUPITER-EARN] Failed to fetch earnings:', error);
    return [];
  }
}

// ============================================================================
// DEPOSIT FUNCTIONS
// ============================================================================

/**
 * Get deposit transaction for direct deposit (when user already has USDC/SOL)
 */
export async function getDepositTransaction(
  walletAddress: string,
  assetMint: string,
  amount: string // In base units (lamports for SOL, smallest unit for tokens)
): Promise<EarnTransactionResult> {
  try {
    console.log(`[JUPITER-EARN] Getting deposit transaction for ${amount} of ${assetMint.slice(0, 8)}...`);
    
    const response = await fetchWithRetry<{ transaction: string }>(
      `${JUPITER_LEND_API}/deposit`,
      {
        method: 'POST',
        body: JSON.stringify({
          asset: assetMint,
          amount,
          signer: walletAddress,
        }),
      }
    );
    
    return {
      success: true,
      transaction: response.transaction,
    };
    
  } catch (error) {
    console.error('[JUPITER-EARN] Deposit transaction failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Deposit failed',
    };
  }
}

/**
 * Get deposit instructions for composing with other transactions
 */
export async function getDepositInstructions(
  walletAddress: string,
  assetMint: string,
  amount: string
): Promise<{ instructions: any[]; success: boolean; error?: string }> {
  try {
    const response = await fetchWithRetry<{ instructions: any[] }>(
      `${JUPITER_LEND_API}/deposit-instructions`,
      {
        method: 'POST',
        body: JSON.stringify({
          asset: assetMint,
          amount,
          signer: walletAddress,
        }),
      }
    );
    
    return {
      success: true,
      instructions: response.instructions,
    };
    
  } catch (error) {
    console.error('[JUPITER-EARN] Get deposit instructions failed:', error);
    return {
      success: false,
      instructions: [],
      error: error instanceof Error ? error.message : 'Failed to get instructions',
    };
  }
}

// ============================================================================
// WITHDRAW FUNCTIONS
// ============================================================================

/**
 * Get withdraw transaction
 */
export async function getWithdrawTransaction(
  walletAddress: string,
  assetMint: string,
  amount: string // In base units
): Promise<EarnTransactionResult> {
  try {
    console.log(`[JUPITER-EARN] Getting withdraw transaction for ${amount}...`);
    
    const response = await fetchWithRetry<{ transaction: string }>(
      `${JUPITER_LEND_API}/withdraw`,
      {
        method: 'POST',
        body: JSON.stringify({
          asset: assetMint,
          amount,
          signer: walletAddress,
        }),
      }
    );
    
    return {
      success: true,
      transaction: response.transaction,
    };
    
  } catch (error) {
    console.error('[JUPITER-EARN] Withdraw transaction failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Withdraw failed',
    };
  }
}

/**
 * Get redeem transaction (by shares instead of assets)
 */
export async function getRedeemTransaction(
  walletAddress: string,
  assetMint: string,
  shares: string
): Promise<EarnTransactionResult> {
  try {
    console.log(`[JUPITER-EARN] Getting redeem transaction for ${shares} shares...`);
    
    const response = await fetchWithRetry<{ transaction: string }>(
      `${JUPITER_LEND_API}/redeem`,
      {
        method: 'POST',
        body: JSON.stringify({
          asset: assetMint,
          signer: walletAddress,
          shares,
        }),
      }
    );
    
    return {
      success: true,
      transaction: response.transaction,
    };
    
  } catch (error) {
    console.error('[JUPITER-EARN] Redeem transaction failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Redeem failed',
    };
  }
}

// ============================================================================
// SWAP-TO-EARN FUNCTIONS
// ============================================================================

/**
 * Get quote for swapping any token to a yield-bearing jlToken
 * This is the core "Swap-to-Earn" functionality
 */
export async function getSwapToEarnQuote(
  inputMint: string,
  inputAmount: string, // In base units
  targetAsset: 'USDC' | 'SOL',
  walletAddress: string,
  slippageBps: number = 50
): Promise<SwapToEarnQuote | null> {
  try {
    console.log(`[JUPITER-EARN] Getting Swap-to-Earn quote: ${inputMint.slice(0, 8)} → jl${targetAsset}...`);
    
    // Get target vault info
    const vault = await getVaultByAsset(targetAsset);
    if (!vault) {
      throw new Error(`Vault for ${targetAsset} not found`);
    }
    
    const targetAssetMint = EARN_ASSETS[targetAsset];
    const jlTokenMint = targetAsset === 'USDC' ? JL_TOKENS.jlUSDC : JL_TOKENS.jlSOL;
    
    // Step 1: Get swap quote from input token to target asset (USDC/SOL)
    // If input is already the target asset, skip swap
    let intermediateAmount = inputAmount;
    let priceImpact = 0;
    
    if (inputMint !== targetAssetMint) {
      const quoteUrl = `${JUPITER_QUOTE_API}/quote?inputMint=${inputMint}&outputMint=${targetAssetMint}&amount=${inputAmount}&slippageBps=${slippageBps}`;
      
      const quoteResponse = await fetch(quoteUrl, { headers: getHeaders() });
      if (!quoteResponse.ok) {
        throw new Error('Failed to get swap quote');
      }
      
      const quote = await quoteResponse.json();
      intermediateAmount = quote.outAmount;
      priceImpact = parseFloat(quote.priceImpactPct || '0');
    }
    
    // Step 2: Calculate jlToken output based on vault conversion rate
    const convertToShares = parseFloat(vault.convertToShares || '1');
    const intermediateAmountNum = parseFloat(intermediateAmount);
    const outputAmount = Math.floor(intermediateAmountNum * convertToShares);
    
    // Get input token decimals (assume 6 for most SPL tokens, 9 for SOL)
    const inputDecimals = inputMint === EARN_ASSETS.SOL ? 9 : 6;
    const outputDecimals = vault.decimals;
    
    return {
      inputMint,
      inputAmount,
      inputAmountFormatted: parseFloat(inputAmount) / Math.pow(10, inputDecimals),
      outputMint: jlTokenMint,
      outputAmount: outputAmount.toString(),
      outputAmountFormatted: outputAmount / Math.pow(10, outputDecimals),
      targetVault: vault,
      intermediateAmount,
      priceImpact,
      estimatedApy: vault.apy,
    };
    
  } catch (error) {
    console.error('[JUPITER-EARN] Swap-to-Earn quote failed:', error);
    return null;
  }
}

/**
 * Build Swap-to-Earn transaction
 * Combines swap + deposit into a single atomic transaction
 */
export async function buildSwapToEarnTransaction(
  inputMint: string,
  inputAmount: string,
  targetAsset: 'USDC' | 'SOL',
  walletAddress: string,
  slippageBps: number = 50
): Promise<EarnTransactionResult> {
  try {
    console.log(`[JUPITER-EARN] Building Swap-to-Earn transaction...`);
    
    const targetAssetMint = EARN_ASSETS[targetAsset];
    
    // If input is already the target asset, just do a deposit
    if (inputMint === targetAssetMint) {
      return await getDepositTransaction(walletAddress, targetAssetMint, inputAmount);
    }
    
    // For Swap-to-Earn, we use Jupiter's Ultra API which can route to jlTokens directly
    // The key insight: jlTokens are tradeable, so we can swap directly to them
    const jlTokenMint = targetAsset === 'USDC' ? JL_TOKENS.jlUSDC : JL_TOKENS.jlSOL;
    
    // Try Ultra API first (supports direct routing to jlTokens)
    try {
      const orderUrl = `${JUPITER_ULTRA_API}/order?inputMint=${inputMint}&outputMint=${jlTokenMint}&amount=${inputAmount}&taker=${walletAddress}&slippageBps=${slippageBps}`;
      
      const orderResponse = await fetch(orderUrl, { headers: getHeaders() });
      
      if (orderResponse.ok) {
        const order = await orderResponse.json();
        
        if (order.transaction) {
          console.log('[JUPITER-EARN] Using Ultra API for direct jlToken swap');
          return {
            success: true,
            transaction: order.transaction,
            details: {
              inputAmount: parseFloat(inputAmount),
              outputAmount: parseFloat(order.outAmount || '0'),
              vault: `jl${targetAsset}`,
            },
          };
        }
      }
    } catch (ultraError) {
      console.log('[JUPITER-EARN] Ultra API not available, falling back to two-step');
    }
    
    // Fallback: Two-step approach (swap to asset, then deposit)
    // Step 1: Get swap transaction to target asset
    const quoteUrl = `${JUPITER_QUOTE_API}/quote?inputMint=${inputMint}&outputMint=${targetAssetMint}&amount=${inputAmount}&slippageBps=${slippageBps}`;
    const quoteResponse = await fetch(quoteUrl, { headers: getHeaders() });
    
    if (!quoteResponse.ok) {
      throw new Error('Failed to get swap quote');
    }
    
    const quote = await quoteResponse.json();
    
    // Get swap transaction
    const swapResponse = await fetch(`${JUPITER_QUOTE_API}/swap`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: walletAddress,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 'auto',
      }),
    });
    
    if (!swapResponse.ok) {
      throw new Error('Failed to get swap transaction');
    }
    
    const { swapTransaction } = await swapResponse.json();
    
    // For now, return just the swap transaction
    // The user will need to do a second transaction for deposit
    // TODO: Compose both into atomic transaction using deposit-instructions
    
    return {
      success: true,
      transaction: swapTransaction,
      details: {
        inputAmount: parseFloat(inputAmount),
        outputAmount: parseFloat(quote.outAmount),
        vault: targetAsset,
      },
    };
    
  } catch (error) {
    console.error('[JUPITER-EARN] Swap-to-Earn transaction failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Transaction build failed',
    };
  }
}

// ============================================================================
// TRANSACTION EXECUTION
// ============================================================================

/**
 * Sign and send an earn transaction
 */
export async function executeEarnTransaction(
  connection: Connection,
  walletKeypair: Keypair,
  base64Transaction: string
): Promise<{ success: boolean; signature?: string; error?: string }> {
  try {
    console.log('[JUPITER-EARN] Executing transaction...');
    
    const txBuffer = Buffer.from(base64Transaction, 'base64');
    const tx = VersionedTransaction.deserialize(txBuffer);
    
    tx.sign([walletKeypair]);
    
    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
      preflightCommitment: 'confirmed',
    });
    
    console.log(`[JUPITER-EARN] Transaction sent: ${signature}`);
    
    // Wait for confirmation
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');
    
    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }
    
    console.log(`[JUPITER-EARN] ✅ Transaction confirmed: ${signature}`);
    
    return {
      success: true,
      signature,
    };
    
  } catch (error) {
    console.error('[JUPITER-EARN] Transaction execution failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Execution failed',
    };
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format APY for display
 */
export function formatApy(apy: number): string {
  if (apy >= 100) return `${apy.toFixed(0)}%`;
  if (apy >= 10) return `${apy.toFixed(1)}%`;
  return `${apy.toFixed(2)}%`;
}

/**
 * Format TVL for display
 */
export function formatTvl(tvlUsd: number): string {
  if (tvlUsd >= 1_000_000_000) return `$${(tvlUsd / 1_000_000_000).toFixed(2)}B`;
  if (tvlUsd >= 1_000_000) return `$${(tvlUsd / 1_000_000).toFixed(2)}M`;
  if (tvlUsd >= 1_000) return `$${(tvlUsd / 1_000).toFixed(2)}K`;
  return `$${tvlUsd.toFixed(2)}`;
}

/**
 * Calculate estimated earnings over time
 */
export function calculateEstimatedEarnings(
  principal: number,
  apyPercent: number,
  days: number
): number {
  const dailyRate = apyPercent / 100 / 365;
  return principal * dailyRate * days;
}

