// ============================================================================
// AQUA Launchpad - Database Types
// Auto-generated from Supabase schema - DO NOT EDIT MANUALLY
// ============================================================================

// ========== PRECISION CONSTANTS ==========
export const LAMPORTS_PER_SOL = 1_000_000_000;
export const SOL_DECIMALS = 9;
export const USDC_DECIMALS = 6;

// ========== USER ==========
export interface User {
  id: string;
  main_wallet_address: string;
  username: string | null;
  avatar_url: string | null;
  email: string | null;
  is_verified: boolean;
  total_transactions: number;
  total_volume_sol: number;
  created_at: string;
  updated_at: string;
}

// ========== WALLET ==========
export interface Wallet {
  id: string;
  session_id: string;
  user_id?: string;
  public_key: string;
  encrypted_private_key: string;
  label: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

// ========== REFERRAL SYSTEM ==========
export interface Referral {
  id: string;
  user_id: string;
  referral_code: string;
  referred_by: string | null;
  referred_by_code: string | null;
  pending_earnings: number; // SOL
  total_earnings: number;
  total_claimed: number;
  referral_count: number;
  claim_count: number;
  last_claim_at: string | null;
  last_claim_signature: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReferralEarning {
  id: string;
  referrer_id: string;
  source_user_id: string | null;
  source_transaction_id: string | null;
  operation_type: string;
  fee_amount: number;
  referrer_share: number;
  created_at: string;
}

export interface ReferralClaim {
  id: string;
  user_id: string;
  claim_id: string;
  amount: number;
  destination_wallet: string;
  tx_signature: string | null;
  status: 'pending' | 'success' | 'failed';
  error_message: string | null;
  created_at: string;
}

// ========== PLATFORM FEES ==========
export interface PlatformFee {
  id: string;
  user_id: string | null;
  wallet_address: string;
  source_transaction_id: string | null;
  source_tx_signature: string | null;
  operation_type: 'token_create' | 'token_buy' | 'token_sell' | 'add_liquidity' | 'remove_liquidity' | 'claim_rewards';
  transaction_amount_lamports: bigint;
  fee_amount_lamports: bigint;
  fee_percentage: number;
  referral_split_lamports: bigint;
  referrer_id: string | null;
  fee_tx_signature: string | null;
  fee_collected_at: string | null;
  status: 'pending' | 'collected' | 'failed' | 'refunded';
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlatformFeeConfig {
  id: number;
  fee_percent: number;
  referral_share_percent: number;
  developer_wallet: string;
  min_fee_lamports: bigint;
  is_active: boolean;
  updated_at: string;
  updated_by: string | null;
}

// ========== TOKEN ==========
export interface Token {
  id: string;
  creator_id: string | null;
  creator_wallet: string;
  mint_address: string;
  name: string;
  symbol: string;
  description: string | null;
  image_url: string | null;
  metadata_uri: string | null;
  total_supply: number;
  decimals: number;
  price_sol: number;
  price_usd: number;
  market_cap: number;
  market_cap_usd: number; // Added for frontend compatibility
  current_liquidity: number;
  volume_24h: number;
  change_24h: number;
  holders: number;
  water_level: number;
  constellation_strength: number;
  stage: 'bonding' | 'migrating' | 'migrated' | 'external';
  migration_threshold: number;
  bonding_curve_progress: number;
  migrated_at: string | null;
  migration_pool_address: string | null;
  
  // Pool type for different token creation methods
  pool_type: 'pump' | 'jupiter' | 'token22' | 'bonk' | null;
  quote_mint: string | null; // Quote currency mint (WSOL or USD1 for bonk)
  dbc_pool_address: string | null; // Jupiter DBC pool address
  is_platform_token: boolean; // True if created on PROPEL platform
  website: string | null;
  twitter: string | null;
  telegram: string | null;
  discord: string | null;
  launch_tx_signature: string | null;
  initial_buy_sol: number;
  vote_count: number; // Added for votes feature
  boost_amount: number; // Added for boosts feature
  created_at: string;
  updated_at: string;
  
