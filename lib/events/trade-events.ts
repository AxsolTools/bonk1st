/**
 * Trade Event System - Real-time trade broadcasting for instant UI updates
 * 
 * This allows trades to appear instantly in the UI without waiting for
 * Helius indexing (which takes 5-30 seconds).
 * 
 * Usage:
 * - Emit: tradeEvents.emit({ signature, type, ... })
 * - Listen: tradeEvents.subscribe(tokenMint, callback)
 */

export interface TradeEvent {
  signature: string
  tokenMint: string
  type: 'buy' | 'sell'
  walletAddress: string
  amountSol: number
  amountTokens: number
  timestamp: number
  status: 'pending' | 'confirmed' | 'failed'
}

type TradeEventCallback = (event: TradeEvent) => void

class TradeEventEmitter {
  private listeners: Map<string, Set<TradeEventCallback>> = new Map()
  private globalListeners: Set<TradeEventCallback> = new Set()
  private recentEvents: Map<string, TradeEvent> = new Map() // signature -> event
  private maxRecentEvents = 100

  /**
   * Emit a trade event - will notify all listeners for this token
   */
  emit(event: TradeEvent): void {
    // Store in recent events
    this.recentEvents.set(event.signature, event)
    
    // Trim if too many
    if (this.recentEvents.size > this.maxRecentEvents) {
      const firstKey = this.recentEvents.keys().next().value
      if (firstKey) this.recentEvents.delete(firstKey)
    }

    // Notify global listeners
    this.globalListeners.forEach(callback => {
      try {
        callback(event)
      } catch (error) {
        console.error('[TRADE-EVENTS] Global listener error:', error)
      }
    })

    // Notify token-specific listeners
    const tokenListeners = this.listeners.get(event.tokenMint)
    if (tokenListeners) {
      tokenListeners.forEach(callback => {
        try {
          callback(event)
        } catch (error) {
          console.error('[TRADE-EVENTS] Listener error:', error)
        }
      })
    }

    console.log('[TRADE-EVENTS] Emitted:', {
      signature: event.signature.slice(0, 12),
      type: event.type,
      token: event.tokenMint.slice(0, 8),
      sol: event.amountSol.toFixed(4),
    })
  }

  /**
   * Subscribe to trade events for a specific token
   */
  subscribe(tokenMint: string, callback: TradeEventCallback): () => void {
    if (!this.listeners.has(tokenMint)) {
      this.listeners.set(tokenMint, new Set())
    }
    this.listeners.get(tokenMint)!.add(callback)

    // Return unsubscribe function
    return () => {
      const listeners = this.listeners.get(tokenMint)
      if (listeners) {
        listeners.delete(callback)
        if (listeners.size === 0) {
          this.listeners.delete(tokenMint)
        }
      }
    }
  }

  /**
   * Subscribe to all trade events (global listener)
   */
  subscribeAll(callback: TradeEventCallback): () => void {
    this.globalListeners.add(callback)
    return () => {
      this.globalListeners.delete(callback)
    }
  }

  /**
   * Update an existing event's status (e.g., pending -> confirmed)
   */
  updateStatus(signature: string, status: TradeEvent['status']): void {
    const event = this.recentEvents.get(signature)
    if (event) {
      event.status = status
      // Re-emit to notify listeners of status change
      this.emit(event)
    }
  }

  /**
   * Check if a signature was recently emitted (to avoid duplicates)
   */
  hasRecent(signature: string): boolean {
    return this.recentEvents.has(signature)
  }

  /**
   * Get recent events for a token (useful for initial render)
   */
  getRecentForToken(tokenMint: string, limit = 10): TradeEvent[] {
    const events: TradeEvent[] = []
    for (const event of this.recentEvents.values()) {
      if (event.tokenMint === tokenMint) {
        events.push(event)
      }
    }
    return events
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit)
  }
}

// Singleton instance
export const tradeEvents = new TradeEventEmitter()

// React hook for subscribing to trade events
export function useTradeEvents(
  tokenMint: string | null,
  onTrade: TradeEventCallback
): void {
  // This is a simple export - the actual hook implementation will be in the component
  // to avoid React import here (keeping this file framework-agnostic)
}

