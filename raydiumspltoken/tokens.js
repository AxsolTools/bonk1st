/**
 * Token Operations Module
 * Handles Token-2022 creation with extensions, metadata, and token management
 */

const {
  SystemProgram,
  Transaction,
  PublicKey,
  Keypair,
  SYSVAR_RENT_PUBKEY
} = require('@solana/web3.js');
const {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createInitializeMintInstruction,
  getMintLen,
  ExtensionType,
  createInitializeTransferFeeConfigInstruction,
  createInitializeMetadataPointerInstruction,
  createInitializeMintCloseAuthorityInstruction,
  TYPE_SIZE,
  LENGTH_SIZE,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  createSetAuthorityInstruction,
  AuthorityType
} = require('@solana/spl-token');
const { getConnection, sendAndConfirmTransactionWithRetry } = require('./solana_utils');
const { getActiveWalletKeypair } = require('./wallets');
const { saveToken } = require('./db');
const { handleError } = require('./errors');
const { uploadImageToArweave, uploadMetadataToArweave, createAndUploadTokenMetadata } = require('./arweave');
const axios = require('axios');

// Token Metadata Program ID (for Token-2022 metadata extension)
const TOKEN_METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

// Note: Arweave upload functions are now in src/arweave.js
// They are imported at the top of this file

/**
 * Create Token-2022 with metadata and optional transfer fee extension
 * @param {object} params - Token parameters
 * @returns {Promise<object>} Token creation result
 */
async function createToken2022(params) {
  const {
    userId,
    walletId, // Optional: specify wallet ID, otherwise uses active wallet
    name,
    symbol,
    decimals,
    totalSupply,
    description,
    twitter = '',
    telegram = '',
    website = '',
    imageUrl,
    enableTransferFee = false,
    transferFeeBasisPoints = 0,
    maxTransferFee = 0,
    disableMintAuthority = true,   // Default true for DEX compatibility
    disableFreezeAuthority = false // Default false, user can enable
  } = params;
  
  try {
    const conn = getConnection();
    
    // Use specified wallet or fall back to active wallet
    let payer;
    if (walletId) {
      const { loadWalletFromDatabase } = require('./wallets');
      payer = loadWalletFromDatabase(walletId);
      if (!payer) {
        throw new Error(`Wallet ID ${walletId} not found`);
      }
    } else {
      payer = getActiveWalletKeypair(userId);
      if (!payer) {
        throw new Error('No active wallet found');
      }
    }
    
    // Generate new mint keypair
    const mintKeypair = Keypair.generate();
    const mintAddress = mintKeypair.publicKey;
    
    // Prepare metadata
    const metadata = {
      name,
      symbol,
      description: description || `${name} Token`,
      image: imageUrl || ''
    };
    
    // Upload metadata to Arweave (if image URL provided)
    let metadataUri = '';
    if (imageUrl) {
      const uploadResult = await createAndUploadTokenMetadata(userId, {
        name,
        symbol,
        description,
        twitter,
        telegram,
        website,
        imageUrl
      });
      metadataUri = uploadResult.metadataUrl;
    }
    
    // Calculate space needed for mint account with extensions
    const extensions = [ExtensionType.MetadataPointer];
    if (enableTransferFee) {
      extensions.push(ExtensionType.TransferFeeConfig);
    }
    
    const mintLen = getMintLen(extensions);
    const lamports = await conn.getMinimumBalanceForRentExemption(mintLen);
    
    // Build transaction
    const transaction = new Transaction();
    
    // Create mint account
    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: mintAddress,
        space: mintLen,
        lamports,
        programId: TOKEN_2022_PROGRAM_ID
      })
    );
    
    // Initialize metadata pointer (points to mint itself for on-chain metadata)
    transaction.add(
      createInitializeMetadataPointerInstruction(
        mintAddress,
        payer.publicKey,
        mintAddress,
        TOKEN_2022_PROGRAM_ID
      )
    );
    
    // Initialize transfer fee extension if enabled
    if (enableTransferFee) {
      transaction.add(
        createInitializeTransferFeeConfigInstruction(
          mintAddress,
          payer.publicKey, // transfer fee config authority
          payer.publicKey, // withdrawal authority
          transferFeeBasisPoints,
          BigInt(maxTransferFee),
          TOKEN_2022_PROGRAM_ID
        )
      );
    }
    
    // Initialize mint
    transaction.add(
      createInitializeMintInstruction(
        mintAddress,
        decimals,
        payer.publicKey, // mint authority
        payer.publicKey, // freeze authority
        TOKEN_2022_PROGRAM_ID
      )
    );
    
    // Send and confirm transaction
    console.log('Creating Token-2022 mint...');
    const signature = await sendAndConfirmTransactionWithRetry(
      transaction,
      [payer, mintKeypair],
      { skipPreflight: false }
    );
    
    // TODO: Initialize on-chain TokenMetadata in a separate transaction
    // Token-2022 on-chain metadata requires complex space calculation
    // For now, metadata is uploaded to Arweave and linked via MetadataPointer
    // Explorers will fetch metadata from Arweave URI
    
    console.log(`✅ Token-2022 mint created: ${mintAddress.toBase58()}`);
    console.log(`   Transaction: ${signature}`);
    
    // Mint initial supply if specified
    let mintSignature = null;
    if (totalSupply && parseFloat(totalSupply) > 0) {
      mintSignature = await mintTokens({
        userId,
        walletId,
        mintAddress: mintAddress.toBase58(),
        amount: totalSupply,
        decimals
      });
    }
    
    // Optionally disable authorities based on user preference
    let disableMintSig = null;
    let disableFreezeSig = null;
    
    if (disableMintAuthority) {
      console.log('Disabling mint authority...');
      const disableMintTx = new Transaction().add(
        createSetAuthorityInstruction(
          mintAddress,
          payer.publicKey,
          AuthorityType.MintTokens,
          null, // Set to null to disable
          [],
          TOKEN_2022_PROGRAM_ID
        )
      );
      
      disableMintSig = await sendAndConfirmTransactionWithRetry(
        disableMintTx,
        [payer]
      );
      
      console.log(`✅ Mint authority disabled: ${disableMintSig}`);
    }
    
    if (disableFreezeAuthority) {
      console.log('Disabling freeze authority...');
      const disableFreezeTx = new Transaction().add(
        createSetAuthorityInstruction(
          mintAddress,
          payer.publicKey,
          AuthorityType.FreezeAccount,
          null, // Set to null to disable
          [],
          TOKEN_2022_PROGRAM_ID
        )
      );
      
      disableFreezeSig = await sendAndConfirmTransactionWithRetry(
        disableFreezeTx,
        [payer]
      );
      
      console.log(`✅ Freeze authority disabled: ${disableFreezeSig}`);
    }
    
    return {
      mintAddress: mintAddress.toBase58(),
      signature,
      mintSignature,
      disableMintSignature: disableMintSig,
      disableFreezeSignature: disableFreezeSig,
      // Transfer fee authorities (if enabled)
      transferFeeConfigAuthority: enableTransferFee ? payer.publicKey.toBase58() : null,
      withdrawWithheldAuthority: enableTransferFee ? payer.publicKey.toBase58() : null,
      metadata: {
        name,
        symbol,
        decimals,
        totalSupply,
        metadataUri
      }
    };
  } catch (error) {
    console.error('Error creating Token-2022:', error);
    throw error;
  }
}

