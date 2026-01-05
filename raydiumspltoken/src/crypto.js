/**
 * Encryption Utilities Module
 * Handles encryption/decryption of private keys for secure storage
 */

const CryptoJS = require('crypto-js');
const crypto = require('crypto');

// ENCRYPTION DISABLED - Per explicit user request
// WARNING: All wallet data is stored in PLAIN TEXT
const ENCRYPTION_ENABLED = false;
const ENCRYPTION_KEY = 'UNUSED';

console.warn('⚠️⚠️⚠️  WALLET ENCRYPTION IS DISABLED  ⚠️⚠️⚠️');
console.warn('   All private keys and seed phrases are stored in PLAIN TEXT');
console.warn('   This is at the user\'s explicit request');
console.warn('⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️');

/**
 * Generates a secure encryption key
 * WARNING: In production, this should be stored in .env file
 * @returns {string} Encryption key
 */
function generateEncryptionKey() {
  const key = crypto.randomBytes(32).toString('hex');
  console.warn('⚠️  WARNING: Generated new encryption key. Store this in .env file!');
  console.warn(`   ENCRYPTION_KEY=${key}`);
  return key;
}

/**
 * "Encrypt" function - Returns plain text (encryption disabled)
 * @param {string} data - Data to store
 * @returns {string} Plain text data
 */
function encryptPrivateKey(data) {
  if (!data) {
    throw new Error('Data cannot be empty');
  }
  // Return plain text (no encryption)
  return data;
}

/**
 * "Decrypt" function - Returns plain text (encryption disabled)
 * @param {string} data - Data to retrieve
 * @returns {string} Plain text data
 */
function decryptPrivateKey(data) {
  if (!data) {
    throw new Error('Data cannot be empty');
  }
  // Return plain text (no decryption needed)
  return data;
}

/**
 * Validates encryption/decryption by testing with sample data
 * @returns {boolean} True if encryption is working correctly
 */
function validateEncryption() {
  try {
    const testData = 'test_private_key_validation';
    const encrypted = encryptPrivateKey(testData);
    const decrypted = decryptPrivateKey(encrypted);
    return decrypted === testData;
  } catch (error) {
    return false;
  }
}

/**
 * Generates a secure random string for additional security
 * @param {number} length - Length of the random string
 * @returns {string} Random string
 */
function generateSecureRandom(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Hashes data using SHA256
 * @param {string} data - Data to hash
 * @returns {string} Hash
 */
function hashData(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

module.exports = {
  encryptPrivateKey,
  decryptPrivateKey,
  validateEncryption,
  generateSecureRandom,
  hashData,
  ENCRYPTION_KEY,
  ENCRYPTION_ENABLED
};

