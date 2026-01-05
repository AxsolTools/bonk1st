/**
 * Wait until all bundle transaction signatures reach finalized status
 * @param {import('@solana/web3.js').Connection} connection
 * @param {string[]} signatures
 * @param {number} timeoutMs
 * @param {number} pollIntervalMs
 * @returns {Promise<{success: boolean, status: string, slot: number|null, error?: string, statuses: any[]}>}
 */
async function waitForBundleSignaturesConfirmed(connection, signatures, timeoutMs = 120000, pollIntervalMs = 2000, bundleId = null) {
  if (!connection || typeof connection.getSignatureStatuses !== 'function') {
    console.error('[BUNDLE][CONFIRM] Invalid connection object provided');
    return {
      success: false,
      status: 'invalid_connection',
      slot: null,
      error: 'Invalid Solana connection supplied',
      statuses: []
    };
  }

  const uniqueSignatures = Array.from(
    new Set(
      Array.isArray(signatures)
        ? signatures.filter((sig) => typeof sig === 'string' && sig.length > 0)
        : []
    )
  );

  if (!uniqueSignatures.length) {
    console.error('[BUNDLE][CONFIRM] No signatures provided to wait for');
    return {
      success: false,
      status: 'no_signatures',
      slot: null,
      error: 'No signatures provided for confirmation',
      statuses: []
    };
  }

  console.log(`[BUNDLE][CONFIRM] Waiting for ${uniqueSignatures.length} signatures...`);
  console.log(`[BUNDLE][CONFIRM] Sigs: ${uniqueSignatures.map(s => s.slice(0, 8) + '...').join(', ')}`);

  const start = Date.now();
  let lastStatuses = [];
  let jitoCheckInterval = 5000; // Check Jito every 5s
  let lastJitoCheck = 0;

  while (Date.now() - start < timeoutMs) {
    try {
      // 1. Check RPC statuses
    const response = await connection.getSignatureStatuses(uniqueSignatures, { searchTransactionHistory: true });
    const values = Array.isArray(response?.value) ? response.value : [];
    lastStatuses = values;

      let allConfirmed = values.length === uniqueSignatures.length;
    let highestSlot = null;
      const debugStatuses = [];

      for (let index = 0; index < uniqueSignatures.length; index += 1) {
      const status = values[index];
      const signature = uniqueSignatures[index];

      if (!status) {
          debugStatuses.push(`${signature.slice(0,8)}: null`);
          allConfirmed = false;
        continue;
      }

        debugStatuses.push(`${signature.slice(0,8)}: ${status.confirmationStatus || 'unknown'}`);

      if (status.err) {
          console.error(`[BUNDLE][CONFIRM] Transaction failed: ${signature}`, status.err);
        return {
          success: false,
          status: 'failed',
          slot: status.slot ?? null,
          error: `Signature ${signature} failed: ${JSON.stringify(status.err)}`,
          statuses: values
        };
      }

        if (status.confirmationStatus !== 'confirmed' && status.confirmationStatus !== 'finalized') {
          allConfirmed = false;
      }

      if (typeof status.slot === 'number') {
        highestSlot = highestSlot == null ? status.slot : Math.max(highestSlot, status.slot);
      }
    }

      if (allConfirmed && highestSlot != null) {
        console.log(`[BUNDLE][CONFIRM] All signatures confirmed at slot ${highestSlot}`);
      return {
        success: true,
          status: 'confirmed',
        slot: highestSlot,
        statuses: values
      };
      }

      // 2. Concurrent Jito Status Check (if RPC is lagging and we have a bundleId)
      if (bundleId && (Date.now() - lastJitoCheck > jitoCheckInterval)) {
        lastJitoCheck = Date.now();
        try {
          // Don't log every check to avoid spam, only log on success or specific states
          const jitoStatus = await getBundleStatus(bundleId);
          if (jitoStatus && jitoStatus.status === 'landed') {
             console.log(`[BUNDLE][CONFIRM] 🟢 Jito confirmed bundle ${bundleId} landed at slot ${jitoStatus.landedSlot}! RPC is lagging.`);
             return {
               success: true,
               status: 'confirmed', // Treat as confirmed based on Jito source of truth
               slot: jitoStatus.landedSlot,
               statuses: values
             };
          } else if (jitoStatus && jitoStatus.status === 'failed') {
             console.error(`[BUNDLE][CONFIRM] 🔴 Jito reports bundle ${bundleId} FAILED.`);
             return {
               success: false,
               status: 'failed',
               slot: null,
               error: 'Jito bundle failed execution',
               statuses: values
             };
          }
        } catch (jitoErr) {
          // Ignore Jito check errors, just rely on RPC loop
        }
      }

      // Log status every ~4 seconds to avoid spamming but give visibility
      if ((Date.now() - start) % 4000 < pollIntervalMs + 100) {
        console.log(`[BUNDLE][CONFIRM] Status check (${((Date.now() - start)/1000).toFixed(1)}s): ${debugStatuses.join(', ')}`);
      }

    } catch (err) {
      console.warn(`[BUNDLE][CONFIRM] RPC error checking statuses: ${err.message}`);
    }

    await delay(pollIntervalMs);
  }

  console.error(`[BUNDLE][CONFIRM] Timeout waiting for signatures after ${timeoutMs}ms`);
  return {
    success: false,
    status: 'timeout',
    slot: null,
    error: `Signatures not confirmed within ${Math.round(timeoutMs / 1000)}s`,
    statuses: lastStatuses
  };
}

/**
 * Pump.fun Complete Launch Implementation
 * Using reverse-engineered methods and third-party APIs
 * 
 * This implementation uses:
 * 1. PumpPortal API for IPFS upload and transaction generation
 * 2. Direct program interaction for bonding curve
 * 3. Jupiter for initial buy execution
 * 
 * Status: FULLY FUNCTIONAL using available methods
 */

const axios = require('axios');
const FormData = require('form-data');
const util = require('util');
const {
  Transaction,
  PublicKey,
  SystemProgram,
  SystemInstruction,
  TransactionInstruction,
  Keypair,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
  SendTransactionError,
} = require('@solana/web3.js');
const {
  getConnection,
  sendAndConfirmTransactionWithRetry,
  solToLamports,
  lamportsToSol,
  getMintInfo,
  getTokenBalance,
  getTokenAccountBalanceRaw,
  getTokenAccounts,
  getSOLBalance,
  isValidPublicKey
} = require('./solana_utils');
const { confirmTransactionWithTimeout } = require('./confirmation_wrapper');
const { getActiveWalletKeypair, loadWalletFromDatabase } = require('./wallets');
const db = require('./db');
const { saveToken, getWalletById, getUserTokens, getWalletByAddress, getUserWallets } = db;
const { sendJitoBundle, waitForBundleConfirmation, getBundleStatus } = require('./jito_bundles');
const { createAuditLog } = require('./admin');
const bs58 = require('bs58');
const vanityPool = require('./vanity_pool');
const {
  executeLaunchWithSdk,
  executeBuyWithSdk,
  executeSellWithSdk
} = require('./pumpfun_sdk_flow');
const {
  isHeliusAvailable,
  getTokenAccountsByMint,
  getTokenAccountsDAS
} = require('./helius');
const { MINT_SIZE, ACCOUNT_SIZE } = require('@solana/spl-token');

// Pump.fun Program ID (OFFICIAL)
const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

// Official Pump.fun Constants (from official documentation)
const GLOBAL_ACCOUNT = new PublicKey('4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf');
const PUMP_ACCOUNT = new PublicKey('Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1');
// Note: MINT_AUTHORITY from docs - keeping as string reference  
const MINT_AUTHORITY = 'TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM';
// Metaplex Token Metadata Program ID - KEEPING AS STRING (address from docs has issues)
const METAPLEX_METADATA_PROGRAM_ID = 'metaqbxxUerdq28cj1RbbAWkYQm3ybzjb6a8bt518x1s';
// Raydium migration address (as string - for monitoring/filtering only)
const RAYDIUM_MIGRATION_ADDRESS = '39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg';

// API Endpoints
const PUMPFUN_IPFS_API = 'https://pump.fun/api/ipfs'; // OFFICIAL endpoint
const PUMPPORTAL_API = 'https://pumpportal.fun/api'; // Third-party alternative
const PUMPPORTAL_TRADE = 'https://pumpportal.fun/api/trade';
const PUMPPORTAL_WEBSOCKET = 'wss://pumpportal.fun/api/data';
const PUMPPORTAL_LOCAL_TRADE = 'https://pumpportal.fun/api/trade-local';
const PUMPPORTAL_LOCAL = PUMPPORTAL_LOCAL_TRADE; // backward compatibility export
const DEFAULT_SLIPPAGE = 30;
const USE_SDK_PRIMARY = String(process.env.PUMPFUN_SDK_PRIMARY || '').toLowerCase() === 'true';
const USE_SDK_TRADING = String(process.env.PUMPFUN_SDK_TRADING || '').toLowerCase() === 'true';
const SDK_TRADE_SLIPPAGE_PERCENT = Number.isFinite(Number(process.env.PUMPFUN_SDK_TRADE_SLIPPAGE))
  ? Number(process.env.PUMPFUN_SDK_TRADE_SLIPPAGE)
  : DEFAULT_SLIPPAGE;
const persistPumpfunLaunch = ({
  userId,
  name,
  symbol,
  metadataUri,
  mintAddress,
  signature,
  initialBuySOL,
  method,
}) => {
  let lastBundleEndpoint = null;
  
  try {
    createAuditLog({
      userId,
      action: 'launch_pumpfun',
      details: { mint: mintAddress, signature, method, name, symbol },
    });
  } catch (error) {
    console.error('Error creating Pump.fun audit log:', error.message);
  }

  return {
    success: true,
    mintAddress,
    signature,
    metadataUri,
    bondingCurve: 'active',
    initialBuy: initialBuySOL,
  };
};

