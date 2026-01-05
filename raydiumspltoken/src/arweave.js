/**
 * Arweave/IPFS Upload Module
 * Handles permanent storage of token images and metadata using Irys (formerly Bundlr)
 * 
 * Irys is a decentralized data upload network that uses Arweave for permanent storage
 */

const Irys = require('@irys/sdk').default;
const { getActiveWalletKeypair } = require('./wallets');
const fs = require('fs');
const path = require('path');

// Irys network configuration
const IRYS_NODE_URL = process.env.IRYS_NODE_URL || 'https://node1.irys.xyz';
const IRYS_NETWORK = process.env.NETWORK === 'devnet' ? 'devnet' : 'mainnet';

/**
 * Initialize Irys client
 * @param {number} userId - User ID
 * @param {number} walletId - Optional wallet ID, otherwise uses active wallet
 * @returns {Promise<Irys>} Irys client instance
 */
async function initializeIrysClient(userId, walletId = null) {
  try {
    let keypair;
    if (walletId) {
      const { loadWalletFromDatabase } = require('./wallets');
      keypair = loadWalletFromDatabase(walletId);
      if (!keypair) {
        throw new Error(`Wallet ID ${walletId} not found`);
      }
    } else {
      keypair = getActiveWalletKeypair(userId);
      if (!keypair) {
        throw new Error('No active wallet found');
      }
    }
    
    // Validate keypair has secretKey
    if (!keypair || !keypair.secretKey) {
      throw new Error('Invalid keypair: missing secretKey');
    }
    
    // Irys expects the secret key as a direct Uint8Array or Buffer, not JSON stringified
    // Make sure it's a proper Uint8Array
    const secretKey = keypair.secretKey instanceof Uint8Array 
      ? keypair.secretKey 
      : new Uint8Array(keypair.secretKey);
    
    if (secretKey.length !== 64) {
      throw new Error(`Invalid secretKey length: ${secretKey.length} (expected 64)`);
    }
    
    // Create Irys instance with Solana - pass secretKey directly as Buffer
    const irys = new Irys({
      url: IRYS_NODE_URL,
      token: 'solana',
      key: Buffer.from(secretKey),
      config: {
        providerUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'
      }
    });
    
    // Verify connection
    const address = await irys.getLoadedBalance();
    console.log(`✅ Irys initialized. Balance: ${irys.utils.fromAtomic(address)} SOL`);
    
    return irys;
  } catch (error) {
    console.error('Error initializing Irys:', error);
    throw new Error('Failed to initialize Arweave upload client');
  }
}

/**
 * Check and fund Irys balance if needed
 * @param {Irys} irys - Irys client
 * @param {number} requiredBytes - Bytes to upload
 * @returns {Promise<void>}
 */
async function ensureSufficientBalance(irys, requiredBytes) {
  try {
    // Get price for upload
    const price = await irys.getPrice(requiredBytes);
    const balance = await irys.getLoadedBalance();
    
    // Convert to BigInt for comparison (Irys returns atomic units)
    const priceBigInt = BigInt(price.toString());
    const balanceBigInt = BigInt(balance.toString());
    
    console.log(`Upload cost: ${irys.utils.fromAtomic(price)} SOL`);
    console.log(`Current balance: ${irys.utils.fromAtomic(balance)} SOL`);
    
    if (balanceBigInt < priceBigInt) {
      // Need to fund - calculate amount with 10% buffer
      const deficit = priceBigInt - balanceBigInt;
      const fundAmount = (deficit * 110n) / 100n; // Add 10% buffer
      
      console.log(`Funding Irys with ${irys.utils.fromAtomic(fundAmount)} SOL...`);
      
      const fundTx = await irys.fund(fundAmount);
      console.log(`✅ Funded Irys: ${fundTx.id}`);
    }
  } catch (error) {
    console.error('Error checking/funding Irys balance:', error);
    throw error;
  }
}

/**
 * Upload image file to Arweave via Irys
 * @param {number} userId - User ID
 * @param {Buffer} imageBuffer - Image file buffer
 * @param {string} contentType - MIME type (e.g., 'image/png')
 * @param {number} walletId - Optional wallet ID
 * @returns {Promise<string>} Arweave URI
 */
async function uploadImageToArweave(userId, imageBuffer, contentType = 'image/png', walletId = null) {
  try {
    console.log('📤 Uploading image to Arweave via Irys...');
    
    // Initialize Irys
    const irys = await initializeIrysClient(userId, walletId);
    
    // Ensure sufficient balance
    await ensureSufficientBalance(irys, imageBuffer.length);
    
    // Upload image
    const tags = [
      { name: 'Content-Type', value: contentType },
      { name: 'App-Name', value: 'Solana-Token-Bot' },
      { name: 'Type', value: 'image' }
    ];
    
    const receipt = await irys.upload(imageBuffer, { tags });
    
    const imageUrl = `https://arweave.net/${receipt.id}`;
    console.log(`✅ Image uploaded to Arweave: ${imageUrl}`);
    
    return imageUrl;
  } catch (error) {
    console.error('Error uploading image to Arweave:', error);
    throw new Error(`Failed to upload image: ${error.message}`);
  }
}

