/**
 * Raydium Pool Creation via SDK (not CLI)
 * This is a more reliable alternative to the CLI-based pool creation
 */

const { Connection, PublicKey, Keypair, Transaction } = require('@solana/web3.js');
const { 
  getAssociatedTokenAddressSync, 
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID
} = require('@solana/spl-token');
const { 
  Raydium, 
  TxVersion,
  parseTokenAccountResp 
} = require('@raydium-io/raydium-sdk-v2');
const { getConnection } = require('./solana_utils');
const { loadWalletFromDatabase, getActiveWalletKeypair } = require('./wallets');
const { getTokenByMint } = require('./db');
const Decimal = require('decimal.js');
const BN = require('bn.js');

// Raydium program IDs
const RAYDIUM_MAINNET_API = 'https://api-v3.raydium.io';

/**
 * Initialize Raydium SDK instance
 * @returns {Promise<Raydium>} Raydium instance
 */
async function initializeRaydiumSDK(owner) {
  const connection = getConnection();
  
  const raydium = await Raydium.load({
    connection,
    owner,  // Add owner keypair
    cluster: process.env.NETWORK === 'devnet' ? 'devnet' : 'mainnet',
    disableFeatureCheck: true,
    disableLoadToken: false,
  });
  
  return raydium;
}

/**
 * Create Raydium CPMM pool using SDK
 * @param {object} params - Pool parameters
 * @returns {Promise<object>} Pool creation result
 */
