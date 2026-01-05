import { NextRequest, NextResponse } from 'next/server'

/**
 * Token Configuration API
 * 
 * Returns token info from environment variables for the dice game
 * Environment Variables:
 * - LOCKED_TOKEN_SYMBOL: Token symbol (e.g., "PROPEL")
 * - LOCKED_TOKEN_NAME: Token name (e.g., "PROPELLABS")
 * - LOCKED_TOKEN_MINT: Token mint address
 * - TOKEN_DECIMALS: Token decimals (default: 9)
 * 
 * Also supports DICE_* prefixed variables for compatibility
 */

export async function GET(request: NextRequest) {
  try {
    // Read from environment variables - support both LOCKED_* and DICE_* prefixes
    const symbol = process.env.NEXT_PUBLIC_DICE_TOKEN_SYMBOL || 
                   process.env.LOCKED_TOKEN_SYMBOL || 
                   'AQUA'
    
    const name = process.env.DICE_TOKEN_NAME || 
                 process.env.LOCKED_TOKEN_NAME || 
                 'AQUA Token'
    
    const mint = process.env.DICE_TOKEN_MINT || 
                 process.env.LOCKED_TOKEN_MINT || 
                 null
    
    const decimals = parseInt(
      process.env.DICE_TOKEN_DECIMALS || 
      process.env.TOKEN_DECIMALS || 
      '9',
      10
    )

    return NextResponse.json({
      success: true,
      token: {
        symbol,
        mint,
        decimals,
        name
      }
    })
  } catch (error) {
    console.error('[TOKEN-CONFIG] Error reading config:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to read token configuration'
      },
      { status: 500 }
    )
  }
}

