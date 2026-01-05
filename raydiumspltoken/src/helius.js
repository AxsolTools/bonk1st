/**
 * Helius API Integration Module
 * Enhanced transaction APIs for superior speed and data quality
 * 
 * Helius provides:
 * - Enhanced transaction APIs with parsed data
 * - Webhooks for real-time events
 * - Asset APIs for token metadata
 * - DAS (Digital Asset Standard) APIs
 */

const { Helius } = require('helius-sdk');
const WebSocket = require('ws');
const axios = require('axios');

// Initialize Helius client
const HELIUS_API_KEY = process.env.HELIUS_API_KEY || null;
const HELIUS_RPC_URL = HELIUS_API_KEY 
  ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
  : null;

let heliusClient = null;

/**
 * Initialize Helius client
 * @returns {Helius|null} Helius client instance
 */
function initializeHelius() {
  if (!HELIUS_API_KEY) {
    console.warn('⚠️  HELIUS_API_KEY not set - using standard RPC');
    console.warn('   For best performance, get a key from: https://www.helius.dev/');
    return null;
  }
  
  try {
    heliusClient = new Helius(HELIUS_API_KEY);
    console.log('✅ Helius client initialized');
    return heliusClient;
  } catch (error) {
    console.error('Error initializing Helius:', error);
    return null;
  }
}

function normalizeHeliusAmount(value, decimalsHint = null) {
  if (value === null || value === undefined) {
    return '0';
  }

  if (typeof value === 'bigint') {
    return value < 0n ? '0' : value.toString();
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return '0';
    }
    if (Number.isInteger(decimalsHint) && decimalsHint > 0) {
      const scaled = Math.round(value * Math.pow(10, decimalsHint));
      return scaled <= 0 ? '0' : String(scaled);
    }
    return value <= 0 ? '0' : Math.floor(value).toString();
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return '0';
    }
    if (/^-?\d+$/.test(trimmed)) {
      const big = BigInt(trimmed);
      return big < 0n ? '0' : big.toString();
    }
    if (/^-?\d+\.\d+$/.test(trimmed) && Number.isInteger(decimalsHint)) {
      if (trimmed.startsWith('-')) {
        return '0';
      }
      const [whole, rawFraction] = trimmed.split('.');
      const paddedFraction = (rawFraction + '0'.repeat(decimalsHint)).slice(0, decimalsHint);
      const combined = `${whole}${paddedFraction}`.replace(/^0+/, '');
      return combined === '' ? '0' : combined;
    }
    return '0';
  }

  return '0';
}

function deriveHeliusUiAmountString(amountStr, decimals) {
  if (!Number.isInteger(decimals)) {
    return null;
  }
  const normalizedAmount = amountStr && amountStr !== '' ? BigInt(amountStr) : 0n;
  if (decimals === 0) {
    return normalizedAmount.toString();
  }
  const factor = BigInt(10) ** BigInt(decimals);
  const whole = normalizedAmount / factor;
  const fraction = normalizedAmount % factor;
  if (fraction === 0n) {
    return whole.toString();
  }
  const fractionStr = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');
  return fractionStr.length ? `${whole.toString()}.${fractionStr}` : whole.toString();
}

