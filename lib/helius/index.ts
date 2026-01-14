/**
 * Helius API Integration
 * Centralized exports for all Helius-related functionality
 * 
 * Available APIs:
 * - RPC Rotator: Automatic load balancing across multiple API keys
 * - WebSocket Manager: Real-time subscriptions (accountSubscribe, logsSubscribe, etc.)
 * - DAS API: Token metadata, asset search, token accounts
 * - Priority Fee API: Optimal transaction fees
 * - Webhooks: Configured separately via /api/webhooks/helius
 * 
 * Credit Costs Summary (Developer Plan):
 * - Standard RPC: 1 credit/call, 50 req/s
 * - DAS API: 10 credits/call, 10 req/s
 * - Enhanced Transactions: 100 credits/call, 10 req/s
 * - Priority Fee: 1 credit/call, 50 req/s
 * - WebSockets: Included, 150 connections
 * - Webhooks: 1 credit/event, 50 webhooks max
 */

// RPC Rotator for load balancing
export {
  initializeRpcRotator,
  getNextRpcUrl,
  getNextWsUrl,
  recordRequestOutcome,
  getRpcStats,
  isRotatorInitialized,
  type RpcEndpoint,
} from './rpc-rotator'

// Configuration
export {
  loadHeliusApiKeys,
  getApiKeysString,
  getHeliusConfig,
} from './config'

// WebSocket Manager
export {
  getHeliusWebSocket,
  HeliusWebSocketManager,
  type MessageHandler,
  type Subscription,
} from './websocket-manager'

// DAS API
export {
  getAsset,
  getAssetBatch,
  getTokenAccounts,
  searchAssets,
  type TokenMetadata,
  type TokenAccount,
  type DASAsset,
} from './das-api'

// Priority Fee API
export {
  getPriorityFeeEstimate,
  getSwapPriorityFee,
  getTransferPriorityFee,
  calculateComputeUnitPrice,
  getAllPriorityFeeLevels,
  type PriorityFeeEstimate,
  type PriorityFeeOptions,
} from './priority-fee'

// Webhook management helpers
export { createWebhook, deleteWebhook, listWebhooks, updateWebhook } from './webhook-api'

/**
 * Initialize Helius services with RPC rotation
 * Call this on app startup to set up load balancing
 */
export async function initializeHelius(): Promise<void> {
  const { loadHeliusApiKeys } = await import('./config')
  const { initializeRpcRotator } = await import('./rpc-rotator')
  
  const apiKeys = loadHeliusApiKeys()
  
  if (apiKeys.length === 0) {
    console.warn('[HELIUS] No API keys configured, some features will be disabled')
    return
  }

  // Initialize RPC rotator with all available keys
  initializeRpcRotator(apiKeys)
  
  console.log(`[HELIUS] Services initialized with ${apiKeys.length} API key(s)`)
  console.log(`[HELIUS] Estimated rate limit: ${apiKeys.length * 2500} req/min`)
}

/**
 * Get the Helius RPC URL for standard RPC calls
 * Now uses rotation if available
 */
export function getHeliusRpcUrl(): string | null {
  const { getNextRpcUrl, isRotatorInitialized } = require('./rpc-rotator')
  
  if (isRotatorInitialized()) {
    return getNextRpcUrl()
  }
  
  // Fallback to single key
  const apiKey = process.env.HELIUS_API_KEY || process.env.NEXT_PUBLIC_HELIUS_API_KEY
  if (!apiKey) return null
  return `https://mainnet.helius-rpc.com/?api-key=${apiKey}`
}

/**
 * Get the Helius WebSocket URL
 * Now uses rotation if available
 */
export function getHeliusWsUrl(): string | null {
  const { getNextWsUrl, isRotatorInitialized } = require('./rpc-rotator')
  
  if (isRotatorInitialized()) {
    return getNextWsUrl()
  }
  
  // Fallback to single key
  const apiKey = process.env.HELIUS_API_KEY || process.env.NEXT_PUBLIC_HELIUS_API_KEY
  if (!apiKey) return null
  return `wss://mainnet.helius-rpc.com/?api-key=${apiKey}`
}

/**
 * Check if Helius is configured
 */
export function isHeliusConfigured(): boolean {
  return !!(process.env.HELIUS_API_KEY || process.env.NEXT_PUBLIC_HELIUS_API_KEY)
}

