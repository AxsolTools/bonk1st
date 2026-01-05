/**
 * AQUA Launchpad - Evaporation Engine
 * 
 * Supabase Edge Function for automated token burns on dev wallet buys
 * Triggered by pg_cron at regular intervals OR by pour_rate_logs insert
 * 
 * When dev wallet executes a buy (via pour rate), this engine:
 * 1. Detects the buy from pour_rate_logs
 * 2. Calculates burn amount: tokensReceived * evaporation_rate_percent / 100
 * 3. Executes SPL token burn transaction
 * 4. Updates total_evaporated in token_parameters
 * 5. Logs to evaporation_logs table
 * 
 * Only processes tokens where:
 * - evaporation_enabled = true
 * - market_cap >= 5000 (saves API credits for dead tokens)
 */

// @ts-ignore - Deno imports
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(handler: (req: Request) => Promise<Response>): void;
};

// ============================================================================
// CONFIGURATION
// ============================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const HELIUS_RPC_URL = Deno.env.get('HELIUS_RPC_URL') || 'https://api.mainnet-beta.solana.com';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const LAMPORTS_PER_SOL = 1_000_000_000;
const TOKEN_DECIMALS = 6; // Pump.fun tokens use 6 decimals
const TOKEN_MULTIPLIER = 10 ** TOKEN_DECIMALS;

// SPL Token Program ID
const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

// Minimum market cap to process (saves API credits)
const MIN_MARKET_CAP_USD = 5000;

// ============================================================================
// TYPES
// ============================================================================

interface PourLog {
  id: string;
  token_id: string;
  amount_sol: number;
  source: string;
  tx_signature: string;
  status: string;
  created_at: string;
  tokens_received?: number;
}

interface TokenWithEvaporation {
  id: string;
  mint_address: string;
  name: string;
  symbol: string;
  market_cap: number;
  token_parameters: {
    evaporation_enabled: boolean;
    evaporation_rate_percent: number;
    evaporation_interval_seconds: number;
    evaporation_source: string;
    evaporation_last_executed_at: string | null;
    total_evaporated: number;
    dev_wallet_address: string;
    dev_wallet_auto_enabled: boolean;
  };
}

interface EvaporationResult {
  tokenId: string;
  success: boolean;
  tokensBurned: number;
  txSignature?: string;
  error?: string;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function uint8ArrayToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function base58Decode(str: string): Uint8Array {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const ALPHABET_MAP: { [key: string]: number } = {};
  for (let i = 0; i < ALPHABET.length; i++) {
    ALPHABET_MAP[ALPHABET[i]] = i;
  }
  
  let bytes: number[] = [0];
  for (let i = 0; i < str.length; i++) {
    const value = ALPHABET_MAP[str[i]];
    if (value === undefined) throw new Error('Invalid base58 character');
    
    let carry = value;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  
  for (let i = 0; i < str.length && str[i] === '1'; i++) {
    bytes.push(0);
  }
  
  return new Uint8Array(bytes.reverse());
}

function base58Encode(bytes: Uint8Array): string {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  
  let result = '';
  let num = BigInt('0x' + uint8ArrayToHex(bytes));
  const ZERO = BigInt(0);
  const FIFTY_EIGHT = BigInt(58);
  
  while (num > ZERO) {
    const mod = Number(num % FIFTY_EIGHT);
    result = ALPHABET[mod] + result;
    num = num / FIFTY_EIGHT;
  }
  
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) {
    result = '1' + result;
  }
  
  return result || '1';
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}

// ============================================================================
// CRYPTOGRAPHIC HELPERS
// ============================================================================

async function getServiceSalt(): Promise<string> {
  const { data: config, error } = await supabase
    .from('system_config')
    .select('value')
    .eq('key', 'encryption_salt')
    .single();
  
  if (error || !config?.value) {
    throw new Error('Service salt not found in system_config');
  }
  
  return config.value;
}

async function decryptPrivateKey(encryptedData: string, sessionId: string): Promise<Uint8Array> {
  const serviceSalt = await getServiceSalt();
  
  // Parse encrypted data format: iv:ciphertext:authTag (all hex)
  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }
  