  // AQUA Metrics (from token_parameters join or calculated)
  pour_rate?: number;
  total_evaporated?: number;
  evaporation_rate?: number;
  
  // Joined token_parameters (when fetched with select("*, token_parameters(*)"))
  token_parameters?: TokenParameters | null;
}

// ========== TOKEN PARAMETERS (Creator Settings) ==========
export interface TokenParameters {
  id: string;
  token_id: string;
  creator_wallet: string;
  
  // Pour Rate Settings
  pour_enabled: boolean;
  pour_rate_percent: number;
  pour_interval_seconds: number;
  pour_source: 'fees' | 'treasury' | 'both';
  pour_max_per_interval_sol: number;
  pour_min_trigger_sol: number;
  pour_last_executed_at: string | null;
  pour_total_added_sol: number;
  
  // Evaporation Settings
  evaporation_enabled: boolean;
  evaporation_rate_percent: number;
  evaporation_interval_seconds: number;
  evaporation_source: 'fees' | 'treasury' | 'both';
  evaporation_last_executed_at: string | null;
  total_evaporated: number;
  
  // Fee Distribution
  fee_to_liquidity_percent: number;
  fee_to_creator_percent: number;
  
  // Tide Harvest
  auto_claim_enabled: boolean;
  claim_threshold_sol: number;
  claim_interval_seconds: number;
  claim_destination_wallet: string | null;
  total_claimed_sol: number;
  pending_rewards_sol: number;
  last_claim_at: string | null;
  last_claim_signature: string | null;
  
  // Trading Controls
  max_buy_percent: number;
  max_sell_percent: number;
  cooldown_seconds: number;
  anti_snipe_blocks: number;
  
  // Advanced Settings
  migration_target: 'raydium' | 'meteora' | 'orca' | 'pumpswap';
  post_migration_pour_enabled: boolean;
  treasury_wallet: string | null;
  treasury_balance_sol: number;
  
  // DEV Wallet Control
  dev_wallet_address: string | null;
  dev_wallet_auto_enabled: boolean;
  dev_wallet_last_action_at: string | null;
  
