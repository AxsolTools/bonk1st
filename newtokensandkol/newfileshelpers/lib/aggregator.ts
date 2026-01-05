// Custom Aggregator System - User-defined filters for token plays
export interface AggregatorFilter {
  id: string
  name: string
  description?: string
  enabled: boolean
  conditions: FilterCondition[]
  createdAt: Date
  matchCount: number
}

export interface FilterCondition {
  type:
    | "min_mc"
    | "max_mc"
    | "min_volume"
    | "min_holders"
    | "min_liquidity"
    | "max_age"
    | "min_social_score"
    | "group_hits"
    | "fresh_wallets"
    | "dex_paid"
  operator: "gte" | "lte" | "eq" | "between"
  value: number
  value2?: number // For 'between' operator
}

export interface AggregatorMatch {
  tokenAddress: string
  tokenSymbol: string
  tokenName?: string
  logoURI?: string
  matchedFilters: string[]
  timestamp: Date | string
  data: {
    marketCap?: number
    volume24h?: number
    holders?: number
    liquidity?: number
    ageMinutes?: number
    socialScore?: number
    groupHits?: number
    freshWalletBuys?: number
    dexPaid?: boolean
  }
}

// Default aggregator templates
export const DEFAULT_AGGREGATORS: AggregatorFilter[] = [
  {
    id: "micro-sniper",
    name: "Micro Cap Sniper",
    description: "Low MC tokens with volume activity",
    enabled: true,
    conditions: [
      { type: "min_mc", operator: "gte", value: 50000 },
      { type: "max_mc", operator: "lte", value: 500000 },
      { type: "min_volume", operator: "gte", value: 10000 },
    ],
    createdAt: new Date(),
    matchCount: 0,
  },
  {
    id: "mid-cap-runner",
    name: "Mid Cap Runner",
    description: "Mid MC with strong liquidity",
    enabled: true,
    conditions: [
      { type: "min_mc", operator: "gte", value: 100000 },
      { type: "max_mc", operator: "lte", value: 2000000 },
      { type: "min_liquidity", operator: "gte", value: 20000 },
    ],
    createdAt: new Date(),
    matchCount: 0,
  },
  {
    id: "volume-play",
    name: "Volume Play",
    description: "High volume relative to MC",
    enabled: true,
    conditions: [
      { type: "min_volume", operator: "gte", value: 50000 },
      { type: "min_mc", operator: "gte", value: 100000 },
    ],
    createdAt: new Date(),
    matchCount: 0,
  },
  {
    id: "dex-paid-only",
    name: "DEX Paid Only",
    description: "Projects paying for DEX visibility",
    enabled: true,
    conditions: [
      { type: "dex_paid", operator: "eq", value: 1 },
      { type: "min_mc", operator: "gte", value: 50000 },
    ],
    createdAt: new Date(),
    matchCount: 0,
  },
]

export function evaluateCondition(condition: FilterCondition, data: AggregatorMatch["data"]): boolean {
  let value: number | boolean | undefined

  switch (condition.type) {
    case "min_mc":
    case "max_mc":
      value = data.marketCap
      break
    case "min_volume":
      value = data.volume24h
      break
    case "min_holders":
      value = data.holders
      break
    case "min_liquidity":
      value = data.liquidity
      break
    case "max_age":
      value = data.ageMinutes
      break
    case "min_social_score":
      value = data.socialScore
      break
    case "group_hits":
      value = data.groupHits
      break
    case "fresh_wallets":
      value = data.freshWalletBuys
      break
    case "dex_paid":
      value = data.dexPaid ? 1 : 0
      break
  }

  if (value === undefined) return false

  switch (condition.operator) {
    case "gte":
      return (value as number) >= condition.value
    case "lte":
      return (value as number) <= condition.value
    case "eq":
      return value === condition.value
    case "between":
      return (value as number) >= condition.value && (value as number) <= (condition.value2 || condition.value)
    default:
      return false
  }
}
