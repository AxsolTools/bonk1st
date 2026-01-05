/**
 * AQUA Launchpad - Crypto Module
 * 
 * Provides automatic, secure encryption for wallet private keys
 * No manual configuration required - keys are auto-generated and managed
 */

// Re-export all key management functions
export {
  deriveUserEncryptionKey,
  deriveSessionKey,
  generateServiceSalt,
  encryptData,
  decryptData,
  encryptPrivateKey,
  decryptPrivateKey,
  encryptMnemonic,
  decryptMnemonic,
  validateEncryption,
  isEncrypted,
  generateSecureRandom,
  hashData,
} from './key-manager';

// Re-export vault functions
export {
  getOrCreateServiceSalt,
  clearSaltCache,
  isSaltInitialized,
  getCachedSalt,
} from './vault';

