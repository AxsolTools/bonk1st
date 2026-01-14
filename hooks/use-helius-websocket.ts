"use client"

import { useState, useEffect, useCallback, useRef } from 'react'

/**
 * React hook for WebSocket subscriptions (Solana RPC)
 * Provides real-time updates for account changes, logs, and more
 * 
 * Benefits over polling:
 * - Instant updates (no 5-10 second delays)
 * - Lower credit usage
 * - Better user experience
 */

// Types
interface WebSocketState {
  isConnected: boolean
  isConnecting: boolean
  error: string | null
  subscriptionCount: number
}

interface AccountUpdate {
  lamports: number
  data: unknown
  owner: string
  executable: boolean
  rentEpoch: number
  slot: number
}

interface LogsUpdate {
  signature: string
  err: unknown | null
  logs: string[]
  slot: number
}

type MessageHandler<T> = (data: T) => void

// WebSocket singleton for client-side
let wsInstance: WebSocket | null = null
type SubscriptionTemplate = {
  method: string
  params: unknown[]
  handler: (data: unknown) => void
  unsubscribeMethod: string
  subscriptionId: number | null
}

// We track subscriptions by a stable template id so we can re-subscribe on reconnect.
let subscriptionTemplates = new Map<number, SubscriptionTemplate>()
let templateIdBySubscriptionId = new Map<number, number>()
let templateIdCounter = 1
let pendingRequests = new Map<number, { resolve: (id: number) => void; reject: (err: Error) => void }>()
let requestIdCounter = 1
let pingInterval: ReturnType<typeof setInterval> | null = null
let reconnectAttempts = 0
let stateListeners = new Set<(state: WebSocketState) => void>()

function getWsState(): WebSocketState {
  return {
    isConnected: wsInstance?.readyState === WebSocket.OPEN,
    isConnecting: wsInstance?.readyState === WebSocket.CONNECTING,
    error: null,
    subscriptionCount: subscriptionTemplates.size,
  }
}

function notifyStateChange() {
  const state = getWsState()
  stateListeners.forEach(listener => listener(state))
}

function getWsApiKey(): string | null {
  // In client-side, we need the public key
  return process.env.NEXT_PUBLIC_HELIUS_API_KEY || null
}

async function ensureConnection(): Promise<void> {
  if (wsInstance?.readyState === WebSocket.OPEN) return
  if (wsInstance?.readyState === WebSocket.CONNECTING) {
    // Wait for connection
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Connection timeout')), 10000)
      const checkInterval = setInterval(() => {
        if (wsInstance?.readyState === WebSocket.OPEN) {
          clearInterval(checkInterval)
          clearTimeout(timeout)
          resolve()
        }
      }, 100)
    })
  }

  const apiKey = getWsApiKey()
  if (!apiKey) {
    throw new Error('WebSocket API key not configured')
  }

  return new Promise((resolve, reject) => {
    const wsUrl = `wss://mainnet.helius-rpc.com/?api-key=${apiKey}`
    wsInstance = new WebSocket(wsUrl)

    wsInstance.onopen = () => {
      console.log('[WS] Connected')
      reconnectAttempts = 0
      notifyStateChange()
      startPingInterval()
      resubscribeAll()
      resolve()
    }

    wsInstance.onmessage = (event) => {
      handleMessage(event.data)
    }

    wsInstance.onerror = (event) => {
      // WebSocket error events don't contain useful info - the close event has the code
      console.warn('[WS] Connection error occurred (details in close event)')
      notifyStateChange()
    }

    wsInstance.onclose = (event) => {
      const codeDescriptions: Record<number, string> = {
        1000: 'Normal closure',
        1001: 'Going away',
        1002: 'Protocol error',
        1003: 'Unsupported data',
        1006: 'Abnormal closure (network issue or server disconnect)',
        1007: 'Invalid data',
        1008: 'Policy violation',
        1009: 'Message too big',
        1011: 'Server error',
        1015: 'TLS handshake failed',
      }
      const description = codeDescriptions[event.code] || 'Unknown'
      console.log(`[WS] Disconnected: ${event.code} (${description})${event.reason ? ` - ${event.reason}` : ''}`)
      stopPingInterval()
      notifyStateChange()
      
      // Attempt reconnection for non-normal closures
      if (event.code !== 1000 && reconnectAttempts < 5) {
        reconnectAttempts++
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000)
        console.log(`[WS] Reconnecting in ${delay / 1000}s (attempt ${reconnectAttempts}/5)...`)
        setTimeout(() => {
          ensureConnection().catch(console.error)
        }, delay)
      }
    }

    setTimeout(() => {
      if (wsInstance?.readyState !== WebSocket.OPEN) {
        reject(new Error('Connection timeout'))
      }
    }, 10000)
  })
}

