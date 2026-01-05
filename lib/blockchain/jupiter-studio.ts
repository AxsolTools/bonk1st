/**
 * AQUA Launchpad - Jupiter Studio API Integration
 * 
 * Creates tokens on Jupiter's Dynamic Bonding Curve (DBC) pools
 * and manages post-launch fee collection.
 * 
 * API Documentation: https://dev.jup.ag/docs/studio/create-token
 * 
 * IMPORTANT: This follows the official Jupiter Studio API spec:
 * - POST /dbc-pool/create-tx - Get unsigned transaction + presigned URLs
 * - PUT presigned URLs - Upload image and metadata
 * - POST /dbc-pool/submit - Submit signed transaction (multipart/form-data)
 * - POST /dbc-pool/fee/claim-tx - Get fee claim transaction
 */

import {
  Connection,
  Keypair,
  VersionedTransaction,
  PublicKey,
} from '@solana/web3.js';
import bs58 from 'bs58';

// ============================================================================
// CONFIGURATION
// ============================================================================

const JUPITER_API_BASE = 'https://api.jup.ag';
const JUPITER_STUDIO_API = `${JUPITER_API_BASE}/studio/v1`;

// Quote mint addresses
export const JUPITER_QUOTE_MINTS = {
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  SOL: 'So11111111111111111111111111111111111111112',
  JUP: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
} as const;

// Preset configurations from Jupiter docs
export const JUPITER_PRESETS = {
  // Meme preset - Great for memes, similar profile to traditional meme launches
  // 16K initial MC, 69K migration MC, ~17.94K USDC raised before graduation
  MEME: {
    quoteMint: JUPITER_QUOTE_MINTS.USDC,
    initialMarketCap: 16000,
    migrationMarketCap: 69000,
    tokenQuoteDecimal: 6,
    lockedVestingParam: {
      totalLockedVestingAmount: 0,
      cliffUnlockAmount: 0,
      numberOfVestingPeriod: 0,
      totalVestingDuration: 0,
      cliffDurationFromMigrationTime: 0,
    },
  },
  // Indie preset - For projects ready to take it up a notch
  // 32K initial MC, 240K migration MC, ~57.78K USDC raised, 10% vested over 12 months
  INDIE: {
    quoteMint: JUPITER_QUOTE_MINTS.USDC,
    initialMarketCap: 32000,
    migrationMarketCap: 240000,
    tokenQuoteDecimal: 6,
    lockedVestingParam: {
      totalLockedVestingAmount: 100000000, // 10% of 1B supply
      cliffUnlockAmount: 0,
      numberOfVestingPeriod: 365,
      totalVestingDuration: 31536000, // 1 year in seconds
      cliffDurationFromMigrationTime: 0,
    },
  },
} as const;

// Get API key from environment
const getJupiterApiKey = (): string => {
  const apiKey = process.env.JUPITER_API_KEY;
  if (!apiKey) {
    throw new Error('JUPITER_API_KEY environment variable is not set');
  }
  return apiKey;
};

// ============================================================================
// TYPES
// ============================================================================

export interface JupiterTokenMetadata {
  name: string;
  symbol: string;
  description: string;
  image: string; // base64 data URI or URL
  website?: string;
  twitter?: string;
  telegram?: string;
  discord?: string;
}

export interface JupiterCurveParams {
  quoteMint: string; // USDC, SOL, or JUP mint address
  initialMarketCap: number; // In quote currency (e.g., 16000 = 16K USDC)
  migrationMarketCap: number; // When to migrate to DEX
  tokenQuoteDecimal: number; // Decimals for quote token (6 for USDC)
  lockedVestingParam: {
    totalLockedVestingAmount: number;
    cliffUnlockAmount: number;
    numberOfVestingPeriod: number;
    totalVestingDuration: number;
    cliffDurationFromMigrationTime: number;
  };
}

export interface CreateJupiterTokenParams {
  metadata: JupiterTokenMetadata;
  creatorKeypair: Keypair;
  curveParams?: JupiterCurveParams; // Uses MEME preset if not provided
  feeBps?: number; // Trading fee in basis points (default 100 = 1%)
  antiSniping?: boolean; // Enable anti-sniping protection
  isLpLocked?: boolean; // Lock LP tokens (default true)
  initialBuySol?: number; // Initial buy in SOL (converted to quote)
  slippageBps?: number;
  mintKeypair?: Keypair;
  // Optional Studio page customization
  pageContent?: string; // Description for Jupiter Studio page
  headerImage?: Buffer; // Header image for Studio page
}

export interface CreateJupiterTokenResult {
  success: boolean;
  mintAddress?: string;
  metadataUri?: string;
  imageUrl?: string;
  txSignature?: string;
  dbcPoolAddress?: string;
  error?: string;
}

export interface JupiterPoolInfo {
  dbcPoolAddress: string;
  mintAddress: string;
  creatorWallet: string;
}

export interface JupiterFeeInfo {
  totalFees: number;
  unclaimedFees: number;
  claimedFees: number;
  poolAddress: string;
}

export interface ClaimFeesResult {
  success: boolean;
  txSignature?: string;
  claimedAmount?: number;
  error?: string;
}

// Response types from Jupiter API (matching official docs)
interface CreateTxResponse {
  transaction: string; // base64 encoded unsigned transaction
  mint: string; // The mint address of the token being created
  imagePresignedUrl: string; // PUT request endpoint to upload token image
  metadataPresignedUrl: string; // PUT request endpoint to upload token metadata
  imageUrl: string; // The token's static image URL to use in metadata
}

interface SubmitResponse {
  txSignature: string;
  mint: string;
  poolAddress?: string;
}

interface PoolAddressResponse {
  data: {
    dbcPoolAddress: string;
    meteoraDammV2PoolAddress?: string;
    configKey?: string;
  };
}

interface FeeInfoResponse {
  data: {
    totalFee: number;
    unclaimedFee: number;
    claimedFee?: number;
  };
}

