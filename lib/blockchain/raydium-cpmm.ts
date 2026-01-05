/**
 * AQUA Launchpad - Raydium CPMM Pool Module
 * 
 * Ported from raydiumspltoken/raydium_sdk.js and raydium_impl.js
 * Handles:
 * - Pool creation via Raydium SDK V2
 * - Add/Remove liquidity
 * - Lock LP tokens
 * - Pool info queries
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import { solToLamports, lamportsToSol } from '@/lib/precision';

// ============================================================================
// TYPES
// ============================================================================

export interface CreatePoolParams {
  connection: Connection;
  ownerKeypair: Keypair;
  tokenMint: string;
  tokenAmount: string;
  solAmount: string;
  tokenDecimals: number;
  openTime?: number; // Unix timestamp
  feePercent?: string; // "0.25%" | "1%" | "2%" | "4%"
}

export interface CreatePoolResult {
  success: boolean;
  poolAddress?: string;
  lpMint?: string;
  txSignature?: string;
  allSignatures?: string[];
  error?: string;
}

export interface AddLiquidityParams {
  connection: Connection;
  ownerKeypair: Keypair;
  poolAddress: string;
  tokenMint: string;
  tokenAmount: string;
  solAmount: string;
  tokenDecimals: number;
  slippageBps?: number;
}

export interface RemoveLiquidityParams {
  connection: Connection;
  ownerKeypair: Keypair;
  poolAddress: string;
  lpTokenAmount: string;
  slippageBps?: number;
}

export interface LiquidityResult {
  success: boolean;
  txSignature?: string;
  tokenAmount?: string;
  solAmount?: string;
  lpTokenAmount?: string;
  error?: string;
}

export interface PoolInfo {
  address: string;
  lpMint: string;
  tokenMint: string;
  quoteMint: string;
  tokenReserve: string;
  quoteReserve: string;
  lpSupply: string;
  feeRate: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Raydium CPMM Program IDs (mainnet)
const RAYDIUM_CPMM_PROGRAM = new PublicKey('CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C');
const RAYDIUM_CPMM_FEE_ACCOUNT = new PublicKey('3oE58BKVt8KuYkGxx8zBojugnymWmBiyafWgMrnb6eYy');

// Wrapped SOL
const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

// ============================================================================
// SDK INITIALIZATION
// ============================================================================

/**
 * Dynamically import Raydium SDK (ESM module)
 */
async function getRaydiumSDK() {
  const Raydium = await import('@raydium-io/raydium-sdk-v2');
  return Raydium;
}

/**
 * Initialize Raydium SDK instance
 */
async function initializeRaydiumSDK(connection: Connection, owner: Keypair) {
  const { Raydium } = await getRaydiumSDK();
  
  const raydium = await Raydium.load({
    connection,
    owner,
    cluster: 'mainnet',
    disableFeatureCheck: true,
    disableLoadToken: false,
  });
  
  return raydium;
}

// ============================================================================
// POOL CREATION
// ============================================================================

/**
 * Create a Raydium CPMM pool
 * Ported from raydiumspltoken/raydium_sdk.js createCPMMPoolSDK()
 */
