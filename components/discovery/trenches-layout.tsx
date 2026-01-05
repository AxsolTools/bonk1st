"use client"

import { TokenLane } from "./token-lane"

// Icons for each lane
const NewIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round" />
  </svg>
)

const AlmostBondedIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const MigratedIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" strokeLinecap="round" />
    <path d="M22 4L12 14.01l-3-3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export function TrenchesLayout() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* New Tokens Lane */}
      <TokenLane
        type="new"
        title="New"
        icon={<NewIcon />}
        accentColor="bg-[var(--green)]/20 text-[var(--green)]"
        maxTokens={25}
      />

      {/* Almost Bonded Lane */}
      <TokenLane
        type="almost-bonded"
        title="Almost Bonded"
        icon={<AlmostBondedIcon />}
        accentColor="bg-[var(--warm-pink)]/20 text-[var(--warm-pink)]"
        maxTokens={25}
      />

      {/* Migrated Lane */}
      <TokenLane
        type="migrated"
        title="Migrated"
        icon={<MigratedIcon />}
        accentColor="bg-[var(--aqua-primary)]/20 text-[var(--aqua-primary)]"
        maxTokens={25}
      />
    </div>
  )
}