/**
 * Create standard SPL Token (V1)
 * @param {object} params - Token parameters
 * @returns {Promise<object>} Token creation result
 */
async function createStandardToken(params) {
  const {
    userId,
    name,
    symbol,
    decimals,
    totalSupply
  } = params;
  
  try {
    const conn = getConnection();
    const payer = getActiveWalletKeypair(userId);
    
    if (!payer) {
      throw new Error('No active wallet found');
    }
    
    // Generate new mint keypair
    const mintKeypair = Keypair.generate();
    const mintAddress = mintKeypair.publicKey;
    
    // Calculate space needed
    const mintLen = 82; // Standard mint account size
    const lamports = await conn.getMinimumBalanceForRentExemption(mintLen);
    
    // Build transaction
    const transaction = new Transaction();
    
    // Create mint account
    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: mintAddress,
        space: mintLen,
        lamports,
        programId: TOKEN_PROGRAM_ID
      })
    );
    
    // Initialize mint
    transaction.add(
      createInitializeMintInstruction(
        mintAddress,
        decimals,
        payer.publicKey,
        payer.publicKey,
        TOKEN_PROGRAM_ID
      )
    );
    
    // Send and confirm
    console.log('Creating standard SPL Token...');
    const signature = await sendAndConfirmTransactionWithRetry(
      transaction,
      [payer, mintKeypair]
    );
    
    console.log(`✅ SPL Token created: ${mintAddress.toBase58()}`);
    
    // Mint initial supply if specified
    let mintSignature = null;
    if (totalSupply && parseFloat(totalSupply) > 0) {
      mintSignature = await mintTokens({
        userId,
        mintAddress: mintAddress.toBase58(),
        amount: totalSupply,
        decimals,
        programId: TOKEN_PROGRAM_ID
      });
    }
    
    return {
      mintAddress: mintAddress.toBase58(),
      signature,
      mintSignature,
      metadata: {
        name,
        symbol,
        decimals,
        totalSupply
      }
    };
  } catch (error) {
    console.error('Error creating standard token:', error);
    throw error;
  }
}