export async function createCPMMPool(params: CreatePoolParams): Promise<CreatePoolResult> {
  const {
    connection,
    ownerKeypair,
    tokenMint,
    tokenAmount,
    solAmount,
    tokenDecimals,
    openTime = 0,
  } = params;

  try {
    console.log('[RAYDIUM] Creating CPMM pool...');
    console.log(`[RAYDIUM] Token: ${tokenMint}`);
    console.log(`[RAYDIUM] Amount: ${tokenAmount} tokens, ${solAmount} SOL`);

    const { Raydium, TxVersion } = await getRaydiumSDK();
    const BN = (await import('bn.js')).default;
    const Decimal = (await import('decimal.js')).default;

    // Initialize Raydium SDK
    const raydium = await Raydium.load({
      connection,
      owner: ownerKeypair,
      cluster: 'mainnet',
      disableFeatureCheck: true,
      disableLoadToken: false,
    });

    // Token mints
    const baseMint = new PublicKey(tokenMint);
    const quoteMint = WSOL_MINT;

    // Determine if Token-2022
    const mintAccountInfo = await connection.getAccountInfo(baseMint);
    const isToken2022 = mintAccountInfo && mintAccountInfo.owner.equals(TOKEN_2022_PROGRAM_ID);
    const tokenProgramId = isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;

    console.log(`[RAYDIUM] Token program: ${isToken2022 ? 'Token-2022' : 'SPL Token'}`);

    // Convert amounts
    const baseAmount = new Decimal(tokenAmount).mul(new Decimal(10).pow(tokenDecimals));
    const quoteAmount = new Decimal(solAmount).mul(new Decimal(10).pow(9));

    // Ensure WSOL ATA exists
    const quoteAta = getAssociatedTokenAddressSync(
      quoteMint,
      ownerKeypair.publicKey,
      false,
      TOKEN_PROGRAM_ID
    );

    const quoteAtaInfo = await connection.getAccountInfo(quoteAta);
    if (!quoteAtaInfo) {
      console.log('[RAYDIUM] Creating WSOL ATA...');
      const createWsolAtaTx = new Transaction().add(
        createAssociatedTokenAccountInstruction(
          ownerKeypair.publicKey,
          quoteAta,
          ownerKeypair.publicKey,
          quoteMint,
          TOKEN_PROGRAM_ID
        )
      );

      const { blockhash } = await connection.getLatestBlockhash();
      createWsolAtaTx.recentBlockhash = blockhash;
      createWsolAtaTx.feePayer = ownerKeypair.publicKey;
      createWsolAtaTx.sign(ownerKeypair);

      const wsolSig = await connection.sendRawTransaction(createWsolAtaTx.serialize());
      await connection.confirmTransaction(wsolSig, 'confirmed');
      console.log(`[RAYDIUM] WSOL ATA created: ${wsolSig}`);
    }

    // Fetch CPMM configs
    console.log('[RAYDIUM] Fetching CPMM configs...');
    const configs = await raydium.api.getCpmmConfigs();
    
    if (!configs || configs.length === 0) {
      throw new Error('No CPMM configs available from Raydium API');
    }

    const feeConfig = configs[0];
    console.log(`[RAYDIUM] Using fee config: ${feeConfig.id}`);

    // Prepare mint info
    const mintAInfo = {
      address: baseMint.toBase58(),
      decimals: tokenDecimals,
      programId: tokenProgramId.toBase58(),
    };

    const mintBInfo = {
      address: quoteMint.toBase58(),
      decimals: 9,
      programId: TOKEN_PROGRAM_ID.toBase58(),
    };

    // Convert to BN
    const mintAAmount = new BN(baseAmount.toFixed(0));
    const mintBAmount = new BN(quoteAmount.toFixed(0));
    const startTime = new BN(openTime || Math.floor(Date.now() / 1000));

    console.log('[RAYDIUM] Creating pool transaction...');

    // Create pool
    const poolResult = await raydium.cpmm.createPool({
      programId: RAYDIUM_CPMM_PROGRAM,
      poolFeeAccount: RAYDIUM_CPMM_FEE_ACCOUNT,
      mintA: mintAInfo,
      mintB: mintBInfo,
      mintAAmount,
      mintBAmount,
      startTime,
      feeConfig,
      associatedOnly: false,
      ownerInfo: {
        useSOLBalance: true,
      },
      txVersion: TxVersion.V0,
      computeBudgetConfig: {
        units: 600000,
        microLamports: 100000000,
      },
    });

    const { execute, extInfo } = poolResult;

    if (!execute || typeof execute !== 'function') {
      throw new Error('SDK did not return execute function');
    }

    console.log('[RAYDIUM] Executing pool creation...');

    // Execute transaction - SDK returns different formats, handle dynamically
    const executeResult = await execute({
      sendAndConfirm: true,
    }) as any;

    // Extract transaction IDs - handle both array and single object formats
    let txIds: string[] = [];
    if (Array.isArray(executeResult)) {
      txIds = executeResult.map((r: any) => r.txId || r);
    } else if (executeResult?.txId) {
      txIds = [executeResult.txId];
    } else if (typeof executeResult === 'string') {
      txIds = [executeResult];
    }

    if (!txIds || txIds.length === 0) {
      throw new Error('No transaction IDs returned');
    }

    console.log(`[RAYDIUM] Pool created: ${txIds[0]}`);

    // Extract pool address - handle multiple possible SDK response formats
    let poolAddress = '';
    let lpMint: string | undefined;

    if (extInfo) {
      console.log('[RAYDIUM] extInfo keys:', Object.keys(extInfo));
      
      // Cast to any to handle dynamic SDK response
      const ext = extInfo as any;
      
      // Try different possible locations for pool address
      const addressCandidates = [
        ext.address?.poolId,
        ext.address?.id,
        ext.address?.pool,
        ext.poolId,
        ext.address,
      ];
      
      for (const candidate of addressCandidates) {
        if (candidate) {
          poolAddress = typeof candidate.toBase58 === 'function' 
            ? candidate.toBase58() 
            : String(candidate);
          if (poolAddress && poolAddress.length >= 32) {
            console.log('[RAYDIUM] Found pool address:', poolAddress);
            break;
          }
        }
      }

      // Try different possible locations for LP mint
      const lpMintCandidates = [
        ext.address?.lpMint,
        ext.lpMint,
      ];
      
      for (const candidate of lpMintCandidates) {
        if (candidate) {
          lpMint = typeof candidate.toBase58 === 'function' 
            ? candidate.toBase58() 
            : String(candidate);
          if (lpMint && lpMint.length >= 32) {
            console.log('[RAYDIUM] Found LP mint:', lpMint);
            break;
          }
        }
      }
    }

    // Fallback to transaction ID if no pool address found
    if (!poolAddress) {
      console.warn('[RAYDIUM] Could not extract pool address from extInfo, using tx signature');
      poolAddress = txIds[0];
    }

    return {
      success: true,
      poolAddress,
      lpMint,
      txSignature: txIds[0],
      allSignatures: txIds,
    };

  } catch (error) {
    console.error('[RAYDIUM] Pool creation error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Pool creation failed',
    };
  }
}

