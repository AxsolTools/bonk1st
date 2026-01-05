"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { TrenchesLayout } from "./trenches-layout"
import { TokenGrid } from "./token-grid"
import { AllSolanaGrid } from "./all-solana-grid"
import { Droplet, Globe, Sparkles } from "lucide-react"

const viewModes = [
  { value: "trenches", label: "🪖 Trenches", description: "3-lane view" },
  { value: "grid", label: "Grid", description: "Card grid" },
]

const sortOptions = [
  { value: "newest", label: "Newest" },
  { value: "liquidity", label: "Liquidity" },
  { value: "volume", label: "Volume" },
  { value: "marketcap", label: "Market Cap" },
]

const sourceOptions = [
  { value: "aquarius", label: "Propel", icon: Droplet },
  { value: "all", label: "All Solana", icon: Globe },
  { value: "trending", label: "Trending", icon: Sparkles },
]

// Check if a string is a valid Solana address (base58, 32-44 chars)
function isSolanaAddress(input: string): boolean {
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
  return base58Regex.test(input.trim())
}

export function DiscoverContent() {
  const router = useRouter()
  const [viewMode, setViewMode] = useState<"trenches" | "grid">("trenches")
  const [sort, setSort] = useState("newest")
  const [search, setSearch] = useState("")
  const [isSearching, setIsSearching] = useState(false)
  const [tokenSource, setTokenSource] = useState<"aquarius" | "all" | "trending">("aquarius")
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 })
  const [sourceIndicatorStyle, setSourceIndicatorStyle] = useState({ left: 0, width: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const sourceContainerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (containerRef.current) {
      const activeIndex = viewModes.findIndex((v) => v.value === viewMode)
      const buttons = containerRef.current.querySelectorAll("button")
      const activeButton = buttons[activeIndex] as HTMLElement
      if (activeButton) {
        setIndicatorStyle({
          left: activeButton.offsetLeft,
          width: activeButton.offsetWidth,
        })
      }
    }
  }, [viewMode])

  useEffect(() => {
    if (sourceContainerRef.current) {
      const activeIndex = sourceOptions.findIndex((s) => s.value === tokenSource)
      const buttons = sourceContainerRef.current.querySelectorAll("button")
      const activeButton = buttons[activeIndex] as HTMLElement
      if (activeButton) {
        setSourceIndicatorStyle({
          left: activeButton.offsetLeft,
          width: activeButton.offsetWidth,
        })
      }
    }
  }, [tokenSource])

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const trimmedSearch = search.trim()
    if (!trimmedSearch) return

    // If it looks like a Solana address, navigate to token page
    if (isSolanaAddress(trimmedSearch)) {
      setIsSearching(true)
      router.push(`/token/${trimmedSearch}`)
      return
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearchSubmit(e)
    }
  }

  const renderContent = () => {
    // Show external token sources
    if (tokenSource !== "aquarius") {
      return (
        <AllSolanaGrid 
          source={tokenSource === "all" ? "all" : "trending"} 
        />
      )
    }

    // Show Propel platform tokens
    if (viewMode === "trenches") {
      return <TrenchesLayout />
    }
    return <TokenGrid />
  }

  return (
    <div>
      {/* Token Source Toggle */}
      <div className="mb-4">
        <div
          ref={sourceContainerRef}
          className="relative inline-flex gap-0.5 p-1 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]"
        >
          {/* Active indicator */}
          <motion.div
            className="absolute h-[calc(100%-8px)] top-1 rounded-lg bg-gradient-to-r from-[var(--aqua-primary)]/20 to-[var(--aqua-primary)]/10 border border-[var(--aqua-primary)]/30"
            initial={false}
            animate={{
              left: sourceIndicatorStyle.left,
              width: sourceIndicatorStyle.width,
            }}
            transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
          />

          {sourceOptions.map((source) => {
            const IconComponent = source.icon
            return (
              <button
                key={source.value}
                onClick={() => setTokenSource(source.value as typeof tokenSource)}
                className={cn(
                  "relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap z-10",
                  tokenSource === source.value
                    ? "text-[var(--aqua-primary)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
                )}
              >
                <IconComponent className="w-4 h-4" />
                <span className="hidden sm:inline">{source.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Header Bar with Search, View Toggle, and Sort */}
      <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
        {/* Search Bar */}
        <div className="flex-1 w-full sm:max-w-md">
          <form onSubmit={handleSearchSubmit} className="relative">
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
              onChange={(e) => setSearch(e.target.value)}
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

        {/* Right side controls */}
        <div className="flex items-center gap-3">
          {/* View Mode Toggle - Only show for Propel source */}
          {tokenSource === "aquarius" && (
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

              {viewModes.map((mode) => (
                <button
                  key={mode.value}
                  onClick={() => setViewMode(mode.value as "trenches" | "grid")}
                  className={cn(
                    "relative px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap z-10",
                    viewMode === mode.value
                      ? "text-[var(--text-primary)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
                  )}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          )}

          {/* Sort - Only show in grid mode for Propel */}
          {tokenSource === "aquarius" && viewMode === "grid" && (
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
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
          )}
        </div>
      </div>

      {/* Content Area */}
      <motion.div
        key={`${tokenSource}-${viewMode}`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {renderContent()}
      </motion.div>
    </div>
  )
}
