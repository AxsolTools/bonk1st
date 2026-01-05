/**
 * AQUA Launchpad - Token-2022 Creation Module
 * 
 * Ported from raydiumspltoken/tokens.js
 * Creates Token-2022 tokens with extensions:
 * - MetadataPointer extension
 * - TransferFeeConfig extension (optional)
 * - Authority revocation options
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  createInitializeMintInstruction,
  getMintLen,
  ExtensionType,
  createInitializeTransferFeeConfigInstruction,
  createInitializeMetadataPointerInstruction,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  createSetAuthorityInstruction,
  AuthorityType,
} from '@solana/spl-token';
import { solToLamports, lamportsToSol } from '@/lib/precision';

// ============================================================================
// TYPES
// ============================================================================

export interface Token22Metadata {
  name: string;
  symbol: string;
  description: string;
  image: string; // Base64 data URI or URL
  website?: string;
  twitter?: string;
  telegram?: string;
}

export interface CreateToken22Params {
  // Token basics
  name: string;
  symbol: string;
  description: string;
  decimals: number;
  totalSupply: string;
  
  // Metadata
  image?: string; // Base64 or URL
  website?: string;
  twitter?: string;
  telegram?: string;
  
  // Token-2022 Extensions
  enableTransferFee: boolean;
  transferFeeBasisPoints: number; // 0-500 (5% max)
  maxTransferFee: bigint; // Max fee per transfer in raw units
  
  // Authority options
  revokeMintAuthority: boolean;
  revokeFreezeAuthority: boolean;
  
  // Keypairs
  creatorKeypair: Keypair;
  mintKeypair?: Keypair; // Optional pre-generated mint
}

export interface CreateToken22Result {
  success: boolean;
  mintAddress?: string;
  metadataUri?: string;
  txSignature?: string;
  mintSignature?: string;
  disableMintSignature?: string;
  disableFreezeSignature?: string;
  transferFeeConfigAuthority?: string;
  withdrawWithheldAuthority?: string;
  error?: string;
}

export interface MintTokensParams {
  connection: Connection;
  mintAddress: string;
  amount: string;
  decimals: number;
  payerKeypair: Keypair;
  destination?: string;
}

// ============================================================================
// METADATA UPLOAD - Token-2022 uses Metaplex-compatible JSON metadata
// ============================================================================

/**
 * Upload token metadata to IPFS/Arweave for Token-2022
 * Uses multiple providers with fallback:
 * 1. NFT.Storage (free IPFS pinning)
 * 2. PumpPortal IPFS (fallback)
 * 
 * Token-2022 metadata follows Metaplex Token Standard format
 */
export async function uploadToken22Metadata(metadata: Token22Metadata): Promise<{
  success: boolean;
  metadataUri?: string;
  imageUri?: string;
  error?: string;
}> {
  const axios = (await import('axios')).default;
  
  try {
    let imageUri = '';
    
    // Step 1: Upload image if provided
    if (metadata.image) {
      let imageBuffer: Buffer | null = null;
      let contentType = 'image/png';
      
      if (metadata.image.startsWith('http')) {
        // Already a URL - use directly
        imageUri = metadata.image;
        console.log('[TOKEN22] Using existing image URL:', imageUri);
      } else if (metadata.image.startsWith('data:')) {
        // Base64 data URI - extract and upload
        try {
          const matches = metadata.image.match(/^data:(.+);base64,(.+)$/);
          if (matches) {
            contentType = matches[1];
            imageBuffer = Buffer.from(matches[2], 'base64');
          }
        } catch (e) {
          console.warn('[TOKEN22] Failed to process base64 image');
        }
        
        // Upload image to IPFS via nft.storage or similar
        if (imageBuffer) {
          const imageResult = await uploadToIPFSProvider(imageBuffer, contentType);
          if (imageResult.success && imageResult.uri) {
            imageUri = imageResult.uri;
            console.log('[TOKEN22] Image uploaded:', imageUri);
          }
        }
      }
    }

    // Step 2: Create Metaplex-compatible metadata JSON
    const metaplexMetadata = {
      name: metadata.name,
      symbol: metadata.symbol,
      description: metadata.description || `${metadata.name} - Token-2022`,
      image: imageUri || '',
      external_url: metadata.website || '',
      attributes: [],
      properties: {
        files: imageUri ? [
          {
            uri: imageUri,
            type: 'image/png',
          }
        ] : [],
        category: 'image',
        creators: [],
      },
      // Additional social links (non-standard but useful)
      ...(metadata.twitter && { twitter: metadata.twitter }),
      ...(metadata.telegram && { telegram: metadata.telegram }),
      ...(metadata.website && { website: metadata.website }),
    };

    // Step 3: Upload metadata JSON to IPFS
    const metadataBuffer = Buffer.from(JSON.stringify(metaplexMetadata, null, 2));
    const metadataResult = await uploadToIPFSProvider(metadataBuffer, 'application/json');
    
    if (metadataResult.success && metadataResult.uri) {
      console.log(`[TOKEN22] Metadata uploaded: ${metadataResult.uri}`);
      return {
        success: true,
        metadataUri: metadataResult.uri,
        imageUri,
      };
    }

    throw new Error('Failed to upload metadata to IPFS');
  } catch (error) {
    console.error('[TOKEN22] Metadata upload error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Metadata upload failed',
    };
  }
}