  const [ivHex, ciphertextHex, authTagHex] = parts;
  const iv = hexToUint8Array(ivHex);
  const ciphertext = hexToUint8Array(ciphertextHex);
  const authTag = hexToUint8Array(authTagHex);
  
  // Derive key from session ID + service salt
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(sessionId + serviceSalt),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );
  
  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(serviceSalt),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  
  // Combine ciphertext and authTag for AES-GCM
  const combined = new Uint8Array(ciphertext.length + authTag.length);
  combined.set(ciphertext);
  combined.set(authTag, ciphertext.length);
  
  // Decrypt
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    derivedKey,
    combined.buffer as ArrayBuffer
  );
  
  // Result is base58 encoded private key string
  const privateKeyBase58 = new TextDecoder().decode(decrypted);
  return base58Decode(privateKeyBase58);
}

// ============================================================================
// SOLANA TRANSACTION HELPERS
// ============================================================================

async function getRecentBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }> {
  const response = await fetch(HELIUS_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getLatestBlockhash',
      params: [{ commitment: 'confirmed' }],
    }),
  });
  
  const result = await response.json();
  if (result.error) {
    throw new Error(`Failed to get blockhash: ${result.error.message}`);
  }
  
  return result.result.value;
}

async function getTokenAccountBalance(tokenAccount: string): Promise<bigint> {
  const response = await fetch(HELIUS_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getTokenAccountBalance',
      params: [tokenAccount],
    }),
  });
  
  const result = await response.json();
  if (result.error) {
    return BigInt(0);
  }
  
  return BigInt(result.result?.value?.amount || '0');
}

async function findAssociatedTokenAddress(wallet: Uint8Array, mint: Uint8Array): Promise<Uint8Array> {
  // Associated Token Program ID
  const ATA_PROGRAM_ID = base58Decode('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
  const TOKEN_PROGRAM = base58Decode(TOKEN_PROGRAM_ID);
  
  // Seeds for PDA derivation: [wallet, token_program, mint]
  const seeds = [wallet, TOKEN_PROGRAM, mint];
  
  // Use RPC to find the ATA
  const walletBase58 = base58Encode(wallet);
  const mintBase58 = base58Encode(mint);
  
  const response = await fetch(HELIUS_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getTokenAccountsByOwner',
      params: [
        walletBase58,
        { mint: mintBase58 },
        { encoding: 'base64' }
      ],
    }),
  });
  
  const result = await response.json();
  if (result.error || !result.result?.value?.length) {
    throw new Error(`No token account found for wallet ${walletBase58} and mint ${mintBase58}`);
  }
  
  return base58Decode(result.result.value[0].pubkey);
}

async function sendAndConfirmTransaction(txBase64: string): Promise<string> {
  // Send transaction
  const sendResponse = await fetch(HELIUS_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'sendTransaction',
      params: [
        txBase64,
        {
          encoding: 'base64',
          skipPreflight: false,
          preflightCommitment: 'confirmed',
          maxRetries: 3,
        },
      ],
    }),
  });
  
  const sendResult = await sendResponse.json();
  if (sendResult.error) {
    throw new Error(`Transaction send failed: ${sendResult.error.message}`);
  }
  
  const signature = sendResult.result;
  console.log(`[EVAP] Transaction sent: ${signature}`);
  
  // Wait for confirmation
  for (let i = 0; i < 30; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const statusResponse = await fetch(HELIUS_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignatureStatuses',
        params: [[signature]],
      }),
    });
    
    const statusResult = await statusResponse.json();
    const status = statusResult.result?.value?.[0];
    
    if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
      if (status.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
      }
      console.log(`[EVAP] Transaction confirmed: ${signature}`);
      return signature;
    }
  }
  
  throw new Error('Transaction confirmation timeout');
}

