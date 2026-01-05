/**
 * Raydium CP-Swap Implementation
 * Uses Raydium CLI via subprocess for pool operations
 * 
 * Prerequisites:
 * 1. Install Raydium CLI: cargo install raydium-cli
 * 2. Ensure raydium command is in PATH
 * 3. Configure wallet keypair path
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);
const { PublicKey } = require('@solana/web3.js');
const { getConnection, solToLamports } = require('./solana_utils');
const { getActiveWalletKeypair, loadWalletFromDatabase } = require('./wallets');
const { savePool, getTokenByMint } = require('./db');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Raydium CP-Swap Program ID
const CPSWAP_PROGRAM_ID = new PublicKey('CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C');

// AMM Config Addresses (Mainnet-beta)
const AMM_CONFIGS = {
  '0.25%': '58oQChE4yWADKKiRzfgQCQkHqA2d4b9VbQ1yC1Q5Cj2k',
  '1%': '9zSzfkYy6awexsHvmggeH36pfVUdDGyCcwmjT3AQPBj6',
  '2%': '8PzXg9EwYgK4nF6aDq9C4Z6X4g1B5n7Q1b3J5g4Q2j7k',
  '4%': '62LwG4f9jX6gK4nF6aDq9C4Z6X4g1B5n7Q1b3J5g4Q2j7k'
};

// Wrapped SOL mint
const WSOL_MINT = 'So11111111111111111111111111111111111111112';

/**
 * Create temporary keypair file for Raydium CLI
 * @param {number} userId - User ID
 * @param {number} walletId - Optional wallet ID, otherwise uses active wallet
 * @returns {Promise<string>} Path to temporary keypair file
 */
async function createTempKeypairFile(userId, walletId = null) {
  try {
    let keypair;
    if (walletId) {
      keypair = loadWalletFromDatabase(walletId);
      if (!keypair) {
        throw new Error(`Wallet ID ${walletId} not found`);
      }
    } else {
      keypair = getActiveWalletKeypair(userId);
      if (!keypair) {
        throw new Error('No active wallet found');
      }
    }
    
    // Create temp directory if needed
    const tempDir = path.join(os.tmpdir(), 'solana-bot-keypairs');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true, mode: 0o700 });
    }
    
    // Create temporary keypair file
    const tempFile = path.join(tempDir, `keypair_${userId}_${Date.now()}.json`);
    const keypairArray = Array.from(keypair.secretKey);
    fs.writeFileSync(tempFile, JSON.stringify(keypairArray), { mode: 0o600 });
    
    return tempFile;
  } catch (error) {
    console.error('Error creating temp keypair file:', error);
    throw error;
  }
}

/**
 * Clean up temporary keypair file
 * @param {string} filePath - Path to file to delete
 */
function cleanupTempFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error('Error cleaning up temp file:', error);
  }
}

/**
 * Check if Raydium CLI is installed
 * @returns {Promise<boolean>} True if installed
 */
async function checkRaydiumCLI() {
  try {
    const { stdout } = await execPromise('raydium --version');
    return stdout.includes('raydium');
  } catch (error) {
    return false;
  }
}

/**
 * Create Raydium CP-Swap pool using CLI
 * @param {object} params - Pool parameters
 * @returns {Promise<object>} Pool creation result
 */
