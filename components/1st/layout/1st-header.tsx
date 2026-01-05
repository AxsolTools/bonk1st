"use client"

import * as React from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { useAuth } from "@/components/providers/auth-provider"
import { GoldButton } from "../ui/gold-button"
import { GoldBadge } from "../ui/gold-badge"

// Sniper recoil animation - subtle pump in/out effect like a rifle kick
const sniperRecoilAnimation = {
  animate: {
    // Subtle scale pulse - like the gun breathing/recoiling
    scale: [1, 1.08, 0.97, 1.02, 1],
    // Tiny kickback movement (negative = kicks back, positive = forward)
    x: [0, -2, 1, -0.5, 0],
    // Subtle rotation for realism
    rotate: [0, -1, 0.5, -0.2, 0],
    // Glow intensity pulse
    filter: [
      'drop-shadow(0 0 8px rgba(212,175,55,0.4))',
      'drop-shadow(0 0 15px rgba(255,215,0,0.8))',
      'drop-shadow(0 0 6px rgba(212,175,55,0.3))',
      'drop-shadow(0 0 10px rgba(212,175,55,0.5))',
      'drop-shadow(0 0 8px rgba(212,175,55,0.4))',
    ],
  },
  transition: {
    duration: 2.5,
    ease: [0.25, 0.1, 0.25, 1], // Custom easing for snappy recoil
    repeat: Infinity,
    repeatDelay: 1.5, // Pause between "shots"
  },
}

// 1ST Logo Component - Using actual logo image with sniper animation
const FirstLogo: React.FC<{ size?: 'sm' | 'md' | 'lg'; animated?: boolean }> = ({ 
  size = 'md', 
  animated = true 
}) => {
  const sizes = {
    sm: 32,
    md: 40,
    lg: 56,
  }
  
  const dimension = sizes[size]
  
  return (
    <motion.div 
      className="relative" 
      style={{ width: dimension, height: dimension }}
      animate={animated ? sniperRecoilAnimation.animate : undefined}
      transition={animated ? sniperRecoilAnimation.transition : undefined}
    >
      <Image
        src="/1st-logo.png"
        alt="BONK1ST Sniper"
        width={dimension}
        height={dimension}
        className="object-contain"
        priority
      />
    </motion.div>
  )
}

// Navigation items
const navItems = [
  { href: '/1st', label: 'SNIPER', exact: true },
  { href: '/1st/tokens', label: 'NEW TOKENS' },
  { href: '/1st/pairs', label: 'PAIRS' },
  { href: '/1st/history', label: 'HISTORY' },
]

