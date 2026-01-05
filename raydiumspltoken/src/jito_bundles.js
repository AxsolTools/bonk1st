/**
 * Jito Bundle Implementation
 * Handles atomic transaction bundles for MEV protection
 * Uses PumpPortal "Jito Bundles" flow to request unsigned transactions and submit
 * signed bundles to the Jito block engine:
 * https://pumpportal.fun/local-trading-api/jito-bundles
 *
 * Jito allows up to 5 transactions to be executed atomically in the same block
 * This is critical for token creation + liquidity pool creation to prevent front-running
 */

const { Connection, Transaction, VersionedTransaction } = require('@solana/web3.js');
const axios = require('axios');
const bs58 = require('bs58');
const https = require('https');
const fs = require('fs');

function normalizeEndpointUrl(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const sanitized = trimmed.replace(/\s+/g, '');
  const withoutTrailingSlash = sanitized.replace(/\/+$/, '');

  if (/^https?:\/\//i.test(withoutTrailingSlash)) {
    return withoutTrailingSlash;
  }

  // Assume https if scheme not provided
  return `https://${withoutTrailingSlash}`;
}

function parseEndpointList(envValue) {
  if (!envValue || typeof envValue !== 'string') {
    return [];
  }

  return envValue
    .split(',')
    .map(normalizeEndpointUrl)
    .filter(Boolean);
}

function dedupePreserveOrder(values) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    if (!value) {
      continue;
    }
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value);
  }

  return result;
}

