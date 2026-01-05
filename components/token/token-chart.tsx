"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"

interface TokenChartProps {
  mintAddress: string
  tokenSymbol?: string
}

const timeframes = [
  { value: "1m", label: "1m" },
  { value: "5m", label: "5m" },
  { value: "15m", label: "15m" },
  { value: "1h", label: "1H" },
  { value: "4h", label: "4H" },
  { value: "1d", label: "1D" },
]

export function TokenChart({ mintAddress, tokenSymbol }: TokenChartProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  // DEXScreener embed URL with TradingView Advanced Charts
  const chartUrl = `https://dexscreener.com/solana/${mintAddress}?embed=1&theme=dark&trades=0&info=0`
  
  console.log(`[DEBUG] TokenChart rendering:`, { mintAddress, tokenSymbol, chartUrl })

  return (
    <div className="glass-panel-elevated p-0 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--border-subtle)]">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          {tokenSymbol ? `${tokenSymbol} Chart` : "Trading Chart"}
        </h3>
        <a
          href={`https://dexscreener.com/solana/${mintAddress}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-[var(--aqua-primary)] hover:underline flex items-center gap-1"
        >
          Open Full Chart
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </div>

      {/* Chart Container */}
      <div className="relative h-[500px] bg-[#0d0d0d]">
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--bg-secondary)]/80 z-10">
            <div className="w-8 h-8 border-2 border-[var(--aqua-primary)] border-t-transparent rounded-full animate-spin mb-2" />
            <p className="text-sm text-[var(--text-muted)]">Loading TradingView chart...</p>
          </div>
        )}
        
        {hasError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--bg-secondary)]/30 z-10">
            <svg
              width="40"
              height="40"
              viewBox="0 0 40 40"
              fill="none"
              className="mb-3 opacity-40 text-[var(--aqua-primary)]"
              stroke="currentColor"
            >
              <path d="M8 28l8-8 8 4 12-16" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="text-sm text-[var(--text-muted)]">Chart unavailable</p>
            <p className="text-xs text-[var(--text-dim)] mt-1">Token may be too new for charting</p>
            <a
              href={`https://pump.fun/coin/${mintAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 text-xs text-[var(--aqua-primary)] hover:underline"
            >
              View on Pump.fun →
            </a>
          </div>
        )}

        <iframe
          src={chartUrl}
          className="w-full h-full border-0"
          title="TradingView Chart"
          onLoad={() => {
            console.log(`[DEBUG] Chart iframe loaded for ${mintAddress}`)
            setIsLoading(false)
          }}
          onError={() => {
            console.log(`[DEBUG] Chart iframe ERROR for ${mintAddress}`)
            setIsLoading(false)
            setHasError(true)
          }}
          allow="clipboard-write"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        />
      </div>

    </div>
  )
}