export function FirstHeader() {
  const pathname = usePathname()
  const { isAuthenticated, activeWallet, wallets, setIsOnboarding } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false)
  
  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href
    return pathname.startsWith(href)
  }
  
  const truncateAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`
  }
  
  return (
    <header className="sticky top-0 z-50 w-full border-b border-[#D4AF37]/10 bg-[#000000]/95 backdrop-blur-xl">
      <div className="w-full max-w-[1920px] mx-auto px-4 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo & Brand */}
          <div className="flex items-center gap-4">
            <Link href="/1st" className="flex items-center gap-3 group">
              <FirstLogo size="md" />
              <div className="flex flex-col">
                <span className="text-xl font-bold tracking-tight text-[#D4AF37] group-hover:text-[#FFD700] transition-colors">
                  BONK1ST
                </span>
                <span className="text-[9px] text-white/40 tracking-widest uppercase">
                  wanna be first?
                </span>
              </div>
            </Link>
            
            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1 ml-8">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "px-4 py-2 text-xs font-semibold uppercase tracking-wider rounded-lg transition-all duration-200",
                    isActive(item.href, item.exact)
                      ? "bg-[#D4AF37]/10 text-[#FFD700] border border-[#D4AF37]/30"
                      : "text-white/60 hover:text-white hover:bg-white/5"
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          
          {/* Right Side - Status & Wallet */}
          <div className="flex items-center gap-4">
            {/* Connection Status */}
            <div className="hidden sm:flex items-center gap-2">
              <GoldBadge variant="success" size="xs" dot pulse>
                LIVE
              </GoldBadge>
            </div>
            
            {/* Wallet */}
            {isAuthenticated && activeWallet ? (
              <div className="flex items-center gap-2">
                <div className="hidden sm:block text-right">
                  <p className="text-xs text-white/50">
                    {wallets.length} wallet{wallets.length !== 1 ? 's' : ''}
                  </p>
                  <p className="text-xs font-mono text-[#D4AF37]">
                    {truncateAddress(activeWallet.public_key)}
                  </p>
                </div>
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#D4AF37]/20 to-[#B8860B]/20 border border-[#D4AF37]/30 flex items-center justify-center">
                  <span className="text-[10px] font-bold text-[#D4AF37]">
                    {activeWallet.public_key.slice(0, 2).toUpperCase()}
                  </span>
                </div>
              </div>
            ) : (
              <GoldButton 
                variant="primary" 
                size="sm"
                onClick={() => setIsOnboarding(true)}
              >
                CONNECT
              </GoldButton>
            )}
            
            {/* Mobile Menu Toggle */}
            <button
              className="md:hidden p-2 text-[#D4AF37] hover:bg-[#D4AF37]/10 rounded-lg transition-colors"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {mobileMenuOpen ? (
                  <path d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
        
        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <nav className="md:hidden py-4 border-t border-[#D4AF37]/10">
            <div className="flex flex-col gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "px-4 py-3 text-sm font-semibold uppercase tracking-wider rounded-lg transition-all duration-200",
                    isActive(item.href, item.exact)
                      ? "bg-[#D4AF37]/10 text-[#FFD700] border border-[#D4AF37]/30"
                      : "text-white/60 hover:text-white hover:bg-white/5"
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </nav>
        )}
      </div>
    </header>
  )
}

// Footer with status bar
export function FirstFooter() {
  const [currentBlock, setCurrentBlock] = React.useState<number | null>(null)
  const [wsStatus, setWsStatus] = React.useState<'connected' | 'connecting' | 'disconnected'>('connecting')
  
  // Simulated block updates - will be replaced with real WebSocket
  React.useEffect(() => {
    const interval = setInterval(() => {
      setCurrentBlock(prev => (prev || 284567000) + Math.floor(Math.random() * 3))
    }, 400)
    
    // Simulate connection
    const timeout = setTimeout(() => setWsStatus('connected'), 1000)
    
    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [])
  
  const statusColors = {
    connected: 'text-[#00FF41]',
    connecting: 'text-[#FFD700]',
    disconnected: 'text-[#FF3333]',
  }
  
  return (
    <footer className="fixed bottom-0 left-0 right-0 z-40 h-8 bg-[#000000] border-t border-[#D4AF37]/10">
      <div className="w-full max-w-[1920px] mx-auto px-4 lg:px-8 h-full">
        <div className="flex items-center justify-between h-full text-[10px] font-mono">
          {/* Left - Connection Status */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span 
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  wsStatus === 'connected' ? 'bg-[#00FF41] animate-pulse' : 
                  wsStatus === 'connecting' ? 'bg-[#FFD700] animate-pulse' : 'bg-[#FF3333]'
                )}
              />
              <span className={statusColors[wsStatus]}>
                {wsStatus === 'connected' ? 'HELIUS WS' : 
                 wsStatus === 'connecting' ? 'CONNECTING...' : 'DISCONNECTED'}
              </span>
            </div>
            
            <span className="text-white/30">|</span>
            
            <span className="text-white/50">
              MAINNET
            </span>
          </div>
          
          {/* Center - Block */}
          <div className="flex items-center gap-2">
            <span className="text-white/40">BLOCK</span>
            <span className="text-[#D4AF37] tabular-nums">
              {currentBlock?.toLocaleString() || '---'}
            </span>
          </div>
          
          {/* Right - Version & Links */}
          <div className="flex items-center gap-4">
            <span className="text-white/30">
              BONK1ST v1.0.0
            </span>
            <a 
              href="https://solscan.io" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-[#D4AF37]/60 hover:text-[#D4AF37] transition-colors"
            >
              SOLSCAN
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}

export { FirstLogo }

