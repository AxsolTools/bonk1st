// Free public Solana RPCs - rotates every 3 requests to avoid rate limits
const FREE_RPCS = [
  "https://api.mainnet-beta.solana.com",
  "https://solana-mainnet.g.alchemy.com/v2/demo",
  "https://rpc.ankr.com/solana",
  "https://solana.public-rpc.com",
  "https://mainnet.helius-rpc.com/?api-key=1d8740dc-e5f4-421c-b823-e1bad1889eff",
  "https://solana-mainnet.core.chainstack.com/demo",
]

let requestCount = 0
let currentRpcIndex = 0

export function getNextRpc(): string {
  requestCount++

  // Rotate every 3 requests
  if (requestCount >= 3) {
    requestCount = 0
    currentRpcIndex = (currentRpcIndex + 1) % FREE_RPCS.length
  }

  return FREE_RPCS[currentRpcIndex]
}

export function getCurrentRpcInfo() {
  return {
    currentRpc: FREE_RPCS[currentRpcIndex],
    requestsUntilRotation: 3 - requestCount,
    totalRpcs: FREE_RPCS.length,
    currentIndex: currentRpcIndex,
  }
}

export async function fetchWithRotation<T>(endpoint: string, body: object): Promise<T> {
  const rpc = getNextRpc()

  const response = await fetch(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      ...body,
    }),
  })

  if (!response.ok) {
    // On failure, force rotation and retry once
    currentRpcIndex = (currentRpcIndex + 1) % FREE_RPCS.length
    requestCount = 0

    const retryResponse = await fetch(FREE_RPCS[currentRpcIndex], {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        ...body,
      }),
    })

    return retryResponse.json()
  }

  return response.json()
}
