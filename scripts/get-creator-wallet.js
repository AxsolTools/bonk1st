/**
 * Get creator wallet from transaction signature
 */

const txSignature = '2SWMB4GnrqhZncbtZxnb6RZfDkE2hbd68PNQRywhYB4eAFXVqSrn389YuM3Zc28NXFJWj8DDwZP7gN8CAWmCKGd1';
const RPC_URL = 'https://api.mainnet-beta.solana.com';

async function getCreatorWallet() {
  try {
    const response = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTransaction',
        params: [
          txSignature,
          {
            encoding: 'jsonParsed',
            maxSupportedTransactionVersion: 0,
          },
        ],
      }),
    });

    const data = await response.json();
    
    if (data.error) {
      console.error('RPC Error:', data.error);
      return null;
    }

    const tx = data.result;
    if (tx && tx.transaction && tx.transaction.message && tx.transaction.message.accountKeys) {
      // The first signer is usually the creator/fee payer
      const signers = tx.transaction.message.accountKeys.filter((key, index) => 
        tx.transaction.message.header.numRequiredSignatures > index
      );
      
      if (signers.length > 0) {
        const creatorWallet = signers[0].pubkey;
        console.log('Creator Wallet:', creatorWallet);
        return creatorWallet;
      }
    }
    
    console.log('Could not extract creator wallet from transaction');
    return null;
  } catch (error) {
    console.error('Error:', error.message);
    return null;
  }
}

getCreatorWallet();