interface ClaimTxResponse {
  transaction: string; // base64 encoded unsigned transaction
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Make authenticated request to Jupiter Studio API
 */
async function jupiterRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const apiKey = getJupiterApiKey();
  
  const url = `${JUPITER_STUDIO_API}${endpoint}`;
  console.log(`[JUPITER] API Request: ${options.method || 'GET'} ${url}`);
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[JUPITER] API error: ${response.status} - ${errorText}`);
    throw new Error(`Jupiter API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

/**
 * Submit signed transaction to Jupiter (multipart/form-data)
 */
async function jupiterSubmit(
  signedTransaction: string,
  owner: string,
  pageContent?: string,
  headerImage?: Buffer
): Promise<SubmitResponse> {
  const apiKey = getJupiterApiKey();
  
  const formData = new FormData();
  formData.append('transaction', signedTransaction);
  formData.append('owner', owner);
  
  if (pageContent) {
    formData.append('content', pageContent);
  }
  
  if (headerImage) {
    // Convert Buffer to Uint8Array for Blob compatibility
    const uint8Array = new Uint8Array(headerImage);
    formData.append(
      'headerImage',
      new Blob([uint8Array], { type: 'image/jpeg' }),
      'header.jpeg'
    );
  }

  const url = `${JUPITER_STUDIO_API}/dbc-pool/submit`;
  console.log(`[JUPITER] Submit Request: POST ${url}`);
  
  const response = await fetch(url, {
    method: 'POST',
    body: formData,
    headers: {
      'x-api-key': apiKey,
      // Note: Don't set Content-Type for FormData, browser sets it with boundary
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[JUPITER] Submit error: ${response.status} - ${errorText}`);
    throw new Error(`Jupiter submit error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

/**
 * Convert base64 data URI to Buffer
 */
function dataUriToBuffer(dataUri: string): { buffer: Buffer; mimeType: string } {
  if (!dataUri.startsWith('data:')) {
    throw new Error('Invalid data URI');
  }
  
  const [header, base64Data] = dataUri.split(',');
  const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';
  const buffer = Buffer.from(base64Data, 'base64');
  
  return { buffer, mimeType };
}

/**
 * Get content type from mime type
 */
function getImageContentType(mimeType: string): string {
  const typeMap: Record<string, string> = {
    'image/png': 'image/png',
    'image/jpeg': 'image/jpeg',
    'image/jpg': 'image/jpeg',
    'image/gif': 'image/gif',
    'image/webp': 'image/webp',
  };
  return typeMap[mimeType] || 'image/jpeg';
}

/**
 * Upload file to presigned URL
 */
async function uploadToPresignedUrl(
  url: string,
  data: Buffer | string,
  contentType: string
): Promise<void> {
  console.log(`[JUPITER] Uploading to presigned URL (${contentType})...`);
  
  // Convert Buffer to Uint8Array for fetch compatibility
  const body = typeof data === 'string' ? data : new Uint8Array(data);
  
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
    },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to upload to presigned URL: ${response.status} - ${errorText}`);
  }
  
  console.log(`[JUPITER] ✅ Upload successful`);
}

/**
 * Build Metaplex-compatible metadata JSON for Jupiter
 */
function buildJupiterMetadata(
  metadata: JupiterTokenMetadata,
  imageUrl: string
): object {
  return {
    name: metadata.name,
    symbol: metadata.symbol,
    description: metadata.description,
    image: imageUrl,
    // Optional social links
    ...(metadata.website && { website: metadata.website }),
    ...(metadata.twitter && { twitter: metadata.twitter }),
    ...(metadata.telegram && { telegram: metadata.telegram }),
  };
}

// ============================================================================
// TOKEN CREATION
// ============================================================================

/**
 * Create a new token on Jupiter's Dynamic Bonding Curve
 * 
 * Flow (per official docs):
 * 1. POST /dbc-pool/create-tx - Get unsigned tx + presigned URLs
 * 2. PUT imagePresignedUrl - Upload token image
 * 3. PUT metadataPresignedUrl - Upload token metadata JSON
 * 4. Sign transaction with creator + mint keypairs
 * 5. POST /dbc-pool/submit - Submit signed transaction (multipart/form-data)
 */
export async function createJupiterToken(
  connection: Connection,
  params: CreateJupiterTokenParams
): Promise<CreateJupiterTokenResult> {
  const {
    metadata,
    creatorKeypair,
    curveParams = JUPITER_PRESETS.MEME,
    feeBps = 100, // 1% trading fee
    antiSniping = false,
    isLpLocked = true,
    initialBuySol = 0,
    slippageBps = 500,
    mintKeypair: providedMintKeypair,
    pageContent,
    headerImage,
  } = params;

  try {
    console.log(`[JUPITER] Creating token: ${metadata.name} (${metadata.symbol})`);
    console.log(`[JUPITER] Curve: ${curveParams.initialMarketCap} -> ${curveParams.migrationMarketCap} (${curveParams.quoteMint.slice(0, 8)}...)`);

    // Determine image content type
    let imageContentType = 'image/jpeg';
    if (metadata.image.startsWith('data:')) {
      const parsed = dataUriToBuffer(metadata.image);
      imageContentType = getImageContentType(parsed.mimeType);
    }

    // Step 1: Request create transaction from Jupiter
    console.log('[JUPITER] Step 1: Requesting create transaction...');
    
    const createTxBody = {
      buildCurveByMarketCapParam: {
        quoteMint: curveParams.quoteMint,
        initialMarketCap: curveParams.initialMarketCap,
        migrationMarketCap: curveParams.migrationMarketCap,
        tokenQuoteDecimal: curveParams.tokenQuoteDecimal,
        lockedVestingParam: curveParams.lockedVestingParam,
      },
      antiSniping,
      fee: { feeBps },
      isLpLocked,
      tokenName: metadata.name,
      tokenSymbol: metadata.symbol,
      tokenImageContentType: imageContentType,
      creator: creatorKeypair.publicKey.toBase58(),
    };

    console.log('[JUPITER] Create TX body:', JSON.stringify(createTxBody, null, 2));

    const createTxResponse = await jupiterRequest<CreateTxResponse>('/dbc-pool/create-tx', {
      method: 'POST',
      body: JSON.stringify(createTxBody),
    });

    const { 
      transaction: txBase64, 
      mint: mintAddress,
      imagePresignedUrl, 
      metadataPresignedUrl,
      imageUrl 
    } = createTxResponse;

    console.log(`[JUPITER] Received mint address: ${mintAddress}`);
    console.log(`[JUPITER] Image URL will be: ${imageUrl}`);

    // Step 2: Upload image to presigned URL
    console.log('[JUPITER] Step 2: Uploading image...');
    
    let imageBuffer: Buffer;
    let imageMimeType: string;
    
    if (metadata.image.startsWith('data:')) {
      // Base64 data URI
      const parsed = dataUriToBuffer(metadata.image);
      imageBuffer = parsed.buffer;
      imageMimeType = parsed.mimeType;
    } else if (metadata.image.startsWith('http')) {
      // URL - fetch and convert
      const imageResponse = await fetch(metadata.image);
      if (!imageResponse.ok) {
        throw new Error(`Failed to fetch image: ${imageResponse.status}`);
      }
      const arrayBuffer = await imageResponse.arrayBuffer();
      imageBuffer = Buffer.from(arrayBuffer);
      imageMimeType = imageResponse.headers.get('content-type') || 'image/png';
    } else {
      throw new Error('Invalid image format. Must be data URI or URL.');
    }

    await uploadToPresignedUrl(imagePresignedUrl, imageBuffer, getImageContentType(imageMimeType));
    console.log('[JUPITER] ✅ Image uploaded');

    // Step 3: Upload metadata JSON to presigned URL
    console.log('[JUPITER] Step 3: Uploading metadata...');
    
    const metadataJson = buildJupiterMetadata(metadata, imageUrl);
    console.log('[JUPITER] Metadata:', JSON.stringify(metadataJson, null, 2));
    
    await uploadToPresignedUrl(
      metadataPresignedUrl,
      JSON.stringify(metadataJson),
      'application/json'
    );
    console.log('[JUPITER] ✅ Metadata uploaded');

    // Step 4: Deserialize and sign transaction
    console.log('[JUPITER] Step 4: Signing transaction...');
    
    const transaction = VersionedTransaction.deserialize(
      Buffer.from(txBase64, 'base64')
    );
    
    // Sign with creator keypair
    // Note: Jupiter's create-tx generates the mint internally, we don't need to sign with mint keypair
    transaction.sign([creatorKeypair]);
    
    const signedTransaction = Buffer.from(transaction.serialize()).toString('base64');

    // Step 5: Submit via Jupiter's submit endpoint
    console.log('[JUPITER] Step 5: Submitting to Jupiter...');
    
    const submitResult = await jupiterSubmit(
      signedTransaction,
      creatorKeypair.publicKey.toBase58(),
      pageContent,
      headerImage
    );

    console.log(`[JUPITER] ✅ Token created successfully!`);
    console.log(`[JUPITER] Mint: ${mintAddress}`);
    console.log(`[JUPITER] TX: ${submitResult.txSignature}`);
    if (submitResult.poolAddress) {
      console.log(`[JUPITER] Pool: ${submitResult.poolAddress}`);
    }

    // Extract metadata URI from presigned URL
    const metadataUri = metadataPresignedUrl.split('?')[0];

    return {
      success: true,
      mintAddress,
      metadataUri,
      imageUrl,
      txSignature: submitResult.txSignature,
      dbcPoolAddress: submitResult.poolAddress,
    };

  } catch (error) {
    console.error('[JUPITER] Create token error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Token creation failed',
    };
  }
}

/**
 * Create token with initial buy
 * 
 * Note: For initial buys, we need to create the token first, then buy separately
 * because Jupiter's create-tx doesn't support initial buy in the same transaction
 */
export async function createJupiterTokenWithBuy(
  connection: Connection,
  params: CreateJupiterTokenParams
): Promise<CreateJupiterTokenResult> {
  const { initialBuySol = 0, creatorKeypair } = params;
  
  console.log('[JUPITER-CREATE-WITH-BUY] ========== START ==========');
  console.log('[JUPITER-CREATE-WITH-BUY] Config:', {
    tokenName: params.metadata.name,
    tokenSymbol: params.metadata.symbol,
    initialBuySol,
    slippageBps: params.slippageBps || 500,
    creatorWallet: creatorKeypair.publicKey.toBase58().slice(0, 12),
  });
  
  // First create the token
  console.log('[JUPITER-CREATE-WITH-BUY] Step 1: Creating token...');
  const createResult = await createJupiterToken(connection, params);
  
  if (!createResult.success || !createResult.mintAddress) {
    console.error('[JUPITER-CREATE-WITH-BUY] Token creation failed:', createResult.error);
    console.log('[JUPITER-CREATE-WITH-BUY] ========== END (ERROR) ==========');
    return createResult;
  }

  console.log('[JUPITER-CREATE-WITH-BUY] Token created successfully:', {
    mintAddress: createResult.mintAddress,
    txSignature: createResult.txSignature?.slice(0, 12),
    dbcPoolAddress: createResult.dbcPoolAddress?.slice(0, 12),
  });

  // If initial buy is requested, perform it after token creation
  if (initialBuySol > 0) {
    console.log('[JUPITER-CREATE-WITH-BUY] Step 2: Performing initial buy...');
    console.log(`[JUPITER-CREATE-WITH-BUY] Initial buy: ${initialBuySol} SOL from creator wallet`);
    
    // Wait a bit for the token to be indexed
    console.log('[JUPITER-CREATE-WITH-BUY] Waiting 10 seconds for token indexing...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    try {
      // Use Jupiter swap API for the initial buy
      const buyResult = await performJupiterBuy(
        connection,
        creatorKeypair,
        createResult.mintAddress,
        initialBuySol,
        params.slippageBps || 500
      );
      
      if (!buyResult.success) {
        console.warn(`[JUPITER-CREATE-WITH-BUY] Initial buy failed: ${buyResult.error}`);
        console.log('[JUPITER-CREATE-WITH-BUY] ========== END (PARTIAL SUCCESS) ==========');
        // Token was created but buy failed - still return success with warning
        return {
          ...createResult,
          error: `Token created successfully but initial buy failed: ${buyResult.error}`,
        };
      }
      
      console.log(`[JUPITER-CREATE-WITH-BUY] ✅ Initial buy successful: ${buyResult.txSignature}`);
    } catch (buyError) {
      console.warn('[JUPITER-CREATE-WITH-BUY] Initial buy error:', buyError);
      console.log('[JUPITER-CREATE-WITH-BUY] ========== END (PARTIAL SUCCESS) ==========');
      // Token was created but buy failed
      return {
        ...createResult,
        error: `Token created successfully but initial buy failed: ${buyError instanceof Error ? buyError.message : 'Unknown error'}`,
      };
    }
  } else {
    console.log('[JUPITER-CREATE-WITH-BUY] No initial buy requested');
  }

  console.log('[JUPITER-CREATE-WITH-BUY] ✅ Token creation complete!');
  console.log('[JUPITER-CREATE-WITH-BUY] ========== END ==========');
  return createResult;
}

/**
 * Perform a buy on Jupiter DBC token (initial buy after token creation)
 * 
 * Uses the Metis Swap API with API key for reliable execution.
 * Note: Newly created tokens may take a few seconds to be indexed by Jupiter.
 * This function includes retry logic with delays to handle this.
 * 
 * API Documentation: https://dev.jup.ag/docs/swap/get-quote
 */
async function performJupiterBuy(
  connection: Connection,
  buyerKeypair: Keypair,
  mintAddress: string,
  amountSol: number,
  slippageBps: number
): Promise<{ success: boolean; txSignature?: string; error?: string }> {
  const maxRetries = 5; // Increased retries for newly created tokens
  const retryDelayMs = 8000; // 8 seconds between retries (tokens need time to be indexed)
  
  const SOL_MINT = 'So11111111111111111111111111111111111111112';
  const jupiterApiKey = process.env.JUPITER_API_KEY || '';
  
  // Metis Swap API endpoints (with API key support)
  const METIS_QUOTE_URL = 'https://api.jup.ag/swap/v1/quote';
  const METIS_SWAP_URL = 'https://api.jup.ag/swap/v1/swap';
  const LEGACY_QUOTE_URL = 'https://quote-api.jup.ag/v6/quote';
  const LEGACY_SWAP_URL = 'https://quote-api.jup.ag/v6/swap';

  console.log('[JUPITER-INITIAL-BUY] ========== START ==========');
  console.log('[JUPITER-INITIAL-BUY] Config:', {
    mintAddress: mintAddress.slice(0, 12),
    amountSol,
    slippageBps,
    hasApiKey: !!jupiterApiKey,
    maxRetries,
    retryDelayMs,
  });
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const amountLamports = Math.floor(amountSol * 1e9);
      
      console.log(`[JUPITER-INITIAL-BUY] Attempt ${attempt}/${maxRetries}: Getting quote for ${amountSol} SOL -> ${mintAddress.slice(0, 12)}...`);
      
      // Build quote URL with parameters per Jupiter docs
      const quoteParams = new URLSearchParams({
        inputMint: SOL_MINT,
        outputMint: mintAddress,
        amount: amountLamports.toString(),
        slippageBps: slippageBps.toString(),
        swapMode: 'ExactIn',
      });
      
      let quoteData: any = null;
      let usedEndpoint: 'metis' | 'legacy' = 'legacy';
      
      // Try Metis API first (if we have API key)
      if (jupiterApiKey) {
        const metisQuoteUrl = `${METIS_QUOTE_URL}?${quoteParams}`;
        console.log(`[JUPITER-INITIAL-BUY] Trying Metis API...`);
        
        try {
          const res = await fetch(metisQuoteUrl, {
            headers: { 
              'Accept': 'application/json',
              'x-api-key': jupiterApiKey,
            },
            signal: AbortSignal.timeout(15000),
          });
          
          if (res.ok) {
            const data = await res.json();
            if (data && !data.error) {
              quoteData = data;
              usedEndpoint = 'metis';
              console.log(`[JUPITER-INITIAL-BUY] ✅ Quote success from Metis API`);
            }
          } else {
            const errorText = await res.text();
            console.warn(`[JUPITER-INITIAL-BUY] Metis API returned ${res.status}: ${errorText.slice(0, 100)}`);
          }
        } catch (e: any) {
          console.warn(`[JUPITER-INITIAL-BUY] Metis API error: ${e?.message || e}`);
        }
      }
      
      // Fallback to legacy API
      if (!quoteData) {
        const legacyQuoteUrl = `${LEGACY_QUOTE_URL}?${quoteParams}`;
        console.log(`[JUPITER-INITIAL-BUY] Trying legacy v6 API...`);
        
        const res = await fetch(legacyQuoteUrl, {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(15000),
        });
        
        if (!res.ok) {
          const errorText = await res.text();
          // If no route found, token might not be indexed yet
          if (res.status === 400 && (errorText.includes('No route') || errorText.includes('not found'))) {
            if (attempt < maxRetries) {
              console.log(`[JUPITER-INITIAL-BUY] Token not indexed yet (no route), waiting ${retryDelayMs}ms...`);
              await new Promise(resolve => setTimeout(resolve, retryDelayMs));
              continue;
            }
          }
          throw new Error(`Quote failed: ${res.status} - ${errorText.slice(0, 200)}`);
        }
        
        quoteData = await res.json();
        usedEndpoint = 'legacy';
      }
      
      if (!quoteData || quoteData.error) {
        if (attempt < maxRetries) {
          console.log(`[JUPITER-INITIAL-BUY] Quote returned error, waiting ${retryDelayMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, retryDelayMs));
          continue;
        }
        throw new Error(`Quote error: ${quoteData?.error || 'No quote data'}`);
      }

      console.log('[JUPITER-INITIAL-BUY] Quote received:', {
        inAmount: quoteData.inAmount,
        outAmount: quoteData.outAmount,
        priceImpactPct: quoteData.priceImpactPct,
        usedEndpoint,
      });

      // Build swap transaction
      const swapUrl = usedEndpoint === 'metis' ? METIS_SWAP_URL : LEGACY_SWAP_URL;
      const swapHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (usedEndpoint === 'metis' && jupiterApiKey) {
        swapHeaders['x-api-key'] = jupiterApiKey;
      }

      const swapBody = {
        quoteResponse: quoteData,
        userPublicKey: buyerKeypair.publicKey.toBase58(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        // dynamicSlippage removed - deprecated per Jupiter docs, overrides explicit slippage
        prioritizationFeeLamports: {
          priorityLevelWithMaxLamports: {
            maxLamports: 1000000,
            priorityLevel: 'high',
          },
        },
      };

      console.log(`[JUPITER-INITIAL-BUY] Requesting swap transaction from: ${swapUrl}`);

      const swapResponse = await fetch(swapUrl, {
        method: 'POST',
        headers: swapHeaders,
        body: JSON.stringify(swapBody),
        signal: AbortSignal.timeout(20000),
      });

      if (!swapResponse.ok) {
        const swapError = await swapResponse.text();
        throw new Error(`Swap request failed: ${swapResponse.status} - ${swapError.slice(0, 200)}`);
      }

      const swapResult = await swapResponse.json();
      const swapTransaction = swapResult.swapTransaction;
      
      if (!swapTransaction) {
        throw new Error('No swap transaction returned');
      }
      
      console.log('[JUPITER-INITIAL-BUY] Swap transaction received, signing...');
      
      // Deserialize and sign
      const transaction = VersionedTransaction.deserialize(
        Buffer.from(swapTransaction, 'base64')
      );
      transaction.sign([buyerKeypair]);

      // Send transaction
      console.log('[JUPITER-INITIAL-BUY] Sending transaction...');
      const signature = await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      });