/**
 * Upload data to IPFS via free public APIs (no signup required)
 * 
 * Priority order:
 * 1. Pump.fun Official IPFS - Free public API, works reliably
 * 2. PumpPortal IPFS - Fallback (may be intermittent)
 * 3. Data URI - Last resort for images
 * 
 * All endpoints are free and require no API keys or signup
 */
async function uploadToIPFSProvider(
  data: Buffer,
  contentType: string
): Promise<{ success: boolean; uri?: string; error?: string }> {
  const FormDataLib = (await import('form-data')).default;
  const axios = (await import('axios')).default;

  console.log(`[TOKEN22] Uploading ${data.length} bytes (${contentType})`);

  // Primary: Pump.fun Official IPFS - FREE public API, most reliable
  try {
    console.log('[TOKEN22] Attempting pump.fun IPFS upload...');
    const form = new FormDataLib();
    form.append('file', data, {
      filename: contentType.includes('json') ? 'metadata.json' : 'image.png',
      contentType,
    });
    
    const response = await axios.post('https://pump.fun/api/ipfs', form, {
      headers: form.getHeaders(),
      timeout: 30000,
    });
    
    // pump.fun returns { metadata: {...}, metadataUri: "..." }
    if (response.data?.metadataUri) {
      console.log(`[TOKEN22] pump.fun IPFS upload success: ${response.data.metadataUri}`);
      return { success: true, uri: response.data.metadataUri };
    }
    // For image-only uploads, it may return just the image URL
    if (response.data?.metadata?.image) {
      console.log(`[TOKEN22] pump.fun image upload success: ${response.data.metadata.image}`);
      return { success: true, uri: response.data.metadata.image };
    }
  } catch (pumpFunError) {
    console.warn('[TOKEN22] pump.fun IPFS failed:', 
      pumpFunError instanceof Error ? pumpFunError.message : 'Unknown error');
  }

  // Fallback: PumpPortal IPFS - May work intermittently
  try {
    console.log('[TOKEN22] Attempting PumpPortal IPFS upload...');
    const form = new FormDataLib();
    form.append('file', data, {
      filename: contentType.includes('json') ? 'metadata.json' : 'image.png',
      contentType,
    });
    
    const response = await axios.post('https://pumpportal.fun/api/ipfs', form, {
      headers: form.getHeaders(),
      timeout: 30000,
    });
    
    if (response.data?.metadataUri) {
      console.log(`[TOKEN22] PumpPortal IPFS upload success: ${response.data.metadataUri}`);
      return { success: true, uri: response.data.metadataUri };
    }
  } catch (pumpPortalError) {
    console.warn('[TOKEN22] PumpPortal IPFS failed:', 
      pumpPortalError instanceof Error ? pumpPortalError.message : 'Unknown error');
  }

  // Last resort: If image, use data URI (works for display but not ideal for on-chain)
  if (contentType.startsWith('image/')) {
    console.warn('[TOKEN22] All IPFS providers failed, using data URI as fallback');
    const base64 = data.toString('base64');
    return { success: true, uri: `data:${contentType};base64,${base64}` };
  }

  return { success: false, error: 'All IPFS upload providers failed' };
}

// ============================================================================
// TOKEN CREATION
// ============================================================================

/**
 * Create a Token-2022 token with extensions
 * Ported from raydiumspltoken/tokens.js createToken2022()
 */