// ============================================================================
// LIQUIDITY MANAGEMENT
// ============================================================================

/**
 * Add liquidity to an existing CPMM pool
 */
export async function addLiquidity(params: AddLiquidityParams): Promise<LiquidityResult> {
  const {
    connection,
    ownerKeypair,
    poolAddress,
    tokenMint,
    tokenAmount,
    solAmount,
    tokenDecimals,
    slippageBps = 100,
  } = params;

  try {
    console.log('[RAYDIUM] Adding liquidity...');
    console.log(`[RAYDIUM] Pool: ${poolAddress}`);
    console.log(`[RAYDIUM] Amount: ${tokenAmount} tokens, ${solAmount} SOL`);

    const { Raydium, TxVersion, Percent } = await getRaydiumSDK();
    const BN = (await import('bn.js')).default;
    const Decimal = (await import('decimal.js')).default;

    // Initialize SDK
    const raydium = await Raydium.load({
      connection,
      owner: ownerKeypair,
      cluster: 'mainnet',
      disableFeatureCheck: true,
      disableLoadToken: false,
    });

    // Get pool info
    const poolId = new PublicKey(poolAddress);
    const poolInfo = await raydium.cpmm.getPoolInfoFromRpc(poolId.toBase58());

    if (!poolInfo) {
      throw new Error('Pool not found');
    }

    // Calculate amounts
    const inputAmount = new BN(
      new Decimal(tokenAmount).mul(new Decimal(10).pow(tokenDecimals)).toFixed(0)
    );

    // Add liquidity using SDK's Percent class for slippage
    const result = await raydium.cpmm.addLiquidity({
      poolInfo: poolInfo.poolInfo,
      poolKeys: poolInfo.poolKeys,
      inputAmount,
      slippage: new Percent(slippageBps, 10000), // Use SDK Percent class
      baseIn: true, // Using base token as input
      txVersion: TxVersion.V0,
      computeBudgetConfig: {
        units: 400000,
        microLamports: 50000000,
      },
    });

    const { execute } = result;
    const executeResult = await execute({
      sendAndConfirm: true,
    }) as any;

    // Extract transaction IDs - handle both array and single object formats
    let txIds: string[] = [];
    if (Array.isArray(executeResult)) {
      txIds = executeResult.map((r: any) => r.txId || r);
    } else if (executeResult?.txId) {
      txIds = [executeResult.txId];
    } else if (typeof executeResult === 'string') {
      txIds = [executeResult];
    }

    console.log(`[RAYDIUM] Liquidity added: ${txIds[0]}`);

    return {
      success: true,
      txSignature: txIds[0],
      tokenAmount,
      solAmount,
    };

  } catch (error) {
    console.error('[RAYDIUM] Add liquidity error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Add liquidity failed',
    };
  }
}

