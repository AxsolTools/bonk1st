/**
 * Wallet Management Module
 * Handles wallet generation, import, and management with mnemonic support
 */

const { Keypair } = require('@solana/web3.js');
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');
const bs58 = require('bs58');
const nacl = require('tweetnacl');
const db = require('./db');
const fs = require('fs');
const path = require('path');

// User data directory
const USER_DATA_DIR = path.join(__dirname, '..', 'user_data');

// Ensure user_data directory exists
if (!fs.existsSync(USER_DATA_DIR)) {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
}

/**
 * Generate a new Solana wallet with mnemonic
 * @param {number} wordCount - Number of words in mnemonic (12 or 24)
 * @returns {object} { mnemonic, keypair, publicKey, privateKey }
 */
function generateWallet(wordCount = 12) {
  try {
    // Validate word count
    const strength = wordCount === 12 ? 128 : wordCount === 24 ? 256 : null;
    if (!strength) {
      throw new Error('Word count must be 12 or 24');
    }

    // Generate mnemonic
    const mnemonic = bip39.generateMnemonic(strength);
    
    // Derive keypair from mnemonic
    const keypair = keypairFromMnemonic(mnemonic);
    
    return {
      mnemonic,
      keypair,
      publicKey: keypair.publicKey.toBase58(),
      privateKey: bs58.encode(keypair.secretKey)
    };
  } catch (error) {
    console.error('Error generating wallet:', error);
    throw new Error('Failed to generate wallet');
  }
}

/**
 * Derive Solana keypair from mnemonic
 * @param {string} mnemonic - BIP39 mnemonic phrase
 * @param {string} derivationPath - BIP44 derivation path
 * @returns {Keypair} Solana keypair
 */
function keypairFromMnemonic(mnemonic, derivationPath = "m/44'/501'/0'/0'") {
  try {
    if (!bip39.validateMnemonic(mnemonic)) {
      throw new Error('Invalid mnemonic phrase');
    }

    // Generate seed from mnemonic
    const seed = bip39.mnemonicToSeedSync(mnemonic);
    
    // Derive key using BIP44 path
    const derivedSeed = derivePath(derivationPath, seed.toString('hex')).key;
    
    // Create keypair from derived seed
    const keypair = Keypair.fromSeed(derivedSeed);
    
    return keypair;
  } catch (error) {
    console.error('Error deriving keypair from mnemonic:', error);
    throw error;
  }
}

/**
 * Import wallet from mnemonic phrase
 * @param {string} mnemonic - BIP39 mnemonic phrase
 * @returns {object} { keypair, publicKey, privateKey }
 */
function importWalletFromMnemonic(mnemonic) {
  try {
    // Clean and validate mnemonic
    const cleanMnemonic = mnemonic.trim().toLowerCase();
    
    if (!bip39.validateMnemonic(cleanMnemonic)) {
      throw new Error('Invalid mnemonic phrase');
    }

    const keypair = keypairFromMnemonic(cleanMnemonic);
    
    return {
      keypair,
      publicKey: keypair.publicKey.toBase58(),
      privateKey: bs58.encode(keypair.secretKey),
      mnemonic: cleanMnemonic
    };
  } catch (error) {
    console.error('Error importing wallet from mnemonic:', error);
    throw error;
  }
}

/**
 * Import wallet from private key
 * @param {string} privateKeyStr - Private key (base58 or byte array JSON)
 * @returns {object} { keypair, publicKey, privateKey }
 */
function importWalletFromPrivateKey(privateKeyStr) {
  try {
    let secretKey;
    
    // Try to parse as base58
    try {
      secretKey = bs58.decode(privateKeyStr);
    } catch (e) {
      // Try to parse as JSON array
      try {
        const parsed = JSON.parse(privateKeyStr);
        if (Array.isArray(parsed)) {
          secretKey = Uint8Array.from(parsed);
        } else {
          throw new Error('Invalid private key format');
        }
      } catch (e2) {
        throw new Error('Invalid private key format. Must be base58 or JSON array');
      }
    }
    
    const keypair = Keypair.fromSecretKey(secretKey);
    
    return {
      keypair,
      publicKey: keypair.publicKey.toBase58(),
      privateKey: bs58.encode(keypair.secretKey)
    };
  } catch (error) {
    console.error('Error importing wallet from private key:', error);
    throw error;
  }
}

/**
 * Save wallet to database (UNENCRYPTED)
 * @param {number} userId - User ID
 * @param {number} telegramId - Telegram user ID
 * @param {string} username - Telegram username
 * @param {object} walletData - Wallet data
 * @param {string} walletType - 'generated' or 'imported'
 * @param {string} walletName - Optional wallet name
 * @returns {object} Saved wallet record
 */
