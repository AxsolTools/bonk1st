/**
 * Simple script to recover token via API
 * Run: node scripts/recover-token-simple.js
 */

const mintAddress = 'CcfMa6QfJ57VzQgE8tfDnvEb3mYj1wqHh8pr5Amvvhnk';

const tokenData = {
  mintAddress: mintAddress,
  name: 'CHADDEVTESTING',
  symbol: 'CHADDEV',
  description: 'CHADDEVTESTING',
  metadataUri: 'https://ipfs.io/ipfs/QmdvoSjjoLHNE5rm5UdbmrC6aXVrajnQTe5e7k8qMeycUe',
  imageUrl: 'https://ipfs.io/ipfs/QmbNm6Q66pRPsMRSiYBzQv2LiVNZxjkYpRu2N7haiR6REX',
  txSignature: '2SWMB4GnrqhZncbtZxnb6RZfDkE2hbd68PNQRywhYB4eAFXVqSrn389YuM3Zc28NXFJWj8DDwZP7gN8CAWmCKGd1',
};

async function recover() {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const url = `${baseUrl}/api/token/recover`;
    
    console.log('Recovering token:', mintAddress);
    console.log('URL:', url);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tokenData),
    });

    const data = await response.json();
    
    if (data.success) {
      console.log('✅ Token recovered successfully!');
      console.log('Token ID:', data.data.tokenId);
    } else {
      console.error('❌ Recovery failed:', data.error);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

recover();

