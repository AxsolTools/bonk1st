/**
 * Transaction Confirmation Wrapper with Timeout
 * Adds 60-second timeout to all confirmTransaction calls
 */

/**
 * Confirm transaction with timeout
 * @param {Connection} connection - Solana connection
 * @param {string} signature - Transaction signature
 * @param {object} latestBlockhash - Blockhash info
 * @param {number} timeout - Timeout in milliseconds (default 60s)
 * @returns {Promise<object>} Confirmation result
 */
async function confirmTransactionWithTimeout(connection, signature, latestBlockhash, timeout = 60000) {
  return new Promise(async (resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Transaction confirmation timeout after ${timeout/1000}s. Signature: ${signature}`));
    }, timeout);
    
    try {
      const result = await connection.confirmTransaction({
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
      });
      
      clearTimeout(timeoutId);
      
      if (result.value.err) {
        reject(new Error(`Transaction failed: ${JSON.stringify(result.value.err)}`));
      } else {
        resolve(result);
      }
    } catch (error) {
      clearTimeout(timeoutId);
      reject(error);
    }
  });
}

module.exports = {
  confirmTransactionWithTimeout
};