function saveWalletToDatabase(userId, telegramId, username, walletData, walletType, walletName = null) {
  try {
    const { publicKey, privateKey, mnemonic } = walletData;
    const existingCount = db.getUserWalletCount(userId);
    const resolvedName = walletName && walletName.trim().length
      ? walletName.trim().replace(/\s+/g, ' ')
      : `Wallet ${existingCount + 1}`;
    
    // Save to user-specific JSON file (PLAIN TEXT)
    const filePath = saveWalletToUserFile(telegramId, username, walletData, walletType, resolvedName);
    
    // Save to database with file path reference
    const wallet = db.saveWallet(userId, publicKey, filePath, walletType, resolvedName);
    
    return wallet;
  } catch (error) {
    console.error('Error saving wallet to database:', error);
    throw error;
  }
}

/**
 * Save wallet to user-specific JSON file (PLAIN TEXT - UNENCRYPTED)
 * @param {number} telegramId - Telegram user ID
 * @param {string} username - Telegram username
 * @param {object} walletData - Wallet data
 * @param {string} walletType - 'generated' or 'imported'
 * @param {string} walletName - Optional wallet name
 * @returns {string} File path
 */
function saveWalletToUserFile(telegramId, username, walletData, walletType, walletName = null) {
  try {
    const filePath = path.join(USER_DATA_DIR, `${telegramId}.json`);
    const { publicKey, privateKey, mnemonic } = walletData;
    
    // Read existing data or create new
    let userData = { wallets: [] };
    if (fs.existsSync(filePath)) {
      try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        userData = JSON.parse(fileContent);
        if (!userData.wallets) userData.wallets = [];
      } catch (e) {
        console.warn('Could not parse existing user file, creating new one');
        userData = { wallets: [] };
      }
    }
    
    // Add new wallet entry (PLAIN TEXT - NO ENCRYPTION)
    const walletEntry = {
      timestamp: new Date().toISOString(),
      user_id: telegramId,
      username: username || 'unknown',
      wallet_name: walletName || `Wallet ${userData.wallets.length + 1}`,
      wallet_type: walletType,
      public_key: publicKey,
      private_key: privateKey,
      seed_phrase: mnemonic || null,  // Store mnemonic in plain text
      archived: false,
      archived_at: null,
      archive_reason: null
    };
    
    userData.wallets.push(walletEntry);
    
    // Write back to file (PLAIN TEXT)
    fs.writeFileSync(filePath, JSON.stringify(userData, null, 2), {
      encoding: 'utf8',
      mode: 0o600  // Read/write for owner only
    });
    
    console.log(`✅ Wallet saved to user file (UNENCRYPTED): ${telegramId}.json`);
    
    return filePath;
  } catch (error) {
    console.error('Error saving wallet to user file:', error);
    throw error;
  }
}

/**
 * Load wallet from JSON file (UNENCRYPTED)
 * @param {number} walletId - Wallet ID
 * @returns {Keypair} Solana keypair
 */
function loadWalletFromDatabase(walletId) {
  try {
    const wallet = db.getWalletById(walletId);
    if (!wallet) {
      throw new Error('Wallet not found');
    }
    
    // Read wallet data from JSON file (PLAIN TEXT)
    const fileContent = fs.readFileSync(wallet.file_path, 'utf8');
    const userData = JSON.parse(fileContent);
    
    // Find the specific wallet by public key
    const walletEntry = userData.wallets.find(w => w.public_key === wallet.wallet_address);
    if (!walletEntry) {
      throw new Error('Wallet data not found in file');
    }
    
    // Load keypair from seed phrase or private key
    let keypair;
    if (walletEntry.seed_phrase) {
      keypair = keypairFromMnemonic(walletEntry.seed_phrase);
    } else {
      const imported = importWalletFromPrivateKey(walletEntry.private_key);
      keypair = imported.keypair;
    }
    
    // Verify the public key matches
    if (keypair.publicKey.toBase58() !== wallet.wallet_address) {
      throw new Error('Public key mismatch');
    }
    
    return keypair;
  } catch (error) {
    console.error('Error loading wallet from database:', error);
    throw error;
  }
}

/**
 * Get user's active wallet keypair
 * @param {number} userId - User ID
 * @returns {Keypair|null} Solana keypair or null
 */
function getActiveWalletKeypair(userId) {
  try {
    const activeWallet = db.getActiveWallet(userId);
    if (!activeWallet) {
      return null;
    }
    
    return loadWalletFromDatabase(activeWallet.wallet_id);
  } catch (error) {
    console.error('Error getting active wallet keypair:', error);
    throw error;
  }
}

/**
 * Escape Markdown special characters in username
 * @param {string} username - Username to escape
 * @returns {string} Escaped username
 */