const MAX_PUMPPORTAL_RETRIES = 4;
const DEFAULT_PRIORITY_FEE = 0.0005;
const MAX_PRIORITY_FEE = 0.005;
const DEFAULT_USE_LOCAL_TRADE = true;
const BLOCK_HEIGHT_ERROR_REGEX = /(block height exceeded|has expired|confirmation timeout)/i;
const PUMPPORTAL_TIMEOUT_REGEX = /(timed? ?out|deadline exceeded|socket hang up|request aborted|network error)/i;
const GENERIC_RETRY_BASE_DELAY_MS = 500;
const BLOCKHEIGHT_RETRY_DELAY_MS = 900;
const MIN_SOL_FOR_LOCAL_LAMPORTS = (() => {
  const envSol = Number(process.env.PUMPPORTAL_LOCAL_MIN_SOL);
  if (Number.isFinite(envSol) && envSol > 0) {
    return BigInt(Math.max(0, Math.round(envSol * LAMPORTS_PER_SOL)));
  }
  return BigInt(Math.round(0.004 * LAMPORTS_PER_SOL));
})();
const BUNDLE_JITO_GRACE_MS = (() => {
  const raw = Number(process.env.PUMP_BUNDLE_JITO_GRACE_MS);
  if (Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  return 60000;
})();
const BUNDLE_LANDING_RETRY_DELAY_MS = (() => {
  const raw = Number(process.env.PUMP_BUNDLE_LANDING_RETRY_MS);
  if (Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  return 2000;
})();
const ENABLE_SEQUENTIAL_FALLBACK =
  String(process.env.PUMP_BUNDLE_ALLOW_SEQUENTIAL_FALLBACK || 'true').toLowerCase() !== 'false';
const SEQUENTIAL_FALLBACK_DELAY_MS = (() => {
  const raw = Number(process.env.PUMP_BUNDLE_SEQUENTIAL_DELAY_MS);
  if (Number.isFinite(raw) && raw >= 0) {
    return raw;
  }
  return 400;
})();

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function broadcastSequentialTransactions(connection, signedTransactions, options = {}) {
  const {
    commitment = 'confirmed',
    skipPreflight = false,
    maxRetries = 3
  } = options || {};

  if (!Array.isArray(signedTransactions) || !signedTransactions.length) {
    throw new Error('No signed transactions available for sequential broadcast');
  }

  const signatures = [];
  for (const tx of signedTransactions) {
    const rawTx = tx instanceof VersionedTransaction ? tx.serialize() : tx;
    const signature = await connection.sendRawTransaction(rawTx, {
      skipPreflight,
      maxRetries
    });
    signatures.push(signature);
    await connection.confirmTransaction(signature, commitment);
    if (SEQUENTIAL_FALLBACK_DELAY_MS > 0) {
      await delay(SEQUENTIAL_FALLBACK_DELAY_MS);
    }
  }

  return {
    success: true,
    signatures
  };
}

function isBlockHeightError(message = '') {
  if (typeof message !== 'string') {
    return false;
  }
  return BLOCK_HEIGHT_ERROR_REGEX.test(message);
}

function isPumpPortalTimeout(message = '') {
  if (typeof message !== 'string') {
    return false;
  }
  return PUMPPORTAL_TIMEOUT_REGEX.test(message);
}

function bumpPriorityFee(currentFee) {
  const base = Number(currentFee);
  const normalized = Number.isFinite(base) && base > 0 ? base : DEFAULT_PRIORITY_FEE;
  const bumped = Math.min(Number((normalized * 2).toFixed(6)), MAX_PRIORITY_FEE);
  if (bumped <= normalized) {
    return Math.min(Number((normalized + 0.0005).toFixed(6)), MAX_PRIORITY_FEE);
  }
  return bumped;
}

function unwrapErrorChainLocal(error) {
  const chain = [];
  const seen = new Set();
  let current = error;
  while (current && !seen.has(current)) {
    chain.push(current);
    seen.add(current);
    current = current?.cause || current?.originalError || current?.error || null;
  }
  return chain;
}

async function collectSendTransactionLogs(error) {
  if (!error) {
    return null;
  }
  const connection = getConnection();
  const chain = unwrapErrorChainLocal(error);
  for (const candidate of chain) {
    if (candidate instanceof SendTransactionError && typeof candidate.getLogs === 'function') {
      try {
        const logs = await candidate.getLogs(connection);
        if (Array.isArray(logs) && logs.length) {
          return {
            logs,
            signature: typeof candidate.signature === 'string' ? candidate.signature : undefined
          };
        }
      } catch (logError) {
        console.warn(`[PUMPPORTAL] Failed to fetch SendTransactionError logs: ${logError.message}`);
      }
    }
    if (Array.isArray(candidate?.logs) && candidate.logs.length) {
      return { logs: candidate.logs };
    }
    if (Array.isArray(candidate?.transactionError?.logs) && candidate.transactionError.logs.length) {
      return { logs: candidate.transactionError.logs };
    }
  }
  return null;
}

function slippageToBasisPoints(slippage) {
  const numeric = Number(slippage);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 500n;
  }
  const basisPoints = Math.round(numeric * 100);
  const clamped = Math.max(1, Math.min(basisPoints, 10_000));
  return BigInt(clamped);
}

function toBigInt(value, label = 'value') {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid ${label}: ${value}`);
    }
    return BigInt(Math.trunc(value));
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) {
      throw new Error(`Invalid ${label}: ${value}`);
    }
    return BigInt(trimmed);
  }
  throw new Error(`Unsupported ${label} type: ${typeof value}`);
}

function decimalToBigInt(amount, decimals) {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error(`Invalid mint decimals: ${decimals}`);
  }

  const raw = typeof amount === 'string' ? amount.trim() : amount.toString();
  if (!raw || !/^\d+(\.\d+)?$/.test(raw)) {
    throw new Error(`Invalid token amount: ${amount}`);
  }

  if (!raw.includes('.')) {
    return BigInt(raw) * (10n ** BigInt(decimals));
  }

  const [wholePart, fractionPartRaw = ''] = raw.split('.');
  const fractionTrimmed = fractionPartRaw.slice(0, decimals);
  const fractionPadded = fractionTrimmed.padEnd(decimals, '0');

  const whole = wholePart ? BigInt(wholePart) : 0n;
  const fraction = fractionPadded ? BigInt(fractionPadded) : 0n;

  return whole * (10n ** BigInt(decimals)) + fraction;
}

function bigIntToDecimalString(value, decimals) {
  const bigValue = typeof value === 'bigint' ? value : toBigInt(value);
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error(`Invalid mint decimals: ${decimals}`);
  }

  if (decimals === 0) {
    return bigValue.toString();
  }

  const base = 10n ** BigInt(decimals);
  const negative = bigValue < 0n;
  const absolute = negative ? -bigValue : bigValue;
  const whole = absolute / base;
  const fraction = absolute % base;
  const fractionString = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');
  const formatted = fractionString ? `${whole.toString()}.${fractionString}` : whole.toString();
  return negative ? `-${formatted}` : formatted;
}

function debugStringify(value) {
  try {
    return JSON.stringify(value, (key, val) => (typeof val === 'bigint' ? val.toString() : val), 2);
  } catch (error) {
    return `[[Unserializable: ${error.message}]]`;
  }
}

function describePumpPortalError(error) {
  if (!error) {
    return 'Unknown error';
  }

  if (error.response) {
    const { status, statusText, data } = error.response;
    let message = `${status || ''} ${statusText || ''}`.trim();
    if (data) {
      let dataString;
      if (typeof data === 'string') {
        dataString = data;
      } else {
        try {
          dataString = JSON.stringify(data);
        } catch (_) {
          dataString = util.inspect(data, { depth: 2 });
        }
      }
      message = message ? `${message} - ${dataString}` : dataString;
    }
    if (message && message !== '[object Object]') {
      return message;
    }
  }

  let message = error.message || '';
  if (message && message !== '[object Object]') {
    return message;
  }

  try {
    const json = JSON.stringify(error, Object.getOwnPropertyNames(error));
    if (json && json !== '{}') {
      return json;
    }
  } catch (_) {
    // ignore
  }

  if (typeof error === 'object') {
    return util.inspect(error, { depth: 2 });
  }

  return String(error);
}

function normalizeToUint8Array(raw) {
  if (!raw) {
    return null;
  }

  if (raw instanceof Uint8Array) {
    return raw;
  }

  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(raw)) {
    return new Uint8Array(raw.buffer, raw.byteOffset || 0, raw.byteLength);
  }

  if (raw instanceof ArrayBuffer) {
    return new Uint8Array(raw);
  }

  return null;
}

async function resolveMessageAccountKeys(message, conn) {
  const lookups = Array.isArray(message.addressTableLookups)
    ? message.addressTableLookups
    : [];

  if (lookups.length === 0) {
    return message.getAccountKeys({ addressLookupTableAccounts: [] });
  }

  const accounts = [];

  for (const lookup of lookups) {
    try {
      const table = await conn.getAddressLookupTable(lookup.accountKey);
      if (table?.value) {
        accounts.push(table.value);
      } else {
        console.warn(
          `[PUMPFUN][LOOKUP] Address table ${lookup.accountKey.toBase58()} unavailable`
        );
      }
    } catch (error) {
      console.warn(
        `[PUMPFUN][LOOKUP] Failed to fetch address table ${lookup.accountKey.toBase58()}: ${error.message}`
      );
    }
  }

  return message.getAccountKeys({ addressLookupTableAccounts: accounts });
}

async function extractLamportsTransferredToDestination({
  transaction,
  destination,
  conn
}) {
  if (!transaction || !destination) {
    return 0n;
  }

  const message = transaction.message;
  const accountKeys = await resolveMessageAccountKeys(message, conn);
  let totalLamports = 0n;

  for (const compiledInstruction of message.compiledInstructions || []) {
    const programId = accountKeys.get(compiledInstruction.programIdIndex);
    if (!programId || !programId.equals(SystemProgram.programId)) {
      continue;
    }

    const keys = compiledInstruction.accountKeyIndexes.map((index) => ({
      pubkey: accountKeys.get(index),
      isSigner: message.isAccountSigner(index),
      isWritable: message.isAccountWritable(index)
    }));

    const instruction = new TransactionInstruction({
      programId,
      keys,
      data: Buffer.from(compiledInstruction.data)
    });

    let instructionType;
    try {
      instructionType = SystemInstruction.decodeInstructionType(instruction);
    } catch (decodeError) {
      continue;
    }

    if (instructionType === 'Transfer') {
      const transferInfo = SystemInstruction.decodeTransfer(instruction);
      if (transferInfo?.toPubkey?.equals(destination)) {
        totalLamports += BigInt(transferInfo.lamports);
      }
    } else if (instructionType === 'TransferWithSeed') {
      const transferInfo = SystemInstruction.decodeTransferWithSeed(instruction);
      if (transferInfo?.toPubkey?.equals(destination)) {
        totalLamports += BigInt(transferInfo.lamports);
      }
    }
  }

  return totalLamports;
}

/**
 * Check if fee account exists on-chain (diagnostic helper)
 * Based on Pump.fun SDK patterns from github.com/rckprtr/pumpdotfun-sdk
 * @param {Connection} conn - Solana connection
 * @param {PublicKey} tokenMint - Token mint address
 * @param {PublicKey} creatorPubkey - Creator public key
 * @returns {Promise<object>} Fee account info
 */
async function checkOnChainFeeAccount(conn, tokenMint, creatorPubkey) {
  try {
    // Derive the fee account PDA (based on Pump.fun SDK patterns)
    // This matches the structure in bondingCurveAccount.ts
    const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
    
    // Fee account is typically derived from [creator, mint, "creator_fee"]
    const [feeAccountPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('creator_fee'),
        creatorPubkey.toBuffer(),
        tokenMint.toBuffer()
      ],
      PUMPFUN_PROGRAM_ID
    );
    
    const accountInfo = await conn.getAccountInfo(feeAccountPDA);
    
    if (!accountInfo) {
      return {
        exists: false,
        reason: 'Fee account not initialized (no trading activity yet)',
        feeAccountAddress: feeAccountPDA.toBase58()
      };
    }
    
    // Fee account exists - check balance
    const balance = accountInfo.lamports;
    const solBalance = balance / LAMPORTS_PER_SOL;
    
    return {
      exists: true,
      feeAccountAddress: feeAccountPDA.toBase58(),
      balance,
      solBalance,
      reason: balance > 0 ? `${solBalance.toFixed(6)} SOL available` : 'No fees accumulated yet'
    };
  } catch (error) {
    console.warn('[PUMP FEES] On-chain fee account check failed:', error.message);
    return {
      exists: false,
      reason: `Check failed: ${error.message}`,
      error: error.message
    };
  }
}

async function previewPumpPortalCreatorFee({
  conn,
  creatorPubkey,
  pool,
  tokenMint = null,
  priorityFee = DEFAULT_PRIORITY_FEE
}) {
  if (!conn || !creatorPubkey) {
    return 0n;
  }

  const normalizedPriorityFee =
    Number(priorityFee) > 0 ? Number(priorityFee) : DEFAULT_PRIORITY_FEE;

  const requestBody = {
    publicKey: creatorPubkey.toBase58(),
    action: 'collectCreatorFee',
    priorityFee: normalizedPriorityFee,
    pool,
    skipPreflight: 'false'
  };

  if (tokenMint) {
    requestBody.mint = tokenMint;
  } else if (pool === 'meteora-dbc') {
    throw new Error('tokenMint is required for Meteora fee preview');
  }

  try {
    const response = await axios.post(PUMPPORTAL_LOCAL_TRADE, requestBody, {
      timeout: 12000,
      responseType: 'arraybuffer'
    });

    const raw = response?.data;
    if (!raw || typeof raw.byteLength === 'undefined' || raw.byteLength === 0) {
      console.warn(`[PUMP FEES] ${pool} preview returned empty payload`);
      
      // Fallback: Check on-chain fee account for diagnostics
      if (tokenMint && pool === 'pump') {
        try {
          const mintPubkey = new PublicKey(tokenMint);
          const feeInfo = await checkOnChainFeeAccount(conn, mintPubkey, creatorPubkey);
          console.log(`[PUMP FEES] On-chain diagnostic: ${feeInfo.reason}`);
          if (feeInfo.exists && feeInfo.balance > 0) {
            console.warn(`[PUMP FEES] ⚠️ On-chain shows ${feeInfo.solBalance.toFixed(6)} SOL but Pump Portal returned empty`);
            console.warn('[PUMP FEES] This may indicate a Pump Portal API issue - fees exist but cannot be previewed');
          }
        } catch (diagError) {
          console.warn('[PUMP FEES] Diagnostic check failed:', diagError.message);
        }
      }
      
      return 0n;
    }

    const rawBytes = normalizeToUint8Array(raw);
    if (!rawBytes || rawBytes.byteLength === 0) {
      console.warn(`[PUMP FEES] ${pool} preview payload could not be decoded`);
      return 0n;
    }

    const transaction = VersionedTransaction.deserialize(rawBytes);
    const lamports = await extractLamportsTransferredToDestination({
      transaction,
      destination: creatorPubkey,
      conn
    });

    console.log(
      `[PUMP FEES] Preview ${pool} fee transfer: ${lamports.toString()} lamports`
    );

    return lamports;
  } catch (error) {
    const detail = describePumpPortalError(error);
    if (
      /no (withheld )?transfer fees/i.test(detail) ||
      /no fees/i.test(detail) ||
      /nothing to claim/i.test(detail) ||
      /not found/i.test(detail) ||
      /local trades are not currently available on meteora/i.test(detail)
    ) {
      console.log(`[PUMP FEES] ${pool} preview indicates no claimable fees`);
      
      // Additional diagnostic for "no fees" response
      if (tokenMint && pool === 'pump') {
        try {
          const mintPubkey = new PublicKey(tokenMint);
          const feeInfo = await checkOnChainFeeAccount(conn, mintPubkey, creatorPubkey);
          console.log(`[PUMP FEES] On-chain verification: ${feeInfo.reason}`);
        } catch (diagError) {
          // Silent fail for diagnostic
        }
      }
      
      return 0n;
    }

    throw new Error(detail);
  }
}

function formatSolAmount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error(`Invalid SOL amount: ${value}`);
  }

  const decimals = numeric < 0.001 ? 9 : 6;
  const formatted = numeric.toFixed(decimals).replace(/\.?0+$/, '');
  return formatted === '' ? '0' : formatted;
}

function resolveTradingKeypair({ userId, walletId = null, explicitKeypair = null }) {
  if (explicitKeypair) {
    return explicitKeypair;
  }

  if (walletId) {
    try {
      const walletKeypair = loadWalletFromDatabase(walletId);
      if (!walletKeypair) {
        throw new Error(`Wallet ${walletId} not found`);
      }
      return walletKeypair;
    } catch (error) {
      throw new Error(`Unable to load wallet ${walletId}: ${error.message || error}`);
    }
  }

  const activeWallet = getActiveWalletKeypair(userId);
  if (!activeWallet) {
    throw new Error('No active wallet found');
  }
  return activeWallet;
}

async function resolveTokenDecimals(tokenMint, fallbackDecimals = null) {
  if (Number.isInteger(fallbackDecimals) && fallbackDecimals >= 0) {
    return fallbackDecimals;
  }

  try {
    const mintInfo = await getMintInfo(tokenMint);
    if (mintInfo && Number.isInteger(mintInfo.decimals)) {
      return mintInfo.decimals;
    }
  } catch (error) {
    console.warn(`[PUMPFUN] Unable to fetch mint decimals for ${tokenMint}: ${error.message}`);
  }

  return typeof fallbackDecimals === 'number' && fallbackDecimals >= 0 ? fallbackDecimals : 9;
}

async function executePumpPortalTrade({ description, payer, body, useLocal = DEFAULT_USE_LOCAL_TRADE }) {
  const initialUseLocal = Boolean(useLocal);
  let currentUseLocal = initialUseLocal;
  let lastError = null;
  let blockhashRetryApplied = false;
  let forcedLocalFallback = false;

  for (let attempt = 1; attempt <= MAX_PUMPPORTAL_RETRIES; attempt++) {
    try {
      const endpointBase = currentUseLocal ? PUMPPORTAL_LOCAL_TRADE : PUMPPORTAL_TRADE;
      const apiUrl = !currentUseLocal && PUMPPORTAL_API_KEY
        ? `${endpointBase}?api-key=${PUMPPORTAL_API_KEY}`
        : endpointBase;

      if (attempt === 1 || (!currentUseLocal && initialUseLocal && attempt === 2)) {
        const debugPayload = { ...body };
        if (debugPayload.transaction) {
          debugPayload.transaction = '[base64 transaction omitted]';
        }
        console.log(`[PUMPPORTAL] ${currentUseLocal ? 'LOCAL' : 'REMOTE'} ${description} attempt ${attempt} payload: ${debugStringify(debugPayload)}`);
      }

      const conn = getConnection();

      let response;
      if (currentUseLocal) {
        response = await axios.post(apiUrl, body, {
          timeout: 12000,
          responseType: 'arraybuffer'
        });
        const raw = response?.data;
        if (!raw || typeof raw.byteLength === 'undefined') {
          throw new Error('PumpPortal local response missing transaction bytes');
        }

        const transactionBytes = Buffer.from(raw);
        const transaction = VersionedTransaction.deserialize(new Uint8Array(transactionBytes));

        transaction.sign([payer]);

        const signature = await conn.sendRawTransaction(transaction.serialize(), {
          skipPreflight: false,
          maxRetries: 2
        });

        console.log(`[PUMPPORTAL][LOCAL] ${description} submitted: ${signature}`);

        const latestBlockhash = await conn.getLatestBlockhash();
        await confirmTransactionWithTimeout(conn, signature, latestBlockhash, 60000);
        console.log(`[PUMPPORTAL][LOCAL] ${description} confirmed: ${signature}`);
        return signature;
      }

      response = await axios.post(apiUrl, body, { timeout: 12000 });
      const data = response?.data;

      if (!data) {
        throw new Error('PumpPortal returned empty response payload');
      }

      if (typeof data.signature === 'string' && data.signature.length > 0) {
        const warningMessages = [];
        if (Array.isArray(data.errors) && data.errors.length) {
          warningMessages.push(
            ...data.errors.map((entry) =>
              typeof entry === 'string'
                ? entry
                : entry?.message || JSON.stringify(entry)
            )
          );
        } else if (data.errors && typeof data.errors === 'object') {
          warningMessages.push(JSON.stringify(data.errors));
        }
        if (Array.isArray(data.warnings) && data.warnings.length) {
          warningMessages.push(
            ...data.warnings.map((entry) =>
              typeof entry === 'string'
                ? entry
                : entry?.message || JSON.stringify(entry)
            )
          );
        }
        if (warningMessages.length) {
          console.warn(
            `[PUMPPORTAL] ${description} signature ${data.signature} returned warnings: ${warningMessages.join(' | ')}`
          );
        }
        console.log(`[PUMPPORTAL] ${description} broadcast signature: ${data.signature}`);
        const latestBlockhash = await conn.getLatestBlockhash();
        await confirmTransactionWithTimeout(conn, data.signature, latestBlockhash, 60000);
        console.log(`[PUMPPORTAL] ${description} confirmed: ${data.signature}`);
        return data.signature;
      }

      // Check for errors in response first
      if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
        const errorMessages = data.errors.map(e => typeof e === 'string' ? e : (e.message || JSON.stringify(e))).join('; ');
        throw new Error(`PumpPortal API error: ${errorMessages}`);
      }
      
      if (data.error) {
        const errorMsg = typeof data.error === 'string' ? data.error : (data.error.message || JSON.stringify(data.error));
        throw new Error(`PumpPortal API error: ${errorMsg}`);
      }

      if (!data.transaction) {
        const summary = typeof data === 'object' ? JSON.stringify(Object.keys(data)) : String(data);
        throw new Error(`PumpPortal response missing transaction payload (${summary})`);
      }

      const transactionBytes = Buffer.from(data.transaction, 'base64');
      const transaction = VersionedTransaction.deserialize(transactionBytes);
      transaction.sign([payer]);

      const signature = await conn.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        maxRetries: 2
      });

      console.log(`[PUMPPORTAL] ${description} submitted: ${signature}`);

      const latestBlockhash = await conn.getLatestBlockhash();
      await confirmTransactionWithTimeout(conn, signature, latestBlockhash, 60000);
      console.log(`[PUMPPORTAL] ${description} confirmed: ${signature}`);

      return signature;
    } catch (error) {
      const endpointLabel = currentUseLocal ? 'LOCAL' : 'REMOTE';
      const detail = describePumpPortalError(error);
      let enrichedDetail = detail;
      let logInfo = null;
      try {
        logInfo = await collectSendTransactionLogs(error);
      } catch (logCollectError) {
        console.warn(`[PUMPPORTAL] Unable to collect transaction logs: ${logCollectError.message}`);
      }
      if (logInfo?.logs?.length) {
        const preview = logInfo.logs.slice(-5).join(' | ');
        enrichedDetail = `${detail} Logs: ${preview}`;
      }
      console.error(`[PUMPPORTAL] ${description} failed (attempt ${attempt}) using ${endpointLabel} endpoint: ${enrichedDetail}`);
      lastError = new Error(enrichedDetail);
      lastError.cause = error instanceof Error ? error : undefined;
      lastError.endpoint = endpointLabel.toLowerCase();
      if (logInfo?.logs) {
        lastError.logs = logInfo.logs;
      }
      if (logInfo?.signature) {
        lastError.signature = logInfo.signature;
      }

      const blockHeightIssue = !currentUseLocal && isBlockHeightError(detail);
      const timeoutIssue = !currentUseLocal && isPumpPortalTimeout(detail);
      if (blockHeightIssue) {
        lastError.blockHeightExceeded = true;
      }

      if (!currentUseLocal && (blockHeightIssue || timeoutIssue) && !forcedLocalFallback) {
        forcedLocalFallback = true;
        const previousFee = Number(body.priorityFee);
        body.priorityFee = bumpPriorityFee(previousFee);
        console.warn(
          `[PUMPPORTAL] ${description} forcing local replay after ${blockHeightIssue ? 'block-height' : 'timeout'} issue (priority fee ${body.priorityFee})`
        );
        currentUseLocal = true;
        await delay(blockHeightIssue ? BLOCKHEIGHT_RETRY_DELAY_MS : GENERIC_RETRY_BASE_DELAY_MS);
        continue;
      }

      if (!currentUseLocal && blockHeightIssue && !blockhashRetryApplied) {
        blockhashRetryApplied = true;
        const previousFee = Number(body.priorityFee);
        body.priorityFee = bumpPriorityFee(previousFee);
        console.warn(`[PUMPPORTAL] ${description} retrying with bumped priority fee ${body.priorityFee} after block-height issue`);
        await delay(BLOCKHEIGHT_RETRY_DELAY_MS);
        continue;
      }

      if (currentUseLocal) {
        console.warn(`[PUMPPORTAL] Falling back to remote /trade endpoint for ${description}`);
        currentUseLocal = false;
        continue;
      }

      if (attempt < MAX_PUMPPORTAL_RETRIES) {
        const baseDelay = blockHeightIssue ? BLOCKHEIGHT_RETRY_DELAY_MS : GENERIC_RETRY_BASE_DELAY_MS;
        await delay(baseDelay * (attempt + 1));
      }
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error(`[PUMPPORTAL] ${description} failed after retries`);
}

async function loadPumpdotfunSdk(payer) {
  throw new Error('PumpDotFun SDK support disabled in this build');
}

async function executePumpdotfunBuy({ payer, tokenMint, lamports, slippageBps }) {
  throw new Error('PumpDotFun SDK buy disabled');
}

async function executePumpdotfunSell({ payer, tokenMint, rawAmount, slippageBps }) {
  throw new Error('PumpDotFun SDK sell disabled');
}

const resolveCreatorKeypair = (userId, walletId = null) => {
  if (walletId) {
    const walletRecord = getWalletById(walletId);
    if (!walletRecord || walletRecord.user_id !== userId) {
      throw new Error('Selected dev wallet not found or not assigned to this user');
    }
    const walletKeypair = loadWalletFromDatabase(walletId);
    if (!walletKeypair) {
      throw new Error('Failed to load selected dev wallet');
    }
    return walletKeypair;
  }

  const fallbackKeypair = getActiveWalletKeypair(userId);
  if (!fallbackKeypair) {
    throw new Error('No active wallet found for this user');
  }
  return fallbackKeypair;
};

const sanitizeSocialLink = (value) => {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.replace(/\\\./g, '.');
};

const sanitizeSocialLinks = ({ twitter, telegram, website }) => ({
  twitter: sanitizeSocialLink(twitter),
  telegram: sanitizeSocialLink(telegram),
  website: sanitizeSocialLink(website),
});

const METADATA_ACCOUNT_SIZE = 679;
const MIN_CREATOR_BUFFER_LAMPORTS = BigInt(Math.round(0.02 * LAMPORTS_PER_SOL));
const MIN_BUNDLE_WALLET_BUFFER_LAMPORTS = BigInt(Math.round(0.01 * LAMPORTS_PER_SOL));

async function ensurePumpPortalLaunchPreflight({
  userId,
  devWalletId,
  name,
  symbol,
  initialBuySOL
}) {
  const creatorKeypair = resolveCreatorKeypair(userId, devWalletId);
  const walletAddress = creatorKeypair.publicKey.toBase58();
  const conn = getConnection();

  const rentMint = BigInt(await conn.getMinimumBalanceForRentExemption(MINT_SIZE));
  const rentTokenAccount = BigInt(await conn.getMinimumBalanceForRentExemption(ACCOUNT_SIZE));
  const rentMetadata = BigInt(await conn.getMinimumBalanceForRentExemption(METADATA_ACCOUNT_SIZE));
  const initialBuyLamports = BigInt(solToLamports(initialBuySOL));

  const requiredLamports =
    rentMint +
    rentTokenAccount +
    rentMetadata +
    initialBuyLamports +
    MIN_CREATOR_BUFFER_LAMPORTS;

  const { lamports: currentLamports, sol: currentSol } = await getSOLBalance(walletAddress);
  const currentLamportsBig = BigInt(currentLamports);

  if (currentLamportsBig < requiredLamports) {
    const shortfallLamports = Number(requiredLamports - currentLamportsBig);
    const shortfallSol = shortfallLamports / LAMPORTS_PER_SOL;
    throw new Error(
      `Dev wallet ${walletAddress} requires at least ${shortfallSol.toFixed(4)} more SOL to cover Pump.fun rent and initial buy.`
    );
  }

  const tokens = typeof getUserTokens === 'function' ? getUserTokens(userId) : [];
  const nameLower = (name || '').trim().toLowerCase();
  const symbolLower = (symbol || '').trim().toLowerCase();
  if (nameLower || symbolLower) {
    const duplicateToken = tokens.find((token) => {
      if (!token || !token.mint_address) {
        return false;
      }
      const tokenNameLower = (token.token_name || '').trim().toLowerCase();
      const tokenSymbolLower = (token.token_symbol || '').trim().toLowerCase();
      // Relaxed check: Warn but do NOT throw
      return (nameLower && tokenNameLower === nameLower) || (symbolLower && tokenSymbolLower === symbolLower);
    });

    if (duplicateToken) {
      console.warn(
        `[PREFLIGHT] Warning: Token metadata re-used. Existing mint ${duplicateToken.mint_address} uses this name or symbol.`
      );
    }
  }

  const requiredSol = Number(requiredLamports) / LAMPORTS_PER_SOL;
  console.log(
    `[PREFLIGHT] Dev wallet ${walletAddress.substring(0, 8)}... balance ${currentSol.toFixed(
      4
    )} SOL meets required ${requiredSol.toFixed(4)} SOL for PumpPortal launch.`
  );
}

async function ensureBundleWalletFunding(connection, walletEntries, options = {}) {
  if (!connection) {
    connection = getConnection();
  }
  if (!Array.isArray(walletEntries) || walletEntries.length === 0) {
    return;
  }

  const {
    bufferLamports = MIN_BUNDLE_WALLET_BUFFER_LAMPORTS,
    tipLamports = 0n,
    labelResolver = null
  } = options;

  const insufficient = [];

  for (const entry of walletEntries) {
    if (!entry?.keypair) {
      continue;
    }
    const buyLamports = BigInt(solToLamports(entry.amount || 0));
    const requiredLamports = buyLamports + bufferLamports + tipLamports;
    const currentLamports = BigInt(await connection.getBalance(entry.keypair.publicKey, 'confirmed'));
    if (currentLamports < requiredLamports) {
      insufficient.push({
        walletId: entry.walletId,
        address: entry.keypair.publicKey.toBase58(),
        shortfallLamports: requiredLamports - currentLamports
      });
    }
  }

  if (insufficient.length) {
    const detailLines = insufficient.slice(0, 5).map((item) => {
      const shortfallSol = Number(item.shortfallLamports) / LAMPORTS_PER_SOL;
      const label = typeof labelResolver === 'function'
        ? labelResolver(item.walletId)
        : (item.walletId != null ? `Wallet ${item.walletId}` : item.address.slice(0, 6));
      return `${label} needs +${shortfallSol.toFixed(3)} SOL`;
    });
    const suffix = insufficient.length > detailLines.length ? ', ...' : '';
    throw new Error(
      `Bundle wallets must be funded before launch (${detailLines.join(', ')}${suffix})`
    );
  }

  console.log(`[PREFLIGHT] Bundle wallet balances verified (${walletEntries.length} wallets).`);
}

// PumpPortal API Key (from environment variable)
const PUMPPORTAL_API_KEY = process.env.PUMPPORTAL_API_KEY || '';

// Token Program IDs
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

/**
 * Upload metadata and image to IPFS (OFFICIAL pump.fun endpoint)
 * @param {object} tokenData - Token data
 * @param {Buffer} imageBuffer - Image buffer
 * @returns {Promise<object>} Upload result with metadata URI
 */
async function uploadToPumpfunIPFS(tokenData, imageBuffer) {
  const { name, symbol, description } = tokenData;
  const { twitter, telegram, website } = sanitizeSocialLinks(tokenData);
  
  try {
    console.log('📤 Uploading to OFFICIAL Pump.fun IPFS...');
    
    const form = new FormData();
    
    // Add image file (OFFICIAL format)
    form.append('file', imageBuffer, {
      filename: 'image.png',
      contentType: 'image/png'
    });
    
    // Add metadata fields (OFFICIAL format)
    form.append('name', name);
    form.append('symbol', symbol);
    form.append('description', description || '');
    form.append('showName', 'true'); // FIXED: Missing from original code
    
    if (twitter) form.append('twitter', twitter);
    if (telegram) form.append('telegram', telegram);
    if (website) form.append('website', website);
    
    // Try OFFICIAL pump.fun API first
    try {
      const officialResponse = await axios.post(PUMPFUN_IPFS_API, form, {
        headers: {
          ...form.getHeaders()
        },
        timeout: 30000
      });
      
      if (officialResponse.data && officialResponse.data.metadataUri) {
        console.log(`✅ Uploaded to OFFICIAL pump.fun: ${officialResponse.data.metadataUri}`);
        return {
          metadataUri: officialResponse.data.metadataUri,
          imageUri: officialResponse.data.imageUri || officialResponse.data.metadataUri
        };
      }
    } catch (officialError) {
      console.log('Official API failed, trying PumpPortal...');
    }
    
    // Fallback to PumpPortal
    const pumpPortalResponse = await axios.post(`${PUMPPORTAL_API}/ipfs`, form, {
      headers: {
        ...form.getHeaders()
      },
      timeout: 30000
    });
    
    if (!pumpPortalResponse.data || !pumpPortalResponse.data.metadataUri) {
      throw new Error('Failed to upload metadata');
    }
    
    console.log(`✅ Metadata uploaded via PumpPortal: ${pumpPortalResponse.data.metadataUri}`);
    
    return {
      metadataUri: pumpPortalResponse.data.metadataUri,
      imageUri: pumpPortalResponse.data.imageUri || pumpPortalResponse.data.metadataUri
    };
  } catch (error) {
    console.error('All IPFS upload methods failed:', error);
    throw new Error(`Failed to upload to Pump.fun IPFS: ${error.message}`);
  }
}

/**
 * Create Pump.fun token using PumpPortal API
 * @param {object} params - Launch parameters
 * @returns {Promise<object>} Launch result
 */
async function launchTokenViaPumpPortal(params) {
  const {
    userId,
    name,
    symbol,
    description,
    imageBuffer,
    initialBuySOL = 0,
    twitter = '',
    telegram = '',
    website = '',
    devWalletId = null,
    vanityWallet = null,
  } = params;
  
  try {
    console.log('🚀 Launching token on Pump.fun via PumpPortal...');
    
    const conn = getConnection();
    const payer = resolveCreatorKeypair(userId, devWalletId);
    
    const socials = sanitizeSocialLinks({ twitter, telegram, website });
    
    // Step 1: Upload metadata to IPFS
    const { metadataUri } = await uploadToPumpfunIPFS(
      { name, symbol, description, ...socials },
      imageBuffer
    );
    
    console.log('✅ Metadata uploaded');
    
    // Step 2: Create token via PumpPortal API
    console.log('📝 Creating token transaction...');
    
    // Use vanity wallet if provided, otherwise generate new keypair
    let mintKeypair = null;
    if (vanityWallet?.secretKey) {
      try {
        mintKeypair = Keypair.fromSecretKey(bs58.decode(vanityWallet.secretKey));
        console.log(`🎯 Using vanity address: ${mintKeypair.publicKey.toBase58()}`);
      } catch (error) {
        console.warn('[VANITY] Failed to decode vanity wallet, generating random mint:', error.message);
        mintKeypair = Keypair.generate();
      }
    } else {
      mintKeypair = Keypair.generate();
    }
    
    const apiUrl = PUMPPORTAL_API_KEY 
      ? `${PUMPPORTAL_API}/trade?api-key=${PUMPPORTAL_API_KEY}`
      : `${PUMPPORTAL_API}/trade`;
    
    // CRITICAL: Lightning API requires bs58.encode(mintKeypair.secretKey) per official docs
    const bs58 = require('bs58');
    
    let createResponse;
    try {
      createResponse = await axios.post(apiUrl, {
      action: 'create',
      tokenMetadata: {
        name,
        symbol,
          uri: metadataUri,
      },
        mint: bs58.encode(mintKeypair.secretKey),
      denominatedInSol: 'true',
      amount: initialBuySOL,
      slippage: 10,
      priorityFee: 0.0005,
        pool: 'pump',
      });
    } catch (requestError) {
      const payload = requestError?.response?.data;
      console.error('[PUMPPORTAL] Create request failed',
        typeof payload === 'object' ? JSON.stringify(payload) : payload || requestError.message,
      );
      throw requestError;
    }

    const data = createResponse?.data ?? null;
    const mintAddress = mintKeypair.publicKey.toBase58();

    const broadcastSignature = data?.signature;
    const serializedTx = data?.transaction;

    let signature;

    if (serializedTx) {
      // Legacy flow: sign and broadcast locally
      const txBuffer = Buffer.from(serializedTx, 'base64');
    const transaction = VersionedTransaction.deserialize(txBuffer);
      transaction.sign([payer, mintKeypair]);
      signature = await conn.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
        maxRetries: 3,
    });
    } else if (broadcastSignature) {
      // New flow: PumpPortal already broadcasted the transaction
      signature = broadcastSignature;
    } else {
      const summary = data ? Object.keys(data) : [];
      console.error('[PUMPPORTAL] Unexpected response shape', summary);
      throw new Error('PumpPortal response missing transaction payload');
    }
    
    console.log(`⏳ Confirming creation: ${signature}`);
    
    // Confirm with timeout
    const { confirmTransactionWithTimeout } = require('./confirmation_wrapper');
    const latestBlockhash = await conn.getLatestBlockhash();
    await confirmTransactionWithTimeout(conn, signature, latestBlockhash, 60000);
    
    console.log(`✅ Pump.fun token created: ${signature}`);
    console.log(`🔑 Mint address: ${mintAddress}`);
    
    // Mark vanity wallet as used if it was provided and matches
    if (vanityWallet?.publicKey && mintAddress === vanityWallet.publicKey) {
      const vanityPool = require('./vanity_pool');
      await vanityPool.markVanityWalletUsed(vanityWallet.publicKey);
      console.log(`✅ Vanity address ${vanityWallet.publicKey} marked as used`);
    }
    
    return persistPumpfunLaunch({
      userId,
      name,
      symbol,
      metadataUri,
      mintAddress,
      signature,
      initialBuySOL,
      method: serializedTx ? 'pumpportal-trade-local-sign' : 'pumpportal-lightning',
    });
    
  } catch (error) {
    console.error('Error launching via PumpPortal:', error);
    throw error;
  }
}

async function launchTokenViaPumpPortalLocal(params) {
  const {
    userId,
    name,
    symbol,
    description,
    imageBuffer,
    initialBuySOL = 0,
    twitter = '',
    telegram = '',
    website = '',
    devWalletId = null,
    vanityWallet = null,
  } = params;
  
  console.log('🚀 Launching token on Pump.fun using PumpPortal local transaction...');
    
    const conn = getConnection();
  const payer = resolveCreatorKeypair(userId, devWalletId);

  const socials = sanitizeSocialLinks({ twitter, telegram, website });

  const { metadataUri } = await uploadToPumpfunIPFS(
    { name, symbol, description, ...socials },
    imageBuffer,
  );

  console.log('✅ Metadata uploaded (local fallback)');

  // Use vanity wallet if provided, otherwise generate new keypair
  let mintKeypair = null;
  if (vanityWallet?.secretKey) {
    try {
      mintKeypair = Keypair.fromSecretKey(bs58.decode(vanityWallet.secretKey));
      console.log(`🎯 Using vanity address: ${mintKeypair.publicKey.toBase58()}`);
    } catch (error) {
      console.warn('[VANITY] Failed to decode vanity wallet, generating random mint:', error.message);
      mintKeypair = Keypair.generate();
    }
  } else {
    mintKeypair = Keypair.generate();
  }
  const mintAddress = mintKeypair.publicKey.toBase58();

  const apiUrl = PUMPPORTAL_API_KEY
    ? `${PUMPPORTAL_LOCAL}?api-key=${PUMPPORTAL_API_KEY}`
    : PUMPPORTAL_LOCAL;

  let createResponse;
  try {
    createResponse = await axios.post(
      apiUrl,
      {
        publicKey: payer.publicKey.toBase58(),
        action: 'create',
        tokenMetadata: {
          name,
          symbol,
          uri: metadataUri,
        },
        mint: mintAddress,
        denominatedInSol: 'true',
        amount: initialBuySOL,
        slippage: 10,
        priorityFee: 0.0005,
        pool: 'pump',
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer',
      },
    );
  } catch (requestError) {
    const payload = requestError?.response?.data;
    console.error('[PUMPPORTAL][LOCAL] Create request failed',
      typeof payload === 'object' && payload !== null ? JSON.stringify(payload) : payload || requestError.message,
    );
    throw requestError;
  }

  if (!createResponse?.data) {
    throw new Error('PumpPortal local response missing transaction bytes');
  }

  const txBytes = Buffer.from(createResponse.data);
  const transaction = VersionedTransaction.deserialize(new Uint8Array(txBytes));
  transaction.sign([mintKeypair, payer]);

  const signature = await conn.sendRawTransaction(transaction.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });

  console.log(`⏳ Confirming local launch: ${signature}`);

  const { confirmTransactionWithTimeout } = require('./confirmation_wrapper');
  const latestBlockhash = await conn.getLatestBlockhash();
  await confirmTransactionWithTimeout(conn, signature, latestBlockhash, 60000);

  console.log(`✅ Pump.fun local launch succeeded: ${signature}`);

  // Mark vanity wallet as used if it was provided and matches
  if (vanityWallet?.publicKey && mintAddress === vanityWallet.publicKey) {
    const vanityPool = require('./vanity_pool');
    await vanityPool.markVanityWalletUsed(vanityWallet.publicKey);
    console.log(`✅ Vanity address ${vanityWallet.publicKey} marked as used`);
  }

  return persistPumpfunLaunch({
    userId,
    name,
    symbol,
    metadataUri,
    mintAddress,
    signature,
    initialBuySOL,
    method: 'pumpportal-trade-local',
  });
}

async function launchTokenWithSdk(params) {
  const {
    userId,
    name,
    symbol,
    description,
    imageBuffer,
    initialBuySOL = 0,
    twitter = '',
    telegram = '',
    website = '',
    devWalletId = null,
    vanityWallet = null
  } = params;

  console.log('🚀 Launching token using PumpDotFun SDK fallback...');

  const conn = getConnection();
  const payer = resolveCreatorKeypair(userId, devWalletId);
  const socials = sanitizeSocialLinks({ twitter, telegram, website });
  const { metadataUri } = await uploadToPumpfunIPFS(
    { name, symbol, description, ...socials },
    imageBuffer
  );
  const initialBuyLamports = BigInt(Math.max(0, Math.round(initialBuySOL * LAMPORTS_PER_SOL)));
  const slippageBps = slippageToBasisPoints(DEFAULT_SLIPPAGE);

  let vanityKeypair = null;
  if (vanityWallet?.secretKey) {
    try {
      vanityKeypair = Keypair.fromSecretKey(bs58.decode(vanityWallet.secretKey));
    } catch (error) {
      console.warn('[VANITY] Failed to decode vanity wallet secret key:', error.message);
    }
  }

  const result = await executeLaunchWithSdk({
    connection: conn,
    payer,
    metadataUri,
      name,
      symbol,
    initialBuyLamports,
    slippageBps,
    mintKeypair: vanityKeypair
  });

  if (vanityWallet?.publicKey) {
    if (result.mintPublicKey.toBase58() === vanityWallet.publicKey) {
      await vanityPool.markVanityWalletUsed(vanityWallet.publicKey);
    } else {
      console.warn(
        `[VANITY] Mint mismatch. Expected ${vanityWallet.publicKey}, got ${result.mintPublicKey.toBase58()}`
      );
    }
  }

  return persistPumpfunLaunch({
    userId,
    name,
    symbol,
    metadataUri,
    mintAddress: result.mintPublicKey.toBase58(),
    signature: result.signature,
    initialBuySOL,
    method: 'pumpdotfun-sdk'
  });
}

/**
 * Create Pump.fun token using direct program interaction
 * This uses reverse-engineered program structure
 * @param {object} params - Launch parameters
 * @returns {Promise<object>} Launch result
 */
// Load Jito Auth Keypair once at module level if possible, or inside functions
const JITO_AUTH_KEYPAIR_PATH = require('path').join(__dirname, '../jitokito.json');
let JITO_AUTH_KEYPAIR_CACHE = null;

function getJitoAuthKeypair() {
  if (JITO_AUTH_KEYPAIR_CACHE) return JITO_AUTH_KEYPAIR_CACHE;
  
  try {
    if (require('fs').existsSync(JITO_AUTH_KEYPAIR_PATH)) {
      const keyData = JSON.parse(require('fs').readFileSync(JITO_AUTH_KEYPAIR_PATH, 'utf-8'));
      JITO_AUTH_KEYPAIR_CACHE = Keypair.fromSecretKey(new Uint8Array(keyData));
      console.log(`[JITO] Loaded Auth Keypair: ${JITO_AUTH_KEYPAIR_CACHE.publicKey.toBase58()}`);
      return JITO_AUTH_KEYPAIR_CACHE;
    }
  } catch (e) {
    console.warn('[JITO] Failed to load jitokito.json:', e.message);
  }
  return null;
}

/**
 * COMPLETE Pump.fun launch with initial buy
 * This is the MAIN function to use for launching
 * @param {object} params - Complete launch parameters
 * @returns {Promise<object>} Complete launch result
 */
async function completePumpfunLaunch(params) {
  const JITO_AUTH_KEYPAIR = getJitoAuthKeypair();
  
  const {
    userId,
    name,
    symbol,
    description,
    imageBuffer,
    initialBuySOL = 0.01,
    twitter = '',
    telegram = '',
    website = '',
    devWalletId = null,
    vanityWallet = null,
  } = params;

  await ensurePumpPortalLaunchPreflight({
    userId,
    devWalletId,
    name,
    symbol,
    initialBuySOL
  });

  try {
    console.log('🎪 COMPLETE PUMP.FUN LAUNCH');
    console.log(`   Token: ${name} (${symbol})`);
    console.log(`   Initial Buy: ${initialBuySOL} SOL`);
    
      const baseParams = {
        userId,
        name,
        symbol,
        description,
        imageBuffer,
        initialBuySOL,
        twitter,
        telegram,
        website,
        devWalletId,
      vanityWallet,
      };

    const strategyOrder = USE_SDK_PRIMARY
      ? [launchTokenWithSdk, launchTokenViaPumpPortal, launchTokenViaPumpPortalLocal]
      : [launchTokenViaPumpPortal, launchTokenViaPumpPortalLocal, launchTokenWithSdk];
      
    let lastError = null;
      
    for (const strategy of strategyOrder) {
      try {
        const result = await strategy(baseParams);
        console.log(`✅ Launch successful via ${result?.method || strategy.name || 'strategy'}`);
      return {
        ...result,
        platform: 'pumpfun'
      };
      } catch (strategyError) {
        lastError = strategyError;
        console.error(
          `[LAUNCH][${strategy.name || 'unknown'}] Failed:`,
          strategyError?.message || strategyError
        );
      }
    }

    if (lastError) {
      throw lastError;
    }
    throw new Error('All launch strategies failed.');
  } catch (error) {
    console.error('❌ All Pump.fun launch methods failed:', error);
    console.error('');
    console.error('Available options:');
    console.error('1. Use manual launch on pump.fun website');
    console.error('2. Use bot /create_token for Raydium direct launch');
    console.error('');
    throw new Error(
      `Pump.fun launch failed: ${error.message}. ` +
      'Try launching on pump.fun website or use /create_token for Raydium direct launch.'
    );
  }
}

/**
 * Execute buy on Pump.fun bonding curve via PumpPortal
 * @param {object} params - Buy parameters
 * @returns {Promise<string>} Transaction signature
 */
async function buyOnPumpfunCurve(params) {
  const {
    userId,
    tokenMint,
    solAmount,
    slippage = DEFAULT_SLIPPAGE,
    walletId = null,
    walletKeypair = null,
    priorityFee = DEFAULT_PRIORITY_FEE
  } = params;

  if (typeof tokenMint !== 'string' || !isValidPublicKey(tokenMint)) {
    throw new Error('Invalid Pump.fun mint address for buy operation');
  }

  const { formatted, lamports } = (() => {
    const numeric = Number(solAmount);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      throw new Error(`Invalid SOL amount: ${solAmount}`);
    }
    return {
      formatted: formatSolAmount(numeric),
      lamports: BigInt(Math.max(1, Math.round(numeric * LAMPORTS_PER_SOL)))
    };
  })();

  const payer = resolveTradingKeypair({ userId, walletId, explicitKeypair: walletKeypair });
  const normalizedPriorityFee = Number(priorityFee) > 0 ? Number(priorityFee) : DEFAULT_PRIORITY_FEE;
  const requestBody = {
    publicKey: payer.publicKey.toBase58(),
    action: 'buy',
    mint: tokenMint,
    denominatedInSol: 'true',
    amount: formatted,
    slippage,
    priorityFee: normalizedPriorityFee,
    pool: 'pump',
    jitoOnly: 'true',
    skipPreflight: 'false'
  };

  console.log(`💰 Buying on Pump.fun: ${formatted} SOL (slippage ${slippage}%)`);

  try {
    if (USE_SDK_TRADING) {
      try {
        const sdkSignature = await executeBuyWithSdk({
          connection: getConnection(),
          payer,
          mintAddress: tokenMint,
          lamports,
          slippageBps: slippageToBasisPoints(SDK_TRADE_SLIPPAGE_PERCENT)
        });
        console.log(`[PUMPFUN][SDK][BUY] Executed via SDK: ${sdkSignature}`);
        return sdkSignature;
      } catch (sdkError) {
        console.warn('[PUMPFUN][SDK][BUY] Falling back to PumpPortal:', sdkError.message || sdkError);
      }
    }

    // Prefer Local execution for speed and reliability
    return await executePumpPortalTrade({
      description: `buy ${formatted} SOL of ${tokenMint}`,
      payer,
      body: requestBody,
      useLocal: true // FORCE LOCAL EXECUTION FOR SPEED
    });
  } catch (pumpPortalError) {
    const portalMessage = describePumpPortalError(pumpPortalError);
    const errorOut = new Error(`Pump.fun buy failed via PumpPortal (${portalMessage})`);
    errorOut.cause = pumpPortalError;
    throw errorOut;
  }
}

/**
 * Execute sell on Pump.fun bonding curve via PumpPortal
 * @param {object} params - Sell parameters
 * @returns {Promise<string>} Transaction signature
 */
async function sellOnPumpfunCurve(params) {
  const {
    userId,
    tokenMint,
    tokenAmount = null,
    rawTokenAmount = null,
    slippage = DEFAULT_SLIPPAGE,
    walletId = null,
    walletKeypair = null,
    priorityFee = DEFAULT_PRIORITY_FEE,
    knownDecimals = null,
    preResolvedTokenAccount = null,
    forceFullBalance = false
  } = params;

  if (typeof tokenMint !== 'string' || !isValidPublicKey(tokenMint)) {
    throw new Error('Invalid Pump.fun mint address for sell operation');
  }

  const payer = resolveTradingKeypair({ userId, walletId, explicitKeypair: walletKeypair });
  const normalizedPriorityFee = Number(priorityFee) > 0 ? Number(priorityFee) : DEFAULT_PRIORITY_FEE;
  
  const preferLocalTrade =
    forceFullBalance ||
    String(process.env.PUMPPORTAL_SELL_USE_LOCAL || '').toLowerCase() === 'true';

  let tokenAccountInfo = preResolvedTokenAccount && preResolvedTokenAccount.mint === tokenMint
    ? { ...preResolvedTokenAccount }
    : null;

  if (!tokenAccountInfo) {
    const tokenAccounts = await getTokenAccounts(payer.publicKey.toBase58());
    tokenAccountInfo = tokenAccounts.find((acc) => acc.mint === tokenMint) || null;
  }

  if (!tokenAccountInfo) {
    throw new Error('Selected wallet does not hold this Pump.fun token');
  }

  const preferredDecimals =
    Number.isInteger(knownDecimals) ? knownDecimals : (Number.isInteger(tokenAccountInfo.decimals) ? tokenAccountInfo.decimals : null);
  const decimals = await resolveTokenDecimals(tokenMint, preferredDecimals);
  if (Number.isInteger(decimals)) {
    tokenAccountInfo.decimals = decimals;
  }

  const availableRaw = toBigInt(tokenAccountInfo.amount, 'available token balance');
  console.log(`[PUMPPORTAL][SELL] token account: ${tokenAccountInfo.address}, availableRaw: ${availableRaw.toString()}, decimals: ${decimals}`);
  let rawAmount;
  let isFullSell = Boolean(forceFullBalance);
  if (rawTokenAmount !== null && rawTokenAmount !== undefined) {
    rawAmount = toBigInt(rawTokenAmount, 'rawTokenAmount');
    if (forceFullBalance && rawAmount >= availableRaw) {
      isFullSell = true;
    }
  } else if (tokenAmount !== null && tokenAmount !== undefined) {
    rawAmount = decimalToBigInt(tokenAmount, decimals);
  } else {
    rawAmount = availableRaw;
    isFullSell = true;
  }

  if (rawAmount >= availableRaw) {
    if (availableRaw === 0n) {
      throw new Error('No token balance to sell');
    }
    if (isFullSell) {
      rawAmount = availableRaw;
    } else {
      rawAmount = availableRaw > 1n ? availableRaw - 1n : availableRaw;
    }
  }
  console.log(`[PUMPPORTAL][SELL] adjusted rawAmount: ${rawAmount.toString()}`);

  if (rawAmount <= 0n) {
    throw new Error('Sell amount rounds to zero. Reduce percentage or ensure balance > 1 unit.');
  }

  const formattedAmount = bigIntToDecimalString(rawAmount, decimals);
  const requestBody = {
    publicKey: payer.publicKey.toBase58(),
    action: 'sell',
    mint: tokenMint,
    denominatedInSol: 'false',
    amount: formattedAmount,
    slippage,
    priorityFee: normalizedPriorityFee,
    pool: 'pump',
    tokenAccount: tokenAccountInfo.address,
    skipPreflight: 'false',
    jitoOnly: 'false'
  };

  console.log(`[PUMPPORTAL][SELL] request body: ${debugStringify(requestBody)}`);

  console.log(`💸 Selling on Pump.fun: ${formattedAmount} tokens (slippage ${slippage}%)`);

  if (USE_SDK_TRADING) {
    try {
      const sdkSignature = await executeSellWithSdk({
        connection: getConnection(),
        payer,
        mintAddress: tokenMint,
        rawTokenAmount: rawAmount,
        slippageBps: slippageToBasisPoints(SDK_TRADE_SLIPPAGE_PERCENT)
      });
      console.log(`[PUMPFUN][SDK][SELL] Executed via SDK: ${sdkSignature}`);
      return sdkSignature;
    } catch (sdkError) {
      console.warn('[PUMPFUN][SDK][SELL] Falling back to PumpPortal:', sdkError.message || sdkError);
    }
  }

  const tradeDescription = `sell ${formattedAmount} tokens of ${tokenMint}`;

  try {
    if (preferLocalTrade) {
  try {
    return await executePumpPortalTrade({
          description: tradeDescription,
      payer,
      body: requestBody,
          useLocal: true
        });
      } catch (localError) {
        const localDetail = describePumpPortalError(localError);
        if (/not enough tokens/i.test(localDetail || '')) {
          throw localError;
        }
        console.warn(`[PUMPPORTAL][SELL] Local sell attempt failed: ${localDetail || localError.message}. Falling back to Lightning endpoint.`);
      }
    }

    return await executePumpPortalTrade({
      description: tradeDescription,
      payer,
      body: requestBody,
      useLocal: false
    });
  } catch (pumpPortalError) {
    const portalMessage = describePumpPortalError(pumpPortalError);
    const errorOut = new Error(`Pump.fun sell failed via PumpPortal (${portalMessage})`);
    errorOut.cause = pumpPortalError;
    throw errorOut;
  }
}

/**
 * Check if PumpPortal is available
 * @returns {Promise<boolean>} True if available
 */
async function isPumpPortalAvailable() {
  try {
    const response = await axios.get(`${PUMPPORTAL_API}/`, { timeout: 5000 });
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

/**
 * Get Pump.fun token info via PumpPortal
 * @param {string} tokenMint - Token mint address
 * @returns {Promise<object>} Token info
 */
async function getPumpfunTokenInfo(tokenMint) {
  try {
    const response = await axios.get(`${PUMPPORTAL_API}/token/${tokenMint}`);
    
    if (response.data) {
      return {
        mint: tokenMint,
        name: response.data.name,
        symbol: response.data.symbol,
        description: response.data.description,
        imageUri: response.data.image,
        metadataUri: response.data.uri,
        bondingCurve: response.data.bondingCurve,
        marketCap: response.data.marketCap,
        complete: response.data.complete || false
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error getting Pump.fun token info:', error);
    return null;
  }
}

/**
 * Convenience wrapper for creating a Pumpfun token
 * Automatically chooses best method (PumpPortal or direct)
 * @param {object} params - Token parameters
 * @returns {Promise<object>} Token creation result
 */
async function createPumpfunToken(params) {
  try {
    // Try PumpPortal first if available
    if (await isPumpPortalAvailable()) {
      console.log('[PUMPFUN] Using PumpPortal...');
      return await launchTokenViaPumpPortal(params);
    }
    
    console.log('[PUMPFUN] PumpPortal unavailable, using local endpoint...');
    return await launchTokenViaPumpPortalLocal(params);
  } catch (error) {
    console.error('[PUMPFUN] Creation error:', error);
    console.log('[PUMPFUN] Attempting SDK fallback...');
    return await launchTokenWithSdk(params);
  }
}

/**
 * Check Pump.fun creator fees balance by querying the creator vault PDA directly
 * The creator vault is a System Account PDA with seeds: ["creator-vault", creator_pubkey]
 * @param {object} params - Parameters
 * @returns {Promise<object>} Creator fees breakdown
 */
async function getPumpfunCreatorFees(params) {
  const {
    tokenMint,
    creatorAddress
  } = params;

  if (typeof creatorAddress !== 'string' || creatorAddress.length < 32) {
    return {
      preMigration: 0,
      postMigration: 0,
      total: 0
    };
  }

  try {
    const conn = getConnection();
    let creatorPubkey;

    try {
      creatorPubkey = new PublicKey(creatorAddress);
    } catch (error) {
      console.warn('[PUMP FEES] Invalid creator address:', error.message);
      return {
        preMigration: 0,
        postMigration: 0,
        total: 0
      };
    }

    // ============================================================================
    // CREATOR VAULT PDA - Direct on-chain balance query
    // Based on Pump.fun official docs: PDA seeds are ["creator-vault", creator_pubkey]
    // This is a System Account that holds SOL directly
    // ============================================================================
    let vaultBalance = 0;
    try {
      const [creatorVaultPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('creator-vault'),
          creatorPubkey.toBuffer()
        ],
        PUMPFUN_PROGRAM_ID
      );
      
      const vaultInfo = await conn.getAccountInfo(creatorVaultPda);
      if (vaultInfo && vaultInfo.lamports > 0) {
        vaultBalance = vaultInfo.lamports;
        const solAmount = vaultBalance / LAMPORTS_PER_SOL;
        console.log(`[PUMP FEES] ✅ Creator vault balance: ${solAmount.toFixed(6)} SOL (${creatorVaultPda.toBase58().substring(0, 8)}...)`);
      } else {
        console.log('[PUMP FEES] ℹ️ Creator vault is empty or does not exist yet');
      }
    } catch (vaultError) {
      console.warn('[PUMP FEES] Failed to query creator vault:', vaultError.message);
    }

    const totalSol = vaultBalance / LAMPORTS_PER_SOL;
    
    // For now, we report all vault balance as "preMigration" since we can't distinguish
    // The vault accumulates all creator fees from bonding curve trades
    return {
      preMigration: totalSol,
      postMigration: 0,
      total: totalSol,
      lamports: {
        preMigration: BigInt(vaultBalance),
        postMigration: 0n,
        total: BigInt(vaultBalance)
      }
    };

  } catch (error) {
    console.error('[PUMP FEES] Error checking creator fees:', error.message);
    return {
      preMigration: 0,
      postMigration: 0,
      total: 0
    };
  }
}

/**
 * Legacy function - kept for compatibility but redirects to new implementation
 */
async function getPumpfunCreatorFeesLegacy(params) {
  const {
    tokenMint,
    creatorAddress
  } = params;

  if (typeof tokenMint !== 'string' || tokenMint.length < 32) {
    return {
      preMigration: 0,
      postMigration: 0,
      total: 0
    };
  }

  if (typeof creatorAddress !== 'string' || creatorAddress.length < 32) {
    return {
      preMigration: 0,
      postMigration: 0,
      total: 0
    };
  }

  try {
    const conn = getConnection();
    let creatorPubkey;

    try {
      creatorPubkey = new PublicKey(creatorAddress);
    } catch (error) {
      console.warn('[PUMP FEES] Invalid creator address:', error.message);
      return {
        preMigration: 0,
        postMigration: 0,
        total: 0
      };
    }

    let preMigrationLamports = 0n;
    let postMigrationLamports = 0n;
    let preMigrationError = null;
    let postMigrationError = null;

    // ============================================================================
    // PRE-MIGRATION FEES (Pump.fun Bonding Curve)
    // ============================================================================
    console.log(`[PUMP FEES] Checking pre-migration fees for token ${tokenMint.substring(0, 8)}... creator ${creatorAddress.substring(0, 8)}...`);
    try {
      preMigrationLamports = await previewPumpPortalCreatorFee({
        conn,
        creatorPubkey,
        pool: 'pump',
        priorityFee: DEFAULT_PRIORITY_FEE,
        tokenMint
      });
      
      if (preMigrationLamports > 0n) {
        const solAmount = Number(preMigrationLamports) / LAMPORTS_PER_SOL;
        console.log(`[PUMP FEES] ✅ Pre-migration fees: ${solAmount.toFixed(6)} SOL`);
      } else {
        console.log('[PUMP FEES] ℹ️ Pre-migration fees: 0 SOL (no trading volume yet or fees already claimed)');
      }
    } catch (error) {
      preMigrationError = error.message;
      console.warn('[PUMP FEES] ❌ Pre-migration preview failed:', error.message);
      console.warn('[PUMP FEES] This may indicate:');
      console.warn('  1. Token not yet launched on Pump.fun');
      console.warn('  2. Creator address mismatch');
      console.warn('  3. Fee account not initialized');
    }

    // ============================================================================
    // POST-MIGRATION FEES (Meteora DBC after Raydium migration)
    // ============================================================================
    if (typeof tokenMint === 'string' && tokenMint.length >= 32) {
      console.log(`[PUMP FEES] Checking post-migration fees (Meteora DBC) for ${tokenMint.substring(0, 8)}...`);
      try {
        postMigrationLamports = await previewPumpPortalCreatorFee({
          conn,
          creatorPubkey,
          pool: 'meteora-dbc',
          tokenMint,
          priorityFee: DEFAULT_PRIORITY_FEE
        });
        
        if (postMigrationLamports > 0n) {
          const solAmount = Number(postMigrationLamports) / LAMPORTS_PER_SOL;
          console.log(`[PUMP FEES] ✅ Post-migration fees: ${solAmount.toFixed(6)} SOL`);
        } else {
          console.log('[PUMP FEES] ℹ️ Post-migration fees: 0 SOL (token not migrated or no fees accrued)');
        }
      } catch (error) {
        postMigrationError = error.message;
        console.warn(`[PUMP FEES] ❌ Meteora preview failed for ${tokenMint.substring(0, 8)}...:`, error.message);
        console.warn('[PUMP FEES] This is expected if token has not migrated to Raydium yet');
      }
    }

    const totalLamports = preMigrationLamports + postMigrationLamports;
    const preMigrationSol = Number(preMigrationLamports) / LAMPORTS_PER_SOL;
    const postMigrationSol = Number(postMigrationLamports) / LAMPORTS_PER_SOL;
    const totalSol = Number(totalLamports) / LAMPORTS_PER_SOL;

    // Log summary
    if (totalSol > 0) {
      console.log(`[PUMP FEES] 💰 Total claimable: ${totalSol.toFixed(6)} SOL`);
    } else {
      console.log('[PUMP FEES] ℹ️ No claimable fees at this time');
      if (preMigrationError && postMigrationError) {
        console.log('[PUMP FEES] ⚠️ Both fee checks failed - this may indicate configuration issues');
      }
    }

    return {
      preMigration: Number.isFinite(preMigrationSol) ? preMigrationSol : 0,
      postMigration: Number.isFinite(postMigrationSol) ? postMigrationSol : 0,
      total: Number.isFinite(totalSol) ? totalSol : 0,
      lamports: {
        preMigration: preMigrationLamports.toString(),
        postMigration: postMigrationLamports.toString(),
        total: totalLamports.toString()
      },
      debug: {
        preMigrationError,
        postMigrationError,
        tokenMint,
        creatorAddress
      }
    };
  } catch (error) {
    console.error('Error checking Pump.fun creator fees:', error);
    return {
      preMigration: 0,
      postMigration: 0,
      total: 0
    };
  }
}

/**
 * Claim creator fees from Pump.fun tokens
 * @param {object} params - Fee claiming parameters
 * @returns {Promise<string>} Transaction signature
 */
async function collectCreatorFee(params) {
  const {
    userId,
    tokenMint = null,  // Optional for pump.fun (claims all), required for meteora
    pool = 'pump',      // 'pump' or 'meteora-dbc'
    priorityFee = DEFAULT_PRIORITY_FEE,
    walletId = null,
    walletKeypair = null
  } = params;

  try {
    const conn = getConnection();
    let payer = walletKeypair || null;

    if (!payer && walletId != null) {
      try {
        payer = loadWalletFromDatabase(walletId);
      } catch (walletError) {
        throw new Error(`Unable to load wallet ${walletId} for fee claim: ${walletError.message}`);
      }
    }

    if (!payer) {
      payer = getActiveWalletKeypair(userId);
    }

    if (!payer) {
      throw new Error('No wallet available to sign the creator fee transaction. Set an active wallet or provide walletId.');
    }

    const payerPublicKey = payer.publicKey.toBase58();

    console.log(`💰 Claiming creator fees from ${pool}...`, {
      tokenMint: tokenMint || null,
      wallet: payerPublicKey
    });

    const normalizedPriorityFee =
      Number(priorityFee) > 0 ? Number(priorityFee) : DEFAULT_PRIORITY_FEE;

    const apiUrl = PUMPPORTAL_LOCAL_TRADE;

    // Build request body
    const requestBody = {
      publicKey: payerPublicKey,
      action: 'collectCreatorFee',
      priorityFee: normalizedPriorityFee,
      pool,
      skipPreflight: 'false'
    };

    if (tokenMint) {
      requestBody.mint = tokenMint;
    } else if (pool === 'meteora-dbc') {
      throw new Error('Token mint required for Meteora fee claim');
    }

    // Get claim transaction from PumpPortal
    const response = await axios.post(apiUrl, requestBody, {
      timeout: 12000,
      responseType: 'arraybuffer'
    });

    const raw = response?.data;
    if (!raw || typeof raw.byteLength === 'undefined' || raw.byteLength === 0) {
      throw new Error('PumpPortal fee claim response missing transaction bytes');
    }

    // Deserialize and sign transaction
    const txBytes = normalizeToUint8Array(raw);
    if (!txBytes || txBytes.byteLength === 0) {
      throw new Error('Unable to decode PumpPortal fee claim transaction bytes');
    }
    const transaction = VersionedTransaction.deserialize(txBytes);
    transaction.sign([payer]);

    // Send transaction
    const signature = await conn.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      maxRetries: 3
    });
    
    console.log(`⏳ Confirming fee claim: ${signature}`);
    
    // Confirm with timeout
    const { confirmTransactionWithTimeout } = require('./confirmation_wrapper');
    const latestBlockhash = await conn.getLatestBlockhash();
    await confirmTransactionWithTimeout(conn, signature, latestBlockhash, 60000);
    
    console.log(`✅ Creator fees claimed: ${signature}`);
    
    return signature;
  } catch (error) {
    const detail = describePumpPortalError(error);
    console.error('Error claiming creator fees:', detail);
    const wrapped = new Error(detail);
    if (error instanceof Error) {
      wrapped.cause = error;
    }
    throw wrapped;
  }
}

function normalizePumpPortalBundleArgs(bundledTxArgs) {
  if (!Array.isArray(bundledTxArgs)) {
    return [];
  }

  const normalized = [];
  const specNotes = [];

  bundledTxArgs.forEach((entry, index) => {
    const tx = { ...entry };
    if (!tx || typeof tx !== 'object') {
      specNotes.push(`tx${index}: invalid entry type (${typeof tx})`);
      return;
    }

    if (typeof tx.publicKey !== 'string' || tx.publicKey.length === 0) {
      specNotes.push(`tx${index}: missing publicKey string`);
    }

    if (typeof tx.action !== 'string' || !['create', 'buy'].includes(tx.action)) {
      specNotes.push(`tx${index}: unexpected action ${tx.action}`);
    }

    if (tx.action === 'create') {
      if (!tx.tokenMetadata || typeof tx.tokenMetadata !== 'object') {
        specNotes.push(`tx${index}: missing tokenMetadata for create action`);
      } else {
        const { name, symbol, uri } = tx.tokenMetadata;
        if (typeof name !== 'string' || typeof symbol !== 'string' || typeof uri !== 'string') {
          specNotes.push(`tx${index}: tokenMetadata fields should be strings`);
        }
      }
    }

    if (typeof tx.denominatedInSol !== 'string') {
      const boolValue =
        tx.denominatedInSol === true || String(tx.denominatedInSol).toLowerCase() === 'true';
      tx.denominatedInSol = boolValue ? 'true' : 'false';
      specNotes.push(`tx${index}: coerced denominatedInSol to string per PumpPortal spec`);
    } else if (tx.denominatedInSol !== 'true' && tx.denominatedInSol !== 'false') {
      const normalizedValue = tx.denominatedInSol.toLowerCase();
      if (normalizedValue === 'true' || normalizedValue === 'false') {
        tx.denominatedInSol = normalizedValue;
        specNotes.push(`tx${index}: normalized denominatedInSol casing`);
      }
    }

    if (typeof tx.amount === 'string') {
      const numeric = Number(tx.amount);
      if (Number.isFinite(numeric)) {
        tx.amount = numeric;
        specNotes.push(`tx${index}: normalized amount string to numeric`);
      } else {
        specNotes.push(`tx${index}: amount string not numeric (${tx.amount})`);
      }
    }

    if (typeof tx.priorityFee !== 'number') {
      const numericFee = Number(tx.priorityFee);
      if (Number.isFinite(numericFee)) {
        tx.priorityFee = numericFee;
        specNotes.push(`tx${index}: normalized priorityFee to number`);
      }
    }

    normalized.push(tx);
  });

  if (specNotes.length) {
    console.warn(
      '[PUMPFUN][BUNDLE] PumpPortal bundle args normalized (https://pumpportal.fun/creation):',
      specNotes.join(' | ')
    );
  }

  return normalized;
}

/**
 * Create Pump.fun token with coordinated bundle launch
 * Uses /api/trade-local and Jito bundles for atomic multi-wallet execution
 * Based on PumpPortal documentation
 * @param {object} params - Bundle launch parameters
 * @returns {Promise<object>} Bundle launch result
 */
async function createPumpfunTokenWithBundle(params) {
  const JITO_AUTH_KEYPAIR = getJitoAuthKeypair();
  const { Keypair, TransactionMessage, VersionedTransaction, SystemProgram, PublicKey } = require('@solana/web3.js');
  const { getJitoTipAccount } = require('./jito_bundles');

  const {
    userId,
    name,
    symbol,
    description,
    imageBuffer,
    initialBuySOL = 0, // Dev wallet (creator) initial buy
    bundleWallets = [], // Array of wallet IDs for coordinated buys
    bundleBuyAmounts = [], // SOL amounts for each bundle wallet
    twitter = '',
    telegram = '',
    website = '',
    devWalletId = null,
    vanityWallet = null
  } = params;
  
  try {
    console.log('🎪 PUMP.FUN BUNDLE LAUNCH (Atomic - Max 5 Txs)');
    console.log(`   Token: ${name} (${symbol})`);
    console.log(`   Dev Buy: ${initialBuySOL} SOL`);
    
    const conn = getConnection();
    const userWalletRecords = typeof getUserWallets === 'function' ? (getUserWallets(userId) || []) : [];
    const walletLabelMap = new Map();
    userWalletRecords.forEach((wallet, idx) => {
      if (!wallet || wallet.wallet_id == null) {
        return;
      }
      const trimmedName = wallet.wallet_name && wallet.wallet_name.trim().length
        ? wallet.wallet_name.trim()
        : null;
      const label = trimmedName || `W${idx + 1}`;
      walletLabelMap.set(Number(wallet.wallet_id), label);
    });
    const resolveWalletLabel = (walletId) => {
      if (walletId == null) {
        return 'Wallet';
      }
      return walletLabelMap.get(Number(walletId)) || `Wallet ${walletId}`;
    };
    
    // Load creator wallet (dev wallet)
    const creatorWallet = resolveCreatorKeypair(userId, devWalletId);
    await ensurePumpPortalLaunchPreflight({
      userId,
      devWalletId,
      name,
      symbol,
      initialBuySOL
    });
    
    // Generate mint keypair or use vanity
    let mintKeypair = null;
    if (vanityWallet?.secretKey) {
      try {
        const bs58 = require('bs58');
        mintKeypair = Keypair.fromSecretKey(bs58.decode(vanityWallet.secretKey));
        console.log(`🎯 Using vanity address: ${mintKeypair.publicKey.toBase58()}`);
      } catch (error) {
        console.warn('[VANITY] Failed to decode vanity wallet, generating random mint:', error.message);
        mintKeypair = Keypair.generate();
      }
    } else {
      mintKeypair = Keypair.generate();
    }
    console.log(`🔑 Generated mint: ${mintKeypair.publicKey.toBase58()}`);
    
    // Step 1: Upload metadata to IPFS
    console.log('📤 Uploading metadata to IPFS...');
    const socials = sanitizeSocialLinks({ twitter, telegram, website });
    const { metadataUri } = await uploadToPumpfunIPFS(
      { name, symbol, description, ...socials },
      imageBuffer
    );
    console.log(`✅ Metadata URI: ${metadataUri}`);
    
    // Bundle configuration
    const BUNDLE_SLIPPAGE = 10;
    const PRIMARY_PRIORITY_FEE = Number(process.env.PUMP_BUNDLE_PRIMARY_PRIORITY_FEE) > 0
      ? Number(process.env.PUMP_BUNDLE_PRIMARY_PRIORITY_FEE)
      : DEFAULT_PRIORITY_FEE;
    
    // Step 2: Build bundle transaction arguments
    const bundleWalletsUsed = [];
    const normalizedBundleBuyAmounts = [];
    const walletEntries = [];
    
    for (let i = 0; i < bundleWallets.length; i++) {
      const walletId = bundleWallets[i];
      if (walletId == null) {
        continue;
      }
      const walletKeypair = loadWalletFromDatabase(walletId);
      if (!walletKeypair) {
        console.warn(`⚠️ Wallet ${walletId} not found, skipping`);
        continue;
      }
      const requestedAmount = Number(bundleBuyAmounts[i]);
      const buyAmount = Number.isFinite(requestedAmount) && requestedAmount > 0
        ? requestedAmount
        : 0.01;
      
      walletEntries.push({
        walletId,
        keypair: walletKeypair,
        amount: buyAmount,
        label: resolveWalletLabel(walletId)
      });
      bundleWalletsUsed.push(walletId);
      normalizedBundleBuyAmounts.push(buyAmount);
    }
    
    // ENFORCE ATOMIC BUNDLE LIMITS & CHUNKING
    // PumpPortal handles Jito tips via priorityFee on first tx, so we use standard 4-wallet limit
    const MAX_ATOMIC_BUYS = 4;
    
    const creationBundleEntries = walletEntries.slice(0, MAX_ATOMIC_BUYS);
    const followUpEntries = walletEntries.slice(MAX_ATOMIC_BUYS);
    
    console.log(`   Bundle Plan:`);
    console.log(`   • Creation Bundle: 1 Create + ${creationBundleEntries.length} Buys`);
    if (followUpEntries.length > 0) {
      console.log(`   • Follow-up Bundles: ${followUpEntries.length} Wallets (chunked by 5)`);
    }

    const allSignatures = [];
    const allBundleIds = [];
    let creationSignature = null;

    // =========================================================================
    // STEP A: CREATION BUNDLE (Create + Max 4 Buys)
    // =========================================================================
    const creationTxArgs = [];

    // Tx 0: Create (priorityFee is used by PumpPortal for Jito tip)
    const creationPriorityFee = PRIMARY_PRIORITY_FEE;

    creationTxArgs.push({
      publicKey: creatorWallet.publicKey.toBase58(),
      action: 'create',
      tokenMetadata: {
        name,
        symbol,
        uri: metadataUri
      },
      mint: mintKeypair.publicKey.toBase58(),
      denominatedInSol: 'true',
      amount: initialBuySOL,
      slippage: BUNDLE_SLIPPAGE,
      priorityFee: creationPriorityFee,
      pool: 'pump'
    });
    
    // Tx 1-4: Buys (No Tip)
    creationBundleEntries.forEach((entry) => {
      creationTxArgs.push({
        publicKey: entry.keypair.publicKey.toBase58(),
        action: 'buy',
        mint: mintKeypair.publicKey.toBase58(),
        denominatedInSol: 'true',
        amount: entry.amount,
        slippage: BUNDLE_SLIPPAGE,
        priorityFee: 0, // Strict: only first tx pays tip
        pool: 'pump'
      });
    });
    
    console.log('[PUMPFUN][BUNDLE] Requesting CREATION bundle transactions...');
    const creationBundleResponse = await axios.post(PUMPPORTAL_LOCAL_TRADE, normalizePumpPortalBundleArgs(creationTxArgs), {
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (creationBundleResponse.status !== 200 || !creationBundleResponse.data) {
      throw new Error(`PumpPortal API error (Creation): ${creationBundleResponse.statusText}`);
    }
    
    const creationPayload = Array.isArray(creationBundleResponse.data) ? creationBundleResponse.data : creationBundleResponse.data?.transactions;
    if (!Array.isArray(creationPayload) || !creationPayload.length) {
      throw new Error('PumpPortal creation bundle missing transactions');
    }

    const creationSignedTxs = [];
    
    // Sign Create Tx
    const createTx = VersionedTransaction.deserialize(new Uint8Array(bs58.decode(creationPayload[0])));
    createTx.sign([mintKeypair, creatorWallet]);
    creationSignedTxs.push(createTx);
    creationSignature = bs58.encode(createTx.signatures[0]);
    allSignatures.push(creationSignature);
    console.log(`  ✓ Create TX: ${creationSignature}`);

    // Sign Buy Txs
    for (let i = 1; i < creationPayload.length; i++) {
      const buyEntry = creationBundleEntries[i - 1];
      const buyTx = VersionedTransaction.deserialize(new Uint8Array(bs58.decode(creationPayload[i])));
      buyTx.sign([buyEntry.keypair]);
      creationSignedTxs.push(buyTx);
      const sig = bs58.encode(buyTx.signatures[0]);
      allSignatures.push(sig);
      console.log(`  ✓ Buy TX (W${buyEntry.walletId}): ${sig}`);
    }

    // =========================================================================
    // JITO BUNDLE SUBMISSION - Atomic execution for all transactions
    // All transactions land in the same block or none do (all-or-nothing)
    // =========================================================================
    const { sendJitoBundle, waitForBundleConfirmation, isJitoAvailable } = require('./jito_bundles');
    
    console.log('🚀 Submitting ATOMIC bundle via Jito Block Engine...');
    console.log(`   Bundle contains ${creationSignedTxs.length} transactions (Create + ${creationSignedTxs.length - 1} Buys)`);
    
    let creationJitoResult = null;
    
    // Check if Jito is available
    if (!isJitoAvailable()) {
      console.warn('⚠️ Jito endpoints not configured, falling back to direct RPC...');
      // Fallback to RPC if Jito is not available
      const connection = getConnection();
      const rpcSignatures = [];
      
      try {
        console.log('  📤 Sending CREATE transaction via RPC...');
        const createSig = await connection.sendRawTransaction(creationSignedTxs[0].serialize(), {
          skipPreflight: false,
          maxRetries: 3,
          preflightCommitment: 'confirmed'
        });
        rpcSignatures.push(createSig);
        console.log(`    ✅ Create TX: ${createSig}`);
        
        if (creationSignedTxs.length > 1) {
          console.log(`  📤 Sending ${creationSignedTxs.length - 1} BUY transactions via RPC...`);
          for (let i = 1; i < creationSignedTxs.length; i++) {
            try {
              const sig = await connection.sendRawTransaction(creationSignedTxs[i].serialize(), {
                skipPreflight: true,
                maxRetries: 2
              });
              rpcSignatures.push(sig);
              console.log(`    ✅ Buy TX ${i}: ${sig}`);
            } catch (err) {
              console.warn(`    ⚠️ Buy TX ${i} failed: ${err.message}`);
            }
          }
        }
        
        creationSignature = rpcSignatures[0];
        allSignatures.push(...rpcSignatures);
        creationJitoResult = {
          bundleId: `rpc-fallback-${Date.now()}`,
          endpoint: 'rpc-direct',
          signatures: rpcSignatures
        };
      } catch (rpcError) {
        throw new Error(`RPC fallback failed: ${rpcError.message}`);
      }
    } else {
      // Submit via Jito Bundle - ATOMIC execution
      try {
        console.log('  📦 Submitting bundle to Jito Block Engine...');
        
        creationJitoResult = await sendJitoBundle(creationSignedTxs, {
          retries: 5,
          disableFailover: false  // Allow failover between endpoints
        });
        
        console.log(`  ✅ Bundle accepted: ${creationJitoResult.bundleId}`);
        console.log(`     Endpoint: ${creationJitoResult.endpoint}`);
        console.log(`     Engine: ${creationJitoResult.engine || 'jito'}`);
        
        // Extract signatures from signed transactions
        for (const tx of creationSignedTxs) {
          const sig = bs58.encode(tx.signatures[0]);
          allSignatures.push(sig);
        }
        creationSignature = allSignatures[0];
        
      } catch (bundleError) {
        console.error('❌ Jito bundle submission failed:', bundleError.message);
        
        // Check if we should retry with RPC fallback
        const shouldFallback = bundleError.message?.includes('rate limit') ||
                               bundleError.message?.includes('timeout') ||
                               bundleError.message?.includes('All bundle engines failed');
        
        if (shouldFallback) {
          console.log('⚠️ Jito failed, attempting RPC fallback...');
          const connection = getConnection();
          const rpcSignatures = [];
          
          try {
            const createSig = await connection.sendRawTransaction(creationSignedTxs[0].serialize(), {
              skipPreflight: false,
              maxRetries: 3,
              preflightCommitment: 'confirmed'
            });
            rpcSignatures.push(createSig);
            console.log(`    ✅ Create TX (RPC fallback): ${createSig}`);
            
            for (let i = 1; i < creationSignedTxs.length; i++) {
              try {
                const sig = await connection.sendRawTransaction(creationSignedTxs[i].serialize(), {
                  skipPreflight: true,
                  maxRetries: 2
                });
                rpcSignatures.push(sig);
                console.log(`    ✅ Buy TX ${i} (RPC fallback): ${sig}`);
              } catch (err) {
                console.warn(`    ⚠️ Buy TX ${i} failed: ${err.message}`);
              }
            }
            
            creationSignature = rpcSignatures[0];
            allSignatures.push(...rpcSignatures);
            creationJitoResult = {
              bundleId: `rpc-fallback-${Date.now()}`,
              endpoint: 'rpc-direct',
              signatures: rpcSignatures
            };
          } catch (rpcError) {
            throw new Error(`Both Jito and RPC fallback failed: ${bundleError.message} | ${rpcError.message}`);
          }
        } else {
          throw bundleError;
        }
      }
    }

    // VERIFY TRANSACTION STATUS
    console.log(`🔍 Verifying transaction ${creationSignature}...`);
    
    const isRpcFallback = creationJitoResult.bundleId.startsWith('rpc-');
    const isJitoBundle = !isRpcFallback && creationJitoResult.bundleId;
    
    // For Jito bundles, also check bundle status
    if (isJitoBundle) {
      console.log(`  📊 Checking Jito bundle status: ${creationJitoResult.bundleId}`);
      try {
        const { getBundleStatus } = require('./jito_bundles');
        const bundleStatus = await getBundleStatus(creationJitoResult.bundleId);
        if (bundleStatus) {
          console.log(`     Bundle status: ${bundleStatus.status || 'processing'}`);
          if (bundleStatus.slot) {
            console.log(`     Landed in slot: ${bundleStatus.slot}`);
          }
        }
      } catch (statusError) {
        console.warn(`  ⚠️ Could not fetch bundle status: ${statusError.message}`);
      }
    }
    
    // Poll RPC for confirmation (works for both Jito and RPC submissions)
    const rpcCheckPromise = new Promise(async (resolve, reject) => {
      const start = Date.now();
      const connection = getConnection();
      const rpcTimeout = 45000;
      let attempts = 0;
      
      while (Date.now() - start < rpcTimeout) {
        attempts++;
        try {
          const status = await connection.getSignatureStatus(creationSignature);
          const conf = status?.value?.confirmationStatus;
          
          if (conf === 'confirmed' || conf === 'finalized') {
            console.log(`✅ Transaction confirmed in slot ${status.value.slot} (attempt ${attempts})`);
            resolve({ success: true, source: 'rpc', slot: status.value.slot });
            return;
          }
          
          if (status?.value?.err) {
            console.error(`❌ Transaction failed on-chain: ${JSON.stringify(status.value.err)}`);
            reject(new Error(`Transaction failed on-chain: ${JSON.stringify(status.value.err)}`));
            return;
          }
          
          // Show progress every 5 attempts
          if (attempts % 5 === 0) {
            console.log(`⏳ Waiting for confirmation (attempt ${attempts})...`);
          }
        } catch (e) {
          // Ignore transient RPC errors
          if (attempts % 10 === 0) {
            console.warn(`⚠️ RPC error (attempt ${attempts}): ${e.message}`);
          }
        }
        await new Promise(r => setTimeout(r, 1000));
      }
      
      console.error(`❌ Confirmation timeout after ${attempts} attempts`);
      reject(new Error(`Transaction confirmation timeout after ${rpcTimeout/1000}s`));
    });

    let verificationResult = null;
    try {
      verificationResult = await rpcCheckPromise;
      
      if (!verificationResult.success) {
         throw new Error(`Transaction verification failed: ${verificationResult.error || 'Unknown error'}`);
      }
      console.log(`✅ Transaction verified: Landed in slot ${verificationResult.slot}`);
    } catch (verifyError) {
      console.error(`❌ Transaction verification failed: ${verifyError.message}`);
      
      // FINAL CHECK: One last attempt to verify
      console.log('🔍 Performing final confirmation check...');
      try {
        const connection = getConnection();
        const finalStatus = await connection.getSignatureStatus(creationSignature);
        const finalConf = finalStatus?.value?.confirmationStatus;
        
        if (finalConf === 'confirmed' || finalConf === 'finalized') {
          console.log(`✅ FINAL CHECK: Transaction confirmed in slot ${finalStatus.value.slot}!`);
          verificationResult = { success: true, source: 'rpc-final', slot: finalStatus.value.slot };
        } else if (finalStatus?.value?.err) {
          throw new Error(`Transaction failed on-chain: ${JSON.stringify(finalStatus.value.err)}`);
        } else {
          throw new Error(`Transaction verification failed: ${verifyError.message}`);
        }
      } catch (finalError) {
        console.error(`❌ Final check also failed: ${finalError.message}`);
        throw new Error(`Transaction verification failed: ${verifyError.message}`);
      }
    }

    // Save Token IMMEDIATELY after creation bundle submission AND verification
    const mintAddress = mintKeypair.publicKey.toBase58();
    saveToken({
      userId,
      mintAddress,
      tokenName: name,
      tokenSymbol: symbol,
      decimals: 9,
      totalSupply: '1000000000',
      metadataUri,
      platform: 'pumpfun',
      state: 'bonding_curve',
      wallet_id: devWalletId
    });

    // =========================================================================
    // STEP B: FOLLOW-UP BUNDLES (Chunks of 5)
    // =========================================================================
    if (followUpEntries.length > 0) {
      console.log('⏳ Proceeding with follow-up bundles (immediate dispatch)...');
      
      const FOLLOW_UP_CHUNK_SIZE = 5;
      for (let i = 0; i < followUpEntries.length; i += FOLLOW_UP_CHUNK_SIZE) {
        const chunk = followUpEntries.slice(i, i + FOLLOW_UP_CHUNK_SIZE);
        const chunkIndex = Math.floor(i / FOLLOW_UP_CHUNK_SIZE) + 1;
        console.log(`   Processing Follow-up Chunk ${chunkIndex} (${chunk.length} wallets)...`);

        const chunkTxArgs = [];
        chunk.forEach((entry, idx) => {
          // TIP RULE: First TX of *each* bundle pays tip
          const fee = (idx === 0) ? PRIMARY_PRIORITY_FEE : 0;
          chunkTxArgs.push({
            publicKey: entry.keypair.publicKey.toBase58(),
            action: 'buy',
            mint: mintAddress,
            denominatedInSol: 'true',
            amount: entry.amount,
            slippage: BUNDLE_SLIPPAGE,
            priorityFee: fee,
            pool: 'pump'
          });
        });

        try {
          const chunkResponse = await axios.post(PUMPPORTAL_LOCAL_TRADE, normalizePumpPortalBundleArgs(chunkTxArgs), {
            headers: { 'Content-Type': 'application/json' }
          });
          
          const chunkPayload = Array.isArray(chunkResponse.data) ? chunkResponse.data : chunkResponse.data?.transactions;
          if (chunkPayload && chunkPayload.length) {
            const chunkSignedTxs = [];
            for (let j = 0; j < chunkPayload.length; j++) {
              const entry = chunk[j];
              const tx = VersionedTransaction.deserialize(new Uint8Array(bs58.decode(chunkPayload[j])));
              tx.sign([entry.keypair]);
              chunkSignedTxs.push(tx);
              const sig = bs58.encode(tx.signatures[0]);
              allSignatures.push(sig);
            }

            const chunkJitoResult = await sendJitoBundle(chunkSignedTxs, { retries: 10 });
            if (chunkJitoResult?.bundleId) {
              console.log(`   ✅ Chunk ${chunkIndex} Submitted: ${chunkJitoResult.bundleId}`);
              allBundleIds.push(chunkJitoResult.bundleId);
            } else {
              console.error(`   ❌ Chunk ${chunkIndex} Failed to submit to Jito`);
            }
          }
        } catch (chunkError) {
          console.error(`   ❌ Chunk ${chunkIndex} Error:`, chunkError.message);
        }
      }
    }

    console.log(`✅ Launch Sequence Complete. Total Signatures: ${allSignatures.length}`);
    allSignatures.forEach((sig, i) => console.log(`   TX ${i}: https://solscan.io/tx/${sig}`));

    console.log(`✅ Success: https://pump.fun/${mintAddress}`);

    // Mark vanity wallet as used if it was provided and matches
    if (vanityWallet?.publicKey && mintAddress === vanityWallet.publicKey) {
      const vanityPool = require('./vanity_pool');
      await vanityPool.markVanityWalletUsed(vanityWallet.publicKey);
      console.log(`✅ Vanity address ${vanityWallet.publicKey} marked as used`);
    }

    return {
      success: true,
      mintAddress,
      bundleId: allBundleIds[0], // Primary bundle ID
      allBundleIds,
      signatures: allSignatures,
      createSignature: allSignatures[0], // The first signature is always the creation tx
      metadataUri,
      bondingCurve: 'active',
      initialBuy: initialBuySOL,
      bundleWalletCount: walletEntries.length,
      bundleWalletsUsed,
      bundleBuyAmounts: normalizedBundleBuyAmounts,
      bundleEngine: creationJitoResult.engine,
      bundleEndpoint: creationJitoResult.endpoint,
      bundleStatus: {
        bundleId: allBundleIds[0],
        status: 'landed',
        success: true,
        transactions: allSignatures
      }
    };

  } catch (error) {
    console.error('❌ Bundle launch error:', error.message);
    throw error;
  }
}


