"use client"

import { useEffect, useState, useRef, Suspense } from "react"
import { useAuth } from "@/components/providers/auth-provider"
import { JupiterWizard } from "@/components/launch-jupiter/jupiter-wizard"
import { motion } from "framer-motion"
import { Header } from "@/components/layout/header"
import Link from "next/link"
import { TrendingUp, Shield, Coins } from "lucide-react"

// Custom Jupiter icon (planet with rings)
const JupiterIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="7" />
    <ellipse cx="12" cy="12" rx="11" ry="3" />
    <path d="M5 12h14" strokeWidth="1.5" />
  </svg>
)

function LaunchJupiterContent() {
  const { isAuthenticated, isLoading, wallets, activeWallet, setActiveWallet, mainWallet, setIsOnboarding } = useAuth()
  const [showWalletSelector, setShowWalletSelector] = useState(false)
  const selectorRef = useRef<HTMLDivElement>(null)
  
  // Close wallet selector when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (selectorRef.current && !selectorRef.current.contains(event.target as Node)) {
        setShowWalletSelector(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setIsOnboarding(true)
    }
  }, [isLoading, isAuthenticated, setIsOnboarding])

  if (isLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="flex items-center gap-3 text-[var(--text-muted)]">
          <div className="spinner" />
          <span>Loading...</span>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[var(--bg-primary)]">
      <Header />

      <div className="relative z-10 px-4 lg:px-6 py-6 max-w-[1400px] mx-auto">
        {/* Page Header */}
        <motion.div 
          initial={{ opacity: 0, y: 12 }} 
          animate={{ opacity: 1, y: 0 }} 
          className="mb-6"
        >
          {/* Top Bar */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              {/* Protocol Badge */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-orange-500/10 to-yellow-500/10 border border-orange-500/20">
                <JupiterIcon className="w-4 h-4 text-orange-400" />
                <span className="text-xs font-semibold text-orange-400 uppercase tracking-wider">Jupiter DBC</span>
              </div>
              
              <div className="h-4 w-px bg-[var(--border-default)]" />
              
              {/* Title */}
              <div>
                <h1 className="text-xl font-bold text-[var(--text-primary)]">Create Token</h1>
              </div>
            </div>
            
            {/* Switch Protocol */}
            <div className="flex items-center gap-2">
              <Link
                href="/launch"
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-default)] hover:border-[var(--aqua-border)] transition-all text-sm text-[var(--text-secondary)] hover:text-[var(--aqua-primary)]"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
                <span>Pump.fun</span>
              </Link>
              <Link
                href="/launch-bonk"
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-default)] hover:border-amber-500/30 transition-all text-sm text-[var(--text-secondary)] hover:text-amber-400"
              >
                <span>Bonk.fun</span>
              </Link>
              <Link
                href="/launch22"
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-default)] hover:border-emerald-500/30 transition-all text-sm text-[var(--text-secondary)] hover:text-emerald-400"
              >
                <span>Token-2022</span>
              </Link>
            </div>
          </div>

          {/* Info Strip */}
          <div className="flex items-center gap-6 text-xs text-[var(--text-muted)]">
            <div className="flex items-center gap-1.5">
              <JupiterIcon className="w-3.5 h-3.5 text-orange-400" />
              <span>Dynamic Bonding Curve</span>
            </div>
            <div className="flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-green-400" />
              <span>Built-in price discovery</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Coins className="w-3.5 h-3.5 text-yellow-400" />
              <span>Creator fee collection</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-blue-400" />
              <span>Auto-migration to Raydium</span>
            </div>
          </div>
        </motion.div>

        {/* Jupiter Info Banner */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mb-6"
        >
          <div className="flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-orange-500/10 via-yellow-500/5 to-transparent border border-orange-500/20">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-yellow-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
              <JupiterIcon className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-[var(--text-primary)]">Jupiter Studio</h3>
              <p className="text-sm text-[var(--text-muted)]">
                Launch tokens on Jupiter's Dynamic Bonding Curve with automatic fee collection and migration
              </p>
            </div>
            <a
              href="https://jup.ag"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-orange-500/20 to-yellow-500/20 border border-orange-500/30 text-sm font-medium text-orange-400 hover:text-orange-300 transition-colors"
            >
              Learn More →
            </a>
          </div>
        </motion.div>

        {/* Wallet Selector Bar */}
        {isAuthenticated && wallets.length > 1 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-6"
          >
            <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)]">
              <div className="flex items-center gap-2 text-sm">
                <svg className="w-4 h-4 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
                <span className="text-[var(--text-muted)]">Deploying from:</span>
              </div>
              
              <div className="relative" ref={selectorRef}>
                <button
                  onClick={() => setShowWalletSelector(!showWalletSelector)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[var(--bg-secondary)] border border-[var(--border-default)] hover:border-orange-500/30 transition-colors"
                >
                  <span className="text-sm font-mono text-[var(--text-primary)]">
                    {activeWallet?.label || `${(activeWallet || mainWallet)?.public_key.slice(0, 6)}...${(activeWallet || mainWallet)?.public_key.slice(-4)}`}
                  </span>
                  <svg className={`w-3 h-3 text-[var(--text-muted)] transition-transform ${showWalletSelector ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                
                {showWalletSelector && (
                  <div className="absolute top-full right-0 mt-1 w-56 py-1 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-xl z-50">
                    {wallets.map((wallet) => (
                      <button
                        key={wallet.id}
                        onClick={() => {
                          setActiveWallet(wallet)
                          setShowWalletSelector(false)
                        }}
                        className="flex items-center justify-between w-full px-3 py-2 text-sm hover:bg-[var(--bg-secondary)] transition-colors"
                      >
                        <span className={activeWallet?.id === wallet.id ? "text-orange-400 font-medium" : "text-[var(--text-secondary)]"}>
                          {wallet.label || `${wallet.public_key.slice(0, 6)}...${wallet.public_key.slice(-4)}`}
                        </span>
                        {activeWallet?.id === wallet.id && (
                          <svg className="w-4 h-4 text-orange-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Main Content - Jupiter Wizard */}
        <motion.div 
          initial={{ opacity: 0, y: 12 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ delay: 0.15 }}
        >
          {isAuthenticated && (activeWallet || mainWallet) ? (
            <JupiterWizard 
              creatorWallet={(activeWallet || mainWallet)!.public_key}
            />
          ) : (
            <div className="glass-panel p-12 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-gradient-to-br from-orange-500/20 to-yellow-500/20 border border-orange-500/30 flex items-center justify-center">
                <JupiterIcon className="w-8 h-8 text-orange-400" />
              </div>
              <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Connect Wallet</h3>
              <p className="text-sm text-[var(--text-muted)] mb-6 max-w-sm mx-auto">
                Connect your wallet to start creating tokens on Jupiter's Dynamic Bonding Curve
              </p>
              <button 
                onClick={() => setIsOnboarding(true)} 
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-orange-500 to-yellow-500 text-white font-semibold hover:from-orange-600 hover:to-yellow-600 transition-all shadow-lg shadow-orange-500/25"
              >
                Connect Wallet
              </button>
            </div>
          )}
        </motion.div>
      </div>
    </main>
  )
}

export default function LaunchJupiterPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="flex items-center gap-3 text-[var(--text-muted)]">
          <div className="spinner" />
          <span>Loading...</span>
        </div>
      </main>
    }>
      <LaunchJupiterContent />
    </Suspense>
  )
}