function escapeMarkdown(username) {
  if (!username) return 'unknown';
  return username.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

/**
 * Validate Solana address format
 * @param {string} address - Address to validate
 * @returns {boolean} True if valid
 */
function isValidSolanaAddress(address) {
  try {
    const decoded = bs58.decode(address);
    return decoded.length === 32;
  } catch (e) {
    return false;
  }
}

/**
 * Create a new wallet for user
 * @param {number} telegramId - Telegram user ID
 * @param {string} username - Telegram username
 * @param {number} wordCount - Mnemonic word count (12 or 24)
 * @returns {object} { wallet, mnemonic, user }
 */
async function createWalletForUser(telegramId, username, wordCount = 12) {
  try {
    // Create or get user
    const user = db.createOrGetUser(telegramId, username);
    
    // Check wallet limit
    const maxWallets = parseInt(process.env.MAX_WALLETS_PER_USER) || 100;
    const walletCount = db.getUserWalletCount(user.user_id);
    
    if (walletCount >= maxWallets) {
      throw new Error(`Maximum wallet limit reached (${maxWallets} wallets)`);
    }
    
    // Generate new wallet
    const walletData = generateWallet(wordCount);
    
    // Save to database
    const wallet = saveWalletToDatabase(user.user_id, telegramId, username, walletData, 'generated');
    
    // If this is the user's first wallet, set it as active
    if (walletCount === 0) {
      db.setActiveWallet(user.user_id, wallet.wallet_id);
    }
    
    return {
      wallet,
      mnemonic: walletData.mnemonic,
      user,
      isFirstWallet: walletCount === 0
    };
  } catch (error) {
    console.error('Error creating wallet for user:', error);
    throw error;
  }
}

/**
 * Import wallet for user
 * @param {number} telegramId - Telegram user ID
 * @param {string} username - Telegram username
 * @param {string} importData - Mnemonic or private key
 * @returns {object} { wallet, user }
 */
async function importWalletForUser(telegramId, username, importData) {
  try {
    // Create or get user
    const user = db.createOrGetUser(telegramId, username);
    
    // Check wallet limit
    const maxWallets = parseInt(process.env.MAX_WALLETS_PER_USER) || 100;
    const walletCount = db.getUserWalletCount(user.user_id);
    
    if (walletCount >= maxWallets) {
      throw new Error(`Maximum wallet limit reached (${maxWallets} wallets)`);
    }
    
    // Try to import (will detect mnemonic vs private key automatically)
    let walletData;
    const trimmedData = importData.trim();
    
    // Check if it looks like a mnemonic (has spaces)
    if (trimmedData.includes(' ')) {
      walletData = importWalletFromMnemonic(trimmedData);
    } else {
      walletData = importWalletFromPrivateKey(trimmedData);
    }
    
    // Check if wallet already exists
    const existingWallet = db.getWalletByAddress(walletData.publicKey);
    if (existingWallet) {
      // If wallet is archived, restore it
      if (existingWallet.archived) {
        const restoreResult = db.restoreWallet(existingWallet.wallet_id);
        if (restoreResult.success) {
          return {
            wallet: existingWallet,
            user,
            isFirstWallet: walletCount === 0,
            wasRestored: true
          };
        }
      }
      // If wallet is not archived, it's already active
      throw new Error('This wallet is already imported');
    }
    
    // Save to database
    const wallet = saveWalletToDatabase(user.user_id, telegramId, username, walletData, 'imported');
    
    // If this is the user's first wallet, set it as active
    if (walletCount === 0) {
      db.setActiveWallet(user.user_id, wallet.wallet_id);
    }
    
    return {
      wallet,
      user,
      isFirstWallet: walletCount === 0
    };
  } catch (error) {
    console.error('Error importing wallet for user:', error);
    throw error;
  }
}

/**
 * Rename an existing wallet for a user
 * @param {number} userId - Internal user ID
 * @param {number} walletId - Wallet ID
 * @param {string} newName - New wallet label
 * @returns {object} Updated wallet record
 */
function renameWalletForUser(userId, walletId, newName) {
  const wallet = db.getWalletById(walletId);
  if (!wallet || wallet.user_id !== userId) {
    throw new Error('Wallet not found');
  }

  const trimmed = (newName || '').trim();
  if (trimmed.length === 0) {
    throw new Error('Wallet name cannot be empty');
  }
  if (trimmed.length > 40) {
    throw new Error('Wallet name must be 40 characters or fewer');
  }

  const normalizedName = trimmed.replace(/\s+/g, ' ');

  const updatedWallet = db.updateWalletName(walletId, normalizedName);

  // Best effort: keep user data file in sync
  try {
    if (wallet.file_path && fs.existsSync(wallet.file_path)) {
      const fileContent = fs.readFileSync(wallet.file_path, 'utf8');
      const userData = JSON.parse(fileContent);
      if (Array.isArray(userData.wallets)) {
        const entry = userData.wallets.find(w => w.public_key === wallet.wallet_address);
        if (entry) {
          entry.wallet_name = normalizedName;
          fs.writeFileSync(wallet.file_path, JSON.stringify(userData, null, 2), {
            encoding: 'utf8',
            mode: 0o600
          });
        }
      }
    }
  } catch (error) {
    console.warn('Failed to update wallet name in user file:', error.message);
  }

  return updatedWallet;
}

module.exports = {
  generateWallet,
  keypairFromMnemonic,
  importWalletFromMnemonic,
  importWalletFromPrivateKey,
  saveWalletToDatabase,
  loadWalletFromDatabase,
  getActiveWalletKeypair,
  escapeMarkdown,
  isValidSolanaAddress,
  createWalletForUser,
  importWalletForUser,
  renameWalletForUser,
  saveWalletToUserFile
};