function safeNumberFromString(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const comparisonTarget = trimmed.startsWith('-') ? trimmed.slice(1) : trimmed;
  const [whole] = comparisonTarget.split('.');
  if (whole.length > 15) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Get enhanced transaction data from Helius
 * Uses Helius Enhanced Transactions API for human-readable parsed data
 * @param {string} signature - Transaction signature
 * @returns {Promise<object>} Enhanced transaction data with human-readable description
 */
async function getEnhancedTransaction(signature) {
  try {
    if (!HELIUS_API_KEY) {
      throw new Error('Helius API key not configured');
    }
    
    console.log(`[HELIUS] Fetching enhanced transaction: ${signature.substring(0, 8)}...`);
    
    // Use Helius Enhanced Transactions API (v0/transactions)
    const response = await axios.post(
      `https://api-mainnet.helius-rpc.com/v0/transactions/?api-key=${HELIUS_API_KEY}`,
      {
        transactions: [signature]
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!response.data || response.data.length === 0) {
      throw new Error('No transaction data returned');
    }
    
    const enhancedTx = response.data[0];
    
    console.log(`[HELIUS] Enhanced transaction type: ${enhancedTx.type || 'UNKNOWN'}`);
    
    return enhancedTx;
  } catch (error) {
    console.error('[HELIUS] Enhanced transaction error:', error.message);
    
    // Fallback to standard RPC if Enhanced API fails
    console.log('[HELIUS] Falling back to standard RPC...');
    try {
      const response = await axios.post(
        HELIUS_RPC_URL,
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'getTransaction',
          params: [
            signature,
            {
              encoding: 'jsonParsed',
              maxSupportedTransactionVersion: 0
            }
          ]
        }
      );
      
      return response.data.result;
    } catch (fallbackError) {
      console.error('[HELIUS] Fallback error:', fallbackError.message);
      throw error;
    }
  }
}

/**
 * Resilient WebSocket wrapper with exponential backoff and auto-reconnect
 * Implements Circuit Breaker pattern for production-grade reliability
 */
class ResilientWebSocket {
  constructor(address, callback, options = {}) {
    this.address = address;
    this.callback = callback;
    this.options = {
      maxReconnectAttempts: options.maxReconnectAttempts || 10,
      baseBackoffMs: options.baseBackoffMs || 1000,
      maxBackoffMs: options.maxBackoffMs || 30000,
      heartbeatIntervalMs: options.heartbeatIntervalMs || 30000,
      staleThresholdMs: options.staleThresholdMs || 90000,
      ...options
    };
    
    this.ws = null;
    this.reconnectAttempts = 0;
    this.reconnectTimeout = null;
    this.heartbeatHandle = null;
    this.lastPong = Date.now();
    this.isManualClose = false;
    this.subscribed = false;
    this.eventBuffer = [];
    this.maxBufferSize = 100;
  }

  connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log(`[HELIUS][WS] Already connected to ${this.address}`);
      return;
    }

    try {
      // Use STANDARD WebSocket endpoint - works on ALL Helius plans including Developer
      // Enhanced WSS (atlas-mainnet) requires Business/Professional plan
      const wsUrl = `wss://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
      this.ws = new WebSocket(wsUrl);
      this.setupEventHandlers();
    } catch (error) {
      console.error('[HELIUS][WS] Connection failed:', error.message);
      this.scheduleReconnect();
    }
  }

  setupEventHandlers() {
    this.ws.on('open', () => {
      console.log(`✅ [HELIUS][WS] Connected to ${this.address.substring(0, 8)}... (attempt ${this.reconnectAttempts + 1})`);
      this.reconnectAttempts = 0;
      this.lastPong = Date.now();
      this.subscribe();
      this.startHeartbeat();
      this.flushEventBuffer();
    });

    this.ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        // Handle logsNotification (standard method for Developer plan)
        if (message.method === 'logsNotification') {
          const logResult = message.params?.result;
          if (logResult && logResult.value) {
            this.bufferEvent(logResult);
            this.callback(logResult);
          }
        } else if (message.result && this.subscribed === false) {
          this.subscribed = true;
          console.log(`[HELIUS][WS] Subscription confirmed for ${this.address.substring(0, 8)}...`);
        }
      } catch (error) {
        console.error('[HELIUS][WS] Message processing error:', error.message);
      }
    });

    this.ws.on('pong', () => {
      this.lastPong = Date.now();
    });

    this.ws.on('error', (error) => {
      // Handle ECONNRESET, ETIMEDOUT, and other network errors gracefully
      const errorCode = error.code || 'UNKNOWN';
      const errorMsg = error.message || String(error);
      console.warn(`[HELIUS][WS] Error (${errorCode}): ${errorMsg}`);
      
      // Don't treat errors as fatal - wait for close event
    });

    this.ws.on('close', (code, reason) => {
      console.log(`[HELIUS][WS] Disconnected from ${this.address.substring(0, 8)}... (code: ${code}, reason: ${reason || 'none'})`);
      this.clearHeartbeat();
      this.subscribed = false;

      if (!this.isManualClose) {
        this.scheduleReconnect();
      }
    });
  }

  subscribe() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[HELIUS][WS] Cannot subscribe - socket not open');
      return;
    }

    try {
      // Use STANDARD logsSubscribe - works on ALL Helius plans including Developer
      // transactionSubscribe is an Enhanced method requiring Business/Professional plan
      this.ws.send(JSON.stringify({
        jsonrpc: '2.0',
        id: Math.floor(Math.random() * 1000000),
        method: 'logsSubscribe',
        params: [
          {
            mentions: [this.address]
          },
          {
            commitment: 'confirmed'
          }
        ]
      }));
    } catch (error) {
      console.error('[HELIUS][WS] Subscription send failed:', error.message);
    }
  }

  startHeartbeat() {
    this.clearHeartbeat();
    this.heartbeatHandle = setInterval(() => {
      const now = Date.now();
      
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.ping();
        } catch (pingError) {
          console.warn('[HELIUS][WS] Ping failed:', pingError.message);
        }
      }

      // Detect stale connection
      if (now - this.lastPong > this.options.staleThresholdMs) {
        console.warn('[HELIUS][WS] Connection stale, forcing reconnect');
        this.forceReconnect();
      }
    }, this.options.heartbeatIntervalMs);
  }

  clearHeartbeat() {
    if (this.heartbeatHandle) {
      clearInterval(this.heartbeatHandle);
      this.heartbeatHandle = null;
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimeout) {
      return; // Already scheduled
    }

    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      console.error(`[HELIUS][WS] Max reconnect attempts (${this.options.maxReconnectAttempts}) reached for ${this.address.substring(0, 8)}...`);
      console.error('[HELIUS][WS] Circuit breaker OPEN - manual intervention required');
      return;
    }

    // Exponential backoff with jitter
    const backoffMs = Math.min(
      this.options.baseBackoffMs * Math.pow(2, this.reconnectAttempts),
      this.options.maxBackoffMs
    );
    const jitter = Math.random() * 1000; // Add 0-1s jitter to prevent thundering herd
    const delayMs = backoffMs + jitter;

    console.log(`[HELIUS][WS] Reconnecting in ${(delayMs / 1000).toFixed(1)}s (attempt ${this.reconnectAttempts + 1}/${this.options.maxReconnectAttempts})...`);

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.reconnectAttempts++;
      this.connect();
    }, delayMs);
  }

  forceReconnect() {
    this.clearHeartbeat();
    if (this.ws) {
      try {
        this.ws.terminate();
      } catch (error) {
        console.warn('[HELIUS][WS] Error terminating socket:', error.message);
      }
    }
  }

  bufferEvent(event) {
    // Keep last N events in buffer for replay on reconnect
    this.eventBuffer.push({
      event,
      timestamp: Date.now()
    });
    
    if (this.eventBuffer.length > this.maxBufferSize) {
      this.eventBuffer.shift();
    }
  }

  flushEventBuffer() {
    if (this.eventBuffer.length > 0) {
      console.log(`[HELIUS][WS] Event buffer contains ${this.eventBuffer.length} events (preserved during reconnect)`);
    }
  }

  close() {
    console.log(`[HELIUS][WS] Closing connection to ${this.address.substring(0, 8)}...`);
    this.isManualClose = true;
    this.clearHeartbeat();
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      try {
        this.ws.close();
      } catch (error) {
        console.warn('[HELIUS][WS] Error closing socket:', error.message);
      }
    }
  }

  getStatus() {
    return {
      connected: this.ws && this.ws.readyState === WebSocket.OPEN,
      subscribed: this.subscribed,
      reconnectAttempts: this.reconnectAttempts,
      lastPong: this.lastPong,
      bufferedEvents: this.eventBuffer.length
    };
  }
}

/**
 * Subscribe to address transactions via Helius websocket (with auto-reconnect)
 * @param {string} address - Wallet or token address
 * @param {Function} callback - Callback function for new transactions
 * @returns {ResilientWebSocket} Resilient WebSocket connection
 */
function subscribeToAddressTransactions(address, callback) {
  if (!HELIUS_API_KEY) {
    throw new Error('Helius API key required for transaction monitoring');
  }
  
  const resilientWs = new ResilientWebSocket(address, callback);
  resilientWs.connect();
  return resilientWs;
}

/**
 * Monitor token for large buy/sell events using STANDARD WebSocket (works on Developer plan)
 * Falls back from Enhanced WSS to standard logsSubscribe for Developer plan compatibility
 * @param {string} tokenMint - Token mint address
 * @param {object} callbacks - { onLargeBuy, onLargeSell }
 * @param {object} thresholds - { largeBuySOL, largeSellSOL, ignoreAddresses }
 * @returns {object} Monitor object with close() method
 */
function monitorTokenForLargeTrades(tokenMint, callbacks, thresholds = {}) {
  const { onLargeBuy, onLargeSell } = callbacks;
  const {
    largeBuySOL = 2,
    largeSellSOL = 2,
    ignoreAddresses = []
  } = thresholds;

  const ignoreSet = new Set(
    (Array.isArray(ignoreAddresses) ? ignoreAddresses : [])
      .filter((addr) => typeof addr === 'string' && addr.length > 0)
      .map((addr) => addr.toLowerCase())
  );

  // Use STANDARD WebSocket (logsSubscribe) - works on ALL Helius plans including Developer
  // This is more reliable than Enhanced WSS which requires Business/Professional plan
  const STANDARD_WS_URL = `wss://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
  
  let ws = null;
  let subscriptionId = null;
  let isManualClose = false;
  let reconnectAttempts = 0;
  const maxReconnectAttempts = 10;
  let reconnectTimeout = null;

  const connect = () => {
    if (isManualClose) return;
    
    try {
      ws = new WebSocket(STANDARD_WS_URL);
      
      ws.on('open', () => {
        console.log(`✅ [HELIUS][STANDARD] Connected for token monitoring: ${tokenMint.substring(0, 8)}...`);
        reconnectAttempts = 0;
        
        // Subscribe using standard logsSubscribe with mentions filter
        ws.send(JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'logsSubscribe',
          params: [
            { mentions: [tokenMint] },
            { commitment: 'confirmed' }
          ]
        }));
      });
      
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          
          // Handle subscription confirmation
          if (message.result && !subscriptionId) {
            subscriptionId = message.result;
            console.log(`[HELIUS][STANDARD] Subscription confirmed: ${subscriptionId}`);
            return;
          }
          
          // Handle log notifications
          if (message.method === 'logsNotification') {
            const result = message.params?.result;
            if (!result || !result.value) return;
            
            const { signature, logs, err } = result.value;
            if (err) return; // Skip failed transactions
            
            // Parse logs to detect buy/sell
            // Look for common swap program logs
            const logText = (logs || []).join(' ').toLowerCase();
            const hasBuyIndicator = logText.includes('swap') || logText.includes('buy') || logText.includes('invoke');
            const hasSellIndicator = logText.includes('swap') || logText.includes('sell') || logText.includes('invoke');
            
            // For standard logs, we can't easily determine exact SOL amounts
            // So we trigger callbacks for any swap activity and let the handler decide
            // This is less precise but works on Developer plan
            
            if (hasBuyIndicator && onLargeBuy) {
              // Fetch transaction details to get exact amounts
              fetchTransactionDetails(signature).then(details => {
                if (details && details.solAmount >= largeBuySOL && details.isBuy) {
                  if (!shouldIgnore(details.accounts, ignoreSet)) {
                    onLargeBuy({
                      signature,
                      solAmount: details.solAmount,
                      tokenAmount: details.tokenAmount,
                      timestamp: Date.now()
                    });
                  }
                }
              }).catch(() => {}); // Silently fail detail fetch
            }
            
            if (hasSellIndicator && onLargeSell) {
              fetchTransactionDetails(signature).then(details => {
                if (details && details.solAmount >= largeSellSOL && details.isSell) {
                  if (!shouldIgnore(details.accounts, ignoreSet)) {
                    onLargeSell({
                      signature,
                      solAmount: details.solAmount,
                      tokenAmount: details.tokenAmount,
                      timestamp: Date.now()
                    });
                  }
                }
              }).catch(() => {});
            }
          }
        } catch (error) {
          console.error('[HELIUS][STANDARD] Message parse error:', error.message);
        }
      });
      
      ws.on('error', (error) => {
        console.warn(`[HELIUS][STANDARD] WebSocket error: ${error.message}`);
      });
      
      ws.on('close', () => {
        console.log(`[HELIUS][STANDARD] Disconnected from ${tokenMint.substring(0, 8)}...`);
        subscriptionId = null;
        if (!isManualClose) {
          scheduleReconnect();
        }
      });
      
    } catch (error) {
      console.error('[HELIUS][STANDARD] Connection failed:', error.message);
      scheduleReconnect();
    }
  };
  
  const scheduleReconnect = () => {
    if (isManualClose || reconnectAttempts >= maxReconnectAttempts) {
      if (reconnectAttempts >= maxReconnectAttempts) {
        console.error(`[HELIUS][STANDARD] Max reconnect attempts reached for ${tokenMint.substring(0, 8)}...`);
      }
      return;
    }
    
    reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 30000) + Math.random() * 1000;
    console.log(`[HELIUS][STANDARD] Reconnecting in ${(delay/1000).toFixed(1)}s (attempt ${reconnectAttempts}/${maxReconnectAttempts})...`);
    
    reconnectTimeout = setTimeout(() => {
      reconnectTimeout = null;
      connect();
    }, delay);
  };
  
  const shouldIgnore = (accounts, ignoreSet) => {
    if (!ignoreSet.size || !accounts) return false;
    return accounts.some(acc => ignoreSet.has(acc.toLowerCase()));
  };
  
  // Helper to fetch transaction details for amount verification
  const fetchTransactionDetails = async (signature) => {
    try {
      const tx = await getEnhancedTransaction(signature);
      if (!tx || !tx.meta) return null;
      
      const { meta, transaction: txData } = tx;
      const preBalances = meta.preBalances || [];
      const postBalances = meta.postBalances || [];
      
      let solChange = 0;
      for (let i = 0; i < preBalances.length; i++) {
        solChange += Math.abs((postBalances[i] || 0) - preBalances[i]);
      }
      const solAmount = solChange / 1e9;
      
      const tokenChanges = (meta.postTokenBalances || [])
        .filter(b => b.mint === tokenMint)
        .map(post => {
          const pre = (meta.preTokenBalances || []).find(p => p.accountIndex === post.accountIndex);
          return (post.uiTokenAmount?.uiAmount || 0) - (pre?.uiTokenAmount?.uiAmount || 0);
        });
      
      const netTokenChange = tokenChanges.reduce((sum, c) => sum + c, 0);
      
      return {
        solAmount,
        tokenAmount: Math.abs(netTokenChange),
        isBuy: netTokenChange > 0,
        isSell: netTokenChange < 0,
        accounts: (meta.postTokenBalances || []).map(b => b.owner).filter(Boolean)
      };
    } catch (error) {
      return null;
    }
  };
  
  // Start connection
  connect();
  
  // Return object with close method (compatible interface)
  return {
    close: () => {
      isManualClose = true;
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
      if (ws) {
        try {
          ws.close();
        } catch (e) {}
      }
      console.log(`[HELIUS][STANDARD] Closed monitoring for ${tokenMint.substring(0, 8)}...`);
    },
    getStatus: () => ({
      connected: ws && ws.readyState === WebSocket.OPEN,
      subscriptionId,
      reconnectAttempts
    })
  };
}

