/**
 * PumpPortal Monitor
 * Subscribes to Pump.fun events:
 * - Migration events (bonding curve → DEX)
 * - Trade events (buys/sells on bonding curve tokens)
 * - New token creation events
 * 
 * WebSocket: wss://pumpportal.fun/api/data
 */

type MigrationHandler = (data: MigrationEvent) => void
type TradeHandler = (data: TradeEvent) => void
type NewTokenHandler = (data: NewTokenEvent) => void
type ErrorHandler = (error: Event | Error) => void

export interface MigrationEvent {
  signature: string
  mint: string
  timestamp: number
  pool?: string
  dex?: string // 'raydium' | 'pumpswap'
}

export interface TradeEvent {
  signature: string
  mint: string
  txType: 'buy' | 'sell'
  tokenAmount: number
  solAmount: number
  traderPublicKey: string
  timestamp: number
  // Bonding curve progress info
  vSolInBondingCurve?: number
  vTokensInBondingCurve?: number
  marketCapSol?: number
}

export interface NewTokenEvent {
  signature: string
  mint: string
  name: string
  symbol: string
  uri: string
  traderPublicKey: string
  timestamp: number
}

class PumpPortalMonitor {
  private ws: WebSocket | null = null
  private isConnected = false
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private reconnectDelay = 5000
  
  private migrationHandlers: Set<MigrationHandler> = new Set()
  private tradeHandlers: Set<TradeHandler> = new Set()
  private newTokenHandlers: Set<NewTokenHandler> = new Set()
  private subscribedTokens: Set<string> = new Set()
  
  private onErrorCallback: ErrorHandler | null = null
  private onConnectCallback: (() => void) | null = null

