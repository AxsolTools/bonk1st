/**
 * AQUA Launchpad - Pour Rate Engine
 * 
 * Supabase Edge Function for automated liquidity addition
 * Triggered by pg_cron at regular intervals
 * 
 * This function:
 * 1. Fetches tokens with pour_enabled = true
 * 2. Checks if enough time has passed since last pour
 * 3. Calculates pour amount based on token parameters
 * 4. Executes liquidity addition via PumpPortal/Jupiter
 * 5. Logs results and updates token state
 */

// @ts-ignore - Deno imports
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// Deno global declaration
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

const PUMPPORTAL_API = 'https://pumpportal.fun/api';
const LAMPORTS_PER_SOL = 1_000_000_000;

// Minimum market cap to process (saves API credits for dead tokens)
const MIN_MARKET_CAP_USD = 5000;

// ============================================================================
// TYPES
// ============================================================================

interface TokenWithParams {
  id: string;
  mint_address: string;
  name: string;
  symbol: string;
  stage: string;
  market_cap: number;
  current_liquidity: number;
  token_parameters: {
    pour_enabled: boolean;
    pour_rate_percent: number;
    pour_interval_seconds: number;
    pour_source: string;
    pour_max_per_interval_sol: number;
    pour_min_trigger_sol: number;
    pour_last_executed_at: string | null;
    pour_total_added_sol: number;
    treasury_wallet: string | null;
    treasury_balance_sol: number;
    dev_wallet_address: string | null;
  };
}

interface PourResult {
  tokenId: string;
  success: boolean;
  amountSol: number;
  txSignature?: string;
  error?: string;
}

// ============================================================================
// UTILITY FUNCTIONS (must be defined first)
// ============================================================================

function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}

// ============================================================================
// CRYPTOGRAPHIC HELPERS (must be defined before transaction functions)
// ============================================================================

async function decryptPrivateKey(encryptedData: string): Promise<Uint8Array> {
  // Get the encryption salt from system config
  const { data: config } = await supabase
    .from('system_config')
    .select('value')
    .eq('key', 'service_salt')
    .single();
  
  if (!config?.value) {
    throw new Error('Service salt not found');
  }
  
  // Parse the encrypted data (format: iv:ciphertext:authTag)
  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }
  
  const [ivHex, ciphertextHex, authTagHex] = parts;
  const iv = hexToUint8Array(ivHex);
  const ciphertext = hexToUint8Array(ciphertextHex);
  const authTag = hexToUint8Array(authTagHex);
  
  // Derive the key from the service salt using PBKDF2
  const saltBytes = hexToUint8Array(config.value);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    saltBytes.buffer as ArrayBuffer,
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );
  
  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes.buffer as ArrayBuffer,
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
  
  return new Uint8Array(decrypted);
}

async function signAndSendTransaction(txBytes: Uint8Array, privateKey: Uint8Array): Promise<string> {
  // Import the ed25519 signing key
  const keyPair = await crypto.subtle.importKey(
    'raw',
    privateKey.slice(0, 32), // Ed25519 seed is first 32 bytes
    { name: 'Ed25519' },
    false,
    ['sign']
  );
  
  // The transaction format from PumpPortal/Jupiter is a versioned transaction
  // We need to sign the message portion (first 64 bytes after version byte)
  const messageStart = 1; // Skip version byte
  const messageEnd = txBytes.length - 64; // Signatures are at the end
  const message = txBytes.slice(messageStart, messageEnd);
  
  // Sign the message
  const signatureBuffer = await crypto.subtle.sign(
    'Ed25519',
    keyPair,
    message
  );
  const signature = new Uint8Array(signatureBuffer);
  
  // Insert signature into transaction
  const signedTx = new Uint8Array(txBytes);
  signedTx.set(signature, txBytes.length - 64);
  
  // Send to RPC
  const sendResponse = await fetch(HELIUS_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'sendTransaction',
      params: [
        uint8ArrayToBase64(signedTx),
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
  
  const txSignature = sendResult.result;
  
  // Wait for confirmation
  let confirmed = false;
  for (let i = 0; i < 30; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const statusResponse = await fetch(HELIUS_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignatureStatuses',
        params: [[txSignature]],
      }),
    });
    
    const statusResult = await statusResponse.json();
    const status = statusResult.result?.value?.[0];
    
    if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
      confirmed = true;
      break;
    }
    
    if (status?.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
    }
  }
  
  if (!confirmed) {
    throw new Error('Transaction confirmation timeout');
  }
  
  return txSignature;
}

