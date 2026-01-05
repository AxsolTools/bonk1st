/**
 * Helius Enhanced WebSocket Stream Manager
 *
 * Maintains persistent low-latency subscriptions for:
 *  - accountSubscribe (Raydium pool + reserve vaults)
 *  - logsSubscribe (token mint transfer traces)
 *  - programSubscribe (Pump.fun migration events)
 *
 * Emits normalized events that the Algorithmic Control Layer (ACL) and
 * Wallet Allocation Engine (WAE) can consume.
 */

const WebSocket = require('ws');
const EventEmitter = require('events');
const BN = require('bn.js');

const HELIUS_API_KEY = process.env.HELIUS_API_KEY || null;
// Use STANDARD WebSocket endpoint - works on ALL Helius plans including Developer
// Enhanced WSS (atlas-mainnet) requires Business/Professional plan
const DEFAULT_WS_URL = HELIUS_API_KEY
  ? `wss://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
  : null;

const RETRY_BASE_DELAY_MS = 1500;
const MAX_RETRY_DELAY_MS = 15000;

function bnToDecimal(raw, decimals = 0) {
  try {
    const bn = raw instanceof BN ? raw : new BN(raw || 0);
    if (bn.isZero()) {
      return 0;
    }
    if (decimals === 0) {
      return bn.toNumber();
    }

    const divisor = new BN(10).pow(new BN(decimals));
    const whole = bn.div(divisor).toNumber();
    const remainder = bn.mod(divisor);
    const fraction = remainder.toNumber() / Math.pow(10, decimals);
    return whole + fraction;
  } catch (error) {
    console.error('[HELIUS_STREAMS] Failed to convert BN to decimal:', error.message);
    return 0;
  }
}

function extractTokenAmount(parsedInfo) {
  if (!parsedInfo || !parsedInfo.tokenAmount) {
    return { raw: new BN(0), amount: 0, decimals: 0 };
  }

  const rawAmount = new BN(parsedInfo.tokenAmount.amount || '0');
  const decimals = parsedInfo.tokenAmount.decimals || 0;
  const amount = parsedInfo.tokenAmount.uiAmountString
    ? parseFloat(parsedInfo.tokenAmount.uiAmountString)
    : parsedInfo.tokenAmount.uiAmount !== undefined
      ? parseFloat(parsedInfo.tokenAmount.uiAmount)
      : bnToDecimal(rawAmount, decimals);

  return { raw: rawAmount, amount, decimals };
}

function classifyLogEvent(logLines = []) {
  const normalized = (logLines || []).map((line) => line.toLowerCase());
  const hasSell = normalized.some((l) => l.includes('sell'));
  const hasBuy = normalized.some((l) => l.includes('buy'));

  if (hasBuy && hasSell) {
    return 'mixed';
  }
  if (hasBuy) {
    return 'buy';
  }
  if (hasSell) {
    return 'sell';
  }
  return 'unknown';
}

class HeliusStreamManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.apiKey = options.apiKey || HELIUS_API_KEY;
    this.wsUrl = options.wsUrl || DEFAULT_WS_URL;

    this.ws = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    this.requestId = 1;

    this.pendingRequests = new Map();
    this.subscriptionHandlers = new Map();
    this.activeDescriptors = new Map();

    this.poolSnapshots = new Map();
  }

  get supportsStreaming() {
    return !!this.wsUrl;
  }

  async ensureConnection() {
    if (!this.supportsStreaming) {
      throw new Error('Helius Enhanced WebSocket unavailable');
    }

    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    if (this.isConnecting) {
      await new Promise((resolve) => {
        const check = () => {
          if (this.isConnected) {
            resolve();
          } else {
            setTimeout(check, 100);
          }
        };
        check();
      });
      return;
    }

    try {
      await this.openWebSocket();
    } catch (error) {
      console.warn('[HELIUS_STREAMS] Initial connection attempt failed, retrying asynchronously:', error.message);
    }
  }

  async openWebSocket() {
    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        this.ws.terminate();
      } catch (err) {
        console.warn('[HELIUS_STREAMS] Error closing stale websocket:', err.message);
      }
    }

    this.isConnecting = true;

    await new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl);
      this.ws = ws;

      ws.on('open', () => {
        this.isConnecting = false;
        this.isConnected = true;
        this.reconnectAttempts = 0;
        console.log('[HELIUS_STREAMS] Connected to Helius Enhanced WebSocket');
        this.resubscribeAll();
        resolve();
      });

      ws.on('message', (message) => {
        this.handleMessage(message);
      });

      ws.on('error', (error) => {
        console.error('[HELIUS_STREAMS] WebSocket error:', error.message);
        if (String(error.message || '').includes('403')) {
          console.error('[HELIUS_STREAMS] Received 403 from Helius Enhanced WebSocket. Retrying with backoff.');
          this.emit('streaming-auth-warning', {
            message: 'Helius Enhanced WebSocket returned 403',
            timestamp: Date.now()
          });
        }
        if (!this.isConnected && this.isConnecting) {
          this.isConnecting = false;
          reject(error);
        }
        if (!this.isConnected) {
          this.scheduleReconnect();
        }
      });

      ws.on('close', () => {
        console.warn('[HELIUS_STREAMS] WebSocket disconnected');
        this.isConnected = false;
        this.isConnecting = false;
        this.scheduleReconnect();
      });
    });
  }

  scheduleReconnect() {
    if (!this.supportsStreaming) {
      return;
    }

    this.reconnectAttempts += 1;
    const delay = Math.min(RETRY_BASE_DELAY_MS * this.reconnectAttempts, MAX_RETRY_DELAY_MS);
    setTimeout(() => {
      this.openWebSocket().catch((err) => {
        console.error('[HELIUS_STREAMS] Reconnect attempt failed:', err.message);
        this.scheduleReconnect();
      });
    }, delay);
  }

  resubscribeAll() {
    for (const descriptor of this.activeDescriptors.values()) {
      this.sendSubscribe(descriptor);
    }
  }

  nextRequestId() {
    this.requestId += 1;
    return this.requestId;
  }

  send(payload, descriptor) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not ready');
    }

    const requestId = this.nextRequestId();
    const message = {
      jsonrpc: '2.0',
      id: requestId,
      ...payload
    };

    this.pendingRequests.set(requestId, {
      descriptor,
      payload: message
    });

    this.ws.send(JSON.stringify(message));
  }

  handleMessage(message) {
    let parsed;
    try {
      parsed = JSON.parse(message);
    } catch (error) {
      console.error('[HELIUS_STREAMS] Failed to parse websocket message:', error.message);
      return;
    }

    if (parsed.method === 'accountNotification') {
      const subId = parsed.params?.subscription;
      const handler = this.subscriptionHandlers.get(subId);
      if (handler) {
        handler(parsed.params.result);
      }
      return;
    }

    if (parsed.method === 'logsNotification') {
      const subId = parsed.params?.subscription;
      const handler = this.subscriptionHandlers.get(subId);
      if (handler) {
        handler(parsed.params.result);
      }
      return;
    }

    if (parsed.method === 'programNotification') {
      const subId = parsed.params?.subscription;
      const handler = this.subscriptionHandlers.get(subId);
      if (handler) {
        handler(parsed.params.result);
      }
      return;
    }

    if (parsed.id !== undefined) {
      const request = this.pendingRequests.get(parsed.id);
      if (!request) {
        return;
      }

      this.pendingRequests.delete(parsed.id);

      if (parsed.error) {
        console.error('[HELIUS_STREAMS] Subscription error:', parsed.error);
        if (request.descriptor) {
          this.emit('subscription-error', {
            descriptor: request.descriptor,
            error: parsed.error
          });
        }
        return;
      }

      const subscriptionId = parsed.result;
      this.subscriptionHandlers.set(subscriptionId, request.descriptor.handler);
      if (request.descriptor) {
        request.descriptor.subscriptionId = subscriptionId;
      }
    }
  }

  sendSubscribe(descriptor) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      if (descriptor.type === 'account') {
        this.send({
          method: 'accountSubscribe',
          params: [
            descriptor.address,
            {
              commitment: descriptor.commitment || 'processed',
              encoding: 'jsonParsed'
            }
          ]
        }, descriptor);
      } else if (descriptor.type === 'logs') {
        this.send({
          method: 'logsSubscribe',
          params: [
            descriptor.filter,
            {
              commitment: descriptor.commitment || 'processed'
            }
          ]
        }, descriptor);
      } else if (descriptor.type === 'program') {
        this.send({
          method: 'programSubscribe',
          params: [
            descriptor.programId,
            {
              commitment: descriptor.commitment || 'confirmed'
            }
          ]
        }, descriptor);
      }
    } catch (error) {
      console.error('[HELIUS_STREAMS] Failed to send subscription:', error.message);
    }
  }

  trackDescriptor(descriptor) {
    const key = `${descriptor.type}:${descriptor.key}`;
    this.activeDescriptors.set(key, descriptor);

    if (this.isConnected) {
      this.sendSubscribe(descriptor);
    }

    return () => {
      this.activeDescriptors.delete(key);
      if (descriptor.subscriptionId !== undefined) {
        this.unsubscribe(descriptor.subscriptionId);
      }
    };
  }

  unsubscribe(subscriptionId) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      this.ws.send(JSON.stringify({
        jsonrpc: '2.0',
        id: this.nextRequestId(),
        method: 'unsubscribe',
        params: [subscriptionId]
      }));
      this.subscriptionHandlers.delete(subscriptionId);
    } catch (error) {
      console.error('[HELIUS_STREAMS] Failed to unsubscribe:', error.message);
    }
  }

  /**
   * Subscribe to vault account updates for Raydium pool reserves.
   */
  async subscribePoolReserves(tokenMint, config) {
    const {
      baseVault,
      quoteVault,
      tokenDecimals = 6,
      quoteDecimals = 9
    } = config;

    await this.ensureConnection();

    const snapshot = this.poolSnapshots.get(tokenMint) || {
      tokenMint,
      base: { amount: 0, raw: new BN(0), decimals: tokenDecimals },
      quote: { amount: 0, raw: new BN(0), decimals: quoteDecimals },
      price: 0,
      updatedAt: Date.now()
    };

    this.poolSnapshots.set(tokenMint, snapshot);

    const handleReserveUpdate = (side) => (result) => {
      try {
        const parsedInfo = result?.value?.data?.parsed?.info;
        const tokenAmount = extractTokenAmount(parsedInfo);

        snapshot[side] = {
          amount: tokenAmount.amount,
          raw: tokenAmount.raw,
          decimals: tokenAmount.decimals
        };

        snapshot.updatedAt = Date.now();

        if (snapshot.base.amount > 0 && snapshot.quote.amount > 0) {
          snapshot.price = snapshot.quote.amount / snapshot.base.amount;
        }

        snapshot.liquidityScore = snapshot.quote.amount + (snapshot.base.amount * snapshot.price);

        this.emit('pool-update', {
          tokenMint,
          reserves: {
            baseAmount: snapshot.base.amount,
            quoteAmount: snapshot.quote.amount,
            baseDecimals: snapshot.base.decimals,
            quoteDecimals: snapshot.quote.decimals
          },
          price: snapshot.price,
          liquidityScore: snapshot.liquidityScore,
          contextSlot: result?.context?.slot || null,
          updatedAt: snapshot.updatedAt
        });
      } catch (error) {
        console.error('[HELIUS_STREAMS] Failed to process reserve update:', error.message);
      }
    };

    const baseDescriptor = {
      type: 'account',
      key: `${baseVault}:base`,
      address: baseVault,
      handler: handleReserveUpdate('base')
    };

    const quoteDescriptor = {
      type: 'account',
      key: `${quoteVault}:quote`,
      address: quoteVault,
      handler: handleReserveUpdate('quote')
    };

    const unsubscribeBase = this.trackDescriptor(baseDescriptor);
    const unsubscribeQuote = this.trackDescriptor(quoteDescriptor);

    return () => {
      unsubscribeBase();
      unsubscribeQuote();
    };
  }

  /**
   * Subscribe to token trade logs filtered by mint mentions.
   */
  async subscribeTokenLogs(tokenMint) {
    await this.ensureConnection();

    const descriptor = {
      type: 'logs',
      key: `logs:${tokenMint}`,
      filter: {
        mentions: [tokenMint]
      },
      handler: (result) => {
        const signature = result?.value?.signature || null;
        const logs = result?.value?.logs || [];
        const slot = result?.context?.slot || null;
        const classification = classifyLogEvent(logs);

        this.emit('trade-log', {
          tokenMint,
          signature,
          logs,
          slot,
          classification
        });
      }
    };

    return this.trackDescriptor(descriptor);
  }

  /**
   * Subscribe for Pump.fun migration events.
   */
  async subscribePumpfun(programId, tokenMint) {
    await this.ensureConnection();

    const descriptor = {
      type: 'program',
      key: `program:${programId}:${tokenMint}`,
      programId,
      handler: (result) => {
        const account = result?.value?.account || null;
        const pubkey = result?.value?.pubkey || null;
        this.emit('pumpfun-event', {
          tokenMint,
          account,
          pubkey,
          slot: result?.context?.slot || null
        });
      }
    };

    return this.trackDescriptor(descriptor);
  }

  /**
   * High-level helper to subscribe to all relevant streams for a token.
   */
  async subscribeToken(tokenMint, options = {}) {
    const unsubscribeFns = [];

    if (options.raydiumPool) {
      const { baseVault, quoteVault } = options.raydiumPool;
      if (baseVault && quoteVault) {
        const poolUnsub = await this.subscribePoolReserves(tokenMint, options.raydiumPool);
        unsubscribeFns.push(poolUnsub);
      }
    }

    const logsUnsub = await this.subscribeTokenLogs(tokenMint);
    unsubscribeFns.push(logsUnsub);

    if (options.pumpfunProgramId) {
      const programUnsub = await this.subscribePumpfun(options.pumpfunProgramId, tokenMint);
      unsubscribeFns.push(programUnsub);
    }

    return () => {
      unsubscribeFns.forEach((fn) => {
        try {
          fn();
        } catch (error) {
          console.warn('[HELIUS_STREAMS] Error during unsubscribe:', error.message);
        }
      });
    };
  }

  getSnapshot(tokenMint) {
    return this.poolSnapshots.get(tokenMint) || null;
  }
}

const heliusStreamManager = new HeliusStreamManager();

module.exports = heliusStreamManager;
module.exports.HeliusStreamManager = HeliusStreamManager;


