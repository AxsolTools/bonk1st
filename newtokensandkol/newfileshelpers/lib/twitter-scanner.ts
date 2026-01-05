// Twitter Scanner - Detects new token CAs and tracks traction
export interface TweetWithCA {
  id: string
  text: string
  author: string
  authorHandle: string
  authorAvatar: string
  authorFollowers: number
  timestamp: Date
  contractAddress: string
  tokenName?: string
  tokenSymbol?: string
  likes: number
  retweets: number
  replies: number
  engagementScore: number
  url?: string
}

export interface TrackedToken {
  contractAddress: string
  tokenName?: string
  tokenSymbol?: string
  logoURI?: string
  firstSeen: Date
  totalMentions: number
  totalEngagement: number
  uniqueAccounts: number
  peakEngagement: number
  trendDirection: "up" | "down" | "stable"
  marketCap?: number
  volume24h?: number
  priceChange?: number
  tweets: TweetWithCA[]
}

// Solana CA regex pattern
const SOLANA_CA_PATTERN = /[1-9A-HJ-NP-Za-km-z]{32,44}/g

export function extractContractAddresses(text: string): string[] {
  const matches = text.match(SOLANA_CA_PATTERN) || []
  // Filter to likely valid Solana addresses (base58, 32-44 chars, no invalid chars)
  return matches.filter(
    (addr) =>
      addr.length >= 32 &&
      addr.length <= 44 &&
      !addr.includes("0") &&
      !addr.includes("O") &&
      !addr.includes("I") &&
      !addr.includes("l"),
  )
}

export function calculateEngagementScore(tweet: {
  likes: number
  retweets: number
  replies: number
  authorFollowers: number
}): number {
  const baseScore = tweet.likes + tweet.retweets * 2 + tweet.replies * 1.5
  const followerMultiplier = Math.log10(Math.max(tweet.authorFollowers, 100)) / 5
  return Math.round(baseScore * followerMultiplier)
}
