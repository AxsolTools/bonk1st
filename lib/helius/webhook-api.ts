/**
 * Helius Webhook Management API
 * Programmatically create, update, and delete webhooks
 * 
 * Use these functions to:
 * - Dynamically create webhooks for new tokens
 * - Update webhook addresses when tracking new tokens
 * - Clean up webhooks when tokens are no longer tracked
 */

const HELIUS_API_KEY = process.env.HELIUS_API_KEY

interface WebhookConfig {
  webhookURL: string
  transactionTypes: TransactionType[]
  accountAddresses?: string[]
  webhookType?: 'enhanced' | 'raw' | 'discord'
  txnStatus?: 'all' | 'success' | 'failed'
  encoding?: 'jsonParsed' | 'base58' | 'base64'
}

interface Webhook {
  webhookID: string
  wallet: string
  webhookURL: string
  transactionTypes: TransactionType[]
  accountAddresses: string[]
  webhookType: string
  authHeader?: string
}

type TransactionType = 
  | 'SWAP'
  | 'TRANSFER'
  | 'NFT_SALE'
  | 'NFT_LISTING'
  | 'NFT_CANCEL_LISTING'
  | 'NFT_BID'
  | 'NFT_CANCEL_BID'
  | 'NFT_MINT'
  | 'TOKEN_MINT'
  | 'BURN'
  | 'BURN_NFT'
  | 'STAKE_TOKEN'
  | 'UNSTAKE_TOKEN'
  | 'CREATE_ACCOUNT'
  | 'CLOSE_ACCOUNT'

const WEBHOOK_API_BASE = 'https://api.helius.xyz/v0/webhooks'

/**
 * Create a new webhook
 * 
 * @param config - Webhook configuration
 * @returns Created webhook details
 * 
 * @example
 * const webhook = await createWebhook({
 *   webhookURL: 'https://myapp.com/api/webhooks/helius',
 *   transactionTypes: ['SWAP', 'TRANSFER'],
 *   accountAddresses: ['TokenMintAddress123...'],
 * })
 */
export async function createWebhook(config: WebhookConfig): Promise<Webhook | null> {
  const apiKey = HELIUS_API_KEY
  if (!apiKey) {
    console.warn('[WEBHOOK-API] No Helius API key configured')
    return null
  }

  try {
    const response = await fetch(`${WEBHOOK_API_BASE}?api-key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        webhookURL: config.webhookURL,
        transactionTypes: config.transactionTypes,
        accountAddresses: config.accountAddresses || [],
        webhookType: config.webhookType || 'enhanced',
        txnStatus: config.txnStatus || 'success',
        encoding: config.encoding || 'jsonParsed',
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('[WEBHOOK-API] Create failed:', error)
      return null
    }

    const webhook: Webhook = await response.json()
    console.log('[WEBHOOK-API] Created webhook:', webhook.webhookID)
    return webhook
  } catch (error) {
    console.error('[WEBHOOK-API] Create error:', error)
    return null
  }
}

/**
 * List all webhooks for your account
 * 
 * @returns Array of webhook configurations
 */
export async function listWebhooks(): Promise<Webhook[]> {
  const apiKey = HELIUS_API_KEY
  if (!apiKey) {
    return []
  }

  try {
    const response = await fetch(`${WEBHOOK_API_BASE}?api-key=${apiKey}`)

    if (!response.ok) {
      return []
    }

    const webhooks: Webhook[] = await response.json()
    return webhooks
  } catch (error) {
    console.error('[WEBHOOK-API] List error:', error)
    return []
  }
}

/**
 * Update an existing webhook
 * 
 * @param webhookId - ID of webhook to update
 * @param config - New configuration (partial update supported)
 * @returns Updated webhook details
 * 
 * @example
 * // Add new addresses to track
 * await updateWebhook('webhook-123', {
 *   accountAddresses: [...existingAddresses, 'NewTokenAddress...'],
 * })
 */
export async function updateWebhook(
  webhookId: string,
  config: Partial<WebhookConfig>
): Promise<Webhook | null> {
  const apiKey = HELIUS_API_KEY
  if (!apiKey) {
    return null
  }

  try {
    const response = await fetch(`${WEBHOOK_API_BASE}/${webhookId}?api-key=${apiKey}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('[WEBHOOK-API] Update failed:', error)
      return null
    }

    const webhook: Webhook = await response.json()
    console.log('[WEBHOOK-API] Updated webhook:', webhook.webhookID)
    return webhook
  } catch (error) {
    console.error('[WEBHOOK-API] Update error:', error)
    return null
  }
}

/**
 * Delete a webhook
 * 
 * @param webhookId - ID of webhook to delete
 * @returns Success status
 */
export async function deleteWebhook(webhookId: string): Promise<boolean> {
  const apiKey = HELIUS_API_KEY
  if (!apiKey) {
    return false
  }

  try {
    const response = await fetch(`${WEBHOOK_API_BASE}/${webhookId}?api-key=${apiKey}`, {
      method: 'DELETE',
    })

    if (response.ok) {
      console.log('[WEBHOOK-API] Deleted webhook:', webhookId)
      return true
    }

    return false
  } catch (error) {
    console.error('[WEBHOOK-API] Delete error:', error)
    return false
  }
}

/**
 * Add addresses to an existing webhook
 * Helper function to append addresses without replacing existing ones
 * 
 * @param webhookId - Webhook ID
 * @param newAddresses - Addresses to add
 */
export async function addAddressesToWebhook(
  webhookId: string,
  newAddresses: string[]
): Promise<boolean> {
  // First get current webhook
  const webhooks = await listWebhooks()
  const webhook = webhooks.find(w => w.webhookID === webhookId)
  
  if (!webhook) {
    console.error('[WEBHOOK-API] Webhook not found:', webhookId)
    return false
  }

  // Merge addresses (dedupe)
  const allAddresses = [...new Set([...webhook.accountAddresses, ...newAddresses])]

  const result = await updateWebhook(webhookId, {
    accountAddresses: allAddresses,
  })

  return result !== null
}

/**
 * Remove addresses from a webhook
 * 
 * @param webhookId - Webhook ID
 * @param addressesToRemove - Addresses to remove
 */
export async function removeAddressesFromWebhook(
  webhookId: string,
  addressesToRemove: string[]
): Promise<boolean> {
  const webhooks = await listWebhooks()
  const webhook = webhooks.find(w => w.webhookID === webhookId)
  
  if (!webhook) {
    return false
  }

  const removeSet = new Set(addressesToRemove)
  const filteredAddresses = webhook.accountAddresses.filter(a => !removeSet.has(a))

  const result = await updateWebhook(webhookId, {
    accountAddresses: filteredAddresses,
  })

  return result !== null
}

export type { Webhook, WebhookConfig, TransactionType }

