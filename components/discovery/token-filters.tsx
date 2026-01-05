"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

const stages = [
  { value: "all", label: "All" },
  { value: "bonding", label: "Bonding" },
  { value: "migrated", label: "Migrated" },
]

const sortOptions = [
  { value: "newest", label: "Newest" },
  { value: "liquidity", label: "Liquidity" },
  { value: "volume", label: "Volume" },
  { value: "marketcap", label: "Market Cap" },
]

interface TokenFiltersProps {
  onFilterChange?: (filters: { stage: string; sort: string; search: string }) => void
}

// Check if a string is a valid Solana address (base58, 32-44 chars)
function isSolanaAddress(input: string): boolean {
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
  return base58Regex.test(input.trim())
}

export function TokenFilters({ onFilterChange }: TokenFiltersProps) {
  const router = useRouter()
  const [stage, setStage] = useState("all")
  const [sort, setSort] = useState("newest")
  const [search, setSearch] = useState("")
  const [isSearching, setIsSearching] = useState(false)
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (containerRef.current) {
      const activeIndex = stages.findIndex((s) => s.value === stage)
      const buttons = containerRef.current.querySelectorAll("button")
      const activeButton = buttons[activeIndex] as HTMLElement
      if (activeButton) {
        setIndicatorStyle({
          left: activeButton.offsetLeft,
          width: activeButton.offsetWidth,
        })
      }
    }
  }, [stage])

  const handleStageChange = (value: string) => {
    setStage(value)
    onFilterChange?.({ stage: value, sort, search })
  }

  const handleSortChange = (value: string) => {
    setSort(value)
    onFilterChange?.({ stage, sort: value, search })
  }

  const handleSearchChange = (value: string) => {
    setSearch(value)
    onFilterChange?.({ stage, sort, search: value })
  }

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const trimmedSearch = search.trim()
    if (!trimmedSearch) return

    // If it looks like a Solana address, navigate to token page
    if (isSolanaAddress(trimmedSearch)) {
      setIsSearching(true)
      // Navigate to the token page - it will handle loading from chain if not in DB
      router.push(`/token/${trimmedSearch}`)
      return
    }

    // Otherwise, just filter the grid
    onFilterChange?.({ stage, sort, search: trimmedSearch })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearchSubmit(e)
    }
  }

  return (
    <div className="mb-4">
      {/* Search Bar - Compact */}
      <div className="mb-3">
        <form onSubmit={handleSearchSubmit} className="relative max-w-xl">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="9" cy="9" r="6" />
              <path d="M14 14l4 4" strokeLinecap="round" />
            </svg>
          </div>
          <input
            ref={searchInputRef}
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search or paste contract..."
            disabled={isSearching}
            className={cn(
              "w-full pl-10 pr-20 py-2.5 rounded-lg text-sm",
              "bg-[var(--bg-secondary)] border border-[var(--border-default)]",
              "text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
              "focus:outline-none focus:border-[var(--aqua-primary)]",
              "transition-all duration-150",
              isSearching && "opacity-70 cursor-not-allowed"
            )}
          />
          <button
            type="submit"
            disabled={isSearching || !search.trim()}
            className={cn(
              "absolute right-1.5 top-1/2 -translate-y-1/2",
              "px-3 py-1.5 rounded text-xs font-medium transition-all",
              search.trim() 
                ? "bg-[var(--aqua-primary)] text-[var(--bg-primary)] hover:bg-[var(--aqua-secondary)]"
                : "bg-[var(--bg-elevated)] text-[var(--text-muted)] cursor-not-allowed"
            )}
          >
            {isSearching ? "..." : "Go"}
          </button>
        </form>
      </div>

      {/* Filters row: Tabs + Sort - Compact inline */}
      <div className="flex items-center gap-3">
        {/* Stage Tabs - Compact */}
        <div
          ref={containerRef}
          className="relative inline-flex gap-0.5 p-0.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)]"
        >
          {/* Active indicator */}
          <motion.div
            className="absolute h-[calc(100%-4px)] top-0.5 rounded bg-[var(--bg-elevated)]"
            initial={false}
            animate={{
              left: indicatorStyle.left,
              width: indicatorStyle.width,
            }}
            transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
          />

          {stages.map((s) => (
            <button
              key={s.value}
              onClick={() => handleStageChange(s.value)}
              className={cn(
                "relative px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap z-10",
                stage === s.value
                  ? "text-[var(--text-primary)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Sort - Compact */}
        <select
          value={sort}
          onChange={(e) => handleSortChange(e.target.value)}
          className="px-2 py-1.5 rounded-lg text-xs bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-secondary)] appearance-none cursor-pointer pr-6"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M3 4.5l3 3 3-3' stroke='%236b7280' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'/%3E%3C/svg%3E")`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 0.5rem center",
          }}
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