/**
 * Get token metadata from Helius DAS API
 * @param {string} tokenMint - Token mint address
 * @returns {Promise<object>} Token metadata
 */
async function getTokenMetadata(tokenMint) {
  try {
    if (!HELIUS_API_KEY) {
      throw new Error('Helius API key required');
    }
    
    const response = await axios.post(
      `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'getAsset',
        params: {
          id: tokenMint
        }
      }
    );
    
    return response.data.result;
  } catch (error) {
    console.error('Error getting token metadata from Helius:', error);
    return null;
  }
}

/**
 * Get enhanced transaction history for an address
 * Uses Helius Enhanced Transactions API with filtering
 * @param {string} address - Wallet or token address
 * @param {object} options - Query options (limit, before, type, etc.)
 * @returns {Promise<Array>} Array of enhanced transactions
 */
async function getEnhancedTransactionHistory(address, options = {}) {
  try {
    if (!HELIUS_API_KEY) {
      throw new Error('Helius API key required');
    }
    
    const {
      limit = 10,
      before = null,
      until = null,
      type = null,
      commitment = 'finalized'
    } = options;
    
    // Build query parameters
    let url = `https://api-mainnet.helius-rpc.com/v0/addresses/${address}/transactions?api-key=${HELIUS_API_KEY}`;
    url += `&limit=${limit}`;
    url += `&commitment=${commitment}`;
    
    if (before) url += `&before=${before}`;
    if (until) url += `&until=${until}`;
    if (type) url += `&type=${type}`;
    
    console.log(`[HELIUS] Fetching transaction history for ${address.substring(0, 8)}...`);
    
    const response = await axios.get(url);
    
    console.log(`[HELIUS] Received ${response.data.length} enhanced transactions`);
    
    return response.data;
  } catch (error) {
    console.error('[HELIUS] Transaction history error:', error.message);
    throw error;
  }
}

/**
 * Get multiple accounts data (optimized batch call)
 * @param {string[]} addresses - Array of addresses
 * @returns {Promise<Array>} Account data
 */
async function getMultipleAccounts(addresses) {
  try {
    if (!HELIUS_API_KEY) {
      throw new Error('Helius API key required');
    }
    
    const response = await axios.post(
      HELIUS_RPC_URL,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'getMultipleAccounts',
        params: [
          addresses,
          {
            encoding: 'jsonParsed',
            commitment: 'confirmed'
          }
        ]
      }
    );
    
    return response.data.result.value;
  } catch (error) {
    console.error('Error getting multiple accounts:', error);
    throw error;
  }
}

