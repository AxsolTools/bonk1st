import { type User, type InsertUser, type LockedToken, type InsertLockedToken, type Transaction, type InsertTransaction, type PlatformStats, type SystemConfig, type InsertSystemConfig } from "./shared/schema.js";

// User wallet storage for encrypted private keys
export interface StoredWallet {
  walletAddress: string;
  encryptedPrivateKey: string;
  createdAt: Date;
  lastUsed?: Date;
}

export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByWalletAddress(walletAddress: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, data: Partial<InsertUser>): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  
  // Locked tokens operations
  getLockedToken(id: number): Promise<LockedToken | undefined>;
  getLockedTokensByUserId(userId: number): Promise<LockedToken[]>;
  getAllLockedTokens(): Promise<LockedToken[]>;
  createLockedToken(token: InsertLockedToken): Promise<LockedToken>;
  updateLockedToken(id: number, data: Partial<InsertLockedToken>): Promise<LockedToken | undefined>;
  
  // Transaction operations
  getTransaction(id: number): Promise<Transaction | undefined>;
  getTransactionsByUserId(userId: number): Promise<Transaction[]>;
  getAllTransactions(): Promise<Transaction[]>;
  createTransaction(insertTransaction: InsertTransaction): Promise<Transaction>;
  updateTransaction(id: number, data: Partial<InsertTransaction>): Promise<Transaction | undefined>;
  
  // Platform stats operations
  getPlatformStats(): Promise<PlatformStats | undefined>;
  updatePlatformStats(data: Partial<PlatformStats>): Promise<PlatformStats | undefined>;
  
  // System configuration operations
  getSystemConfig(): Promise<SystemConfig | undefined>;
  updateSystemConfig(data: Partial<InsertSystemConfig>): Promise<SystemConfig | undefined>;
  initializeSystemConfig(config: InsertSystemConfig): Promise<SystemConfig>;
  
  // Dice game configuration operations
  ensureDiceGameConfig(): Promise<boolean>;
  repairDiceGameConfig(): Promise<boolean>;
  
  // Balance operations (for Solana dice game)
  getAllBalances(): Promise<{ [walletAddress: string]: number }>;
  setBalance(walletAddress: string, balance: number): Promise<void>;
  getBalance(walletAddress: string): Promise<number>;
  
  // Deposit/Withdrawal operations
  getDeposit(signature: string): Promise<any | undefined>;
  recordDeposit(deposit: any): Promise<void>;
  recordWithdrawal(withdrawal: any): Promise<void>;
  getTransactionHistory(walletAddress: string, limit?: number): Promise<any[]>;
  
  // User wallet storage (encrypted private keys)
  storeUserWallet(wallet: StoredWallet): Promise<void>;
  getUserWallet(walletAddress: string): Promise<StoredWallet | undefined>;
  deleteUserWallet(walletAddress: string): Promise<boolean>;
  updateWalletLastUsed(walletAddress: string): Promise<void>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private lockedTokens: Map<number, LockedToken>;
  private transactions: Map<number, Transaction>;
  private platformStats: PlatformStats | undefined;
  private systemConfig: SystemConfig | undefined;
  private balances: Map<string, number>;
  private deposits: Map<string, any>;
  private withdrawals: any[];
  private userWallets: Map<string, StoredWallet>;
  currentUserId: number;
  currentLockedTokenId: number;
  currentTransactionId: number;

  constructor() {
    this.users = new Map();
    this.lockedTokens = new Map();
    this.transactions = new Map();
    this.balances = new Map();
    this.deposits = new Map();
    this.withdrawals = [];
    this.userWallets = new Map();
    this.currentUserId = 1;
    this.currentLockedTokenId = 1;
    this.currentTransactionId = 1;
    
    // Initialize platform stats
    this.platformStats = {
      id: 1,
      totalLockedTokens: "0",
      activeLockers: 0,
      avgLockDuration: 0,
      tokensReleased: "0",
      totalFeeCollected: "0",
      updatedAt: new Date(),
    };

    // Initialize system config with default values
    this.systemConfig = {
      id: 1,
      feeWalletAddress: process.env.FEE_WALLET_ADDRESS || "",
      feeAmount: "0", // No fee for Solana deposits by default
      minLockDuration: 1,
      maxLockDuration: 3650,
      hookVersion: "solana_locker_v1",
      hookNamespace: "locked_token_locker",
      adminEmail: null,
      maintenanceMode: false,
      lastUpdated: new Date(),
      updatedBy: null,
      additionalSettings: {},
      // Add default dice game configuration
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
    };
  }

  // User operations
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByWalletAddress(walletAddress: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.walletAddress === walletAddress,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = { 
      id,
      walletAddress: insertUser.walletAddress,
      email: insertUser.email ?? null,
      username: insertUser.username ?? null,
      isAdmin: insertUser.isAdmin ?? false,
      createdAt: new Date(),
      lastLogin: insertUser.lastLogin ?? new Date()
    };
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: number, data: Partial<InsertUser>): Promise<User | undefined> {
    const user = await this.getUser(id);
    if (!user) return undefined;
    
    const updatedUser: User = { ...user, ...data };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  // Locked tokens operations
  async getLockedToken(id: number): Promise<LockedToken | undefined> {
    return this.lockedTokens.get(id);
  }

  async getLockedTokensByUserId(userId: number): Promise<LockedToken[]> {
    return Array.from(this.lockedTokens.values()).filter(
      (token) => token.userId === userId,
    );
  }

  async getAllLockedTokens(): Promise<LockedToken[]> {
    return Array.from(this.lockedTokens.values());
  }

  async createLockedToken(insertToken: InsertLockedToken): Promise<LockedToken> {
    const id = this.currentLockedTokenId++;
    const token: LockedToken = {
      ...insertToken,
      id,
      lockDate: new Date(),
      transactionHash: null,
      status: "locked",
      feeAmount: "25",
      feePaid: false,
      releaseCondition: insertToken.releaseCondition || "time-based",
      releaseConditionData: insertToken.releaseConditionData || null,
    };
    this.lockedTokens.set(id, token);
    
    // Update platform stats
    if (this.platformStats) {
      const totalLocked = parseFloat(this.platformStats.totalLockedTokens) + parseFloat(token.amount);
      const activeLockers = new Set(Array.from(this.lockedTokens.values()).map(t => t.userId)).size;
      
      this.platformStats = {
        ...this.platformStats,
        totalLockedTokens: totalLocked.toString(),
        activeLockers,
        updatedAt: new Date()
      };
    }
    
    return token;
  }

  async updateLockedToken(id: number, data: Partial<InsertLockedToken>): Promise<LockedToken | undefined> {
    const token = await this.getLockedToken(id);
    if (!token) return undefined;
    
    const updatedToken: LockedToken = { ...token, ...data };
    this.lockedTokens.set(id, updatedToken);
    
    // Update platform stats if token was unlocked
    if (this.platformStats && token.status === "locked" && updatedToken.status === "unlocked") {
      const tokensReleased = parseFloat(this.platformStats.tokensReleased) + parseFloat(token.amount);
      const totalLocked = parseFloat(this.platformStats.totalLockedTokens) - parseFloat(token.amount);
      
      this.platformStats = {
        ...this.platformStats,
        totalLockedTokens: totalLocked > 0 ? totalLocked.toString() : "0",
        tokensReleased: tokensReleased.toString(),
        updatedAt: new Date()
      };
    }
    
    return updatedToken;
  }

  // Transaction operations
  async getTransaction(id: number): Promise<Transaction | undefined> {
    return this.transactions.get(id);
  }

  async getTransactionsByUserId(userId: number): Promise<Transaction[]> {
    return Array.from(this.transactions.values()).filter(
      (transaction) => transaction.userId === userId,
    );
  }

  async getAllTransactions(): Promise<Transaction[]> {
    return Array.from(this.transactions.values());
  }

  async createTransaction(insertTransaction: InsertTransaction): Promise<Transaction> {
    const id = this.currentTransactionId++;
    const transaction: Transaction = {
      ...insertTransaction,
      id,
      timestamp: new Date(),
      transactionHash: insertTransaction.transactionHash || null,
      details: insertTransaction.details || null,
    };
    this.transactions.set(id, transaction);
    return transaction;
  }

  async updateTransaction(id: number, data: Partial<InsertTransaction>): Promise<Transaction | undefined> {
    const transaction = await this.getTransaction(id);
    if (!transaction) return undefined;
    
    const updatedTransaction: Transaction = { ...transaction, ...data };
    this.transactions.set(id, updatedTransaction);
    return updatedTransaction;
  }

  // Platform stats operations
  async getPlatformStats(): Promise<PlatformStats | undefined> {
    return this.platformStats;
  }

  async updatePlatformStats(data: Partial<PlatformStats>): Promise<PlatformStats | undefined> {
    if (!this.platformStats) return undefined;
    
    this.platformStats = {
      ...this.platformStats,
      ...data,
      updatedAt: new Date()
    };
    
    return this.platformStats;
  }

  // System configuration operations
  async getSystemConfig(): Promise<SystemConfig | undefined> {
    return this.systemConfig;
  }

  async updateSystemConfig(data: Partial<InsertSystemConfig>): Promise<SystemConfig | undefined> {
    if (!this.systemConfig) return undefined;
    
    this.systemConfig = {
      ...this.systemConfig,
      ...data,
      lastUpdated: new Date()
    };
    
    return this.systemConfig;
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
      // Initialize dice game config with defaults if not provided
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
    
    this.systemConfig = newConfig;
    return newConfig;
  }

  // Dice game configuration operations
  async ensureDiceGameConfig(): Promise<boolean> {
    if (!this.systemConfig) {
      // Create default system config with dice game settings
      const defaultConfig: InsertSystemConfig = {
        feeWalletAddress: process.env.FEE_WALLET_ADDRESS || "",
        feeAmount: "0",
        minLockDuration: 1,
        maxLockDuration: 3650,
        hookVersion: "solana_locker_v1",
        hookNamespace: "locked_token_locker",
        adminEmail: null,
        maintenanceMode: false,
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
      };
      
      await this.initializeSystemConfig(defaultConfig);
      return true;
    }
    
    if (!this.systemConfig.diceGameConfig) {
      // Add dice game config to existing system config
      this.systemConfig.diceGameConfig = {
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
      
      return true;
    }
    
    return true;
  }

  async repairDiceGameConfig(): Promise<boolean> {
    if (!this.systemConfig || !this.systemConfig.diceGameConfig) {
      await this.ensureDiceGameConfig();
      return true;
    }
    
    const diceConfig = this.systemConfig.diceGameConfig;
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
      return true;
    }
    
    return false;
  }

  // Balance operations
  async getAllBalances(): Promise<{ [walletAddress: string]: number }> {
    const result: { [walletAddress: string]: number } = {};
    this.balances.forEach((balance, address) => {
      result[address] = balance;
    });
    return result;
  }

  async setBalance(walletAddress: string, balance: number): Promise<void> {
    this.balances.set(walletAddress, balance);
  }

  async getBalance(walletAddress: string): Promise<number> {
    return this.balances.get(walletAddress) || 0;
  }

  async getDeposit(signature: string): Promise<any | undefined> {
    return this.deposits.get(signature);
  }

  async recordDeposit(deposit: any): Promise<void> {
    this.deposits.set(deposit.signature, deposit);
  }

  async recordWithdrawal(withdrawal: any): Promise<void> {
    this.withdrawals.push(withdrawal);
  }

  async getTransactionHistory(walletAddress: string, limit: number = 20): Promise<any[]> {
    const deposits = Array.from(this.deposits.values())
      .filter(d => d.walletAddress === walletAddress)
      .map(d => ({ ...d, type: 'deposit' }));
    
    const withdrawals = this.withdrawals
      .filter(w => w.walletAddress === walletAddress)
      .map(w => ({ ...w, type: 'withdrawal' }));
    
    return [...deposits, ...withdrawals]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  // User wallet storage operations
  async storeUserWallet(wallet: StoredWallet): Promise<void> {
    this.userWallets.set(wallet.walletAddress, wallet);
  }

  async getUserWallet(walletAddress: string): Promise<StoredWallet | undefined> {
    return this.userWallets.get(walletAddress);
  }

  async deleteUserWallet(walletAddress: string): Promise<boolean> {
    return this.userWallets.delete(walletAddress);
  }

  async updateWalletLastUsed(walletAddress: string): Promise<void> {
    const wallet = this.userWallets.get(walletAddress);
    if (wallet) {
      wallet.lastUsed = new Date();
      this.userWallets.set(walletAddress, wallet);
    }
  }
}

// Import the file storage
import { FileStorage } from './fileStorage';

// Create and export an instance of FileStorage
export const storage = new FileStorage();
