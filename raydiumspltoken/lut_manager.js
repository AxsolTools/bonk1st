const fs = require('fs');
const path = require('path');
const {
  Connection,
  AddressLookupTableProgram,
  ComputeBudgetProgram,
  TransactionMessage,
  VersionedTransaction,
  PublicKey
} = require('@solana/web3.js');
const { getConnection } = require('./solana_utils');

const DATA_DIR = path.join(__dirname, '..', 'data');
const REGISTRY_PATH = path.join(DATA_DIR, 'lut_registry.json');

function ensureRegistryFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(REGISTRY_PATH)) {
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify({ tables: [] }, null, 2));
  }
}

async function readRegistry() {
  ensureRegistryFile();
  try {
    const raw = await fs.promises.readFile(REGISTRY_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.tables)) {
      return parsed;
    }
  } catch (error) {
    console.warn('[LUT] Failed to read registry:', error.message);
  }
  return { tables: [] };
}

async function writeRegistry(data) {
  ensureRegistryFile();
  await fs.promises.writeFile(REGISTRY_PATH, JSON.stringify(data, null, 2));
}

async function registerLookupTable(entry) {
  const registry = await readRegistry();
  registry.tables.push(entry);
  await writeRegistry(registry);
}

async function updateLookupTable(address, updates) {
  const registry = await readRegistry();
  const record = registry.tables.find((table) => table.address === address);
  if (record) {
    Object.assign(record, updates);
    await writeRegistry(registry);
  }
}

async function listLookupTables() {
  const registry = await readRegistry();
  return registry.tables.slice();
}

function buildBudgetInstructions(options = {}) {
  const unitLimit = Number.isFinite(options.computeUnitLimit)
    ? options.computeUnitLimit
    : 500_000;
  const unitPrice = Number.isFinite(options.computeUnitPriceMicroLamports)
    ? options.computeUnitPriceMicroLamports
    : 100_000;
  return [
    ComputeBudgetProgram.setComputeUnitLimit({ units: unitLimit }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: unitPrice })
  ];
}

async function sendTransaction({ connection, payer, instructions }) {
  if (!instructions.length) {
    throw new Error('No instructions for LUT transaction');
  }
  const latestBlockhash = await connection.getLatestBlockhash();
  const message = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: latestBlockhash.blockhash,
    instructions
  }).compileToV0Message();
  const transaction = new VersionedTransaction(message);
  transaction.sign([payer]);
  const signature = await connection.sendTransaction(transaction, { maxRetries: 5 });
  await connection.confirmTransaction(
    {
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
    },
    'confirmed'
  );
  return signature;
}

async function createLookupTable({ connection = getConnection(), payer, label = 'LUT', userId = null }) {
  const slot = await connection.getSlot('finalized');
  const [instruction, address] = AddressLookupTableProgram.createLookupTable({
    authority: payer.publicKey,
    payer: payer.publicKey,
    recentSlot: slot
  });
  const signature = await sendTransaction({
    connection,
    payer,
    instructions: [...buildBudgetInstructions(), instruction]
  });
  await registerLookupTable({
    address: address.toBase58(),
    label,
    createdAt: Date.now(),
    ownerWallet: payer.publicKey.toBase58(),
    userId,
    status: 'active',
    lastExtendedAt: null,
    addresses: []
  });
  return { address, signature };
}

async function extendLookupTable({
  connection = getConnection(),
  payer,
  lutAddress,
  addresses = []
}) {
  if (!Array.isArray(addresses) || !addresses.length) {
    throw new Error('No addresses provided for LUT extend');
  }

  const lutPubkey = typeof lutAddress === 'string' ? new PublicKey(lutAddress) : lutAddress;
  const sanitized = Array.from(
    new Set(
      addresses
        .map((addr) => {
          try {
            return new PublicKey(addr);
          } catch (_) {
            return null;
          }
        })
        .filter(Boolean)
        .map((pubkey) => pubkey.toBase58())
    )
  ).map((addr) => new PublicKey(addr));

  const chunkSize = 20;
  for (let i = 0; i < sanitized.length; i += chunkSize) {
    const chunk = sanitized.slice(i, i + chunkSize);
    const instruction = AddressLookupTableProgram.extendLookupTable({
      payer: payer.publicKey,
      authority: payer.publicKey,
      lookupTable: lutPubkey,
      addresses: chunk
    });
    await sendTransaction({
      connection,
      payer,
      instructions: [...buildBudgetInstructions({ computeUnitLimit: 400_000 }), instruction]
    });
  }

  await updateLookupTable(lutPubkey.toBase58(), {
    lastExtendedAt: Date.now(),
    addresses: sanitized.map((pubkey) => pubkey.toBase58())
  });
}

async function closeLookupTable({ connection = getConnection(), payer, lutAddress }) {
  const lutPubkey = typeof lutAddress === 'string' ? new PublicKey(lutAddress) : lutAddress;
  const instruction = AddressLookupTableProgram.closeLookupTable({
    payer: payer.publicKey,
    authority: payer.publicKey,
    lookupTable: lutPubkey,
    recipient: payer.publicKey
  });
  const signature = await sendTransaction({
    connection,
    payer,
    instructions: [...buildBudgetInstructions({ computeUnitLimit: 200_000 }), instruction]
  });
  await updateLookupTable(lutPubkey.toBase58(), { status: 'closed', closedAt: Date.now() });
  return signature;
}

module.exports = {
  createLookupTable,
  extendLookupTable,
  closeLookupTable,
  listLookupTables
};

