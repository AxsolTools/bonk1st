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
  { href: '/', label: 'SNIPER', exact: true },
  { href: '/1st/tokens', label: 'NEW TOKENS' },
  { href: '/1st/pairs', label: 'PAIRS' },
  { href: '/1st/history', label: 'HISTORY' },
]

export function FirstHeader() {
  const pathname = usePathname()
  const { isAuthenticated, activeWallet, wallets, setIsOnboarding, setShowWalletManager, disconnect } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false)
  const [showDisconnectMenu, setShowDisconnectMenu] = React.useState(false)
  
  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href
    return pathname.startsWith(href)
  }
  
  const truncateAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`
  }
  
  // Close disconnect menu when clicking outside
  React.useEffect(() => {
    if (!showDisconnectMenu) return
    
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('.disconnect-menu-container')) {
        setShowDisconnectMenu(false)
      }
    }
    
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [showDisconnectMenu])
  
  return (
    <header className="sticky top-0 z-50 w-full border-b border-[#D4AF37]/10 bg-[#000000]/95 backdrop-blur-xl">
      <div className="w-full max-w-[1920px] mx-auto px-4 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo & Brand */}
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-3 group">
              <FirstLogo size="md" />
              <div className="flex flex-col">
                <span className="text-xl font-bold tracking-tight text-[#D4AF37] group-hover:text-[#FFD700] transition-colors">
                  BONK1ST
                </span>
                <span className="text-[9px] text-white/50 tracking-widest uppercase font-bold">
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
            {/* DEX Links */}
            <div className="hidden sm:flex items-center gap-2">
              <a
                href="https://pump.fun/coin/DYBvk2VrsnvS68REkbxULbMGcoQn6pCpWK7Bnrw5bonk"
                target="_blank"
                rel="noopener noreferrer"
                className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 hover:border-[#D4AF37]/50 flex items-center justify-center transition-all hover:bg-white/10"
                title="View on Pump.fun"
              >
                <svg width="18" height="18" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M21.8855 184.247C-2.01603 162.076 -3.41853 124.726 18.753 100.824L94.7609 18.8855C116.932 -5.01605 154.282 -6.41855 178.184 15.7529C202.085 37.9244 203.488 75.274 181.316 99.1756L105.308 181.115C83.1367 205.016 45.7871 206.419 21.8855 184.247Z" fill="white"/>
                  <path fillRule="evenodd" clipRule="evenodd" d="M18.753 100.824C-3.41853 124.726 -2.01603 162.076 21.8855 184.247C45.7871 206.419 83.1367 205.016 105.308 181.115L145.81 137.452L59.2549 57.1621L18.753 100.824ZM40.6908 123.847C41.4209 122.946 41.2828 121.625 40.3824 120.895C39.482 120.165 38.1603 120.303 37.4302 121.203L34.9463 124.267C34.2162 125.167 34.3543 126.489 35.2547 127.219C36.1551 127.949 37.4768 127.811 38.2068 126.91L40.6908 123.847ZM34.5525 135.781C34.7653 134.641 34.014 133.545 32.8745 133.332C31.735 133.12 30.6388 133.871 30.4261 135.01C29.2814 141.142 29.7013 147.239 31.4916 152.718C31.8516 153.82 33.0367 154.421 34.1385 154.061C35.2404 153.701 35.8417 152.516 35.4816 151.414C33.9159 146.623 33.5335 141.24 34.5525 135.781ZM39.6257 160.27C38.8184 159.438 37.4897 159.418 36.6578 160.225C35.8259 161.032 35.8059 162.361 36.6131 163.193L40.0892 166.775C40.8964 167.607 42.2252 167.627 43.0571 166.82C43.889 166.013 43.909 164.684 43.1018 163.852L39.6257 160.27Z" fill="#5FCB88"/>
                </svg>
              </a>
              <a
                href="https://bonk.fun/token/DYBvk2VrsnvS68REkbxULbMGcoQn6pCpWK7Bnrw5bonk"
                target="_blank"
                rel="noopener noreferrer"
                className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 hover:border-[#D4AF37]/50 flex items-center justify-center transition-all hover:bg-white/10"
                title="View on Bonk.fun"
              >
                <Image
                  src="/bonk_fun.png"
                  alt="Bonk.fun"
                  width={18}
                  height={18}
                  className="rounded"
                />
              </a>
            </div>
            
            {/* Connection Status */}
            <div className="hidden sm:flex items-center gap-2">
              <GoldBadge variant="success" size="xs" dot pulse>
                LIVE
              </GoldBadge>
            </div>
            
            {/* X (Twitter) Link */}
            <a
              href="https://x.com/bonk1st"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center justify-center w-8 h-8 rounded-lg bg-[#D4AF37]/5 border border-[#D4AF37]/20 hover:bg-[#D4AF37]/10 hover:border-[#D4AF37]/40 transition-all duration-200 group"
              aria-label="Follow BONK1ST on X (Twitter)"
            >
              <svg 
                className="w-4 h-4 text-[#D4AF37]/60 group-hover:text-[#D4AF37] transition-colors" 
                fill="currentColor" 
                viewBox="0 0 24 24"
              >
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
            
            {/* Wallet */}
            {isAuthenticated && activeWallet ? (
              <div className="relative flex items-center gap-2 disconnect-menu-container">
                <button
                  onClick={() => setShowWalletManager(true)}
                  className="hidden sm:flex items-center gap-2 text-right hover:opacity-80 transition-opacity"
                >
                  <div>
                    <p className="text-xs text-white/50">
                      {wallets.length} wallet{wallets.length !== 1 ? 's' : ''}
                    </p>
                    <p className="text-xs font-mono text-[#D4AF37]">
                      {truncateAddress(activeWallet.public_key)}
                    </p>
                  </div>
                </button>
                <button
                  onClick={() => setShowDisconnectMenu(!showDisconnectMenu)}
                  className="w-8 h-8 rounded-full bg-gradient-to-br from-[#D4AF37]/20 to-[#B8860B]/20 border border-[#D4AF37]/30 flex items-center justify-center hover:border-[#D4AF37]/50 transition-colors"
                >
                  <span className="text-[10px] font-bold text-[#D4AF37]">
                    {activeWallet.public_key.slice(0, 2).toUpperCase()}
                  </span>
                </button>
                
                {/* Disconnect Dropdown */}
                {showDisconnectMenu && (
                  <div className="absolute top-full right-0 mt-2 w-48 bg-[#0A0A0A] border border-[#D4AF37]/30 rounded-lg shadow-xl z-50 overflow-hidden">
                    <button
                      onClick={() => {
                        setShowWalletManager(true)
                        setShowDisconnectMenu(false)
                      }}
                      className="w-full px-4 py-3 text-left text-sm text-white hover:bg-[#D4AF37]/10 transition-colors flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                      </svg>
                      Manage Wallets
                    </button>
                    <button
                      onClick={() => {
                        disconnect()
                        setShowDisconnectMenu(false)
                      }}
                      className="w-full px-4 py-3 text-left text-sm text-white hover:bg-[#D4AF37]/10 transition-colors flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      Disconnect Wallet
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <GoldButton 
                variant="primary" 
                size="sm"
                onClick={() => setShowWalletManager(true)}
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
              
              {/* X (Twitter) Link - Mobile */}
              <a
                href="https://x.com/bonk1st"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMobileMenuOpen(false)}
                className="px-4 py-3 text-sm font-semibold uppercase tracking-wider rounded-lg transition-all duration-200 text-white/60 hover:text-white hover:bg-white/5 flex items-center gap-2"
              >
                <svg 
                  className="w-4 h-4" 
                  fill="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                FOLLOW ON X
              </a>
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
                {wsStatus === 'connected' ? 'LIVE WS' : 
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

