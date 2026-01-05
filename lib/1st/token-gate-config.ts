/**
 * Token Gate Configuration for BONK1ST Sniper
 * 
 * Environment Variables (set in DigitalOcean):
 * - NEXT_PUBLIC_TOKEN_GATE_MINT: The token mint address required to access the sniper
 * - NEXT_PUBLIC_TOKEN_GATE_SYMBOL: The token symbol for display
 * - NEXT_PUBLIC_TOKEN_GATE_MIN_AMOUNT: Minimum token amount required (in whole tokens, not raw)
 * - NEXT_PUBLIC_TOKEN_GATE_ENABLED: Set to "true" to enable token gating, "false" to disable
 */

export interface TokenGateConfig {
  enabled: boolean
  tokenMint: string
  tokenSymbol: string
  minAmount: number
  decimals: number
}

// Read from environment variables - these are public and can be read client-side
export function getTokenGateConfig(): TokenGateConfig {
  return {
    enabled: process.env.NEXT_PUBLIC_TOKEN_GATE_ENABLED === 'true',
    tokenMint: process.env.NEXT_PUBLIC_TOKEN_GATE_MINT || '',
    tokenSymbol: process.env.NEXT_PUBLIC_TOKEN_GATE_SYMBOL || 'TOKEN',
    minAmount: parseFloat(process.env.NEXT_PUBLIC_TOKEN_GATE_MIN_AMOUNT || '0'),
    decimals: parseInt(process.env.NEXT_PUBLIC_TOKEN_GATE_DECIMALS || '6', 10),
  }
}

// Check if token gate is properly configured
export function isTokenGateConfigured(): boolean {
  const config = getTokenGateConfig()
  return config.enabled && config.tokenMint.length > 30 && config.minAmount > 0
}

