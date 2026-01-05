/**
 * AQUA Launchpad - Precision Math Library
 * 
 * Handles Solana lamport conversions and token decimal calculations
 * Uses BigInt to prevent floating point errors when dealing with user funds
 * 
 * CRITICAL: Always use these functions for financial calculations
 */

// ============================================================================
// CONSTANTS
// ============================================================================

/** Lamports per SOL (10^9) */
export const LAMPORTS_PER_SOL = 1_000_000_000n;

/** SOL has 9 decimal places */
export const SOL_DECIMALS = 9;

/** USDC has 6 decimal places */
export const USDC_DECIMALS = 6;

/** Minimum transaction fee in lamports */
export const BASE_TRANSACTION_FEE = 5000n;

/** Platform fee percentage (2%) */
export const PLATFORM_FEE_PERCENT = 2n;

/** Minimum platform fee in lamports */
export const MIN_PLATFORM_FEE = 1n;

// ============================================================================
// SOL CONVERSIONS
// ============================================================================

/**
 * Convert SOL to lamports using BigInt for precision
 * 
 * @param sol - Amount in SOL (can be decimal)
 * @returns Amount in lamports as BigInt
 * 
 * @example
 * solToLamports(1.5) // Returns 1500000000n
 * solToLamports(0.001) // Returns 1000000n
 */
export function solToLamports(sol: number | string): bigint {
  const solNum = typeof sol === 'string' ? parseFloat(sol) : sol;
  
  if (!Number.isFinite(solNum)) {
    throw new Error('Invalid SOL amount: must be a finite number');
  }
  
  if (solNum < 0) {
    throw new Error('Invalid SOL amount: cannot be negative');
  }
  
  // Round to 9 decimal places to avoid floating point issues
  const rounded = Math.round(solNum * 1e9);
  return BigInt(rounded);
}

/**
 * Convert lamports to SOL
 * 
 * @param lamports - Amount in lamports
 * @returns Amount in SOL as number
 * 
 * @example
 * lamportsToSol(1500000000n) // Returns 1.5
 * lamportsToSol(1000000n) // Returns 0.001
 */
export function lamportsToSol(lamports: bigint | number | string): number {
  const lamportsBigInt = typeof lamports === 'bigint' 
    ? lamports 
    : BigInt(Math.floor(Number(lamports)));
  
  return Number(lamportsBigInt) / Number(LAMPORTS_PER_SOL);
}

// ============================================================================
// TOKEN CONVERSIONS
// ============================================================================

/**
 * Convert human-readable token amount to raw amount (with decimals)
 * 
 * @param amount - Human-readable amount
 * @param decimals - Token decimals (usually 9 for Solana tokens)
 * @returns Raw amount as BigInt
 * 
 * @example
 * tokenToRaw(100, 9) // Returns 100000000000n for a token with 9 decimals
 */
export function tokenToRaw(amount: number | string, decimals: number): bigint {
  const amountNum = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  if (!Number.isFinite(amountNum)) {
    throw new Error('Invalid token amount: must be a finite number');
  }
  
  if (amountNum < 0) {
    throw new Error('Invalid token amount: cannot be negative');
  }
  
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new Error('Invalid decimals: must be an integer between 0 and 18');
  }
  
  const multiplier = Math.pow(10, decimals);
  const rounded = Math.round(amountNum * multiplier);
  return BigInt(rounded);
}

/**
 * Convert raw token amount to human-readable amount
 * 
 * @param rawAmount - Raw amount (with decimals)
 * @param decimals - Token decimals
 * @returns Human-readable amount as number
 */
export function rawToToken(rawAmount: bigint | number | string, decimals: number): number {
  const rawBigInt = typeof rawAmount === 'bigint' 
    ? rawAmount 
    : BigInt(Math.floor(Number(rawAmount)));
  
  const divisor = Math.pow(10, decimals);
  return Number(rawBigInt) / divisor;
}

// ============================================================================
// FEE CALCULATIONS
// ============================================================================

/**
 * Calculate platform fee (2%) from transaction amount
 * Uses BigInt for precision - rounds UP to ensure platform receives fair fee
 * 
 * @param transactionLamports - Transaction amount in lamports
 * @returns Fee amount in lamports
 * 
 * @example
 * calculatePlatformFee(100000000n) // Returns 2000000n (2% of 0.1 SOL)
 */
export function calculatePlatformFee(transactionLamports: bigint): bigint {
  if (transactionLamports <= 0n) {
    return 0n;
  }
  
  // Calculate 2%: (amount * 2) / 100
  const fee = (transactionLamports * PLATFORM_FEE_PERCENT) / 100n;
  
  // Ensure minimum fee
  return fee > MIN_PLATFORM_FEE ? fee : MIN_PLATFORM_FEE;
}

/**
 * Calculate referral split from platform fee
 * Referrer gets 50% of the platform fee
 * 
 * @param platformFee - Platform fee in lamports
 * @returns Referrer share in lamports
 */
