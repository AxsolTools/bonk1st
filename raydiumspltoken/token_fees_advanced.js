/**
 * Advanced Token-2022 Transfer Fee Management
 * Implements fee withdrawal using SPL Token SDK
 */

const {
  Transaction,
  PublicKey,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY
} = require('@solana/web3.js');
const {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createHarvestWithheldTokensToMintInstruction,
  createWithdrawWithheldTokensFromAccountsInstruction,
  createWithdrawWithheldTokensFromMintInstruction
} = require('@solana/spl-token');
const { getConnection, sendAndConfirmTransactionWithRetry } = require('./solana_utils');
const { getActiveWalletKeypair } = require('./wallets');

/**
 * Harvest withheld fees from token accounts to mint
 * @param {object} params - Harvest parameters
 * @returns {Promise<string>} Transaction signature
 */
async function harvestWithheldFeesToMint(params) {
  const {
    userId,
    mintAddress,
    accountAddresses  // Array of token account addresses with withheld fees
  } = params;
  
  try {
    const conn = getConnection();
    const payer = getActiveWalletKeypair(userId);
    
    if (!payer) {
      throw new Error('No active wallet found');
    }
    
    const mintPubkey = new PublicKey(mintAddress);
    const accountPubkeys = accountAddresses.map(addr => new PublicKey(addr));
    
    const transaction = new Transaction();
    
    // Create harvest instruction
    // This moves withheld fees from token accounts to the mint
    transaction.add(
      createHarvestWithheldTokensToMintInstruction(
        mintPubkey,
        accountPubkeys,
        TOKEN_2022_PROGRAM_ID
      )
    );
    
    console.log('Harvesting withheld fees to mint...');
    const signature = await sendAndConfirmTransactionWithRetry(transaction, [payer]);
    
    console.log(`✅ Fees harvested to mint: ${signature}`);
    return signature;
  } catch (error) {
    console.error('Error harvesting fees:', error);
    throw error;
  }
}

/**
 * Withdraw withheld fees from mint to destination account
 * @param {object} params - Withdrawal parameters
 * @returns {Promise<string>} Transaction signature
 */
