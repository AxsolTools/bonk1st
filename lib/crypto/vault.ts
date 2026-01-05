/**
 * AQUA Launchpad - Encryption Salt Management
 * Auto-managed service salt storage using Supabase table
 * 
 * The service salt is automatically generated on first use and stored
 * securely. No manual configuration required.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { generateServiceSalt, validateEncryption } from './key-manager';

// ============================================================================
// SINGLETON SERVICE SALT MANAGER
// ============================================================================

const SALT_KEY = 'encryption_salt';

// Cache the salt in memory to avoid repeated DB calls
let cachedServiceSalt: string | null = null;
let saltInitialized = false;

/**
 * Get or create the service-level encryption salt
 * 
 * This function:
 * 1. Checks memory cache first
 * 2. Tries to retrieve from system_config table
 * 3. If not found, generates new salt and stores it
 * 
 * @param supabaseAdmin - Supabase client with service role key
 * @returns Service salt string
 */
export async function getOrCreateServiceSalt(
  supabaseAdmin: SupabaseClient
): Promise<string> {
  // Return cached salt if available
  if (cachedServiceSalt && saltInitialized) {
    return cachedServiceSalt;
  }
  
  try {
    // Try to read existing salt from system_config
    const { data: existing, error: readError } = await supabaseAdmin
      .from('system_config')
      .select('value')
      .eq('key', SALT_KEY)
      .single();
    
    if (!readError && existing?.value) {
      cachedServiceSalt = existing.value;
      saltInitialized = true;
      
      // Validate encryption is working
      if (!validateEncryption(cachedServiceSalt)) {
        throw new Error('Encryption validation failed with existing salt');
      }
      
      console.log('[VAULT] Service salt loaded from database');
      return cachedServiceSalt;
    }
    
    // Salt doesn't exist - generate new one
    console.log('[VAULT] No existing salt found, generating new one...');
    const newSalt = generateServiceSalt();
    
    // Store in system_config table
    const { error: insertError } = await supabaseAdmin
      .from('system_config')
      .upsert({
        key: SALT_KEY,
        value: newSalt,
        description: 'AQUA wallet encryption salt - DO NOT DELETE'
      }, { onConflict: 'key' });
    
    if (insertError) {
      console.warn('[VAULT] Failed to store salt, using in-memory fallback:', insertError.message);
      // Even if storage fails, we can still use the salt in-memory
      // It will be regenerated on server restart, but wallets will still work within session
    }
    
    cachedServiceSalt = newSalt;
    saltInitialized = true;
    
    // Validate encryption is working with new salt
    if (!validateEncryption(cachedServiceSalt)) {
      throw new Error('Encryption validation failed with new salt');
    }
    
    console.log('[VAULT] New service salt stored in fallback storage');
    return cachedServiceSalt;
    
  } catch (error) {
    // Ultimate fallback - generate a salt and use it in memory only
    console.warn('[VAULT] Database access failed, using memory-only salt:', error);
    
    if (!cachedServiceSalt) {
      cachedServiceSalt = generateServiceSalt();
    }
    saltInitialized = true;
    
    return cachedServiceSalt;
  }
}

/**
 * Clear the cached salt (for testing purposes only)
 */
export function clearSaltCache(): void {
  cachedServiceSalt = null;
  saltInitialized = false;
}

/**
 * Check if salt is initialized
 */
export function isSaltInitialized(): boolean {
  return saltInitialized && cachedServiceSalt !== null;
}

/**
 * Get the cached salt without making a database call
 * Returns null if not initialized
 */
export function getCachedSalt(): string | null {
  return cachedServiceSalt;
}