export function calculateReferralShare(platformFee: bigint): bigint {
  return platformFee / 2n;
}

/**
 * Estimate total transaction cost including all fees
 * 
 * @param operationLamports - Base operation amount in lamports
 * @param priorityFeeLamports - Priority fee in lamports
 * @param includeBuffer - Whether to include 0.1% safety buffer
 * @returns Detailed cost breakdown
 */
export function estimateTotalCost(
  operationLamports: bigint,
  priorityFeeLamports: bigint = 0n,
  includeBuffer: boolean = true
): {
  operation: bigint;
  platformFee: bigint;
  priorityFee: bigint;
  networkFee: bigint;
  safetyBuffer: bigint;
  total: bigint;
} {
  const platformFee = calculatePlatformFee(operationLamports);
  const networkFee = BASE_TRANSACTION_FEE;
  
  const subtotal = operationLamports + platformFee + priorityFeeLamports + networkFee;
  
  // Add 0.1% safety buffer for slippage
  const safetyBuffer = includeBuffer ? (subtotal * 1n) / 1000n : 0n;
  
  return {
    operation: operationLamports,
    platformFee,
    priorityFee: priorityFeeLamports,
    networkFee,
    safetyBuffer,
    total: subtotal + safetyBuffer,
  };
}

// ============================================================================
// DISPLAY FORMATTING
// ============================================================================

/**
 * Format SOL amount for display with appropriate precision
 * 
 * @param sol - Amount in SOL
 * @returns Formatted string
 * 
 * @example
 * formatSol(1.5) // "1.5000"
 * formatSol(0.001234) // "0.001234"
 * formatSol(0.000000001) // "0.000000001"
 */
export function formatSol(sol: number): string {
  if (!Number.isFinite(sol)) return '0';
  
  if (sol >= 1) return sol.toFixed(4);
  if (sol >= 0.001) return sol.toFixed(6);
  if (sol >= 0.000001) return sol.toFixed(9);
  
  return sol.toExponential(2);
}

/**
 * Format USD amount for display
 * 
 * @param usd - Amount in USD
 * @returns Formatted string with $ prefix
 * 
 * @example
 * formatUsd(1234.56) // "$1,234.56"
 * formatUsd(0.001234) // "$0.0012"
 */
export function formatUsd(usd: number): string {
  if (!Number.isFinite(usd)) return '$0.00';
  
  if (usd >= 1) {
    return `$${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  
  if (usd >= 0.01) {
    return `$${usd.toFixed(4)}`;
  }
  
  if (usd >= 0.000001) {
    return `$${usd.toFixed(6)}`;
  }
  
  return `$${usd.toExponential(2)}`;
}

/**
 * Format token amount for display
 * 
 * @param amount - Token amount
 * @param decimals - Display decimals (default 4)
 * @returns Formatted string
 */
export function formatTokenAmount(amount: number, decimals: number = 4): string {
  if (!Number.isFinite(amount)) return '0';
  
  if (amount >= 1_000_000_000) {
    return `${(amount / 1_000_000_000).toFixed(2)}B`;
  }
  
  if (amount >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(2)}M`;
  }
  
  if (amount >= 1_000) {
    return `${(amount / 1_000).toFixed(2)}K`;
  }
  
  return amount.toFixed(decimals);
}

/**
 * Format percentage for display
 * 
 * @param percent - Percentage value
 * @param decimals - Decimal places (default 2)
 * @returns Formatted string with % suffix
 */
export function formatPercent(percent: number, decimals: number = 2): string {
  if (!Number.isFinite(percent)) return '0%';
  return `${percent.toFixed(decimals)}%`;
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate that an amount is safe for transaction
 * 
 * @param lamports - Amount in lamports
 * @param minLamports - Minimum allowed (default 1)
 * @param maxLamports - Maximum allowed (optional)
 * @returns Validation result
 */
export function validateAmount(
  lamports: bigint,
  minLamports: bigint = 1n,
  maxLamports?: bigint
): { valid: boolean; error?: string } {
  if (lamports < minLamports) {
    return { 
      valid: false, 
      error: `Amount too small. Minimum: ${formatSol(lamportsToSol(minLamports))} SOL` 
    };
  }
  
  if (maxLamports !== undefined && lamports > maxLamports) {
    return { 
      valid: false, 
      error: `Amount too large. Maximum: ${formatSol(lamportsToSol(maxLamports))} SOL` 
    };
  }
  
  return { valid: true };
}

/**
 * Safe BigInt comparison
 */
export function compareBigInt(a: bigint, b: bigint): -1 | 0 | 1 {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Get maximum of BigInt array
 */
export function maxBigInt(...values: bigint[]): bigint {
  return values.reduce((max, val) => val > max ? val : max, values[0]);
}

/**
 * Get minimum of BigInt array
 */
export function minBigInt(...values: bigint[]): bigint {
  return values.reduce((min, val) => val < min ? val : min, values[0]);
}