/**
 * Remove liquidity from a CPMM pool
 */
export async function removeLiquidity(params: RemoveLiquidityParams): Promise<LiquidityResult> {
  const {
    connection,
    ownerKeypair,
    poolAddress,
    lpTokenAmount,
    slippageBps = 100,
  } = params;

  try {
    console.log('[RAYDIUM] Removing liquidity...');
    console.log(`[RAYDIUM] Pool: ${poolAddress}`);
    console.log(`[RAYDIUM] LP Amount: ${lpTokenAmount}`);

    const { Raydium, TxVersion, Percent } = await getRaydiumSDK();
    const BN = (await import('bn.js')).default;

    // Initialize SDK
    const raydium = await Raydium.load({
      connection,
      owner: ownerKeypair,
      cluster: 'mainnet',
      disableFeatureCheck: true,
      disableLoadToken: false,
    });

    // Get pool info
    const poolId = new PublicKey(poolAddress);
    const poolInfo = await raydium.cpmm.getPoolInfoFromRpc(poolId.toBase58());

    if (!poolInfo) {
      throw new Error('Pool not found');
    }

    // LP token amount
    const lpAmount = new BN(lpTokenAmount);

    // Remove liquidity using SDK's Percent class for slippage
    const result = await raydium.cpmm.withdrawLiquidity({
      poolInfo: poolInfo.poolInfo,
      poolKeys: poolInfo.poolKeys,
      lpAmount,
      slippage: new Percent(slippageBps, 10000), // Use SDK Percent class
      txVersion: TxVersion.V0,
      computeBudgetConfig: {
        units: 400000,
        microLamports: 50000000,
      },
    });

    const { execute } = result;
    const executeResult = await execute({
      sendAndConfirm: true,
    }) as any;

    // Extract transaction IDs - handle both array and single object formats
    let txIds: string[] = [];
    if (Array.isArray(executeResult)) {
      txIds = executeResult.map((r: any) => r.txId || r);
    } else if (executeResult?.txId) {
      txIds = [executeResult.txId];
    } else if (typeof executeResult === 'string') {
      txIds = [executeResult];
    }

    console.log(`[RAYDIUM] Liquidity removed: ${txIds[0]}`);

    return {
      success: true,
      txSignature: txIds[0],
      lpTokenAmount,
    };

  } catch (error) {
    console.error('[RAYDIUM] Remove liquidity error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Remove liquidity failed',
    };
  }
}

/**
 * Lock LP tokens (using Raydium's lockLp function)
 */
export async function lockLpTokens(
  connection: Connection,
  ownerKeypair: Keypair,
  poolAddress: string,
  lpAmount: string,
  lockDurationSeconds: number
): Promise<LiquidityResult> {
  try {
    console.log('[RAYDIUM] Locking LP tokens...');
    console.log(`[RAYDIUM] Pool: ${poolAddress}`);
    console.log(`[RAYDIUM] Amount: ${lpAmount}`);
    console.log(`[RAYDIUM] Duration: ${lockDurationSeconds}s`);

    const { Raydium, TxVersion } = await getRaydiumSDK();
    const BN = (await import('bn.js')).default;

    // Initialize SDK
    const raydium = await Raydium.load({
      connection,
      owner: ownerKeypair,
      cluster: 'mainnet',
      disableFeatureCheck: true,
      disableLoadToken: false,
    });

    // Get pool info
    const poolId = new PublicKey(poolAddress);
    const poolInfo = await raydium.cpmm.getPoolInfoFromRpc(poolId.toBase58());

    if (!poolInfo) {
      throw new Error('Pool not found');
    }

    // Lock LP
    const result = await raydium.cpmm.lockLp({
      poolInfo: poolInfo.poolInfo,
      lpAmount: new BN(lpAmount),
      withMetadata: true,
      txVersion: TxVersion.V0,
      computeBudgetConfig: {
        units: 400000,
        microLamports: 50000000,
      },
    });

    const { execute } = result;
    const executeResult = await execute({
      sendAndConfirm: true,
    }) as any;

    // Extract transaction IDs - handle both array and single object formats
    let txIds: string[] = [];
    if (Array.isArray(executeResult)) {
      txIds = executeResult.map((r: any) => r.txId || r);
    } else if (executeResult?.txId) {
      txIds = [executeResult.txId];
    } else if (typeof executeResult === 'string') {
      txIds = [executeResult];
    }

    console.log(`[RAYDIUM] LP tokens locked: ${txIds[0]}`);

    return {
      success: true,
      txSignature: txIds[0],
      lpTokenAmount: lpAmount,
    };

  } catch (error) {
    console.error('[RAYDIUM] Lock LP error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Lock LP failed',
    };
  }
}