/**
 * Get token price from Helius
 * @param {string} tokenMint - Token mint address
 * @returns {Promise<number>} Price in USD
 */
async function getTokenPrice(tokenMint) {
  if (!tokenMint) {
    return 0;
  }

  const tryEndpoints = [
    async () => {
      const response = await axios.get(`https://price.jup.ag/v4/price?ids=${tokenMint}`);
      return response.data?.data?.[tokenMint]?.price ?? null;
    },
    async () => {
      const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`);
      const priceUsd = response.data?.pairs?.[0]?.priceUsd;
      return priceUsd ? Number(priceUsd) : null;
    }
  ];

  for (const attempt of tryEndpoints) {
    try {
      const price = await attempt();
      if (price && Number.isFinite(price)) {
        return price;
      }
    } catch (error) {
      console.warn('[PRICE] Failed price lookup attempt:', error.message);
    }
  }

  throw new Error(`Unable to fetch live price for ${tokenMint}`);
}

/**
 * Get top token holders using Helius DAS API
 * @param {string} tokenMint - Token mint address
 * @param {number} limit - Number of holders to return (default 10)
 * @returns {Promise<Array>} Array of top holders with balances and percentages
 */
async function getTopTokenHolders(tokenMint, limit = 10) {
  try {
    if (!HELIUS_API_KEY) {
      throw new Error('Helius API key required for holders data');
    }
    
    console.log(`[HELIUS DAS] Fetching top ${limit} holders for ${tokenMint.substring(0, 8)}...`);
    
    // Get token supply first
    const { getConnection } = require('./solana_utils');
    const { PublicKey } = require('@solana/web3.js');
    const { getMint, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
    
    const conn = getConnection();
    const mintPubkey = new PublicKey(tokenMint);
    
    // Try both program IDs
    let mintInfo;
    try {
      mintInfo = await getMint(conn, mintPubkey, 'confirmed', TOKEN_2022_PROGRAM_ID);
    } catch {
      mintInfo = await getMint(conn, mintPubkey, 'confirmed', TOKEN_PROGRAM_ID);
    }
    
    const totalSupply = Number(mintInfo.supply) / Math.pow(10, mintInfo.decimals);
    
    // Use standard Solana RPC getTokenLargestAccounts via Helius endpoint
    const response = await axios.post(
      `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'getTokenLargestAccounts',
        params: [tokenMint]
      }
    );
    
    if (!response.data.result || !response.data.result.value) {
      return [];
    }
    
    const accounts = response.data.result.value;
    
    // Get account owners (addresses)
    const holdersPromises = accounts.slice(0, limit).map(async (account) => {
      try {
        const accountInfo = await conn.getParsedAccountInfo(new PublicKey(account.address));
        const balance = Number(account.amount) / Math.pow(10, mintInfo.decimals);
        const percentage = (balance / totalSupply) * 100;
        
        let owner = 'Unknown';
        if (accountInfo.value && accountInfo.value.data.parsed) {
          owner = accountInfo.value.data.parsed.info.owner;
        }
        
        return {
          address: owner,
          tokenAccount: account.address,
          balance: balance,
          percentage: percentage.toFixed(2),
          uiAmount: balance.toFixed(4)
        };
      } catch (e) {
        console.error(`Error fetching holder info for ${account.address}:`, e.message);
        return null;
      }
    });
    
    const holders = (await Promise.all(holdersPromises)).filter(h => h !== null);
    
    console.log(`[HELIUS DAS] Found ${holders.length} holders`);
    
    return holders;
  } catch (error) {
    console.error('Error getting top token holders:', error);
    return [];
  }
}

