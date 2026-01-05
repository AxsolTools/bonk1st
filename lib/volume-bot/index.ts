/**
 * Volume Bot - Main Export
 * 
 * 🚀 AUTOMATED VOLUME GENERATION
 * 
 * This module provides everything you need to run automated volume
 * on any Solana token. Whether you're creating market activity or 
 * providing liquidity, this is your command center.
 * 
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  📚 QUICK START GUIDE                                          │
 * ├─────────────────────────────────────────────────────────────────┤
 * │                                                                 │
 * │  1. Import the manager:                                        │
 * │     import { startSession, stopSession } from '@/lib/volume-bot' │
 * │                                                                 │
 * │  2. Start a session:                                           │
 * │     const { session } = await startSession({                   │
 * │       userId: 'your-user-id',                                  │
 * │       tokenMint: 'token-mint-address',                         │
 * │       wallets: yourWallets                                     │
 * │     });                                                        │
 * │                                                                 │
 * │  3. Monitor your session progress 📈                           │
 * │                                                                 │
 * │  4. Stop when done:                                            │
 * │     await stopSession(userId, tokenMint);                      │
 * │                                                                 │
 * └─────────────────────────────────────────────────────────────────┘
 * 
 * ⚠️ IMPORTANT:
 * - Always keep emergency stops enabled
 * - Start with small amounts to test
 * - NOT FINANCIAL ADVICE - you could lose everything
 * - Use at your own risk
 * 
 * 🧠 STRATEGY GUIDE:
 * 
 * DBPM (Dynamic Buy-Pressure Maintenance) 🐂
 *   Best for: Creating buy pressure, increasing price
 *   How it works: More buys than sells, randomized patterns
 *   Use when: You want to increase buying activity
 * 
 * PLD (Predictive Liquidity-Depth) 🛡️
 *   Best for: Price protection and stabilization
 *   How it works: Counter-buys when price drops
 *   Use when: Protecting against price drops
 * 
 * CMWA (Concurrent Multi-Wallet Arbitrage) 🧠
 *   Best for: Stable markets, spread capture
 *   How it works: Advanced multi-wallet trading patterns
 *   Use when: Market is stable, capturing spreads
 */

// Types
export * from './types';

// Core modules
export * from './hsmac-acl';
export * from './hsmac-wae';
export * from './hsmac-executor';
export * from './manager';

// Real-time monitoring (Helius Enhanced WebSockets)
export * from './volume-bot-stream';

// Smart Profit automation
export * from './volume-bot-smart-profit';

// Re-export commonly used items for convenience
export { 
  STRATEGIES, 
  PHASES, 
  PROTOCOL_STATES,
  engage,
  disengage,
  getStatus as getACLStatus,
  onStatusUpdate as onACLStatusUpdate,
  onEmergencyStop as onACLEmergencyStop
} from './hsmac-acl';

export {
  generateExecutionPlan,
  planToExecutionPlan,
  DEFAULT_RULES,
  RuleCheckError
} from './hsmac-wae';

export {
  executeTransactions,
  summarizeExecutions
} from './hsmac-executor';

export {
  startSession,
  stopSession,
  emergencyStop,
  getSettings,
  saveSettings,
  getSessionStatus,
  listActiveSessions,
  subscribeToEvents
} from './manager';

// Real-time stream exports
export {
  VolumeBotStreamManager,
  createVolumeBotStream,
  type StreamConfig,
  type TransactionEvent,
  type PriceChangeEvent,
  type BalanceChangeEvent
} from './volume-bot-stream';

// Smart Profit exports
export {
  SmartProfitManager,
  createSmartProfitManager,
  loadSmartProfitSettings,
  saveSmartProfitSettings,
  type SmartProfitSettings,
  type SmartProfitState,
  type SmartProfitExecution
} from './volume-bot-smart-profit';
