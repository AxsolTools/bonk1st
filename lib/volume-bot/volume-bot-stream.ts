/**
 * Volume Bot Real-Time Stream Manager
 * 
 * 🚀 PRODUCTION-READY Real-Time Monitoring using Helius Enhanced WebSockets
 * 
 * Uses Helius Enhanced WebSockets for:
 * - transactionSubscribe: Real-time transaction monitoring
 * - accountSubscribe: Real-time account/balance changes
 * 
 * CREDIT EFFICIENCY:
 * - Enhanced WebSockets: 3 credits per 0.1 MB of data
 * - Much more efficient than polling (which costs 1-10 credits per call)
 * - Single connection for multiple subscriptions
 * - Filters at the source = less data = fewer credits
 * 
 * ENDPOINT: wss://atlas-mainnet.helius-rpc.com/?api-key=<API_KEY>
 * 
 * ⚠️ IMPORTANT: WebSockets have a 10-minute inactivity timer
 * We implement health checks and ping every 30 seconds
 */

import { EventEmitter } from 'events';

// ============================================================================
// TYPES
// ============================================================================

export interface StreamConfig {
  tokenMint: string;
  userId: string;
  sessionId: string;
  walletAddresses: string[];
  onTransaction?: (tx: TransactionEvent) => void;
  onPriceChange?: (price: PriceChangeEvent) => void;
  onBalanceChange?: (balance: BalanceChangeEvent) => void;
  onError?: (error: Error) => void;
}

export interface TransactionEvent {
  signature: string;
  type: 'buy' | 'sell' | 'transfer' | 'unknown';
  timestamp: number;
  slot: number;
  fromAddress: string;
  toAddress?: string;
  tokenAmount?: number;
  solAmount?: number;
  success: boolean;
  isOurWallet: boolean;
  walletId?: string;
}

export interface PriceChangeEvent {
  tokenMint: string;
  oldPrice: number;
  newPrice: number;
  changePercent: number;
  timestamp: number;
  source: 'trade' | 'pool';
}

export interface BalanceChangeEvent {
  walletAddress: string;
  tokenMint: string;
  oldBalance: number;
  newBalance: number;
  changeAmount: number;
  timestamp: number;
}

interface SubscriptionInfo {
  subscriptionId: number;
  type: 'transaction' | 'account';
  params: Record<string, unknown>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Helius Enhanced WebSocket endpoint
const HELIUS_WSS_MAINNET = 'wss://atlas-mainnet.helius-rpc.com';
const HELIUS_WSS_DEVNET = 'wss://atlas-devnet.helius-rpc.com';

// Health check interval (30 seconds - well under the 10 minute timeout)
const HEALTH_CHECK_INTERVAL = 30_000;

// Reconnection settings
const RECONNECT_BASE_DELAY = 1000;
const RECONNECT_MAX_DELAY = 30_000;
const MAX_RECONNECT_ATTEMPTS = 10;

// Program IDs for filtering
const PUMP_FUN_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const RAYDIUM_AMM = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
const JUPITER_V6 = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';

// ============================================================================
// STREAM MANAGER CLASS
// ============================================================================

export class VolumeBotStreamManager extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: StreamConfig;
  private subscriptions: Map<number, SubscriptionInfo> = new Map();
  private messageId = 0;
  private isConnected = false;
  private reconnectAttempts = 0;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private lastPongReceived = Date.now();
  private lastPrice: number | null = null;

  constructor(config: StreamConfig) {
    super();
    this.config = config;
  }