async function createCPSwapPool(params) {
  const {
    userId,
    walletId, // Optional: specify wallet ID, otherwise uses active wallet
    tokenMint,
    tokenAmount,
    solAmount,
    feePercentage = '0.25%',
    openTime = 0
  } = params;
  
  let keypairFile = null;
  
  try {
    // Use SDK-based pool creation (no CLI needed)
    console.log('Creating CPMM pool via Raydium SDK...');
    const { createCPMMPoolSDK } = require('./raydium_sdk');
    const result = await createCPMMPoolSDK({
      userId,
      walletId,
      tokenMint,
      tokenAmount,
      solAmount,
      openTime
    });
    
    console.log('✅ Pool created via SDK');
    return {
      poolAddress: result.poolAddress,
      lpTokenMint: null, // SDK doesn't return LP mint separately
      signature: result.signature
    };
    
    // Get token info
    const token = getTokenByMint(tokenMint);
    if (!token) {
      throw new Error('Token not found in database');
    }
    
    // Convert amounts to raw units
    const rawTokenAmount = Math.floor(parseFloat(tokenAmount) * Math.pow(10, token.decimals));
    const rawSolAmount = solToLamports(solAmount);
    
    // Get AMM config
    const ammConfig = AMM_CONFIGS[feePercentage];
    if (!ammConfig) {
      throw new Error(`Invalid fee percentage: ${feePercentage}`);
    }
    
    // Create temporary keypair file
    keypairFile = await createTempKeypairFile(userId, walletId);
    
    // Get RPC URL from config
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    
    // Build Raydium CLI command (CORRECTED per official repo)
    // Note: This assumes the user has created ATAs for both tokens
    const commandParts = [
      'raydium',
      'cpswap',
      'initialize-pool',
      '--token-0-mint',
      tokenMint,
      '--token-1-mint',
      WSOL_MINT,
      '--amm-config',
      ammConfig,
      '--init-amount-0',
      String(rawTokenAmount),
      '--init-amount-1',
      String(rawSolAmount),
      '--open-time',
      String(openTime),
      '--config.wallet',
      JSON.stringify(keypairFile),
      '--config.rpc-url',
      JSON.stringify(rpcUrl)
    ];
    const command = commandParts.join(' ');
    
    console.log('Creating Raydium CP-Swap pool...');
    console.log('Command:', command.replace(JSON.stringify(keypairFile), '"[KEYPAIR_PATH]"'));
    
    // Execute command
    const { stdout, stderr } = await execPromise(command, {
      maxBuffer: 1024 * 1024 * 10, // 10MB buffer
      timeout: 120000 // 2 minute timeout
    });
    
    // Parse output for pool address
    // Raydium CLI outputs pool info - parse it
    const poolAddressMatch = stdout.match(/Pool ID[:\s]+([A-Za-z0-9]{32,44})/i) ||
                            stdout.match(/AMM ID[:\s]+([A-Za-z0-9]{32,44})/i) ||
                            stdout.match(/([A-Za-z0-9]{32,44})/);
    
    if (!poolAddressMatch) {
      throw new Error('Could not parse pool address from CLI output');
    }
    
    const poolAddress = poolAddressMatch[1];
    
    // Extract LP token mint if available
    const lpMintMatch = stdout.match(/LP Mint[:\s]+([A-Za-z0-9]{32,44})/i);
    const lpTokenMint = lpMintMatch ? lpMintMatch[1] : null;
    
    // Extract transaction signature if present
    const signatureMatch = stdout.match(/Signature[:\s]+([A-Za-z0-9]{64,88})/i);
    const signature = signatureMatch ? signatureMatch[1] : null;

    if (!signature) {
      console.warn('⚠️ Could not parse Raydium CLI signature from output');
    }

    // Verify pool exists on-chain before saving
    console.log('🔍 Verifying pool on-chain...');
    try {
      const poolInfo = await getPoolInfo(poolAddress);
      if (!poolInfo || !poolInfo.exists) {
        throw new Error('Pool not found on-chain after creation');
      }
      console.log('✓ Pool verified on-chain');
    } catch (verifyError) {
      throw new Error(`Pool creation reported success but verification failed: ${verifyError.message}`);
    }
    
    // Save pool to database after verification
    const poolRecord = savePool({
      tokenId: token.token_id,
      poolAddress,
      platform: 'raydium',
      lpTokenMint,
      initialTokenAmount: tokenAmount,
      initialQuoteAmount: solAmount
    });
    
    console.log(`✅ Raydium pool created & verified: ${poolAddress}`);
    if (signature) {
      console.log(`   Transaction signature: ${signature}`);
    }
    
    return {
      poolAddress,
      lpTokenMint,
      tokenAmount,
      solAmount,
      feePercentage,
      ammConfig,
      cliOutput: stdout,
      signature
    };
    
  } catch (error) {
    console.error('Error creating CP-Swap pool:', error);
    console.error('stderr:', error.stderr || 'N/A');
    throw new Error(`Pool creation failed: ${error.message}`);
  } finally {
    // Clean up temporary keypair file
    if (keypairFile) {
      cleanupTempFile(keypairFile);
    }
  }
}

/**
 * Add liquidity to existing CP-Swap pool using CLI
 * @param {object} params - Liquidity parameters
 * @returns {Promise<string>} Transaction signature
 */
