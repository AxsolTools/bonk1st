# Creator Rewards Reference Database

## Official Program IDs and Vault Derivation Patterns

Last Updated: January 2026
Sources: Official GitHub docs, DeepWiki, Jupiter Dev Docs

---

## 1. PUMP.FUN (Pump Program)

### Program ID
```
6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P
```

### Related Programs
| Program | Address | Purpose |
|---------|---------|---------|
| Pump Program | `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` | Bonding curve mechanism |
| PumpSwap AMM | `pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA` | Post-migration trading |
| Fee Program | `pfeeUxB6jkeY1Hxd7CsFCAjcgbHA9rWtchMGdZ6VojVZ` | Dynamic fee calculation |
| Mayhem Program | `MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e` | Special mode |

### Creator Vault PDA Derivation (VERIFIED)
```typescript
// Seeds: ["creator-vault", creator_pubkey]
// NOTE: Uses HYPHEN, not underscore
const [creatorVault] = PublicKey.findProgramAddressSync(
  [Buffer.from("creator-vault"), creatorPubkey.toBuffer()],
  PUMP_PROGRAM_ID
);
```

**IMPORTANT**: The creator vault is **PER-CREATOR**, not per-token. All tokens created by the same wallet share ONE vault that accumulates all fees.

### Bonding Curve PDA
```typescript
const [bondingCurve] = PublicKey.findProgramAddressSync(
  [Buffer.from("bonding-curve"), mintPubkey.toBuffer()],
  PUMP_PROGRAM_ID
);
```

### Collect Creator Fee Instruction
The `collect_creator_fee` instruction transfers the entire balance (minus rent-exempt minimum) from the vault to the creator's account.

### API Endpoints
- Token info: `https://frontend-api.pump.fun/coins/{tokenMint}`
- PumpPortal trade: `https://pumpportal.fun/api/trade-local`

---

## 2. BONK.FUN / LETSBONK.FUN (Raydium LaunchLab)

### Key Discovery: LetsBonk.fun uses Raydium LaunchLab
LetsBonk.fun tokens are created and traded on **Raydium LaunchLab**, NOT on a separate Bonk program.

### Raydium LaunchLab Program ID (VERIFIED)
```
Mainnet: LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj
Devnet:  DRay6fNdQ5J82H7xV6uq2aV3mNrUZ1J4PgSKsWgptcm6
```

**⚠️ OUR CURRENT CODE USES THE WRONG PROGRAM ID!**
We currently use `LBPPPwvAoMJZcnGgPFTT1oGVcnwHs8v3zKmAh8jd28o` which is INCORRECT.

### LetsBonk Platform Config Address
```
FfYek5vEz23cMkWsdJwG2oa6EphsvXSHrGpdALN4g6W1
```

### SDK and Documentation
- SDK: https://github.com/raydium-io/raydium-sdk-V2/tree/master/src/raydium/launchpad
- Demo: https://github.com/raydium-io/raydium-sdk-V2-demo/tree/master/src/launchpad
- CPI: https://github.com/raydium-io/raydium-cpi/tree/master/programs/launch-cpi

### Fee Claiming Methods
1. **Platform fees** - Use `ClaimPlatformFee` function
2. **Creator fees on bonding curve** - Use `claimCreatorFee` instruction
3. **Post-migration fees** - Use CPMM `harvestLockLiquidity` function
4. **Additional creator fees post-migration** - Use "Collect creator fees" function

### Fee Distribution
- 50% of fees buy/burn BONK
- 1% funds weekly ecosystem buybacks
- Creators get up to 5% of trading fees (configurable via `creatorFeeRate`)

### Migration Types
- `migrateType === 'amm'` - Migrate to Raydium AMM v4
- `migrateType === 'cpmm'` - Migrate to Raydium CP-Swap (enables revenue sharing)

### Bonding Curve Progress Formula
```
BondingCurveProgress = 100 - ((leftTokens * 100) / initialRealTokenReserves)
Where:
  leftTokens = realTokenReserves - reservedTokens
  initialRealTokenReserves = 793,100,000 (totalSupply - reservedTokens)
  totalSupply = 1,000,000,000
  reservedTokens = 206,900,000
```

---

## 3. JUPITER DBC (Dynamic Bonding Curve)

### Program ID (Meteora DBC)
```
dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN
```

This is the same on Mainnet-beta and Devnet.

### Key Differences from Pump.fun
- Fees are **PER-POOL**, not per-creator
- Uses Meteora's Dynamic Bonding Curve program
- Integrated directly into Jupiter

### Jupiter Studio API Endpoints
```
# Get pool addresses for a mint
GET https://api.jup.ag/studio/v1/dbc-pool/addresses/{mint}

# Get fee info for a pool
POST https://api.jup.ag/studio/v1/dbc/fee
Body: { "poolAddress": "..." }

# Create claim transaction
POST https://api.jup.ag/studio/v1/dbc/fee/create-tx
Body: {
  "ownerWallet": "...",
  "poolAddress": "...",
  "maxQuoteAmount": 1000000
}
```

### Config Keys for Migration

#### Meteora DAMM v1
| Fee Option | Config Key |
|------------|------------|
| 0.25% | `8f848CEy8eY6PhJ3VcemtBDzPPSD4Vq7aJczLZ3o8MmX` |
| 0.3% | `HBxB8Lf14Yj8pqeJ8C4qDb5ryHL7xwpuykz31BLNYr7S` |
| 1% | `7v5vBdUQHTNeqk1HnduiXcgbvCyVEZ612HLmYkQoAkik` |
| 2% | `EkvP7d5yKxovj884d2DwmBQbrHUWRLGK6bympzrkXGja` |
| 4% | `9EZYAJrcqNWNQzP2trzZesP7XKMHA1jEomHzbRsdX8R2` |
| 6% | `8cdKo87jZU2R12KY1BUjjRPwyjgdNjLGqSGQyrDshhud` |

