"use client"

import { useState, useEffect, useCallback, useRef } from 'react'

/**
 * React hook for Helius WebSocket subscriptions
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
let subscriptions = new Map<number, { method: string; handler: (data: unknown) => void }>()
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
    subscriptionCount: subscriptions.size,
  }
}

function notifyStateChange() {
  const state = getWsState()
  stateListeners.forEach(listener => listener(state))
}

function getHeliusApiKey(): string | null {
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

  const apiKey = getHeliusApiKey()
  if (!apiKey) {
    throw new Error('Helius API key not configured')
  }

  return new Promise((resolve, reject) => {
    const wsUrl = `wss://mainnet.helius-rpc.com/?api-key=${apiKey}`
    wsInstance = new WebSocket(wsUrl)

    wsInstance.onopen = () => {
      console.log('[HELIUS-WS] Connected')
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
      console.warn('[HELIUS-WS] Connection error occurred (details in close event)')
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
      console.log(`[HELIUS-WS] Disconnected: ${event.code} (${description})${event.reason ? ` - ${event.reason}` : ''}`)
      stopPingInterval()
      notifyStateChange()
      
      // Attempt reconnection for non-normal closures
      if (event.code !== 1000 && reconnectAttempts < 5) {
        reconnectAttempts++
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000)
        console.log(`[HELIUS-WS] Reconnecting in ${delay / 1000}s (attempt ${reconnectAttempts}/5)...`)
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
      const sub = subscriptions.get(subscriptionId)
      if (sub) {
        sub.handler(message.params?.result)
      }
    }

    // Handle errors
    if (message.error) {
      console.error('[HELIUS-WS] Error:', message.error)
      const pending = message.id ? pendingRequests.get(message.id) : null
      if (pending) {
        pendingRequests.delete(message.id)
        pending.reject(new Error(message.error.message))
      }
    }
  } catch (error) {
    console.error('[HELIUS-WS] Parse error:', error)
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
  const existingSubs = Array.from(subscriptions.entries())
  subscriptions.clear()
  
  for (const [, sub] of existingSubs) {
    // Re-subscribe (simplified - in production you'd store params)
    console.log('[HELIUS-WS] Resubscribing:', sub.method)
  }
}

async function subscribe(
  method: string,
  params: unknown[],
  handler: (data: unknown) => void
): Promise<number> {
  await ensureConnection()

  const requestId = requestIdCounter++

  return new Promise((resolve, reject) => {
    pendingRequests.set(requestId, {
      resolve: (subscriptionId) => {
        subscriptions.set(subscriptionId, { method, handler })
        notifyStateChange()
        resolve(subscriptionId)
      },
      reject,
    })

    wsInstance!.send(JSON.stringify({
      jsonrpc: '2.0',
      id: requestId,
      method,
      params,
    }))

    setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        pendingRequests.delete(requestId)
        reject(new Error('Subscription timeout'))
      }
    }, 10000)
  })
}

function unsubscribe(method: string, subscriptionId: number) {
  subscriptions.delete(subscriptionId)
  notifyStateChange()

  if (wsInstance?.readyState === WebSocket.OPEN) {
    wsInstance.send(JSON.stringify({
      jsonrpc: '2.0',
      id: requestIdCounter++,
      method,
      params: [subscriptionId],
    }))
  }
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Hook to get WebSocket connection state
 */
export function useHeliusWebSocketState(): WebSocketState {
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
  const subscriptionIdRef = useRef<number | null>(null)
  const handlerRef = useRef(onUpdate)
  handlerRef.current = onUpdate

  useEffect(() => {
    if (!pubkey) return

    let mounted = true

    const setupSubscription = async () => {
      try {
        const id = await subscribe(
          'accountSubscribe',
          [
            pubkey,
            {
              encoding: options.encoding || 'jsonParsed',
              commitment: options.commitment || 'confirmed',
            },
          ],
          (data) => {
            if (mounted) {
              handlerRef.current(data as AccountUpdate)
            }
          }
        )

        if (mounted) {
          subscriptionIdRef.current = id
        } else {
          unsubscribe('accountUnsubscribe', id)
        }
      } catch (error) {
        console.error('[useAccountSubscription] Failed:', error)
      }
    }

    setupSubscription()

    return () => {
      mounted = false
      if (subscriptionIdRef.current !== null) {
        unsubscribe('accountUnsubscribe', subscriptionIdRef.current)
        subscriptionIdRef.current = null
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
  const subscriptionIdRef = useRef<number | null>(null)
  const handlerRef = useRef(onUpdate)
  handlerRef.current = onUpdate

  useEffect(() => {
    if (!pubkey) return

    let mounted = true

    const setupSubscription = async () => {
      try {
        const id = await subscribe(
          'logsSubscribe',
          [
            { mentions: [pubkey] },
            { commitment: options.commitment || 'confirmed' },
          ],
          (data) => {
            if (mounted) {
              handlerRef.current(data as LogsUpdate)
            }
          }
        )

        if (mounted) {
          subscriptionIdRef.current = id
        } else {
          unsubscribe('logsUnsubscribe', id)
        }
      } catch (error) {
        console.error('[useLogsSubscription] Failed:', error)
      }
    }

    setupSubscription()

    return () => {
      mounted = false
      if (subscriptionIdRef.current !== null) {
        unsubscribe('logsUnsubscribe', subscriptionIdRef.current)
        subscriptionIdRef.current = null
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
  const subscriptionIdRef = useRef<number | null>(null)
  const handlerRef = useRef(onConfirmed)
  handlerRef.current = onConfirmed

  useEffect(() => {
    if (!signature) return

    let mounted = true

    const setupSubscription = async () => {
      try {
        const id = await subscribe(
          'signatureSubscribe',
          [
            signature,
            { commitment: options.commitment || 'confirmed' },
          ],
          (data) => {
            if (mounted) {
              handlerRef.current(data as { err: unknown | null })
              // Signature subscriptions auto-remove after confirmation
              subscriptionIdRef.current = null
            }
          }
        )

        if (mounted) {
          subscriptionIdRef.current = id
        } else {
          unsubscribe('signatureUnsubscribe', id)
        }
      } catch (error) {
        console.error('[useSignatureSubscription] Failed:', error)
      }
    }

    setupSubscription()

    return () => {
      mounted = false
      if (subscriptionIdRef.current !== null) {
        unsubscribe('signatureUnsubscribe', subscriptionIdRef.current)
        subscriptionIdRef.current = null
      }
    }
  }, [signature, options.commitment])
}

/**
 * Hook to manually connect the WebSocket
 * Useful if you want to pre-warm the connection
 */
export function useHeliusConnect() {
  const connect = useCallback(async () => {
    try {
      await ensureConnection()
      return true
    } catch (error) {
      console.error('[useHeliusConnect] Failed:', error)
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

