import { z } from "zod";

// Type definitions for our data models

// Users
export const userSchema = z.object({
  id: z.number(),
  walletAddress: z.string(),
  email: z.string().nullable(),
  username: z.string().nullable(),
  isAdmin: z.boolean().default(false),
  createdAt: z.date(),
  lastLogin: z.date().nullable(),
});

export type User = z.infer<typeof userSchema>;

export const insertUserSchema = userSchema.omit({ 
  id: true, 
  createdAt: true 
}).partial({
  email: true,
  username: true,
  isAdmin: true,
  lastLogin: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;

// Locked tokens
export const lockedTokenSchema = z.object({
  id: z.number(),
  userId: z.number(),
  tokenSymbol: z.string(),
  tokenName: z.string(),
  issuer: z.string(),
  amount: z.string(),
  lockDuration: z.number(),
  lockDate: z.date(),
  releaseDate: z.date(),
  transactionHash: z.string().nullable(),
  status: z.string(),
  feeAmount: z.string().default("25"),
  feePaid: z.boolean().default(false),
  releaseCondition: z.string().default("time-based"),
  releaseConditionData: z.any().nullable(),
});

export type LockedToken = z.infer<typeof lockedTokenSchema>;

export const insertLockedTokenSchema = lockedTokenSchema.omit({ 
  id: true, 
  lockDate: true 
}).partial({
  releaseCondition: true,
  releaseConditionData: true,
  transactionHash: true,
  feeAmount: true,
  feePaid: true,
});

export type InsertLockedToken = z.infer<typeof insertLockedTokenSchema>;

// Transaction history
export const transactionSchema = z.object({
  id: z.number(),
  userId: z.number(),
  type: z.string(),
  amount: z.string(),
  tokenSymbol: z.string(),
  timestamp: z.date(),
  transactionHash: z.string().nullable(),
  status: z.string(),
  details: z.any().nullable(),
});

export type Transaction = z.infer<typeof transactionSchema>;

export const insertTransactionSchema = transactionSchema.omit({ 
  id: true, 
  timestamp: true 
}).partial({
  transactionHash: true,
  details: true,
});

export type InsertTransaction = z.infer<typeof insertTransactionSchema>;

// Platform statistics
export const platformStatsSchema = z.object({
  id: z.number(),
  totalLockedTokens: z.string().default("0"),
  activeLockers: z.number().default(0),
  avgLockDuration: z.number().default(0),
  tokensReleased: z.string().default("0"),
  totalFeeCollected: z.string().default("0"),
  updatedAt: z.date(),
});

export type PlatformStats = z.infer<typeof platformStatsSchema>;

// System configuration
export const systemConfigSchema = z.object({
  id: z.number(),
  feeWalletAddress: z.string(),
  feeAmount: z.string().default("25"),
  minLockDuration: z.number().default(1),
  maxLockDuration: z.number().default(3650),
  hookVersion: z.string().default("token_lock_v1"),
  hookNamespace: z.string().default("xrpl_token_locker"),
  adminEmail: z.string().nullable(),
  maintenanceMode: z.boolean().default(false),
  lastUpdated: z.date(),
  updatedBy: z.number().nullable(),
  additionalSettings: z.any(),
  diceGameConfig: z.object({
    enabled: z.boolean(),
    houseWalletAddress: z.string(),
    maxBetAmount: z.string(),
    minBetAmount: z.string(),
    houseEdge: z.number(),
    bankrollAmount: z.string(),
    payoutEnabled: z.boolean(),
    decimalPlaces: z.number(),
    maxProfit: z.string(),
    hotWalletThreshold: z.string(),
    lastUpdated: z.date(),
  }),
});

export type SystemConfig = z.infer<typeof systemConfigSchema>;

export const insertSystemConfigSchema = systemConfigSchema.omit({ 
  id: true, 
  lastUpdated: true 
}).partial({
  feeAmount: true,
  minLockDuration: true,
  maxLockDuration: true,
  hookVersion: true,
  hookNamespace: true,
  adminEmail: true,
  maintenanceMode: true,
  updatedBy: true,
  additionalSettings: true,
  diceGameConfig: true,
});

export type InsertSystemConfig = z.infer<typeof insertSystemConfigSchema>;

// Dice game related types
export const diceGameBetSchema = z.object({
  id: z.number(),
  userId: z.number(),
  betAmount: z.string(),
  tokenSymbol: z.string(),
  prediction: z.number(),
  rollType: z.string(),
  roll: z.number(),
  won: z.boolean(),
  multiplier: z.number(),
  profit: z.string(),
  timestamp: z.date(),
  transactionHash: z.string().nullable(),
  clientSeed: z.string(),
  serverSeed: z.string(),
  serverSeedHash: z.string(),
});

export type DiceGameBet = z.infer<typeof diceGameBetSchema>;

export const insertDiceGameBetSchema = diceGameBetSchema.omit({ 
  id: true, 
  timestamp: true 
}).partial({
  transactionHash: true,
});

export type InsertDiceGameBet = z.infer<typeof insertDiceGameBetSchema>;
