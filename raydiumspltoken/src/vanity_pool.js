const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');
const os = require('os');

const DATA_DIR = path.join(__dirname, '..', 'data');
const POOL_PATH = path.join(DATA_DIR, 'vanity_pool.json');
const WORKER_PATH = path.join(__dirname, 'vanity_worker.js');
const DEFAULT_VANITY_SUFFIX = (
  process.env.VANITY_SUFFIX && process.env.VANITY_SUFFIX.trim().length
    ? process.env.VANITY_SUFFIX.trim()
    : 'pump'
);
const DEFAULT_PROGRESS_INTERVAL = parseInt(
  process.env.VANITY_PROGRESS_INTERVAL || '250000',
  10
);

function createAbortError() {
  const error = new Error('Vanity generation aborted');
  error.name = 'AbortError';
  return error;
}

function ensurePoolFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(POOL_PATH)) {
    fs.writeFileSync(POOL_PATH, JSON.stringify({ wallets: [] }, null, 2));
  }
}

async function readPool() {
  ensurePoolFile();
  try {
    const raw = await fs.promises.readFile(POOL_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.wallets)) {
      return parsed;
    }
  } catch (error) {
    console.warn('[VANITY_POOL] Failed to read pool file:', error.message);
  }
  return { wallets: [] };
}

async function writePool(data) {
  ensurePoolFile();
  await fs.promises.writeFile(POOL_PATH, JSON.stringify(data, null, 2));
}

function runVanityWorker(suffix = DEFAULT_VANITY_SUFFIX, options = {}) {
  const {
    signal = null,
    onProgress = null,
    progressInterval = DEFAULT_PROGRESS_INTERVAL
  } = options;

  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_PATH, {
      workerData: { suffix, progressInterval }
    });
    const startedAt = Date.now();
    let settled = false;
    let abortHandler = null;

    const cleanup = () => {
      worker.removeListener('message', handleMessage);
      worker.removeListener('error', handleError);
      worker.removeListener('exit', handleExit);
      if (signal && abortHandler) {
        signal.removeEventListener('abort', abortHandler);
      }
    };

    const handleMessage = (message) => {
      if (message && message.type === 'progress') {
        if (typeof onProgress === 'function') {
          onProgress({
            workerId: worker.threadId,
            suffix,
            attempts: message.attempts,
            elapsedMs: message.elapsedMs ?? Date.now() - startedAt
          });
        }
        return;
      }

      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      const payload =
        message && message.type === 'result' && message.payload
          ? message.payload
          : message;
      resolve(payload);
    };

    const handleError = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error);
    };

    const handleExit = (code) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      if (code !== 0) {
        reject(new Error(`Vanity worker exited with code ${code}`));
      } else {
        reject(new Error('Vanity worker exited before returning a wallet'));
      }
    };

    worker.on('message', handleMessage);
    worker.once('error', handleError);
    worker.once('exit', handleExit);

    if (signal) {
      abortHandler = () => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        const abortError = createAbortError();
        worker
          .terminate()
          .catch(() => {})
          .finally(() => reject(abortError));
      };
      if (signal.aborted) {
        abortHandler();
        return;
      }
      signal.addEventListener('abort', abortHandler, { once: true });
    }
  });
}

async function generateVanityWallets({
  count = 1,
  suffix = DEFAULT_VANITY_SUFFIX,
  signal = null,
  onProgress = null,
  progressInterval = DEFAULT_PROGRESS_INTERVAL
} = {}) {
  const normalizedSuffix =
    typeof suffix === 'string' && suffix.trim().length ? suffix.trim() : DEFAULT_VANITY_SUFFIX;
  const generated = [];
  const maxParallel = Math.max(1, Math.min(os.cpus().length || 1, count));
  let remaining = count;

  while (remaining > 0) {
    const batchSize = Math.min(maxParallel, remaining);
    const batchPromises = Array.from({ length: batchSize }, () =>
      runVanityWorker(normalizedSuffix, { signal, onProgress, progressInterval })
    );
    // eslint-disable-next-line no-await-in-loop
    const batchResults = await Promise.all(batchPromises);
    const decorated = batchResults.map((wallet = {}) => {
      const { attempts, elapsedMs, ...rest } = wallet;
      return {
        ...rest,
        suffix: normalizedSuffix,
        createdAt: Date.now(),
        status: 'available',
        reservedBy: null,
        reservedAt: null,
        note: null
      };
    });
    generated.push(...decorated);
    remaining -= batchSize;
  }

  const pool = await readPool();
  pool.wallets.push(...generated);
  await writePool(pool);
  return generated;
}

