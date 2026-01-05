/**
 * Helius WebSocket Manager
 * Provides real-time subscriptions for:
 * - Account changes (balances, token accounts)
 * - Transaction confirmations
 * - Logs for specific programs
 * 
 * WebSocket URL: wss://mainnet.helius-rpc.com/?api-key=<API_KEY>
 * 
 * IMPORTANT: WebSockets have a 10-minute inactivity timer.
 * This manager implements automatic ping/pong to keep connections alive.
 */

type MessageHandler = (data: unknown) => void
type ErrorHandler = (error: Event | Error) => void

interface Subscription {
  id: number
  method: string
  params: unknown[]
  handler: MessageHandler
}

interface WebSocketMessage {
  jsonrpc: string
  id?: number
  method?: string
  result?: unknown
  params?: {
    subscription: number
    result: unknown
  }
  error?: {
    code: number
    message: string
  }
}

class HeliusWebSocketManager {
  private ws: WebSocket | null = null
  private apiKey: string | null = null
  private subscriptions: Map<number, Subscription> = new Map()
  private pendingSubscriptions: Map<number, { resolve: (id: number) => void; reject: (err: Error) => void }> = new Map()
  private subscriptionIdCounter = 1
  private requestIdCounter = 1
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private pingInterval: ReturnType<typeof setInterval> | null = null
  private isConnecting = false
  private onErrorCallback: ErrorHandler | null = null
  private onConnectCallback: (() => void) | null = null
  private onDisconnectCallback: (() => void) | null = null

  constructor() {
    // Will be initialized with connect()
  }