// ============================================================================
// POOL QUERIES
// ============================================================================

/**
 * Get pool information
 */
export async function getPoolInfo(
  connection: Connection,
  poolAddress: string
): Promise<PoolInfo | null> {
  try {
    const { Raydium } = await getRaydiumSDK();

    // Initialize SDK (no owner needed for read-only)
    const raydium = await Raydium.load({
      connection,
      cluster: 'mainnet',
      disableFeatureCheck: true,
      disableLoadToken: true,
    });

    const poolId = new PublicKey(poolAddress);
    const poolInfo = await raydium.cpmm.getPoolInfoFromRpc(poolId.toBase58());

    if (!poolInfo) {
      return null;
    }

    // Cast to any to handle dynamic SDK response
    const info = poolInfo.poolInfo as any;

    return {
      address: poolAddress,
      lpMint: typeof info.lpMint?.toBase58 === 'function' ? info.lpMint.toBase58() : (info.lpMint || ''),
      tokenMint: typeof info.mintA?.toBase58 === 'function' ? info.mintA.toBase58() : (info.mintA || ''),
      quoteMint: typeof info.mintB?.toBase58 === 'function' ? info.mintB.toBase58() : (info.mintB || ''),
      tokenReserve: info.mintAmountA?.toString() || info.vaultAAmount?.toString() || '0',
      quoteReserve: info.mintAmountB?.toString() || info.vaultBAmount?.toString() || '0',
      lpSupply: info.lpAmount?.toString() || info.lpSupply?.toString() || '0',
      feeRate: info.config?.tradeFeeRate || info.configInfo?.tradeFeeRate || 0,
    };

  } catch (error) {
    console.error('[RAYDIUM] Get pool info error:', error);
    return null;
  }
}

/**
 * Calculate price from pool reserves
 */
export function calculatePriceFromReserves(
  tokenReserve: string,
  quoteReserve: string,
  tokenDecimals: number
): number {
  const tokenAmount = parseFloat(tokenReserve) / Math.pow(10, tokenDecimals);
  const solAmount = parseFloat(quoteReserve) / 1e9;
  
  if (tokenAmount === 0) return 0;
  return solAmount / tokenAmount;
}

// ============================================================================
// CREATOR FEE COLLECTION
// ============================================================================

/**
 * Raydium CPMM Creator Fee - similar to Pump.fun creator rewards
 * Pool creators earn a share of trading fees from their pools
 */

export interface CreatorFeeInfo {
  poolId: string;
  poolName: string;
  mintA: { address: string; symbol?: string; decimals: number };
  mintB: { address: string; symbol?: string; decimals: number };
  feeAmountA: string;
  feeAmountB: string;
}

export interface CreatorFeesResult {
  success: boolean;
  pools: CreatorFeeInfo[];
  totalPools: number;
  error?: string;
}

export interface CollectCreatorFeeResult {
  success: boolean;
  txSignature?: string;
  allSignatures?: string[];
  poolsProcessed?: number;
  error?: string;
}

/**
 * Get pending creator fees for a wallet across all CPMM pools
 * Uses Raydium's temp API endpoint
 */
