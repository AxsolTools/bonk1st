import { NextRequest, NextResponse } from "next/server"

/**
 * Fetch bonding curve progress from PumpPortal for multiple tokens
 * Uses: https://pumpportal.fun/data-api/real-time
 */
export async function POST(request: NextRequest) {
  try {
    const { mints } = await request.json()

    if (!mints || !Array.isArray(mints) || mints.length === 0) {
      return NextResponse.json({ success: false, error: "mints array required" }, { status: 400 })
    }

    // Fetch bonding curve data from PumpPortal
    const progressData: Record<string, { progress: number; vSolInBondingCurve: number; vTokensInBondingCurve: number }> = {}

    // PumpPortal API for token data
    const response = await fetch("https://pumpportal.fun/api/data/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tokens: mints }),
    })

    if (response.ok) {
      const data = await response.json()
      
      // Process each token's bonding curve data
      for (const mint of mints) {
        const tokenData = data[mint]
        if (tokenData) {
          // Calculate progress based on virtual SOL in bonding curve
          // Pump.fun migration happens at ~85 SOL in bonding curve
          const vSol = tokenData.vSolInBondingCurve || 0
          const migrationThreshold = 85 // SOL threshold for migration
          const progress = Math.min((vSol / migrationThreshold) * 100, 100)
          
          progressData[mint] = {
            progress,
            vSolInBondingCurve: vSol,
            vTokensInBondingCurve: tokenData.vTokensInBondingCurve || 0,
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: progressData,
    })
  } catch (error) {
    console.error("[PUMP-PROGRESS] Error:", error)
    return NextResponse.json({ success: false, error: "Failed to fetch progress" }, { status: 500 })
  }
}

