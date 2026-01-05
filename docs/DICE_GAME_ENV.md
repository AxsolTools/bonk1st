# AQUA Dice Game - Environment Configuration

Copy the configuration below to your `.env` or `.env.local` file and fill in your values.

**Never commit your actual `.env` file to version control!**

```bash
# ===========================================
# AQUA DICE GAME - Environment Configuration
# ===========================================

# ===========================================
# Server Configuration
# ===========================================
DICE_SERVER_PORT=5001
NODE_ENV=production

# ===========================================
# Solana Network Configuration
# ===========================================
# Comma-separated list of RPC endpoints for failover support
SOLANA_RPC_URLS=https://api.mainnet-beta.solana.com,https://solana-api.projectserum.com

# Optional: WebSocket URL for real-time updates
SOLANA_WS_URL=wss://api.mainnet-beta.solana.com

# ===========================================
# House Wallet Configuration (CRITICAL)
# ===========================================
# The house wallet holds funds for payouts and receives deposits
# Format: Base58 encoded secret key
# SECURITY WARNING: Keep this secret! Never share or commit!
HOUSE_WALLET_SECRET=your_base58_secret_key_here

# ===========================================
# Token Configuration
# ===========================================
# The SPL token mint address
LOCKED_TOKEN_MINT=your_token_mint_address

# Token decimals
TOKEN_DECIMALS=6

# Token symbol for display (rebranded for Aqua)
LOCKED_TOKEN_SYMBOL=AQUA

# Token name for display
LOCKED_TOKEN_NAME=AQUA Token

# ===========================================
# Dice Game Configuration
# ===========================================
# Enable/disable the dice game
DICE_ENABLED=true

# House edge percentage (e.g., 3.5 = 3.5% house edge)
HOUSE_EDGE=3.5

# Minimum bet amount in tokens
MIN_BET_AMOUNT=100000

# Maximum bet amount in tokens
MAX_BET_AMOUNT=20000000

# Maximum profit per bet in tokens
MAX_PROFIT=500000000

# ===========================================
# Fee Configuration
# ===========================================
# Wallet address to receive platform fees
FEE_WALLET_ADDRESS=97eZABzDSGLc148oBjVRxcogduFCmZN8pofo23hpWWXw

# ===========================================
# Admin Configuration
# ===========================================
# Admin wallet addresses (comma-separated for multiple admins)
ADMIN_WALLET_ADDRESSES=97eZABzDSGLc148oBjVRxcogduFCmZN8pofo23hpWWXw

# ===========================================
# Security Configuration
# ===========================================
# Rate limiting window in milliseconds
RATE_LIMIT_WINDOW_MS=60000

# Maximum requests per window
RATE_LIMIT_MAX_REQUESTS=100

# ===========================================
# Logging Configuration
# ===========================================
# Log level: debug, info, warn, error
LOG_LEVEL=info

# ===========================================
# Vesting Configuration
# ===========================================
MIN_VESTING_DAYS=1
MAX_VESTING_DAYS=3650

# ===========================================
# Development Only
# ===========================================
DEBUG_MODE=false
```

## Required Environment Variables

| Variable | Description |
|----------|-------------|
| `SOLANA_RPC_URLS` | At least one Solana RPC endpoint |
| `HOUSE_WALLET_SECRET` | Base58 encoded secret key for the house wallet |
| `LOCKED_TOKEN_MINT` | SPL token mint address for the game token |

## Security Notes

1. **Never commit your `.env` file** - It contains sensitive credentials
2. **Use strong RPC providers in production** - Free public endpoints have rate limits
3. **Secure your house wallet secret** - This wallet controls all payouts
