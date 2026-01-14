/**
 * Server-side initialization script
 * 
 * This module initializes server-side services on app startup.
 * Import this in API routes or server components to ensure services are ready.
 */

let initialized = false

export async function initializeServerServices(): Promise<void> {
  if (initialized) {
    return
  }

  console.log('[SERVER-INIT] Initializing server services...')

  try {
    // Initialize Helius RPC rotator with all available API keys
    const { initializeHelius } = await import('./helius')
    await initializeHelius()

    initialized = true
    console.log('[SERVER-INIT] ✓ All services initialized successfully')
  } catch (error) {
    console.error('[SERVER-INIT] ✗ Failed to initialize services:', error)
    // Don't throw - let the app start even if initialization fails
  }
}

/**
 * Check if server services are initialized
 */
export function isServerInitialized(): boolean {
  return initialized
}

/**
 * Force re-initialization (useful for testing or config changes)
 */
export function resetServerInitialization(): void {
  initialized = false
}

// Auto-initialize on module load (server-side only)
if (typeof window === 'undefined') {
  initializeServerServices().catch(err => {
    console.error('[SERVER-INIT] Auto-initialization failed:', err)
  })
}
