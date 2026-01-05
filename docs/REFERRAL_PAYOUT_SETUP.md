# Referral Payout System Setup

## Overview

The AQUA Launchpad referral system uses a **dedicated payout wallet** to process claim payouts. This is separate from the developer fee wallet for security isolation.

## Environment Variables

Add these to your Digital Ocean App Platform environment variables:

### Required Variables

```bash
# Referral System Toggle
REFERRAL_ENABLED=true

# Referral Share Configuration
REFERRAL_SHARE_PERCENT=50          # Referrers get 50% of platform fees
REFERRAL_MIN_CLAIM_SOL=0.01        # Minimum claim amount in SOL
REFERRAL_CLAIM_COOLDOWN=3600       # Cooldown between claims in seconds (1 hour)

# Dedicated Payout Wallet (CRITICAL - Keep these secure!)
REFERRAL_PAYOUT_WALLET=<YOUR_PAYOUT_WALLET_PUBLIC_KEY>
REFERRAL_PAYOUT_PRIVATE_KEY=<YOUR_PAYOUT_WALLET_PRIVATE_KEY_BASE58>
```

### How to Generate a Payout Wallet

1. **Create a new Solana wallet** (do NOT reuse existing wallets):

```javascript
const { Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');

const keypair = Keypair.generate();
console.log('Public Key:', keypair.publicKey.toBase58());
console.log('Private Key (Base58):', bs58.encode(keypair.secretKey));
```

2. **Fund the wallet** with SOL for payouts:
   - Transfer enough SOL to cover expected claim payouts
   - Keep a reserve of at least 0.1 SOL for transaction fees
   - Monitor the balance regularly

3. **Add to Digital Ocean**:
   - Go to your App Settings > App-Level Environment Variables
   - Add `REFERRAL_PAYOUT_WALLET` with the public key
   - Add `REFERRAL_PAYOUT_PRIVATE_KEY` with the base58 private key
   - Mark the private key as "Encrypted" for security

## Security Best Practices

### 1. Wallet Isolation
- The payout wallet should ONLY be used for referral payouts
- Never use it for any other transactions
- Don't share the private key anywhere except Digital Ocean env vars

### 2. Balance Monitoring
- Set up alerts for low balance
- The system will reject payouts if balance falls below 0.01 SOL
- Recommended: Keep at least 1 SOL buffer in the wallet

### 3. Payout Limits
Built-in safety limits:
- Maximum single payout: 10 SOL
- Minimum payout: 0.001 SOL
- Rate limiting: 3 claim attempts per minute per user

### 4. Audit Trail
All claims are logged to:
- `referral_claims` table with full transaction details
- System logs with timestamps and transaction signatures
- Failed claims are tracked with error codes

## Monitoring

### Health Check Endpoint

```bash
GET /api/referral/claim
```

Returns:
```json
{
  "success": true,
  "data": {
    "systemHealthy": true,
    "payoutWalletConfigured": true,
    "referralEnabled": true,
    "minClaimAmount": 0.01,
    "cooldownSeconds": 3600
  }
}
```

### Checking Payout Wallet Balance

The system automatically checks balance before each payout. If the wallet runs low:
1. Claims will fail gracefully with error message
2. User's pending earnings are preserved (not lost)
3. System logs will show "INSUFFICIENT_PAYOUT_BALANCE" error

## Error Codes

| Code | Description | User Action |
|------|-------------|-------------|
| `AMOUNT_TOO_SMALL` | Claim below minimum | Wait for more earnings |
| `AMOUNT_EXCEEDS_LIMIT` | Claim above 10 SOL limit | Contact support |
| `WALLET_NOT_CONFIGURED` | Payout wallet not set | Contact support |
| `INSUFFICIENT_PAYOUT_BALANCE` | Payout wallet needs funding | Try again later |
| `COOLDOWN_ACTIVE` | User claimed recently | Wait for cooldown |
| `RATE_LIMITED` | Too many attempts | Wait 1 minute |
| `OPTIMISTIC_LOCK_FAILED` | Amount changed during claim | Refresh and retry |

## Rollback Protection

If a payout fails after the pending amount is locked:
1. The system automatically restores the pending earnings
2. The claim is logged as "failed" with error details
3. If rollback fails, an entry is created in `system_errors` for manual review

## Testing

Before going live:

1. Set up with a testnet/devnet wallet first
2. Test claim flow with small amounts
3. Verify transaction signatures on Solscan
4. Check all error scenarios work correctly

## Support

For issues with the payout system:
1. Check the health endpoint first
2. Review logs for error codes
3. Verify environment variables are set correctly
4. Ensure payout wallet has sufficient balance