export async function getCreatorFees(
  walletAddress: string,
  isDevnet: boolean = false
): Promise<CreatorFeesResult> {
  try {
    const axios = (await import('axios')).default;
    
    const host = isDevnet 
      ? 'https://temp-api-v1-devnet.raydium.io'
      : 'https://temp-api-v1.raydium.io';
    
    console.log(`[RAYDIUM] Fetching creator fees for ${walletAddress}...`);
    
    const response = await axios.get(`${host}/cp-creator-fee?wallet=${walletAddress}`, {
      timeout: 30000,
    });
    
    if (!response.data?.success) {
      return {
        success: false,
        pools: [],
        totalPools: 0,
        error: 'Failed to fetch creator fees from Raydium API',
      };
    }
    
    const pools: CreatorFeeInfo[] = response.data.data.map((item: any) => ({
      poolId: item.poolInfo.id,
      poolName: `${item.poolInfo.mintA.symbol || 'Unknown'}/${item.poolInfo.mintB.symbol || 'Unknown'}`,
      mintA: {
        address: item.poolInfo.mintA.address,
        symbol: item.poolInfo.mintA.symbol,
        decimals: item.poolInfo.mintA.decimals,
      },
      mintB: {
        address: item.poolInfo.mintB.address,
        symbol: item.poolInfo.mintB.symbol,
        decimals: item.poolInfo.mintB.decimals,
      },
      feeAmountA: item.fee.amountA,
      feeAmountB: item.fee.amountB,
    }));
    
    // Filter to only pools with pending fees
    const poolsWithFees = pools.filter(
      (p) => p.feeAmountA !== '0' || p.feeAmountB !== '0'
    );
    
    console.log(`[RAYDIUM] Found ${poolsWithFees.length} pools with pending fees`);
    
    return {
      success: true,
      pools: poolsWithFees,
      totalPools: pools.length,
    };
  } catch (error) {
    console.error('[RAYDIUM] Error fetching creator fees:', error);
    return {
      success: false,
      pools: [],
      totalPools: 0,
      error: error instanceof Error ? error.message : 'Failed to fetch creator fees',
    };
  }
}

/**
 * Collect creator fees from a single CPMM pool
 */
export async function collectCreatorFee(
  connection: Connection,
  ownerKeypair: Keypair,
  poolAddress: string
): Promise<CollectCreatorFeeResult> {
  try {
    console.log(`[RAYDIUM] Collecting creator fees from pool ${poolAddress}...`);
    
    const { Raydium, TxVersion, CREATE_CPMM_POOL_PROGRAM } = await getRaydiumSDK();
    
    // Initialize SDK
    const raydium = await Raydium.load({
      connection,
      owner: ownerKeypair,
      cluster: 'mainnet',
      disableFeatureCheck: true,
      disableLoadToken: false,
    });
    
    // Get pool info
    const poolId = new PublicKey(poolAddress);
    const poolData = await raydium.cpmm.getPoolInfoFromRpc(poolId.toBase58());
    
    if (!poolData) {
      throw new Error('Pool not found');
    }
    
    // Collect creator fees - use harvestAllRewards or similar available method
    // Note: The SDK may not have collectCreatorFees directly, use available methods
    const cpmmModule = raydium.cpmm as any;
    
    // Try different possible method names in the SDK
    let result: any;
    if (typeof cpmmModule.collectCreatorFee === 'function') {
      result = await cpmmModule.collectCreatorFee({
        programId: CREATE_CPMM_POOL_PROGRAM,
        poolInfo: poolData.poolInfo,
        poolKeys: poolData.poolKeys,
        txVersion: TxVersion.V0,
        computeBudgetConfig: {
          units: 400000,
          microLamports: 50000000,
        },
      });
    } else if (typeof cpmmModule.harvestLpFees === 'function') {
      result = await cpmmModule.harvestLpFees({
        poolInfo: poolData.poolInfo,
        poolKeys: poolData.poolKeys,
        txVersion: TxVersion.V0,
      });
    } else {
      throw new Error('SDK does not support creator fee collection for this pool type');
    }
    
    const { execute } = result;
    const executeResult = await execute({
      sendAndConfirm: true,
    }) as any;

    // Extract transaction IDs
    let txIds: string[] = [];
    if (Array.isArray(executeResult)) {
      txIds = executeResult.map((r: any) => r.txId || r);
    } else if (executeResult?.txId) {
      txIds = [executeResult.txId];
    } else if (typeof executeResult === 'string') {
      txIds = [executeResult];
    }
    
    console.log(`[RAYDIUM] Creator fees collected: ${txIds[0]}`);
    
    return {
      success: true,
      txSignature: txIds[0],
      allSignatures: txIds,
      poolsProcessed: 1,
    };
  } catch (error) {
    console.error('[RAYDIUM] Collect creator fee error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to collect creator fees',
    };
  }
}

