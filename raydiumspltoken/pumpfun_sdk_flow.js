const {
  ComputeBudgetProgram,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL
} = require('@solana/web3.js');

const DEFAULT_COMMITMENT = 'finalized';
const TIP_ACCOUNTS = [
  'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
  'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
  '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
  '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
  'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
  'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
  'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
  'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh'
].map((key) => new PublicKey(key));

const DEFAULT_COMPUTE_LIMIT = Number(process.env.PUMPFUN_SDK_COMPUTE_LIMIT) || 3_000_000;
const DEFAULT_COMPUTE_PRICE = Number(process.env.PUMPFUN_SDK_COMPUTE_PRICE_MICRO_LAMPORTS) || 250_000;
const DEFAULT_TIP_LAMPORTS = (() => {
  const raw = Number(process.env.PUMPFUN_SDK_TIP_SOL);
  if (Number.isFinite(raw) && raw > 0) {
    return Math.floor(raw * LAMPORTS_PER_SOL);
  }
  return Math.floor(0.0005 * LAMPORTS_PER_SOL);
})();
const DEFAULT_SLIPPAGE_BPS = (() => {
  const raw = Number(process.env.PUMPFUN_SDK_SLIPPAGE_PERCENT);
  if (Number.isFinite(raw) && raw > 0) {
    return BigInt(Math.max(1, Math.round(raw * 100)));
  }
  return 3000n; // 30%
})();

let cachedSdkArtifacts = null;

async function loadPumpFunArtifacts() {
  if (cachedSdkArtifacts) {
    return cachedSdkArtifacts;
  }
  const [{ PumpFunSDK }, { AnchorProvider }, nodeWalletModule] = await Promise.all([
    import('pumpdotfun-sdk'),
    import('@coral-xyz/anchor'),
    import('@coral-xyz/anchor/dist/cjs/nodewallet')
  ]);
  const NodeWallet = nodeWalletModule.default || nodeWalletModule.NodeWallet;
  if (!NodeWallet) {
    throw new Error('[PUMPFUN][SDK] Anchor NodeWallet implementation not found');
  }
  cachedSdkArtifacts = { PumpFunSDK, AnchorProvider, NodeWallet };
  return cachedSdkArtifacts;
}

function pickTipAccount() {
  return TIP_ACCOUNTS[Math.floor(Math.random() * TIP_ACCOUNTS.length)];
}

function buildPrefaceInstructions(payerPublicKey, options = {}) {
  const computeUnitLimit = Number.isFinite(options.computeUnitLimit)
    ? options.computeUnitLimit
    : DEFAULT_COMPUTE_LIMIT;
  const computeUnitPrice = Number.isFinite(options.computeUnitPriceMicroLamports)
    ? options.computeUnitPriceMicroLamports
    : DEFAULT_COMPUTE_PRICE;
  const tipLamports = Number.isFinite(options.tipLamports)
    ? options.tipLamports
    : DEFAULT_TIP_LAMPORTS;

  const instructions = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnitLimit }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: computeUnitPrice })
  ];

  if (tipLamports > 0) {
    instructions.push(
      SystemProgram.transfer({
        fromPubkey: payerPublicKey,
        toPubkey: pickTipAccount(),
        lamports: tipLamports
      })
    );
  }

  return instructions;
}

async function buildAndSendV0Transaction({
  connection,
  payer,
  instructions,
  extraSigners = [],
  lookupTables = [],
  commitment = DEFAULT_COMMITMENT
}) {
  if (!instructions || instructions.length === 0) {
    throw new Error('[PUMPFUN][SDK] No instructions provided for transaction');
  }

  const latestBlockhash = await connection.getLatestBlockhash({ commitment });
  const message = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: latestBlockhash.blockhash,
    instructions
  }).compileToV0Message(lookupTables);

  const transaction = new VersionedTransaction(message);
  transaction.sign([payer, ...extraSigners]);

  const signature = await connection.sendTransaction(transaction, { maxRetries: 5 });
  await connection.confirmTransaction(
    {
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
    },
    commitment
  );
  return signature;
}

async function getSdkClient(connection, payer) {
  const { PumpFunSDK, AnchorProvider, NodeWallet } = await loadPumpFunArtifacts();
  const provider = new AnchorProvider(
    connection,
    new NodeWallet(payer),
    AnchorProvider.defaultOptions?.() ?? { commitment: DEFAULT_COMMITMENT }
  );
  return new PumpFunSDK(provider);
}

async function extractInstructions(transaction) {
  if (!transaction) {
    return [];
  }
  if (Array.isArray(transaction.instructions)) {
    return transaction.instructions;
  }
  return [];
}

function toBigIntLamports(value) {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number') {
    return BigInt(Math.max(0, Math.floor(value)));
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return BigInt(Math.max(0, Math.floor(parsed)));
    }
  }
  throw new Error(`Invalid lamport amount: ${value}`);
}

