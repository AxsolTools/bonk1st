/**
 * Token Recovery Module
 * Rebuilds missing token records by scanning user wallets on-chain.
 */

const db = require('./db');
const {
  getTokenAccounts,
  getMintInfo
} = require('./solana_utils');
const {
  getTokenMetadata,
  isHeliusAvailable
} = require('./helius');

const EXCLUDED_MINTS = new Set([
  'So11111111111111111111111111111111111111112', // Wrapped SOL
  '11111111111111111111111111111111',
  'EPjFWdd5AufqSSqeM2qDK7Z5oYB26CLDFSrZJj7xS',
  'Es9vMFrzaCERF9R4tPktC57aKyv7Qxg4QhDWPE1Jst1c'
]);

const metadataCache = new Map();

function safeBigInt(value) {
  try {
    if (value === null || value === undefined) return 0n;
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number') return BigInt(Math.floor(Math.max(0, value)));
    const trimmed = String(value).trim();
    if (!trimmed) return 0n;
    return BigInt(trimmed);
  } catch {
    return 0n;
  }
}

async function fetchMetadata(mint) {
  if (!mint) {
    return null;
  }
  if (metadataCache.has(mint)) {
    return metadataCache.get(mint);
  }
  let metadata = null;
  if (isHeliusAvailable()) {
    try {
      metadata = await getTokenMetadata(mint);
    } catch (error) {
      console.warn(`[TOKEN RECOVERY] Metadata lookup failed for ${mint.substring(0, 8)}...: ${error.message}`);
    }
  }
  metadataCache.set(mint, metadata);
  return metadata;
}

function deriveNameAndSymbol(metadata, mint) {
  const metaSource = metadata?.content?.metadata || metadata?.metadata || {};
  const tokenInfo = metadata?.token_info || metadata?.tokenInfo || {};
  const rawName = metaSource.name || tokenInfo.name || metadata?.name || null;
  const rawSymbol = metaSource.symbol || tokenInfo.symbol || metadata?.symbol || null;
  const fallbackName = mint ? `${mint.slice(0, 6)}...` : 'Token';
  const fallbackSymbol = mint ? mint.slice(0, 4) : 'TKN';
  return {
    name: typeof rawName === 'string' && rawName.trim().length ? rawName.trim() : fallbackName,
    symbol: typeof rawSymbol === 'string' && rawSymbol.trim().length ? rawSymbol.trim() : fallbackSymbol
  };
}

function deriveDescription(metadata) {
  return metadata?.content?.metadata?.description
    || metadata?.metadata?.description
    || metadata?.description
    || '';
}

async function buildTokenPayload({
  mint,
  userId,
  walletId,
  decimalsHint,
  sourceWalletAddress
}) {
  const metadata = await fetchMetadata(mint);
  const { name, symbol } = deriveNameAndSymbol(metadata, mint);
  let decimals = Number.isInteger(decimalsHint) ? decimalsHint : null;

  if (!Number.isInteger(decimals)) {
    try {
      const mintInfo = await getMintInfo(mint);
      if (Number.isInteger(mintInfo?.decimals)) {
        decimals = mintInfo.decimals;
      }
    } catch (error) {
      console.warn(`[TOKEN RECOVERY] getMintInfo failed for ${mint.substring(0, 8)}...: ${error.message}`);
    }
  }

  return {
    user_id: userId,
    wallet_id: walletId,
    mint_address: mint,
    token_name: name,
    token_symbol: symbol,
    decimals: Number.isInteger(decimals) ? decimals : 9,
    platform: metadata?.content?.metadata?.attributes?.find?.((attr) => attr.trait_type === 'platform')?.value || 'unknown',
    state: 'discovered',
    description: deriveDescription(metadata),
    profile: {
      recoveredFrom: 'wallet_scan',
      recoveredAt: Date.now(),
      sourceWallet: sourceWalletAddress
    }
  };
}

async function recoverTokensForWallet(wallet, { force = false } = {}) {
  if (!wallet || !wallet.wallet_address || !wallet.user_id) {
    return 0;
  }

  const accounts = await getTokenAccounts(wallet.wallet_address);
  if (!Array.isArray(accounts) || accounts.length === 0) {
    return 0;
  }

  let created = 0;

  for (const account of accounts) {
    const mint = account?.mint;
    if (!mint) {
      continue;
    }
    if (EXCLUDED_MINTS.has(mint)) {
      continue;
    }

    const existing = db.getTokenByMint(mint);
    if (existing && !force) {
      continue;
    }

    const amount = safeBigInt(account.amount);
    if (amount === 0n && !force) {
      continue;
    }

    try {
      const payload = await buildTokenPayload({
        mint,
        userId: wallet.user_id,
        walletId: wallet.wallet_id,
        decimalsHint: account.decimals,
        sourceWalletAddress: wallet.wallet_address
      });

      if (existing) {
        db.updateToken(existing.token_id, payload);
      } else {
        db.createToken(payload);
        created += 1;
        console.log(`[TOKEN RECOVERY] Added token ${payload.token_symbol} (${mint.substring(0, 8)}...) for user ${wallet.user_id}`);
      }
    } catch (error) {
      console.warn(`[TOKEN RECOVERY] Failed to recover token ${mint.substring(0, 8)}...: ${error.message}`);
    }
  }

  return created;
}

async function recoverTokensForUser(user, options = {}) {
  if (!user) {
    return 0;
  }
  const wallets = db.getUserWallets(user.user_id) || [];
  let created = 0;
  for (const wallet of wallets) {
    created += await recoverTokensForWallet(wallet, options);
  }
  return created;
}

async function recoverAllTokens(options = {}) {
  const { force = false } = options;
  const users = db.getAllUsers();
  if (!users.length) {
    return 0;
  }

  let totalCreated = 0;
  for (const user of users) {
    const existingTokens = db.getUserTokens(user.user_id) || [];
    if (existingTokens.length && !force) {
      continue;
    }
    totalCreated += await recoverTokensForUser(user, options);
  }

  if (totalCreated > 0) {
    console.log(`🩹 Token recovery added ${totalCreated} missing token record(s).`);
  } else {
    console.log('ℹ️ Token recovery found no new tokens to add.');
  }

  return totalCreated;
}

module.exports = {
  recoverAllTokens,
  recoverTokensForUser,
  recoverTokensForWallet
};

