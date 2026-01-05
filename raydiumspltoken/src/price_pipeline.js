const axios = require('axios');
const hsmacMetrics = require('./hsmac_metrics');
const { getMintInfo } = require('./solana_utils');

const USDC_MINT = 'EPjFWdd5Auq8mGJwGnG1vA7E5kWoP4Y3W6w9sUn5L8g';
const USDC_DECIMALS = 6;
const SOL_MINT = 'So11111111111111111111111111111111111111112';

const SOURCE_HEALTH = new Map();
const DECIMAL_CACHE = new Map();

function recordHealth(source, ok, error) {
  if (!SOURCE_HEALTH.has(source)) {
    SOURCE_HEALTH.set(source, {
      lastSuccess: 0,
      lastError: null,
      consecutiveFailures: 0
    });
  }

  const state = SOURCE_HEALTH.get(source);
  if (ok) {
    state.lastSuccess = Date.now();
    state.lastError = null;
    state.consecutiveFailures = 0;
  } else {
    state.lastError = {
      message: error?.message || String(error),
      timestamp: Date.now()
    };
    state.consecutiveFailures += 1;
  }
}

async function getTokenDecimals(tokenMint) {
  if (DECIMAL_CACHE.has(tokenMint)) {
    return DECIMAL_CACHE.get(tokenMint);
  }

  let decimals = 9;
  try {
    const mintInfo = await getMintInfo(tokenMint);
    if (mintInfo && Number.isInteger(mintInfo.decimals)) {
      decimals = mintInfo.decimals;
    }
  } catch (error) {
    console.warn(`[PRICE_PIPELINE] Mint info unavailable for ${tokenMint}, defaulting decimals to 9: ${error.message}`);
  }

  DECIMAL_CACHE.set(tokenMint, decimals);
  return decimals;
}

async function fetchFromJupiterQuote(tokenMint) {
  const decimals = await getTokenDecimals(tokenMint);
  const amount = BigInt(10) ** BigInt(decimals);

  const params = {
    inputMint: tokenMint,
    outputMint: USDC_MINT,
    amount: amount.toString(),
    slippageBps: 0,
    onlyDirectRoutes: true
  };

  const response = await axios.get('https://quote-api.jup.ag/v6/quote', {
    params,
    timeout: 3500
  });

  const data = response.data || {};
  const outAmountStr = data.outAmount || data.data?.outAmount;
  const inAmountStr = data.inAmount || data.data?.inAmount || params.amount;

  if (!outAmountStr || !inAmountStr) {
    throw new Error('Quote response missing amounts');
  }

  const inAmount = BigInt(inAmountStr);
  const outAmount = BigInt(outAmountStr);
  if (inAmount === 0n || outAmount === 0n) {
    throw new Error('Zero amount in Jupiter quote');
  }

  const tokenUnits = Number(inAmount) / Math.pow(10, decimals);
  const usdcUnits = Number(outAmount) / Math.pow(10, USDC_DECIMALS);

  if (!Number.isFinite(tokenUnits) || tokenUnits <= 0 || !Number.isFinite(usdcUnits) || usdcUnits <= 0) {
    throw new Error('Invalid amounts from Jupiter quote');
  }

  return {
    price: usdcUnits / tokenUnits,
    source: 'jupiter_quote'
  };
}

async function fetchFromJupiterPriceV2(tokenMint) {
  const response = await axios.get('https://lite-api.jup.ag/price/v3', {
    params: { ids: tokenMint },
    timeout: 3000
  });

  const price = response.data?.data?.[tokenMint]?.price;
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error('Jupiter price v2 returned invalid data');
  }

  return {
    price,
    source: 'jupiter_price_v2'
  };
}

async function fetchFromJupiterLegacy(tokenMint) {
  const response = await axios.get(`https://price.jup.ag/v4/price`, {
    params: { ids: tokenMint },
    timeout: 3000
  });

  const price = response.data?.data?.[tokenMint]?.price;
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error('Jupiter legacy price invalid');
  }

  return {
    price,
    source: 'jupiter_price_v4'
  };
}

