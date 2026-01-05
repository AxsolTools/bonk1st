import { fetchWithRotation, getCurrentRpcInfo } from "./rpc-rotator"

export interface TokenInfo {
  mint: string
  symbol?: string
  name?: string
  supply?: number
  decimals?: number
  holders?: number
  marketCap?: number
  volume24h?: number
  priceChange?: number
  createdAt?: Date
  twitterMentions?: number
  trendingScore?: number
}

export interface RpcResponse<T> {
  jsonrpc: string
  id: number
  result: T
  error?: { code: number; message: string }
}

export async function getTokenSupply(mint: string): Promise<number | null> {
  try {
    const response = await fetchWithRotation<RpcResponse<{ value: { uiAmount: number } }>>("", {
      method: "getTokenSupply",
      params: [mint],
    })
    return response.result?.value?.uiAmount ?? null
  } catch {
    return null
  }
}

export async function getRecentBlockhash(): Promise<string | null> {
  try {
    const response = await fetchWithRotation<RpcResponse<{ value: { blockhash: string } }>>("", {
      method: "getLatestBlockhash",
      params: [{ commitment: "finalized" }],
    })
    return response.result?.value?.blockhash ?? null
  } catch {
    return null
  }
}

export async function getAccountInfo(address: string) {
  try {
    const response = await fetchWithRotation<RpcResponse<{ value: unknown }>>("", {
      method: "getAccountInfo",
      params: [address, { encoding: "jsonParsed" }],
    })
    return response.result?.value ?? null
  } catch {
    return null
  }
}

export function getRpcStatus() {
  return getCurrentRpcInfo()
}

export async function fetchTrendingTokens(): Promise<TokenInfo[]> {
  try {
    const res = await fetch("https://api.dexscreener.com/latest/dex/search?q=solana", {
      next: { revalidate: 60 },
    })
    if (!res.ok) return []

    const data = await res.json()
    const pairs = (data.pairs || [])
      .filter((p: { chainId: string }) => p.chainId === "solana")
      .sort(
        (a: { volume?: { h24: number } }, b: { volume?: { h24: number } }) =>
          (b.volume?.h24 || 0) - (a.volume?.h24 || 0),
      )
      .slice(0, 20)

    return pairs.map(
      (p: {
        baseToken: { address: string; symbol: string; name: string }
        marketCap?: number
        volume?: { h24: number }
        priceChange?: { h24: number }
      }) => ({
        mint: p.baseToken.address,
        symbol: p.baseToken.symbol,
        name: p.baseToken.name,
        marketCap: p.marketCap || 0,
        volume24h: p.volume?.h24 || 0,
        priceChange: p.priceChange?.h24 || 0,
      }),
    )
  } catch {
    return []
  }
}