function toBigIntSlippage(value) {
  if (typeof value === 'bigint') {
    return value;
  }
  if (!Number.isFinite(Number(value))) {
    return DEFAULT_SLIPPAGE_BPS;
  }
  const asNumber = Number(value);
  if (asNumber <= 0) {
    return DEFAULT_SLIPPAGE_BPS;
  }
  return BigInt(Math.max(1, Math.round(asNumber)));
}

async function executeLaunchWithSdk({
  connection,
  payer,
  metadataUri,
  name,
  symbol,
  initialBuyLamports = 0n,
  slippageBps = DEFAULT_SLIPPAGE_BPS,
  commitment = DEFAULT_COMMITMENT,
  computeUnitLimit,
  computeUnitPriceMicroLamports,
  tipLamports,
  lookupTables = [],
  mintKeypair: mintKeypairOverride = null
}) {
  if (!metadataUri) {
    throw new Error('[PUMPFUN][SDK] Metadata URI is required for SDK launch');
  }

  const sdk = await getSdkClient(connection, payer);
  const targetMint = mintKeypairOverride instanceof Keypair
    ? mintKeypairOverride
    : Keypair.generate();

  const createTx = await sdk.getCreateInstructions(
    payer.publicKey,
    name,
    symbol,
    metadataUri,
    targetMint
  );
  const createInstructions = await extractInstructions(createTx);

  const instructions = [
    ...buildPrefaceInstructions(payer.publicKey, {
      computeUnitLimit,
      computeUnitPriceMicroLamports,
      tipLamports
    }),
    ...createInstructions
  ];

  if (initialBuyLamports > 0n) {
    const buyTx = await sdk.getBuyInstructionsBySolAmount(
      payer.publicKey,
      targetMint.publicKey,
      toBigIntLamports(initialBuyLamports),
      toBigIntSlippage(slippageBps),
      commitment
    );
    instructions.push(...(await extractInstructions(buyTx)));
  }

  const signature = await buildAndSendV0Transaction({
    connection,
    payer,
    instructions,
    extraSigners: [targetMint],
    lookupTables,
    commitment
  });

  return {
    signature,
    mintPublicKey: targetMint.publicKey,
    metadataUri
  };
}

async function executeBuyWithSdk({
  connection,
  payer,
  mintAddress,
  lamports,
  slippageBps = DEFAULT_SLIPPAGE_BPS,
  commitment = DEFAULT_COMMITMENT,
  computeUnitLimit,
  computeUnitPriceMicroLamports,
  tipLamports,
  lookupTables = []
}) {
  const mint = typeof mintAddress === 'string' ? new PublicKey(mintAddress) : mintAddress;
  const sdk = await getSdkClient(connection, payer);
  const buyTx = await sdk.getBuyInstructionsBySolAmount(
    payer.publicKey,
    mint,
    toBigIntLamports(lamports),
    toBigIntSlippage(slippageBps),
    commitment
  );
  const instructions = [
    ...buildPrefaceInstructions(payer.publicKey, {
      computeUnitLimit,
      computeUnitPriceMicroLamports,
      tipLamports
    }),
    ...(await extractInstructions(buyTx))
  ];

  const signature = await buildAndSendV0Transaction({
    connection,
    payer,
    instructions,
    lookupTables,
    commitment
  });

  return signature;
}

async function executeSellWithSdk({
  connection,
  payer,
  mintAddress,
  rawTokenAmount,
  slippageBps = DEFAULT_SLIPPAGE_BPS,
  commitment = DEFAULT_COMMITMENT,
  computeUnitLimit,
  computeUnitPriceMicroLamports,
  tipLamports,
  lookupTables = []
}) {
  const mint = typeof mintAddress === 'string' ? new PublicKey(mintAddress) : mintAddress;
  const sdk = await getSdkClient(connection, payer);
  const sellTx = await sdk.getSellInstructionsByTokenAmount(
    payer.publicKey,
    mint,
    toBigIntLamports(rawTokenAmount),
    toBigIntSlippage(slippageBps),
    commitment
  );
  const instructions = [
    ...buildPrefaceInstructions(payer.publicKey, {
      computeUnitLimit,
      computeUnitPriceMicroLamports,
      tipLamports
    }),
    ...(await extractInstructions(sellTx))
  ];

  const signature = await buildAndSendV0Transaction({
    connection,
    payer,
    instructions,
    lookupTables,
    commitment
  });

  return signature;
}

module.exports = {
  executeLaunchWithSdk,
  executeBuyWithSdk,
  executeSellWithSdk,
  pickTipAccount,
  DEFAULT_SLIPPAGE_BPS,
  DEFAULT_TIP_LAMPORTS,
  DEFAULT_COMPUTE_LIMIT,
  DEFAULT_COMPUTE_PRICE
};