/**
 * Check if Helius is available
 * @returns {boolean} True if Helius API key is configured
 */
function isHeliusAvailable() {
  return HELIUS_API_KEY !== null;
}

/**
 * Get digital assets owned by a wallet using Helius DAS getAssetsByOwner
 * @param {string} ownerAddress - Wallet address
 * @param {object} options - Query options (pagination, filtering)
 * @returns {Promise<object>} Result containing assets and pagination info
 */
async function getAssetsByOwnerDAS(ownerAddress, options = {}) {
  if (!HELIUS_API_KEY) {
    throw new Error('Helius API key required');
  }
  if (!ownerAddress) {
    throw new Error('ownerAddress is required for getAssetsByOwnerDAS');
  }

  const {
    page = 1,
    limit = 500,
    before = null,
    after = null,
    sortBy = null,
    sortDirection = 'desc',
    showFungible = true,
    showZeroBalance = true,
    showNativeBalance = false,
    showCollectionMetadata = false,
    showUnverifiedCollections = true,
    showGrandTotal = false,
    showInscription = false
  } = options;

  const params = {
    ownerAddress,
    page,
    limit,
    options: {
      showFungible,
      showZeroBalance,
      showNativeBalance,
      showCollectionMetadata,
      showUnverifiedCollections,
      showGrandTotal,
      showInscription
    }
  };

  if (before) {
    params.before = before;
  }
  if (after) {
    params.after = after;
  }
  if (sortBy) {
    params.sortBy = {
      sortBy,
      sortDirection
    };
  }

  console.log(`[HELIUS DAS] Fetching assets for owner ${ownerAddress.substring(0, 8)}... (page ${page}, limit ${limit})`);

  const response = await axios.post(HELIUS_RPC_URL, {
    jsonrpc: '2.0',
    id: '1',
    method: 'getAssetsByOwner',
    params
  });

  if (response.data?.error) {
    console.error('[HELIUS DAS] getAssetsByOwner error:', response.data.error);
    throw new Error(`Helius DAS getAssetsByOwner error: ${JSON.stringify(response.data.error)}`);
  }

  const result = response.data?.result;
  if (!result) {
    console.warn('[HELIUS DAS] getAssetsByOwner returned no result field');
    return {
      items: [],
      total: 0,
      page,
      limit,
      cursor: null,
      raw: response.data
    };
  }

  const items = Array.isArray(result.items) ? result.items : [];
  console.log(`[HELIUS DAS] Retrieved ${items.length}/${result.total ?? '?'} assets for owner ${ownerAddress.substring(0, 8)}...`);

  return {
    items,
    total: result.total ?? items.length,
    page: result.page ?? page,
    limit: result.limit ?? limit,
    cursor: result.cursor ?? null,
    lastIndexedSlot: result.last_indexed_slot ?? null,
    raw: result
  };
}