/**
 * Mint tokens to a destination
 * @param {object} params - Mint parameters
 * @returns {Promise<string>} Transaction signature
 */
async function mintTokens(params) {
  const {
    userId,
    walletId = null,
    mintAddress,
    amount,
    decimals,
    destination = null,
    programId = TOKEN_2022_PROGRAM_ID
  } = params;
  
  try {
    const conn = getConnection();
    const { loadWalletFromDatabase } = require('./wallets');
    const payer = walletId ? loadWalletFromDatabase(walletId) : getActiveWalletKeypair(userId);
    
    if (!payer) {
      throw new Error('No active wallet found');
    }
    
    const mintPubkey = new PublicKey(mintAddress);
    const destinationPubkey = destination ? new PublicKey(destination) : payer.publicKey;
    
    // Get or create associated token account
    const ata = getAssociatedTokenAddressSync(
      mintPubkey,
      destinationPubkey,
      false,
      programId
    );
    
    const transaction = new Transaction();
    
    // Check if ATA exists, create if not
    const ataInfo = await conn.getAccountInfo(ata);
    if (!ataInfo) {
      transaction.add(
        createAssociatedTokenAccountInstruction(
          payer.publicKey,
          ata,
          destinationPubkey,
          mintPubkey,
          programId
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
        payer.publicKey,
        rawAmount,
        [],
        programId
      )
    );
    
    console.log(`Minting ${amount} tokens to ${ata.toBase58()}...`);
    const signature = await sendAndConfirmTransactionWithRetry(transaction, [payer]);
    
    console.log(`✅ Tokens minted: ${signature}`);
    
    return signature;
  } catch (error) {
    console.error('Error minting tokens:', error);
    throw error;
  }
}

/**
 * Set transfer fee for Token-2022
 * @param {object} params - Fee parameters
 * @returns {Promise<string>} Transaction signature
 */
async function setTransferFee(params) {
  const {
    userId,
    mintAddress,
    feeBasisPoints,
    maxFee
  } = params;
  
  try {
    const conn = getConnection();
    const payer = getActiveWalletKeypair(userId);
    
    if (!payer) {
      throw new Error('No active wallet found');
    }
    
    const mintPubkey = new PublicKey(mintAddress);
    
    // Note: Changing transfer fee requires the transfer fee config authority
    // This creates a new instruction to update the fee configuration
    const transaction = new Transaction().add(
      createSetTransferFeeConfigAuthorityInstruction(
        mintPubkey,
        payer.publicKey,
        feeBasisPoints,
        BigInt(maxFee),
        TOKEN_2022_PROGRAM_ID
      )
    );
    
    const signature = await sendAndConfirmTransactionWithRetry(transaction, [payer]);
    
    console.log(`✅ Transfer fee updated: ${signature}`);
    return signature;
  } catch (error) {
    console.error('Error setting transfer fee:', error);
    throw new Error(`Failed to set transfer fee: ${error.message}`);
  }
}

/**
 * Withdraw accumulated transfer fees (Token-2022)
 * DEPRECATED: Use completeTransferFeeWithdrawal from src/token_fees_advanced.js
 * This function redirects to the proper implementation
 * @param {object} params - Withdrawal parameters
 * @returns {Promise<object>} Transaction result
 */
async function withdrawTransferFees(params) {
  console.warn('[DEPRECATED] withdrawTransferFees() is deprecated. Use completeTransferFeeWithdrawal() from src/token_fees_advanced.js');
  
  // Redirect to proper implementation
  const { completeTransferFeeWithdrawal } = require('./token_fees_advanced');
  
  return await completeTransferFeeWithdrawal({
    userId: params.userId,
    mintAddress: params.mintAddress,
    destinationWallet: params.destinationWallet
  });
}

/**
 * Validate token parameters
 * @param {object} params - Token parameters
 * @returns {object} { valid: boolean, errors: array }
 */
function validateTokenParams(params) {
  const errors = [];
  const { name, symbol, decimals, totalSupply } = params;
  
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
  if (decimals < 0 || decimals > 9) {
    errors.push('Decimals must be between 0 and 9');
  }
  
  if (totalSupply && parseFloat(totalSupply) < 0) {
    errors.push('Total supply must be a positive number');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  createToken2022,
  createStandardToken,
  mintTokens,
  setTransferFee,
  withdrawTransferFees,
  validateTokenParams
};