  /**
   * Connect to PumpPortal WebSocket
   */
  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('[PUMPPORTAL] Already connected')
      return
    }

    try {
      console.log('[PUMPPORTAL] Connecting...')
      this.ws = new WebSocket('wss://pumpportal.fun/api/data')

      this.ws.onopen = () => {
        console.log('[PUMPPORTAL] ✅ Connected')
        this.isConnected = true
        this.reconnectAttempts = 0
        this.onConnectCallback?.()
        
        // Subscribe to migration events
        this.subscribeMigrations()
        
        // Resubscribe to any token trades
        if (this.subscribedTokens.size > 0) {
          this.subscribeTokenTrades(Array.from(this.subscribedTokens))
        }
      }

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          this.handleMessage(message)
        } catch (error) {
          console.error('[PUMPPORTAL] Parse error:', error)
        }
      }

      this.ws.onerror = (error) => {
        console.error('[PUMPPORTAL] Error:', error)
        this.onErrorCallback?.(error)
      }

      this.ws.onclose = () => {
        console.log('[PUMPPORTAL] Disconnected')
        this.isConnected = false
        this.attemptReconnect()
      }
    } catch (error) {
      console.error('[PUMPPORTAL] Connection error:', error)
    }
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    this.reconnectAttempts = this.maxReconnectAttempts // Prevent reconnection
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.isConnected = false
    console.log('[PUMPPORTAL] Manually disconnected')
  }

  /**
   * Subscribe to migration events
   */
  private subscribeMigrations(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return

    const payload = { method: 'subscribeMigration' }
    this.ws.send(JSON.stringify(payload))
    console.log('[PUMPPORTAL] Subscribed to migrations')
  }

  /**
   * Subscribe to new token creation events
   */
  subscribeNewTokens(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.log('[PUMPPORTAL] Not connected, will subscribe on connect')
      return
    }

    const payload = { method: 'subscribeNewToken' }
    this.ws.send(JSON.stringify(payload))
    console.log('[PUMPPORTAL] Subscribed to new tokens')
  }

  /**
   * Subscribe to trades on specific tokens
   */
  subscribeTokenTrades(tokenMints: string[]): void {
    tokenMints.forEach(mint => this.subscribedTokens.add(mint))

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.log('[PUMPPORTAL] Not connected, will subscribe on connect')
      return
    }

    const payload = {
      method: 'subscribeTokenTrade',
      keys: tokenMints
    }
    this.ws.send(JSON.stringify(payload))
    console.log(`[PUMPPORTAL] Subscribed to trades for ${tokenMints.length} tokens`)
  }

  /**
   * Unsubscribe from token trades
   */
  unsubscribeTokenTrades(tokenMints: string[]): void {
    tokenMints.forEach(mint => this.subscribedTokens.delete(mint))

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return

    const payload = {
      method: 'unsubscribeTokenTrade',
      keys: tokenMints
    }
    this.ws.send(JSON.stringify(payload))
    console.log(`[PUMPPORTAL] Unsubscribed from ${tokenMints.length} tokens`)
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(message: Record<string, unknown>): void {
    const txType = message.txType as string

    // Migration event
    if (txType === 'migration') {
      const event: MigrationEvent = {
        signature: message.signature as string,
        mint: message.mint as string,
        timestamp: Date.now(),
        pool: message.pool as string | undefined,
        dex: message.dex as string | undefined,
      }
      
      console.log('[PUMPPORTAL] 🚀 Migration:', event.mint)
      this.migrationHandlers.forEach(handler => {
        try { handler(event) } catch (e) { console.error('[PUMPPORTAL] Handler error:', e) }
      })
    }
    
    // Buy/Sell trade events
    else if (txType === 'buy' || txType === 'sell') {
      const event: TradeEvent = {
        signature: message.signature as string,
        mint: message.mint as string,
        txType: txType,
        tokenAmount: message.tokenAmount as number,
        solAmount: message.solAmount as number,
        traderPublicKey: message.traderPublicKey as string,
        timestamp: Date.now(),
        vSolInBondingCurve: message.vSolInBondingCurve as number | undefined,
        vTokensInBondingCurve: message.vTokensInBondingCurve as number | undefined,
        marketCapSol: message.marketCapSol as number | undefined,
      }
      
      this.tradeHandlers.forEach(handler => {
        try { handler(event) } catch (e) { console.error('[PUMPPORTAL] Handler error:', e) }
      })
    }
    
    // New token creation
    else if (txType === 'create') {
      const event: NewTokenEvent = {
        signature: message.signature as string,
        mint: message.mint as string,
        name: message.name as string,
        symbol: message.symbol as string,
        uri: message.uri as string,
        traderPublicKey: message.traderPublicKey as string,
        timestamp: Date.now(),
      }
      
      console.log('[PUMPPORTAL] 🆕 New token:', event.symbol)
      this.newTokenHandlers.forEach(handler => {
        try { handler(event) } catch (e) { console.error('[PUMPPORTAL] Handler error:', e) }
      })
    }
  }

  /**
   * Attempt reconnection
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[PUMPPORTAL] Max reconnection attempts reached')
      return
    }

    this.reconnectAttempts++
    console.log(`[PUMPPORTAL] Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`)
    
    setTimeout(() => this.connect(), this.reconnectDelay)
  }

  /**
   * Register migration event handler
   */
  onMigration(handler: MigrationHandler): () => void {
    this.migrationHandlers.add(handler)
    return () => this.migrationHandlers.delete(handler)
  }

  /**
   * Register trade event handler
   */
  onTrade(handler: TradeHandler): () => void {
    this.tradeHandlers.add(handler)
    return () => this.tradeHandlers.delete(handler)
  }

  /**
   * Register new token event handler
   */
  onNewToken(handler: NewTokenHandler): () => void {
    this.newTokenHandlers.add(handler)
    return () => this.newTokenHandlers.delete(handler)
  }

  /**
   * Set error handler
   */
  onError(handler: ErrorHandler): void {
    this.onErrorCallback = handler
  }

  /**
   * Set connect handler
   */
  onConnect(handler: () => void): void {
    this.onConnectCallback = handler
  }

  /**
   * Check connection status
   */
  getIsConnected(): boolean {
    return this.isConnected
  }

  /**
   * Get subscribed token count
   */
  getSubscribedTokenCount(): number {
    return this.subscribedTokens.size
  }
}

// Singleton instance
let instance: PumpPortalMonitor | null = null

export function getPumpPortalMonitor(): PumpPortalMonitor {
  if (!instance) {
    instance = new PumpPortalMonitor()
  }
  return instance
}

export { PumpPortalMonitor }