      console.log(`[JUPITER-INITIAL-BUY] Transaction sent: ${signature}`);

      // Confirm
      const confirmation = await connection.confirmTransaction(signature, 'confirmed');
      if (confirmation.value.err) {
        throw new Error(`Transaction failed on-chain: ${JSON.stringify(confirmation.value.err)}`);
      }

      console.log(`[JUPITER-INITIAL-BUY] ✅ Initial buy successful!`);
      console.log(`[JUPITER-INITIAL-BUY] TX: ${signature}`);
      console.log('[JUPITER-INITIAL-BUY] ========== END ==========');
      
      return { success: true, txSignature: signature };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Buy failed';
      console.warn(`[JUPITER-INITIAL-BUY] Attempt ${attempt} failed: ${errorMessage}`);
      
      if (attempt < maxRetries) {
        console.log(`[JUPITER-INITIAL-BUY] Waiting ${retryDelayMs}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, retryDelayMs));
        continue;
      }
      
      console.error('[JUPITER-INITIAL-BUY] All attempts failed');
      console.log('[JUPITER-INITIAL-BUY] ========== END (ERROR) ==========');
      
      return {
        success: false,
        error: errorMessage,
      };
    }
  }
  
  console.log('[JUPITER-INITIAL-BUY] ========== END (MAX RETRIES) ==========');
  return {
    success: false,
    error: 'Max retries exceeded - token may not be indexed yet',
  };
}

// ============================================================================
// POOL & FEE MANAGEMENT
// ============================================================================

/**
 * Get the DBC pool address for a token
 * 
 * Per docs: GET /dbc-pool/addresses/{mint}
 * Returns: { data: { dbcPoolAddress, meteoraDammV2PoolAddress, configKey } }
 */
export async function getJupiterPoolAddress(mintAddress: string): Promise<string> {
  console.log(`[JUPITER] Fetching pool address for mint: ${mintAddress}`);
  
  const response = await jupiterRequest<PoolAddressResponse>(
    `/dbc-pool/addresses/${mintAddress}`
  );
  
  return response.data.dbcPoolAddress;
}

/**
 * Get unclaimed fees for a Jupiter DBC pool
 * 
 * Per docs: POST /dbc/fee with body { poolAddress }
 * Returns: { data: { totalFee, unclaimedFee } }
 */
export async function getJupiterFeeInfo(
  poolAddress: string
): Promise<JupiterFeeInfo> {
  console.log(`[JUPITER] Fetching fee info for pool: ${poolAddress}`);
  
  try {
    const response = await jupiterRequest<FeeInfoResponse>('/dbc/fee', {
      method: 'POST',
      body: JSON.stringify({ poolAddress }),
    });
    
    // Safely access response data with fallbacks
    const data = response?.data;
    if (!data) {
      console.warn(`[JUPITER] Fee info response missing data for pool: ${poolAddress}`);
      return {
        totalFees: 0,
        unclaimedFees: 0,
        claimedFees: 0,
        poolAddress,
      };
    }
    
    return {
      totalFees: data.totalFee ?? 0,
      unclaimedFees: data.unclaimedFee ?? 0,
      claimedFees: data.claimedFee ?? 0,
      poolAddress,
    };
  } catch (error) {
    console.error(`[JUPITER] Failed to fetch fee info for pool ${poolAddress}:`, error);
    // Return zero fees instead of throwing - graceful degradation
    return {
      totalFees: 0,
      unclaimedFees: 0,
      claimedFees: 0,
      poolAddress,
    };
  }
}

/**
 * Claim fees from a Jupiter DBC pool
 * 
 * Per docs: POST /dbc/fee/create-tx with body { ownerWallet, poolAddress, maxQuoteAmount }
 * Returns: { transaction } - unsigned transaction to sign and submit
 */
export async function claimJupiterFees(
  connection: Connection,
  creatorKeypair: Keypair,
  poolAddress: string,
  maxQuoteAmount?: number
): Promise<ClaimFeesResult> {
  try {
    console.log(`[JUPITER] Creating claim transaction for pool: ${poolAddress}`);

    // Step 1: Get the claim transaction from Jupiter
    const claimBody: Record<string, unknown> = {
      ownerWallet: creatorKeypair.publicKey.toBase58(),
      poolAddress,
    };
    
    if (maxQuoteAmount !== undefined) {
      claimBody.maxQuoteAmount = maxQuoteAmount;
    }

    const claimTxResponse = await jupiterRequest<ClaimTxResponse>('/dbc/fee/create-tx', {
      method: 'POST',
      body: JSON.stringify(claimBody),
    });

    const { transaction: txBase64 } = claimTxResponse;

    // Step 2: Deserialize and sign
    const transaction = VersionedTransaction.deserialize(
      Buffer.from(txBase64, 'base64')
    );
    
    transaction.sign([creatorKeypair]);

    // Step 3: Submit transaction directly to RPC
    console.log('[JUPITER] Submitting claim transaction...');
    
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });

    console.log(`[JUPITER] Claim transaction submitted: ${signature}`);

    // Wait for confirmation
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');
    
    if (confirmation.value.err) {
      throw new Error(`Claim transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    console.log(`[JUPITER] ✅ Fees claimed successfully: ${signature}`);

    return {
      success: true,
      txSignature: signature,
    };

  } catch (error) {
    console.error('[JUPITER] Claim fees error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Fee claim failed',
    };
  }
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate Jupiter token parameters
 */
export function validateJupiterTokenParams(params: {
  name: string;
  symbol: string;
  decimals?: number;
}): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Name validation
  if (!params.name || params.name.trim().length === 0) {
    errors.push('Token name is required');
  } else if (params.name.length > 32) {
    errors.push('Token name must be 32 characters or less');
  }

  // Symbol validation
  if (!params.symbol || params.symbol.trim().length === 0) {
    errors.push('Token symbol is required');
  } else if (params.symbol.length > 10) {
    errors.push('Token symbol must be 10 characters or less');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// TRADING
// ============================================================================

interface JupiterSwapParams {
  walletKeypair: Keypair;
  tokenMint: string;
  action: 'buy' | 'sell';
  amount: number; // SOL for buy, tokens for sell
  slippageBps: number;
  tokenDecimals?: number;
}

interface JupiterSwapResult {
  success: boolean;
  txSignature?: string;
  amountSol?: number;
  amountTokens?: number;
  pricePerToken?: number;
  error?: string;
}

/**
 * Execute a swap on Jupiter using the Metis Swap API
 * Used for trading Jupiter DBC tokens
 * 
 * API Documentation: https://dev.jup.ag/docs/swap/get-quote
 * - Quote: GET https://api.jup.ag/swap/v1/quote
 * - Swap:  POST https://api.jup.ag/swap/v1/swap
 */
export async function executeJupiterSwap(
  connection: Connection,
  params: JupiterSwapParams
): Promise<JupiterSwapResult> {
  const { walletKeypair, tokenMint, action, amount, slippageBps, tokenDecimals = 6 } = params;

  const SOL_MINT = 'So11111111111111111111111111111111111111112';
  
  // Get Jupiter API key from environment
  const jupiterApiKey = process.env.JUPITER_API_KEY || '';

  try {
    console.log('[JUPITER-SWAP] ========== START ==========');
    
    // DEBUG: Log all incoming parameters
    console.log('[JUPITER-SWAP] ===== PARAMS DEBUG =====');
    console.log('[JUPITER-SWAP] tokenMint:', tokenMint);
    console.log('[JUPITER-SWAP] action:', action);
    console.log('[JUPITER-SWAP] amount:', amount);
    console.log('[JUPITER-SWAP] amount type:', typeof amount);
    console.log('[JUPITER-SWAP] slippageBps:', slippageBps);
    console.log('[JUPITER-SWAP] tokenDecimals:', tokenDecimals);
    console.log('[JUPITER-SWAP] wallet:', walletKeypair.publicKey.toBase58());
    console.log('[JUPITER-SWAP] hasApiKey:', !!jupiterApiKey);
    console.log('[JUPITER-SWAP] ===== END PARAMS DEBUG =====');

    // -------------------------------
    // Metis Swap API endpoints (new v1 API with API key)
    // Fallback to legacy v6 if API key not available
    // -------------------------------
    const METIS_QUOTE_URL = 'https://api.jup.ag/swap/v1/quote';
    const METIS_SWAP_URL = 'https://api.jup.ag/swap/v1/swap';
    const LEGACY_QUOTE_URL = 'https://quote-api.jup.ag/v6/quote';
    const LEGACY_SWAP_URL = 'https://quote-api.jup.ag/v6/swap';
    
    const QUOTE_TIMEOUT_MS = 15000; // 15 seconds

    let inputMint: string;
    let outputMint: string;
    let amountRaw: number;

    if (action === 'buy') {
      // Buy: SOL -> Token
      inputMint = SOL_MINT;
      outputMint = tokenMint;
      amountRaw = Math.floor(amount * 1e9); // SOL has 9 decimals
      console.log('[JUPITER-SWAP] BUY calculation:', amount, '* 1e9 =', amountRaw);
    } else {
      // Sell: Token -> SOL
      inputMint = tokenMint;
      outputMint = SOL_MINT;
      amountRaw = Math.floor(amount * Math.pow(10, tokenDecimals));
      console.log('[JUPITER-SWAP] SELL calculation:', amount, '*', Math.pow(10, tokenDecimals), '=', amountRaw);
    }

    console.log('[JUPITER-SWAP] Final quote params:', {
      inputMint,
      outputMint,
      amountRaw,
      slippageBps,
    });
    console.log(`[JUPITER-SWAP] ${action.toUpperCase()}: ${inputMint.slice(0, 8)} -> ${outputMint.slice(0, 8)}, amount: ${amountRaw}`);

    // -------------------------------
    // Fetch quote - try Metis API first, then legacy
    // -------------------------------
    const errors: string[] = [];
    let quoteData: any = null;
    let usedEndpoint: string = '';

    // Build quote URL with parameters per Jupiter docs
    const quoteParams = new URLSearchParams({
      inputMint,
      outputMint,
      amount: amountRaw.toString(),
      slippageBps: slippageBps.toString(),
      swapMode: 'ExactIn', // We always use ExactIn mode
    });

    // Per Jupiter docs: restrictIntermediateTokens=true reduces failures
    // Routes through random intermediate tokens fail more frequently
    // Keep true for both buy and sell for stability
    quoteParams.set('restrictIntermediateTokens', 'true');

    console.log('[JUPITER-SWAP] Quote params:', Object.fromEntries(quoteParams));

    // Try Metis API first (if we have API key)
    if (jupiterApiKey) {
      const metisQuoteUrl = `${METIS_QUOTE_URL}?${quoteParams}`;
      console.log(`[JUPITER-SWAP] Trying Metis API: ${METIS_QUOTE_URL}`);
      
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), QUOTE_TIMEOUT_MS);
      
      try {
        const res = await fetch(metisQuoteUrl, {
          headers: { 
            'Accept': 'application/json',
            'x-api-key': jupiterApiKey,
          },
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
        }
        
        const data = await res.json();
        if (!data || data.error) {
          throw new Error(data?.error || 'No quote data');
        }
        
        quoteData = data;
        usedEndpoint = 'metis';
        console.log(`[JUPITER-SWAP] ✅ Quote success from Metis API`);
      } catch (e: any) {
        clearTimeout(timer);
        const errorMsg = e?.name === 'AbortError' ? 'timeout' : (e?.message || e);
        errors.push(`[Metis] ${errorMsg}`);
        console.warn(`[JUPITER-SWAP] Metis API failed: ${errorMsg}`);
      }
    }

    // Fallback to legacy v6 API if Metis failed or no API key
    if (!quoteData) {
      const legacyQuoteUrl = `${LEGACY_QUOTE_URL}?${quoteParams}`;
      console.log(`[JUPITER-SWAP] Trying legacy v6 API: ${LEGACY_QUOTE_URL}`);
      
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), QUOTE_TIMEOUT_MS);
      
      try {
        const res = await fetch(legacyQuoteUrl, {
          headers: { 
            'Accept': 'application/json',
            'User-Agent': 'AQUA-Launchpad/1.0',
          },
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
        }
        
        const data = await res.json();
        if (!data || data.error) {
          throw new Error(data?.error || 'No quote data');
        }
        
        quoteData = data;
        usedEndpoint = 'legacy';
        console.log(`[JUPITER-SWAP] ✅ Quote success from legacy v6 API`);
      } catch (e: any) {
        clearTimeout(timer);
        const errorMsg = e?.name === 'AbortError' ? 'timeout' : (e?.message || e);
        errors.push(`[Legacy] ${errorMsg}`);
        console.warn(`[JUPITER-SWAP] Legacy v6 API failed: ${errorMsg}`);
      }
    }

    if (!quoteData) {
      console.error('[JUPITER-SWAP] All quote endpoints failed:', errors);
      console.error('[JUPITER-SWAP] Quote request was:', {
        inputMint,
        outputMint,
        amountRaw,
        slippageBps,
      });
      throw new Error(`Quote failed: ${errors.join('; ')}`);
    }

    // DEBUG: Full quote response
    console.log('[JUPITER-SWAP] ===== QUOTE DEBUG =====');
    console.log('[JUPITER-SWAP] Full quote response:', JSON.stringify(quoteData, null, 2));
    console.log('[JUPITER-SWAP] ===== END QUOTE DEBUG =====');

    // Summarize route to quickly inspect AMMs/hops
    const routePlanSummary = (quoteData.routePlan || []).map((hop: any, idx: number) => ({
      hop: idx,
      label: hop.swapInfo?.label,
      inAmount: hop.swapInfo?.inAmount,
      outAmount: hop.swapInfo?.outAmount,
      percent: hop.percent,
    }));

    console.log('[JUPITER-SWAP] Quote received:', {
      inAmount: quoteData.inAmount,
      outAmount: quoteData.outAmount,
      priceImpactPct: quoteData.priceImpactPct,
      routePlanLength: quoteData.routePlan?.length,
      otherAmountThreshold: quoteData.otherAmountThreshold,
    });
    console.log('[JUPITER-SWAP] Route plan summary:', routePlanSummary);

    // -------------------------------
    // Build swap transaction
    // -------------------------------
    // Build swap transaction per Jupiter docs
    // NOTE: dynamicSlippage is deprecated but still functional for Metis API
    // For low-liquidity tokens (Jupiter DBC), we need to handle this carefully
    const swapBody: Record<string, unknown> = {
      quoteResponse: quoteData,
      userPublicKey: walletKeypair.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: {
        priorityLevelWithMaxLamports: {
          maxLamports: 2000000, // 0.002 SOL max for better landing
          priorityLevel: 'veryHigh',
          global: false, // Use local fee market for accurate estimation per Jupiter docs
        },
      },
    };
    
    // For sell operations, disable shared accounts routing
    // Per Jupiter API docs: "shared accounts route will fail on some new AMMs (low liquidity token)"
    // Jupiter DBC tokens are new/low liquidity, so we must disable this
    if (action === 'sell') {
      swapBody.useSharedAccounts = false;
    }

    console.log('[JUPITER-SWAP] Swap body (without quoteResponse):', {
      userPublicKey: swapBody.userPublicKey,
      wrapAndUnwrapSol: swapBody.wrapAndUnwrapSol,
      dynamicComputeUnitLimit: swapBody.dynamicComputeUnitLimit,
      useSharedAccounts: swapBody.useSharedAccounts,
      prioritizationFeeLamports: swapBody.prioritizationFeeLamports,
    });

    // Use appropriate swap endpoint
    const swapUrl = usedEndpoint === 'metis' ? METIS_SWAP_URL : LEGACY_SWAP_URL;
    const swapHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (usedEndpoint === 'metis' && jupiterApiKey) {
      swapHeaders['x-api-key'] = jupiterApiKey;
    }

    console.log(`[JUPITER-SWAP] Requesting swap transaction from: ${swapUrl}`);

    const swapResponse = await fetch(swapUrl, {
      method: 'POST',
      headers: swapHeaders,
      body: JSON.stringify(swapBody),
    });

    if (!swapResponse.ok) {
      const swapError = await swapResponse.text();
      console.error('[JUPITER-SWAP] ===== SWAP ERROR DEBUG =====');
      console.error('[JUPITER-SWAP] Swap request failed with status:', swapResponse.status);
      console.error('[JUPITER-SWAP] Full error response:', swapError);
      console.error('[JUPITER-SWAP] Request body was:', JSON.stringify(swapBody, null, 2));
      console.error('[JUPITER-SWAP] ===== END SWAP ERROR DEBUG =====');
      throw new Error(`Swap request failed: ${swapResponse.status} - ${swapError.slice(0, 200)}`);
    }

    const swapResult = await swapResponse.json();
    console.log('[JUPITER-SWAP] Swap response received:', JSON.stringify(swapResult, null, 2).slice(0, 500));
    const swapTransaction = swapResult.swapTransaction;

    if (!swapTransaction) {
      console.error('[JUPITER-SWAP] No swap transaction in response:', swapResult);
      throw new Error('No swap transaction returned from Jupiter');
    }

    console.log('[JUPITER-SWAP] Swap transaction received, signing...');

    // Deserialize and sign
    const transaction = VersionedTransaction.deserialize(
      Buffer.from(swapTransaction, 'base64')
    );
    transaction.sign([walletKeypair]);

    // Send transaction - use skipPreflight: true to avoid simulation race conditions
    // For low-liquidity tokens, prices can move between quote and execution
    console.log('[JUPITER-SWAP] Sending transaction to network...');
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: true, // Skip simulation to avoid stale data issues
      maxRetries: 5,
      preflightCommitment: 'processed',
    });

