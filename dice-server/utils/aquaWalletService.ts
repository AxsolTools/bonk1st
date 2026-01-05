/**
 * Aqua Wallet Service
 * 
 * Reads user wallets from Aqua's Supabase database
 * Uses the same encryption scheme as the main Aqua app
 */

import { createHash, createDecipheriv, pbkdf2Sync } from 'crypto';
import { Keypair } from '@solana/web3.js';
import { supabaseAdmin } from './supabase';
import bs58 from 'bs58';

// Encryption constants (must match lib/crypto/key-manager.ts)
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const PBKDF2_ITERATIONS = 100000;
const ENCRYPTION_VERSION = 'v1';

// Cache for service salt
let cachedServiceSalt: string | null = null;

/**
 * Get the service salt from Supabase system_config table
 * (This is where Aqua stores the encryption salt)
 */
async function getServiceSalt(): Promise<string | null> {
  if (cachedServiceSalt) {
    return cachedServiceSalt;
  }
  
  if (!supabaseAdmin) {
    console.error('[AQUA_WALLET] Supabase admin client not initialized');
    return null;
  }
  
  try {
    // First try system_config (where Aqua stores it)
    const { data, error } = await supabaseAdmin
      .from('system_config')
      .select('value')
      .eq('key', 'encryption_salt')
      .single();
    
    if (!error && data?.value) {
      cachedServiceSalt = data.value;
      console.log('[AQUA_WALLET] Service salt loaded from system_config');
      return cachedServiceSalt;
    }
    
    // Fallback to vault_secrets (legacy location)
    const { data: vaultData, error: vaultError } = await supabaseAdmin
      .from('vault_secrets')
      .select('value')
      .eq('key', 'service_encryption_salt')
      .single();
    
    if (!vaultError && vaultData?.value) {
      cachedServiceSalt = vaultData.value;
      console.log('[AQUA_WALLET] Service salt loaded from vault_secrets');
      return cachedServiceSalt;
    }
    
    console.error('[AQUA_WALLET] Failed to get service salt from system_config or vault_secrets');
    return null;
  } catch (error: any) {
    console.error('[AQUA_WALLET] Error fetching service salt:', error.message);
    return null;
  }
}

/**
 * Derive user-specific encryption key using PBKDF2
 * Must match lib/crypto/key-manager.ts deriveUserEncryptionKey()
 */
function deriveUserEncryptionKey(userId: string, serviceSalt: string): Buffer {
  const material = `${userId}:${serviceSalt}:aqua-wallet-encryption`;
  
  return pbkdf2Sync(
    material,
    serviceSalt,
    PBKDF2_ITERATIONS,
    KEY_LENGTH,
    'sha256'
  );
}

/**
 * Decrypt data encrypted with Aqua's encryptData()
 */
function decryptData(encryptedData: string, key: Buffer): string {
  if (!encryptedData || typeof encryptedData !== 'string') {
    throw new Error('Encrypted data must be a non-empty string');
  }
  
  const parts = encryptedData.split(':');
  
  if (parts.length !== 4) {
    throw new Error('Invalid encrypted data format');
  }
  
  const [version, ivB64, authTagB64, encryptedB64] = parts;
  
  if (version !== ENCRYPTION_VERSION) {
    throw new Error(`Unsupported encryption version: ${version}`);
  }
  
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const encrypted = Buffer.from(encryptedB64, 'base64');
  
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]);
  
  return decrypted.toString('utf8');
}

/**
 * Get user's keypair from Aqua's Supabase wallets table
 */
export async function getAquaUserKeypair(walletAddress: string): Promise<Keypair | null> {
  if (!supabaseAdmin) {
    console.error('[AQUA_WALLET] Supabase admin client not initialized');
    return null;
  }
  
  try {
    // Get the wallet from Supabase
    const { data: wallet, error } = await supabaseAdmin
      .from('wallets')
      .select('id, user_id, session_id, public_key, encrypted_private_key')
      .eq('public_key', walletAddress)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error || !wallet) {
      console.error(`[AQUA_WALLET] No wallet found for ${walletAddress}:`, error?.message);
      return null;
    }
    
    if (!wallet.encrypted_private_key) {
      console.error(`[AQUA_WALLET] Wallet ${walletAddress} has no encrypted private key`);
      return null;
    }
    
    // Get service salt
    const serviceSalt = await getServiceSalt();
    if (!serviceSalt) {
      console.error('[AQUA_WALLET] Could not get service salt');
      return null;
    }
    
    // Derive the encryption key - use session_id if user_id is null
    // Aqua uses session_id for key derivation when user is not logged in
    const keyId = wallet.user_id || wallet.session_id;
    if (!keyId) {
      console.error(`[AQUA_WALLET] Wallet ${walletAddress} has no user_id or session_id`);
      return null;
    }
    
    console.log(`[AQUA_WALLET] Deriving key for wallet ${walletAddress} using keyId: ${keyId.substring(0, 8)}...`);
    const encryptionKey = deriveUserEncryptionKey(keyId, serviceSalt);
    
    // Decrypt the private key
    let decryptedKey: string;
    try {
      decryptedKey = decryptData(wallet.encrypted_private_key, encryptionKey);
    } catch (decryptError: any) {
      console.error(`[AQUA_WALLET] Failed to decrypt private key for ${walletAddress}:`, decryptError.message);
      return null;
    }
    
    // Parse the decrypted key
    // Try as base58 first, then as JSON array
    try {
      const decoded = bs58.decode(decryptedKey);
      console.log(`[AQUA_WALLET] Successfully loaded keypair for ${walletAddress} (base58)`);
      return Keypair.fromSecretKey(decoded);
    } catch {
      try {
        const parsed = JSON.parse(decryptedKey);
        if (Array.isArray(parsed)) {
          console.log(`[AQUA_WALLET] Successfully loaded keypair for ${walletAddress} (JSON array)`);
          return Keypair.fromSecretKey(Uint8Array.from(parsed));
        }
      } catch {
        // Not JSON array
      }
    }
    
    console.error(`[AQUA_WALLET] Failed to parse decrypted private key for ${walletAddress}`);
    return null;
  } catch (error: any) {
    console.error(`[AQUA_WALLET] Error getting keypair for ${walletAddress}:`, error.message);
    return null;
  }
}

/**
 * Check if a wallet is registered in Aqua's Supabase
 */
export async function isWalletRegisteredInAqua(walletAddress: string): Promise<boolean> {
  if (!supabaseAdmin) {
    return false;
  }
  
  try {
    const { data, error } = await supabaseAdmin
      .from('wallets')
      .select('id')
      .eq('public_key', walletAddress)
      .single();
    
    return !error && !!data;
  } catch {
    return false;
  }
}

