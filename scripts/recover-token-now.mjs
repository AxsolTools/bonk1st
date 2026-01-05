/**
 * Recover token - will try localhost first, then production URL
 */

const MINT_ADDRESS = 'CcfMa6QfJ57VzQgE8tfDnvEb3mYj1wqHh8pr5Amvvhnk';

const tokenData = {
  mintAddress: MINT_ADDRESS,
  name: 'CHADDEVTESTING',
  symbol: 'CHADDEV',
  description: 'CHADDEVTESTING',
  metadataUri: 'https://ipfs.io/ipfs/QmdvoSjjoLHNE5rm5UdbmrC6aXVrajnQTe5e7k8qMeycUe',
  imageUrl: 'https://ipfs.io/ipfs/QmbNm6Q66pRPsMRSiYBzQv2LiVNZxjkYpRu2N7haiR6REX',
  txSignature: '2SWMB4GnrqhZncbtZxnb6RZfDkE2hbd68PNQRywhYB4eAFXVqSrn389YuM3Zc28NXFJWj8DDwZP7gN8CAWmCKGd1',
};

async function recoverToken(baseUrl) {
  try {
    console.log(`🔄 Attempting recovery via ${baseUrl}...`);
    const response = await fetch(`${baseUrl}/api/token/recover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tokenData),
    });

    const data = await response.json();
    
    if (data.success) {
      console.log('✅ Token recovered successfully!');
      console.log('Token ID:', data.data.tokenId);
      return true;
    } else {
      console.error('❌ Recovery failed:', data.error);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error calling ${baseUrl}:`, error.message);
    return false;
  }
}

// Try multiple URLs
const urls = [
  'http://localhost:3000',
  process.env.NEXT_PUBLIC_APP_URL,
  'https://aqua-launchpad.vercel.app',
].filter(Boolean);

console.log('🔍 Attempting to recover token...\n');

for (const url of urls) {
  const success = await recoverToken(url);
  if (success) {
    console.log(`\n✅ Recovery complete via ${url}`);
    process.exit(0);
  }
}

console.log('\n❌ Could not recover token - server may not be running');
console.log('Once your server is deployed, run:');
console.log(`curl -X POST ${urls[0] || 'YOUR_DOMAIN'}/api/token/recover -H "Content-Type: application/json" -d '${JSON.stringify(tokenData)}'`);









