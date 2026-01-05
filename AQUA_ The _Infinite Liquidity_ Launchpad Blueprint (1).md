# AQUA: The "Infinite Liquidity" Launchpad Blueprint

This document outlines the complete technical blueprint for the **AQUA** launchpad, a Solana-based platform designed around the concept of "infinite liquidity" and an Aquarius water theme. The architecture is designed for **100% fully connected execution**, ensuring real-time data flow, robust user isolation, and automated liquidity management.

---

## 1. Project Overview and Core Concept

The AQUA launchpad fundamentally re-imagines token liquidity by moving away from static pools that can "dry up." Instead, it implements a continuous, automated mechanism—the "Pour Rate"—to constantly add liquidity back into the token's trading pair, visually represented by the Aquarius pouring water. This mechanism, combined with an optional token burning feature ("Evaporation"), provides token creators with unprecedented control over their token's long-term health and market dynamics.

The platform will be built on the Solana blockchain, leveraging its high throughput and low transaction costs, and will utilize the **Pump.fun** bonding curve model for initial token launches.
I
### Key Dashboard Metrics (Thematic)

The user dashboard will feature four thematic, real-time metrics to visualize the token's health and liquidity status:

| Metric | Thematic Name | Calculation / Data Source | Purpose |
| :--- | :--- | :--- | :--- |
| **Liquidity Depth** | **Water Level Meter** | `Total Liquidity / Total Supply` (Derived from helius/coinghecko,binance,Birdeye API) | Shows the current depth of the liquidity pool in real-time. |
| **Token Burn Rate** | **Evaporation Tracker** | Sum of all `BurnChecked` instructions for the token mint. | Tracks the total tokens permanently removed from circulation. |
| **Health Score** | **Constellation Strength** | `(Liquidity / Market Cap) * 100` | A normalized health score comparing liquidity ratio to the token's market capitalization. |
| **Liquidity Flow** | **Pour Rate** | Live feed from the internal `liquidity_logs` database table. | Displays the speed and frequency of automated liquidity additions. |
| **Creator Rewards** | **Tide Harvest** | On-chain query of the `creator-vault` PDA balance. | Tracks and displays claimable creator rewards from trading volume. |

---

## 2. Technical Stack and Required Materials

The system is architected as a modern, full-stack JavaScript application, prioritizing scalability, real-time performance, and user security.

### A. Core Technical Stack

| Component | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend** | React (Vite) / JavaScript | High-performance, responsive user interface. |
| **Backend** | Node.js / Supabase Edge Functions | Handles automated liquidity logic and API orchestration. |
| **Database & Auth** | **Supabase** (PostgreSQL, Auth, Storage) | Persistent user mapping, real-time data storage, and user isolation. |
| **Blockchain** | Solana | Base layer for token creation and trading. |

### B. Solana Integration Libraries and APIs

To achieve **100% fully connected execution**, the following SDKs and APIs are required:

| Category | Material / Library | Purpose |
| :--- | :--- | :--- |
| **Launchpad Core** | **PumpPortal API** | Provides real-time WebSocket data and the `/api/trade-local` endpoint for secure, off-chain transaction building for token creation and trading [1]. |
| **Blockchain Utility** | `@solana/web3.js` | Essential library for general Solana blockchain interaction, transaction signing, and sending. |
| **Token Operations** | `@solana/spl-token` | Used specifically for creating the `BurnChecked` instruction to implement the "Evaporation Tracker" and token burning feature [2]. |
| **RPC Provider** | **Alchemy** (Recommended) | Provides the most generous free tier (30M Compute Units/month) for high-volume RPC calls, offering a cost-effective alternative to Helius for initial scaling [3]. |
| **Token Metrics** | **helius Solana API** | Best-in-class support for Pump.fun token data, including prices and metadata, with a generous free tier (40k CU/day) for fetching dashboard metrics [4]. |
| **Charting** | **TradingView Lightweight Charts** | A powerful, open-source library for creating the real-time candlestick chart on the token dashboard. |
| **Swap Routing** | **Jupiter SDK / API** | Used for post-migration swaps and optimal routing across all Solana DEXs. |

---

## 3. Architecture for User Isolation and Persistent State

