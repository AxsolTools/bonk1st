"use client"

import dynamic from 'next/dynamic'
import { Suspense } from 'react'
import { Gamepad2 } from 'lucide-react'
import { SolanaWalletProvider } from '@/components/dice/SolanaWalletContext'
import { Header } from '@/components/layout/header'
import { useTokenConfig } from '@/components/dice/useTokenConfig'

// Dynamic imports to avoid SSR issues
const DiceGame = dynamic(() => import('@/components/dice/DiceGame'), { 
  ssr: false,
  loading: () => (
    <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-subtle)] p-8 animate-pulse">
      <div className="h-64 flex items-center justify-center">
        <div className="text-[var(--text-muted)]">Loading game...</div>
      </div>
    </div>
  )
})

const LiveChat = dynamic(() => import('@/components/dice/LiveChat'), { 
  ssr: false,
  loading: () => (
    <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-subtle)] p-8 animate-pulse">
      <div className="h-48"></div>
    </div>
  )
})

const LiveBets = dynamic(() => import('@/components/dice/LiveBets'), { 
  ssr: false,
  loading: () => (
    <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-subtle)] p-8 animate-pulse">
      <div className="h-48"></div>
    </div>
  )
})

const Leaderboard = dynamic(() => import('@/components/dice/Leaderboard'), { 
  ssr: false,
  loading: () => (
    <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-subtle)] p-8 animate-pulse">
      <div className="h-48"></div>
    </div>
  )
})

function DicePageContent() {
  const { token } = useTokenConfig()
  
  return (
    <main className="min-h-screen bg-[var(--bg-primary)]">
      <Header />
      
      <div className="max-w-[1920px] mx-auto px-3 sm:px-4 lg:px-6 py-6">
        {/* Page Title */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-3 mb-2">
            <Gamepad2 className="h-8 w-8 text-[var(--aqua-primary)]" />
            <h1 className="text-3xl font-bold text-[var(--text-primary)]">
              {token.symbol} Dice Game
            </h1>
          </div>
          <p className="text-sm text-[var(--text-muted)] max-w-xl mx-auto">
            Provably fair on-chain dice. All bets settled directly on Solana.
          </p>
        </div>

          {/* Main Content - 3 Column Layout */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            {/* Left Sidebar - Live Bets */}
            <div className="xl:col-span-3 order-3 xl:order-1">
              <Suspense fallback={<div className="h-96 animate-pulse bg-[var(--bg-secondary)] rounded-xl" />}>
                <LiveBets />
              </Suspense>
            </div>

            {/* Center - Game */}
            <div className="xl:col-span-6 order-1 xl:order-2">
              <Suspense fallback={<div className="h-[500px] animate-pulse bg-[var(--bg-secondary)] rounded-xl" />}>
                <DiceGame />
              </Suspense>
            </div>

            {/* Right Sidebar - Chat & Leaderboard */}
            <div className="xl:col-span-3 order-2 xl:order-3 space-y-4">
              <Suspense fallback={<div className="h-64 animate-pulse bg-[var(--bg-secondary)] rounded-xl" />}>
                <Leaderboard />
              </Suspense>
              <Suspense fallback={<div className="h-64 animate-pulse bg-[var(--bg-secondary)] rounded-xl" />}>
                <LiveChat />
              </Suspense>
            </div>
          </div>

          {/* Provably Fair Info - Compact */}
          <div className="mt-6 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-subtle)] p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🎲</span>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Provably Fair</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-[var(--text-muted)]">
              <div>
                <span className="font-medium text-[var(--text-secondary)]">How It Works:</span>{' '}
                Each roll combines your client seed with our hashed server seed.
              </div>
              <div>
                <span className="font-medium text-[var(--text-secondary)]">Verification:</span>{' '}
                After each roll, verify the outcome with our verification tool.
              </div>
              <div>
                <span className="font-medium text-[var(--text-secondary)]">On-Chain:</span>{' '}
                All bets settled on Solana. View transactions on explorer.
              </div>
            </div>
          </div>
        </div>
      </main>
  )
}

export default function DicePage() {
  return (
    <SolanaWalletProvider>
      <DicePageContent />
    </SolanaWalletProvider>
  )
}
