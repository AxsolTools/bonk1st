import { NextRequest, NextResponse } from 'next/server'

/**
 * Token Gate Configuration API
 * 
 * Environment Variables:
 * - TOKEN_GATE_ENABLED: Set to "true" to enable the token gate (default: false)
 * - TOKEN_GATE_MIN_TOKENS: Minimum token amount required (default: 5000000)
 * 
 * These can be configured in Digital Ocean App Platform environment variables
 */

export async function GET(request: NextRequest) {
  // Read from environment variables
  const enabled = process.env.TOKEN_GATE_ENABLED === 'true'
  const minTokens = parseInt(process.env.TOKEN_GATE_MIN_TOKENS || '5000000', 10)

  return NextResponse.json({
    success: true,
    enabled,
    minTokens,
    // Include token info for display
    tokenMint: process.env.LOCKED_TOKEN_MINT || null,
    tokenSymbol: process.env.LOCKED_TOKEN_SYMBOL || 'AQUA',
  })
}

// For admin updates (could be expanded with authentication)
export async function POST(request: NextRequest) {
  // This endpoint could be used for admin dashboard updates
  // For now, return info about how to configure via environment
  return NextResponse.json({
    success: false,
    message: 'Token gate configuration is managed via environment variables: TOKEN_GATE_ENABLED, TOKEN_GATE_MIN_TOKENS',
    instructions: {
      TOKEN_GATE_ENABLED: 'Set to "true" to enable token gating, any other value or unset means disabled',
      TOKEN_GATE_MIN_TOKENS: 'Minimum token balance required (default: 5000000)',
    }
  }, { status: 400 })
}

