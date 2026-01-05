// Multiple free Solana RPCs with load balancing to avoid rate limits

const FREE_RPCS = [
  "https://api.mainnet-beta.solana.com",
  "https://solana-mainnet.g.alchemy.com/v2/demo",
  "https://rpc.ankr.com/solana",
  "https://solana.public-rpc.com",
  "https://mainnet.helius-rpc.com/?api-key=demo",
]

let currentRpcIndex = 0
let requestCounts: Record<string, number> = {}
let lastResetTime = Date.now()

const RATE_LIMIT_WINDOW = 60000 // 1 minute
const MAX_REQUESTS_PER_RPC = 40

export function getNextRpc(): string {
  // Reset counts every minute
  if (Date.now() - lastResetTime > RATE_LIMIT_WINDOW) {
    requestCounts = {}
    lastResetTime = Date.now()
  }

  // Find an RPC that hasn't hit rate limit
  for (let i = 0; i < FREE_RPCS.length; i++) {
    const index = (currentRpcIndex + i) % FREE_RPCS.length
    const rpc = FREE_RPCS[index]
    const count = requestCounts[rpc] || 0

    if (count < MAX_REQUESTS_PER_RPC) {
      requestCounts[rpc] = count + 1
      currentRpcIndex = (index + 1) % FREE_RPCS.length
      return rpc
    }
  }

  // All RPCs are rate limited, return the one with lowest count
  const sorted = FREE_RPCS.sort((a, b) => (requestCounts[a] || 0) - (requestCounts[b] || 0))
  return sorted[0]
}

export async function fetchSolPrice(): Promise<number> {
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd", {
      next: { revalidate: 30 },
    })
    const data = await res.json()
    return data.solana?.usd || 0
  } catch {
    return 0
  }
}

export function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`
  return num.toFixed(2)
}

export function formatUSD(num: number): string {
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`
  if (num >= 1_000) return `$${(num / 1_000).toFixed(2)}K`
  return `$${num.toFixed(2)}`
}

export function shortenAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`
}
