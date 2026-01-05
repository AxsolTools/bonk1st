/**
 * Priority Fee API - Get optimal priority fees for Solana transactions
 * Uses Helius getPriorityFeeEstimate
 * 
 * CREDIT COSTS: 1 credit per call
 * RATE LIMIT: 50 req/s on Developer plan
 */

import { NextRequest, NextResponse } from 'next/server'

const HELIUS_API_KEY = process.env.HELIUS_API_KEY

interface PriorityFeeParams {
  priorityLevel?: 'Min' | 'Low' | 'Medium' | 'High' | 'VeryHigh' | 'UnsafeMax'
  accountKeys?: string[]
  includeAllLevels?: boolean
  transaction?: string // Base64 encoded
}

export async function POST(request: NextRequest) {
  try {
    const body: PriorityFeeParams = await request.json()

    if (!HELIUS_API_KEY) {
      // Return sensible defaults if no API key
      return NextResponse.json({
        success: true,
        data: getDefaultFees(body.priorityLevel),
        source: 'default',
      })
    }

    const params: Record<string, unknown> = {}

    // Use transaction if provided, otherwise use account keys
    if (body.transaction) {
      params.transaction = body.transaction
    } else if (body.accountKeys && body.accountKeys.length > 0) {
      params.accountKeys = body.accountKeys
    } else {
      // Default to common program accounts
      params.accountKeys = [
        'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // Token Program
        'So11111111111111111111111111111111111111112', // Wrapped SOL
      ]
    }

    // Add options
    const options: Record<string, unknown> = {}
    
    if (body.priorityLevel) {
      options.priorityLevel = body.priorityLevel
    }
    
    if (body.includeAllLevels) {
      options.includeAllPriorityFeeLevels = true
    }

    if (Object.keys(options).length > 0) {
      params.options = options
    }

    const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'getPriorityFeeEstimate',
        method: 'getPriorityFeeEstimate',
        params: [params],
      }),
    })

    if (!response.ok) {
      console.warn('[PRIORITY-FEE] API error:', response.status)
      return NextResponse.json({
        success: true,
        data: getDefaultFees(body.priorityLevel),
        source: 'default',
      })
    }

    const data = await response.json()

    if (data.error) {
      console.warn('[PRIORITY-FEE] RPC error:', data.error)
      return NextResponse.json({
        success: true,
        data: getDefaultFees(body.priorityLevel),
        source: 'default',
      })
    }

    return NextResponse.json({
      success: true,
      data: data.result,
      source: 'helius',
    })
  } catch (error) {
    console.error('[PRIORITY-FEE] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch priority fee' },
      { status: 500 }
    )
  }
}

/**
 * GET endpoint for simple priority level-based estimates
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const level = searchParams.get('level') || 'Medium'

  // For GET requests, just return defaults or cached values
  return NextResponse.json({
    success: true,
    data: getDefaultFees(level as PriorityFeeParams['priorityLevel']),
    source: 'default',
  })
}

function getDefaultFees(level?: string) {
  // Default fee estimates in micro-lamports
  const levels = {
    min: 100,
    low: 1000,
    medium: 10000,
    high: 100000,
    veryHigh: 500000,
    unsafeMax: 1000000,
  }

  // Map priority level to fee
  const levelMap: Record<string, number> = {
    Min: levels.min,
    Low: levels.low,
    Medium: levels.medium,
    High: levels.high,
    VeryHigh: levels.veryHigh,
    UnsafeMax: levels.unsafeMax,
  }

  return {
    priorityFeeEstimate: levelMap[level || 'Medium'] || levels.medium,
    priorityFeeLevels: levels,
  }
}