async function getVanityPoolStats() {
  const pool = await readPool();
  const stats = {
    available: 0,
    reserved: 0,
    used: 0,
    total: pool.wallets.length
  };
  pool.wallets.forEach((entry) => {
    if (entry.status === 'used') {
      stats.used += 1;
    } else if (entry.status === 'reserved') {
      stats.reserved += 1;
    } else {
      stats.available += 1;
    }
  });
  return stats;
}

async function getAvailableVanityWallets(limit = 5) {
  const pool = await readPool();
  return pool.wallets
    .filter((entry) => entry.status === 'available')
    .slice(0, limit);
}

async function ensureVanityCapacity(target = 5, options = {}) {
  const stats = await getVanityPoolStats();
  const deficit = target - stats.available;
  if (deficit > 0) {
    const threadCount = Math.max(1, Math.min(os.cpus().length || 1, deficit));
    const batches = Array.from({ length: deficit });
    const normalizedSuffix =
      typeof options.suffix === 'string' && options.suffix.trim().length
        ? options.suffix.trim()
        : DEFAULT_VANITY_SUFFIX;
    for (let i = 0; i < batches.length; i += threadCount) {
      const slice = batches.slice(i, i + threadCount);
      const results = await Promise.all(
        slice.map(() => runVanityWorker(normalizedSuffix))
      );
      const decorated = results.map((wallet) => ({
        ...wallet,
        suffix: normalizedSuffix,
        createdAt: Date.now(),
        status: 'available',
        reservedBy: null,
        reservedAt: null,
        note: null
      }));
      const pool = await readPool();
      pool.wallets.push(...decorated);
      await writePool(pool);
    }
  }
}

function matchesDefaultSuffix(wallet) {
  if (!wallet?.publicKey) {
    return false;
  }
  if (wallet.suffix) {
    return wallet.suffix === DEFAULT_VANITY_SUFFIX;
  }
  return wallet.publicKey.endsWith(DEFAULT_VANITY_SUFFIX);
}

async function reserveVanityWallet(userId, note = null) {
  const pool = await readPool();
  const entry = pool.wallets.find(
    (wallet) => wallet.status === 'available' && matchesDefaultSuffix(wallet)
  );
  if (!entry) {
    return null;
  }
  const now = Date.now();
  entry.status = 'reserved';
  entry.reservedBy = userId || null;
  entry.reservedAt = now;
  entry.ownerUserId = userId || null;
  entry.note = note || entry.note || null;
  entry.allocatedAt = now;
  await writePool(pool);
  return entry;
}

async function releaseVanityWallet(publicKey, options = {}) {
  const { allowReuse = false } = options;
  const pool = await readPool();
  const entry = pool.wallets.find((wallet) => wallet.publicKey === publicKey);
  if (!entry || entry.status === 'available') {
    return false;
  }
  if (allowReuse) {
    entry.status = 'available';
    entry.reservedBy = null;
    entry.reservedAt = null;
    entry.ownerUserId = null;
    entry.allocatedAt = null;
    entry.note = null;
  } else {
    entry.status = 'released';
    entry.releasedAt = Date.now();
  }
  await writePool(pool);
  return true;
}

async function releaseVanityWalletsForUser(userId) {
  const pool = await readPool();
  let released = 0;
  pool.wallets.forEach((wallet) => {
    if (wallet.reservedBy === userId && wallet.status === 'reserved') {
      wallet.status = 'released';
      wallet.releasedAt = Date.now();
      released += 1;
    }
  });
  if (released > 0) {
    await writePool(pool);
  }
  return released;
}

async function markVanityWalletUsed(publicKey) {
  const pool = await readPool();
  const entry = pool.wallets.find((wallet) => wallet.publicKey === publicKey);
  if (!entry) {
    return false;
  }
  entry.status = 'used';
  entry.usedAt = Date.now();
  await writePool(pool);
  return true;
}

module.exports = {
  generateVanityWallets,
  getVanityPoolStats,
  getAvailableVanityWallets,
  ensureVanityCapacity,
  reserveVanityWallet,
  releaseVanityWallet,
  releaseVanityWalletsForUser,
  markVanityWalletUsed
};