export async function createToken22(
  connection: Connection,
  params: CreateToken22Params
): Promise<CreateToken22Result> {
  try {
    const {
      name,
      symbol,
      description,
      decimals,
      totalSupply,
      image,
      website,
      twitter,
      telegram,
      enableTransferFee,
      transferFeeBasisPoints,
      maxTransferFee,
      revokeMintAuthority,
      revokeFreezeAuthority,
      creatorKeypair,
      mintKeypair: providedMintKeypair,
    } = params;

    console.log(`[TOKEN22] Creating token: ${name} (${symbol})`);
    console.log(`[TOKEN22] Decimals: ${decimals}, Supply: ${totalSupply}`);
    console.log(`[TOKEN22] Transfer fee enabled: ${enableTransferFee}`);

    // Step 1: Upload metadata to IPFS
    let metadataUri: string | undefined;
    if (image || description) {
      console.log('[TOKEN22] Uploading metadata to IPFS...');
      const metadataResult = await uploadToken22Metadata({
        name,
        symbol,
        description,
        image: image || '',
        website,
        twitter,
        telegram,
      });
      
      if (metadataResult.success) {
        metadataUri = metadataResult.metadataUri;
      } else {
        console.warn('[TOKEN22] Metadata upload failed, continuing without metadata');
      }
    }

    // Step 2: Generate or use provided mint keypair
    const mintKeypair = providedMintKeypair || Keypair.generate();
    const mintAddress = mintKeypair.publicKey;
    console.log(`[TOKEN22] Mint address: ${mintAddress.toBase58()}`);

    // Step 3: Calculate extensions and space
    const extensions: ExtensionType[] = [ExtensionType.MetadataPointer];
    if (enableTransferFee) {
      extensions.push(ExtensionType.TransferFeeConfig);
    }
    
    const mintLen = getMintLen(extensions);
    const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);
    
    console.log(`[TOKEN22] Mint account size: ${mintLen} bytes, rent: ${lamportsToSol(BigInt(lamports))} SOL`);

    // Step 4: Build creation transaction
    const transaction = new Transaction();
    
    // Create mint account
    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: creatorKeypair.publicKey,
        newAccountPubkey: mintAddress,
        space: mintLen,
        lamports,
        programId: TOKEN_2022_PROGRAM_ID,
      })
    );
    
    // Initialize metadata pointer (points to mint itself)
    transaction.add(
      createInitializeMetadataPointerInstruction(
        mintAddress,
        creatorKeypair.publicKey,
        mintAddress,
        TOKEN_2022_PROGRAM_ID
      )
    );
    
    // Initialize transfer fee extension if enabled
    if (enableTransferFee) {
      console.log(`[TOKEN22] Transfer fee: ${transferFeeBasisPoints} bps, max: ${maxTransferFee}`);
      transaction.add(
        createInitializeTransferFeeConfigInstruction(
          mintAddress,
          creatorKeypair.publicKey, // transfer fee config authority
          creatorKeypair.publicKey, // withdrawal authority
          transferFeeBasisPoints,
          maxTransferFee,
          TOKEN_2022_PROGRAM_ID
        )
      );
    }
    
    // Initialize mint
    transaction.add(
      createInitializeMintInstruction(
        mintAddress,
        decimals,
        creatorKeypair.publicKey, // mint authority
        creatorKeypair.publicKey, // freeze authority
        TOKEN_2022_PROGRAM_ID
      )
    );

    // Step 5: Send creation transaction
    console.log('[TOKEN22] Sending mint creation transaction...');
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = creatorKeypair.publicKey;
    
    transaction.sign(creatorKeypair, mintKeypair);
    
    const txSignature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });
    
    await connection.confirmTransaction({
      signature: txSignature,
      blockhash,
      lastValidBlockHeight,
    }, 'confirmed');
    
    console.log(`[TOKEN22] Mint created: ${txSignature}`);

    // Step 6: Mint initial supply
    let mintSignature: string | undefined;
    if (totalSupply && parseFloat(totalSupply) > 0) {
      console.log(`[TOKEN22] Minting ${totalSupply} tokens...`);
      mintSignature = await mintTokens({
        connection,
        mintAddress: mintAddress.toBase58(),
        amount: totalSupply,
        decimals,
        payerKeypair: creatorKeypair,
      });
    }

    // Step 7: Revoke authorities if requested
    let disableMintSignature: string | undefined;
    let disableFreezeSignature: string | undefined;

    if (revokeMintAuthority) {
      console.log('[TOKEN22] Revoking mint authority...');
      const disableMintTx = new Transaction().add(
        createSetAuthorityInstruction(
          mintAddress,
          creatorKeypair.publicKey,
          AuthorityType.MintTokens,
          null, // Set to null to disable
          [],
          TOKEN_2022_PROGRAM_ID
        )
      );
      
      const { blockhash: bh2 } = await connection.getLatestBlockhash();
      disableMintTx.recentBlockhash = bh2;
      disableMintTx.feePayer = creatorKeypair.publicKey;
      disableMintTx.sign(creatorKeypair);
      
      disableMintSignature = await connection.sendRawTransaction(disableMintTx.serialize());
      await connection.confirmTransaction(disableMintSignature, 'confirmed');
      console.log(`[TOKEN22] Mint authority revoked: ${disableMintSignature}`);
    }

    if (revokeFreezeAuthority) {
      console.log('[TOKEN22] Revoking freeze authority...');
      const disableFreezeTx = new Transaction().add(
        createSetAuthorityInstruction(
          mintAddress,
          creatorKeypair.publicKey,
          AuthorityType.FreezeAccount,
          null, // Set to null to disable
          [],
          TOKEN_2022_PROGRAM_ID
        )
      );
      
      const { blockhash: bh3 } = await connection.getLatestBlockhash();
      disableFreezeTx.recentBlockhash = bh3;
      disableFreezeTx.feePayer = creatorKeypair.publicKey;
      disableFreezeTx.sign(creatorKeypair);
      
      disableFreezeSignature = await connection.sendRawTransaction(disableFreezeTx.serialize());
      await connection.confirmTransaction(disableFreezeSignature, 'confirmed');
      console.log(`[TOKEN22] Freeze authority revoked: ${disableFreezeSignature}`);
    }

    console.log(`[TOKEN22] Token created successfully: ${mintAddress.toBase58()}`);

    return {
      success: true,
      mintAddress: mintAddress.toBase58(),
      metadataUri,
      txSignature,
      mintSignature,
      disableMintSignature,
      disableFreezeSignature,
      transferFeeConfigAuthority: enableTransferFee ? creatorKeypair.publicKey.toBase58() : undefined,
      withdrawWithheldAuthority: enableTransferFee ? creatorKeypair.publicKey.toBase58() : undefined,
    };

  } catch (error) {
    console.error('[TOKEN22] Creation error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Token creation failed',
    };
  }
}

