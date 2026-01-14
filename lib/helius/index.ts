/**
 * Helius API Integration
 * Centralized exports for all Helius-related functionality
 * 
 * Available APIs:
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
 * Initialize Helius services
 * Call this on app startup to set up WebSocket connections
 */
export async function initializeHelius(): Promise<void> {
  const apiKey = process.env.HELIUS_API_KEY || process.env.NEXT_PUBLIC_HELIUS_API_KEY
  
  if (!apiKey) {
    console.warn('[HELIUS] No API key configured, some features will be disabled')
    return
  }

  // WebSocket is initialized on-demand when first subscription is made
  // This is intentional to avoid unnecessary connections
  
  console.log('[HELIUS] Services initialized')
}

/**
 * Get the Helius RPC URL for standard RPC calls
 */
export function getHeliusRpcUrl(): string | null {
  const apiKey = process.env.HELIUS_API_KEY || process.env.NEXT_PUBLIC_HELIUS_API_KEY
  if (!apiKey) return null
  return `https://mainnet.helius-rpc.com/?api-key=${apiKey}`
}

/**
 * Get the Helius WebSocket URL
 */
export function getHeliusWsUrl(): string | null {
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