function shuffleArray(input) {
  const array = Array.isArray(input) ? input.slice() : [];
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function safeJsonParse(raw) {
  if (!raw || typeof raw !== 'string') {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) {
    return null;
  }
}

function parseHeaderPairs(raw) {
  if (!raw || typeof raw !== 'string') {
    return {};
  }

  return raw
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce((acc, entry) => {
      const separatorIndex = entry.indexOf('=');
      if (separatorIndex === -1) {
        return acc;
      }
      const key = entry.slice(0, separatorIndex).trim();
      const value = entry.slice(separatorIndex + 1).trim();
      if (key) {
        acc[key] = value;
      }
      return acc;
    }, {});
}

function buildJitoHeaders() {
  const headers = {
    'Content-Type': 'application/json'
  };

  const jsonHeaders =
    safeJsonParse(process.env.JITO_BUNDLE_HEADERS) ||
    safeJsonParse(process.env.JITO_EXTRA_HEADERS_JSON) ||
    safeJsonParse(process.env.JITO_BUNDLE_EXTRA_HEADERS_JSON);

  if (jsonHeaders) {
    for (const [key, value] of Object.entries(jsonHeaders)) {
      if (typeof key === 'string' && value != null) {
        headers[key] = String(value);
      }
    }
  }

  const pairHeaders = {
    ...parseHeaderPairs(process.env.JITO_EXTRA_HEADERS),
    ...parseHeaderPairs(process.env.JITO_BUNDLE_EXTRA_HEADERS)
  };
  for (const [key, value] of Object.entries(pairHeaders)) {
    headers[key] = value;
  }

  const apiKey = process.env.JITO_API_KEY || process.env.JITO_BUNDLE_API_KEY;
  if (apiKey) {
    headers['X-API-KEY'] = apiKey;
  }

  const authToken = process.env.JITO_AUTH_TOKEN || process.env.JITO_BUNDLE_AUTH_TOKEN;
  if (authToken) {
    const headerName = (process.env.JITO_AUTH_HEADER || process.env.JITO_BUNDLE_AUTH_HEADER || 'Authorization').trim() || 'Authorization';
    headers[headerName] = authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`;
  }

  const basicAuth = process.env.JITO_BASIC_AUTH || process.env.JITO_BUNDLE_BASIC_AUTH;
  if (basicAuth && !headers.Authorization) {
    headers.Authorization = `Basic ${Buffer.from(basicAuth).toString('base64')}`;
  }

  return headers;
}

// Jito Block Engine endpoints (rotate when rate-limited)
// Updated 2024-12 from official docs: https://docs.jito.wtf/lowlatencytxnsend/
const JITO_BLOCK_ENGINE_URLS = {
  mainnet: [
    'https://ny.mainnet.block-engine.jito.wtf/api/v1/bundles',           // 🇺🇸 New York (Primary)
    'https://mainnet.block-engine.jito.wtf/api/v1/bundles',              // 🌍 Global (auto-routes)
    'https://slc.mainnet.block-engine.jito.wtf/api/v1/bundles',          // 🇺🇸 Salt Lake City
    'https://amsterdam.mainnet.block-engine.jito.wtf/api/v1/bundles',    // 🇳🇱 Amsterdam
    'https://frankfurt.mainnet.block-engine.jito.wtf/api/v1/bundles',    // 🇩🇪 Frankfurt
    'https://london.mainnet.block-engine.jito.wtf/api/v1/bundles',       // 🇬🇧 London
    'https://tokyo.mainnet.block-engine.jito.wtf/api/v1/bundles',        // 🇯🇵 Tokyo
    'https://singapore.mainnet.block-engine.jito.wtf/api/v1/bundles',    // 🇸🇬 Singapore
    'https://dublin.mainnet.block-engine.jito.wtf/api/v1/bundles'        // 🇮🇪 Dublin
  ],
  devnet: [
    'https://ny.testnet.block-engine.jito.wtf/api/v1/bundles',
    'https://dallas.testnet.block-engine.jito.wtf/api/v1/bundles',
    'https://testnet.block-engine.jito.wtf/api/v1/bundles'
  ]
};

// Jito Bundle status endpoints
const JITO_BUNDLE_STATUS_URL = {
  mainnet: 'https://bundles.jito.wtf/api/v1/bundles',
  devnet: 'https://dallas.devnet.jito-labs.dev/api/v1/bundles'
};

// Get network from environment
const NETWORK = process.env.NETWORK === 'devnet' ? 'devnet' : 'mainnet';
let publicEndpointWarningLogged = false;
const REQUIRE_CUSTOM_JITO_ENDPOINTS = String(process.env.JITO_REQUIRE_CUSTOM_ENDPOINTS || 'false')
  .toLowerCase() === 'true';

const MAX_RATE_LIMIT_DELAY_MS = (() => {
  const raw = Number(process.env.JITO_MAX_RATE_LIMIT_DELAY_MS);
  if (Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  return 300000;
})();

const MAX_BACKEND_DELAY_MS = (() => {
  const raw = Number(process.env.JITO_MAX_BACKEND_DELAY_MS);
  if (Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  return 60000;
})();

const MAX_GENERIC_DELAY_MS = (() => {
  const raw = Number(process.env.JITO_MAX_GENERIC_DELAY_MS);
  if (Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  return 20000;
})();

const RATE_LIMIT_BASE_DELAY_MS = (() => {
  const raw = Number(process.env.JITO_RATE_LIMIT_BASE_DELAY_MS);
  if (Number.isFinite(raw) && raw > 0) {
    return Math.min(raw, MAX_RATE_LIMIT_DELAY_MS);
  }
  return 60000;
})();

const RATE_LIMIT_BACKOFF_FACTOR = (() => {
  const raw = Number(process.env.JITO_RATE_LIMIT_BACKOFF_FACTOR);
  if (Number.isFinite(raw) && raw >= 1) {
    return raw;
  }
  return 1.5;
})();

const MIN_RATE_LIMIT_DELAY_MS = (() => {
  const raw = Number(process.env.JITO_RATE_LIMIT_MIN_DELAY_MS);
  if (Number.isFinite(raw) && raw >= 0) {
    return raw;
  }
  return 1000;
})();

const GLOBAL_CUSTOM_ENDPOINTS = parseEndpointList(process.env.JITO_BLOCK_ENGINE_URLS || process.env.JITO_BUNDLE_URLS);
const NETWORK_SPECIFIC_ENDPOINTS = parseEndpointList(
  NETWORK === 'mainnet'
    ? (process.env.JITO_MAINNET_BLOCK_ENGINE_URLS || process.env.JITO_MAINNET_BUNDLE_URLS)
    : (process.env.JITO_DEVNET_BLOCK_ENGINE_URLS || process.env.JITO_DEVNET_BUNDLE_URLS)
);
const SKIP_PUBLIC_JITO_ENDPOINTS = String(
  process.env.JITO_SKIP_PUBLIC_ENDPOINTS ||
  process.env.JITO_DISABLE_PUBLIC_ENDPOINTS ||
  ''
).toLowerCase() === 'true';

const PUBLIC_ENDPOINTS = Array.isArray(JITO_BLOCK_ENGINE_URLS[NETWORK])
  ? JITO_BLOCK_ENGINE_URLS[NETWORK].map(normalizeEndpointUrl).filter(Boolean)
  : [];

const HAS_CUSTOM_JITO_ENDPOINTS = dedupePreserveOrder([
  ...NETWORK_SPECIFIC_ENDPOINTS,
  ...GLOBAL_CUSTOM_ENDPOINTS
]).length > 0;

const BLOCK_ENGINE_ENDPOINTS = (() => {
  const merged = dedupePreserveOrder([
    ...NETWORK_SPECIFIC_ENDPOINTS,
    ...GLOBAL_CUSTOM_ENDPOINTS,
    ...(SKIP_PUBLIC_JITO_ENDPOINTS ? [] : PUBLIC_ENDPOINTS)
  ]);

  if (!merged.length) {
    throw new Error(
      `[JITO] No block engine endpoints configured for network ${NETWORK}. ` +
      `Provide JITO_BLOCK_ENGINE_URLS or unset JITO_SKIP_PUBLIC_ENDPOINTS.`
    );
  }

  if (REQUIRE_CUSTOM_JITO_ENDPOINTS && !HAS_CUSTOM_JITO_ENDPOINTS) {
    throw new Error('[JITO] Custom block engine endpoints are required. Set JITO_BLOCK_ENGINE_URLS (or network-specific variants) to continue.');
  }

  if (!HAS_CUSTOM_JITO_ENDPOINTS && !publicEndpointWarningLogged) {
    console.warn('[JITO] Only public block engine endpoints configured. Provide private JITO_BLOCK_ENGINE_URLS to mitigate rate limiting.');
    publicEndpointWarningLogged = true;
  }

  return merged;
})();

const SHUFFLE_JITO_ENDPOINTS = String(process.env.JITO_SHUFFLE_ENDPOINTS || 'false').toLowerCase() === 'true';

const ENGINE_ALIAS_MAP = {
  jito: 'jito',
  direct: 'jito',
  official: 'jito',
  pump: 'pumpportal',
  portal: 'pumpportal',
  pumpportal: 'pumpportal',
  pump_portal: 'pumpportal',
  liljito: 'liljito',
  lil_jito: 'liljito',
  lil: 'liljito',
  lilengine: 'liljito'
};

function normalizeEngineKey(value) {
  if (!value) {
    return null;
  }
  const normalized = String(value).toLowerCase().trim();
  return ENGINE_ALIAS_MAP[normalized] || null;
}

function normalizeEngineList(input) {
  if (!input) {
    return [];
  }
  if (Array.isArray(input)) {
    return dedupePreserveOrder(
      input
        .map(normalizeEngineKey)
        .filter(Boolean)
    );
  }
  return dedupePreserveOrder(
    String(input)
      .split(',')
      .map(normalizeEngineKey)
      .filter(Boolean)
  );
}

const DEFAULT_BUNDLE_ENGINE_KEY = normalizeEngineKey(process.env.BUNDLE_ENGINE_DEFAULT || 'jito') || 'jito';
const ENV_FAILOVER_ORDER = normalizeEngineList(
  process.env.BUNDLE_ENGINE_ORDER ||
  process.env.BUNDLE_ENGINE_FAILOVER ||
  ''
);
// Note: liljito removed from default order as bundles.liljito.xyz is offline (Dec 2024)
const BASE_DEFAULT_ENGINE_ORDER = ENV_FAILOVER_ORDER.length
  ? ENV_FAILOVER_ORDER
  : dedupePreserveOrder([DEFAULT_BUNDLE_ENGINE_KEY, 'jito', 'pumpportal']);

const PUMPPORTAL_BUNDLE_ENDPOINTS = parseEndpointList(
  process.env.PUMPPORTAL_BUNDLE_ENDPOINTS ||
  process.env.PUMPPORTAL_BUNDLE_URLS ||
  process.env.PUMPPORTAL_BUNDLE_URL ||
  process.env.PUMPPORTAL_JITO_ENDPOINTS ||
  ''
);

const DEFAULT_ENGINE_ORDER = BASE_DEFAULT_ENGINE_ORDER.filter((engineKey) => {
  if (engineKey === 'pumpportal' && (!Array.isArray(PUMPPORTAL_BUNDLE_ENDPOINTS) || !PUMPPORTAL_BUNDLE_ENDPOINTS.length)) {
    return false;
  }
  return true;
});

function buildPumpPortalHeaders() {
  const headers = {};
  if (process.env.PUMPPORTAL_BUNDLE_API_KEY) {
    headers['x-api-key'] = process.env.PUMPPORTAL_BUNDLE_API_KEY.trim();
  }
  return headers;
}

const PUMPPORTAL_BUNDLE_HEADERS = buildPumpPortalHeaders();
const PUMPPORTAL_DRY_RUN =
  String(process.env.PUMPPORTAL_BUNDLE_DRY_RUN || '').toLowerCase() === 'true';

const LIL_JITO_BUNDLE_ENDPOINTS = parseEndpointList(
  process.env.LIL_JITO_BUNDLE_ENDPOINTS ||
  process.env.LILJITO_BUNDLE_ENDPOINTS ||
  'https://bundles.liljito.xyz/api/v1/bundles'
);

const BASE_JITO_HEADERS = buildJitoHeaders();
const HEADER_KEYS_FOR_LOG = Object.keys(BASE_JITO_HEADERS).filter(
  (key) => key && key.toLowerCase() !== 'content-type'
);

const TLS_CERT_PATH = process.env.JITO_TLS_CERT || process.env.JITO_BUNDLE_TLS_CERT;
const TLS_KEY_PATH = process.env.JITO_TLS_KEY || process.env.JITO_BUNDLE_TLS_KEY;
const TLS_CA_PATH = process.env.JITO_TLS_CA || process.env.JITO_BUNDLE_TLS_CA;
const TLS_PASSPHRASE = process.env.JITO_TLS_PASSPHRASE || process.env.JITO_BUNDLE_TLS_PASSPHRASE;

const JITO_HTTPS_AGENT = (() => {
  if (!TLS_CERT_PATH && !TLS_KEY_PATH && !TLS_CA_PATH) {
    return null;
  }

  try {
    const agentOptions = { keepAlive: true };
    if (TLS_KEY_PATH) {
      agentOptions.key = fs.readFileSync(TLS_KEY_PATH);
    }
    if (TLS_CERT_PATH) {
      agentOptions.cert = fs.readFileSync(TLS_CERT_PATH);
    }
    if (TLS_CA_PATH) {
      agentOptions.ca = fs.readFileSync(TLS_CA_PATH);
    }
    if (TLS_PASSPHRASE) {
      agentOptions.passphrase = TLS_PASSPHRASE;
    }
    return new https.Agent(agentOptions);
  } catch (error) {
    console.error(`[JITO] Failed to configure TLS client certificate: ${error.message}`);
    return null;
  }
})();

const ENGINE_REGISTRY = {
  jito: {
    key: 'jito',
    label: 'Direct Jito',
    description: 'Send bundles directly to configured Jito block-engine endpoints.',
    endpoints: BLOCK_ENGINE_ENDPOINTS,
    headers: BASE_JITO_HEADERS,
    httpsAgent: JITO_HTTPS_AGENT,
    shuffleEndpoints: SHUFFLE_JITO_ENDPOINTS,
    dryRunEnv: 'JITO_BUNDLE_DRY_RUN'
  },
  pumpportal: {
    key: 'pumpportal',
    label: 'PumpPortal Relay',
    description: 'Relay bundles via PumpPortal-managed block-engine endpoints.',
    endpoints: PUMPPORTAL_BUNDLE_ENDPOINTS,
    headers: {
      ...PUMPPORTAL_BUNDLE_HEADERS
    },
    shuffleEndpoints: true,
    dryRun: PUMPPORTAL_DRY_RUN
  },
  liljito: {
    key: 'liljito',
    label: 'Lil Jito Relay',
    description: 'Route bundles through Lil Jito community relays.',
    endpoints: LIL_JITO_BUNDLE_ENDPOINTS,
    headers: BASE_JITO_HEADERS,
    shuffleEndpoints: true,
    dryRunEnv: 'LIL_JITO_BUNDLE_DRY_RUN'
  }
};

function getEngineConfig(engineKey) {
  return engineKey && ENGINE_REGISTRY[engineKey] ? ENGINE_REGISTRY[engineKey] : null;
}

function listBundleEngines() {
  return Object.values(ENGINE_REGISTRY).map((engine) => ({
    key: engine.key,
    label: engine.label,
    description: engine.description,
    available: Array.isArray(engine.endpoints) && engine.endpoints.length > 0,
    endpointCount: Array.isArray(engine.endpoints) ? engine.endpoints.length : 0,
    default: engine.key === DEFAULT_BUNDLE_ENGINE_KEY
  }));
}

function deriveEngineOrderFromOptions(options = {}) {
  if (options.engineOrder) {
    const explicitOrder = normalizeEngineList(options.engineOrder);
    if (explicitOrder.length) {
      return explicitOrder;
    }
  }
  if (options.engine) {
    const single = normalizeEngineKey(options.engine);
    if (single) {
      return [single];
    }
  }
  if (Array.isArray(options.preferredEngines)) {
    const preferred = normalizeEngineList(options.preferredEngines);
    if (preferred.length) {
      return preferred;
    }
  }
  return DEFAULT_ENGINE_ORDER;
}

function buildEngineSubmissionOptions(engineKey, baseOptions = {}) {
  const normalizedKey = normalizeEngineKey(engineKey) || DEFAULT_BUNDLE_ENGINE_KEY;
  const engineConfig = getEngineConfig(normalizedKey);
  if (!engineConfig) {
    throw new Error(`Unknown bundle engine: ${engineKey}`);
  }

  const customEndpoints = Array.isArray(baseOptions.endpoints)
    ? baseOptions.endpoints.map(normalizeEndpointUrl).filter(Boolean)
    : null;

  const resolvedEndpoints = customEndpoints && customEndpoints.length
    ? customEndpoints
    : engineConfig.endpoints || [];

  const dryRunFromEnv = engineConfig.dryRunEnv
    ? String(process.env[engineConfig.dryRunEnv] || '').toLowerCase() === 'true'
    : false;

  return {
    ...baseOptions,
    engineKey: normalizedKey,
    engineLabel: engineConfig.label || normalizedKey,
    endpoints: resolvedEndpoints,
    headers: {
      ...(engineConfig.headers || {}),
      ...(baseOptions.headers || {})
    },
    httpsAgent: baseOptions.httpsAgent ?? engineConfig.httpsAgent ?? null,
    shuffleEndpoints: baseOptions.shuffleEndpoints ?? engineConfig.shuffleEndpoints ?? false,
    dryRun: typeof baseOptions.dryRun === 'boolean'
      ? baseOptions.dryRun
      : engineConfig.dryRun ?? dryRunFromEnv
  };
}

function serializeBundleTransactions(transactions) {
  if (!transactions || transactions.length === 0) {
    throw new Error('No transactions provided');
  }
  if (transactions.length > 5) {
    throw new Error('Bundles support maximum 5 transactions');
  }
  return transactions.map((tx) =>
    tx instanceof VersionedTransaction
      ? bs58.encode(tx.serialize())
      : bs58.encode(
          tx.serialize({
            requireAllSignatures: false,
            verifySignatures: false
          })
        )
  );
}

const DEFAULT_JITO_BUNDLE_RETRIES = (() => {
  const raw = Number(process.env.JITO_BUNDLE_RETRIES || process.env.JITO_BUNDLE_MAX_ATTEMPTS);
  if (Number.isFinite(raw) && raw >= 1) {
    return Math.min(Math.floor(raw), 12);
  }
  return 7;
})();

const JITO_BUNDLE_REQUEST_TIMEOUT_MS = (() => {
  const raw = Number(process.env.JITO_BUNDLE_TIMEOUT_MS || process.env.JITO_BUNDLE_REQUEST_TIMEOUT_MS);
  if (Number.isFinite(raw) && raw >= 1000) {
    return raw;
  }
  return 30000;
})();

const BACKOFF_JITTER_MIN = (() => {
  const raw = Number(process.env.JITO_BACKOFF_JITTER_MIN);
  if (Number.isFinite(raw) && raw >= 0 && raw <= 1) {
    return raw;
  }
  return 0.5;
})();

const BACKOFF_JITTER_MAX = (() => {
  const raw = Number(process.env.JITO_BACKOFF_JITTER_MAX);
  if (Number.isFinite(raw) && raw >= BACKOFF_JITTER_MIN && raw <= 2) {
    return raw;
  }
  return 1.0;
})();

if (process.env.JITO_LOG_CONFIG !== 'false') {
  if (HAS_CUSTOM_JITO_ENDPOINTS) {
    console.log(`[JITO] Custom block engine endpoints loaded (${BLOCK_ENGINE_ENDPOINTS.length}).`);
  } else {
    console.log('[JITO] Using default public Jito block engine endpoints.');
  }
  if (HEADER_KEYS_FOR_LOG.length > 0) {
    console.log(`[JITO] Additional Jito headers configured: ${HEADER_KEYS_FOR_LOG.join(', ')}`);
  }
  if (JITO_HTTPS_AGENT) {
    console.log('[JITO] mTLS configuration detected for Jito bundle submissions.');
  }
}

const STATUS_OVERRIDE =
  process.env[`JITO_${NETWORK.toUpperCase()}_STATUS_URL`] ||
  process.env.JITO_BUNDLE_STATUS_URL ||
  process.env.JITO_STATUS_URL;

if (STATUS_OVERRIDE) {
  const normalizedStatusUrl = normalizeEndpointUrl(STATUS_OVERRIDE);
  if (normalizedStatusUrl) {
    JITO_BUNDLE_STATUS_URL[NETWORK] = normalizedStatusUrl;
  }
}

function parseRetryAfter(headers = {}) {
  const headerValue = headers['retry-after'] || headers['Retry-After'];
  if (!headerValue) {
    return null;
  }

  const numeric = Number(headerValue);
  if (Number.isFinite(numeric) && numeric >= 0) {
    return numeric * 1000;
  }

  const parsedDate = Date.parse(headerValue);
  if (!Number.isNaN(parsedDate)) {
    const delta = parsedDate - Date.now();
    return delta > 0 ? delta : 0;
  }

  return null;
}

function classifyJitoError(error) {
  const status = error?.response?.status ?? null;
  const responseError = error?.response?.data?.error || {};
  const code = responseError?.code ?? null;
  const rawMessage =
    (typeof responseError?.message === 'string' && responseError.message) ||
    (typeof error?.message === 'string' && error.message) ||
    '';
  const message = rawMessage.toLowerCase();
  let retryAfterMs = parseRetryAfter(error?.response?.headers);
  const isNetworkError = Boolean(error?.request) && !error?.response;

  const responseRetryAfter =
    responseError?.retryAfterMs ??
    responseError?.retry_after_ms ??
    responseError?.retry_ms ??
    error?.response?.data?.retryAfterMs ??
    null;

  if (Number.isFinite(Number(responseRetryAfter)) && Number(responseRetryAfter) >= 0) {
    const numericValue = Number(responseRetryAfter);
    const normalizedRetryAfter =
      numericValue >= 1000 ? numericValue : numericValue * 1000;
    retryAfterMs = Math.max(retryAfterMs || 0, normalizedRetryAfter);
  }

  if (retryAfterMs != null) {
    retryAfterMs = Math.min(retryAfterMs, MAX_RATE_LIMIT_DELAY_MS);
  }

  const classification = {
    retry: true,
    category: 'generic',
    reason: rawMessage || null,
    status,
    code,
    retryAfterMs
  };

  if (status === 429 || message.includes('rate limit') || message.includes('too many requests')) {
    classification.category = 'rate_limit';
    return classification;
  }

  if (retryAfterMs !== null) {
    classification.category = 'rate_limit';
    return classification;
  }

  if (status && status >= 500) {
    classification.category = 'backend';
    return classification;
  }

  if (message.includes('temporarily unavailable') || message.includes('timeout')) {
    classification.category = 'backend';
    return classification;
  }

  if (
    code === -32007 ||
    code === -32009 ||
    message.includes('blockhash not found') ||
    message.includes('bundle already landed') ||
    message.includes('bundle dropped') ||
    message.includes('no available leader schedule')
  ) {
    classification.category = 'blockhash';
    return classification;
  }

  if (isNetworkError) {
    classification.category = 'network';
    return classification;
  }

  if (status && status >= 400 && status < 500) {
    classification.retry = false;
    classification.category = 'client';
    classification.reason = rawMessage || `HTTP ${status}`;
    return classification;
  }

  return classification;
}

function computeAdaptiveBackoffMs(classification, attempt) {
  if (!classification.retry) {
    return null;
  }

  if (classification.retryAfterMs != null) {
    return Math.min(classification.retryAfterMs, MAX_RATE_LIMIT_DELAY_MS);
  }

  const baseAttempt = Math.max(1, attempt);

  switch (classification.category) {
    case 'rate_limit': {
      const delay = RATE_LIMIT_BASE_DELAY_MS * Math.pow(RATE_LIMIT_BACKOFF_FACTOR, baseAttempt - 1);
      return Math.min(delay, MAX_RATE_LIMIT_DELAY_MS);
    }
    case 'backend': {
      const delay = 7000 * baseAttempt;
      return Math.min(delay, MAX_BACKEND_DELAY_MS);
    }
    case 'blockhash': {
      const delay = 2000 * baseAttempt;
      return Math.min(delay, 10000);
    }
    case 'network': {
      const delay = 5000 * baseAttempt;
      return Math.min(delay, MAX_BACKEND_DELAY_MS);
    }
    default: {
      const delay = 3000 * baseAttempt;
      return Math.min(delay, MAX_GENERIC_DELAY_MS);
    }
  }
}

function withJitter(delayMs) {
  if (!delayMs || delayMs <= 0) {
    return 0;
  }
  const jitterRange = Math.max(BACKOFF_JITTER_MAX - BACKOFF_JITTER_MIN, 0);
  const jitterFactor = jitterRange === 0
    ? BACKOFF_JITTER_MAX
    : BACKOFF_JITTER_MIN + Math.random() * jitterRange;
  return Math.round(delayMs * jitterFactor);
}

/**
 * Submit serialized bundle transactions to a block engine
 * @param {string[]} serializedTransactions
 * @param {object} submissionOptions
 * @returns {Promise<{bundleId: string, endpoint: string, attempts: number, simulated?: boolean}>}
 */
async function submitBundle(serializedTransactions, submissionOptions = {}) {
  const options = { ...submissionOptions };
  const engineKey = options.engineKey || 'jito';
  const engineLabel = options.engineLabel || engineKey;

  const maxAttemptsRaw = Number.isFinite(options.retries)
    ? options.retries
    : Number.isFinite(options.maxAttempts)
      ? options.maxAttempts
      : null;

  const maxAttempts = Math.max(
    1,
    Number.isFinite(maxAttemptsRaw) && maxAttemptsRaw > 0
      ? Math.floor(maxAttemptsRaw)
      : DEFAULT_JITO_BUNDLE_RETRIES
  );

  const providedEndpoints = Array.isArray(options.endpoints)
    ? options.endpoints.map(normalizeEndpointUrl).filter(Boolean)
    : [];

  if (!providedEndpoints.length) {
    throw new Error(`[BUNDLE] No endpoints configured for engine ${engineLabel}`);
  }

  const shouldShuffle =
    typeof options.shuffleEndpoints === 'boolean'
      ? options.shuffleEndpoints
      : SHUFFLE_JITO_ENDPOINTS;

  const endpointOrder =
    shouldShuffle && providedEndpoints.length > 1
      ? shuffleArray(providedEndpoints)
      : providedEndpoints.slice();

  const dryRunEnabled = options.dryRun === true;

  if (dryRunEnabled) {
    const simulatedId = `dryrun_${Date.now().toString(16)}`;
    console.log(`[BUNDLE][${engineLabel}] Dry-run mode enabled – skipping bundle submission.`);
    console.log(`[BUNDLE][${engineLabel}] Available endpoints: ${endpointOrder.join(', ')}`);
    return {
      bundleId: simulatedId,
      endpoint: endpointOrder[0],
      attempts: 0,
      simulated: true
    };
  }

  const bundleRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'sendBundle',
    params: [serializedTransactions]
  };

  const resolvedTimeout =
    Number.isFinite(options.timeoutMs) && options.timeoutMs >= 1000
      ? options.timeoutMs
      : JITO_BUNDLE_REQUEST_TIMEOUT_MS;

  const axiosConfig = {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    timeout: resolvedTimeout
  };

  if (options.httpsAgent) {
    axiosConfig.httpsAgent = options.httpsAgent;
  } else if (JITO_HTTPS_AGENT && engineKey === 'jito') {
    axiosConfig.httpsAgent = JITO_HTTPS_AGENT;
  }

  if (options.signal) {
    axiosConfig.signal = options.signal;
  }

  let lastError = null;
  let endpointIndex = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const endpoint = endpointOrder[endpointIndex] || endpointOrder[0];
    const attemptLabel = `attempt ${attempt}/${maxAttempts}`;

    console.log(
      `📦 [${engineLabel}] Creating bundle with ${serializedTransactions.length} transactions (${attemptLabel})...`
    );
    console.log(`📡 [${engineLabel}] Target endpoint: ${endpoint}`);
    console.log(
      `📦 [${engineLabel}] Bundle request: {"jsonrpc":"2.0","method":"sendBundle","params_count":${serializedTransactions.length}}`
    );

    try {
      const response = await axios.post(endpoint, bundleRequest, axiosConfig);
      console.log(`📥 [${engineLabel}] Response status: ${response.status}`);
      console.log(`📥 [${engineLabel}] Response data:`, JSON.stringify(response.data, null, 2));

      if (response.data?.error) {
        throw new Error(`Jito bundle error: ${JSON.stringify(response.data.error)}`);
      }

      const bundleId = response.data?.result;
      if (!bundleId) {
        throw new Error('Bundle submission succeeded but no result returned');
      }

      console.log(`✅ [${engineLabel}] Bundle submitted: ${bundleId}`);
      console.log(
        `[${engineLabel}] Bundle ${bundleId} accepted by ${endpoint} in ${attempt} attempt${attempt === 1 ? '' : 's'}.`
      );

      // Log simulation status if available in response (Jito sometimes returns it)
      if (response.data?.simulated) {
        console.log(`⚠️ [${engineLabel}] Warning: Jito response indicates simulation only.`);
      }

      return { bundleId, endpoint, attempts: attempt };
    } catch (error) {
      lastError = error;
      const classification = classifyJitoError(error);
      error.jitoClassification = classification;

      if (error.response) {
        console.error(`❌ [${engineLabel}] Bundle submission failed (HTTP ${error.response.status}):`, JSON.stringify(error.response.data, null, 2));
      } else if (error.request) {
        console.error(`❌ [${engineLabel}] Bundle submission failed: Network error (${error.message})`);
      } else {
        console.error(`❌ [${engineLabel}] Bundle submission failed:`, error.message);
      }

      const retryable = classification.retry && attempt < maxAttempts;
      if (!retryable) {
        break;
      }

      let waitMs =
        computeAdaptiveBackoffMs(classification, attempt) ??
        Number(classification.retryAfterMs) ??
        MIN_RATE_LIMIT_DELAY_MS;

      if (!Number.isFinite(waitMs) || waitMs <= 0) {
        waitMs = MIN_RATE_LIMIT_DELAY_MS;
      }

      waitMs = Math.max(waitMs, MIN_RATE_LIMIT_DELAY_MS);
      const waitWithJitter = withJitter(waitMs);

      if (endpointOrder.length > 1) {
        // Sticky Endpoint Logic:
        // If we hit a rate limit (429) on the primary whitelisted endpoint (NY), 
        // we should try to retry on it at least once before failing over, 
        // because failing over to non-whitelisted endpoints often results in dropped bundles.
        const isRateLimit = classification.category === 'rate_limit';
        const isPrimaryEndpoint = endpointIndex === 0; // Assuming 0 is the preferred/whitelisted one
        
        let shouldFailover = true;
        if (isRateLimit && isPrimaryEndpoint && attempt < 3) {
           console.log(`[${engineLabel}] Staying on primary endpoint (NY) despite rate limit (attempt ${attempt})...`);
           shouldFailover = false;
        }

        if (shouldFailover) {
          const previousEndpoint = endpoint;
          endpointIndex = (endpointIndex + 1) % endpointOrder.length;
          const nextEndpoint = endpointOrder[endpointIndex];
          if (nextEndpoint !== previousEndpoint) {
            console.log(`[${engineLabel}] Next retry endpoint: ${nextEndpoint}`);
          }
        }
      }

      const categoryLabel = classification.category?.toUpperCase() || 'RETRY';
      console.log(
        `⏳ [${engineLabel}] ${categoryLabel} backoff – waiting ${(waitWithJitter / 1000).toFixed(1)}s`
      );
      await new Promise((resolve) => setTimeout(resolve, waitWithJitter));
    }
  }

  const finalError = new Error(
    `Failed to send bundle via ${engineLabel} after ${maxAttempts} attempt(s): ${lastError?.message || 'unknown error'}`
  );
  finalError.cause = lastError;
  finalError.lastEndpoint = endpointOrder[endpointIndex] || endpointOrder[0];
  finalError.jitoClassification = lastError?.jitoClassification || null;
  finalError.attempts = maxAttempts;
  finalError.bundleEngine = engineKey;

  if (finalError.jitoClassification?.category === 'rate_limit' && engineKey === 'jito' && !HAS_CUSTOM_JITO_ENDPOINTS) {
    const guidance =
      ' Configure private Jito block engine endpoints via JITO_BLOCK_ENGINE_URLS to avoid public endpoint throttling.';
    finalError.message += guidance;
  }

  const failureCategory = finalError.jitoClassification?.category || 'unknown';
  if (failureCategory === 'rate_limit') {
    console.error(
      `[${engineLabel}] Exhausted ${maxAttempts} attempts due to rate limiting on ${finalError.lastEndpoint}.`
    );
  } else {
    console.error(
      `[${engineLabel}] Exhausted ${maxAttempts} attempts (${failureCategory}) on ${finalError.lastEndpoint}.`
    );
  }

  throw finalError;
}

/**
 * Send bundle across preferred engines with failover
 * @param {Transaction[]} transactions
 * @param {object|number} [optionsOrRetries]
 * @returns {Promise<object>}
 */
async function sendJitoBundle(transactions, optionsOrRetries = undefined) {
  const serializedTransactions = serializeBundleTransactions(transactions);

  let baseOptions = {};
  if (typeof optionsOrRetries === 'number') {
    baseOptions.retries = optionsOrRetries;
  } else if (optionsOrRetries && typeof optionsOrRetries === 'object' && !Array.isArray(optionsOrRetries)) {
    const looksLikeConnection =
      typeof optionsOrRetries.getLatestBlockhash === 'function' ||
      typeof optionsOrRetries.rpcEndpoint === 'string';
    if (looksLikeConnection) {
      console.warn('[BUNDLE] sendJitoBundle received a Connection instance as second argument. This is deprecated; pass an options object instead. Ignoring for backward compatibility.');
      baseOptions = {};
    } else {
      baseOptions = { ...optionsOrRetries };
    }
  }

  const engineOrder = deriveEngineOrderFromOptions(baseOptions);
  const failures = [];

  for (const engineKey of engineOrder) {
    const engineConfig = getEngineConfig(engineKey);
    if (!engineConfig || !Array.isArray(engineConfig.endpoints) || engineConfig.endpoints.length === 0) {
      failures.push(new Error(`Bundle engine ${engineKey} is not configured`));
      continue;
    }

    try {
      const submissionOptions = buildEngineSubmissionOptions(engineKey, baseOptions);
      const result = await submitBundle(serializedTransactions, submissionOptions);
      return {
        ...result,
        engine: engineKey
      };
    } catch (error) {
      error.bundleEngine = engineKey;
      failures.push(error);

      const failoverDisabled = baseOptions.disableFailover === true || baseOptions.failover === false;
      if (failoverDisabled) {
        throw error;
      }
    }
  }

  if (failures.length === 1) {
    throw failures[0];
  }

  const summary = failures
    .map((failure) => `[${failure.bundleEngine || 'unknown'}] ${failure.message}`)
    .join('; ');
  const aggregate = new Error(`All bundle engines failed: ${summary || 'no engines available'}`);
  aggregate.failures = failures;
  throw aggregate;
}

/**
 * Check Jito bundle status
 * @param {string} bundleId - Bundle ID from sendJitoBundle
 * @returns {Promise<object>} Bundle status
 */
async function getBundleStatus(bundleId) {
  try {
    if (!bundleId || typeof bundleId !== 'string') {
      return {
        bundleId: bundleId || 'unknown',
        status: 'invalid',
        error: 'Invalid bundle ID'
      };
    }
    
    const statusUrl = `${JITO_BUNDLE_STATUS_URL[NETWORK]}/${bundleId}`;
    
    const response = await axios.get(statusUrl, {
      timeout: 10000,
      validateStatus: (status) => status < 500 // Don't throw on 404, just return it
    });
    
    // If we get a successful response
    if (response.status === 200 && response.data) {
      return {
        bundleId,
        status: response.data.status || 'unknown',
        landedSlot: response.data.landedSlot || null,
        transactions: response.data.transactions || [],
        success: response.data.status === 'landed'
      };
    }
    
    // Handle 404 - bundle not indexed yet (this is normal)
    if (response.status === 404) {
      return {
        bundleId,
        status: 'not_found',
        error: 'Bundle not yet indexed in Jito API'
      };
    }
    
    return {
      bundleId,
      status: 'unknown',
      error: `Unexpected status: ${response.status}`
    };
  } catch (error) {
    // Only log non-404 errors to avoid spam
    if (error.response?.status !== 404) {
      console.error('Error getting bundle status:', error.message);
    }
    
    // Distinguish between different error types
    if (error.response) {
      // API returned error
      if (error.response.status === 404) {
        return {
          bundleId,
          status: 'not_found',
          error: 'Bundle not yet indexed in Jito API'
        };
      } else if (error.response.status >= 500) {
        return {
          bundleId,
          status: 'api_error',
          error: 'Jito API error',
          statusCode: error.response.status
        };
      }
    } else if (error.request) {
      // Network error
      return {
        bundleId,
        status: 'network_error',
        error: 'Cannot reach Jito API'
      };
    }
    
    return {
      bundleId,
      status: 'unknown',
      error: error.message || 'Unknown error'
    };
  }
}

/**
 * Wait for bundle confirmation
 * @param {string} bundleId - Bundle ID
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<object>} Confirmation result
 */
async function waitForBundleConfirmation(bundleId, timeout = 60000) {
  const startTime = Date.now();
  const pollInterval = 2000; // Check every 2 seconds
  const maxAttempts = Math.ceil(timeout / pollInterval);
  let attempts = 0;
  
  while (Date.now() - startTime < timeout && attempts < maxAttempts) {
    attempts++;
    const status = await getBundleStatus(bundleId);
    
    // Handle all bundle states
    if (status.status === 'landed') {
      console.log(`✅ Bundle landed in slot: ${status.landedSlot}`);
      return {
        success: true,
        status: 'landed',
        slot: status.landedSlot,
        transactions: status.transactions
      };
    }
    
    if (status.status === 'failed') {
      console.error('❌ Bundle failed');
      return {
        success: false,
        status: 'failed',
        error: status.error || 'Bundle execution failed'
      };
    }
    
    // Handle intermediate states
    if (status.status === 'pending' || status.status === 'processing') {
      console.log(`⏳ Bundle ${status.status}... (${attempts}/${maxAttempts})`);
      // Continue waiting
    } else if (status.status === 'not_found') {
      // Jito API is notoriously slow to index bundles - this is NORMAL
      // Don't spam logs, just show progress
      if (attempts % 5 === 0 || attempts <= 3) {
        console.log(`⏳ Bundle not yet visible in Jito API... (${attempts}/${maxAttempts})`);
      }
    } else if (status.status === 'network_error' || status.status === 'api_error') {
      console.warn(`⚠️ ${status.error}, retrying... (${attempts}/${maxAttempts})`);
      // Temporary error, continue waiting
    } else if (status.status === 'unknown') {
      console.warn(`⚠️ Unknown bundle status, continuing to wait... (${attempts}/${maxAttempts})`);
    }
    
    // Wait before next check
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  
  // IMPORTANT: Jito API timeout does NOT mean the bundle failed!
  // It often means the API indexer is slow. The RPC check is more reliable.
  console.warn(`⚠️ Jito API check timed out after ${attempts} attempts (this is common)`);
  return {
    success: false,
    status: 'timeout',
    error: `Bundle confirmation timeout after ${timeout/1000}s (Jito API may be slow)`
  };
}

/**
 * Execute atomic bundle (token creation + pool creation)
 * @param {Transaction[]} transactions - Array of transactions
 * @param {Connection} connection - Solana connection
 * @param {object} options - Execution options
 * @returns {Promise<object>} Execution result
 */
async function executeAtomicBundle(transactions, connection, options = {}) {
  try {
    const {
      waitForConfirmation = true,
      timeout = 60000,
      bundleOptions = {}
    } = options;

    const resolvedBundleOptions = {
      ...(Number.isFinite(options?.retries) ? { retries: options.retries } : {}),
      ...bundleOptions
    };
    
    // Send bundle
    const { bundleId, endpoint } = await sendJitoBundle(transactions, resolvedBundleOptions);
    
    if (waitForConfirmation) {
      // Wait for confirmation
      const result = await waitForBundleConfirmation(bundleId, timeout);
      
      return {
        bundleId,
        endpoint,
        ...result
      };
    }
    
    return {
      bundleId,
      endpoint,
      status: 'submitted'
    };
  } catch (error) {
    console.error('Error executing atomic bundle:', error);
    throw error;
  }
}

/**
 * Create bundle for token creation + liquidity pool
 * @param {Transaction} tokenCreationTx - Token creation transaction
 * @param {Transaction} poolCreationTx - Pool creation transaction
 * @param {Transaction} feeTx - Fee payment transaction (optional)
 * @returns {Transaction[]} Array of transactions for bundle
 */
function createTokenLiquidityBundle(tokenCreationTx, poolCreationTx, feeTx = null) {
  const bundle = [];
  
  // Add fee transaction first if provided
  if (feeTx) {
    bundle.push(feeTx);
  }
  
  // Add token creation
  bundle.push(tokenCreationTx);
  
  // Add pool creation
  bundle.push(poolCreationTx);
  
  if (bundle.length > 5) {
    throw new Error('Bundle exceeds 5 transaction limit');
  }
  
  return bundle;
}

/**
 * Get Jito tip account for priority inclusion
 * @returns {string} Tip account address
 */
function getJitoTipAccount() {
  // Official Jito Tip Accounts (https://jito-labs.gitbook.io/mev/searcher-resources/bundles/tip-accounts)
  const tipAccounts = [
    '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
    'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
    'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
    'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
    'DfXygSm4jCyNCybVYYK6DwvWqjKee8X7GQZX1Y244mc',
    '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
    'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
    'ADuUkR4vNXrGFvWeAByuEkeY64WGdcuUJaegRKe8fy65'
  ];
  
  // Randomly select a tip account to distribute load
  return tipAccounts[Math.floor(Math.random() * tipAccounts.length)];
}

/**
 * Check if Jito is available for current network
 * @returns {boolean} True if available
 */
function isJitoAvailable() {
  return NETWORK === 'mainnet' || NETWORK === 'devnet';
}

module.exports = {
  sendJitoBundle,
  getBundleStatus,
  waitForBundleConfirmation,
  executeAtomicBundle,
  createTokenLiquidityBundle,
  getJitoTipAccount,
  isJitoAvailable
};