/**
 * Buy from dev wallet (creator wallet control)
 * @param {object} params - Buy parameters
 * @returns {Promise<string>} Transaction signature
 */
async function buyFromDevWallet(params) {
  const {
    userId,
    tokenMint,
    solAmount,
    slippage = DEFAULT_SLIPPAGE
  } = params;
  
  try {
    console.log(`💰 Dev Wallet Buy: ${solAmount} SOL of ${tokenMint}`);
    
    // Use creator wallet
    const creatorWallet = getActiveWalletKeypair(userId);
    if (!creatorWallet) {
      throw new Error('No active wallet found');
    }
    
    // Use PumpPortal to buy
    return await buyOnPumpfunCurve({
      userId,
      tokenMint,
      solAmount,
      slippage,
      walletKeypair: creatorWallet
    });
    
  } catch (error) {
    console.error('Error buying from dev wallet:', error);
    throw error;
  }
}

/**
 * Sell from dev wallet (creator wallet control)
 * @param {object} params - Sell parameters
 * @returns {Promise<string>} Transaction signature
 */
async function sellFromDevWallet(params) {
  const {
    userId,
    tokenMint,
    tokenAmount,
    sellAll = false,
    slippage = DEFAULT_SLIPPAGE,
    walletId = null,
    walletKeypair: explicitWalletKeypair = null,
    cachedTokenAccount = null
  } = params;
  
  try {
    console.log(`💸 Dev Wallet Sell: ${sellAll ? 'ALL' : tokenAmount} tokens of ${tokenMint}`);
    
    const deriveUiAmountString = (amountStr, decimals) => {
      if (!Number.isInteger(decimals)) {
        return null;
      }
      try {
        const normalized = BigInt(amountStr || '0');
        if (normalized === 0n) {
          return '0';
        }
        const factor = BigInt(10) ** BigInt(decimals);
        const whole = normalized / factor;
        const fraction = normalized % factor;
        if (fraction === 0n) {
          return whole.toString();
        }
        const fractionStr = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');
        return `${whole.toString()}.${fractionStr}`;
      } catch (error) {
        return null;
      }
    };

    let resolvedWalletId = walletId ?? null;
    let creatorWallet = explicitWalletKeypair || null;

    if (!creatorWallet && resolvedWalletId) {
      try {
        creatorWallet = loadWalletFromDatabase(resolvedWalletId);
      } catch (error) {
        console.warn(`[DEV SELL] Failed to load wallet ${resolvedWalletId}: ${error.message}`);
      }
    }
    
    if (!creatorWallet) {
      creatorWallet = getActiveWalletKeypair(userId);
      if (!creatorWallet) {
        throw new Error('No active wallet found');
      }
    }

    const walletAddress = creatorWallet.publicKey.toBase58();
    if (!resolvedWalletId && typeof getWalletByAddress === 'function') {
      const walletRecord = getWalletByAddress(walletAddress);
      if (walletRecord) {
        resolvedWalletId = walletRecord.wallet_id;
      }
    }
    
    let finalAmount = tokenAmount;
    let tokenAccountSnapshot = null;
    let tokenDecimals = null;

    if (cachedTokenAccount && typeof cachedTokenAccount === 'object') {
      tokenAccountSnapshot = {
        address: cachedTokenAccount.address,
        mint: cachedTokenAccount.mint || tokenMint,
        amount: cachedTokenAccount.amount,
        decimals: cachedTokenAccount.decimals,
        uiAmount: cachedTokenAccount.uiAmount ?? null
      };
      tokenDecimals = cachedTokenAccount.decimals ?? null;
    }
    
    // If selling all, get current balance (using live data priority chain)
    if (sellAll && !tokenAccountSnapshot) {
      let account = null;
      let accountSource = null;

      try {
        const directAccount = await getTokenBalance(walletAddress, tokenMint);
        if (directAccount?.amount) {
          account = {
            address: directAccount.address,
            mint: tokenMint,
            amount: String(directAccount.amount),
            decimals: Number.isInteger(directAccount.decimals) ? directAccount.decimals : null,
            uiAmount: Number.isFinite(directAccount.uiAmount) ? directAccount.uiAmount : null,
            uiAmountString: directAccount.uiAmount != null ? String(directAccount.uiAmount) : null
          };
          accountSource = 'spl-token';
          console.log(`[DEV SELL] ✅ SPL token balance resolved for ${tokenMint.substring(0, 8)}...`);
        }
      } catch (splError) {
        console.warn(`[DEV SELL] SPL token balance lookup failed: ${splError.message}`);
      }

      if (isHeliusAvailable()) {
        try {
          const dasResult = await getTokenAccountsDAS({
            ownerAddress: walletAddress,
            mintAddress: tokenMint,
            limit: 1
          });
          const dasAccount = Array.isArray(dasResult.tokenAccounts) && dasResult.tokenAccounts.length > 0
            ? dasResult.tokenAccounts[0]
            : null;
          if (dasAccount) {
            const decimals = Number.isInteger(dasAccount.decimals) ? dasAccount.decimals : null;
            const rawAmountStr = String(dasAccount.amount ?? dasAccount.tokenAmount ?? dasAccount.balance ?? 0);
            account = {
              address: dasAccount.address,
              mint: dasAccount.mint,
              amount: rawAmountStr,
              decimals,
              uiAmountString: deriveUiAmountString(rawAmountStr, decimals)
            };
            account.uiAmount = account.uiAmountString != null ? Number(account.uiAmountString) : null;
            accountSource = 'helius-das';
            console.log(`[DEV SELL] ✅ DAS located token account for ${tokenMint.substring(0, 8)}...`);
          }
        } catch (error) {
          console.warn(`[DEV SELL] DAS token account lookup failed: ${error.message}`);
        }
      }

      if (!account && isHeliusAvailable()) {
        try {
          const heliusAccounts = await getTokenAccountsByMint(walletAddress, tokenMint);
          if (heliusAccounts && heliusAccounts.length > 0) {
            const acc = heliusAccounts[0];
            account = {
              address: acc.address,
              mint: acc.mint,
              amount: String(acc.amount ?? '0'),
              decimals: acc.decimals,
              uiAmountString: typeof acc.uiAmountString === 'string'
                ? acc.uiAmountString
                : deriveUiAmountString(String(acc.amount ?? '0'), acc.decimals)
            };
            account.uiAmount = account.uiAmountString != null ? Number(account.uiAmountString) : (acc.uiAmount ?? null);
            accountSource = 'helius-rpc';
            console.log(`[DEV SELL] ✅ Helius RPC found token account for ${tokenMint.substring(0, 8)}...`);
          }
        } catch (heliusError) {
          console.warn(`[DEV SELL] Helius RPC fetch failed, falling back to standard RPC: ${heliusError.message}`);
        }
      }
      
      // Fallback to standard RPC
      if (!account) {
        const tokenAccounts = await getTokenAccounts(walletAddress);
        
        // Log all mints found for debugging
        if (tokenAccounts.length > 0) {
          console.log(`[DEV SELL] Found ${tokenAccounts.length} token account(s) in wallet`);
          tokenAccounts.forEach(acc => {
            const match = acc.mint === tokenMint ? '✅ MATCH' : '❌';
            console.log(`[DEV SELL]   ${match} Mint: ${acc.mint.substring(0, 8)}... | Balance: ${acc.uiAmount || 0} | Looking for: ${tokenMint.substring(0, 8)}...`);
          });
        }
        
        // Try exact match first
        account = tokenAccounts.find(acc => acc.mint === tokenMint);
        
        // If no exact match, try case-insensitive
        if (!account) {
          const normalizedTokenMint = tokenMint.trim().toLowerCase();
          account = tokenAccounts.find(acc => {
            const normalizedAccMint = (acc.mint || '').trim().toLowerCase();
            return normalizedAccMint === normalizedTokenMint;
          });
          if (account) {
            console.log('[DEV SELL] ⚠️ Found token account with case-insensitive match');
          }
        }

        if (account) {
          accountSource = 'solana-rpc';
        }
      }
      
      if (!account) {
        throw new Error('No token balance found');
      }
      
      // Use raw amount for calculations, but UI amount for display
      finalAmount = account.amount;
      if (account.decimals == null) {
        try {
          const mintInfo = await getMintInfo(tokenMint);
          if (mintInfo?.decimals != null) {
            account.decimals = mintInfo.decimals;
          }
        } catch (error) {
          console.warn(`[DEV SELL] Unable to fetch mint info for ${tokenMint.substring(0, 8)}...: ${error.message}`);
        }
      }

      if (sellAll && account.address) {
        const refreshedBalance = await getTokenAccountBalanceRaw(account.address);
        if (refreshedBalance?.amount) {
          account.amount = refreshedBalance.amount;
          if (Number.isInteger(refreshedBalance.decimals)) {
            account.decimals = refreshedBalance.decimals;
          }
          const refreshedUiString = deriveUiAmountString(account.amount, account.decimals ?? 9);
          account.uiAmountString = refreshedUiString;
          account.uiAmount = refreshedUiString != null ? Number(refreshedUiString) : account.uiAmount;
        }
      }

      const safeDecimals = account.decimals ?? 9;
      const uiAmountDisplay = account.uiAmountString
        ?? (account.uiAmount != null ? account.uiAmount.toString() : deriveUiAmountString(account.amount, safeDecimals))
        ?? account.amount;
      console.log(`  Selling all: ${uiAmountDisplay} tokens (raw: ${account.amount}) [source: ${accountSource ?? 'unknown'}]`);
      tokenAccountSnapshot = {
        address: account.address || null,
        mint: account.mint || tokenMint,
        amount: account.amount,
        decimals: account.decimals ?? safeDecimals,
        uiAmount: account.uiAmount ?? null,
        uiAmountString: account.uiAmountString ?? null
      };
      tokenDecimals = tokenAccountSnapshot.decimals;
    }
    
    const sellParams = {
      userId,
      tokenMint,
      slippage,
      walletId: resolvedWalletId,
      walletKeypair: creatorWallet,
      preResolvedTokenAccount: tokenAccountSnapshot
    };

    if (sellAll) {
      const balanceRaw = BigInt(String(tokenAccountSnapshot.amount || '0'));
      if (balanceRaw === 0n) {
        throw new Error('No token balance found');
      }
      sellParams.rawTokenAmount = balanceRaw;
      sellParams.knownDecimals = tokenDecimals ?? null;
      sellParams.forceFullBalance = true;
    } else {
      sellParams.tokenAmount = finalAmount;
      sellParams.knownDecimals = tokenDecimals ?? null;
    }
    
    const debugSell = {
      sellAll,
      rawTokenAmount: sellParams.rawTokenAmount || null,
      tokenAmount: sellParams.tokenAmount || null,
      knownDecimals: sellParams.knownDecimals || null,
      slippage,
      walletId: sellParams.walletId || null
    };
    console.log(`[DEV SELL] Prepared sell params: ${debugStringify(debugSell)}`);

    // Use PumpPortal to sell
    return await sellOnPumpfunCurve(sellParams);
    
  } catch (error) {
    try {
      if (tokenAccountSnapshot?.address) {
        const latestBalance = await getTokenAccountBalanceRaw(tokenAccountSnapshot.address);
        console.error('[DEV SELL][AUDIT] Latest token account balance:', {
          address: tokenAccountSnapshot.address,
          amount: latestBalance?.amount ?? null,
          decimals: latestBalance?.decimals ?? null,
          uiAmount: latestBalance?.uiAmount ?? null
        });
      } else {
        console.error('[DEV SELL][AUDIT] No token account snapshot available for balance check');
      }
    } catch (auditError) {
      console.error('[DEV SELL][AUDIT] Failed to fetch latest token account balance:', auditError.message);
    }

    try {
      const walletAddress = (explicitWalletKeypair || getActiveWalletKeypair(userId))?.publicKey?.toBase58?.();
      if (walletAddress && isHeliusAvailable()) {
        const dasResult = await getTokenAccountsDAS({
          ownerAddress: walletAddress,
          mintAddress: tokenMint,
          limit: 5
        });
        console.error('[DEV SELL][AUDIT] Helius DAS snapshot:', dasResult);
      }
    } catch (auditDasError) {
      console.error('[DEV SELL][AUDIT] Failed to fetch DAS snapshot:', auditDasError.message);
    }

    console.error('Error selling from dev wallet:', error);
    throw error;
  }
}

module.exports = {
  uploadToPumpfunIPFS,
  launchTokenViaPumpPortal,
  launchTokenViaPumpPortalLocal,
  launchTokenWithSdk,
  completePumpfunLaunch,
  createPumpfunToken,
  createPumpfunTokenWithBundle,
  buyOnPumpfunCurve,
  sellOnPumpfunCurve,
  buyFromDevWallet,
  sellFromDevWallet,
  getPumpfunCreatorFees,
  collectCreatorFee,
  isPumpPortalAvailable,
  getPumpfunTokenInfo,
  PUMPFUN_PROGRAM_ID,
  PUMPPORTAL_API,
  PUMPPORTAL_LOCAL
};

