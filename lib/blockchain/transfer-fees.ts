/**
 * AQUA Launchpad - Token-2022 Transfer Fee Module
 * 
 * Ported from raydiumspltoken/token_fees_advanced.js
 * Handles:
 * - Harvesting withheld fees from token accounts to mint
 * - Withdrawing collected fees to destination wallet
 * - Querying withheld fee amounts
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createHarvestWithheldTokensToMintInstruction,
  createWithdrawWithheldTokensFromMintInstruction,
} from '@solana/spl-token';

// ============================================================================
// TYPES
// ============================================================================

export interface HarvestFeesParams {
  connection: Connection;
  ownerKeypair: Keypair;
  mintAddress: string;
}

export interface WithdrawFeesParams {
  connection: Connection;
  ownerKeypair: Keypair;
  mintAddress: string;
  destinationWallet?: string; // If not provided, uses owner's wallet
}

export interface FeeHarvestResult {
  success: boolean;
  harvestSignature?: string;
  withdrawSignature?: string;
  accountsProcessed?: number;
  totalWithheld?: string;
  error?: string;
}

export interface WithheldFeesInfo {
  mintAddress: string;
  totalWithheld: string;
  accountCount: number;
  accounts: { address: string; withheld: string }[];
}

// ============================================================================
// FEE HARVESTING
// ============================================================================

/**
 * Get all token accounts with withheld fees for a mint
 */
export async function getAccountsWithWithheldFees(
  connection: Connection,
  mintAddress: string
): Promise<{ address: string; withheld: string }[]> {
  try {
    const mintPubkey = new PublicKey(mintAddress);

    // Query token accounts for this mint
    const tokenAccounts = await connection.getProgramAccounts(
      TOKEN_2022_PROGRAM_ID,
      {
        filters: [
          {
            dataSize: 165, // Token account size for Token-2022
          },
          {
            memcmp: {
              offset: 0,
              bytes: mintPubkey.toBase58(),
            },
          },
        ],
      }
    );

    const accounts: { address: string; withheld: string }[] = [];

    for (const account of tokenAccounts) {
      // Parse withheld amount from account data
      // Token-2022 account layout has withheld fees at specific offset
      const data = account.account.data;
      
      // The withheld amount is in the extension data
      // For now, include all accounts - the harvest instruction will handle empty ones
      accounts.push({
        address: account.pubkey.toBase58(),
        withheld: '0', // Would need proper parsing of extension data
      });
    }

    return accounts;
  } catch (error) {
    console.error('[TRANSFER-FEES] Error getting accounts:', error);
    return [];
  }
}

/**
 * Harvest withheld fees from token accounts to mint
 */
export async function harvestFeesToMint(
  connection: Connection,
  ownerKeypair: Keypair,
  mintAddress: string,
  accountAddresses: string[]
): Promise<{ success: boolean; signature?: string; error?: string }> {
  try {
    if (accountAddresses.length === 0) {
      return { success: false, error: 'No accounts to harvest from' };
    }

    const mintPubkey = new PublicKey(mintAddress);
    const accountPubkeys = accountAddresses.map((addr) => new PublicKey(addr));

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

    console.log(`[TRANSFER-FEES] Harvesting fees from ${accountPubkeys.length} accounts...`);

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = ownerKeypair.publicKey;
    transaction.sign(ownerKeypair);

    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });

    await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    }, 'confirmed');

    console.log(`[TRANSFER-FEES] Fees harvested to mint: ${signature}`);
    return { success: true, signature };
  } catch (error) {
    console.error('[TRANSFER-FEES] Harvest error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Harvest failed',
    };
  }
}

/**
 * Withdraw withheld fees from mint to destination account
 */
export async function withdrawFeesFromMint(
  params: WithdrawFeesParams
): Promise<{ success: boolean; signature?: string; error?: string }> {
  const { connection, ownerKeypair, mintAddress, destinationWallet } = params;

  try {
    const mintPubkey = new PublicKey(mintAddress);
    const destination = destinationWallet
      ? new PublicKey(destinationWallet)
      : ownerKeypair.publicKey;

    // Get destination token account
    const destinationAta = getAssociatedTokenAddressSync(
      mintPubkey,
      destination,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    const transaction = new Transaction();

    // Check if destination ATA exists, create if not
    const ataInfo = await connection.getAccountInfo(destinationAta);
    if (!ataInfo) {
      transaction.add(
        createAssociatedTokenAccountInstruction(
          ownerKeypair.publicKey,
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
        ownerKeypair.publicKey, // Withdraw authority
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );

    console.log(`[TRANSFER-FEES] Withdrawing fees from mint to ${destinationAta.toBase58()}...`);

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = ownerKeypair.publicKey;
    transaction.sign(ownerKeypair);

    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });

    await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    }, 'confirmed');

    console.log(`[TRANSFER-FEES] Fees withdrawn: ${signature}`);
    return { success: true, signature };
  } catch (error) {
    console.error('[TRANSFER-FEES] Withdraw error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Withdraw failed',
    };
  }
}

/**
 * Complete fee withdrawal process (harvest + withdraw)
 */
export async function completeTransferFeeWithdrawal(
  params: WithdrawFeesParams
): Promise<FeeHarvestResult> {
  const { connection, ownerKeypair, mintAddress, destinationWallet } = params;

  try {
    // Step 1: Get all token accounts for this mint
    const accounts = await getAccountsWithWithheldFees(connection, mintAddress);

    if (accounts.length === 0) {
      return {
        success: false,
        error: 'No token accounts found for this mint',
      };
    }

    console.log(`[TRANSFER-FEES] Found ${accounts.length} token accounts`);

    const accountAddresses = accounts.map((a) => a.address);

    // Step 2: Harvest fees from accounts to mint
    const harvestResult = await harvestFeesToMint(
      connection,
      ownerKeypair,
      mintAddress,
      accountAddresses
    );

    if (!harvestResult.success) {
      return {
        success: false,
        error: harvestResult.error || 'Harvest failed',
      };
    }

    // Step 3: Withdraw fees from mint to destination
    const withdrawResult = await withdrawFeesFromMint({
      connection,
      ownerKeypair,
      mintAddress,
      destinationWallet,
    });

    if (!withdrawResult.success) {
      return {
        success: false,
        harvestSignature: harvestResult.signature,
        error: withdrawResult.error || 'Withdraw failed',
      };
    }

    return {
      success: true,
      harvestSignature: harvestResult.signature,
      withdrawSignature: withdrawResult.signature,
      accountsProcessed: accounts.length,
    };
  } catch (error) {
    console.error('[TRANSFER-FEES] Complete withdrawal error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Fee withdrawal failed',
    };
  }
}

// ============================================================================
// FEE QUERIES
// ============================================================================

/**
 * Get withheld fees information for a mint
 */
export async function getWithheldFeesInfo(
  connection: Connection,
  mintAddress: string
): Promise<WithheldFeesInfo> {
  const accounts = await getAccountsWithWithheldFees(connection, mintAddress);

  // Calculate total (would need proper parsing in production)
  const total = accounts.reduce((sum, acc) => sum + BigInt(acc.withheld), BigInt(0));

  return {
    mintAddress,
    totalWithheld: total.toString(),
    accountCount: accounts.length,
    accounts,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export { TOKEN_2022_PROGRAM_ID };