function handleMessage(data: string) {
  try {
    const message = JSON.parse(data)

    // Handle subscription confirmation (result is a subscription ID)
    if (message.id && typeof message.result === 'number') {
      const pending = pendingRequests.get(message.id)
      if (pending) {
        pendingRequests.delete(message.id)
        pending.resolve(message.result)
      }
      // If no pending request, this might be a ping response (getSlot) - ignore it
      return
    }
    
    // Handle other successful responses (like getSlot ping) - just ignore
    if (message.id && message.result !== undefined) {
      return
    }

    // Handle notifications
    if (message.method?.endsWith('Notification')) {
      const subscriptionId = message.params?.subscription
      const templateId = templateIdBySubscriptionId.get(subscriptionId)
      if (templateId !== undefined) {
        const tpl = subscriptionTemplates.get(templateId)
        tpl?.handler(message.params?.result)
      }
    }

    // Handle errors
    if (message.error) {
      console.error('[WS] Error:', message.error)
      const pending = message.id ? pendingRequests.get(message.id) : null
      if (pending) {
        pendingRequests.delete(message.id)
        pending.reject(new Error(message.error.message))
      }
    }
  } catch (error) {
    console.error('[WS] Parse error:', error)
  }
}

function startPingInterval() {
  if (pingInterval) return
  // Use getSlot instead of getHealth - it's a valid WebSocket RPC method
  // This keeps the connection alive and verifies it's working
  pingInterval = setInterval(() => {
    if (wsInstance?.readyState === WebSocket.OPEN) {
      wsInstance.send(JSON.stringify({
        jsonrpc: '2.0',
        id: requestIdCounter++,
        method: 'getSlot',
        params: [],
      }))
    }
  }, 30000)
}

function stopPingInterval() {
  if (pingInterval) {
    clearInterval(pingInterval)
    pingInterval = null
  }
}

function resubscribeAll() {
  // Clear server subscription id mapping (ids are invalid after reconnect)
  templateIdBySubscriptionId.clear()

  // Re-subscribe all templates
  for (const [templateId, tpl] of subscriptionTemplates.entries()) {
    // Mark as not subscribed yet; a new server id will be assigned.
    tpl.subscriptionId = null
    // Fire and forget; hooks already have polling fallbacks.
    subscribeTemplate(templateId).catch(() => {
      // Silent: ensureConnection already logs failures
    })
  }
}

function createSubscriptionTemplate(
  method: string,
  unsubscribeMethod: string,
  params: unknown[],
  handler: (data: unknown) => void
): number {
  const templateId = templateIdCounter++
  subscriptionTemplates.set(templateId, {
    method,
    params,
    handler,
    unsubscribeMethod,
    subscriptionId: null,
  })
  notifyStateChange()
  return templateId
}

async function subscribeTemplate(templateId: number): Promise<number> {
  await ensureConnection()

  const tpl = subscriptionTemplates.get(templateId)
  if (!tpl) throw new Error('Unknown subscription template')

  const requestId = requestIdCounter++

  return new Promise((resolve, reject) => {
    pendingRequests.set(requestId, {
      resolve: (subscriptionId) => {
        // If the subscription was cancelled before the server responded, clean up immediately.
        if (!subscriptionTemplates.has(templateId)) {
          if (wsInstance?.readyState === WebSocket.OPEN) {
            wsInstance.send(JSON.stringify({
              jsonrpc: '2.0',
              id: requestIdCounter++,
              method: tpl.unsubscribeMethod,
              params: [subscriptionId],
            }))
          }
          return resolve(subscriptionId)
        }

        tpl.subscriptionId = subscriptionId
        templateIdBySubscriptionId.set(subscriptionId, templateId)
        notifyStateChange()
        resolve(subscriptionId)
      },
      reject,
    })

    wsInstance!.send(JSON.stringify({
      jsonrpc: '2.0',
      id: requestId,
      method: tpl.method,
      params: tpl.params,
    }))

    setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        pendingRequests.delete(requestId)
        reject(new Error('Subscription timeout'))
      }
    }, 10000)
  })
}

