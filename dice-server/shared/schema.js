// User related types
export const insertUserSchema = {
  walletAddress: String,
  email: null,
  username: null,
  isAdmin: false
};

// Locked tokens related types
export const insertLockedTokenSchema = {
  userId: Number,
  tokenSymbol: String,
  tokenName: String,
  issuer: String,
  amount: String,
  lockDuration: Number,
  releaseDate: Date,
  releaseCondition: "time-based",
  releaseConditionData: null
};

// Transaction related types
export const insertTransactionSchema = {
  userId: Number,
  type: String, // 'lock' | 'unlock' | 'fee_payment' | 'dice_bet' | 'dice_win'
  amount: String,
  tokenSymbol: String,
  status: String, // 'pending' | 'completed' | 'failed'
  transactionHash: null,
  details: null
};

// System configuration related types
export const insertSystemConfigSchema = {
  feeWalletAddress: String,
  feeAmount: "25",
  minLockDuration: 1,
  maxLockDuration: 3650,
  hookVersion: "token_lock_v1",
  hookNamespace: "xrpl_token_locker",
  adminEmail: null,
  maintenanceMode: false,
  updatedBy: null,
  additionalSettings: {}
}; 