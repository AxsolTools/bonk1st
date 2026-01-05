/**
 * Balance Service
 * 
 * Real-time balance fetching for Solana SPL tokens using Helius RPC.
 * Features:
 * - Short-TTL caching for efficiency (5 seconds)
 * - Batch fetching support
 * - Automatic cache invalidation
 */

import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

// Cache configuration
const CACHE_TTL_MS = 5000; // 5 seconds
const MAX_CACHE_SIZE = 1000; // Maximum cached entries

interface CachedBalance {
  balance: number;
  rawBalance: string;
  timestamp: number;
}

interface TokenBalanceInfo {
  mint: string;
  balance: number;
  rawBalance: string;
  decimals: number;
}

// In-memory cache for balances
const balanceCache = new Map<string, CachedBalance>();

// Helper to generate cache key
function getCacheKey(walletAddress: string, tokenMint: string): string {
  return `${walletAddress}:${tokenMint}`;
}

// Clean up old cache entries
function cleanupCache(): void {
  const now = Date.now();
  const keysToDelete: string[] = [];
  
  balanceCache.forEach((value, key) => {
    if (now - value.timestamp > CACHE_TTL_MS) {
      keysToDelete.push(key);
    }
  });
  
  keysToDelete.forEach(key => balanceCache.delete(key));
  
  // If still too large, remove oldest entries
  if (balanceCache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(balanceCache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    const toRemove = entries.slice(0, entries.length - MAX_CACHE_SIZE);
    toRemove.forEach(([key]) => balanceCache.delete(key));
  }
}

/**
 * Get the configured token mint address
 */
export function getConfiguredTokenMint(): string {
  return process.env.LOCKED_TOKEN_MINT || '';
}

/**
 * Get the configured token decimals
 */
export function getConfiguredTokenDecimals(): number {
  return parseInt(process.env.TOKEN_DECIMALS || '9', 10);
}

/**
 * Get RPC connection
 */
function getConnection(): Connection {
  const heliusApiKey = process.env.HELIUS_API_KEY;
  const rpcUrl = process.env.HELIUS_RPC_URL || 
    (heliusApiKey ? `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}` : null) ||
    process.env.SOLANA_RPC_URLS?.split(',')[0] ||
    'https://api.mainnet-beta.solana.com';
  
  return new Connection(rpcUrl, 'confirmed');
}

/**
 * Get SOL balance for a wallet
 */
export async function getSolBalance(walletAddress: string): Promise<number> {
  const cacheKey = getCacheKey(walletAddress, 'SOL');
  const cached = balanceCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.balance;
  }
  
  try {
    const connection = getConnection();
    const publicKey = new PublicKey(walletAddress);
    const lamports = await connection.getBalance(publicKey);
    const balance = lamports / LAMPORTS_PER_SOL;
    
    balanceCache.set(cacheKey, {
      balance,
      rawBalance: lamports.toString(),
      timestamp: Date.now()
    });
    
    cleanupCache();
    return balance;
  } catch (error) {
    console.error(`Error fetching SOL balance for ${walletAddress}:`, error);
    return 0;
  }
}

/**
 * Get SPL token balance for a specific token mint
 */
export async function getTokenBalance(
  walletAddress: string, 
  tokenMint: string,
  decimals?: number
): Promise<TokenBalanceInfo> {
  const cacheKey = getCacheKey(walletAddress, tokenMint);
  const cached = balanceCache.get(cacheKey);
  const fallbackDecimals = decimals ?? getConfiguredTokenDecimals();
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return {
      mint: tokenMint,
      balance: cached.balance,
      rawBalance: cached.rawBalance,
      decimals: fallbackDecimals
    };
  }
  
  try {
    const connection = getConnection();
    const walletPubkey = new PublicKey(walletAddress);
    const mintPubkey = new PublicKey(tokenMint);

    // IMPORTANT:
    // Do NOT assume tokens are stored in the wallet's ATA.
    // Wallets (including Phantom) can hold balances in non-ATA token accounts.
    // So we sum all token accounts owned by the wallet for the given mint.
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(walletPubkey, {
      mint: mintPubkey
    });

    let rawSum = 0n;
    let decimalsOnChain: number | null = null;

    for (const acc of tokenAccounts.value) {
      const parsed = (acc.account.data as any)?.parsed;
      const tokenAmount = parsed?.info?.tokenAmount;
      if (!tokenAmount?.amount) continue;
      rawSum += BigInt(tokenAmount.amount);
      if (typeof tokenAmount.decimals === 'number') {
        decimalsOnChain = tokenAmount.decimals;
      }
    }

    const finalDecimals = decimalsOnChain ?? fallbackDecimals;
    // Safe for typical SPL balances (including 494k * 1e6); if you expect extremely large values,
    // switch to a decimal library.
    const rawBalanceStr = rawSum.toString();
    const balance = Number(rawBalanceStr) / Math.pow(10, finalDecimals);

    balanceCache.set(cacheKey, {
      balance,
      rawBalance: rawBalanceStr,
      timestamp: Date.now()
    });

    cleanupCache();

    // High-signal debug line (helps confirm mint + decimals + sum across accounts)
    console.log(
      `[BALANCE] mint=${tokenMint} owner=${walletAddress} accounts=${tokenAccounts.value.length} raw=${rawBalanceStr} decimals=${finalDecimals} ui=${balance}`
    );

    return {
      mint: tokenMint,
      balance,
      rawBalance: rawBalanceStr,
      decimals: finalDecimals
    };
  } catch (error: any) {
    console.error(`[BALANCE] Error fetching token balance mint=${tokenMint} owner=${walletAddress}:`, error.message);
    return {
      mint: tokenMint,
      balance: 0,
      rawBalance: '0',
      decimals: fallbackDecimals
    };
  }
}

