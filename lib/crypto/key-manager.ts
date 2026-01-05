/**
 * AQUA Launchpad - Automatic Key Management
 * Industry-standard AES-256-GCM encryption with auto-generated keys
 * 
 * NO MANUAL CONFIGURATION REQUIRED
 * Keys are derived from Supabase service role + per-user salt
 */

import { createHash, randomBytes, createCipheriv, createDecipheriv, pbkdf2Sync } from 'crypto';

// ============================================================================
// CONSTANTS
// ============================================================================

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const KEY_LENGTH = 32;
const PBKDF2_ITERATIONS = 100000;

// Version prefix for encrypted data (for future migration support)
const ENCRYPTION_VERSION = 'v1';

// ============================================================================
// KEY DERIVATION
// ============================================================================

/**
 * Derive a user-specific encryption key using PBKDF2
 * This ensures each user's data is encrypted with a unique key
 * 
 * @param userId - User's unique identifier
 * @param serviceSalt - Service-level salt (stored in Supabase Vault)
 * @returns 32-byte encryption key
 */
export function deriveUserEncryptionKey(userId: string, serviceSalt: string): Buffer {
  // Create deterministic material from user ID and service salt
  const material = `${userId}:${serviceSalt}:aqua-wallet-encryption`;
  
  // Use PBKDF2 for key derivation (NIST recommended)
  return pbkdf2Sync(
    material,
    serviceSalt,
    PBKDF2_ITERATIONS,
    KEY_LENGTH,
    'sha256'
  );
}

/**
 * Generate a service-level salt for first-time setup
 * This should be stored securely (e.g., Supabase Vault)
 * 
 * @returns 64-character hex string (32 bytes)
 */
export function generateServiceSalt(): string {
  return randomBytes(SALT_LENGTH).toString('hex');
}

/**
 * Quick key derivation using SHA-256 (for session-based encryption)
 * Less secure than PBKDF2 but faster for ephemeral data
 * 
 * @param sessionId - Session identifier
 * @param serviceSalt - Service salt
 * @returns 32-byte key
 */
export function deriveSessionKey(sessionId: string, serviceSalt: string): Buffer {
  const material = `${sessionId}:${serviceSalt}:aqua-session`;
  return createHash('sha256').update(material).digest();
}

// ============================================================================
// ENCRYPTION / DECRYPTION
// ============================================================================

/**
 * Encrypt a private key or sensitive data using AES-256-GCM
 * 
 * Format: version:iv:authTag:encrypted (all base64)
 * 
 * @param plaintext - Data to encrypt (e.g., private key)
 * @param key - 32-byte encryption key
 * @returns Encrypted string in portable format
 */
export function encryptData(plaintext: string, key: Buffer): string {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('Plaintext must be a non-empty string');
  }
  
  if (!key || key.length !== KEY_LENGTH) {
    throw new Error('Encryption key must be 32 bytes');
  }
  
  // Generate random IV for each encryption (never reuse!)
  const iv = randomBytes(IV_LENGTH);
  
  // Create cipher
  const cipher = createCipheriv(ALGORITHM, key, iv);
  
  // Encrypt
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);
  
  // Get authentication tag (prevents tampering)
  const authTag = cipher.getAuthTag();
  
  // Format: version:iv:authTag:encrypted
  return [
    ENCRYPTION_VERSION,
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64')
  ].join(':');
}

/**
 * Decrypt data encrypted with encryptData()
 * 
 * @param encryptedData - Encrypted string from encryptData()
 * @param key - 32-byte encryption key (same used for encryption)
 * @returns Decrypted plaintext
 */
