# BONK1ST Sniper - Environment Variables Setup

## Required Environment Variables for DigitalOcean

Copy these to your DigitalOcean App Platform environment variables:

---

### 🔴 CRITICAL - Helius API (Required for Sniper)

```
HELIUS_API_KEY=your_helius_api_key_here
NEXT_PUBLIC_HELIUS_API_KEY=your_helius_api_key_here
```

**Get your API key from:** https://dev.helius.xyz/

⚠️ **IMPORTANT:** Both variables must be set! 
- `HELIUS_API_KEY` - Used by server-side API routes
- `NEXT_PUBLIC_HELIUS_API_KEY` - Used by browser WebSocket connections (the sniper)

---

### 🔴 Solana RPC

```
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=your_helius_api_key_here
```

---

### 🔴 Supabase (Required for wallet management)

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

---

### 🔴 Encryption Key (Required for wallet security)

```
ENCRYPTION_KEY=your_32_byte_hex_key
```

Generate with: `openssl rand -hex 32`

---

### 🟡 Optional APIs

```
JUPITER_API_URL=https://quote-api.jup.ag/v6
DEXSCREENER_API_URL=https://api.dexscreener.com
BIRDEYE_API_KEY=your_birdeye_api_key
```

---

### 🟢 App Config

```
NEXT_PUBLIC_APP_URL=https://your-domain.com
NODE_ENV=production
```

---

## How the Sniper Uses Helius

The BONK1ST sniper monitors these Solana programs via Helius WebSocket:

| Program | Address | Purpose |
|---------|---------|---------|
| **Raydium LaunchLab** | `LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj` | BONK/USD1 and BONK/SOL pools |
| **Pump.fun** | `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` | Pump.fun token launches |

### WebSocket Subscription Flow:

1. Browser connects to `wss://mainnet.helius-rpc.com/?api-key=YOUR_KEY`
2. Subscribes to `logsSubscribe` for the program addresses above
3. When a new pool/token is created, Helius sends real-time notification
4. Sniper parses the logs, fetches token metadata, applies filters
5. If filters pass and sniper is armed, executes trade via `/api/trade`

---

## Verifying Your Setup

After setting environment variables:

1. Open browser console (F12)
2. Navigate to `/1st`
3. Look for these logs:
   - `[HELIUS-WS] Connected` - WebSocket connected
   - `[useLogsSubscription] Subscription successful!` - Monitoring active
   - `[BONK1ST DEBUG] LaunchLab log received` - Receiving data

If you see errors:
- `Helius API key not configured` - Check `NEXT_PUBLIC_HELIUS_API_KEY`
- `Connection timeout` - Check network/firewall
- No logs appearing - LaunchLab may have low activity, try enabling Pump.fun monitoring