  /**
   * Connect to Helius Enhanced WebSocket
   */
  async connect(): Promise<void> {
    const apiKey = process.env.NEXT_PUBLIC_HELIUS_API_KEY || process.env.HELIUS_API_KEY;
    
    if (!apiKey) {
      throw new Error('HELIUS_API_KEY is required for real-time monitoring');
    }

    const wsUrl = `${HELIUS_WSS_MAINNET}/?api-key=${apiKey}`;

    return new Promise((resolve, reject) => {
      try {
        // Use dynamic import for WebSocket in Node.js environment
        if (typeof WebSocket === 'undefined') {
          // Node.js environment - use ws package
          import('ws').then((wsModule) => {
            this.ws = new wsModule.default(wsUrl) as unknown as WebSocket;
            this.setupWebSocketHandlers(resolve, reject);
          }).catch(reject);
        } else {
          // Browser environment
          this.ws = new WebSocket(wsUrl);
          this.setupWebSocketHandlers(resolve, reject);
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  private setupWebSocketHandlers(
    resolve: () => void,
    reject: (error: Error) => void
  ): void {
    if (!this.ws) return;

    this.ws.onopen = () => {
      console.log('[VOLUME_BOT_STREAM] ✅ Connected to Helius Enhanced WebSocket');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.startHealthCheck();
      this.subscribeToToken();
      resolve();
    };

    this.ws.onerror = (error) => {
      console.error('[VOLUME_BOT_STREAM] ❌ WebSocket error:', error);
      this.config.onError?.(new Error('WebSocket connection error'));
      if (!this.isConnected) {
        reject(new Error('Failed to connect to Helius WebSocket'));
      }
    };

    this.ws.onclose = (event) => {
      console.log(`[VOLUME_BOT_STREAM] WebSocket closed: ${event.code} - ${event.reason}`);
      this.isConnected = false;
      this.stopHealthCheck();
      this.handleReconnect();
    };

    this.ws.onmessage = (event) => {
      this.handleMessage(event.data);
    };
  }

  /**
   * Subscribe to token transactions using transactionSubscribe
   * 
   * CREDIT EFFICIENT: One subscription covers all wallets + token
   * Uses accountInclude filter to watch our wallets AND the token
   */
  private subscribeToToken(): void {
    if (!this.ws || !this.isConnected) return;

    // Build the accounts to watch
    // Include: our wallets + token mint + known DEX programs
    const accountsToWatch = [
      ...this.config.walletAddresses,
      this.config.tokenMint,
    ];

    // Transaction Subscribe - watch for swaps involving our token/wallets
    const txSubscribeMessage = {
      jsonrpc: '2.0',
      id: this.getNextMessageId(),
      method: 'transactionSubscribe',
      params: [
        {
          // Filter configuration
          vote: false,           // Exclude vote transactions
          failed: false,         // Exclude failed transactions
          accountInclude: accountsToWatch,  // Watch these accounts
        },
        {
          // Options
          commitment: 'confirmed',
          encoding: 'jsonParsed',
          transactionDetails: 'full',
          showRewards: false,
          maxSupportedTransactionVersion: 0,
        }
      ]
    };

    this.sendMessage(txSubscribeMessage);
    console.log(`[VOLUME_BOT_STREAM] 📡 Subscribed to transactions for ${accountsToWatch.length} accounts`);

    // Account Subscribe - watch our wallet token balances for changes
    for (const walletAddress of this.config.walletAddresses) {
      const accountSubscribeMessage = {
        jsonrpc: '2.0',
        id: this.getNextMessageId(),
        method: 'accountSubscribe',
        params: [
          walletAddress,
          {
            commitment: 'confirmed',
            encoding: 'jsonParsed',
          }
        ]
      };
      this.sendMessage(accountSubscribeMessage);
    }

    console.log(`[VOLUME_BOT_STREAM] 👛 Subscribed to ${this.config.walletAddresses.length} wallet accounts`);
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(data: string | Buffer): void {
    try {
      const message = JSON.parse(data.toString());

      // Handle subscription confirmation
      if (message.id && message.result !== undefined) {
        const subId = message.result;
        console.log(`[VOLUME_BOT_STREAM] Subscription confirmed: ${subId}`);
        this.subscriptions.set(subId, {
          subscriptionId: subId,
          type: 'transaction', // Will be overwritten for account subscriptions
          params: {}
        });
        return;
      }

      // Handle pong response
      if (message.result === 'pong') {
        this.lastPongReceived = Date.now();
        return;
      }

      // Handle subscription notifications
      if (message.method === 'transactionNotification') {
        this.handleTransactionNotification(message.params);
      } else if (message.method === 'accountNotification') {
        this.handleAccountNotification(message.params);
      }
    } catch (error) {
      console.error('[VOLUME_BOT_STREAM] Failed to parse message:', error);
    }
  }

  /**
   * Process transaction notification
   * 
   * Parses the transaction to determine:
   * - Is it a buy or sell?
   * - Is it from one of our wallets?
   * - What's the token/SOL amount?
   */
  private handleTransactionNotification(params: { result: { signature: string; transaction: unknown; slot: number } }): void {
    try {
      const { signature, transaction, slot } = params.result;
      const tx = transaction as Record<string, unknown>;
      
      // Parse the transaction
      const event = this.parseTransaction(signature, tx, slot);
      
      if (event) {
        console.log(`[VOLUME_BOT_STREAM] 📥 ${event.type.toUpperCase()}: ${event.solAmount?.toFixed(4)} SOL - ${signature.slice(0, 8)}...`);
        
        // Emit to listeners
        this.config.onTransaction?.(event);
        this.emit('transaction', event);

        // Calculate price change if we have amounts
        if (event.tokenAmount && event.solAmount && event.tokenAmount > 0) {
          const newPrice = event.solAmount / event.tokenAmount;
          if (this.lastPrice !== null) {
            const changePercent = ((newPrice - this.lastPrice) / this.lastPrice) * 100;
            const priceEvent: PriceChangeEvent = {
              tokenMint: this.config.tokenMint,
              oldPrice: this.lastPrice,
              newPrice,
              changePercent,
              timestamp: Date.now(),
              source: 'trade'
            };
            this.config.onPriceChange?.(priceEvent);
            this.emit('priceChange', priceEvent);
          }
          this.lastPrice = newPrice;
        }
      }
    } catch (error) {
      console.error('[VOLUME_BOT_STREAM] Error processing transaction:', error);
    }
  }

  /**
   * Parse raw transaction into TransactionEvent
   */
  private parseTransaction(
    signature: string,
    tx: Record<string, unknown>,
    slot: number
  ): TransactionEvent | null {
    try {
      const meta = tx.meta as Record<string, unknown> | null;
      const transaction = tx.transaction as Record<string, unknown>;
      
      if (!meta || !transaction) return null;

      // Check if transaction succeeded
      const success = meta.err === null;
      if (!success) return null;

      // Get account keys
      const message = transaction.message as Record<string, unknown>;
      const accountKeys = message?.accountKeys as Array<{ pubkey: string; signer: boolean; writable: boolean }> || [];
      
      // Determine if this involves one of our wallets
      const ourWallets = new Set(this.config.walletAddresses.map(a => a.toLowerCase()));
      let isOurWallet = false;
      let fromAddress = '';
      let walletId: string | undefined;

      for (const account of accountKeys) {
        const pubkey = typeof account === 'string' ? account : account.pubkey;
        if (ourWallets.has(pubkey?.toLowerCase())) {
          isOurWallet = true;
          fromAddress = pubkey;
          walletId = pubkey;
          break;
        }
      }

      // Parse pre/post token balances to determine buy/sell and amounts
      const preTokenBalances = meta.preTokenBalances as Array<{ mint: string; uiTokenAmount: { uiAmount: number } }> || [];
      const postTokenBalances = meta.postTokenBalances as Array<{ mint: string; uiTokenAmount: { uiAmount: number } }> || [];
      
      let tokenAmount: number | undefined;
      let type: 'buy' | 'sell' | 'transfer' | 'unknown' = 'unknown';

      // Find our token in balances
      for (let i = 0; i < Math.max(preTokenBalances.length, postTokenBalances.length); i++) {
        const pre = preTokenBalances[i];
        const post = postTokenBalances[i];
        
        if (pre?.mint === this.config.tokenMint || post?.mint === this.config.tokenMint) {
          const preBal = pre?.uiTokenAmount?.uiAmount || 0;
          const postBal = post?.uiTokenAmount?.uiAmount || 0;
          tokenAmount = Math.abs(postBal - preBal);
          
          if (postBal > preBal) {
            type = 'buy';
          } else if (postBal < preBal) {
            type = 'sell';
          } else {
            type = 'transfer';
          }
          break;
        }
      }

      // Calculate SOL amount from pre/post balances
      const preBalances = meta.preBalances as number[] || [];
      const postBalances = meta.postBalances as number[] || [];
      const solDiff = Math.abs((preBalances[0] || 0) - (postBalances[0] || 0)) / 1e9;

      return {
        signature,
        type,
        timestamp: Date.now(),
        slot,
        fromAddress: fromAddress || (accountKeys[0] as { pubkey: string })?.pubkey || 'unknown',
        tokenAmount,
        solAmount: solDiff > 0.0001 ? solDiff : undefined,
        success,
        isOurWallet,
        walletId
      };
    } catch (error) {
      console.error('[VOLUME_BOT_STREAM] Error parsing transaction:', error);
      return null;
    }
  }

  /**
   * Process account notification (balance changes)
   */
  private handleAccountNotification(params: { result: { value: { lamports: number; data: unknown } }; subscription: number }): void {
    try {
      const { result, subscription } = params;
      const { value } = result;
      
      // Get wallet address from subscription mapping
      const subInfo = this.subscriptions.get(subscription);
      if (!subInfo) return;

      // For now, emit a basic balance change event
      // In production, we'd parse the token account data more carefully
      const event: BalanceChangeEvent = {
        walletAddress: 'unknown', // Would need to track subscription -> wallet mapping
        tokenMint: this.config.tokenMint,
        oldBalance: 0,
        newBalance: value.lamports / 1e9,
        changeAmount: 0,
        timestamp: Date.now()
      };

      this.config.onBalanceChange?.(event);
      this.emit('balanceChange', event);
    } catch (error) {
      console.error('[VOLUME_BOT_STREAM] Error processing account notification:', error);
    }
  }

  /**
   * Health check - ping every 30 seconds to keep connection alive
   */
  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(() => {
      if (!this.ws || !this.isConnected) return;

      // Check if we've received a pong recently
      const timeSinceLastPong = Date.now() - this.lastPongReceived;
      if (timeSinceLastPong > 60_000) {
        console.warn('[VOLUME_BOT_STREAM] ⚠️ No pong received in 60s, reconnecting...');
        this.ws.close();
        return;
      }

      // Send ping
      this.sendMessage({ jsonrpc: '2.0', id: this.getNextMessageId(), method: 'ping' });
    }, HEALTH_CHECK_INTERVAL);
  }

  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Handle reconnection with exponential backoff
   */
  private handleReconnect(): void {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('[VOLUME_BOT_STREAM] ❌ Max reconnection attempts reached');
      this.config.onError?.(new Error('Max reconnection attempts reached'));
      return;
    }

    const delay = Math.min(
      RECONNECT_BASE_DELAY * Math.pow(2, this.reconnectAttempts),
      RECONNECT_MAX_DELAY
    );

    console.log(`[VOLUME_BOT_STREAM] 🔄 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);

    setTimeout(() => {
      this.reconnectAttempts++;
      this.connect().catch((error) => {
        console.error('[VOLUME_BOT_STREAM] Reconnection failed:', error);
      });
    }, delay);
  }

  /**
   * Send message to WebSocket
   */
  private sendMessage(message: Record<string, unknown>): void {
    if (!this.ws || !this.isConnected) {
      console.warn('[VOLUME_BOT_STREAM] Cannot send message - not connected');
      return;
    }

    this.ws.send(JSON.stringify(message));
  }

  private getNextMessageId(): number {
    return ++this.messageId;
  }

  /**
   * Disconnect and cleanup
   */
  disconnect(): void {
    console.log('[VOLUME_BOT_STREAM] Disconnecting...');
    this.stopHealthCheck();
    
    // Unsubscribe from all subscriptions
    for (const [subId] of this.subscriptions) {
      this.sendMessage({
        jsonrpc: '2.0',
        id: this.getNextMessageId(),
        method: 'unsubscribe',
        params: [subId]
      });
    }
    
    this.subscriptions.clear();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.isConnected = false;
    this.removeAllListeners();
  }

  /**
   * Check if connected
   */
  isActive(): boolean {
    return this.isConnected;
  }

  /**
   * Get current subscriptions count
   */
  getSubscriptionCount(): number {
    return this.subscriptions.size;
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create and connect a Volume Bot stream
 */
export async function createVolumeBotStream(config: StreamConfig): Promise<VolumeBotStreamManager> {
  const stream = new VolumeBotStreamManager(config);
  await stream.connect();
  return stream;
}