The platform must support multiple users simultaneously with strict user isolation. **Supabase** is the ideal choice for this, utilizing its built-in PostgreSQL features.

### A. Database Schema and RLS Implementation

The core of user isolation relies on **Row Level Security (RLS)**, which must be enabled on all user-facing tables.

| Table | Description | RLS Policy Example (SQL) |
| :--- | :--- | :--- |
| | profiles | Links Supabase `auth.uid()` to user-specific settings. | `SELECT` access for all authenticated users; `UPDATE` only where `auth.uid()` = id. |
| wallets | Stores encrypted private keys for user-managed wallets. | RLS to ensure only the owner (`auth.uid()`) can access their wallets. |
| `tokens` | Stores token configuration (pour rate, burn setting). | `UPDATE` only where `auth.uid() = creator_id`. |
| `liquidity_logs` | Records automated liquidity additions. | `INSERT` only by the backend service role; `SELECT` by all authenticated users. |

**Example RLS Policy for Token Management:**
```sql
-- Users can only update their own tokens
CREATE POLICY "Users can only update their own tokens" 
ON tokens FOR UPDATE 
USING (auth.uid() = creator_id);
```

### B. Persistent User Mapping and Storage Isolation

1.  **Backend-Managed Wallets:** User authentication is handled by Supabase Auth, but the platform manages the user's Solana wallets directly.
    - **Generation/Import:** Users can generate a new wallet (keypair) or import an existing one (private key/seed phrase).
    - **Secure Storage:** The generated/imported private keys **MUST** be stored securely in the `wallets` table, encrypted using a strong, user-derived key (e.g., a key derived from the user's Supabase password/session) and never stored in plain text.
    - **Backup Prompt:** The UI **MUST** strongly prompt the user to save their generated private key/seed phrase immediately, as the platform cannot recover it if the encryption key is lost.
    - **Multi-Wallet Management:** The `wallets` table will allow users to store multiple wallets, each with a custom label, for seamless use in backend transactions.
2.  **Storage Isolation:** Token image assets (logos, etc.) must be isolated. This is achieved by using folder-level RLS within Supabase Storage.
    - **Path Pattern:** `bucket/tokens/{auth.uid()}/...`
    - **Storage Policy:** The policy ensures a user can only upload or access files within their dedicated folder, which is named after their unique `auth.uid()`.

---

## 4. Implementation Details and Proof of Concept

### A. Real-Time Data and Charting

The real-time nature of the dashboard requires a direct WebSocket connection to the trading data source. The **TradingView Lightweight Charts** library is integrated to consume this stream directly.

**Real-Time Chart Implementation (JavaScript):**

This snippet demonstrates connecting to the PumpPortal WebSocket and updating the candlestick chart in real-time.

```javascript
import { createChart } from 'lightweight-charts';

// 1. Initialize Chart with AQUA Theme
const chart = createChart(document.getElementById('chart'), {
    width: 800, height: 400,
    layout: { background: { color: '#051622' }, textColor: '#D9D9D9' }, // Ocean Dark
    grid: { vertLines: { color: '#0d2035' }, horzLines: { color: '#0d2035' } },
});

const candleSeries = chart.addCandlestickSeries({
    upColor: '#00f2ff', downColor: '#ff0055', // Aqua Cyan and Coral Red
    borderUpColor: '#00f2ff', borderDownColor: '#ff0055',
    wickUpColor: '#00f2ff', wickDownColor: '#ff0055',
});

// 2. WebSocket listener for real-time updates from PumpPortal
const ws = new WebSocket('wss://pumpportal.fun/api/data');
ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.method === 'tokenTrade') {
        // Data aggregation logic is required here to form OHLCV bars
        // For demonstration, we assume data contains the necessary fields:
        candleSeries.update({
            time: data.timestamp,
            open: data.open, high: data.high, low: data.low, close: data.price
        });
    }
};
```

### B. Token Creation and Burning

Token creation is handled via the PumpPortal API. The transaction is signed securely on the **backend** using the user's stored private key, which enables seamless, non-interactive execution. This is crucial for the "fully connected execution" goal.

**Token Creation (JavaScript - Frontend/Backend Orchestration):**

```javascript
const response = await fetch("https://pumpportal.fun/api/trade-local", {
  method: "POST",
  body: JSON.stringify({
    publicKey: userWallet.publicKey.toString(),
    action: "create",
    tokenMetadata: { name: "AQUA Token", symbol: "AQUA", uri: "metadata_url" },
    mint: mintKeypair.publicKey.toString(),
    amount: 1, // Initial dev buy (as per Pump.fun standard)
    pool: "pump"
  })
});
// The response contains the unsigned transaction, which the user's wallet must sign and send.
```

**Token Burning (Solana Web3.js - Backend Logic for "Evaporation"):**

This logic is executed by the backend worker when a token creator enables the burn option.

```javascript
import { createBurnCheckedInstruction, getAssociatedTokenAddress } from "@solana/spl-token";
import { Transaction } from "@solana/web3.js";

// 1. Get the token account address
const tokenAccount = await getAssociatedTokenAddress(mintAddress, owner);

// 2. Create the burn instruction
const transaction = new Transaction().add(
  createBurnCheckedInstruction(
    tokenAccount, // The token account to burn from
    mintAddress,  // The token mint
    owner,        // The owner of the token account
    amount,       // The amount to burn
    decimals      // The token decimals
  )
);
// 3. Sign and send transaction using the backend's authority wallet.
```

### C. "Infinite Liquidity" Engine (The Water Pump)

The core innovation requires a dedicated backend service to execute the "Pour Rate" logic. Since Pump.fun bonding curves do not allow direct liquidity injection, the system implements a **Two-Stage Liquidity Strategy** to maintain the "infinite liquidity" effect throughout the token's lifecycle.

#### 1. Stage One: Bonding Curve (The "Pressure" Phase)
During the initial launch on Pump.fun or Meteora DBC, the "Pour Rate" simulates liquidity by performing automated buy-backs.
- **Mechanism**: The backend worker uses the **PumpPortal API** (`/api/trade-local`) to execute swaps (buys) directly on the bonding curve.
- **Effect**: This adds SOL to the virtual pool, increases the token price, and accelerates the "Water Level" toward graduation.
- **Automation**: Transactions are signed by the backend using the Protocol-Owned Liquidity (POL) wallet, ensuring non-interactive execution.

#### 2. Stage Two: Post-Migration (The "Flow" Phase)
Once the token graduates to a DEX (PumpSwap, Raydium, or Meteora), the "Pour Rate" transitions to actual liquidity provision and ecosystem-wide swaps.
- **Mechanism**: The system utilizes the **Jupiter SDK/API** for optimal swap routing and the **Meteora/Raydium SDKs** for direct liquidity management.
- **Advanced AMM Integration**: The system integrates with **Meteora DLMM** or **Raydium CP-AMM** to provide concentrated liquidity.
- **Dynamic Rebalancing**: The worker automatically adds the collected fees into specific price bins (Meteora) or concentrated ranges (Raydium), ensuring the "Water Level" is deepest at the current trading price.
- **Infinite Effect**: By continuously "pouring" fees back into these advanced AMMs via Jupiter's best-price routing, the system ensures the pool never "dries up," regardless of trading volume.

### D. Automated Creator Reward Management (Tide Harvest)

Since the Pump.fun API does not natively provide reward balance detection, the AQUA backend implements a direct on-chain monitoring and claiming system.

#### 1. Reward Detection (The "Tide" Sensor)
The system calculates the **Creator Vault PDA** address to monitor claimable SOL rewards in real-time. This is essential because the standard Pump.fun API does not provide a direct endpoint for reward balances.

```javascript
// Calculate Creator Vault PDA
const [creatorVaultPda] = PublicKey.findProgramAddressSync(
  [
    Buffer.from('creator-vault'), 
    creatorPubkey.toBuffer()
  ],
  PUMPFUN_PROGRAM_ID
);

// Query on-chain balance
const vaultInfo = await connection.getAccountInfo(creatorVaultPda);
const claimableRewards = vaultInfo ? vaultInfo.lamports : 0;
```

#### 2. Automated Claiming Logic
The backend worker monitors the vault balance and triggers a claim when the "Tide" reaches a user-defined threshold (minimum 0.002 SOL recommended to cover transaction costs).

```javascript
// Automated Claim via PumpPortal API
const response = await fetch("https://pumpportal.fun/api/trade-local", {
  method: "POST",
  body: JSON.stringify({
    publicKey: creatorAddress,
    action: "collectCreatorFee",
    priorityFee: 0.000001,
    // Note: For Pump.fun, all fees are claimed at once; 
    // for Meteora DBC, the 'mint' and 'pool' parameters are required.
  })
});
// Backend signs the returned transaction using the stored user wallet
```

#### 3. Comprehensive Reward Lifecycle Management

The AQUA platform ensures that creators capture every lamport of revenue across both the bonding curve and post-migration phases.

| Phase | Reward Type | Detection Mechanism | Claiming Method |
| :--- | :--- | :--- | :--- |
| **Bonding Curve (Pump.fun)** | Trading Fee Share (0.05% - 1%) | Real-time monitoring of the `creator-vault` PDA balance. | Automated `collectCreatorFee` call via PumpPortal API. |
| **Bonding Curve (Meteora DBC)** | Dynamic Fee Share | On-chain query of the Meteora vault associated with the token mint. | Automated claim with `pool: "meteora-dbc"` and `mint` parameters. |
| **Post-Migration (PumpSwap/Raydium)** | Revenue Sharing (up to 50%) | Monitoring of the creator's profile revenue balance via the PumpPortal/PumpSwap data feed. | Periodic execution of the `collectCreatorFee` instruction signed by the backend. |
| **Liquidity Incentives** | LP Rewards / Protocol Fees | Scanning for Raydium LP positions and CLMM rewards associated with the creator's wallet. | Automated withdrawal of earned fees from Raydium/Meteora liquidity positions. |

#### 4. Automated Reward Checking Logic
The backend worker executes a dual-check strategy:
1.  **On-Chain Check**: Every 5 minutes, the worker queries the `creator-vault` PDA for any "unclaimed" bonding curve fees.
2.  **API/Protocol Check**: The worker queries the PumpPortal/PumpSwap data endpoints to detect "migrated" revenue shares that are ready for harvest.

This dual-layer approach ensures that no rewards are left behind, regardless of whether the token is still on the bonding curve or has graduated to a major DEX.

---

## 5. Step-by-Step Execution Plan

This plan ensures a fully connected and deployable application:

1.  **Environment Setup:** Initialize the Vite + React project and set up the Supabase project, including the initial database schema.
2.  **Wallet & Auth Integration:** Implement a custom, backend-managed wallet system (generate/import private keys) and integrate Supabase Auth for user login and persistent state mapping.
3.  **Security Layer:** Configure all necessary RLS policies on Supabase tables and Storage buckets to ensure strict user isolation.
4.  **PumpPortal Connection:** Set up the WebSocket listener in the frontend for real-time data and the API client in the backend for transaction building.
5.  **Token Launch Flow:** Build the UI and backend logic for token creation, capturing the user's desired "Pour Rate" and "Burn Option."
6.  **Liquidity Engine Development:** Develop the Node.js worker or Supabase Edge Function to automate fee collection, liquidity addition, token burning, and **automated reward claiming**.
7.  **Dashboard Development:** Implement the 5 key thematic metrics (Water Level, Evaporation, Tide Harvest, etc.) using data from helius/coinghecko,binance,Birdeye, on-chain PDA queries, and internal Supabase logs.
8.  **Chart Integration:** Integrate and style the **TradingView Lightweight Charts** using the real-time data stream.
9.  **Deployment:** Deploy the frontend to a service like Vercel/Netlify and the backend/database to Digital Ocean/Supabase, ensuring the Node.js worker is running persistently.

---

## References

[1] PumpPortal API Documentation. *3rd-Party API for Raydium and Pump.fun*.
[2] Solana Documentation. *Burn Tokens*.
[3] Alchemy. *Solana RPC Node Providers*.
[4] helius API Documentation. *Pump.fun Token Prices*.
[5] Meteora Documentation. *Dynamic Liquidity Market Maker (DLMM)*.
[6] Supabase Documentation. *Row Level Security*.
[7] TradingView. *Lightweight Charts Library*.