/**
 * Upload metadata JSON to Arweave via Irys
 * @param {number} userId - User ID
 * @param {object} metadata - Metadata object
 * @param {number} walletId - Optional wallet ID
 * @returns {Promise<string>} Metadata URI
 */
async function uploadMetadataToArweave(userId, metadata, walletId = null) {
  try {
    console.log('📤 Uploading metadata to Arweave via Irys...');
    
    // Initialize Irys
    const irys = await initializeIrysClient(userId, walletId);
    
    // Convert metadata to JSON string
    const metadataJson = JSON.stringify(metadata, null, 2);
    const metadataBuffer = Buffer.from(metadataJson);
    
    // Ensure sufficient balance
    await ensureSufficientBalance(irys, metadataBuffer.length);
    
    // Upload metadata
    const tags = [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'App-Name', value: 'Solana-Token-Bot' },
      { name: 'Type', value: 'metadata' },
      { name: 'Token-Name', value: metadata.name || 'Unknown' },
      { name: 'Token-Symbol', value: metadata.symbol || 'Unknown' }
    ];
    
    const receipt = await irys.upload(metadataBuffer, { tags });
    
    const metadataUrl = `https://arweave.net/${receipt.id}`;
    console.log(`✅ Metadata uploaded to Arweave: ${metadataUrl}`);
    
    return metadataUrl;
  } catch (error) {
    console.error('Error uploading metadata to Arweave:', error);
    throw new Error(`Failed to upload metadata: ${error.message}`);
  }
}

/**
 * Download file from Telegram and upload to Arweave
 * @param {number} userId - User ID
 * @param {string} fileId - Telegram file ID
 * @param {object} bot - Telegram bot instance
 * @returns {Promise<string>} Arweave URI
 */
async function uploadTelegramFileToArweave(userId, fileId, bot) {
  try {
    // Download file from Telegram
    const fileUrl = await bot.getFileLink(fileId);
    const response = await require('axios').get(fileUrl, { responseType: 'arraybuffer' });
    const fileBuffer = Buffer.from(response.data);
    
    // Determine content type from file extension
    const contentType = response.headers['content-type'] || 'image/png';
    
    // Upload to Arweave
    return await uploadImageToArweave(userId, fileBuffer, contentType);
  } catch (error) {
    console.error('Error uploading Telegram file to Arweave:', error);
    throw error;
  }
}

/**
 * Create complete token metadata and upload to Arweave
 * @param {number} userId - User ID
 * @param {object} tokenData - Token data
 * @param {Buffer} imageBuffer - Image buffer (optional)
 * @returns {Promise<object>} { imageUrl, metadataUrl }
 */
async function createAndUploadTokenMetadata(userId, tokenData, imageBuffer = null, walletId = null) {
  try {
    const { 
      name, 
      symbol, 
      description, 
      twitter = '', 
      telegram = '', 
      website = '', 
      imageUrl: existingImageUrl 
    } = tokenData;
    
    let imageUrl = existingImageUrl;
    
    // Upload image if provided
    if (imageBuffer) {
      imageUrl = await uploadImageToArweave(userId, imageBuffer, 'image/png', walletId);
    }
    
    // Create metadata object following Metaplex standard
    const metadata = {
      name,
      symbol,
      description: description || `${name} Token`,
      image: imageUrl || '',
      attributes: [],
      properties: {
        files: imageUrl ? [{
          uri: imageUrl,
          type: 'image/png'
        }] : [],
        category: 'image'
      }
    };
    
    // Add external URLs (social links) if provided - Metaplex standard
    const externalUrl = [];
    if (website) externalUrl.push({ url: website, type: 'website' });
    if (twitter) metadata.twitter = twitter;
    if (telegram) metadata.telegram = telegram;
    if (externalUrl.length > 0) metadata.external_url = externalUrl;
    
    // Upload metadata
    const metadataUrl = await uploadMetadataToArweave(userId, metadata, walletId);
    
    return {
      imageUrl,
      metadataUrl,
      metadata
    };
  } catch (error) {
    console.error('Error creating and uploading token metadata:', error);
    throw error;
  }
}

/**
 * Get upload cost estimate
 * @param {number} bytes - Number of bytes
 * @returns {Promise<string>} Cost in SOL
 */
async function getUploadCostEstimate(bytes) {
  try {
    // Create temporary Irys instance to get price
    const irys = new Irys({
      url: IRYS_NODE_URL,
      token: 'solana',
      key: 'dummy', // Won't be used for price queries
    });
    
    const price = await irys.getPrice(bytes);
    return irys.utils.fromAtomic(price);
  } catch (error) {
    console.error('Error getting upload cost:', error);
    return '0.001'; // Return default estimate
  }
}

module.exports = {
  uploadImageToArweave,
  uploadMetadataToArweave,
  uploadTelegramFileToArweave,
  createAndUploadTokenMetadata,
  getUploadCostEstimate,
  initializeIrysClient
};