// ============================================================================
// DATABASE HELPERS
// ============================================================================

async function updatePourTimestamp(tokenId: string): Promise<void> {
  await supabase
    .from('token_parameters')
    .update({
      pour_last_executed_at: new Date().toISOString(),
    })
    .eq('token_id', tokenId);
}

async function logPourExecution(
  tokenId: string,
  amountSol: number,
  source: string,
  txSignature: string | null,
  status: 'pending' | 'success' | 'failed',
  errorMessage?: string
): Promise<void> {
  // Log to pour_rate_logs
  await supabase
    .from('pour_rate_logs')
    .insert({
      token_id: tokenId,
      amount_sol: amountSol,
      source,
      tx_signature: txSignature,
      status,
      error_message: errorMessage,
    });

  // CRITICAL: Also log to liquidity_history for real-time metrics
  // This enables the Pour Rate visualizer to show live data
  if (status === 'success' && amountSol > 0) {
    await supabase
      .from('liquidity_history')
      .insert({
        token_id: tokenId,
        timestamp: new Date().toISOString(),
        liquidity_sol: amountSol,
        source: 'pour',
        change_amount_sol: amountSol,
        tx_signature: txSignature,
      });
    
    console.log(`[POUR] Logged ${amountSol} SOL to liquidity_history for token ${tokenId}`);
  }
}

// ============================================================================
// TRANSACTION EXECUTION
// ============================================================================

async function executePumpPortalBuy(
  mintAddress: string,
  amountSol: number,
  devWalletAddress: string
): Promise<string> {
  console.log(`[POUR] Executing PumpPortal buy: ${amountSol} SOL for ${mintAddress}`);
  
  // 1. Get dev wallet keypair from encrypted storage
  const { data: wallet, error: walletError } = await supabase
    .from('wallets')
    .select('encrypted_private_key')
    .eq('public_key', devWalletAddress)
    .single();

  if (walletError || !wallet) {
    throw new Error(`Dev wallet not found: ${devWalletAddress}`);
  }

  // 2. Decrypt the private key
  const decryptedKey = await decryptPrivateKey(wallet.encrypted_private_key);
  
  // 3. Get transaction from PumpPortal
  const response = await fetch(`${PUMPPORTAL_API}/trade-local`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      publicKey: devWalletAddress,
      action: 'buy',
      mint: mintAddress,
      amount: amountSol * LAMPORTS_PER_SOL,
      denominatedInSol: 'true',
      slippage: 10,
      priorityFee: 0.0001,
      pool: 'pump',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`PumpPortal API error: ${errorText}`);
  }

  // 4. Get the transaction bytes and sign
  const txBuffer = await response.arrayBuffer();
  const txBytes = new Uint8Array(txBuffer);
  
  // 5. Sign the transaction with the decrypted key
  const signature = await signAndSendTransaction(txBytes, decryptedKey);
  
  console.log(`[POUR] PumpPortal buy executed: ${signature}`);
  
  // 6. Log the successful transaction
  await supabase.from('pour_rate_logs').insert({
    token_id: mintAddress,
    amount_sol: amountSol,
    source: 'pumpportal',
    tx_signature: signature,
    status: 'success',
  });

  return signature;
}

