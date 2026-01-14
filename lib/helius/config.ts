/**
 * Helius Configuration
 * Centralized configuration for all Helius API keys and endpoints
 */

/**
 * Load all Helius API keys from environment
 * Supports multiple keys for rotation: HELIUS_API_KEY_1, HELIUS_API_KEY_2, etc.
 */
export function loadHeliusApiKeys(): string[] {
  const keys: string[] = []

  // Primary key (backward compatibility)
  const primaryKey = process.env.HELIUS_API_KEY || process.env.NEXT_PUBLIC_HELIUS_API_KEY
  if (primaryKey) {
    keys.push(primaryKey)
  }

  // Additional keys for rotation (server-side only for security)
  for (let i = 1; i <= 10; i++) {
    const key = process.env[`HELIUS_API_KEY_${i}`]
    if (key && !keys.includes(key)) {
      keys.push(key)
    }
  }

  return keys
}

/**
 * Get Helius API keys as comma-separated string for .env
 */
export function getApiKeysString(): string {
  return loadHeliusApiKeys().join(',')
}

/**
 * Configuration summary
 */
export function getHeliusConfig() {
  const keys = loadHeliusApiKeys()
  
  return {
    totalKeys: keys.length,
    hasRotation: keys.length > 1,
    estimatedRateLimit: keys.length * 2500, // 2500 req/min per key (conservative)
    keys: keys.map(k => ({
      preview: `${k.slice(0, 8)}...${k.slice(-4)}`,
      length: k.length,
    })),
  }
}