#### Meteora DAMM v2
| Fee Option | Config Key |
|------------|------------|
| 0.25% | `7F6dnUcRoyM2TwR8myT1dYypFXpPSxqwKNSFNkxyNESd` |
| 0.3% | `2nHK1kju6XjphBLbNxpM5XRGFj7p9U8vvNzyZiha1z6k` |
| 1% | `Hv8Lmzmnju6m7kcokVKvwqz7QPmdX9XfKjJsXz8RXcjp` |
| 2% | `2c4cYd4reUYVRAB9kUUkrq55VPyy2FNQ3FDL4o12JXmq` |
| 4% | `AkmQWebAwFvWk55wBoCr5D62C6VVDTzi84NJuD9H7cFD` |
| 6% | `DbCRBj8McvPYHJG1ukj8RE15h2dCNUdTAESG49XpQ44u` |
| Custom | `A8gMrEPJkacWkcb3DGwtJwTe16HktSEfvwtuDh2MCtck` |

### Fee Distribution for Jupiter DBC
- Protocol gets a percentage
- Swap host (Jupiter/Photon/bots) can get referral fee
- Partner and creator share remaining fees
- After graduation, LP is locked and fees can be claimed on Meteora DAMM

---

## 4. TOKEN2022 TOKENS

### Transfer Fee Extension
Token2022 tokens can have built-in transfer fees. These are different from platform creator fees.

### Fee Harvest
Transfer fees accumulate in a withheld account and can be harvested by the fee authority.

---

## Cross-Reference: Our Current Implementation

### In `app/api/creator-rewards/route.ts`:

```typescript
// Current Program IDs
const PUMP_PROGRAM_ID = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P") // ✅ CORRECT
const BONK_PROGRAM_ID = new PublicKey("LBPPPwvAoMJZcnGgPFTT1oGVcnwHs8v3zKmAh8jd28o") // ⚠️ NEEDS VERIFICATION

// PDA Patterns Used
const pdaPatterns = [
  // Pattern 1: Per-creator vault - ✅ CORRECT for Pump.fun
  [Buffer.from("creator-vault"), creatorPubkey.toBuffer()],
  
  // Pattern 2: Per-token (legacy)
  [Buffer.from("creator_fee"), creatorPubkey.toBuffer(), mintPubkey.toBuffer()],
  
  // Pattern 3: Underscore variant
  [Buffer.from("creator_vault"), creatorPubkey.toBuffer()],
]
```

---

## Automated Background Engines

### Cron Job Schedule (pg_cron)

| Engine | Interval | Purpose |
|--------|----------|---------|
| **Tide Harvest** | Every 30 min | Auto-claim creator rewards to destination wallet |
| **Pour Rate** | Every 15 min | Auto-add liquidity from treasury/fees |
| **Evaporation** | Every 1 hour | Auto-burn tokens from dev wallet buys |
| **Token22 Liquidity** | Every 15 min | Harvest Token22 transfer fees |
| **Price Updater** | Every 5 min | Update token prices |
| **Metrics Updater** | Every 10 min | Update market cap, volume, etc. |

### Token Parameters Required for Automation

For **Tide Harvest** (auto-claim):
- `auto_claim_enabled = true`
- `claim_threshold_sol` (minimum to trigger claim)
- `claim_interval_seconds` (time between claims)
- `claim_destination_wallet` (where to send claimed SOL)
- `dev_wallet_address` (the creator wallet that owns the vault)
- `market_cap >= 5000` (to save API credits for dead tokens)

For **Pour Rate** (auto-liquidity):
- `pour_enabled = true`
- `pour_rate_percent` (% of treasury to pour per interval)
- `pour_interval_seconds`
- `pour_source` ('fees', 'treasury', or 'both')
- `treasury_balance_sol > pour_min_trigger_sol`
- `dev_wallet_address`

For **Evaporation** (auto-burn):
- `evaporation_enabled = true`
- `evaporation_rate_percent` (% of bought tokens to burn)
- `dev_wallet_auto_enabled = true`
- Linked to pour_rate_logs (burns tokens from dev buys)

---

## Debugging Checklist

When debugging creator rewards issues, verify:

1. **Pool Type Detection**
   - Is the token correctly identified as pump/bonk/jupiter in the database?
   - Is `pool_type` column populated correctly?

2. **Creator Wallet Match**
   - Does `tokens.creator_wallet` match the connected wallet?
   - Case sensitivity (should use `.toLowerCase()` comparison)

3. **Vault Address**
   - For Pump.fun: Same vault for all tokens by same creator
   - For Jupiter: Different pool address per token

4. **API Responses**
   - Check Pump.fun API response for creator field
   - Check Jupiter API for pool addresses

5. **PDA Derivation**
   - Using correct program ID?
   - Using correct seeds (hyphen vs underscore)?
   - Using correct creator pubkey?

---

## Logs to Check

### Server-side (Backend)
```
[CREATOR-REWARDS-GET] ===== REQUEST START =====
[GET-CREATOR-REWARDS][PUMP] ========== FUNCTION START ==========
[GET-CREATOR-REWARDS][PUMP] [METHOD 3] Trying pattern "creator-vault (per-creator)": PDA = xxx
[CREATOR-REWARDS-GET] ===== FINAL RESPONSE =====
```

### Client-side (Browser Console)
```
[REWARDS-DEBUG] Fetching rewards for wallet: xxx
[TIDE-HARVEST-MONITOR] Response: { balance, poolType, hasRewards }
[CLAIM-DEBUG] Starting claim: { tokenMint, walletAddress, poolType }
```

