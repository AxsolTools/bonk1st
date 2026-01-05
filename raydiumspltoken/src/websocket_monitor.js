/**
 * PumpPortal Websocket Real-time Monitoring
 * Streams token creation, trades, and migration events
 */

const WebSocket = require('ws');
const EventEmitter = require('events');

// PumpPortal Websocket endpoint
const PUMPPORTAL_WEBSOCKET = 'wss://pumpportal.fun/api/data';

class PumpPortalMonitor extends EventEmitter {
  constructor() {
    super();
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 5000;
    this.subscriptions = {
      newTokens: false,
      migrations: false,
      tokenTrades: new Set(),
      accountTrades: new Set()
    };
    this.isConnected = false;
  }

  /**
   * Connect to PumpPortal websocket
   */
  connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('[WEBSOCKET] Already connected');
      return;
    }

    try {
      console.log('[WEBSOCKET] Connecting to PumpPortal...');
      this.ws = new WebSocket(PUMPPORTAL_WEBSOCKET);

      this.ws.on('open', () => {
        console.log('[WEBSOCKET] ✅ Connected to PumpPortal');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.emit('connected');
        
        // Resubscribe to active subscriptions
        this.resubscribe();
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          this.handleMessage(message);
        } catch (error) {
          console.error('[WEBSOCKET] Error parsing message:', error);
        }
      });

      this.ws.on('error', (error) => {
        console.error('[WEBSOCKET] Error:', error);
        this.emit('error', error);
      });

      this.ws.on('close', () => {
        console.log('[WEBSOCKET] Disconnected');
        this.isConnected = false;
        this.emit('disconnected');
        
        // Attempt reconnection
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          console.log(`[WEBSOCKET] Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          setTimeout(() => this.connect(), this.reconnectDelay);
        } else {
          console.error('[WEBSOCKET] Max reconnection attempts reached');
          this.emit('max_reconnect_reached');
        }
      });
    } catch (error) {
      console.error('[WEBSOCKET] Connection error:', error);
      this.emit('error', error);
    }
  }

  /**
   * Disconnect from websocket
   */
  disconnect() {
    if (this.ws) {
      this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnection
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
      console.log('[WEBSOCKET] Manually disconnected');
    }
  }

  /**
   * Subscribe to new token creation events
   */
  subscribeNewTokens() {
    if (!this.isConnected) {
      console.log('[WEBSOCKET] Not connected, queuing subscription');
      this.subscriptions.newTokens = true;
      return;
    }

    const payload = { method: 'subscribeNewToken' };
    this.ws.send(JSON.stringify(payload));
    this.subscriptions.newTokens = true;
    console.log('[WEBSOCKET] Subscribed to new tokens');
  }

  /**
   * Unsubscribe from new token events
   */
  unsubscribeNewTokens() {
    if (!this.isConnected) return;
    
    const payload = { method: 'unsubscribeNewToken' };
    this.ws.send(JSON.stringify(payload));
    this.subscriptions.newTokens = false;
    console.log('[WEBSOCKET] Unsubscribed from new tokens');
  }

  /**
   * Subscribe to migration events
   */
  subscribeMigrations() {
    if (!this.isConnected) {
      console.log('[WEBSOCKET] Not connected, queuing subscription');
      this.subscriptions.migrations = true;
      return;
    }

    const payload = { method: 'subscribeMigration' };
    this.ws.send(JSON.stringify(payload));
    this.subscriptions.migrations = true;
    console.log('[WEBSOCKET] Subscribed to migrations');
  }

  /**
   * Unsubscribe from migration events
   */
  unsubscribeMigrations() {
    if (!this.isConnected) return;
    
    const payload = { method: 'unsubscribeMigration' };
    this.ws.send(JSON.stringify(payload));
    this.subscriptions.migrations = false;
    console.log('[WEBSOCKET] Unsubscribed from migrations');
  }

  /**
   * Subscribe to trades on specific tokens
   * @param {string[]} tokenMints - Array of token mint addresses
   */
  subscribeTokenTrades(tokenMints) {
    if (!this.isConnected) {
      console.log('[WEBSOCKET] Not connected, queuing subscription');
      tokenMints.forEach(mint => this.subscriptions.tokenTrades.add(mint));
      return;
    }

    const payload = {
      method: 'subscribeTokenTrade',
      keys: tokenMints
    };
    this.ws.send(JSON.stringify(payload));
    tokenMints.forEach(mint => this.subscriptions.tokenTrades.add(mint));
    console.log(`[WEBSOCKET] Subscribed to trades for ${tokenMints.length} tokens`);
  }

  /**
   * Unsubscribe from token trades
   * @param {string[]} tokenMints - Array of token mint addresses
   */
  unsubscribeTokenTrades(tokenMints) {
    if (!this.isConnected) return;
    
    const payload = {
      method: 'unsubscribeTokenTrade',
      keys: tokenMints
    };
    this.ws.send(JSON.stringify(payload));
    tokenMints.forEach(mint => this.subscriptions.tokenTrades.delete(mint));
    console.log(`[WEBSOCKET] Unsubscribed from ${tokenMints.length} tokens`);
  }

  /**
   * Subscribe to trades made by specific accounts
   * @param {string[]} accounts - Array of account public keys
   */
  subscribeAccountTrades(accounts) {
    if (!this.isConnected) {
      console.log('[WEBSOCKET] Not connected, queuing subscription');
      accounts.forEach(acc => this.subscriptions.accountTrades.add(acc));
      return;
    }

    const payload = {
      method: 'subscribeAccountTrade',
      keys: accounts
    };
    this.ws.send(JSON.stringify(payload));
    accounts.forEach(acc => this.subscriptions.accountTrades.add(acc));
    console.log(`[WEBSOCKET] Subscribed to trades for ${accounts.length} accounts`);
  }

  /**
   * Unsubscribe from account trades
   * @param {string[]} accounts - Array of account public keys
   */
  unsubscribeAccountTrades(accounts) {
    if (!this.isConnected) return;
    
    const payload = {
      method: 'unsubscribeAccountTrade',
      keys: accounts
    };
    this.ws.send(JSON.stringify(payload));
    accounts.forEach(acc => this.subscriptions.accountTrades.delete(acc));
    console.log(`[WEBSOCKET] Unsubscribed from ${accounts.length} accounts`);
  }

  /**
   * Resubscribe to all active subscriptions (after reconnection)
   */
  resubscribe() {
    if (this.subscriptions.newTokens) {
      this.subscribeNewTokens();
    }
    if (this.subscriptions.migrations) {
      this.subscribeMigrations();
    }
    if (this.subscriptions.tokenTrades.size > 0) {
      this.subscribeTokenTrades(Array.from(this.subscriptions.tokenTrades));
    }
    if (this.subscriptions.accountTrades.size > 0) {
      this.subscribeAccountTrades(Array.from(this.subscriptions.accountTrades));
    }
  }

  /**
   * Handle incoming websocket messages
   * @param {object} message - Parsed message data
   */
  handleMessage(message) {
    // Emit specific events based on message type
    if (message.txType === 'create') {
      this.emit('tokenCreated', message);
    } else if (message.txType === 'buy') {
      this.emit('tokenBuy', message);
    } else if (message.txType === 'sell') {
      this.emit('tokenSell', message);
    } else if (message.txType === 'migration') {
      this.emit('tokenMigration', message);
    }
    
    // Emit generic trade event
    if (message.txType === 'buy' || message.txType === 'sell') {
      this.emit('trade', message);
    }
    
    // Emit all messages
    this.emit('message', message);
  }

  /**
   * Check if connected
   * @returns {boolean}
   */
  isConnected() {
    return this.isConnected;
  }
}

// Create singleton instance
const monitor = new PumpPortalMonitor();

module.exports = {
  PumpPortalMonitor,
  monitor,
  connectMonitor: () => monitor.connect(),
  disconnectMonitor: () => monitor.disconnect()
};