  /**
   * Initialize and connect to Helius WebSocket
   */
  async connect(apiKey: string): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('[HELIUS-WS] Already connected')
      return
    }

    if (this.isConnecting) {
      console.log('[HELIUS-WS] Connection already in progress')
      return
    }

    this.apiKey = apiKey
    this.isConnecting = true

    return new Promise((resolve, reject) => {
      try {
        const wsUrl = `wss://mainnet.helius-rpc.com/?api-key=${apiKey}`
        this.ws = new WebSocket(wsUrl)

        this.ws.onopen = () => {
          console.log('[HELIUS-WS] Connected')
          this.isConnecting = false
          this.reconnectAttempts = 0
          this.startPingInterval()
          this.resubscribeAll()
          this.onConnectCallback?.()
          resolve()
        }

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data)
        }

        this.ws.onerror = (error) => {
          console.error('[HELIUS-WS] Error:', error)
          this.isConnecting = false
          this.onErrorCallback?.(error)
        }

        this.ws.onclose = (event) => {
          console.log('[HELIUS-WS] Disconnected:', event.code, event.reason)
          this.isConnecting = false
          this.stopPingInterval()
          this.onDisconnectCallback?.()
          
          // Attempt reconnection if not intentionally closed
          if (event.code !== 1000) {
            this.attemptReconnect()
          }
        }

        // Set timeout for initial connection
        setTimeout(() => {
          if (this.isConnecting) {
            this.isConnecting = false
            reject(new Error('WebSocket connection timeout'))
          }
        }, 10000)
      } catch (error) {
        this.isConnecting = false
        reject(error)
      }
    })
  }

  /**
   * Disconnect and cleanup
   */
  disconnect(): void {
    this.stopPingInterval()
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect')
      this.ws = null
    }
    this.subscriptions.clear()
    this.pendingSubscriptions.clear()
  }

  /**
   * Subscribe to account changes
   * Notifies when lamports or data changes for an account
   * 
   * @param pubkey - Account public key to monitor
   * @param handler - Callback for account updates
   * @param options - Optional encoding and commitment level
   */
  async subscribeAccount(
    pubkey: string,
    handler: MessageHandler,
    options: { encoding?: string; commitment?: string } = {}
  ): Promise<number> {
    const params = [
      pubkey,
      {
        encoding: options.encoding || 'jsonParsed',
        commitment: options.commitment || 'confirmed',
      },
    ]

    return this.subscribe('accountSubscribe', params, handler)
  }

  /**
   * Unsubscribe from account changes
   */
  async unsubscribeAccount(subscriptionId: number): Promise<boolean> {
    return this.unsubscribe('accountUnsubscribe', subscriptionId)
  }

  /**
   * Subscribe to transaction logs for a specific account
   * Great for monitoring swaps/trades on a token
   * 
   * @param mentionsPubkey - Filter logs mentioning this pubkey
   * @param handler - Callback for log updates
   */
  async subscribeLogs(
    mentionsPubkey: string,
    handler: MessageHandler,
    options: { commitment?: string } = {}
  ): Promise<number> {
    const params = [
      { mentions: [mentionsPubkey] },
      { commitment: options.commitment || 'confirmed' },
    ]

    return this.subscribe('logsSubscribe', params, handler)
  }

  /**
   * Unsubscribe from logs
   */
  async unsubscribeLogs(subscriptionId: number): Promise<boolean> {
    return this.unsubscribe('logsUnsubscribe', subscriptionId)
  }

  /**
   * Subscribe to signature confirmation
   * Useful for tracking transaction status
   * 
   * @param signature - Transaction signature to monitor
   * @param handler - Callback when confirmed
   */
  async subscribeSignature(
    signature: string,
    handler: MessageHandler,
    options: { commitment?: string } = {}
  ): Promise<number> {
    const params = [
      signature,
      { commitment: options.commitment || 'confirmed' },
    ]

    return this.subscribe('signatureSubscribe', params, handler)
  }

  /**
   * Subscribe to a program's account changes
   * Monitors all accounts owned by a program
   * 
   * @param programId - Program public key
   * @param handler - Callback for updates
   */
  async subscribeProgram(
    programId: string,
    handler: MessageHandler,
    options: { encoding?: string; commitment?: string; filters?: unknown[] } = {}
  ): Promise<number> {
    const params = [
      programId,
      {
        encoding: options.encoding || 'jsonParsed',
        commitment: options.commitment || 'confirmed',
        ...(options.filters ? { filters: options.filters } : {}),
      },
    ]

    return this.subscribe('programSubscribe', params, handler)
  }

  /**
   * Set event handlers
   */
  onError(handler: ErrorHandler): void {
    this.onErrorCallback = handler
  }

  onConnect(handler: () => void): void {
    this.onConnectCallback = handler
  }

  onDisconnect(handler: () => void): void {
    this.onDisconnectCallback = handler
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  /**
   * Get active subscription count
   */
  getSubscriptionCount(): number {
    return this.subscriptions.size
  }

  // ============== PRIVATE METHODS ==============

  private async subscribe(method: string, params: unknown[], handler: MessageHandler): Promise<number> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected')
    }

    const requestId = this.requestIdCounter++

    return new Promise((resolve, reject) => {
      this.pendingSubscriptions.set(requestId, { resolve, reject })

      const message = {
        jsonrpc: '2.0',
        id: requestId,
        method,
        params,
      }

      // Store subscription info for resubscription on reconnect
      const subscriptionInfo: Subscription = {
        id: 0, // Will be set when we get the response
        method,
        params,
        handler,
      }

      this.ws!.send(JSON.stringify(message))

      // Update subscription with actual ID when received
      const originalResolve = this.pendingSubscriptions.get(requestId)!.resolve
      this.pendingSubscriptions.set(requestId, {
        resolve: (id: number) => {
          subscriptionInfo.id = id
          this.subscriptions.set(id, subscriptionInfo)
          originalResolve(id)
        },
        reject,
      })

      // Timeout after 10 seconds
      setTimeout(() => {
        if (this.pendingSubscriptions.has(requestId)) {
          this.pendingSubscriptions.delete(requestId)
          reject(new Error(`Subscription timeout for ${method}`))
        }
      }, 10000)
    })
  }

  private async unsubscribe(method: string, subscriptionId: number): Promise<boolean> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.subscriptions.delete(subscriptionId)
      return true
    }

    const requestId = this.requestIdCounter++

    return new Promise((resolve) => {
      const message = {
        jsonrpc: '2.0',
        id: requestId,
        method,
        params: [subscriptionId],
      }

      this.ws!.send(JSON.stringify(message))
      this.subscriptions.delete(subscriptionId)
      resolve(true)
    })
  }

  private handleMessage(data: string): void {
    try {
      const message: WebSocketMessage = JSON.parse(data)

      // Handle subscription confirmation
      if (message.id && typeof message.result === 'number') {
        const pending = this.pendingSubscriptions.get(message.id)
        if (pending) {
          this.pendingSubscriptions.delete(message.id)
          pending.resolve(message.result)
        }
        return
      }

      // Handle subscription notification
      if (message.method === 'accountNotification' || 
          message.method === 'logsNotification' ||
          message.method === 'signatureNotification' ||
          message.method === 'programNotification') {
        const subscriptionId = message.params?.subscription
        if (subscriptionId !== undefined) {
          const subscription = this.subscriptions.get(subscriptionId)
          if (subscription) {
            subscription.handler(message.params?.result)
          }
        }
        return
      }

      // Handle errors
      if (message.error) {
        console.error('[HELIUS-WS] Error:', message.error)
        const pending = message.id ? this.pendingSubscriptions.get(message.id) : null
        if (pending) {
          this.pendingSubscriptions.delete(message.id!)
          pending.reject(new Error(message.error.message))
        }
      }
    } catch (error) {
      console.error('[HELIUS-WS] Message parse error:', error)
    }
  }

  private startPingInterval(): void {
    // Send ping every 30 seconds to keep connection alive
    // Helius has a 10-minute inactivity timer
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        // Use getHealth as a ping
        const message = {
          jsonrpc: '2.0',
          id: this.requestIdCounter++,
          method: 'getHealth',
        }
        this.ws.send(JSON.stringify(message))
      }
    }, 30000)
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[HELIUS-WS] Max reconnection attempts reached')
      return
    }

    this.reconnectAttempts++
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)

    console.log(`[HELIUS-WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)

    setTimeout(() => {
      if (this.apiKey) {
        this.connect(this.apiKey).catch((error) => {
          console.error('[HELIUS-WS] Reconnection failed:', error)
        })
      }
    }, delay)
  }

  private resubscribeAll(): void {
    // Re-establish all subscriptions after reconnect
    const existingSubscriptions = Array.from(this.subscriptions.values())
    this.subscriptions.clear()

    for (const sub of existingSubscriptions) {
      this.subscribe(sub.method, sub.params, sub.handler).catch((error) => {
        console.error(`[HELIUS-WS] Failed to resubscribe ${sub.method}:`, error)
      })
    }
  }
}

// Singleton instance
let instance: HeliusWebSocketManager | null = null

export function getHeliusWebSocket(): HeliusWebSocketManager {
  if (!instance) {
    instance = new HeliusWebSocketManager()
  }
  return instance
}

export type { MessageHandler, Subscription }
export { HeliusWebSocketManager }