async function fetchFromDexScreener(tokenMint) {
  const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`, {
    timeout: 4000
  });

  const pair = response.data?.pairs?.find((p) => Number.isFinite(parseFloat(p.priceUsd)) && parseFloat(p.priceUsd) > 0);
  if (!pair) {
    throw new Error('DexScreener returned no price');
  }

  return {
    price: parseFloat(pair.priceUsd),
    source: `dexscreener:${pair.chainId || 'solana'}`
  };
}

// Special SOL price fetcher using CoinGecko (more reliable for major assets)
async function fetchSolPriceFromCoinGecko() {
  const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
    params: {
      ids: 'solana',
      vs_currencies: 'usd'
    },
    timeout: 5000
  });

  const price = response.data?.solana?.usd;
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error('CoinGecko returned invalid SOL price');
  }

  return {
    price,
    source: 'coingecko'
  };
}

// Binance fallback for SOL price
async function fetchSolPriceFromBinance() {
  const response = await axios.get('https://api.binance.com/api/v3/ticker/price', {
    params: { symbol: 'SOLUSDT' },
    timeout: 3000
  });

  const price = parseFloat(response.data?.price);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error('Binance returned invalid SOL price');
  }

  return {
    price,
    source: 'binance'
  };
}

const ORDERED_SOURCES = [
  { name: 'jupiter_quote', fetcher: fetchFromJupiterQuote },
  { name: 'jupiter_price_v2', fetcher: fetchFromJupiterPriceV2 },
  { name: 'jupiter_price_v4', fetcher: fetchFromJupiterLegacy },
  { name: 'dexscreener', fetcher: fetchFromDexScreener }
];

async function resolveExternalPrice(tokenMint) {
  const errors = [];
  
  // Special handling for SOL/WSOL - use dedicated price sources
  const isSolMint = tokenMint === SOL_MINT || tokenMint.toLowerCase() === 'sol';
  if (isSolMint) {
    // Try SOL-specific sources first (more reliable)
    const solSources = [
      { name: 'binance_sol', fetcher: fetchSolPriceFromBinance },
      { name: 'coingecko_sol', fetcher: fetchSolPriceFromCoinGecko }
    ];
    
    for (const { name, fetcher } of solSources) {
      try {
        const result = await fetcher();
        recordHealth(name, true);
        console.log(`[PRICE] SOL price from ${name}: $${result.price}`);
        return result;
      } catch (error) {
        recordHealth(name, false, error);
        errors.push({ source: name, message: error.message || String(error) });
      }
    }
  }
  
  // Standard sources for all tokens
  for (const { name, fetcher } of ORDERED_SOURCES) {
    try {
      const result = await fetcher(tokenMint);
      recordHealth(name, true);
      return result;
    } catch (error) {
      recordHealth(name, false, error);
      errors.push({ source: name, message: error.message || String(error) });
    }
  }

  const err = new Error('All price sources failed');
  err.sources = errors;
  throw err;
}

async function getRealtimePriceUSD(tokenMint, { preferRealtime = true } = {}) {
  const normalizedMint = typeof tokenMint === 'string' ? tokenMint.trim() : '';
  if (!normalizedMint) {
    throw new Error('tokenMint is required for price lookup');
  }

  if (preferRealtime && hsmacMetrics.getTokenState) {
    const state = hsmacMetrics.getTokenState(normalizedMint);
    if (state && Number.isFinite(state.price) && state.price > 0) {
      return {
        price: state.price,
        source: 'helius_realtime'
      };
    }
  }

  const external = await resolveExternalPrice(normalizedMint);
  return external;
}

function getSourceHealth() {
  const snapshot = {};
  for (const [name, state] of SOURCE_HEALTH.entries()) {
    snapshot[name] = { ...state };
  }
  return snapshot;
}

module.exports = {
  getRealtimePriceUSD,
  getSourceHealth
};