function unsubscribeTemplate(templateId: number) {
  const tpl = subscriptionTemplates.get(templateId)
  if (!tpl) return

  const subscriptionId = tpl.subscriptionId
  if (subscriptionId != null) {
    templateIdBySubscriptionId.delete(subscriptionId)
    if (wsInstance?.readyState === WebSocket.OPEN) {
      wsInstance.send(JSON.stringify({
        jsonrpc: '2.0',
        id: requestIdCounter++,
        method: tpl.unsubscribeMethod,
        params: [subscriptionId],
      }))
    }
  }

  subscriptionTemplates.delete(templateId)
  notifyStateChange()
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Hook to get WebSocket connection state
 */
export function useWebSocketState(): WebSocketState {
  const [state, setState] = useState<WebSocketState>(getWsState)

  useEffect(() => {
    stateListeners.add(setState)
    return () => {
      stateListeners.delete(setState)
    }
  }, [])

  return state
}

/**
 * Hook to subscribe to account changes
 * 
 * @param pubkey - Account public key to monitor
 * @param onUpdate - Callback for updates
 * @param options - Subscription options
 * 
 * @example
 * useAccountSubscription(tokenMint, (update) => {
 *   console.log('Account changed:', update.lamports)
 * })
 */
export function useAccountSubscription(
  pubkey: string | null,
  onUpdate: MessageHandler<AccountUpdate>,
  options: { encoding?: string; commitment?: string } = {}
) {
  const templateIdRef = useRef<number | null>(null)
  const handlerRef = useRef(onUpdate)
  handlerRef.current = onUpdate

  useEffect(() => {
    if (!pubkey) return

    let mounted = true

    const setupSubscription = async () => {
      try {
        const templateId = createSubscriptionTemplate(
          'accountSubscribe',
          'accountUnsubscribe',
          [
            pubkey,
            {
              encoding: options.encoding || 'jsonParsed',
              commitment: options.commitment || 'confirmed',
            },
          ],
          (data) => {
            if (mounted) handlerRef.current(data as AccountUpdate)
          }
        )

        if (mounted) {
          templateIdRef.current = templateId
          await subscribeTemplate(templateId)
        } else {
          unsubscribeTemplate(templateId)
        }
      } catch (error) {
        console.error('[useAccountSubscription] Failed:', error)
      }
    }

    setupSubscription()

    return () => {
      mounted = false
      if (templateIdRef.current !== null) {
        unsubscribeTemplate(templateIdRef.current)
        templateIdRef.current = null
      }
    }
  }, [pubkey, options.encoding, options.commitment])
}

/**
 * Hook to subscribe to transaction logs for an address
 * Great for monitoring swaps/trades on a token
 * 
 * @param pubkey - Address to monitor logs for
 * @param onUpdate - Callback for log updates
 * 
 * @example
 * useLogsSubscription(tokenMint, (logs) => {
 *   console.log('New transaction:', logs.signature)
 * })
 */
export function useLogsSubscription(
  pubkey: string | null,
  onUpdate: MessageHandler<LogsUpdate>,
  options: { commitment?: string } = {}
) {
  const templateIdRef = useRef<number | null>(null)
  const handlerRef = useRef(onUpdate)
  handlerRef.current = onUpdate

  useEffect(() => {
    if (!pubkey) return

    let mounted = true

    const setupSubscription = async () => {
      try {
        const templateId = createSubscriptionTemplate(
          'logsSubscribe',
          'logsUnsubscribe',
          [
            { mentions: [pubkey] },
            { commitment: options.commitment || 'confirmed' },
          ],
          (data) => {
            if (mounted) handlerRef.current(data as LogsUpdate)
          }
        )

        if (mounted) {
          templateIdRef.current = templateId
          await subscribeTemplate(templateId)
        } else {
          unsubscribeTemplate(templateId)
        }
      } catch (error) {
        console.error('[useLogsSubscription] Failed:', error)
      }
    }

    setupSubscription()

    return () => {
      mounted = false
      if (templateIdRef.current !== null) {
        unsubscribeTemplate(templateIdRef.current)
        templateIdRef.current = null
      }
    }
  }, [pubkey, options.commitment])
}

/**
 * Hook to track a specific transaction signature
 * 
 * @param signature - Transaction signature to monitor
 * @param onConfirmed - Callback when transaction is confirmed
 */
export function useSignatureSubscription(
  signature: string | null,
  onConfirmed: (result: { err: unknown | null }) => void,
  options: { commitment?: string } = {}
) {
  const templateIdRef = useRef<number | null>(null)
  const handlerRef = useRef(onConfirmed)
  handlerRef.current = onConfirmed

  useEffect(() => {
    if (!signature) return

    let mounted = true

    const setupSubscription = async () => {
      try {
        const templateId = createSubscriptionTemplate(
          'signatureSubscribe',
          'signatureUnsubscribe',
          [
            signature,
            { commitment: options.commitment || 'confirmed' },
          ],
          (data) => {
            if (mounted) {
              handlerRef.current(data as { err: unknown | null })
              // Signature subscriptions auto-remove after confirmation (best-effort)
              if (templateIdRef.current != null) {
                unsubscribeTemplate(templateIdRef.current)
                templateIdRef.current = null
              }
            }
          }
        )

        if (mounted) {
          templateIdRef.current = templateId
          await subscribeTemplate(templateId)
        } else {
          unsubscribeTemplate(templateId)
        }
      } catch (error) {
        console.error('[useSignatureSubscription] Failed:', error)
      }
    }

    setupSubscription()

    return () => {
      mounted = false
      if (templateIdRef.current !== null) {
        unsubscribeTemplate(templateIdRef.current)
        templateIdRef.current = null
      }
    }
  }, [signature, options.commitment])
}

/**
 * Hook to manually connect the WebSocket
 * Useful if you want to pre-warm the connection
 */
export function useWebSocketConnect() {
  const connect = useCallback(async () => {
    try {
      await ensureConnection()
      return true
    } catch (error) {
      console.error('[useWebSocketConnect] Failed:', error)
      return false
    }
  }, [])

  const disconnect = useCallback(() => {
    if (wsInstance) {
      wsInstance.close(1000, 'Manual disconnect')
      wsInstance = null
    }
  }, [])

  return { connect, disconnect }
}

export type { WebSocketState, AccountUpdate, LogsUpdate }

