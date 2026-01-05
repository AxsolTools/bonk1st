/**
 * AQUA Launchpad - Blockchain Module
 * 
 * Exports all blockchain-related functionality
 */

// PumpPortal integration (Pump.fun & Bonk.fun)
export {
  // Types
  type TokenMetadata,
  type CreateTokenParams,
  type CreateTokenResult,
  type TradeParams,
  type TradeResult,
  type PoolType,
  type QuoteMint,
  
  // IPFS
  uploadToIPFS,
  uploadToBonkIPFS,
  
  // Token creation
  createToken,
  
  // Trading
  buyOnBondingCurve,
  sellOnBondingCurve,
  
  // Creator vault
  getCreatorVaultBalance,
  claimCreatorRewards,
  
  // Constants
  PUMP_PROGRAM_ID,
  PUMP_GLOBAL_ACCOUNT,
  PUMP_FEE_RECIPIENT,
  POOL_TYPES,
  QUOTE_MINTS,
} from './pumpfun';

// Token-2022 integration
export {
  // Types
  type Token22Metadata,
  type CreateToken22Params,
  type CreateToken22Result,
  type MintTokensParams,
  
  // Token creation
  createToken22,
  mintTokens,
  uploadToken22Metadata,
  validateToken22Params,
  
  // Constants
  TOKEN_2022_PROGRAM_ID,
} from './token22';

// Raydium CPMM integration
export {
  // Types
  type CreatePoolParams,
  type CreatePoolResult,
  type AddLiquidityParams,
  type RemoveLiquidityParams,
  type LiquidityResult,
  type PoolInfo,
  
  // Pool creation
  createCPMMPool,
  
  // Liquidity management
  addLiquidity,
  removeLiquidity,
  lockLpTokens,
  
  // Pool queries
  getPoolInfo,
  calculatePriceFromReserves,
  
  // Constants
  RAYDIUM_CPMM_PROGRAM,
  RAYDIUM_CPMM_FEE_ACCOUNT,
  WSOL_MINT,
} from './raydium-cpmm';

// Jupiter Swap (SOL <-> USD1)
export {
  // Types
  type SwapQuote,
  type SwapResult,
  
  // Price functions
  getUsd1PriceInSol,
  getSolPriceInUsd1,
  solToUsd1Amount,
  usd1ToSolAmount,
  
  // Quote functions
  getSwapSolToUsd1Quote,
  getSwapUsd1ToSolQuote,
  
  // Swap execution
  swapSolToUsd1,
  swapUsd1ToSol,
  
  // Constants
  USD1_DECIMALS,
  USD1_MULTIPLIER,
} from './jupiter-swap';

// Transfer fee management
export {
  // Types
  type HarvestFeesParams,
  type WithdrawFeesParams,
  type FeeHarvestResult,
  type WithheldFeesInfo,
  
  // Fee operations
  getAccountsWithWithheldFees,
  harvestFeesToMint,
  withdrawFeesFromMint,
  completeTransferFeeWithdrawal,
  getWithheldFeesInfo,
} from './transfer-fees';

// Jupiter Studio integration (Dynamic Bonding Curve)
export {
  // Types
  type JupiterTokenMetadata,
  type CreateJupiterTokenParams,
  type CreateJupiterTokenResult,
  type JupiterPoolInfo,
  type JupiterFeeInfo,
  type ClaimFeesResult,
  
  // Token creation
  createJupiterToken,
  validateJupiterTokenParams,
  
  // Pool & fee management
  getJupiterPoolAddress,
  getJupiterFeeInfo,
  claimJupiterFees,
  
  // Constants
  JUPITER_API_BASE,
  JUPITER_STUDIO_API,
} from './jupiter-studio';