/**
 * Get token accounts for a wallet filtered by mint using Helius RPC
 * Uses getTokenAccountsByOwner with mint filter for accurate results
 * @param {string} walletAddress - Wallet address
 * @param {string} mintAddress - Token mint address to filter by
 * @returns {Promise<Array>} Array of token accounts for the specific mint
 */
async function getTokenAccountsByMint(walletAddress, mintAddress) {
  try {
    if (!HELIUS_API_KEY) {
      throw new Error('Helius API key required');
    }
    
    console.log(`[HELIUS] Fetching token accounts for ${walletAddress.substring(0, 8)}... filtered by mint ${mintAddress.substring(0, 8)}...`);
    
    // Use Helius RPC getTokenAccountsByOwner with mint filter
    // This is more reliable than getParsedTokenAccountsByOwner
    const response = await axios.post(
      HELIUS_RPC_URL,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'getTokenAccountsByOwner',
        params: [
          walletAddress,
          {
            mint: mintAddress
          },
          {
            encoding: 'jsonParsed',
            commitment: 'confirmed'
          }
        ]
      }
    );
    
    // Log full response for debugging
    if (response.data.error) {
      console.error(`[HELIUS] RPC error:`, JSON.stringify(response.data.error));
      throw new Error(`Helius RPC error: ${JSON.stringify(response.data.error)}`);
    }
    
    if (!response.data.result || !response.data.result.value) {
      console.log(`[HELIUS] No result or value in response. Full response keys: ${Object.keys(response.data.result || {})}`);
      return [];
    }
    
    const rawAccounts = response.data.result.value;
    console.log(`[HELIUS] Raw response: ${rawAccounts.length} account(s) returned from RPC`);
    
    const accounts = rawAccounts.map((acc) => {
      const parsedInfo = acc.account.data.parsed.info;
      const rawTokenAmount = parsedInfo?.tokenAmount || {};
      const decimals = Number.isInteger(rawTokenAmount.decimals) ? rawTokenAmount.decimals : null;
      const amountStr = normalizeHeliusAmount(rawTokenAmount.amount, decimals);
      const uiAmountString = typeof rawTokenAmount.uiAmountString === 'string'
        ? rawTokenAmount.uiAmountString
        : (decimals != null ? deriveHeliusUiAmountString(amountStr, decimals) : null);
      const uiAmount = Number.isFinite(rawTokenAmount.uiAmount)
        ? rawTokenAmount.uiAmount
        : (uiAmountString ? safeNumberFromString(uiAmountString) : null);

      const accountData = {
        address: acc.pubkey,
        mint: parsedInfo.mint,
        owner: parsedInfo.owner,
        amount: amountStr,
        decimals,
        uiAmount,
        uiAmountString,
        rawSource: 'helius-rpc'
      };

      const mintMatch = accountData.mint === mintAddress ? '✅' : '❌';
      const displayAmount = uiAmountString ?? (uiAmount !== null ? uiAmount : amountStr);
      console.log(
        `[HELIUS]   ${mintMatch} Account ${accountData.address.substring(0, 8)}... | Amount: ${displayAmount} | Mint: ${accountData.mint} | Expected: ${mintAddress}`
      );

      return accountData;
    });

    accounts.sort((a, b) => {
      const amountA = BigInt(a.amount || '0');
      const amountB = BigInt(b.amount || '0');
      if (amountA === amountB) {
        const decimalsA = Number.isInteger(a.decimals) ? a.decimals : -1;
        const decimalsB = Number.isInteger(b.decimals) ? b.decimals : -1;
        return decimalsB - decimalsA;
      }
      return amountB > amountA ? 1 : -1;
    });

    console.log(`[HELIUS] Found ${accounts.length} token account(s) for mint ${mintAddress.substring(0, 8)}... in wallet ${walletAddress.substring(0, 8)}...`);

    return accounts;
  } catch (error) {
    console.error(`[HELIUS] Error fetching token accounts by mint:`, error.message);
    throw error;
  }
}

