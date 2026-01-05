/**
 * AQUA Launchpad - PumpPortal Integration
 * 
 * Adapted from HelperScripts/pumpfun_complete.js
 * Handles token creation and trading on Pump.fun bonding curve
 * 
 * Features:
 * - Token creation via PumpPortal API
 * - IPFS metadata upload
 * - Buy/sell on bonding curve
 * - Bundle transactions with Jito
 * - Creator vault fee collection
 */

import { 
  Connection, 
  PublicKey, 
  Keypair, 
  Transaction, 
  VersionedTransaction,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
  SystemProgram,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { solToLamports, lamportsToSol } from '@/lib/precision';
import FormDataLib from 'form-data';
import axios from 'axios';
import { buyViaSDK, sellViaSDK, isSDKAvailable } from './pumpfun-sdk';
import BN from 'bn.js';
import { 
  TxVersion, 
  LaunchpadConfig, 
  LAUNCHPAD_PROGRAM, 
  LaunchpadPoolInitParam,
  txToBase64,
  Raydium,
} from '@raydium-io/raydium-sdk-v2';

// ============================================================================
// CONFIGURATION
// ============================================================================

const PUMP_PORTAL_API = 'https://pumpportal.fun/api';
const PUMP_PORTAL_API_KEY = process.env.PUMPPORTAL_API_KEY || '';
const PUMP_IPFS_API = 'https://pump.fun/api/ipfs';
const PUMP_PORTAL_IPFS = 'https://pumpportal.fun/api/ipfs';

// Bonk.fun IPFS endpoints
const BONK_IPFS_IMAGE = 'https://nft-storage.letsbonk22.workers.dev/upload/img';
const BONK_IPFS_META = 'https://nft-storage.letsbonk22.workers.dev/upload/meta';

// Raydium LaunchLab API (official API for Bonk/LetsBonk token creation)
const RAYDIUM_LAUNCHLAB_API = 'https://launch-mint-v1.raydium.io';
// Bonk platform ID on Raydium LaunchLab
const BONK_PLATFORM_ID = '8pCtbn9iatQ8493mDQax4xfEUjhoVBpUWYVQoRU18333';
// Raydium LaunchLab config IDs for different quote tokens
const RAYDIUM_CONFIG_IDS = {
  WSOL: '6s1xP3hpbAfFoNtUNF8mfHsjr2Bd97JxFJRWLbL6aHuX',
  USD1: 'EPiZbnrThjyLnoQ6QQzkxeFqyL5uyg9RzNHHAudUPxBz',
} as const;

// Pool types
export const POOL_TYPES = {
  PUMP: 'pump',
  BONK: 'bonk',
} as const;

export type PoolType = typeof POOL_TYPES[keyof typeof POOL_TYPES];

// Quote mints (pair currencies)
export const QUOTE_MINTS = {
  WSOL: 'So11111111111111111111111111111111111111112',
  USD1: 'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB',
} as const;

export type QuoteMint = typeof QUOTE_MINTS[keyof typeof QUOTE_MINTS];

const PUMP_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const PUMP_GLOBAL_ACCOUNT = new PublicKey('4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf');
const PUMP_FEE_RECIPIENT = new PublicKey('CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbCvr4hckAzJfj');

// ============================================================================
// TYPES
// ============================================================================

export interface TokenMetadata {
  name: string;
  symbol: string;
  description: string;
  image: File | string; // File object or URL
  twitter?: string;
  telegram?: string;
  website?: string;
  showName?: boolean;
}

export interface CreateTokenParams {
  metadata: TokenMetadata;
  creatorKeypair: Keypair;
  initialBuySol?: number; // Initial buy in SOL (for PUMP pool or BONK/WSOL)
  initialBuyQuote?: number; // Initial buy in quote currency (for BONK/USD1 - already converted)
  slippageBps?: number;
  priorityFee?: number;
  mintKeypair?: Keypair; // Optional pre-generated mint keypair from frontend
  pool?: PoolType; // 'pump' or 'bonk' - defaults to 'pump'
  quoteMint?: QuoteMint; // Quote currency (WSOL or USD1) - only applicable for bonk pool
}

export interface CreateTokenResult {
  success: boolean;
  mintAddress?: string;
  metadataUri?: string;
  txSignature?: string;
  error?: string;
  pool?: PoolType; // Which pool was used
  quoteMint?: QuoteMint; // Which quote mint was used
}

export interface TradeParams {
  tokenMint: string;
  walletKeypair: Keypair;
  amountSol: number;
  slippageBps?: number;
  priorityFee?: number;
  tokenDecimals?: number;
  pool?: PoolType; // 'pump' or 'bonk' - defaults to 'pump'
  quoteMint?: QuoteMint; // WSOL or USD1 (for bonk) - defaults to WSOL
}

export interface TradeResult {
  success: boolean;
  txSignature?: string;
  amountTokens?: number;
  amountSol?: number;
  pricePerToken?: number;
  error?: string;
}

// ============================================================================
// IPFS UPLOAD
// ============================================================================

/**
 * Upload token metadata and image to IPFS
 */
export async function uploadToIPFS(metadata: TokenMetadata): Promise<{
  success: boolean;
  metadataUri?: string;
  error?: string;
}> {
  try {
    // Create form data using Node.js form-data package
    const form = new FormDataLib();
    
    // Handle image - support File, URL, or base64 data URI
    let imageBuffer: Buffer | null = null;
    
    if (metadata.image instanceof File) {
      // Convert File to Buffer (Node.js environment)
      const arrayBuffer = await metadata.image.arrayBuffer();
      imageBuffer = Buffer.from(arrayBuffer);
    } else if (typeof metadata.image === 'string') {
      if (metadata.image.startsWith('http')) {
        // Fetch and convert URL to buffer
        try {
          const response = await fetch(metadata.image);
          if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status}`);
          }
          const arrayBuffer = await response.arrayBuffer();
          imageBuffer = Buffer.from(arrayBuffer);
        } catch (e) {
          console.warn('[IPFS] Failed to fetch image from URL, skipping image upload');
        }
      } else if (metadata.image.startsWith('data:')) {
        // Handle base64 data URI
        try {
          const base64Data = metadata.image.split(',')[1];
          imageBuffer = Buffer.from(base64Data, 'base64');
        } catch (e) {
          console.warn('[IPFS] Failed to process base64 image, skipping image upload');
        }
      }
    }
    
    // Add image file if available (OFFICIAL format matching your working code)
    if (imageBuffer) {
      form.append('file', imageBuffer, {
        filename: 'image.png',
        contentType: 'image/png'
      });
    }
    
    // Add metadata fields (OFFICIAL format)
    form.append('name', metadata.name);
    form.append('symbol', metadata.symbol);
    form.append('description', metadata.description || '');
    form.append('showName', 'true'); // FIXED: Missing from original code
    
    if (metadata.twitter) form.append('twitter', metadata.twitter);
    if (metadata.telegram) form.append('telegram', metadata.telegram);
    if (metadata.website) form.append('website', metadata.website);

    // Try official Pump.fun endpoint first (using axios like your working code)
    let lastError: Error | null = null;
    try {
      console.log('[IPFS] Attempting upload to pump.fun endpoint...');
      const officialResponse = await axios.post(PUMP_IPFS_API, form, {
        headers: {
          ...form.getHeaders()
        },
        timeout: 30000
      });
      
      if (officialResponse.data && officialResponse.data.metadataUri) {
        console.log(`✅ Uploaded to OFFICIAL pump.fun: ${officialResponse.data.metadataUri}`);
        return {
          success: true,
          metadataUri: officialResponse.data.metadataUri,
        };
      }
    } catch (officialError: any) {
      console.warn('[IPFS] Official API failed, trying PumpPortal...', officialError?.response?.status || officialError?.message);
      lastError = officialError instanceof Error ? officialError : new Error('Official API failed');
    }

    // Fallback to PumpPortal IPFS
    try {
      console.log('[IPFS] Attempting upload to PumpPortal endpoint...');
      const pumpPortalResponse = await axios.post(`${PUMP_PORTAL_API}/ipfs`, form, {
        headers: {
          ...form.getHeaders()
        },
        timeout: 30000
      });
      
      if (!pumpPortalResponse.data || !pumpPortalResponse.data.metadataUri) {
        throw new Error('Failed to upload metadata');
      }
      
      console.log(`✅ Metadata uploaded via PumpPortal: ${pumpPortalResponse.data.metadataUri}`);
      
      return {
        success: true,
        metadataUri: pumpPortalResponse.data.metadataUri,
      };
    } catch (e: any) {
      console.error('[IPFS] PumpPortal endpoint failed:', e?.response?.status || e?.message);
      const errorDetail = e?.response?.data || e?.message || 'Unknown error';
      throw lastError || new Error(`PumpPortal IPFS upload failed: ${errorDetail}`);
    }

  } catch (error) {
    console.error('[IPFS] Upload error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'IPFS upload failed',
    };
  }
}

/**
 * Upload token metadata and image to Bonk IPFS (for bonk.fun tokens)
 * Uses different endpoints than pump.fun
 * Based on PumpPortal official documentation format
 */
export async function uploadToBonkIPFS(metadata: TokenMetadata): Promise<{
  success: boolean;
  metadataUri?: string;
  imageUri?: string;
  error?: string;
}> {
  try {
    // Handle image - support File, URL, or base64 data URI
    let imageBuffer: Buffer | null = null;
    
    if (metadata.image instanceof File) {
      const arrayBuffer = await metadata.image.arrayBuffer();
      imageBuffer = Buffer.from(arrayBuffer);
    } else if (typeof metadata.image === 'string') {
      if (metadata.image.startsWith('http')) {
        try {
          const response = await fetch(metadata.image);
          if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status}`);
          }
          const arrayBuffer = await response.arrayBuffer();
          imageBuffer = Buffer.from(arrayBuffer);
        } catch (e) {
          console.warn('[BONK-IPFS] Failed to fetch image from URL');
        }
      } else if (metadata.image.startsWith('data:')) {
        try {
          const base64Data = metadata.image.split(',')[1];
          imageBuffer = Buffer.from(base64Data, 'base64');
        } catch (e) {
          console.warn('[BONK-IPFS] Failed to process base64 image');
        }
      }
    }

    if (!imageBuffer) {
      return {
        success: false,
        error: 'Image is required for Bonk token creation',
      };
    }

    // Step 1: Upload image to Bonk IPFS using native fetch (per PumpPortal docs)
    console.log('[BONK-IPFS] Uploading image...');
    
    // Create a Blob from the buffer for native FormData compatibility
    // Convert Buffer to Uint8Array to satisfy BlobPart type
    const imageBlob = new Blob([new Uint8Array(imageBuffer)], { type: 'image/png' });
    const formData = new FormData();
    formData.append('image', imageBlob, 'image.png');

    let imageUri: string;
    try {
      const imgResponse = await fetch(BONK_IPFS_IMAGE, {
        method: 'POST',
        body: formData,
      });

      if (!imgResponse.ok) {
        const errorText = await imgResponse.text();
        throw new Error(`HTTP ${imgResponse.status}: ${errorText || imgResponse.statusText}`);
      }

      // Bonk IPFS returns plain text URI
      imageUri = await imgResponse.text();
      
      if (!imageUri || typeof imageUri !== 'string' || imageUri.length < 10) {
        throw new Error(`Invalid image URI response: ${imageUri}`);
      }
      console.log(`[BONK-IPFS] ✅ Image uploaded: ${imageUri}`);
    } catch (imgError: any) {
      const errorMessage = imgError?.message || 'Unknown error';
      console.error(`[BONK-IPFS] Image upload failed:`, errorMessage);
      throw new Error(`Bonk IPFS image upload failed: ${errorMessage}`);
    }

    // Step 2: Upload metadata to Bonk IPFS using native fetch
    console.log('[BONK-IPFS] Uploading metadata...');
    
    // Build metadata payload - only include optional URL fields if they have valid values
    // Bonk IPFS validates URL format, so empty strings will fail
    const metadataPayload: Record<string, string> = {
      createdOn: 'https://bonk.fun',
      description: metadata.description || '',
      image: imageUri,
      name: metadata.name,
      symbol: metadata.symbol,
    };
    
    // Only add website if it's a valid URL
    if (metadata.website && metadata.website.startsWith('http')) {
      metadataPayload.website = metadata.website;
    }

    let metadataUri: string;
    try {
      const metaResponse = await fetch(BONK_IPFS_META, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(metadataPayload),
      });

      if (!metaResponse.ok) {
        const errorText = await metaResponse.text();
        throw new Error(`HTTP ${metaResponse.status}: ${errorText || metaResponse.statusText}`);
      }

      // Bonk IPFS returns plain text URI
      metadataUri = await metaResponse.text();

      if (!metadataUri || typeof metadataUri !== 'string' || metadataUri.length < 10) {
        throw new Error(`Invalid metadata URI response: ${metadataUri}`);
      }
      console.log(`[BONK-IPFS] ✅ Metadata uploaded: ${metadataUri}`);
    } catch (metaError: any) {
      const errorMessage = metaError?.message || 'Unknown error';
      console.error(`[BONK-IPFS] Metadata upload failed:`, errorMessage);
      throw new Error(`Bonk IPFS metadata upload failed: ${errorMessage}`);
    }

    return {
      success: true,
      metadataUri,
      imageUri,
    };

  } catch (error: any) {
    console.error('[BONK-IPFS] Upload error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Bonk IPFS upload failed';
    
    return {
      success: false,
      error: errorMessage,
    };
  }
}

