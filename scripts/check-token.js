/**
 * Check if token exists in database and recover if needed
 * Usage: node scripts/check-token.js <mintAddress>
 */

const mintAddress = process.argv[2] || 'CcfMa6QfJ57VzQgE8tfDnvEb3mYj1wqHh8pr5Amvvhnk';

async function checkAndRecover() {
  try {
    // First, check if token exists
    const checkResponse = await fetch(`http://localhost:3000/api/token/${mintAddress}`);
    const checkData = await checkResponse.json();
    
    if (checkData.success || checkResponse.status === 200) {
      console.log('✅ Token already exists in database');
      console.log('Token ID:', checkData.data?.id || checkData.id);
      return;
    }

    console.log('❌ Token not found in database. Attempting recovery...');
    
    // Recover token - we'll need to provide the data
    // From the logs, we know:
    // - Name: CHADDEVTESTING
    // - Symbol: CHADDEV
    // - Metadata URI: https://ipfs.io/ipfs/QmdvoSjjoLHNE5rm5UdbmrC6aXVrajnQTe5e7k8qMeycUe
    // - TX: 2SWMB4GnrqhZncbtZxnb6RZfDkE2hbd68PNQRywhYB4eAFXVqSrn389YuM3Zc28NXFJWj8DDwZP7gN8CAWmCKGd1
    
    const recoverResponse = await fetch('http://localhost:3000/api/token/recover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mintAddress: mintAddress,
        name: 'CHADDEVTESTING',
        symbol: 'CHADDEV',
        description: 'CHADDEVTESTING',
        metadataUri: 'https://ipfs.io/ipfs/QmdvoSjjoLHNE5rm5UdbmrC6aXVrajnQTe5e7k8qMeycUe',
        txSignature: '2SWMB4GnrqhZncbtZxnb6RZfDkE2hbd68PNQRywhYB4eAFXVqSrn389YuM3Zc28NXFJWj8DDwZP7gN8CAWmCKGd1',
        // We need the creator wallet - let me check if we can get it from the transaction
      }),
    });

    const recoverData = await recoverResponse.json();
    
    if (recoverData.success) {
      console.log('✅ Token recovered successfully!');
      console.log('Token ID:', recoverData.data.tokenId);
    } else {
      console.error('❌ Recovery failed:', recoverData.error);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkAndRecover();