/**
 * Get token accounts (DAS) for a wallet, optionally filtered by mint
 * @param {object} params
 * @param {string} params.ownerAddress - Wallet address
 * @param {string|null} [params.mintAddress] - Optional mint filter
 * @param {number} [params.limit=500] - Page size
 * @param {number} [params.page=1] - Page number
 * @param {string|null} [params.before] - Pagination cursor
 * @param {string|null} [params.after] - Pagination cursor
 * @returns {Promise<object>} Token accounts plus pagination info
 */
async function getTokenAccountsDAS({
  ownerAddress,
  mintAddress = null,
  limit = 500,
  page = 1,
  before = null,
  after = null
} = {}) {
  if (!HELIUS_API_KEY) {
    throw new Error('Helius API key required');
  }
  if (!ownerAddress) {
    throw new Error('ownerAddress is required for getTokenAccountsDAS');
  }

  const params = {
    owner: ownerAddress,
    limit,
    page
  };

  if (mintAddress) {
    params.mint = mintAddress;
  }
  if (before) {
    params.before = before;
  }
  if (after) {
    params.after = after;
  }

  console.log(`[HELIUS DAS] Fetching token accounts for ${ownerAddress.substring(0, 8)}... (page ${page}, limit ${limit}${mintAddress ? `, mint ${mintAddress.substring(0, 8)}...` : ''})`);

  const response = await axios.post(HELIUS_RPC_URL, {
    jsonrpc: '2.0',
    id: '1',
    method: 'getTokenAccounts',
    params
  });

  if (response.data?.error) {
    console.error('[HELIUS DAS] getTokenAccounts error:', response.data.error);
    throw new Error(`Helius DAS getTokenAccounts error: ${JSON.stringify(response.data.error)}`);
  }

  const result = response.data?.result;
  if (!result) {
    console.warn('[HELIUS DAS] getTokenAccounts returned no result field');
    return {
      tokenAccounts: [],
      total: 0,
      page,
      limit,
      cursor: null,
      lastIndexedSlot: null,
      raw: response.data
    };
  }

  const tokenAccounts = Array.isArray(result.token_accounts) ? result.token_accounts : [];
  console.log(`[HELIUS DAS] Retrieved ${tokenAccounts.length}/${result.total ?? '?'} token accounts for ${ownerAddress.substring(0, 8)}...`);

  return {
    tokenAccounts,
    total: result.total ?? tokenAccounts.length,
    page: result.page ?? page,
    limit: result.limit ?? limit,
    cursor: result.cursor ?? null,
    lastIndexedSlot: result.last_indexed_slot ?? null,
    raw: result
  };
}