async function withdrawWithheldFeesFromMint(params) {
  const {
    userId,
    mintAddress,
    destinationWallet = null
  } = params;
  
  try {
    const conn = getConnection();
    const payer = getActiveWalletKeypair(userId);
    
    if (!payer) {
      throw new Error('No active wallet found');
    }
    
    const mintPubkey = new PublicKey(mintAddress);
    const destination = destinationWallet ? new PublicKey(destinationWallet) : payer.publicKey;
    
    // Get destination token account
    const destinationAta = getAssociatedTokenAddressSync(
      mintPubkey,
      destination,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    
    const transaction = new Transaction();
    
    // Check if destination ATA exists, create if not
    const ataInfo = await conn.getAccountInfo(destinationAta);
    if (!ataInfo) {
      transaction.add(
        createAssociatedTokenAccountInstruction(
          payer.publicKey,
          destinationAta,
          destination,
          mintPubkey,
          TOKEN_2022_PROGRAM_ID
        )
      );
    }
    
    // Create withdraw instruction
    // This moves withheld fees from mint to destination account
    transaction.add(
      createWithdrawWithheldTokensFromMintInstruction(
        mintPubkey,
        destinationAta,
        payer.publicKey,  // Withdraw authority
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );
    
    console.log('Withdrawing fees from mint...');
    const signature = await sendAndConfirmTransactionWithRetry(transaction, [payer]);
    
    console.log(`✅ Fees withdrawn: ${signature}`);
    return signature;
  } catch (error) {
    console.error('Error withdrawing fees:', error);
    throw error;
  }
}

/**
 * Complete fee withdrawal process (harvest + withdraw)
 * @param {object} params - Withdrawal parameters
 * @returns {Promise<object>} Results with both transaction signatures
 */
async function completeTransferFeeWithdrawal(params) {
  const {
    userId,
    mintAddress,
    destinationWallet = null
  } = params;
  
  try {
    const conn = getConnection();
    
    // Step 1: Get all token accounts with withheld fees
    const mintPubkey = new PublicKey(mintAddress);

    // Query token accounts for this mint
    const tokenAccounts = await conn.getProgramAccounts(
      TOKEN_2022_PROGRAM_ID,
      {
        filters: [
          {
            dataSize: 165  // Token account size for Token-2022
          },
          {
            memcmp: {
              offset: 0,
              bytes: mintPubkey.toBase58()
            }
          }
        ]
      }
    );

    const accountAddresses = tokenAccounts.map(acc => acc.pubkey.toBase58());

    // Calculate total withheld fees (lamports) across all accounts
    const totalWithheldAmount = await getWithheldFeesForMint(mintAddress);

    if (accountAddresses.length === 0 || totalWithheldAmount === 0) {
      throw new Error('No withheld transfer fees found for this mint');
    }
    
    console.log(`Found ${accountAddresses.length} token accounts`);
    
    // Step 2: Harvest fees from accounts to mint
    const harvestSig = await harvestWithheldFeesToMint({
      userId,
      mintAddress,
      accountAddresses
    });
    
    // Step 3: Withdraw fees from mint to destination
    const withdrawSig = await withdrawWithheldFeesFromMint({
      userId,
      mintAddress,
      destinationWallet
    });
    
    return {
      success: true,
      harvestSignature: harvestSig,
      withdrawSignature: withdrawSig,
      accountsProcessed: accountAddresses.length,
      totalWithheldAmount
    };
  } catch (error) {
    console.error('Error completing fee withdrawal:', error);
    throw error;
  }
}

/**
 * Get estimated withheld fees for a mint
 * @param {string} mintAddress - Token mint address
 * @returns {Promise<object>} Estimated fees
 */
async function getWithheldFeeEstimate(mintAddress) {
  try {
    const conn = getConnection();
    const mintPubkey = new PublicKey(mintAddress);
    
    // Get mint account data
    const mintInfo = await conn.getAccountInfo(mintPubkey);
    
    if (!mintInfo) {
      throw new Error('Mint account not found');
    }
    
    // Parse withheld amount from mint account
    // This requires parsing the account data based on Token-2022 layout
    // For now, return structure
    return {
      mintAddress,
      withheldAmount: 0,  // Would need to parse from account data
      message: 'Withheld amount requires parsing Token-2022 account data'
    };
  } catch (error) {
    console.error('Error getting withheld fee estimate:', error);
    throw error;
  }
}

/**
 * Get withheld fees amount for a mint (for dashboard display)
 * FIXED: Now uses proper parsing per QuickNode Token-2022 guide
 * @param {string} mintAddress - Token mint address
 * @returns {Promise<number>} Withheld fees in lamports
 */
async function getWithheldFeesForMint(mintAddress) {
  if (typeof mintAddress !== 'string' || mintAddress.trim().length === 0) {
    return 0;
  }

  try {
    const { 
      TOKEN_2022_PROGRAM_ID,
      unpackAccount,
      getTransferFeeAmount 
    } = require('@solana/spl-token');
    const conn = getConnection();
    let mintPubkey;

    try {
      mintPubkey = new PublicKey(mintAddress);
    } catch (error) {
      console.warn('[TOKEN FEES] Invalid mint address for withheld fees:', error.message);
      return 0;
    }
    
    // Get all token accounts for this mint (per QuickNode guide Step 5)
    const allAccounts = await conn.getProgramAccounts(TOKEN_2022_PROGRAM_ID, {
      commitment: 'confirmed',
      filters: [
        {
          memcmp: {
            offset: 0,
            bytes: mintPubkey.toString(),
          },
        },
      ],
    });
    
    let totalWithheldFees = BigInt(0);
    
    // Loop through each account and check withheld fees (per QuickNode guide)
    for (const accountInfo of allAccounts) {
      try {
        // Unpack account data to deserialize into TokenAccount object
        const account = unpackAccount(
          accountInfo.pubkey,
          accountInfo.account,
          TOKEN_2022_PROGRAM_ID
        );
        
        // Get transfer fee amount for this account
        const transferFeeAmount = getTransferFeeAmount(account);
        
        // Add to total if fees exist
        if (transferFeeAmount !== null && transferFeeAmount.withheldAmount > BigInt(0)) {
          totalWithheldFees += transferFeeAmount.withheldAmount;
        }
      } catch (parseError) {
        // Skip accounts that can't be parsed (might not be token accounts)
        continue;
      }
    }
    
    return Number(totalWithheldFees);
  } catch (error) {
    console.error('Error getting withheld fees:', error);
    return 0;
  }
}

/**
 * Withdraw withheld fees from token accounts to destination (Authority-triggered)
 * Per QuickNode Token-2022 guide: Authority can withdraw directly from accounts
 * @param {object} params - Withdrawal parameters
 * @returns {Promise<string>} Transaction signature
 */
async function withdrawWithheldFeesFromAccounts(params) {
  const {
    userId,
    mintAddress,
    destinationWallet = null,
    accountAddresses = []  // Array of account addresses with withheld fees
  } = params;
  
  try {
    const conn = getConnection();
    const payer = getActiveWalletKeypair(userId);
    
    if (!payer) {
      throw new Error('No active wallet found');
    }
    
    if (accountAddresses.length === 0) {
      throw new Error('No accounts provided for fee withdrawal');
    }
    
    const mintPubkey = new PublicKey(mintAddress);
    const destination = destinationWallet ? new PublicKey(destinationWallet) : payer.publicKey;
    
    // Get destination token account
    const destinationAta = getAssociatedTokenAddressSync(
      mintPubkey,
      destination,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    
    const transaction = new Transaction();
    
    // Check if destination ATA exists, create if needed
    const destinationInfo = await conn.getAccountInfo(destinationAta);
    if (!destinationInfo) {
      transaction.add(
        createAssociatedTokenAccountInstruction(
          payer.publicKey,
          destinationAta,
          destination,
          mintPubkey,
          TOKEN_2022_PROGRAM_ID
        )
      );
    }
    
    // Convert addresses to PublicKeys
    const accountPubkeys = accountAddresses.map(addr => new PublicKey(addr));
    
    // Create withdraw instruction (authority-triggered)
    // This directly withdraws fees from token accounts to destination
    transaction.add(
      createWithdrawWithheldTokensFromAccountsInstruction(
        mintPubkey,
        destinationAta,
        payer.publicKey, // withdraw authority
        [],
        accountPubkeys,
        TOKEN_2022_PROGRAM_ID
      )
    );
    
    console.log('Withdrawing withheld fees from accounts (authority)...');
    const signature = await sendAndConfirmTransactionWithRetry(transaction, [payer]);
    
    console.log(`✅ Fees withdrawn from accounts: ${signature}`);
    return signature;
  } catch (error) {
    console.error('Error withdrawing fees from accounts:', error);
    throw error;
  }
}

/**
 * Get all token accounts with withheld fees for a mint
 * Helper function to find accounts that have fees to withdraw
 * @param {string} mintAddress - Token mint address
 * @returns {Promise<Array>} Array of account addresses with withheld fees
 */
async function getAccountsWithWithheldFees(mintAddress) {
  try {
    const { 
      TOKEN_2022_PROGRAM_ID,
      unpackAccount,
      getTransferFeeAmount 
    } = require('@solana/spl-token');
    const conn = getConnection();
    const mintPubkey = new PublicKey(mintAddress);
    
    // Get all token accounts for this mint (per QuickNode guide Step 5)
    const allAccounts = await conn.getProgramAccounts(TOKEN_2022_PROGRAM_ID, {
      commitment: 'confirmed',
      filters: [
        {
          memcmp: {
            offset: 0,
            bytes: mintPubkey.toString(),
          },
        },
      ],
    });
    
    const accountsWithFees = [];
    
    // Loop through each account and check withheld fees
    for (const accountInfo of allAccounts) {
      try {
        // Unpack account data to deserialize into TokenAccount object
        const account = unpackAccount(
          accountInfo.pubkey,
          accountInfo.account,
          TOKEN_2022_PROGRAM_ID
        );
        
        // Get transfer fee amount for this account
        const transferFeeAmount = getTransferFeeAmount(account);
        
        // Add to list if fees exist
        if (transferFeeAmount !== null && transferFeeAmount.withheldAmount > BigInt(0)) {
          accountsWithFees.push({
            address: accountInfo.pubkey.toBase58(),
            withheldAmount: Number(transferFeeAmount.withheldAmount),
            owner: account.owner.toBase58()
          });
        }
      } catch (parseError) {
        // Skip accounts that can't be parsed
        continue;
      }
    }
    
    console.log(`Found ${accountsWithFees.length} accounts with withheld fees`);
    return accountsWithFees;
  } catch (error) {
    console.error('Error getting accounts with withheld fees:', error);
    return [];
  }
}

module.exports = {
  harvestWithheldFeesToMint,
  withdrawWithheldFeesFromMint,
  withdrawWithheldFeesFromAccounts,
  getAccountsWithWithheldFees,
  completeTransferFeeWithdrawal,
  getWithheldFeeEstimate,
  getWithheldFeesForMint
};