async function executePostMigrationPour(
  mintAddress: string,
  amountSol: number,
  devWalletAddress: string
): Promise<string> {
  console.log(`[POUR] Executing post-migration pour: ${amountSol} SOL for ${mintAddress}`);
  
  // 1. Get dev wallet keypair from encrypted storage
  const { data: wallet, error: walletError } = await supabase
    .from('wallets')
    .select('encrypted_private_key')
    .eq('public_key', devWalletAddress)
    .single();

  if (walletError || !wallet) {
    throw new Error(`Dev wallet not found: ${devWalletAddress}`);
  }

  // 2. Get token info to determine migration target
  const { data: token, error: tokenError } = await supabase
    .from('tokens')
    .select('migration_pool_address, token_parameters!inner(migration_target)')
    .eq('mint_address', mintAddress)
    .single();

  if (tokenError || !token) {
    throw new Error(`Token not found: ${mintAddress}`);
  }

  const params = Array.isArray(token.token_parameters) 
    ? token.token_parameters[0] 
    : token.token_parameters;
  const migrationTarget = params?.migration_target || 'raydium';
  const poolAddress = token.migration_pool_address;

  if (!poolAddress) {
    throw new Error(`No pool address for migrated token: ${mintAddress}`);
  }

  // 3. Decrypt the private key
  const decryptedKey = await decryptPrivateKey(wallet.encrypted_private_key);

  // 4. Use Jupiter for swap/liquidity addition
  const quoteResponse = await fetch(
    `https://quote-api.jup.ag/v6/quote?` +
    `inputMint=So11111111111111111111111111111111111111112&` +
    `outputMint=${mintAddress}&` +
    `amount=${Math.floor(amountSol * LAMPORTS_PER_SOL)}&` +
    `slippageBps=1000`
  );

  if (!quoteResponse.ok) {
    throw new Error('Jupiter quote failed');
  }

  const quoteData = await quoteResponse.json();
  console.log(`[POUR] Jupiter quote received for ${mintAddress}`);

  // 5. Get swap transaction
  const swapResponse = await fetch('https://quote-api.jup.ag/v6/swap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: quoteData,
      userPublicKey: devWalletAddress,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 10000,
    }),
  });

  if (!swapResponse.ok) {
    throw new Error('Jupiter swap transaction failed');
  }

  const swapData = await swapResponse.json();
  console.log(`[POUR] Jupiter swap transaction prepared for ${mintAddress}`);

  // 6. Decode and sign the transaction
  const swapTxBytes = base64ToUint8Array(swapData.swapTransaction);
  const signature = await signAndSendTransaction(swapTxBytes, decryptedKey);
  
  console.log(`[POUR] Jupiter swap executed: ${signature}`);
  
  // 7. Log the successful transaction
  await supabase.from('pour_rate_logs').insert({
    token_id: mintAddress,
    amount_sol: amountSol,
    source: `jupiter_${migrationTarget}`,
    tx_signature: signature,
    status: 'success',
  });

  return signature;
}

// ============================================================================
// TOKEN FETCHING
// ============================================================================

async function getEligibleTokens(): Promise<TokenWithParams[]> {
  const { data: tokens, error } = await supabase
    .from('tokens')
    .select(`
      id,
      mint_address,
      name,
      symbol,
      stage,
      market_cap,
      current_liquidity,
      token_parameters!inner (
        pour_enabled,
        pour_rate_percent,
        pour_interval_seconds,
        pour_source,
        pour_max_per_interval_sol,
        pour_min_trigger_sol,
        pour_last_executed_at,
        pour_total_added_sol,
        treasury_wallet,
        treasury_balance_sol,
        dev_wallet_address
      )
    `)
    .eq('token_parameters.pour_enabled', true)
    .in('stage', ['bonding', 'migrated'])
    .gte('market_cap', MIN_MARKET_CAP_USD);

  if (error) {
    console.error('[POUR] Failed to fetch tokens:', error);
    return [];
  }

  // Filter tokens that are ready for pour (enough time passed)
  const now = Date.now();
  const eligible: TokenWithParams[] = [];

  for (const token of tokens || []) {
    const params = Array.isArray(token.token_parameters) 
      ? token.token_parameters[0] 
      : token.token_parameters;
    
    if (!params) continue;

    const lastPour = params.pour_last_executed_at 
      ? new Date(params.pour_last_executed_at).getTime() 
      : 0;
    const intervalMs = params.pour_interval_seconds * 1000;
    
    if (now - lastPour >= intervalMs) {
      eligible.push({
        ...token,
        token_parameters: params,
      } as TokenWithParams);
    }
  }

  return eligible;
}

// ============================================================================
// POUR PROCESSING
// ============================================================================

