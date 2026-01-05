import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { IStorage, StoredWallet } from './storage';
import { 
  User, InsertUser, 
  LockedToken, InsertLockedToken, 
  Transaction, InsertTransaction,
  PlatformStats, SystemConfig, InsertSystemConfig
} from './shared/schema.js';

// Encryption utilities for storing user private keys
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.WALLET_ENCRYPTION_KEY;
  if (!key) {
    // Generate a warning but use a default key for development
    console.warn('[SECURITY WARNING] WALLET_ENCRYPTION_KEY not set. Using default key - DO NOT USE IN PRODUCTION!');
    return crypto.scryptSync('default-dev-key-do-not-use', 'salt', 32);
  }
  // If key is hex, decode it; otherwise hash it
  if (/^[0-9a-fA-F]{64}$/.test(key)) {
    return Buffer.from(key, 'hex');
  }
  return crypto.scryptSync(key, 'locked-wallet-salt', 32);
}

function encryptPrivateKey(privateKey: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  
  let encrypted = cipher.update(privateKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  // Return iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

function decryptPrivateKey(encryptedData: string): string {
  const key = getEncryptionKey();
  const parts = encryptedData.split(':');
  
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }
  
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];
  
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

// Export encryption functions for use in other modules
export { encryptPrivateKey, decryptPrivateKey };

interface DepositRecord {
  signature: string;
  walletAddress: string;
  amount: number;
  timestamp: string;
  status: string;
}

interface WithdrawalRecord {
  signature: string;
  walletAddress: string;
  amount: number;
  timestamp: string;
  status: string;
}

interface StoredWalletData {
  walletAddress: string;
  encryptedPrivateKey: string;
  createdAt: string;
  lastUsed?: string;
}

interface StorageData {
  users: User[];
  lockedTokens: LockedToken[];
  transactions: Transaction[];
  platformStats: PlatformStats | null;
  systemConfig: SystemConfig | null;
  balances: { [walletAddress: string]: number };
  deposits: DepositRecord[];
  withdrawals: WithdrawalRecord[];
  userWallets: StoredWalletData[];
  lastId: {
    users: number;
    lockedTokens: number;
    transactions: number;
  }
}

export class FileStorage implements IStorage {
  private dataFilePath: string;
  private data!: StorageData; // Use definite assignment assertion

  constructor(storageDir = './data') {
    // Ensure the data directory exists
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }

    this.dataFilePath = path.join(storageDir, 'locked_data.json');
    
    // Initialize or load storage
    if (fs.existsSync(this.dataFilePath)) {
      try {
        const fileData = fs.readFileSync(this.dataFilePath, 'utf8');
        this.data = JSON.parse(fileData);
      } catch (error) {
        console.error('Error reading storage file:', error);
        this.initializeDefaultData();
      }
    } else {
      this.initializeDefaultData();
    }
  }

  private initializeDefaultData() {
    this.data = {
      users: [],
      lockedTokens: [],
      transactions: [],
      platformStats: {
        id: 1,
        totalLockedTokens: "0",
        activeLockers: 0,
        avgLockDuration: 0,
        tokensReleased: "0",
        totalFeeCollected: "0",
        updatedAt: new Date()
      },
      systemConfig: {
        id: 1,
        feeWalletAddress: process.env.FEE_WALLET_ADDRESS || "",
        feeAmount: "25",
        minLockDuration: 1,
        maxLockDuration: 3650,
        hookVersion: "solana_locker_v1",
        hookNamespace: "locked_token_locker",
        adminEmail: null,
        maintenanceMode: false,
        lastUpdated: new Date(),
        updatedBy: null,
        additionalSettings: {},
        diceGameConfig: {
          enabled: process.env.DICE_ENABLED !== 'false',
          houseWalletAddress: process.env.HOUSE_WALLET_ADDRESS || "",
          maxBetAmount: process.env.MAX_BET_AMOUNT || "10000",
          minBetAmount: process.env.MIN_BET_AMOUNT || "1",
          houseEdge: parseFloat(process.env.HOUSE_EDGE || "1.5"),
          bankrollAmount: "100000",
          payoutEnabled: true,
          decimalPlaces: 2,
          maxProfit: process.env.MAX_PROFIT || "5000",
          hotWalletThreshold: "10000",
          lastUpdated: new Date()
        }
      },
      balances: {},
      deposits: [],
      withdrawals: [],
      userWallets: [],
      lastId: {
        users: 0,
        lockedTokens: 0,
        transactions: 0
      }
    };
    this.saveData();
  }

  private saveData() {
    try {
      // Log the data before saving for debugging
      console.log('Saving data to file:', JSON.stringify(this.data.systemConfig, null, 2));
      
      fs.writeFileSync(
        this.dataFilePath, 
        JSON.stringify(this.data, (key, value) => {
          // Convert Date objects to ISO strings for storage
          if (value instanceof Date) {
            return value.toISOString();
          }
          return value;
        }, 2)
      );
      console.log('Data saved successfully to:', this.dataFilePath);
    } catch (error) {
      console.error('Error saving storage file:', error);
    }
  }

  // User operations
  async getUser(id: number): Promise<User | undefined> {
    const user = this.data.users.find(u => u.id === id);
    return user;
  }

  async getUserByWalletAddress(walletAddress: string): Promise<User | undefined> {
    const user = this.data.users.find(u => u.walletAddress === walletAddress);
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const id = ++this.data.lastId.users;
    const newUser: User = {
      id,
      walletAddress: user.walletAddress,
      email: user.email ?? null,
      username: user.username || null,
      isAdmin: user.isAdmin || false,
      createdAt: new Date(),
      lastLogin: user.lastLogin || new Date()
    };

    this.data.users.push(newUser);
    this.saveData();
    return newUser;
  }

  async updateUser(id: number, data: Partial<InsertUser>): Promise<User | undefined> {
    const userIndex = this.data.users.findIndex(u => u.id === id);
    if (userIndex === -1) return undefined;

    const updatedUser = { ...this.data.users[userIndex], ...data };
    this.data.users[userIndex] = updatedUser;
    this.saveData();
    return updatedUser;
  }

  async getAllUsers(): Promise<User[]> {
    return this.data.users;
  }

  // Locked tokens operations
  async getLockedToken(id: number): Promise<LockedToken | undefined> {
    const token = this.data.lockedTokens.find(t => t.id === id);
    return token;
  }

  async getLockedTokensByUserId(userId: number): Promise<LockedToken[]> {
    return this.data.lockedTokens.filter(t => t.userId === userId);
  }

  async getAllLockedTokens(): Promise<LockedToken[]> {
    return this.data.lockedTokens;
  }

  async createLockedToken(token: InsertLockedToken): Promise<LockedToken> {
    const id = ++this.data.lastId.lockedTokens;
    const newToken: LockedToken = {
      id,
      userId: token.userId,
      tokenSymbol: token.tokenSymbol,
      tokenName: token.tokenName || token.tokenSymbol,
      issuer: token.issuer || "",
      amount: token.amount,
      lockDate: new Date(),
      lockDuration: token.lockDuration,
      releaseDate: token.releaseDate || new Date(),
      releaseCondition: token.releaseCondition || "time-based",
      releaseConditionData: token.releaseConditionData || null,
      transactionHash: token.transactionHash || null,
      status: token.status,
      feeAmount: token.feeAmount || "25",
      feePaid: token.feePaid || false
    };

    this.data.lockedTokens.push(newToken);
    this.saveData();
    return newToken;
  }

  async updateLockedToken(id: number, data: Partial<InsertLockedToken>): Promise<LockedToken | undefined> {
    const tokenIndex = this.data.lockedTokens.findIndex(t => t.id === id);
    if (tokenIndex === -1) return undefined;

    const updatedToken = { ...this.data.lockedTokens[tokenIndex], ...data };
    this.data.lockedTokens[tokenIndex] = updatedToken;
    this.saveData();
    return updatedToken;
  }

  // Transaction operations
  async getTransaction(id: number): Promise<Transaction | undefined> {
    const transaction = this.data.transactions.find(t => t.id === id);
    return transaction;
  }

  async getTransactionsByUserId(userId: number): Promise<Transaction[]> {
    return this.data.transactions.filter(t => t.userId === userId);
  }

  async getRecentTransactions(limit = 10): Promise<Transaction[]> {
    // Get the most recent transactions
    const transactions = this.data.transactions
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
      
    // Enhance transactions with user wallet addresses
    for (const tx of transactions) {
      if (!tx.details) tx.details = {};
      
      // If we don't already have the user address in the details, add it
      if (!tx.details.userAddress) {
        try {
          const user = await this.getUser(tx.userId);
          if (user) {
            tx.details.userAddress = user.walletAddress;
          }
        } catch (error) {
          console.error(`Error getting user wallet address for transaction ${tx.id}:`, error);
        }
      }
    }
    
    return transactions;
  }

  async getAllTransactions(): Promise<Transaction[]> {
    return this.data.transactions;
  }

  async createTransaction(insertTransaction: InsertTransaction): Promise<Transaction> {
    const id = ++this.data.lastId.transactions;
    
    // Get the user to store their wallet address
    let userWalletAddress: string | undefined;
    try {
      const user = await this.getUser(insertTransaction.userId);
      if (user) {
        userWalletAddress = user.walletAddress;
      }
    } catch (error) {
      console.error(`Error getting user wallet address for transaction:`, error);
    }
    
    // Ensure details exists
    const details = insertTransaction.details || {};
    
    // Add wallet address to details
    if (userWalletAddress) {
      details.userAddress = userWalletAddress;
    }
    
    const transaction: Transaction = {
      ...insertTransaction,
      id,
      timestamp: new Date(),
      transactionHash: insertTransaction.transactionHash || null,
      details: details
    };
    
    this.data.transactions.push(transaction);
    
    // Save changes to file
    await this.saveData();
    
    return transaction;
  }

  async updateTransaction(id: number, data: Partial<InsertTransaction>): Promise<Transaction | undefined> {
    const transactionIndex = this.data.transactions.findIndex(t => t.id === id);
    if (transactionIndex === -1) return undefined;

    const updatedTransaction = { ...this.data.transactions[transactionIndex], ...data };
    this.data.transactions[transactionIndex] = updatedTransaction;
    this.saveData();
    return updatedTransaction;
  }

  // Platform stats operations
  async getPlatformStats(): Promise<PlatformStats | undefined> {
    return this.data.platformStats || undefined;
  }

  async updatePlatformStats(data: Partial<PlatformStats>): Promise<PlatformStats | undefined> {
    if (!this.data.platformStats) return undefined;

    this.data.platformStats = {
      ...this.data.platformStats,
      ...data,
      updatedAt: new Date()
    };
    this.saveData();
    return this.data.platformStats;
  }

  // System config operations
  async getSystemConfig(): Promise<SystemConfig | undefined> {
    return this.data.systemConfig || undefined;
  }

  async updateSystemConfig(data: Partial<InsertSystemConfig>): Promise<SystemConfig | undefined> {
    if (!this.data.systemConfig) return undefined;
    
    // Handle the special case for dice game config
    if (data.diceGameConfig && this.data.systemConfig.diceGameConfig) {
      // Merge the existing dice game config with the new data
      this.data.systemConfig.diceGameConfig = {
        ...this.data.systemConfig.diceGameConfig,
        ...data.diceGameConfig,
        lastUpdated: new Date()
      };
      
      // Remove diceGameConfig from data to avoid double-processing
      const { diceGameConfig, ...restData } = data;
      
      // Update the rest of the system config
      this.data.systemConfig = {
        ...this.data.systemConfig,
        ...restData,
        lastUpdated: new Date()
      };
    } else {
      // Regular update without special dice game handling
      this.data.systemConfig = {
        ...this.data.systemConfig,
        ...data,
        lastUpdated: new Date()
      };
    }
    
    this.saveData();
    return this.data.systemConfig;
  }

  async initializeSystemConfig(config: InsertSystemConfig): Promise<SystemConfig> {
    const newConfig: SystemConfig = {
      id: 1,
      feeWalletAddress: config.feeWalletAddress,
      feeAmount: config.feeAmount || "0",
      minLockDuration: config.minLockDuration || 1,
      maxLockDuration: config.maxLockDuration || 3650,
      hookVersion: config.hookVersion || "solana_locker_v1",
      hookNamespace: config.hookNamespace || "locked_token_locker",
      adminEmail: config.adminEmail || null,
      maintenanceMode: config.maintenanceMode || false,
      lastUpdated: new Date(),
      updatedBy: config.updatedBy || null,
      additionalSettings: config.additionalSettings || {},
      diceGameConfig: config.diceGameConfig ? {
        enabled: config.diceGameConfig.enabled ?? (process.env.DICE_ENABLED !== 'false'),
        houseWalletAddress: config.diceGameConfig.houseWalletAddress ?? (process.env.HOUSE_WALLET_ADDRESS || ""),
        maxBetAmount: config.diceGameConfig.maxBetAmount ?? (process.env.MAX_BET_AMOUNT || "10000"),
        minBetAmount: config.diceGameConfig.minBetAmount ?? (process.env.MIN_BET_AMOUNT || "1"),
        houseEdge: config.diceGameConfig.houseEdge ?? parseFloat(process.env.HOUSE_EDGE || "1.5"),
        bankrollAmount: config.diceGameConfig.bankrollAmount ?? "100000",
        payoutEnabled: config.diceGameConfig.payoutEnabled ?? true,
        decimalPlaces: config.diceGameConfig.decimalPlaces ?? 2,
        maxProfit: config.diceGameConfig.maxProfit ?? (process.env.MAX_PROFIT || "5000"),
        hotWalletThreshold: config.diceGameConfig.hotWalletThreshold ?? "10000",
        lastUpdated: new Date()
      } : {
        enabled: process.env.DICE_ENABLED !== 'false',
        houseWalletAddress: process.env.HOUSE_WALLET_ADDRESS || "",
        maxBetAmount: process.env.MAX_BET_AMOUNT || "10000",
        minBetAmount: process.env.MIN_BET_AMOUNT || "1",
        houseEdge: parseFloat(process.env.HOUSE_EDGE || "1.5"),
        bankrollAmount: "100000",
        payoutEnabled: true,
        decimalPlaces: 2,
        maxProfit: process.env.MAX_PROFIT || "5000",
        hotWalletThreshold: "10000",
        lastUpdated: new Date()
      }
    };
    
    this.data.systemConfig = newConfig;
    this.saveData();
    return newConfig;
  }

  // Ensures dice game configuration exists
  async ensureDiceGameConfig(): Promise<boolean> {
    if (!this.data.systemConfig) {
      // Initialize system config with default values
      await this.initializeDefaultData();
      this.saveData();
      return true;
    }
    
    if (!this.data.systemConfig.diceGameConfig) {
      // Add dice game config to existing system config
      this.data.systemConfig.diceGameConfig = {
        enabled: process.env.DICE_ENABLED !== 'false',
        houseWalletAddress: process.env.HOUSE_WALLET_ADDRESS || "",
        maxBetAmount: process.env.MAX_BET_AMOUNT || "10000",
        minBetAmount: process.env.MIN_BET_AMOUNT || "1",
        houseEdge: parseFloat(process.env.HOUSE_EDGE || "1.5"),
        bankrollAmount: "100000",
        payoutEnabled: true,
        decimalPlaces: 2,
        maxProfit: process.env.MAX_PROFIT || "5000",
        hotWalletThreshold: "10000",
        lastUpdated: new Date()
      };
      
      this.saveData();
      return true;
    }
    
    return true;
  }
  
  // Repairs missing or corrupt dice game configuration fields
  async repairDiceGameConfig(): Promise<boolean> {
    if (!this.data.systemConfig || !this.data.systemConfig.diceGameConfig) {
      await this.ensureDiceGameConfig();
      return true;
    }
    
    const diceConfig = this.data.systemConfig.diceGameConfig;
    let needsRepair = false;
    
    // Check each required field and set default if missing
    if (diceConfig.enabled === undefined || diceConfig.enabled === null) {
      diceConfig.enabled = true;
      needsRepair = true;
    }
    
    if (!diceConfig.houseWalletAddress) {
      diceConfig.houseWalletAddress = process.env.HOUSE_WALLET_ADDRESS || "";
      needsRepair = true;
    }
    
    if (!diceConfig.maxBetAmount) {
      diceConfig.maxBetAmount = "10000";
      needsRepair = true;
    }
    
    if (!diceConfig.minBetAmount) {
      diceConfig.minBetAmount = "1";
      needsRepair = true;
    }
    
    if (diceConfig.houseEdge === undefined || diceConfig.houseEdge === null) {
      diceConfig.houseEdge = 1.5;
      needsRepair = true;
    }
    
    if (!diceConfig.bankrollAmount) {
      diceConfig.bankrollAmount = "100000";
      needsRepair = true;
    }
    
    if (diceConfig.payoutEnabled === undefined || diceConfig.payoutEnabled === null) {
      diceConfig.payoutEnabled = true;
      needsRepair = true;
    }
    
    if (diceConfig.decimalPlaces === undefined || diceConfig.decimalPlaces === null) {
      diceConfig.decimalPlaces = 2;
      needsRepair = true;
    }
    
    if (!diceConfig.maxProfit) {
      diceConfig.maxProfit = "5000";
      needsRepair = true;
    }
    
    if (!diceConfig.hotWalletThreshold) {
      diceConfig.hotWalletThreshold = "10000";
      needsRepair = true;
    }
    
    if (needsRepair) {
      // Update the last updated timestamp
      diceConfig.lastUpdated = new Date();
      this.saveData();
      console.log('Dice game configuration repaired:', JSON.stringify(diceConfig, null, 2));
      return true;
    }
    
    return false;
  }

  // Balance operations
  async getAllBalances(): Promise<{ [walletAddress: string]: number }> {
    // Ensure balances object exists
    if (!this.data.balances) {
      this.data.balances = {};
    }
    return this.data.balances;
  }

  async setBalance(walletAddress: string, balance: number): Promise<void> {
    if (!this.data.balances) {
      this.data.balances = {};
    }
    this.data.balances[walletAddress] = balance;
    this.saveData();
  }

  async getBalance(walletAddress: string): Promise<number> {
    if (!this.data.balances) {
      this.data.balances = {};
    }
    return this.data.balances[walletAddress] || 0;
  }

  // Deposit operations
  async getDeposit(signature: string): Promise<DepositRecord | undefined> {
    if (!this.data.deposits) {
      this.data.deposits = [];
    }
    return this.data.deposits.find(d => d.signature === signature);
  }

  async recordDeposit(deposit: DepositRecord): Promise<void> {
    if (!this.data.deposits) {
      this.data.deposits = [];
    }
    this.data.deposits.push(deposit);
    this.saveData();
  }

  // Withdrawal operations
  async recordWithdrawal(withdrawal: WithdrawalRecord): Promise<void> {
    if (!this.data.withdrawals) {
      this.data.withdrawals = [];
    }
    this.data.withdrawals.push(withdrawal);
    this.saveData();
  }

  // Transaction history for a wallet
  async getTransactionHistory(walletAddress: string, limit: number = 20): Promise<any[]> {
    const deposits = (this.data.deposits || [])
      .filter(d => d.walletAddress === walletAddress)
      .map(d => ({ ...d, type: 'deposit' }));
    
    const withdrawals = (this.data.withdrawals || [])
      .filter(w => w.walletAddress === walletAddress)
      .map(w => ({ ...w, type: 'withdrawal' }));
    
    // Combine and sort by timestamp (newest first)
    const combined = [...deposits, ...withdrawals]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
    
    return combined;
  }

  // User wallet storage operations (encrypted private keys)
  async storeUserWallet(wallet: StoredWallet): Promise<void> {
    if (!this.data.userWallets) {
      this.data.userWallets = [];
    }
    
    // Check if wallet already exists
    const existingIndex = this.data.userWallets.findIndex(
      w => w.walletAddress === wallet.walletAddress
    );
    
    const walletData: StoredWalletData = {
      walletAddress: wallet.walletAddress,
      encryptedPrivateKey: wallet.encryptedPrivateKey,
      createdAt: wallet.createdAt.toISOString(),
      lastUsed: wallet.lastUsed?.toISOString()
    };
    
    if (existingIndex >= 0) {
      // Update existing wallet
      this.data.userWallets[existingIndex] = walletData;
    } else {
      // Add new wallet
      this.data.userWallets.push(walletData);
    }
    
    this.saveData();
    console.log(`[WALLET] Stored wallet for ${wallet.walletAddress}`);
  }

  async getUserWallet(walletAddress: string): Promise<StoredWallet | undefined> {
    if (!this.data.userWallets) {
      this.data.userWallets = [];
      return undefined;
    }
    
    const walletData = this.data.userWallets.find(
      w => w.walletAddress === walletAddress
    );
    
    if (!walletData) {
      return undefined;
    }
    
    return {
      walletAddress: walletData.walletAddress,
      encryptedPrivateKey: walletData.encryptedPrivateKey,
      createdAt: new Date(walletData.createdAt),
      lastUsed: walletData.lastUsed ? new Date(walletData.lastUsed) : undefined
    };
  }

  async deleteUserWallet(walletAddress: string): Promise<boolean> {
    if (!this.data.userWallets) {
      return false;
    }
    
    const initialLength = this.data.userWallets.length;
    this.data.userWallets = this.data.userWallets.filter(
      w => w.walletAddress !== walletAddress
    );
    
    if (this.data.userWallets.length < initialLength) {
      this.saveData();
      console.log(`[WALLET] Deleted wallet for ${walletAddress}`);
      return true;
    }
    
    return false;
  }

  async updateWalletLastUsed(walletAddress: string): Promise<void> {
    if (!this.data.userWallets) {
      return;
    }
    
    const walletIndex = this.data.userWallets.findIndex(
      w => w.walletAddress === walletAddress
    );
    
    if (walletIndex >= 0) {
      this.data.userWallets[walletIndex].lastUsed = new Date().toISOString();
      this.saveData();
    }
  }
} 