// ============================================================================
// TOKEN BURN EXECUTION
// ============================================================================

async function executeBurn(
  mintAddress: string,
  devWalletAddress: string,
  tokensToBurn: number
): Promise<string> {
  console.log(`[EVAP] Executing burn: ${tokensToBurn} tokens of ${mintAddress}`);
  
  // 1. Get dev wallet from database
  const { data: wallet, error: walletError } = await supabase
    .from('wallets')
    .select('encrypted_private_key, session_id')
    .eq('public_key', devWalletAddress)
    .single();

  if (walletError || !wallet) {
    throw new Error(`Dev wallet not found: ${devWalletAddress}`);
  }

  // 2. Decrypt the private key
  const privateKey = await decryptPrivateKey(wallet.encrypted_private_key, wallet.session_id);
  const publicKey = privateKey.slice(32); // Ed25519 public key is last 32 bytes
  
  // 3. Get token account
  const mintPubkey = base58Decode(mintAddress);
  const walletPubkey = base58Decode(devWalletAddress);
  const tokenAccount = await findAssociatedTokenAddress(walletPubkey, mintPubkey);
  
  // 4. Check token balance
  const balance = await getTokenAccountBalance(base58Encode(tokenAccount));
  const burnAmount = BigInt(Math.floor(tokensToBurn * TOKEN_MULTIPLIER));
  
  if (balance < burnAmount) {
    throw new Error(`Insufficient token balance: have ${balance}, need ${burnAmount}`);
  }
  
  // 5. Get recent blockhash
  const { blockhash } = await getRecentBlockhash();
  
  // 6. Build burn instruction
  // SPL Token Burn instruction layout:
  // - 0: instruction index (8 = BurnChecked)
  // - 1-8: amount (u64 little endian)
  // - 9: decimals
  const burnInstruction = new Uint8Array(10);
  burnInstruction[0] = 15; // BurnChecked instruction
  
  // Amount as u64 little endian
  let amount = burnAmount;
  const MASK = BigInt(0xff);
  const EIGHT = BigInt(8);
  for (let i = 1; i <= 8; i++) {
    burnInstruction[i] = Number(amount & MASK);
    amount = amount >> EIGHT;
  }
  burnInstruction[9] = TOKEN_DECIMALS;
  
  // 7. Build transaction (legacy format for compatibility)
  // Transaction layout:
  // - Signatures count (1 byte)
  // - Signatures (64 bytes each)
  // - Message header
  // - Account keys
  // - Recent blockhash
  // - Instructions
  
  const TOKEN_PROGRAM = base58Decode(TOKEN_PROGRAM_ID);
  
  // Accounts for BurnChecked: [source, mint, owner]
  const accounts = [
    tokenAccount,    // Source token account (writable)
    mintPubkey,      // Mint (writable)
    walletPubkey,    // Owner (signer)
    TOKEN_PROGRAM,   // Token program
  ];
  
  // Message header: [num_required_signatures, num_readonly_signed, num_readonly_unsigned]
  const header = new Uint8Array([1, 0, 2]); // 1 signer, 0 readonly signed, 2 readonly unsigned (mint, program)
  
  // Blockhash as bytes
  const blockhashBytes = base58Decode(blockhash);
  
  // Build instruction
  // [program_id_index, account_indexes_len, ...account_indexes, data_len, ...data]
  const instruction = new Uint8Array([
    3,                    // Program ID index (TOKEN_PROGRAM is accounts[3])
    3,                    // Number of accounts
    0, 1, 2,              // Account indexes (source, mint, owner)
    burnInstruction.length, // Data length
    ...burnInstruction    // Instruction data
  ]);
  
  // Serialize accounts
  const accountsCompact = new Uint8Array(1 + accounts.length * 32);
  accountsCompact[0] = accounts.length;
  for (let i = 0; i < accounts.length; i++) {
    accountsCompact.set(accounts[i], 1 + i * 32);
  }
  
  // Build message
  const message = new Uint8Array([
    ...header,
    ...accountsCompact,
    ...blockhashBytes,
    1, // Number of instructions
    ...instruction,
  ]);
  
  // Sign message
  const signingKey = await crypto.subtle.importKey(
    'raw',
    privateKey.slice(0, 32),
    { name: 'Ed25519' },
    false,
    ['sign']
  );
  
  const signatureBuffer = await crypto.subtle.sign('Ed25519', signingKey, message);
  const signature = new Uint8Array(signatureBuffer);
  
  // Build full transaction
  const transaction = new Uint8Array(1 + 64 + message.length);
  transaction[0] = 1; // Number of signatures
  transaction.set(signature, 1);
  transaction.set(message, 65);
  
  // 8. Send and confirm
  const txSignature = await sendAndConfirmTransaction(uint8ArrayToBase64(transaction));
  
  console.log(`[EVAP] Burn executed: ${tokensToBurn} tokens, TX: ${txSignature}`);
  
  return txSignature;
}

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

