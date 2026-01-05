"use client"

import { useEffect, useState, useRef } from "react"
import { useAuth } from "@/components/providers/auth-provider"
import { LaunchWizard } from "@/components/launch/launch-wizard"
import { motion } from "framer-motion"
import { Header } from "@/components/layout/header"
import Link from "next/link"

export default function LaunchPage() {
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
        {/* Page Header - Clean & Professional */}
        <motion.div 
          initial={{ opacity: 0, y: 12 }} 
          animate={{ opacity: 1, y: 0 }} 
          className="mb-6"
        >
          {/* Top Bar */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              {/* Protocol Badge */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--aqua-bg)] border border-[var(--aqua-border)]">
                <div className="w-2 h-2 rounded-full bg-[var(--aqua-primary)] animate-pulse" />
                <span className="text-xs font-semibold text-[var(--aqua-primary)] uppercase tracking-wider">Pump.fun</span>
              </div>
              
              <div className="h-4 w-px bg-[var(--border-default)]" />
              
              {/* Title */}
              <div>
                <h1 className="text-xl font-bold text-[var(--text-primary)]">Create Token</h1>
              </div>
            </div>
            
            {/* Protocol Switchers */}
            <div className="flex items-center gap-2">
              <Link
                href="/launch-jupiter"
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-orange-500/10 to-yellow-500/10 border border-orange-500/30 hover:border-orange-500/50 transition-all text-sm text-orange-400 hover:text-orange-300 font-medium"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span>JUP</span>
              </Link>
              <Link
                href="/launch-bonk"
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-default)] hover:border-amber-500/30 transition-all text-sm text-[var(--text-secondary)] hover:text-amber-400"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
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
              <svg className="w-3.5 h-3.5 text-[var(--aqua-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span>Bonding curve liquidity</span>
            </div>
            <div className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-[var(--green)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span>Auto-migration to Raydium</span>
            </div>
            <div className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-[var(--warm)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
              </svg>
              <span>Optional burn mechanics</span>
            </div>
          </div>
        </motion.div>

        {/* Wallet Selector Bar */}
        {isAuthenticated && wallets.length > 1 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
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
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[var(--bg-secondary)] border border-[var(--border-default)] hover:border-[var(--border-highlight)] transition-colors"
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
                        <span className={activeWallet?.id === wallet.id ? "text-[var(--aqua-primary)] font-medium" : "text-[var(--text-secondary)]"}>
                          {wallet.label || `${wallet.public_key.slice(0, 6)}...${wallet.public_key.slice(-4)}`}
                        </span>
                        {activeWallet?.id === wallet.id && (
                          <svg className="w-4 h-4 text-[var(--aqua-primary)]" fill="currentColor" viewBox="0 0 20 20">
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

        {/* Main Content */}
        <motion.div 
          initial={{ opacity: 0, y: 12 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ delay: 0.1 }}
        >
          {isAuthenticated && (activeWallet || mainWallet) ? (
            <LaunchWizard creatorWallet={(activeWallet || mainWallet)!.public_key} />
          ) : (
            <div className="glass-panel p-12 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-default)] flex items-center justify-center">
                <svg className="w-8 h-8 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Connect Wallet</h3>
              <p className="text-sm text-[var(--text-muted)] mb-6 max-w-sm mx-auto">
                Connect your wallet to start creating tokens on Pump.fun
              </p>
              <button 
                onClick={() => setIsOnboarding(true)} 
                className="btn-primary"
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