async function addLiquidityToPool(params) {
  const {
    userId,
    walletId, // Optional: specify wallet ID, otherwise uses active wallet
    poolAddress,
    tokenAmount,
    solAmount,
    tokenMint
  } = params;
  
  let keypairFile = null;
  
  try {
    // Get token info
    const token = getTokenByMint(tokenMint);
    if (!token) {
      throw new Error('Token not found');
    }
    
    // Convert amounts
    const rawTokenAmount = Math.floor(parseFloat(tokenAmount) * Math.pow(10, token.decimals));
    const rawSolAmount = solToLamports(solAmount);
    
    // Create keypair file
    keypairFile = await createTempKeypairFile(userId, walletId);
    
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    
    const commandParts = [
      'raydium',
      'cpswap',
      'deposit',
      '--pool-id',
      poolAddress,
      '--amount-0',
      String(rawTokenAmount),
      '--amount-1',
      String(rawSolAmount),
      '--config.wallet',
      JSON.stringify(keypairFile),
      '--config.rpc-url',
      JSON.stringify(rpcUrl)
    ];
    const command = commandParts.join(' ');
    
    console.log('Adding liquidity to pool...');
    
    const { stdout, stderr } = await execPromise(command, {
      maxBuffer: 1024 * 1024 * 10,
      timeout: 120000
    });
    
    // Parse transaction signature
    const sigMatch = stdout.match(/Signature[:\s]+([A-Za-z0-9]{64,88})/i) ||
                    stdout.match(/([A-Za-z0-9]{64,88})/);
    
    const signature = sigMatch ? sigMatch[1] : null;
    
    if (!signature || signature === 'unknown') {
      throw new Error('Could not parse transaction signature from CLI output');
    }
    
    // Verify transaction on-chain
    console.log('🔍 Verifying transaction on-chain...');
    const conn = getConnection();
    const { confirmTransactionWithTimeout } = require('./confirmation_wrapper');
    const latestBlockhash = await conn.getLatestBlockhash();
    await confirmTransactionWithTimeout(conn, signature, latestBlockhash, 60000);
    
    console.log(`✅ Liquidity added & verified: ${signature}`);
    
    return signature;
    
  } catch (error) {
    console.error('Error adding liquidity:', error);
    throw new Error(`Add liquidity failed: ${error.message}`);
  } finally {
    if (keypairFile) {
      cleanupTempFile(keypairFile);
    }
  }
}

/**
 * Remove liquidity from CP-Swap pool using CLI
 * @param {object} params - Withdrawal parameters
 * @param {number} params.userId - User ID
 * @param {string} params.poolAddress - Pool address
 * @param {string} params.lpTokenAmount - LP token amount in RAW units (smallest denomination)
 * @param {number} [params.slippageBps=100] - Slippage tolerance in basis points (default 1%)
 * @returns {Promise<object>} Transaction result with signature and amounts
 */
async function removeLiquidityFromPool(params) {
  const {
    userId,
    walletId, // Optional: specify wallet ID, otherwise uses active wallet
    poolAddress,
    lpTokenAmount,
    slippageBps = 100  // Default 1% slippage
  } = params;
  
  let keypairFile = null;
  
  try {
    // Validate inputs
    if (!poolAddress || !lpTokenAmount) {
      throw new Error('Pool address and LP token amount are required');
    }
    
    const lpAmountBigInt = BigInt(lpTokenAmount);
    if (lpAmountBigInt <= 0n) {
      throw new Error('LP token amount must be positive');
    }
    
    keypairFile = await createTempKeypairFile(userId, walletId);
    
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    
    // Build command with slippage protection
    // Note: Raydium CLI uses raw amounts (smallest units)
    const commandParts = [
      'raydium',
      'cpswap',
      'withdraw',
      '--pool-id',
      poolAddress,
      '--lp-amount',
      String(lpTokenAmount),
      '--config.wallet',
      JSON.stringify(keypairFile),
      '--config.rpc-url',
      JSON.stringify(rpcUrl)
    ];
    
    // Add slippage if supported by CLI version
    // (Check Raydium CLI docs for exact parameter name)
    if (slippageBps > 0) {
      commandParts.push('--slippage-bps', String(slippageBps));
    }
    
    const command = commandParts.join(' ');
    
    console.log('Removing liquidity from pool...');
    console.log(`LP Amount: ${lpTokenAmount} (raw units)`);
    console.log(`Slippage: ${slippageBps} bps (${slippageBps / 100}%)`);
    
    const { stdout, stderr } = await execPromise(command, {
      maxBuffer: 1024 * 1024 * 10,
      timeout: 120000
    });
    
    // Parse transaction signature
    const sigMatch = stdout.match(/Signature[:\s]+([A-Za-z0-9]{64,88})/i) ||
                    stdout.match(/([A-Za-z0-9]{64,88})/);
    
    const signature = sigMatch ? sigMatch[1] : null;
    
    if (!signature || signature === 'unknown') {
      console.error('CLI stdout:', stdout);
      console.error('CLI stderr:', stderr);
      throw new Error('Could not parse transaction signature from CLI output');
    }
    
    // Parse output amounts if available
    const token0Match = stdout.match(/Amount 0[:\s]+([0-9]+)/i);
    const token1Match = stdout.match(/Amount 1[:\s]+([0-9]+)/i);
    
    // Verify transaction on-chain
    console.log('🔍 Verifying transaction on-chain...');
    const conn = getConnection();
    const { confirmTransactionWithTimeout } = require('./confirmation_wrapper');
    const latestBlockhash = await conn.getLatestBlockhash();
    await confirmTransactionWithTimeout(conn, signature, latestBlockhash, 60000);
    
    console.log(`✅ Liquidity removed & verified: ${signature}`);
    
    return {
      signature,
      lpTokensBurned: lpTokenAmount,
      token0Received: token0Match ? token0Match[1] : null,
      token1Received: token1Match ? token1Match[1] : null,
      cliOutput: stdout
    };
    
  } catch (error) {
    console.error('Error removing liquidity:', error);
    console.error('stderr:', error.stderr || 'N/A');
    
    // Provide more helpful error messages
    const errorMsg = error.message || '';
    if (errorMsg.includes('insufficient')) {
      throw new Error('Insufficient LP tokens in wallet');
    } else if (errorMsg.includes('pool not found') || errorMsg.includes('invalid pool')) {
      throw new Error('Pool not found or invalid pool address');
    } else if (errorMsg.includes('slippage')) {
      throw new Error('Transaction would exceed slippage tolerance. Try again or increase slippage.');
    } else {
      throw new Error(`Remove liquidity failed: ${errorMsg}`);
    }
  } finally {
    if (keypairFile) {
      cleanupTempFile(keypairFile);
    }
  }
}