async function createCPMMPoolSDK(params) {
  const {
    userId,
    walletId = null,
    tokenMint,
    tokenAmount,
    solAmount,
    openTime = 0
  } = params;
  
  try {
    console.log('🌊 Creating Raydium CPMM pool via SDK...');
    
    // Get wallet keypair
    const owner = walletId 
      ? loadWalletFromDatabase(walletId)
      : getActiveWalletKeypair(userId);
    
    if (!owner) {
      throw new Error('No wallet found');
    }
    
    console.log(`Using wallet: ${owner.publicKey.toBase58()}`);
    
    // Get token info from database
    const token = getTokenByMint(tokenMint);
    if (!token) {
      throw new Error('Token not found in database');
    }
    
    // Initialize Raydium SDK with owner
    const raydium = await initializeRaydiumSDK(owner);
    const connection = getConnection();
    // Ensure wallet token accounts are loaded (SDK uses these internally)
    try {
      await raydium.account.fetchWalletTokenAccounts({
        owner: owner.publicKey,
        forceUpdate: true
      });
    } catch (acctErr) {
      console.warn('Warning: failed to prefetch wallet token accounts', acctErr.message || acctErr);
    }
    
    // Token mints
    const baseMint = new PublicKey(tokenMint);
    const quoteMint = new PublicKey('So11111111111111111111111111111111111111112'); // Wrapped SOL
    
    // Convert amounts to proper format
    const baseAmount = new Decimal(tokenAmount).mul(new Decimal(10).pow(token.decimals));
    const quoteAmount = new Decimal(solAmount).mul(new Decimal(10).pow(9)); // SOL has 9 decimals
    
    console.log(`Base amount: ${baseAmount.toString()} (${tokenAmount} tokens)`);
    console.log(`Quote amount: ${quoteAmount.toString()} (${solAmount} SOL)`);
    
    // Determine if this is a Token-2022 token (check on-chain)
    const mintAccountInfo = await connection.getAccountInfo(baseMint);
    const isToken2022 = mintAccountInfo && mintAccountInfo.owner.equals(TOKEN_2022_PROGRAM_ID);
    const tokenProgramId = isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
    
    console.log(`Token program: ${isToken2022 ? 'Token-2022' : 'SPL Token'}`);
    
    // Get or create associated token accounts
    const baseAta = getAssociatedTokenAddressSync(
      baseMint,
      owner.publicKey,
      false,
      tokenProgramId
    );
    
    const quoteAta = getAssociatedTokenAddressSync(
      quoteMint,
      owner.publicKey,
      false,
      TOKEN_PROGRAM_ID
    );
    
    console.log(`Base ATA: ${baseAta.toBase58()}`);
    console.log(`Quote ATA: ${quoteAta.toBase58()}`);
    
    // Check if quote ATA (WSOL) exists, create if not
    const quoteAtaInfo = await connection.getAccountInfo(quoteAta);
    if (!quoteAtaInfo) {
      console.log('Creating WSOL ATA...');
      const createWsolAtaTx = new Transaction().add(
        createAssociatedTokenAccountInstruction(
          owner.publicKey,
          quoteAta,
          owner.publicKey,
          quoteMint,
          TOKEN_PROGRAM_ID
        )
      );
      
      const { blockhash } = await connection.getLatestBlockhash();
      createWsolAtaTx.recentBlockhash = blockhash;
      createWsolAtaTx.feePayer = owner.publicKey;
      
      const signedTx = await connection.sendTransaction(createWsolAtaTx, [owner]);
      await connection.confirmTransaction(signedTx);
      console.log(`✅ WSOL ATA created: ${signedTx}`);
    }
    
    // Create CPMM pool
    console.log('Creating CPMM pool...');
    
    // CPMM program configuration
    // Use Raydium's dedicated CPMM create-pool program (not the swap program)
    const cpmmProgramId = new PublicKey(
      raydium.cluster === 'mainnet'
        ? 'DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb' // Mainnet create-CPMM program
        : 'DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb' // Devnet currently shares same ID in SDK docs
    );
    
    console.log(`Using CPMM program: ${cpmmProgramId.toBase58()}`);
    console.log(`Base mint: ${baseMint.toBase58()}`);
    console.log(`Quote mint: ${quoteMint.toBase58()}`);
    
    // Fetch CPMM config info for fee configuration
    console.log('Fetching CPMM config...');
    let configs;
    try {
      configs = await raydium.api.getCpmmConfigs();
      console.log(`Fetched ${configs?.length || 0} CPMM configs`);
    } catch (apiError) {
      console.error('API getCpmmConfigs failed:', apiError.message);
      throw new Error(`Failed to fetch CPMM configs: ${apiError.message}`);
    }
    
    if (!configs || !Array.isArray(configs) || configs.length === 0) {
      throw new Error('No CPMM configs available from Raydium API');
    }
    
    // Use first available config (usually the default one)
    const feeConfig = configs[0];
    if (!feeConfig || !feeConfig.id) {
      throw new Error('Invalid fee config structure from API');
    }
    console.log(`Using fee config: ${feeConfig.id}`);
    
    // Use Raydium's fixed CPMM fee account (from SDK constants)
    const poolFeeAccount = new PublicKey('3oE58BKVt8KuYkGxx8zBojugnymWmBiyafWgMrnb6eYy');
    
    // Prepare mint info in correct format
    const mintAInfo = {
      address: baseMint.toBase58(),
      decimals: token.decimals,
      programId: tokenProgramId.toBase58()
    };
    
    const mintBInfo = {
      address: quoteMint.toBase58(),
      decimals: 9, // SOL decimals
      programId: TOKEN_PROGRAM_ID.toBase58()
    };
    
    // Convert amounts to BN
    const mintAAmount = new BN(baseAmount.toString());
    const mintBAmount = new BN(quoteAmount.toString());
    const startTimeBN = new BN(openTime || Math.floor(Date.now() / 1000));
    
    console.log('Creating pool with parameters:');
    console.log(`- Mint A: ${mintAInfo.address} (${mintAInfo.decimals} decimals)`);
    console.log(`- Mint B: ${mintBInfo.address} (${mintBInfo.decimals} decimals)`);
    console.log(`- Amount A: ${mintAAmount.toString()}`);
    console.log(`- Amount B: ${mintBAmount.toString()}`);
    
    let poolResult;
    try {
      poolResult = await raydium.cpmm.createPool({
        programId: cpmmProgramId, // Pass as PublicKey object
        poolFeeAccount,
        mintA: mintAInfo,
        mintB: mintBInfo,
        mintAAmount,
        mintBAmount,
        startTime: startTimeBN,
        feeConfig,
        associatedOnly: false,
        checkCreateATAOwner: true,
        ownerInfo: {
          useSOLBalance: true // Automatically wrap SOL to WSOL
        },
        txVersion: TxVersion.V0,
        computeBudgetConfig: {
          units: 600000,
          microLamports: 100000000 // 0.1 SOL priority fee
        }
      });
    } catch (createError) {
      console.error('createPool call failed:', createError);
      try {
        console.error('Error details:', JSON.stringify(createError, Object.getOwnPropertyNames(createError)));
      } catch (_) {}
      throw new Error(`SDK createPool failed: ${createError.message || createError}`);
    }
    
    // Extract execute function and extended info
    const { execute, extInfo } = poolResult;
    
    if (!execute || typeof execute !== 'function') {
      console.error('poolResult structure:', Object.keys(poolResult || {}));
      throw new Error('SDK did not return execute function. Pool result structure unexpected.');
    }
    
    console.log('Pool creation initialized, executing transaction...');
    
    // Execute with owner keypair
    let txIds;
    try {
      txIds = await execute({
        sendAndConfirm: true,
        sequentially: true
      });
    } catch (execError) {
      console.error('Transaction execution failed:', execError);
      // try to log logs if present
      if (execError?.logs) {
        console.error('Execution logs:', execError.logs);
      }
      if (execError?.simulationResponse) {
        console.error('Simulation response:', execError.simulationResponse);
      }
      throw new Error(`Failed to execute pool creation transaction: ${execError.message || execError}`);
    }
    
    if (!txIds || !Array.isArray(txIds) || txIds.length === 0) {
      throw new Error('No transaction IDs returned from pool creation');
    }
    
    console.log('✅ Pool created successfully!');
    console.log(`Transaction IDs: ${txIds.join(', ')}`);
    
    // Get pool address from extInfo or derive it
    let poolAddress;
    if (extInfo && extInfo.address) {
      poolAddress = extInfo.address.toBase58();
    } else if (extInfo && extInfo.poolId) {
      poolAddress = extInfo.poolId.toBase58();
    } else {
      // Pool address should be in the transaction logs
      // For now, return the first transaction as reference
      console.warn('Could not extract pool address from extInfo, check transaction logs');
      poolAddress = txIds[0]; // Use tx signature as temporary identifier
    }
    
    return {
      success: true,
      poolAddress: poolAddress,
      signature: txIds[0],
      allSignatures: txIds
    };
    
  } catch (error) {
    console.error('Error creating CPMM pool via SDK:', error);
    throw error;
  }
}

/**
 * Get pool info from Raydium
 * @param {string} poolAddress - Pool address
 * @returns {Promise<object>} Pool info
 */
async function getPoolInfoSDK(poolAddress, owner = null) {
  try {
    const raydium = await initializeRaydiumSDK(owner);
    const poolId = new PublicKey(poolAddress);
    
    const poolInfo = await raydium.cpmm.getPoolInfo(poolId);
    
    return poolInfo;
  } catch (error) {
    console.error('Error getting pool info:', error);
    throw error;
  }
}

module.exports = {
  initializeRaydiumSDK,
  createCPMMPoolSDK,
  getPoolInfoSDK
};