/**
 * Collect creator fees from all CPMM pools for a wallet
 */
export async function collectAllCreatorFees(
  connection: Connection,
  ownerKeypair: Keypair,
  isDevnet: boolean = false
): Promise<CollectCreatorFeeResult> {
  try {
    const walletAddress = ownerKeypair.publicKey.toBase58();
    console.log(`[RAYDIUM] Collecting all creator fees for ${walletAddress}...`);
    
    const { Raydium, TxVersion, CREATE_CPMM_POOL_PROGRAM, DEVNET_PROGRAM_ID } = await getRaydiumSDK();
    const axios = (await import('axios')).default;
    
    // Fetch pending fees
    const host = isDevnet 
      ? 'https://temp-api-v1-devnet.raydium.io'
      : 'https://temp-api-v1.raydium.io';
    
    const response = await axios.get(`${host}/cp-creator-fee?wallet=${walletAddress}`, {
      timeout: 30000,
    });
    
    if (!response.data?.data?.length) {
      return {
        success: false,
        error: 'No CPMM pools with pending creator fees found',
        poolsProcessed: 0,
      };
    }
    
    // Filter to pools with fees
    const poolsWithFees = response.data.data.filter(
      (d: any) => d.fee.amountA !== '0' || d.fee.amountB !== '0'
    );
    
    if (poolsWithFees.length === 0) {
      return {
        success: true,
        poolsProcessed: 0,
        error: 'No pending creator fees to collect',
      };
    }
    
    console.log(`[RAYDIUM] Found ${poolsWithFees.length} pools with pending fees`);
    
    // Initialize SDK
    const raydium = await Raydium.load({
      connection,
      owner: ownerKeypair,
      cluster: isDevnet ? 'devnet' : 'mainnet',
      disableFeatureCheck: true,
      disableLoadToken: false,
    });
    
    // Collect from all pools
    const programId = isDevnet 
      ? DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM 
      : CREATE_CPMM_POOL_PROGRAM;
    
    // Cast to any to handle different SDK versions
    const cpmmModule = raydium.cpmm as any;
    
    // Try different possible method names
    let collectResult: any;
    if (typeof cpmmModule.collectMultiCreatorFee === 'function') {
      collectResult = await cpmmModule.collectMultiCreatorFee({
        poolInfoList: poolsWithFees.map((d: any) => d.poolInfo),
        programId,
        txVersion: TxVersion.V0,
      });
    } else {
      // Fallback: collect from each pool individually
      const signatures: string[] = [];
      for (const poolData of poolsWithFees) {
        try {
          const singleResult = await collectCreatorFee(
            connection,
            ownerKeypair,
            poolData.poolInfo.id || poolData.poolId
          );
          if (singleResult.success && singleResult.txSignature) {
            signatures.push(singleResult.txSignature);
          }
        } catch (e) {
          console.warn(`[RAYDIUM] Failed to collect from pool:`, e);
        }
      }
      
      console.log(`[RAYDIUM] Collected fees from ${signatures.length} pools`);
      
      return {
        success: signatures.length > 0,
        txSignature: signatures[0],
        allSignatures: signatures,
        poolsProcessed: signatures.length,
      };
    }
    
    const { execute } = collectResult;
    const executeResult = await execute({
      sendAndConfirm: true,
    }) as any;
    
    const signatures = Array.isArray(executeResult) 
      ? executeResult.map((r: any) => r.txId || r)
      : [executeResult?.txId || executeResult];
    
    console.log(`[RAYDIUM] Collected fees from ${poolsWithFees.length} pools`);
    
    return {
      success: true,
      txSignature: signatures[0],
      allSignatures: signatures,
      poolsProcessed: poolsWithFees.length,
    };
  } catch (error) {
    console.error('[RAYDIUM] Collect all creator fees error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to collect creator fees',
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  RAYDIUM_CPMM_PROGRAM,
  RAYDIUM_CPMM_FEE_ACCOUNT,
  WSOL_MINT,
};