  // Audit
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  version: number;
}

export interface TokenParameterHistory {
  id: string;
  token_id: string;
  changed_by: string | null;
  changed_at: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  change_reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
}

// ========== LIQUIDITY LOGS ==========
export interface PourRateLog {
  id: string;
  token_id: string;
  amount_sol: number;
  source: string;
  tx_signature: string | null;
  status: 'pending' | 'success' | 'failed';
  error_message: string | null;
  executed_at: string;
}

export interface EvaporationLog {
  id: string;
  token_id: string;
  amount_tokens: number;
  tx_signature: string | null;
  status: 'pending' | 'success' | 'failed';
  error_message: string | null;
  executed_at: string;
}

export interface TideHarvestLog {
  id: string;
  token_id: string;
  creator_id: string | null;
  amount_sol: number;
  destination_wallet: string;
  tx_signature: string | null;
  status: 'pending' | 'success' | 'failed';
  error_message: string | null;
  claimed_at: string;
}

// TideHarvest - Alias for frontend components
export interface TideHarvest {
  id: string;
  token_id: string;
  token_address: string;
  creator_wallet: string;
  total_accumulated: number;
  total_claimed: number;
  pending_amount: number;
  last_claim_at: string | null;
  last_accumulation_at: string | null;
  created_at: string;
  updated_at: string;
  // Pool type for different reward sources
  poolType?: 'pump' | 'bonk' | 'jupiter' | 'pumpswap' | null;
}

// ========== CHAT & COMMENTS ==========
export interface TokenChat {
  id: string;
  token_id: string;
  user_id: string | null;
  wallet_address: string;
  message: string;
  username: string | null;
  avatar_url: string | null;
  is_hidden: boolean;
  hidden_by: string | null;
  hidden_at: string | null;
  hidden_reason: string | null;
  created_at: string;
}

export interface TokenComment {
  id: string;
  token_id: string;
  user_id: string | null;
  wallet_address: string;
  parent_id: string | null;
  content: string;
  username: string | null;
  avatar_url: string | null;
  likes_count: number;
  replies_count: number;
  is_edited: boolean;
  edited_at: string | null;
  original_content: string | null;
  is_hidden: boolean;
  hidden_by: string | null;
  hidden_at: string | null;
  hidden_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommentLike {
  id: string;
  comment_id: string;
  user_id: string;
  wallet_address: string;
  created_at: string;
}

export interface TokenChatStats {
  token_id: string;
  total_messages: number;
  total_comments: number;
  total_likes: number;
  unique_chatters: number;
  last_message_at: string | null;
  last_comment_at: string | null;
  updated_at: string;
}

// ========== TRADES ==========
export interface Trade {
  id: string;
  token_id: string;
  user_id: string | null;
  wallet_address: string;
  trade_type: 'buy' | 'sell';
  amount_tokens: number;
  amount_sol: number;
  amount_usd: number | null;
  price_per_token_sol: number;
  price_per_token_usd: number | null;
  platform_fee_lamports: bigint;
  network_fee_lamports: bigint;
  slippage_percent: number | null;
  tx_signature: string;
  block_time: string | null;
  slot: number | null;
  status: 'pending' | 'confirmed' | 'failed';
  created_at: string;
}

// ========== PRICE HISTORY ==========
export interface PriceHistory {
  id: string;
  token_id: string;
  timestamp: string;
  timeframe: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
  open_sol: number;
  high_sol: number;
  low_sol: number;
  close_sol: number;
  open_usd: number | null;
  high_usd: number | null;
  low_usd: number | null;
  close_usd: number | null;
  volume_sol: number;
  volume_usd: number;
  volume_tokens: number;
  trade_count: number;
}

export interface LiquidityHistory {
  id: string;
  token_id: string;
  timestamp: string;
  liquidity_sol: number;
  liquidity_usd: number | null;
  water_level: number | null;
  source: 'pour' | 'trade' | 'migration' | 'manual' | null;
  change_amount_sol: number | null;
  tx_signature: string | null;
  created_at: string;
}

export interface HolderSnapshot {
  id: string;
  token_id: string;
  timestamp: string;
  holder_count: number;
  top_10_percent: number | null;
  top_50_percent: number | null;
  created_at: string;
}

// ========== WATCHLIST ==========
export interface Watchlist {
  id: string;
  user_id: string;
  token_id: string;
  created_at: string;
}

// ========== VOTING & BOOSTS ==========
export interface Vote {
  id: string;
  token_address: string;
  wallet_address: string;
  created_at: string;
}

export interface Boost {
  id: string;
  token_address: string;
  wallet_address: string;
  amount: number;
  tx_signature: string;
  created_at: string;
}

// ========== TRANSACTIONS ==========
export interface Transaction {
  id: string;
  token_address: string;
  wallet_address: string;
  type: string;
  amount_sol: number;
  tx_signature: string;
  status: string;
  created_at: string;
}

// ========== TRENDING ==========
export interface TrendingProfile {
  id: string;
  token_address: string;
  wallet_address: string;
  token_name: string;
  token_symbol: string;
  token_image: string | null;
  banner_url: string | null;
  description: string | null;
  website: string | null;
  twitter: string | null;
  telegram: string | null;
  discord: string | null;
  tx_signature: string;
  is_active: boolean;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

// ========== FEE BREAKDOWN (For UI) ==========
export interface FeeBreakdown {
  operation: bigint;
  platformFee: bigint;
  priorityFee: bigint;
  networkFee: bigint;
  safetyBuffer: bigint;
  total: bigint;
}

export interface BalanceCheck {
  sufficient: boolean;
  currentBalance: bigint;
  requiredTotal: bigint;
  breakdown: FeeBreakdown;
  shortfall?: bigint;
}

// ========== API RESPONSE TYPES ==========
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: number;
    message: string;
    details?: Record<string, unknown>;
  };
  timestamp: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