/**
 * Get the configured LOCKED token balance for a wallet
 */
export async function getLockedTokenBalance(walletAddress: string): Promise<number> {
  const tokenMint = getConfiguredTokenMint();
  
  if (!tokenMint) {
    console.warn('LOCKED_TOKEN_MINT not configured');
    return 0;
  }
  
  const info = await getTokenBalance(walletAddress, tokenMint);
  return info.balance;
}

/**
 * Get all token balances for a wallet using Helius RPC
 */
export async function getAllTokenBalances(walletAddress: string): Promise<TokenBalanceInfo[]> {
  const heliusApiKey = process.env.HELIUS_API_KEY;
  const heliusRpcUrl = process.env.HELIUS_RPC_URL || 
    (heliusApiKey ? `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}` : null);
  
  if (!heliusRpcUrl) {
    console.warn('Helius RPC not configured for getAllTokenBalances');
    return [];
  }
  
  try {
    const response = await fetch(heliusRpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'get-token-balances',
        method: 'getAssetsByOwner',
        params: {
          ownerAddress: walletAddress,
          page: 1,
          limit: 100,
          displayOptions: {
            showFungible: true,
            showNativeBalance: true
          }
        }
      })
    });
    
    const data = await response.json();
    
    if (data.error) {
      console.error('Helius RPC error:', data.error);
      return [];
    }
    
    const tokens: TokenBalanceInfo[] = [];
    
    // Add native SOL
    if (data.result?.nativeBalance) {
      const lamports = data.result.nativeBalance.lamports || 0;
      tokens.push({
        mint: 'So11111111111111111111111111111111111111112',
        balance: lamports / LAMPORTS_PER_SOL,
        rawBalance: lamports.toString(),
        decimals: 9
      });
    }
    
    // Add fungible tokens
    if (data.result?.items) {
      for (const item of data.result.items) {
        if (item.interface === 'FungibleToken' || item.interface === 'FungibleAsset') {
          const tokenInfo = item.token_info || {};
          const decimals = tokenInfo.decimals || 9;
          const rawBalance = tokenInfo.balance || '0';
          
          tokens.push({
            mint: item.id,
            balance: Number(rawBalance) / Math.pow(10, decimals),
            rawBalance,
            decimals
          });
        }
      }
    }
    
    return tokens;
  } catch (error) {
    console.error('Error fetching all token balances:', error);
    return [];
  }
}

/**
 * Invalidate cache for a specific wallet
 */
export function invalidateCache(walletAddress: string): void {
  const keysToDelete: string[] = [];
  
  balanceCache.forEach((_, key) => {
    if (key.startsWith(`${walletAddress}:`)) {
      keysToDelete.push(key);
    }
  });
  
  keysToDelete.forEach(key => balanceCache.delete(key));
}

/**
 * Invalidate cache for a specific wallet and token
 */
export function invalidateTokenCache(walletAddress: string, tokenMint: string): void {
  const cacheKey = getCacheKey(walletAddress, tokenMint);
  balanceCache.delete(cacheKey);
}

/**
 * Check if a wallet has sufficient balance for a bet
 */
export async function hasSufficientBalance(
  walletAddress: string, 
  amount: number, 
  tokenMint?: string
): Promise<{ sufficient: boolean; currentBalance: number }> {
  const mint = tokenMint || getConfiguredTokenMint();
  
  if (!mint) {
    return { sufficient: false, currentBalance: 0 };
  }
  
  const info = await getTokenBalance(walletAddress, mint);
  
  return {
    sufficient: info.balance >= amount,
    currentBalance: info.balance
  };
}

/**
 * Get balance with fresh fetch (bypasses cache)
 */
export async function getFreshTokenBalance(
  walletAddress: string, 
  tokenMint?: string
): Promise<number> {
  const mint = tokenMint || getConfiguredTokenMint();
  
  if (!mint) {
    return 0;
  }
  
  // Invalidate cache first
  invalidateTokenCache(walletAddress, mint);
  
  const info = await getTokenBalance(walletAddress, mint);
  return info.balance;
}

// Export cache for testing
export { balanceCache };