/**
 * Get pool information
 * @param {string} poolAddress - Pool address
 * @returns {Promise<object>} Pool info
 */
async function getPoolInfo(poolAddress) {
  try {
    const conn = getConnection();
    const poolPubkey = new PublicKey(poolAddress);
    
    // Get pool account
    const poolAccount = await conn.getAccountInfo(poolPubkey);
    
    if (!poolAccount) {
      throw new Error('Pool not found');
    }
    
    // For detailed parsing, would need Raydium SDK
    // For now, return basic info
    return {
      address: poolAddress,
      exists: true,
      owner: poolAccount.owner.toBase58(),
      lamports: poolAccount.lamports,
      dataLength: poolAccount.data.length
    };
    
  } catch (error) {
    console.error('Error getting pool info:', error);
    throw error;
  }
}

/**
 * Complete Raydium token launch flow
 * Creates token, uploads metadata, and optionally creates pool
 * @param {object} params - Launch parameters
 * @returns {Promise<object>} Launch result
 */
async function launchRaydiumToken(params) {
  const {
    userId,
    tokenName,
    tokenSymbol,
    decimals = 9,
    supply,
    description = '',
    twitter = '',
    telegram = '',
    website = '',
    imageBuffer = null,
    devWalletId,
    poolTokenAmount = 0,
    poolSolAmount = 0,
    autoCreatePool = false
  } = params;

  let mintAddress = null;
  let poolAddress = null;
  let lpTokenMint = null;
  let tokenSignature = null;
  let metadataUrl = null;
  let imageUrl = null;

  try {
    console.log('🚀 Starting Raydium token launch...');
    console.log(`Token: ${tokenSymbol} (${tokenName})`);
    console.log(`Supply: ${supply} tokens (${decimals} decimals)`);
    console.log(`Auto-create pool: ${autoCreatePool}`);

    // Step 1: Create Token-2022 token
    console.log('📝 Step 1/3: Creating Token-2022...');
    const { createToken2022 } = require('./tokens');
    const { createAndUploadTokenMetadata } = require('./arweave');

    const tokenResult = await createToken2022({
      userId,
      walletId: devWalletId, // Use the wallet selected in the wizard
      name: tokenName,
      symbol: tokenSymbol,
      decimals,
      totalSupply: supply,
      description,
      twitter,
      telegram,
      website,
      imageUrl: null, // Will upload separately
      enableTransferFee: params.enableTransferFee || false,
      transferFeeBasisPoints: params.transferFeeBasisPoints || 0,
      maxTransferFee: BigInt(params.maxTransferFee || 0), // Convert to BigInt here
      disableMintAuthority: params.revokeMintAuthority !== false, // Default true
      disableFreezeAuthority: params.revokeFreezeAuthority !== false // Default true (consistent with mint)
    });

    mintAddress = tokenResult.mintAddress;
    tokenSignature = tokenResult.signature;
    console.log(`✅ Token created: ${mintAddress}`);

    // Step 2: Upload metadata to Arweave
    if (description || twitter || telegram || website || imageBuffer) {
      console.log('📤 Step 2/3: Uploading metadata to Arweave...');
      try {
        const metadataResult = await createAndUploadTokenMetadata(
          userId,
          {
            name: tokenName,
            symbol: tokenSymbol,
            description,
            twitter,
            telegram,
            website
          },
          imageBuffer,
          devWalletId // Use the wallet selected in the wizard
        );

        imageUrl = metadataResult.imageUrl;
        metadataUrl = metadataResult.metadataUrl;
        console.log(`✅ Metadata uploaded: ${metadataUrl}`);
      } catch (metadataError) {
        console.warn('⚠️ Metadata upload failed (non-fatal):', metadataError.message);
        // Continue without metadata - token is still functional
      }
    } else {
      console.log('⏭️ Step 2/3: Skipping metadata upload (no data provided)');
    }

    // Step 3: Create pool if requested
    if (autoCreatePool && poolTokenAmount > 0 && poolSolAmount > 0) {
      console.log('💧 Step 3/3: Creating Raydium pool...');
      
      // Save token to database first so createCPSwapPool can find it
      const db = require('./db');
      const tokenRecord = db.saveToken({
        user_id: userId,
        token_name: tokenName,
        token_symbol: tokenSymbol,
        mint_address: mintAddress,
        decimals,
        platform: 'raydium',
        status: 'launched',
        total_supply: supply,
        metadata_uri: metadataUrl,
        image_uri: imageUrl,
        description,
        twitter,
        telegram,
        website,
        created_at: Math.floor(Date.now() / 1000)
      });

      try {
        const poolResult = await createCPSwapPool({
          userId,
          walletId: devWalletId, // Use the wallet selected in the wizard
          tokenMint: mintAddress,
          tokenAmount: poolTokenAmount,
          solAmount: poolSolAmount,
          feePercentage: '0.25%',
          openTime: 0
        });

        poolAddress = poolResult.poolAddress;
        lpTokenMint = poolResult.lpTokenMint;
        console.log(`✅ Pool created: ${poolAddress}`);
        console.log(`   LP Token Mint: ${lpTokenMint}`);

        // Update token record with pool info
        db.updateToken(tokenRecord.token_id, {
          pool_address: poolAddress,
          lp_token_mint: lpTokenMint
        });

      } catch (poolError) {
        console.error('❌ Pool creation failed:', poolError.message);
        // Token was created successfully, just pool failed
        // Don't throw - return partial success
        console.warn('⚠️ Token created but pool creation failed. You can create pool manually later.');
      }
    } else {
      console.log('⏭️ Step 3/3: Skipping pool creation');
      
      // Save token to database without pool
      const db = require('./db');
      db.saveToken({
        user_id: userId,
        token_name: tokenName,
        token_symbol: tokenSymbol,
        mint_address: mintAddress,
        decimals,
        platform: 'raydium',
        status: 'launched',
        total_supply: supply,
        metadata_uri: metadataUrl,
        image_uri: imageUrl,
        description,
        twitter,
        telegram,
        website,
        created_at: Math.floor(Date.now() / 1000)
      });
    }

    console.log('🎉 Raydium token launch complete!');

    return {
      success: true,
      mintAddress,
      poolAddress,
      lpTokenMint,
      signature: tokenSignature,
      metadataUrl,
      imageUrl,
      tokenName,
      tokenSymbol,
      decimals,
      supply
    };

  } catch (error) {
    console.error('❌ Raydium token launch failed:', error);
    
    // Provide helpful error context
    const errorMsg = error.message || 'Unknown error';
    if (errorMsg.includes('insufficient funds') || errorMsg.includes('insufficient lamports')) {
      throw new Error(`Insufficient SOL balance. Need approximately ${(0.05 + (poolSolAmount || 0)).toFixed(3)} SOL for token creation${autoCreatePool ? ' and pool' : ''}.`);
    } else if (errorMsg.includes('blockhash not found')) {
      throw new Error('Network congestion detected. Please try again in a few moments.');
    } else if (errorMsg.includes('Raydium CLI not found')) {
      throw new Error('Raydium CLI not installed. Contact admin to install: cargo install raydium-cli');
    } else {
      throw new Error(`Token launch failed: ${errorMsg}`);
    }
  }
}

module.exports = {
  createCPSwapPool,
  addLiquidityToPool,
  removeLiquidityFromPool,
  getPoolInfo,
  launchRaydiumToken,
  checkRaydiumCLI,
  CPSWAP_PROGRAM_ID,
  AMM_CONFIGS,
  WSOL_MINT
};