async function getTokensWithEvaporation(): Promise<TokenWithEvaporation[]> {
  const { data: tokens, error } = await supabase
    .from('tokens')
    .select(`
      id,
      mint_address,
      name,
      symbol,
      market_cap,
      token_parameters!inner (
        evaporation_enabled,
        evaporation_rate_percent,
        evaporation_interval_seconds,
        evaporation_source,
        evaporation_last_executed_at,
        total_evaporated,
        dev_wallet_address,
        dev_wallet_auto_enabled
      )
    `)
    .eq('token_parameters.evaporation_enabled', true)
    .eq('token_parameters.dev_wallet_auto_enabled', true)
    .gte('market_cap', MIN_MARKET_CAP_USD);

  if (error) {
    console.error('[EVAP] Failed to fetch tokens:', error);
    return [];
  }

  return (tokens || []).map((token: any) => {
    const params = Array.isArray(token.token_parameters) 
      ? token.token_parameters[0] 
      : token.token_parameters;
    return {
      ...token,
      token_parameters: params,
    } as TokenWithEvaporation;
  });
}

async function getUnprocessedPourLogs(tokenId: string): Promise<PourLog[]> {
  const { data: logs, error } = await supabase
    .from('pour_rate_logs')
    .select('*')
    .eq('token_id', tokenId)
    .eq('status', 'success')
    .is('evaporation_processed', null)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[EVAP] Failed to fetch pour logs:', error);
    return [];
  }

  return logs || [];
}

async function markPourLogProcessed(logId: string): Promise<void> {
  await supabase
    .from('pour_rate_logs')
    .update({ evaporation_processed: true })
    .eq('id', logId);
}

async function logEvaporation(
  tokenId: string,
  pourLogId: string,
  tokensBurned: number,
  txSignature: string | null,
  status: 'success' | 'failed',
  errorMessage?: string
): Promise<void> {
  await supabase
    .from('evaporation_logs')
    .insert({
      token_id: tokenId,
      pour_log_id: pourLogId,
      tokens_burned: tokensBurned,
      tx_signature: txSignature,
      status,
      error_message: errorMessage,
    });
}

async function updateTotalEvaporated(tokenId: string, additionalBurned: number): Promise<void> {
  const { data: current } = await supabase
    .from('token_parameters')
    .select('total_evaporated')
    .eq('token_id', tokenId)
    .single();

  const newTotal = (current?.total_evaporated || 0) + additionalBurned;

  await supabase
    .from('token_parameters')
    .update({
      total_evaporated: newTotal,
      evaporation_last_executed_at: new Date().toISOString(),
    })
    .eq('token_id', tokenId);

  // Also update the tokens table for display
  await supabase
    .from('tokens')
    .update({ total_evaporated: newTotal })
    .eq('id', tokenId);
}

// ============================================================================
// MAIN PROCESSING
// ============================================================================