async function processPourForToken(token: TokenWithParams): Promise<PourResult> {
  const params = token.token_parameters;
  
  try {
    console.log(`[POUR] Processing ${token.symbol} (${token.mint_address.slice(0, 8)}...)`);

    // Calculate pour amount
    let pourAmountSol = 0;

    switch (params.pour_source) {
      case 'fees':
        pourAmountSol = params.treasury_balance_sol * (params.pour_rate_percent / 100);
        break;
      
      case 'treasury':
        pourAmountSol = params.treasury_balance_sol * (params.pour_rate_percent / 100);
        break;
      
      case 'both':
        pourAmountSol = params.treasury_balance_sol * (params.pour_rate_percent / 100);
        break;
    }

    // Apply limits
    pourAmountSol = Math.min(pourAmountSol, params.pour_max_per_interval_sol);

    // Check minimum
    if (pourAmountSol < params.pour_min_trigger_sol) {
      console.log(`[POUR] ${token.symbol}: Amount ${pourAmountSol.toFixed(6)} SOL below minimum ${params.pour_min_trigger_sol}`);
      
      // Update last executed time anyway to prevent continuous attempts
      await updatePourTimestamp(token.id);
      
      return {
        tokenId: token.id,
        success: true,
        amountSol: 0,
        error: 'Below minimum trigger',
      };
    }

    // Execute pour based on token stage
    let txSignature: string;
    
    if (token.stage === 'bonding') {
      // For bonding curve tokens, execute buy via PumpPortal
      txSignature = await executePumpPortalBuy(token.mint_address, pourAmountSol, params.dev_wallet_address!);
    } else {
      // For migrated tokens, add liquidity via Jupiter/Raydium
      txSignature = await executePostMigrationPour(token.mint_address, pourAmountSol, params.dev_wallet_address!);
    }

    // Log success
    await logPourExecution(token.id, pourAmountSol, params.pour_source, txSignature, 'success');
    
    // Update parameters
    await supabase
      .from('token_parameters')
      .update({
        pour_last_executed_at: new Date().toISOString(),
        pour_total_added_sol: params.pour_total_added_sol + pourAmountSol,
        treasury_balance_sol: params.treasury_balance_sol - pourAmountSol,
      })
      .eq('token_id', token.id);

    // Update token liquidity and calculate real-time metrics
    const newLiquidity = token.current_liquidity + pourAmountSol;
    
    // Calculate water_level: (Liquidity / Total Supply) * 100, normalized to 0-100
    // Using a reasonable baseline where 1 SOL of liquidity per 1M tokens = 100%
    const totalSupplyNormalized = 1_000_000_000; // 1B tokens standard
    const waterLevel = Math.min(100, Math.max(0, (newLiquidity / 100) * 100)); // Simplified: 100 SOL = 100%
    
    // Get market cap for constellation strength calculation
    const { data: tokenData } = await supabase
      .from('tokens')
      .select('market_cap, total_supply')
      .eq('id', token.id)
      .single();
    
    // Calculate constellation_strength: (Liquidity / Market Cap) * 100
    let constellationStrength = 50; // Default
    if (tokenData?.market_cap && tokenData.market_cap > 0) {
      constellationStrength = Math.min(100, Math.max(0, (newLiquidity / tokenData.market_cap) * 100));
    }

    await supabase
      .from('tokens')
      .update({
        current_liquidity: newLiquidity,
        water_level: waterLevel,
        constellation_strength: constellationStrength,
        updated_at: new Date().toISOString(),
      })
      .eq('id', token.id);

    console.log(`[POUR] ${token.symbol}: Poured ${pourAmountSol.toFixed(6)} SOL (TX: ${txSignature.slice(0, 8)}...) | Water: ${waterLevel.toFixed(1)}% | Constellation: ${constellationStrength.toFixed(1)}%`);

    return {
      tokenId: token.id,
      success: true,
      amountSol: pourAmountSol,
      txSignature,
    };

  } catch (error: unknown) {
    const errorMsg = getErrorMessage(error);
    console.error(`[POUR] ${token.symbol} error:`, errorMsg);
    
    // Log failure
    await logPourExecution(token.id, 0, params.pour_source, null, 'failed', errorMsg);
    
    // Update timestamp to avoid immediate retry
    await updatePourTimestamp(token.id);

    return {
      tokenId: token.id,
      success: false,
      amountSol: 0,
      error: errorMsg,
    };
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req: Request) => {
  try {
    // Verify request (can add auth check here)
    const authHeader = req.headers.get('Authorization');
    if (authHeader !== `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`) {
      // Allow cron trigger without auth
      console.log('[POUR] Running as cron job');
    }

    console.log('[POUR] Starting pour rate engine cycle');

    // Fetch eligible tokens
    const eligibleTokens = await getEligibleTokens();
    console.log(`[POUR] Found ${eligibleTokens.length} eligible tokens`);

    if (eligibleTokens.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No tokens to process', processed: 0 }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Process each token
    const results: PourResult[] = [];
    for (const token of eligibleTokens) {
      const result = await processPourForToken(token);
      results.push(result);
      
      // Small delay between tokens to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Summary
    const successful = results.filter(r => r.success).length;
    const totalPouredSol = results.reduce((sum, r) => sum + (r.success ? r.amountSol : 0), 0);

    console.log(`[POUR] Cycle complete: ${successful}/${results.length} successful, ${totalPouredSol.toFixed(6)} SOL total`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        successful,
        totalPouredSol,
        results,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMsg = getErrorMessage(error);
    console.error('[POUR] Engine error:', errorMsg);
    return new Response(
      JSON.stringify({ success: false, error: errorMsg }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