// ============================================================================
// TOKEN CREATION
// ============================================================================

/**
 * Create a new token on Pump.fun or Bonk.fun via PumpPortal
 * Supports both SOL and USD1 quote currencies for Bonk pools
 */
export async function createToken(
  connection: Connection,
  params: CreateTokenParams
): Promise<CreateTokenResult> {
  try {
    const { 
      metadata, 
      creatorKeypair, 
      initialBuySol = 0,
      initialBuyQuote, // USD1 amount (already converted from SOL via swap)
      slippageBps = 500, 
      priorityFee = 0.001, 
      mintKeypair: providedMintKeypair,
      pool = POOL_TYPES.PUMP,
      quoteMint = QUOTE_MINTS.WSOL,
    } = params;

    const logPrefix = pool === POOL_TYPES.BONK ? '[BONK]' : '[PUMP]';

    // Step 1: Upload metadata to appropriate IPFS
    console.log(`${logPrefix} Uploading metadata to IPFS...`);
    
    let ipfsResult: { success: boolean; metadataUri?: string; error?: string };
    
    if (pool === POOL_TYPES.BONK) {
      // Use Bonk IPFS for bonk.fun tokens
      ipfsResult = await uploadToBonkIPFS(metadata);
    } else {
      // Use Pump.fun IPFS for pump.fun tokens
      ipfsResult = await uploadToIPFS(metadata);
    }
    
    if (!ipfsResult.success || !ipfsResult.metadataUri) {
      console.error(`${logPrefix} IPFS upload failed:`, ipfsResult.error);
      return {
        success: false,
        error: `IPFS upload failed: ${ipfsResult.error}. Please check that the IPFS service is available or try again later.`,
      };
    }

    // Step 2: Use provided mint keypair or generate new one
    const mintKeypair = providedMintKeypair || Keypair.generate();
    const mintSource = providedMintKeypair ? 'pre-generated (frontend)' : 'generated (backend)';
    console.log(`${logPrefix} Mint address: ${mintKeypair.publicKey.toBase58()} (${mintSource})`);

    // Step 3: Request create transaction from PumpPortal
    console.log(`${logPrefix} Requesting create transaction (pool: ${pool}, quoteMint: ${quoteMint === QUOTE_MINTS.USD1 ? 'USD1' : 'SOL'})...`);
    
    // Convert slippage from basis points to percentage
    // Use higher slippage for Bonk pools (more volatile) - minimum 10%
    let slippagePercent = slippageBps / 100;
    if (pool === POOL_TYPES.BONK && slippagePercent < 10) {
      slippagePercent = 10;
    }

    // BONK pool with USD1 uses Raydium LaunchLab API + SDK (official Bonk.fun API)
    // BONK pool with WSOL uses PumpPortal Lightning API
    // PUMP pool uses PumpPortal trade-local API (client-side signing)
    if (pool === POOL_TYPES.BONK && quoteMint === QUOTE_MINTS.USD1) {
      // ========== BONK POOL USD1: Use Raydium LaunchLab API + SDK ==========
      // This is the official API that Bonk.fun uses for USD1 pairs
      // Based on: https://github.com/raydium-io/raydium-sdk-V2-demo/blob/master/src/launchpad/createBonkMintApi.ts
      console.log(`${logPrefix} Using Raydium LaunchLab API + SDK for USD1 pair...`);
      
      const configIdString = RAYDIUM_CONFIG_IDS.USD1;
      const configIdPubkey = new PublicKey(configIdString);
      const platformIdPubkey = new PublicKey(BONK_PLATFORM_ID);
      
      // Step 1: Fetch config from Raydium API
      console.log(`${logPrefix} Fetching config from Raydium...`);
      const configRes = await axios.get(`${RAYDIUM_LAUNCHLAB_API}/main/configs`);
      
      // Find the USD1 config
      const configsData = configRes.data?.data?.data || [];
      const usd1Config = configsData.find((c: any) => c.key?.pubKey === configIdString);
      
      if (!usd1Config) {
        throw new Error(`USD1 config not found in Raydium LaunchLab. Available configs: ${configsData.map((c: any) => c.key?.pubKey).join(', ')}`);
      }
      
      const configs = usd1Config.key;
      const mintBInfo = usd1Config.mintInfoB;
      
      console.log(`${logPrefix} Found USD1 config: ${configs.name}`);
      console.log(`${logPrefix} Quote token (mintB): ${configs.mintB}`);
      
      // Build configInfo for SDK
      const configInfo: ReturnType<typeof LaunchpadConfig.decode> = {
        index: configs.index,
        mintB: new PublicKey(configs.mintB),
        tradeFeeRate: new BN(configs.tradeFeeRate),
        epoch: new BN(configs.epoch),
        curveType: configs.curveType,
        migrateFee: new BN(configs.migrateFee),
        maxShareFeeRate: new BN(configs.maxShareFeeRate),
        minSupplyA: new BN(configs.minSupplyA),
        maxLockRate: new BN(configs.maxLockRate),
        minSellRateA: new BN(configs.minSellRateA),
        minMigrateRateA: new BN(configs.minMigrateRateA),
        minFundRaisingB: new BN(configs.minFundRaisingB),
        protocolFeeOwner: new PublicKey(configs.protocolFeeOwner),
        migrateFeeOwner: new PublicKey(configs.migrateFeeOwner),
        migrateToAmmWallet: new PublicKey(configs.migrateToAmmWallet),
        migrateToCpmmWallet: new PublicKey(configs.migrateToCpmmWallet),
      };
      
      // Step 2: Prepare form data and get random mint from Raydium
      const formData = new FormData();
      formData.append('wallet', creatorKeypair.publicKey.toBase58());
      formData.append('name', metadata.name);
      formData.append('symbol', metadata.symbol);
      formData.append('description', metadata.description || '');
      formData.append('configId', configIdString);
      formData.append('decimals', String(LaunchpadPoolInitParam.decimals));
      formData.append('supply', String(LaunchpadPoolInitParam.supply));
      formData.append('totalSellA', String(LaunchpadPoolInitParam.totalSellA));
      formData.append('totalFundRaisingB', String(LaunchpadPoolInitParam.totalFundRaisingB));
      formData.append('totalLockedAmount', String(LaunchpadPoolInitParam.totalLockedAmount));
      formData.append('cliffPeriod', String(LaunchpadPoolInitParam.cliffPeriod));
      formData.append('unlockPeriod', String(LaunchpadPoolInitParam.unlockPeriod));
      formData.append('platformId', BONK_PLATFORM_ID);
      formData.append('migrateType', 'amm');

      // Handle image for Raydium LaunchLab
      let imageBuffer: Buffer | null = null;
      if (metadata.image instanceof File) {
        const arrayBuffer = await metadata.image.arrayBuffer();
        imageBuffer = Buffer.from(arrayBuffer);
      } else if (typeof metadata.image === 'string') {
        if (metadata.image.startsWith('http')) {
          try {
            const response = await fetch(metadata.image);
            if (response.ok) {
              const arrayBuffer = await response.arrayBuffer();
              imageBuffer = Buffer.from(arrayBuffer);
            }
          } catch (e) {
            console.warn(`${logPrefix} Failed to fetch image from URL`);
          }
        } else if (metadata.image.startsWith('data:')) {
          try {
            const base64Data = metadata.image.split(',')[1];
            imageBuffer = Buffer.from(base64Data, 'base64');
          } catch (e) {
            console.warn(`${logPrefix} Failed to process base64 image`);
          }
        }
      }

      if (imageBuffer) {
        const imageBlob = new Blob([new Uint8Array(imageBuffer)], { type: 'image/png' });
        formData.append('file', imageBlob, 'image.png');
      }

      console.log(`${logPrefix} Requesting mint from Raydium LaunchLab...`);

      const mintResponse = await axios.post(`${RAYDIUM_LAUNCHLAB_API}/create/get-random-mint`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'ray-token': `token-${Date.now()}`,
        },
      });

      if (!mintResponse.data?.success || !mintResponse.data?.data?.mint) {
        throw new Error(`Raydium LaunchLab failed: ${JSON.stringify(mintResponse.data)}`);
      }

      const raydiumMintAddress = mintResponse.data.data.mint;
      const metadataLink = mintResponse.data.data.metadataLink;
      const mintA = new PublicKey(raydiumMintAddress);
      
      console.log(`${logPrefix} Raydium mint address: ${raydiumMintAddress}`);
      console.log(`${logPrefix} Metadata link: ${metadataLink}`);

      // Step 3: Initialize Raydium SDK and build transaction
      console.log(`${logPrefix} Initializing Raydium SDK...`);
      
      const raydium = await Raydium.load({
        connection,
        owner: creatorKeypair,
        disableLoadToken: true,
      });
      
      console.log(`${logPrefix} Building launchpad transaction with SDK...`);
      
      // For USD1 pairs, create the token first, then buy separately
      // The initialBuySol was already swapped to USD1, but we need to handle the buy in a separate transaction
      // to avoid complexity with the bundled create+buy transaction
      const { transactions } = await raydium.launchpad.createLaunchpad({
        programId: LAUNCHPAD_PROGRAM,
        mintA,
        decimals: LaunchpadPoolInitParam.decimals,
        name: metadata.name,
        symbol: metadata.symbol,
        uri: metadataLink,
        configId: configIdPubkey,
        configInfo,
        migrateType: 'amm',
        mintBDecimals: mintBInfo?.decimals || 6, // USD1 has 6 decimals
        platformId: platformIdPubkey,
        txVersion: TxVersion.V0,
        slippage: new BN(slippageBps), // User's slippage in bps
        // Use initialBuyQuote (USD1 amount from swap) if provided, otherwise 0
        // USD1 has 6 decimals, so multiply by 1e6
        buyAmount: initialBuyQuote && initialBuyQuote > 0 
          ? new BN(Math.floor(initialBuyQuote * 1e6)) 
          : new BN(0),
        createOnly: !initialBuyQuote || initialBuyQuote <= 0, // Only create if no initial buy
        supply: LaunchpadPoolInitParam.supply,
        totalSellA: LaunchpadPoolInitParam.totalSellA,
        totalFundRaisingB: LaunchpadPoolInitParam.totalFundRaisingB,
        totalLockedAmount: LaunchpadPoolInitParam.totalLockedAmount,
        cliffPeriod: LaunchpadPoolInitParam.cliffPeriod,
        unlockPeriod: LaunchpadPoolInitParam.unlockPeriod,
      });
      
      console.log(`${logPrefix} Initial buy: ${initialBuyQuote ? `${initialBuyQuote.toFixed(2)} USD1 (${Math.floor(initialBuyQuote * 1e6)} raw)` : 'none (create only)'}`);

      if (!transactions || transactions.length === 0) {
        throw new Error('Raydium SDK did not return any transactions');
      }

      const transaction = transactions[0];
      console.log(`${logPrefix} Transaction built, sending to Raydium for co-signing...`);

      // Step 4: Send transaction to Raydium for co-signing
      const sendTxResponse = await axios.post(`${RAYDIUM_LAUNCHLAB_API}/create/sendTransaction`, {
        txs: [txToBase64(transaction)],
      });

      if (!sendTxResponse.data?.data?.tx) {
        throw new Error(`Raydium sendTransaction failed: ${JSON.stringify(sendTxResponse.data)}`);
      }

      console.log(`${logPrefix} Got co-signed transaction from Raydium`);

      // Step 5: Deserialize and send the co-signed transaction
      const txBuf = Buffer.from(sendTxResponse.data.data.tx, 'base64');
      const bothSignedTx = VersionedTransaction.deserialize(new Uint8Array(txBuf));
      
      const signature = await connection.sendTransaction(bothSignedTx, {
        skipPreflight: true,
      });

      console.log(`${logPrefix} Transaction sent: ${signature}`);
      console.log(`${logPrefix} Waiting for confirmation...`);
      
      const confirmation = await connection.confirmTransaction(signature, 'confirmed');

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      console.log(`${logPrefix} Token created successfully: ${raydiumMintAddress}`);
      console.log(`${logPrefix} Transaction: ${signature}`);

      return {
        success: true,
        mintAddress: raydiumMintAddress,
        metadataUri: metadataLink,
        txSignature: signature,
        pool,
        quoteMint,
      };

    } else if (pool === POOL_TYPES.BONK) {
      // ========== BONK POOL WSOL: Try PumpPortal Lightning API, fallback to Raydium LaunchLab ==========
      let pumpPortalError: string | null = null;
      
      // Try PumpPortal Lightning API first (if API key is available)
      if (PUMP_PORTAL_API_KEY) {
        try {
          const createParams: Record<string, any> = {
            action: 'create',
            tokenMetadata: {
              name: metadata.name,
              symbol: metadata.symbol,
              uri: ipfsResult.metadataUri,
            },
            mint: bs58.encode(mintKeypair.secretKey), // Lightning API requires SECRET key
            denominatedInSol: 'true',
            slippage: slippagePercent,
            priorityFee: priorityFee,
            pool: 'bonk',
          };

          // Add initial buy if specified (in SOL terms)
          if (initialBuySol > 0) {
            createParams.amount = initialBuySol;
          }

          console.log(`${logPrefix} Trying PumpPortal Lightning API (server-signed)...`);
          console.log(`${logPrefix} Request params:`, JSON.stringify({
            ...createParams,
            mint: '[SECRET_KEY_HIDDEN]',
          }, null, 2));
          
          const response = await fetch(`${PUMP_PORTAL_API}/trade?api-key=${PUMP_PORTAL_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(createParams),
          });

          if (!response.ok) {
            const errorText = await response.text();
            pumpPortalError = `PumpPortal API error: ${response.status} - ${errorText}`;
            console.warn(`${logPrefix} PumpPortal failed, will try Raydium LaunchLab:`, pumpPortalError);
          } else {
            // Lightning API returns JSON with signature (transaction already sent by PumpPortal)
            const result = await response.json();
            console.log(`${logPrefix} PumpPortal response:`, JSON.stringify(result, null, 2));
            
            const signature = result.signature;

            if (!signature) {
              pumpPortalError = `PumpPortal did not return a transaction signature. Response: ${JSON.stringify(result)}`;
              console.warn(`${logPrefix} PumpPortal failed, will try Raydium LaunchLab:`, pumpPortalError);
            } else {
              console.log(`${logPrefix} Token created successfully via PumpPortal: ${mintKeypair.publicKey.toBase58()}`);
              console.log(`${logPrefix} Transaction: ${signature}`);

              return {
                success: true,
                mintAddress: mintKeypair.publicKey.toBase58(),
                metadataUri: ipfsResult.metadataUri,
                txSignature: signature,
                pool,
                quoteMint,
              };
            }
          }
        } catch (e) {
          pumpPortalError = e instanceof Error ? e.message : 'PumpPortal request failed';
          console.warn(`${logPrefix} PumpPortal exception, will try Raydium LaunchLab:`, pumpPortalError);
        }
      } else {
        console.log(`${logPrefix} No PumpPortal API key, using Raydium LaunchLab directly...`);
      }

      // Fallback to Raydium LaunchLab API + SDK (client-signed)
      console.log(`${logPrefix} Using Raydium LaunchLab API + SDK for WSOL pair (fallback)...`);
      
      const configIdString = RAYDIUM_CONFIG_IDS.WSOL;
      const configIdPubkey = new PublicKey(configIdString);
      const platformIdPubkey = new PublicKey(BONK_PLATFORM_ID);
      
      // Fetch config from Raydium API
      console.log(`${logPrefix} Fetching config from Raydium...`);
      const configRes = await axios.get(`${RAYDIUM_LAUNCHLAB_API}/main/configs`);
      
      // Find the WSOL config
      const configsData = configRes.data?.data?.data || [];
      const wsolConfig = configsData.find((c: any) => c.key?.pubKey === configIdString);
      
      if (!wsolConfig) {
        const combinedError = pumpPortalError 
          ? `PumpPortal: ${pumpPortalError} | Raydium: WSOL config not found`
          : `WSOL config not found in Raydium LaunchLab`;
        throw new Error(combinedError);
      }
      
      const configs = wsolConfig.key;
      const mintBInfo = wsolConfig.mintInfoB;
      
      console.log(`${logPrefix} Found WSOL config: ${configs.name}`);
      
      // Build configInfo for SDK
      const configInfo: ReturnType<typeof LaunchpadConfig.decode> = {
        index: configs.index,
        mintB: new PublicKey(configs.mintB),
        tradeFeeRate: new BN(configs.tradeFeeRate),
        epoch: new BN(configs.epoch),
        curveType: configs.curveType,
        migrateFee: new BN(configs.migrateFee),
        maxShareFeeRate: new BN(configs.maxShareFeeRate),
        minSupplyA: new BN(configs.minSupplyA),
        maxLockRate: new BN(configs.maxLockRate),
        minSellRateA: new BN(configs.minSellRateA),
        minMigrateRateA: new BN(configs.minMigrateRateA),
        minFundRaisingB: new BN(configs.minFundRaisingB),
        protocolFeeOwner: new PublicKey(configs.protocolFeeOwner),
        migrateFeeOwner: new PublicKey(configs.migrateFeeOwner),
        migrateToAmmWallet: new PublicKey(configs.migrateToAmmWallet),
        migrateToCpmmWallet: new PublicKey(configs.migrateToCpmmWallet),
      };
      
      // Prepare form data and get random mint from Raydium
      const formData = new FormData();
      formData.append('wallet', creatorKeypair.publicKey.toBase58());
      formData.append('name', metadata.name);
      formData.append('symbol', metadata.symbol);
      formData.append('description', metadata.description || '');
      formData.append('configId', configIdString);
      formData.append('decimals', String(LaunchpadPoolInitParam.decimals));
      formData.append('supply', String(LaunchpadPoolInitParam.supply));
      formData.append('totalSellA', String(LaunchpadPoolInitParam.totalSellA));
      formData.append('totalFundRaisingB', String(LaunchpadPoolInitParam.totalFundRaisingB));
      formData.append('totalLockedAmount', String(LaunchpadPoolInitParam.totalLockedAmount));
      formData.append('cliffPeriod', String(LaunchpadPoolInitParam.cliffPeriod));
      formData.append('unlockPeriod', String(LaunchpadPoolInitParam.unlockPeriod));
      formData.append('platformId', BONK_PLATFORM_ID);
      formData.append('migrateType', 'amm');

      // Handle image for Raydium LaunchLab
      let imageBuffer: Buffer | null = null;
      if (metadata.image instanceof File) {
        const arrayBuffer = await metadata.image.arrayBuffer();
        imageBuffer = Buffer.from(arrayBuffer);
      } else if (typeof metadata.image === 'string') {
        if (metadata.image.startsWith('http')) {
          try {
            const response = await fetch(metadata.image);
            if (response.ok) {
              const arrayBuffer = await response.arrayBuffer();
              imageBuffer = Buffer.from(arrayBuffer);
            }
          } catch (e) {
            console.warn(`${logPrefix} Failed to fetch image from URL`);
          }
        } else if (metadata.image.startsWith('data:')) {
          try {
            const base64Data = metadata.image.split(',')[1];
            imageBuffer = Buffer.from(base64Data, 'base64');
          } catch (e) {
            console.warn(`${logPrefix} Failed to process base64 image`);
          }
        }
      }

      if (imageBuffer) {
        const imageBlob = new Blob([new Uint8Array(imageBuffer)], { type: 'image/png' });
        formData.append('file', imageBlob, 'image.png');
      }

      console.log(`${logPrefix} Requesting mint from Raydium LaunchLab...`);

      const mintResponse = await axios.post(`${RAYDIUM_LAUNCHLAB_API}/create/get-random-mint`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'ray-token': `token-${Date.now()}`,
        },
      });

      if (!mintResponse.data?.success || !mintResponse.data?.data?.mint) {
        const combinedError = pumpPortalError 
          ? `PumpPortal: ${pumpPortalError} | Raydium: ${JSON.stringify(mintResponse.data)}`
          : `Raydium LaunchLab failed: ${JSON.stringify(mintResponse.data)}`;
        throw new Error(combinedError);
      }

      const raydiumMintAddress = mintResponse.data.data.mint;
      const metadataLink = mintResponse.data.data.metadataLink;
      const mintA = new PublicKey(raydiumMintAddress);
      
      console.log(`${logPrefix} Raydium mint address: ${raydiumMintAddress}`);
      console.log(`${logPrefix} Metadata link: ${metadataLink}`);

      // Initialize Raydium SDK and build transaction
      console.log(`${logPrefix} Initializing Raydium SDK...`);
      
      const raydium = await Raydium.load({
        connection,
        owner: creatorKeypair,
        disableLoadToken: true,
      });
      
      console.log(`${logPrefix} Building launchpad transaction with SDK...`);
      
      const { transactions } = await raydium.launchpad.createLaunchpad({
        programId: LAUNCHPAD_PROGRAM,
        mintA,
        decimals: LaunchpadPoolInitParam.decimals,
        name: metadata.name,
        symbol: metadata.symbol,
        uri: metadataLink,
        configId: configIdPubkey,
        configInfo,
        migrateType: 'amm',
        mintBDecimals: mintBInfo?.decimals || 9, // WSOL has 9 decimals
        platformId: platformIdPubkey,
        txVersion: TxVersion.V0,
        slippage: new BN(100), // 1%
        buyAmount: initialBuySol > 0 ? new BN(Math.floor(initialBuySol * 1e9)) : new BN(0), // SOL amount in lamports
        createOnly: initialBuySol <= 0,
        supply: LaunchpadPoolInitParam.supply,
        totalSellA: LaunchpadPoolInitParam.totalSellA,
        totalFundRaisingB: LaunchpadPoolInitParam.totalFundRaisingB,
        totalLockedAmount: LaunchpadPoolInitParam.totalLockedAmount,
        cliffPeriod: LaunchpadPoolInitParam.cliffPeriod,
        unlockPeriod: LaunchpadPoolInitParam.unlockPeriod,
      });

      if (!transactions || transactions.length === 0) {
        throw new Error('Raydium SDK did not return any transactions');
      }

      const transaction = transactions[0];
      console.log(`${logPrefix} Transaction built, sending to Raydium for co-signing...`);

      // Send transaction to Raydium for co-signing
      const sendTxResponse = await axios.post(`${RAYDIUM_LAUNCHLAB_API}/create/sendTransaction`, {
        txs: [txToBase64(transaction)],
      });

      if (!sendTxResponse.data?.data?.tx) {
        throw new Error(`Raydium sendTransaction failed: ${JSON.stringify(sendTxResponse.data)}`);
      }

      console.log(`${logPrefix} Got co-signed transaction from Raydium`);

      // Deserialize and send the co-signed transaction
      const txBuf = Buffer.from(sendTxResponse.data.data.tx, 'base64');
      const bothSignedTx = VersionedTransaction.deserialize(new Uint8Array(txBuf));
      
      const signature = await connection.sendTransaction(bothSignedTx, {
        skipPreflight: true,
      });

      console.log(`${logPrefix} Transaction sent: ${signature}`);
      console.log(`${logPrefix} Waiting for confirmation...`);
      
      const confirmation = await connection.confirmTransaction(signature, 'confirmed');

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      console.log(`${logPrefix} Token created successfully via Raydium LaunchLab: ${raydiumMintAddress}`);
      console.log(`${logPrefix} Transaction: ${signature}`);

      return {
        success: true,
        mintAddress: raydiumMintAddress,
        metadataUri: metadataLink || ipfsResult.metadataUri,
        txSignature: signature,
        pool,
        quoteMint,
      };

    } else {
      // ========== PUMP POOL: Use trade-local API ==========
      const createParams: Record<string, any> = {
        publicKey: creatorKeypair.publicKey.toBase58(),
        action: 'create',
        tokenMetadata: {
          name: metadata.name,
          symbol: metadata.symbol,
          uri: ipfsResult.metadataUri,
        },
        mint: mintKeypair.publicKey.toBase58(),
        denominatedInSol: 'true',
        slippage: slippagePercent,
        priorityFee: priorityFee,
        pool: 'pump',
      };

      // Add initial buy if specified
      if (initialBuySol > 0) {
        createParams.amount = initialBuySol;
      }

      const response = await fetch(`${PUMP_PORTAL_API}/trade-local`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createParams),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`PumpPortal API error: ${response.status} - ${errorText}`);
      }

      // Step 4: Sign and send transaction
      const txData = await response.arrayBuffer();
      const tx = VersionedTransaction.deserialize(new Uint8Array(txData));
      
      tx.sign([creatorKeypair, mintKeypair]);

      const signature = await connection.sendTransaction(tx, {
        skipPreflight: false,
        maxRetries: 3,
      });

      // Step 5: Confirm transaction
      console.log(`${logPrefix} Confirming transaction: ${signature}`);
      const confirmation = await connection.confirmTransaction(signature, 'confirmed');

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      console.log(`${logPrefix} Token created successfully: ${mintKeypair.publicKey.toBase58()}`);

      return {
        success: true,
        mintAddress: mintKeypair.publicKey.toBase58(),
        metadataUri: ipfsResult.metadataUri,
        txSignature: signature,
        pool,
        quoteMint,
      };
    }

  } catch (error) {
    console.error('[CREATE] Create token error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Token creation failed',
    };
  }
}

// ============================================================================
// TRADING
// ============================================================================

/**
 * Format SOL amount to string (matching working implementation)
 */
function formatSolAmount(amount: number): string {
  // Ensure proper precision for SOL amounts
  if (amount >= 1) {
    return amount.toFixed(4);
  } else if (amount >= 0.1) {
    return amount.toFixed(5);
  } else if (amount >= 0.01) {
    return amount.toFixed(6);
  } else {
    return amount.toFixed(9);
  }
}

/**
 * Buy tokens on Pump.fun or Bonk.fun bonding curve
 */
export async function buyOnBondingCurve(
  connection: Connection,
  params: TradeParams
): Promise<TradeResult> {
  const { tokenMint, walletKeypair, amountSol, slippageBps = 500, priorityFee = 0.0001, pool = POOL_TYPES.PUMP, quoteMint } = params;
  
  // Format the amount properly (matching working implementation)
  const formattedAmount = formatSolAmount(amountSol);
  // Convert slippageBps to percentage (500 bps = 5%)
  const slippagePercent = slippageBps / 100;
  const logPrefix = pool === POOL_TYPES.BONK ? '[BONK]' : '[PUMP]';
  const isUsd1Quote = quoteMint === QUOTE_MINTS.USD1;
  
  // Try PumpPortal API first
  try {
    console.log(`${logPrefix} Buying ${formattedAmount} ${isUsd1Quote ? 'USD1' : 'SOL'} worth of ${tokenMint.slice(0, 8)}... via PumpPortal`);

    const requestBody: Record<string, any> = {
      publicKey: walletKeypair.publicKey.toBase58(),
      action: 'buy',
      mint: tokenMint,
      amount: formattedAmount,
      denominatedInSol: 'true', // Always denominated in quote currency
      slippage: slippagePercent,
      priorityFee: priorityFee,
      pool: pool,
      jitoOnly: 'true',
      skipPreflight: 'false',
    };
    
    // Add quoteMint for Bonk USD1 pairs
    if (pool === POOL_TYPES.BONK && quoteMint) {
      requestBody.quoteMint = quoteMint;
    }
    
    console.log(`${logPrefix} Buy request body:`, JSON.stringify(requestBody, null, 2));

    const response = await fetch(`${PUMP_PORTAL_API}/trade-local`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[PUMP] PumpPortal buy error details:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
        mint: tokenMint,
        amount: amountSol,
        wallet: walletKeypair.publicKey.toBase58().slice(0, 8),
      });
      throw new Error(`PumpPortal: ${response.status} - ${errorText}`);
    }

    const txData = await response.arrayBuffer();
    
    if (txData.byteLength === 0) {
      throw new Error('PumpPortal returned empty transaction data');
    }
    
    const tx = VersionedTransaction.deserialize(new Uint8Array(txData));
    
    tx.sign([walletKeypair]);

    console.log(`[PUMP] Sending buy transaction...`);
    const signature = await connection.sendTransaction(tx, {
      skipPreflight: false,
      maxRetries: 3,
    });

    console.log(`[PUMP] Confirming transaction: ${signature}`);
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');

    if (confirmation.value.err) {
      console.error('[PUMP] Transaction confirmation error:', confirmation.value.err);
      throw new Error(`Transaction failed on-chain: ${JSON.stringify(confirmation.value.err)}`);
    }

    console.log(`[PUMP] Buy successful: ${signature}`);

    return {
      success: true,
      txSignature: signature,
      amountSol,
    };

  } catch (apiError) {
    const apiErrorMessage = apiError instanceof Error ? apiError.message : 'PumpPortal API failed';
    console.warn(`[PUMP] PumpPortal API failed, attempting SDK fallback:`, apiErrorMessage);
    
    // Fallback to PumpDotFun SDK
    try {
      const sdkAvailable = await isSDKAvailable();
      if (!sdkAvailable) {
        console.error('[PUMP] SDK fallback not available');
        return {
          success: false,
          error: `${apiErrorMessage} (SDK fallback unavailable)`,
        };
      }
      
      console.log('[PUMP] Using SDK fallback for buy...');
      const sdkResult = await buyViaSDK(
        connection,
        tokenMint,
        walletKeypair,
        amountSol,
        slippageBps
      );
      
      if (sdkResult.success) {
        console.log('[PUMP] SDK fallback buy successful');
      }
      
      return sdkResult;
      
    } catch (sdkError) {
      const sdkErrorMessage = sdkError instanceof Error ? sdkError.message : 'SDK fallback failed';
      console.error('[PUMP] SDK fallback also failed:', sdkErrorMessage);
      return {
        success: false,
        error: `API: ${apiErrorMessage} | SDK: ${sdkErrorMessage}`,
      };
    }
  }
}

/**
 * Format token amount to string with proper decimals
 */
function formatTokenAmount(amount: number, decimals: number = 6): string {
  // Ensure proper precision for token amounts
  return amount.toFixed(decimals);
}

/**
 * Get associated token account address for a wallet and mint
 */
async function getTokenAccountAddress(
  connection: Connection,
  walletPubkey: PublicKey,
  mintPubkey: PublicKey
): Promise<string | null> {
  try {
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(walletPubkey, {
      mint: mintPubkey,
    });
    
    if (tokenAccounts.value.length > 0) {
      return tokenAccounts.value[0].pubkey.toBase58();
    }
    return null;
  } catch (error) {
    console.error('[PUMP] Error getting token account:', error);
    return null;
  }
}

/**
 * Sell tokens on Pump.fun or Bonk.fun bonding curve
 */
export async function sellOnBondingCurve(
  connection: Connection,
  params: TradeParams & { amountTokens: number; tokenDecimals?: number }
): Promise<TradeResult> {
  const { tokenMint, walletKeypair, amountTokens, slippageBps = 500, priorityFee = 0.0001, tokenDecimals = 6, pool = POOL_TYPES.PUMP, quoteMint } = params;

  // Format the amount properly (Pump.fun uses 6 decimals)
  const formattedAmount = formatTokenAmount(amountTokens, tokenDecimals);
  // Convert slippageBps to percentage (500 bps = 5%)
  const slippagePercent = slippageBps / 100;
  const logPrefix = pool === POOL_TYPES.BONK ? '[BONK]' : '[PUMP]';
  const isUsd1Quote = quoteMint === QUOTE_MINTS.USD1;
  
  // Get the token account address (required for sells)
  const tokenAccountAddress = await getTokenAccountAddress(
    connection,
    walletKeypair.publicKey,
    new PublicKey(tokenMint)
  );
  
  if (!tokenAccountAddress) {
    return {
      success: false,
      error: 'No token account found. You may not hold this token.',
    };
  }

  // Try PumpPortal API first
  try {
    console.log(`${logPrefix} Selling ${formattedAmount} tokens of ${tokenMint.slice(0, 8)}... via PumpPortal (quote: ${isUsd1Quote ? 'USD1' : 'SOL'})`);

    const requestBody: Record<string, any> = {
      publicKey: walletKeypair.publicKey.toBase58(),
      action: 'sell',
      mint: tokenMint,
      amount: formattedAmount,
      denominatedInSol: 'false',
      slippage: slippagePercent,
      priorityFee: priorityFee,
      pool: pool,
      tokenAccount: tokenAccountAddress,
      skipPreflight: 'false',
      jitoOnly: 'false',
    };
    
    // Add quoteMint for Bonk USD1 pairs
    if (pool === POOL_TYPES.BONK && quoteMint) {
      requestBody.quoteMint = quoteMint;
    }
    
    console.log(`${logPrefix} Sell request body:`, JSON.stringify(requestBody, null, 2));

    const response = await fetch(`${PUMP_PORTAL_API}/trade-local`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[PUMP] PumpPortal sell error details:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
        mint: tokenMint,
        amount: amountTokens,
        wallet: walletKeypair.publicKey.toBase58().slice(0, 8),
      });
      throw new Error(`PumpPortal: ${response.status} - ${errorText}`);
    }

    const txData = await response.arrayBuffer();
    
    if (txData.byteLength === 0) {
      throw new Error('PumpPortal returned empty transaction data');
    }
    
    const tx = VersionedTransaction.deserialize(new Uint8Array(txData));
    
    tx.sign([walletKeypair]);

    console.log(`[PUMP] Sending sell transaction...`);
    const signature = await connection.sendTransaction(tx, {
      skipPreflight: false,
      maxRetries: 3,
    });

    console.log(`[PUMP] Confirming transaction: ${signature}`);
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');

    if (confirmation.value.err) {
      console.error('[PUMP] Transaction confirmation error:', confirmation.value.err);
      throw new Error(`Transaction failed on-chain: ${JSON.stringify(confirmation.value.err)}`);
    }

    console.log(`[PUMP] Sell successful: ${signature}`);

    return {
      success: true,
      txSignature: signature,
      amountTokens,
    };

  } catch (apiError) {
    const apiErrorMessage = apiError instanceof Error ? apiError.message : 'PumpPortal API failed';
    console.warn(`[PUMP] PumpPortal API failed, attempting SDK fallback:`, apiErrorMessage);
    
    // Fallback to PumpDotFun SDK
    try {
      const sdkAvailable = await isSDKAvailable();
      if (!sdkAvailable) {
        console.error('[PUMP] SDK fallback not available');
        return {
          success: false,
          error: `${apiErrorMessage} (SDK fallback unavailable)`,
        };
      }
      
      console.log('[PUMP] Using SDK fallback for sell...');
      const sdkResult = await sellViaSDK(
        connection,
        tokenMint,
        walletKeypair,
        amountTokens,
        slippageBps
      );
      
      if (sdkResult.success) {
        console.log('[PUMP] SDK fallback sell successful');
      }
      
      return sdkResult;
      
    } catch (sdkError) {
      const sdkErrorMessage = sdkError instanceof Error ? sdkError.message : 'SDK fallback failed';
      console.error('[PUMP] SDK fallback also failed:', sdkErrorMessage);
      return {
        success: false,
        error: `API: ${apiErrorMessage} | SDK: ${sdkErrorMessage}`,
      };
    }
  }
}

// ============================================================================
// CREATOR VAULT (Tide Harvest)
// ============================================================================

/**
 * Get creator vault balance for a token
 * 
 * Pump.fun uses a per-CREATOR vault PDA with seeds: ["creator-vault", creator_pubkey]
 * This vault accumulates fees from ALL tokens created by this creator.
 * 
 * Note: The vault is NOT per-token, it's per-creator!
 */
export async function getCreatorVaultBalance(
  connection: Connection,
  tokenMint: string,
  creatorWallet: string
): Promise<{
  balance: number;
  vaultAddress: string;
}> {
  try {
    const creatorPubkey = new PublicKey(creatorWallet);
    
    // Derive creator vault PDA - uses "creator-vault" seed with creator pubkey only
    // This is a per-creator vault, NOT per-token
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('creator-vault'),
        creatorPubkey.toBuffer(),
      ],
      PUMP_PROGRAM_ID
    );

    const balance = await connection.getBalance(vaultPda);
    
    if (balance > 0) {
      console.log(`[PUMP] Creator vault ${vaultPda.toBase58().slice(0, 8)}... has ${lamportsToSol(BigInt(balance)).toFixed(6)} SOL`);
    }

    return {
      balance: lamportsToSol(BigInt(balance)),
      vaultAddress: vaultPda.toBase58(),
    };

  } catch (error) {
    console.error('[PUMP] Get creator vault error:', error);
    return { balance: 0, vaultAddress: '' };
  }
}

/**
 * Claim creator rewards from vault
 */
export async function claimCreatorRewards(
  connection: Connection,
  tokenMint: string,
  creatorKeypair: Keypair
): Promise<{
  success: boolean;
  amount?: number;
  txSignature?: string;
  error?: string;
}> {
  try {
    // Get current balance
    const { balance, vaultAddress } = await getCreatorVaultBalance(
      connection,
      tokenMint,
      creatorKeypair.publicKey.toBase58()
    );

    if (balance <= 0) {
      return {
        success: false,
        error: 'No rewards to claim',
      };
    }

    console.log(`[PUMP] Claiming ${balance} SOL from vault ${vaultAddress}`);

    // Use PumpPortal API for creator reward claims
    const response = await fetch('https://pumpportal.fun/api/creator-claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mint: tokenMint,
        creatorPublicKey: creatorKeypair.publicKey.toBase58(),
        amount: Math.floor(balance * LAMPORTS_PER_SOL),
      }),
    });

    if (!response.ok) {
      // Fallback: Direct vault withdrawal if PumpPortal API unavailable
      const vaultPubkey = new PublicKey(vaultAddress);
      
      // Create withdrawal transaction
      const transaction = new Transaction();
      
      // Get recent blockhash
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = creatorKeypair.publicKey;

      // Add transfer instruction from vault to creator
      // Note: This only works if the vault is a regular account owned by creator
      // For PDA vaults, the program must sign the transfer
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: vaultPubkey,
          toPubkey: creatorKeypair.publicKey,
          lamports: Math.floor(balance * LAMPORTS_PER_SOL),
        })
      );

      transaction.sign(creatorKeypair);

      const signature = await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        maxRetries: 3,
      });

      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed'
      );

      console.log(`[PUMP] Claim executed (direct): ${signature}`);
      return {
        success: true,
        amount: balance,
        txSignature: signature,
      };
    }

    // Process PumpPortal response
    const txData = await response.arrayBuffer();
    const tx = Transaction.from(Buffer.from(txData));
    tx.sign(creatorKeypair);

    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
      maxRetries: 3,
    });

    await connection.confirmTransaction(signature, 'confirmed');
    
    console.log(`[PUMP] Claim executed via PumpPortal: ${signature}`);
    return {
      success: true,
      amount: balance,
      txSignature: signature,
    };

  } catch (error) {
    console.error('[PUMP] Claim error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Claim failed',
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  PUMP_PROGRAM_ID,
  PUMP_GLOBAL_ACCOUNT,
  PUMP_FEE_RECIPIENT,
};