export function decryptData(encryptedData: string, key: Buffer): string {
  if (!encryptedData || typeof encryptedData !== 'string') {
    throw new Error('Encrypted data must be a non-empty string');
  }
  
  if (!key || key.length !== KEY_LENGTH) {
    throw new Error('Encryption key must be 32 bytes');
  }
  
  // Parse the encrypted data
  const parts = encryptedData.split(':');
  
  if (parts.length !== 4) {
    throw new Error('Invalid encrypted data format');
  }
  
  const [version, ivB64, authTagB64, encryptedB64] = parts;
  
  // Version check for future migration support
  if (version !== ENCRYPTION_VERSION) {
    throw new Error(`Unsupported encryption version: ${version}`);
  }
  
  // Decode components
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const encrypted = Buffer.from(encryptedB64, 'base64');
  
  // Validate lengths
  if (iv.length !== IV_LENGTH) {
    throw new Error('Invalid IV length');
  }
  
  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error('Invalid auth tag length');
  }
  
  // Create decipher
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  // Decrypt
  try {
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);
    
    return decrypted.toString('utf8');
  } catch (error) {
    // Authentication failure indicates tampering or wrong key
    throw new Error('Decryption failed: data may be corrupted or key is incorrect');
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS FOR WALLET ENCRYPTION
// ============================================================================

/**
 * Encrypt a Solana private key for storage
 * 
 * @param privateKey - Base58 encoded private key or byte array JSON
 * @param userId - User's unique identifier
 * @param serviceSalt - Service salt from Supabase Vault
 * @returns Encrypted private key string
 */
export function encryptPrivateKey(
  privateKey: string,
  userId: string,
  serviceSalt: string
): string {
  const key = deriveUserEncryptionKey(userId, serviceSalt);
  return encryptData(privateKey, key);
}

/**
 * Decrypt a stored private key
 * 
 * @param encryptedPrivateKey - Encrypted private key from encryptPrivateKey()
 * @param userId - User's unique identifier (same used for encryption)
 * @param serviceSalt - Service salt from Supabase Vault
 * @returns Decrypted private key
 */
export function decryptPrivateKey(
  encryptedPrivateKey: string,
  userId: string,
  serviceSalt: string
): string {
  const key = deriveUserEncryptionKey(userId, serviceSalt);
  return decryptData(encryptedPrivateKey, key);
}

/**
 * Encrypt a mnemonic seed phrase for storage
 * 
 * @param mnemonic - BIP39 mnemonic phrase
 * @param userId - User's unique identifier
 * @param serviceSalt - Service salt from Supabase Vault
 * @returns Encrypted mnemonic string
 */
export function encryptMnemonic(
  mnemonic: string,
  userId: string,
  serviceSalt: string
): string {
  const key = deriveUserEncryptionKey(userId, serviceSalt);
  return encryptData(mnemonic, key);
}

/**
 * Decrypt a stored mnemonic
 * 
 * @param encryptedMnemonic - Encrypted mnemonic from encryptMnemonic()
 * @param userId - User's unique identifier
 * @param serviceSalt - Service salt from Supabase Vault
 * @returns Decrypted mnemonic
 */
export function decryptMnemonic(
  encryptedMnemonic: string,
  userId: string,
  serviceSalt: string
): string {
  const key = deriveUserEncryptionKey(userId, serviceSalt);
  return decryptData(encryptedMnemonic, key);
}

// ============================================================================
// VALIDATION & UTILITIES
// ============================================================================

/**
 * Validate that encryption/decryption is working correctly
 * Call this on startup to catch configuration issues early
 * 
 * @param serviceSalt - Service salt to test with
 * @returns true if encryption is working
 */
export function validateEncryption(serviceSalt: string): boolean {
  try {
    const testUserId = 'test-user-validation';
    const testData = 'test_private_key_12345';
    
    const encrypted = encryptPrivateKey(testData, testUserId, serviceSalt);
    const decrypted = decryptPrivateKey(encrypted, testUserId, serviceSalt);
    
    return decrypted === testData;
  } catch {
    return false;
  }
}

/**
 * Check if data appears to be encrypted with our format
 * 
 * @param data - Data to check
 * @returns true if data matches encrypted format
 */
export function isEncrypted(data: string): boolean {
  if (!data || typeof data !== 'string') return false;
  
  const parts = data.split(':');
  if (parts.length !== 4) return false;
  
  const [version] = parts;
  return version === ENCRYPTION_VERSION;
}

/**
 * Generate a cryptographically secure random string
 * 
 * @param length - Number of bytes (output will be 2x length in hex)
 * @returns Random hex string
 */
export function generateSecureRandom(length: number = 32): string {
  return randomBytes(length).toString('hex');
}

/**
 * Hash data using SHA-256 (for non-reversible operations like checksums)
 * 
 * @param data - Data to hash
 * @returns 64-character hex hash
 */
export function hashData(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