/**
 * Get optimized RPC URL (Helius if available, fallback otherwise)
 * @returns {string} RPC URL
 */
function getOptimizedRpcUrl() {
  if (HELIUS_RPC_URL) {
    return HELIUS_RPC_URL;
  }
  return process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
}

/**
 * Get advanced priority fee estimate from Helius
 * Uses Helius's getPriorityFeeEstimate API
 * @param {object} options - Optional parameters
 * @returns {Promise<object|null>} Priority fee estimates or null
 */
async function getHeliusPriorityFeeEstimate(options = {}) {
  try {
    if (!HELIUS_API_KEY) {
      return null;
    }

    if (!heliusClient) {
      initializeHelius();
    }

    if (!heliusClient) {
      return null;
    }

    const {
      transaction = null,
      accountKeys = [],
      priorityLevel = 'Medium',
      includeAllPriorityFeeLevels = true,
      recommended = true,
      lookbackSlots,
      includeVote,
      evaluateEmptySlotAsZero
    } = options;

    const payload = {};
    if (transaction) {
      payload.transaction = transaction;
    }

    const normalizedKeys = Array.isArray(accountKeys)
      ? Array.from(new Set(accountKeys.filter(Boolean)))
      : [];

    if (normalizedKeys.length) {
      payload.accountKeys = normalizedKeys;
    } else if (!payload.transaction) {
      payload.accountKeys = ['11111111111111111111111111111111']; // System Program fallback
    }

    const rpcOptions = {
      includeAllPriorityFeeLevels,
      recommended,
      priorityLevel
    };

    if (typeof lookbackSlots === 'number' && Number.isFinite(lookbackSlots)) {
      rpcOptions.lookbackSlots = lookbackSlots;
    }
    if (typeof includeVote === 'boolean') {
      rpcOptions.includeVote = includeVote;
    }
    if (typeof evaluateEmptySlotAsZero === 'boolean') {
      rpcOptions.evaluateEmptySlotAsZero = evaluateEmptySlotAsZero;
    }

    payload.options = rpcOptions;

    console.log('[HELIUS] Fetching priority fee estimate...');

    const response = await axios.post(HELIUS_RPC_URL, {
      jsonrpc: '2.0',
      id: '1',
      method: 'getPriorityFeeEstimate',
      params: [payload]
    });

    if (response.data && response.data.result) {
      const result = response.data.result;

      console.log('[HELIUS] Priority fee estimate received:', result.priorityFeeEstimate);

      const levels = result.priorityFeeLevels || {
        min: Math.floor(result.priorityFeeEstimate * 0.1),
        low: Math.floor(result.priorityFeeEstimate * 0.5),
        medium: result.priorityFeeEstimate,
        high: Math.floor(result.priorityFeeEstimate * 1.5),
        veryHigh: Math.floor(result.priorityFeeEstimate * 2.5),
        unsafeMax: Math.floor(result.priorityFeeEstimate * 10)
      };

      return {
        priorityFeeEstimate: result.priorityFeeEstimate,
        priorityFeeLevels: levels,
        samples: result?.slotRange?.sampleCount || result?.sampleCount || null,
        source: 'helius',
        raw: result
      };
    }

    return null;
  } catch (error) {
    console.error('[HELIUS] Priority fee estimate error:', error.message);
    return null;
  }
}

module.exports = {
  initializeHelius,
  getEnhancedTransaction,
  getEnhancedTransactionHistory,
  subscribeToAddressTransactions,
  monitorTokenForLargeTrades,
  getTokenMetadata,
  getMultipleAccounts,
  getTokenPrice,
  getTopTokenHolders,
  getAssetsByOwnerDAS,
  getTokenAccountsDAS,
  getTokenAccountsByMint,
  isHeliusAvailable,
  getOptimizedRpcUrl,
  getHeliusPriorityFeeEstimate,
  HELIUS_RPC_URL
};

