"use client"

import useSWR from "swr"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Zap, Copy, CheckCheck, ExternalLink } from "lucide-react"

interface BoostedToken {
  address: string
  symbol: string
  name: string
  logoURI: string | null
  price: number
  marketCap: number
  volume24h: number
  liquidity: number
  boosts: number
  dexUrl: string
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function DexPaid() {
  const [copiedCA, setCopiedCA] = useState<string | null>(null)
  const router = useRouter()

  const { data, isLoading } = useSWR<{ tokens: BoostedToken[] }>("/api/tokens/boosted", fetcher, {
    refreshInterval: 20000, // Updated refresh interval from 60s to 20s
  })

  const tokens = data?.tokens || []

  const copyToClipboard = async (ca: string) => {
    await navigator.clipboard.writeText(ca)
    setCopiedCA(ca)
    setTimeout(() => setCopiedCA(null), 2000)
  }

  const formatMC = (mc: number) => {
    if (mc >= 1000000) return `$${(mc / 1000000).toFixed(2)}M`
    if (mc >= 1000) return `$${(mc / 1000).toFixed(0)}K`
    return `$${mc.toFixed(2)}`
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Zap className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">DEX Paid</h2>
            <p className="text-xs text-muted-foreground">Boosted tokens</p>
          </div>
        </div>
        <Badge variant="outline" className="text-primary">
          {tokens.length} active
        </Badge>
      </div>

      <div className="max-h-[350px] divide-y divide-border/50 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}

        {tokens.map((token) => (
          <div
            key={token.address}
            onClick={() => router.push(`/token/${token.address}`)}
            className="flex cursor-pointer items-center justify-between px-5 py-4 transition-colors hover:bg-secondary/30"
          >
            <div className="flex items-center gap-3">
              {token.logoURI ? (
                <Image
                  src={token.logoURI || "/placeholder.svg"}
                  alt={token.symbol}
                  width={32}
                  height={32}
                  className="rounded-lg"
                  unoptimized
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-sm font-bold text-foreground">
                  {token.symbol.slice(0, 2)}
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{token.symbol}</span>
                  <Badge className="bg-primary/20 text-primary text-[10px]">{token.boosts} boosts</Badge>
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <code className="font-mono text-[10px] text-muted-foreground">
                    {token.address.slice(0, 6)}...{token.address.slice(-4)}
                  </code>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      copyToClipboard(token.address)
                    }}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                  >
                    {copiedCA === token.address ? (
                      <CheckCheck className="h-3 w-3 text-[var(--success)]" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
                  {token.dexUrl && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        window.open(token.dexUrl, "_blank")
                      }}
                      className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="text-right text-xs">
              <div className="font-medium text-foreground">{formatMC(token.marketCap)}</div>
              <div className="text-muted-foreground">{formatMC(token.volume24h)} vol</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
