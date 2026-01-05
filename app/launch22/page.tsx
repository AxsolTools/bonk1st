"use client"

import { useEffect, useState, useRef } from "react"
import { useAuth } from "@/components/providers/auth-provider"
import { Token22Wizard } from "@/components/launch22/token22-wizard"
import { motion } from "framer-motion"
import { Header } from "@/components/layout/header"
import Link from "next/link"

export default function Launch22Page() {
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
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Token-2022</span>
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
                href="/launch-jupiter"
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-orange-500/10 to-yellow-500/10 border border-orange-500/30 hover:border-orange-500/50 transition-all text-sm text-orange-400 hover:text-orange-300 font-medium"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span>JUP</span>
              </Link>
              <Link
                href="/launch"
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-default)] hover:border-[var(--aqua-border)] transition-all text-sm text-[var(--text-secondary)] hover:text-[var(--aqua-primary)]"
              >
                <span>Pump.fun</span>
              </Link>
              <Link
                href="/launch-bonk"
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-default)] hover:border-amber-500/30 transition-all text-sm text-[var(--text-secondary)] hover:text-amber-400"
              >
                <span>Bonk.fun</span>
              </Link>
            </div>
          </div>

          {/* Info Strip */}
          <div className="flex items-center gap-6 text-xs text-[var(--text-muted)]">
            <div className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Native transfer fees</span>
            </div>
            <div className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-[var(--aqua-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span>Authority revocation</span>
            </div>
            <div className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              <span>Direct Raydium launch</span>
            </div>
            <div className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-[var(--green)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Full supply control</span>
            </div>
          </div>
        </motion.div>

        {/* Extensions Banner */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mb-6"
        >
          <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)]">
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-muted)]">Extensions:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                MetadataPointer
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                TransferFee
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                MintClose
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                FreezeRevoke
              </span>
            </div>
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
                        <span className={activeWallet?.id === wallet.id ? "text-emerald-400 font-medium" : "text-[var(--text-secondary)]"}>
                          {wallet.label || `${wallet.public_key.slice(0, 6)}...${wallet.public_key.slice(-4)}`}
                        </span>
                        {activeWallet?.id === wallet.id && (
                          <svg className="w-4 h-4 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
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
          transition={{ delay: 0.15 }}
        >
          {isAuthenticated && (activeWallet || mainWallet) ? (
            <Token22Wizard creatorWallet={(activeWallet || mainWallet)!.public_key} />
          ) : (
            <div className="glass-panel p-12 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-default)] flex items-center justify-center">
                <svg className="w-8 h-8 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Connect Wallet</h3>
              <p className="text-sm text-[var(--text-muted)] mb-6 max-w-sm mx-auto">
                Connect your wallet to start creating Token-2022 tokens with advanced features
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