    console.log(`[JUPITER-SWAP] Transaction sent: ${signature}`);

    // Confirm with timeout to prevent infinite waiting
    const CONFIRM_TIMEOUT_MS = 60000; // 60 seconds max
    const confirmPromise = connection.confirmTransaction(
      { signature, blockhash: transaction.message.recentBlockhash, lastValidBlockHeight: (await connection.getLatestBlockhash()).lastValidBlockHeight },
      'confirmed'
    );
    
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Transaction confirmation timed out after 60s')), CONFIRM_TIMEOUT_MS)
    );
    
    const confirmation = await Promise.race([confirmPromise, timeoutPromise]);
    
    if (confirmation.value.err) {
      // DEBUG: Log full transaction error
      console.error('[JUPITER-SWAP] ===== ON-CHAIN ERROR DEBUG =====');
      console.error('[JUPITER-SWAP] Transaction signature:', signature);
      console.error('[JUPITER-SWAP] Full error object:', JSON.stringify(confirmation.value.err, null, 2));
      console.error('[JUPITER-SWAP] Action was:', action);
      console.error('[JUPITER-SWAP] Amount was:', amount, '(raw:', amountRaw, ')');
      console.error('[JUPITER-SWAP] ===== END ON-CHAIN ERROR DEBUG =====');
      
      // Check for slippage error
      const errStr = JSON.stringify(confirmation.value.err);
      if (errStr.includes('0x1788') || errStr.includes('6024')) {
        throw new Error('Slippage exceeded - price moved during transaction. Try again with higher slippage.');
      }
      throw new Error(`Transaction failed on-chain: ${errStr}`);
    }

    // Calculate amounts from quote
    const inAmount = Number(quoteData.inAmount);
    const outAmount = Number(quoteData.outAmount);

    let amountSol: number;
    let amountTokens: number;

    if (action === 'buy') {
      amountSol = inAmount / 1e9;
      amountTokens = outAmount / Math.pow(10, tokenDecimals);
    } else {
      amountTokens = inAmount / Math.pow(10, tokenDecimals);
      amountSol = outAmount / 1e9;
    }

    const pricePerToken = amountTokens > 0 ? amountSol / amountTokens : 0;

    console.log(`[JUPITER-SWAP] ✅ Swap successful!`);
    console.log(`[JUPITER-SWAP] TX: ${signature}`);
    console.log(`[JUPITER-SWAP] SOL: ${amountSol}, Tokens: ${amountTokens}, Price: ${pricePerToken}`);
    console.log('[JUPITER-SWAP] ========== END ==========');

    return {
      success: true,
      txSignature: signature,
      amountSol,
      amountTokens,
      pricePerToken,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Swap failed';
    console.error('[JUPITER-SWAP] Error:', errorMessage);
    console.log('[JUPITER-SWAP] ========== END (ERROR) ==========');

    return {
      success: false,
      error: errorMessage,
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  JUPITER_API_BASE,
  JUPITER_STUDIO_API,
};