async function processTokenEvaporation(token: TokenWithEvaporation): Promise<EvaporationResult> {
  const params = token.token_parameters;
  
  try {
    console.log(`[EVAP] Processing ${token.symbol} (${token.mint_address.slice(0, 8)}...)`);

    // Get unprocessed pour logs for this token
    const pourLogs = await getUnprocessedPourLogs(token.id);
    
    if (pourLogs.length === 0) {
      console.log(`[EVAP] ${token.symbol}: No unprocessed pour logs`);
      return {
        tokenId: token.id,
        success: true,
        tokensBurned: 0,
      };
    }

    let totalBurned = 0;
    let lastTxSignature: string | undefined;

    for (const pourLog of pourLogs) {
      // Calculate tokens to burn based on pour amount
      // When dev wallet buys X SOL worth, we burn Y% of the tokens received
      const tokensReceived = pourLog.tokens_received || 0;
      
      if (tokensReceived === 0) {
        // Estimate tokens from SOL amount if not recorded
        // This is a rough estimate - ideally pour_rate_logs should store tokens_received
        console.log(`[EVAP] Pour log ${pourLog.id} missing tokens_received, skipping`);
        await markPourLogProcessed(pourLog.id);
        continue;
      }

      const tokensToBurn = tokensReceived * (params.evaporation_rate_percent / 100);
      
      if (tokensToBurn < 1) {
        console.log(`[EVAP] ${token.symbol}: Burn amount too small (${tokensToBurn})`);
        await markPourLogProcessed(pourLog.id);
        continue;
      }

      try {
        // Execute the burn
        const txSignature = await executeBurn(
          token.mint_address,
          params.dev_wallet_address,
          tokensToBurn
        );

        // Log success
        await logEvaporation(token.id, pourLog.id, tokensToBurn, txSignature, 'success');
        await markPourLogProcessed(pourLog.id);

        totalBurned += tokensToBurn;
        lastTxSignature = txSignature;

        console.log(`[EVAP] ${token.symbol}: Burned ${tokensToBurn} tokens (TX: ${txSignature.slice(0, 8)}...)`);

      } catch (burnError) {
        const errorMsg = getErrorMessage(burnError);
        console.error(`[EVAP] ${token.symbol}: Burn failed:`, errorMsg);
        await logEvaporation(token.id, pourLog.id, tokensToBurn, null, 'failed', errorMsg);
        await markPourLogProcessed(pourLog.id);
      }

      // Small delay between burns
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Update total evaporated
    if (totalBurned > 0) {
      await updateTotalEvaporated(token.id, totalBurned);
    }

    return {
      tokenId: token.id,
      success: true,
      tokensBurned: totalBurned,
      txSignature: lastTxSignature,
    };

  } catch (error) {
    const errorMsg = getErrorMessage(error);
    console.error(`[EVAP] ${token.symbol} error:`, errorMsg);
    
    return {
      tokenId: token.id,
      success: false,
      tokensBurned: 0,
      error: errorMsg,
    };
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req: Request) => {
  try {
    console.log('[EVAP] Starting evaporation engine cycle');

    // Fetch tokens with evaporation enabled
    const tokens = await getTokensWithEvaporation();
    console.log(`[EVAP] Found ${tokens.length} tokens with evaporation enabled`);

    if (tokens.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No tokens to process', processed: 0 }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Process each token
    const results: EvaporationResult[] = [];
    for (const token of tokens) {
      const result = await processTokenEvaporation(token);
      results.push(result);
      
      // Delay between tokens
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Summary
    const successful = results.filter(r => r.success).length;
    const totalBurned = results.reduce((sum, r) => sum + r.tokensBurned, 0);

    console.log(`[EVAP] Cycle complete: ${successful}/${results.length} successful, ${totalBurned} tokens burned`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        successful,
        totalBurned,
        results,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMsg = getErrorMessage(error);
    console.error('[EVAP] Engine error:', errorMsg);
    return new Response(
      JSON.stringify({ success: false, error: errorMsg }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

