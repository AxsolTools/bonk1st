import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Token Aggregator | Propel",
}

export default function AggregatorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}

