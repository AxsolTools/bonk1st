const { parentPort, workerData } = require('worker_threads');
const { Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');

const suffix = (typeof workerData?.suffix === 'string' && workerData.suffix.trim().length
  ? workerData.suffix.trim()
  : 'pump');
const progressInterval =
  typeof workerData?.progressInterval === 'number' && workerData.progressInterval > 0
    ? Math.floor(workerData.progressInterval)
    : 250000;

function matchesSuffix(address) {
  return address.endsWith(suffix);
}

function reportProgress(attempts, startTime) {
  if (!parentPort || progressInterval <= 0) {
    return;
  }
  if (attempts % progressInterval === 0) {
    parentPort.postMessage({
      type: 'progress',
      attempts,
      elapsedMs: Date.now() - startTime
    });
  }
}

function generateVanityWallet() {
  const startTime = Date.now();
  let attempts = 0;
  const suffixLen = suffix.length;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempts += 1;
    const keypair = Keypair.generate();
    const publicKey = keypair.publicKey.toBase58();
    // Optimized: check last N characters directly (faster than endsWith for short suffixes)
    // Case-sensitive match as Solana addresses are case-sensitive
    if (publicKey.slice(-suffixLen) === suffix) {
      return {
        publicKey,
        secretKey: bs58.encode(keypair.secretKey),
        attempts,
        elapsedMs: Date.now() - startTime
      };
    }
    // Only report progress every N attempts to reduce overhead
    if (attempts % progressInterval === 0) {
      reportProgress(attempts, startTime);
    }
  }
}

const result = generateVanityWallet();
if (parentPort) {
  parentPort.postMessage({ type: 'result', payload: result });
}

