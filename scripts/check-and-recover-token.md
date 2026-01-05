# Token Recovery Instructions

## Token Details
- **Mint Address**: `CcfMa6QfJ57VzQgE8tfDnvEb3mYj1wqHh8pr5Amvvhnk`
- **Name**: CHADDEVTESTING
- **Symbol**: CHADDEV
- **Description**: CHADDEVTESTING
- **Metadata URI**: `https://ipfs.io/ipfs/QmdvoSjjoLHNE5rm5UdbmrC6aXVrajnQTe5e7k8qMeycUe`
- **Image URL**: `https://ipfs.io/ipfs/QmbNm6Q66pRPsMRSiYBzQv2LiVNZxjkYpRu2N7haiR6REX`
- **Transaction**: `2SWMB4GnrqhZncbtZxnb6RZfDkE2hbd68PNQRywhYB4eAFXVqSrn389YuM3Zc28NXFJWj8DDwZP7gN8CAWmCKGd1`

## Recovery Steps

### Option 1: Use the Recovery API (Once server is running)

```bash
curl -X POST https://your-domain.com/api/token/recover \
  -H "Content-Type: application/json" \
  -d '{
    "mintAddress": "CcfMa6QfJ57VzQgE8tfDnvEb3mYj1wqHh8pr5Amvvhnk",
    "name": "CHADDEVTESTING",
    "symbol": "CHADDEV",
    "description": "CHADDEVTESTING",
    "metadataUri": "https://ipfs.io/ipfs/QmdvoSjjoLHNE5rm5UdbmrC6aXVrajnQTe5e7k8qMeycUe",
    "imageUrl": "https://ipfs.io/ipfs/QmbNm6Q66pRPsMRSiYBzQv2LiVNZxjkYpRu2N7haiR6REX",
    "txSignature": "2SWMB4GnrqhZncbtZxnb6RZfDkE2hbd68PNQRywhYB4eAFXVqSrn389YuM3Zc28NXFJWj8DDwZP7gN8CAWmCKGd1"
  }'
```

### Option 2: Direct Database Query

Check if token exists:
```sql
SELECT * FROM tokens WHERE mint_address = 'CcfMa6QfJ57VzQgE8tfDnvEb3mYj1wqHh8pr5Amvvhnk';
```

If not found, the recovery API will automatically:
1. Check if token exists
2. Fetch on-chain mint info
3. Get/create user record
4. Insert token record
5. Create token parameters

The API endpoint is ready at: `/api/token/recover`