// ============================================================================
// MINTING
// ============================================================================

/**
 * Mint tokens to a destination
 * Ported from raydiumspltoken/tokens.js mintTokens()
 */
export async function mintTokens(params: MintTokensParams): Promise<string> {
  const {
    connection,
    mintAddress,
    amount,
    decimals,
    payerKeypair,
    destination,
  } = params;

  const mintPubkey = new PublicKey(mintAddress);
  const destinationPubkey = destination 
    ? new PublicKey(destination) 
    : payerKeypair.publicKey;

  // Get associated token account
  const ata = getAssociatedTokenAddressSync(
    mintPubkey,
    destinationPubkey,
    false,
    TOKEN_2022_PROGRAM_ID
  );

  const transaction = new Transaction();

  // Check if ATA exists, create if not
  const ataInfo = await connection.getAccountInfo(ata);
  if (!ataInfo) {
    transaction.add(
      createAssociatedTokenAccountInstruction(
        payerKeypair.publicKey,
        ata,
        destinationPubkey,
        mintPubkey,
        TOKEN_2022_PROGRAM_ID
      )
    );
  }

  // Calculate raw amount
  const rawAmount = BigInt(Math.floor(parseFloat(amount) * Math.pow(10, decimals)));

  // Mint to ATA
  transaction.add(
    createMintToInstruction(
      mintPubkey,
      ata,
      payerKeypair.publicKey,
      rawAmount,
      [],
      TOKEN_2022_PROGRAM_ID
    )
  );

  // Send transaction
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = payerKeypair.publicKey;
  transaction.sign(payerKeypair);

  const signature = await connection.sendRawTransaction(transaction.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });

  await connection.confirmTransaction({
    signature,
    blockhash,
    lastValidBlockHeight,
  }, 'confirmed');

  console.log(`[TOKEN22] Minted ${amount} tokens to ${ata.toBase58()}: ${signature}`);
  return signature;
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate token parameters
 * 
 * Note: Raydium CPMM pools do NOT support certain Token-2022 extensions:
 * - Permanent Delegate
 * - Non-Transferable Tokens
 * - Default Account State
 * - Confidential Transfers
 * - Transfer Hook
 * 
 * These are blocked at the Raydium program level.
 * Only Transfer Fee and Metadata Pointer are supported.
 */
export function validateToken22Params(params: Partial<CreateToken22Params>): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { name, symbol, decimals, totalSupply, transferFeeBasisPoints } = params;

  if (!name || name.trim().length === 0) {
    errors.push('Token name is required');
  }
  if (name && name.length > 32) {
    errors.push('Token name must be 32 characters or less');
  }

  if (!symbol || symbol.trim().length === 0) {
    errors.push('Token symbol is required');
  }
  if (symbol && symbol.length > 10) {
    errors.push('Token symbol must be 10 characters or less');
  }

  if (decimals === undefined || decimals === null) {
    errors.push('Decimals is required');
  }
  if (decimals !== undefined && (decimals < 0 || decimals > 9)) {
    errors.push('Decimals must be between 0 and 9');
  }

  if (totalSupply && parseFloat(totalSupply) < 0) {
    errors.push('Total supply must be a positive number');
  }

  if (transferFeeBasisPoints !== undefined) {
    if (transferFeeBasisPoints < 0 || transferFeeBasisPoints > 500) {
      errors.push('Transfer fee must be between 0 and 500 basis points (5%)');
    }
    if (transferFeeBasisPoints > 0) {
      warnings.push('Transfer Fee extension is supported by Raydium CPMM pools. Fees will apply to swaps.');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export { TOKEN_2022_PROGRAM_ID };

