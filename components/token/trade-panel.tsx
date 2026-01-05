"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import type { Token } from "@/lib/types/database"
import { useAuth } from "@/components/providers/auth-provider"
import { getAuthHeaders } from "@/lib/api"
import { FeeBreakdown } from "@/components/ui/fee-breakdown"
import { useBalance, useTokenBalance } from "@/hooks/use-balance"
import { useMultiWalletPNL, formatPnlPercent, formatTokenBalance, formatSolBalance } from "@/hooks/use-multi-wallet-pnl"
import { cn } from "@/lib/utils"
import { EarnShortcut } from "@/components/earn/earn-shortcut"
import { VolumeBotQuickControls } from "@/components/token/volume-bot-quick-controls"
import { tradeEvents } from "@/lib/events/trade-events"
import { DollarSign } from "lucide-react"

// USD1 mint address for Bonk pools
const USD1_MINT = 'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB'
const WSOL_MINT = 'So11111111111111111111111111111111111111112'

interface TradePanelProps {
  token: Token
}

// Hook to fetch live token price
function useLiveTokenPrice(mintAddress: string | null) {
  const [priceSol, setPriceSol] = useState<number>(0)
  const [priceUsd, setPriceUsd] = useState<number>(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPrice = useCallback(async () => {
    if (!mintAddress) {
      setIsLoading(false)
      return
    }

    try {
      const response = await fetch(`/api/price/token?mint=${mintAddress}`)
      const data = await response.json()

      if (data.success && data.data) {
        setPriceSol(data.data.priceSol || 0)
        setPriceUsd(data.data.priceUsd || 0)
        setError(null)
      } else {
        setError(data.error || "Failed to fetch price")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch price")
    }
    setIsLoading(false)
  }, [mintAddress])

  useEffect(() => {
    fetchPrice()
    
    // Refresh price every 10 seconds
    const interval = setInterval(fetchPrice, 10000)
    return () => clearInterval(interval)
  }, [fetchPrice])

  return { priceSol, priceUsd, isLoading, error, refresh: fetchPrice }
}

// Error code to user-friendly message mapping (must match server codes)
const ERROR_MESSAGES: Record<number, string> = {
  1001: "Please connect your wallet first",
  1002: "Session expired - please reconnect wallet",
  1003: "Wallet not found - please reconnect",
  2001: "Not enough SOL in your wallet",
  2002: "Not enough tokens to sell",
  2003: "Invalid amount entered",
  3001: "Trade failed on-chain - try again",
  3002: "Slippage too high - increase tolerance", // Server: slippage errors
  3003: "Transaction failed on-chain - try again",
  3004: "Jupiter swap failed - try again or increase slippage",
  4001: "Token not found or delisted",
  4002: "Bonding curve locked",
  5001: "Trading service temporarily unavailable",
  5002: "Backup trading service failed",
  5003: "API timed out - please try again", // Server: timeout errors
  5002: "Backup trading service also failed",
  5003: "Jupiter API temporarily unavailable - try again",
}

export function TradePanel({ token }: TradePanelProps) {
  const { 
    isAuthenticated, 
    wallets, 
    activeWallet, 
    setActiveWallet, 
    sessionId, 
    userId, 
    setIsOnboarding,
    // Multi-wallet state
    toggledWallets,
    isMultiWalletMode,
    toggleWallet,
    setMultiWalletMode,
    getToggledWalletAddresses,
  } = useAuth()
  
  const [mode, setMode] = useState<"buy" | "sell">("buy")
  const [amount, setAmount] = useState("")
  
  // Bonk pool quote currency toggle (USD1 vs SOL)
  const isBonkPool = (token as any).pool_type === 'bonk'
  const tokenQuoteMint = (token as any).quote_mint
  // Auto-detect: if token was created with USD1, default to USD1; otherwise SOL
  const [quoteCurrency, setQuoteCurrency] = useState<'USD1' | 'SOL'>(() => {
    if (isBonkPool && tokenQuoteMint === USD1_MINT) {
      return 'USD1'
    }
    return 'SOL'
  })
  const isUsd1Mode = isBonkPool && quoteCurrency === 'USD1'
  
  const [slippage, setSlippage] = useState(() => {
    // Load from localStorage on init
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('aqua_slippage')
      if (saved && !isNaN(parseFloat(saved)) && parseFloat(saved) > 0 && parseFloat(saved) <= 50) {
        return saved
      }
    }
    return "1"
  })
  const [customSlippage, setCustomSlippage] = useState("")
  const [showCustomSlippage, setShowCustomSlippage] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showWalletSelector, setShowWalletSelector] = useState(false)
  const [batchResults, setBatchResults] = useState<{ walletAddress: string; success: boolean; error?: string }[] | null>(null)
  const selectorRef = useRef<HTMLDivElement>(null)
  
  // Fetch LIVE token price (not from database)
  const { 
    priceSol: livePriceSol, 
    priceUsd: livePriceUsd,
    isLoading: priceLoading,
    refresh: refreshPrice 
  } = useLiveTokenPrice(token.mint_address || null)
  
  // Use live price if available, fallback to database price
  const effectivePriceSol = livePriceSol > 0 ? livePriceSol : (token.price_sol || 0)
  
  // Multi-wallet PNL data
  const { 
    data: walletPNLData, 
    isLoading: pnlLoading,
    refresh: refreshPNL,
    totalTokenBalance,
    totalValueSol,
    totalSolBalance,
  } = useMultiWalletPNL(
    wallets,
    token.mint_address || null,
    effectivePriceSol,
    livePriceUsd,
    toggledWallets,
    { enabled: isAuthenticated && wallets.length > 1, refreshInterval: 15000 }
  )
  
  // Fetch wallet balance (SOL)
  const { balanceSol, isLoading: balanceLoading, refresh: refreshBalance } = useBalance(
    activeWallet?.public_key || null,
    { refreshInterval: 15000, enabled: !!activeWallet }
  )
  
  // Fetch USD1 balance for Bonk USD1 mode
  const { 
    balance: usd1Balance, 
    isLoading: usd1BalanceLoading, 
    refresh: refreshUsd1Balance 
  } = useTokenBalance(
    activeWallet?.public_key || null,
    USD1_MINT,
    { refreshInterval: 15000, enabled: !!activeWallet && isUsd1Mode }
  )
  
  // Fetch token balance for sell mode
  const { 
    balance: tokenBalance, 
    isLoading: tokenBalanceLoading, 
    refresh: refreshTokenBalance 
  } = useTokenBalance(
    activeWallet?.public_key || null,
    token.mint_address || null,
    { refreshInterval: 15000, enabled: !!activeWallet && !!token.mint_address }
  )

  // Calculate estimated amounts using LIVE price
  const estimatedTokens = amount && effectivePriceSol > 0 ? Number(amount) / effectivePriceSol : 0
  const estimatedSol = amount && effectivePriceSol > 0 ? Number(amount) * effectivePriceSol : 0
  
  // Handle percentage button clicks for sell mode
  const handleQuickAmount = (amt: string) => {
    if (mode === "sell") {
      // For sell mode, amt is a percentage (25, 50, 75, 100)
      const percentage = parseFloat(amt)
      const balanceToUse = isMultiWalletMode ? totalTokenBalance : tokenBalance
      if (balanceToUse > 0) {
        const calculatedAmount = (balanceToUse * percentage) / 100
        setAmount(calculatedAmount.toString())
      } else {
        setAmount("0")
      }
    } else {
      // For buy mode, amt is the actual SOL amount
      setAmount(amt)
    }
  }
  
  // Check if user has sufficient balance for buy
  const parsedAmount = parseFloat(amount) || 0
  // For USD1 mode: check USD1 balance; for SOL mode: check SOL balance with fee buffer
  const insufficientBalance = mode === "buy" && parsedAmount > 0 && (
    isUsd1Mode 
      ? (usd1Balance || 0) < parsedAmount // USD1 mode: check USD1 balance (no fee buffer since fees are in SOL)
      : balanceSol < parsedAmount + 0.01 // SOL mode: 0.01 SOL buffer for fees
  )

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

  // Save slippage to localStorage when it changes
  useEffect(() => {
    if (typeof window !== 'undefined' && slippage) {
      localStorage.setItem('aqua_slippage', slippage)
    }
  }, [slippage])

  // Handle custom slippage input
  const handleCustomSlippageSubmit = () => {
    const value = parseFloat(customSlippage)
    if (!isNaN(value) && value > 0 && value <= 50) {
      setSlippage(value.toString())
      setShowCustomSlippage(false)
    }
  }

  const handleTrade = async () => {
    // Validate prerequisites
    if (!isAuthenticated) {
      setError("Please connect your wallet first")
      return
    }
    
    if (!amount || parseFloat(amount) <= 0) {
      setError("Please enter a valid amount")
      return
    }
    
    if (!token.mint_address) {
      setError("Token mint address not found")
      return
    }
    
    const effectiveSessionId = sessionId || userId
    if (!effectiveSessionId) {
      setError("Session expired. Please refresh and try again.")
      return
    }

    // Multi-wallet batch trading
    if (isMultiWalletMode && toggledWallets.size > 0) {
      const walletAddresses = getToggledWalletAddresses()
      
      if (walletAddresses.length === 0) {
        setError("Please select at least one wallet for batch trading")
        return
      }

      setIsLoading(true)
      setError(null)
      setSuccess(null)
      setBatchResults(null)

      console.log('[BATCH-TRADE] Executing batch trade:', {
        action: mode,
        token: token.mint_address?.slice(0, 8),
        amount,
        walletCount: walletAddresses.length,
        slippage,
      })

      try {
        const response = await fetch("/api/trade/batch", {
          method: "POST",
          headers: getAuthHeaders({
            sessionId: effectiveSessionId,
            walletAddress: activeWallet?.public_key || walletAddresses[0],
            userId: userId,
          }),
          body: JSON.stringify({
            walletAddresses,
            action: mode,
            tokenMint: token.mint_address,
            amountPerWallet: parseFloat(amount),
            slippageBps: parseFloat(slippage) * 100,
            tokenDecimals: token.decimals || 6,
            // Bonk pool USD1 support
            pool: (token as any).pool_type || 'pump',
            quoteMint: isUsd1Mode ? USD1_MINT : WSOL_MINT,
            // When isUsd1Mode is true, user is paying with USD1 directly (no conversion needed)
            // autoConvertUsd1 would be for converting SOL->USD1, which we don't want when user has USD1
            autoConvertUsd1: false,
          }),
        })

        const data = await response.json()
        console.log('[BATCH-TRADE] Response:', data)

        if (!response.ok || !data.success) {
          throw new Error(data.error?.message || "Batch trade failed")
        }

        // Safety check for data structure
        if (!data.data) {
          throw new Error("Invalid response from batch trade API")
        }

        const { successCount, failureCount, results } = data.data
        setBatchResults(results)
        
        // Emit trade events for INSTANT UI update for each successful wallet
        if (token.mint_address) {
          for (const result of results) {
            if (result.success && result.txSignature) {
              tradeEvents.emit({
                signature: result.txSignature,
                tokenMint: token.mint_address,
                type: mode,
                walletAddress: result.walletAddress,
                amountSol: parseFloat(amount) || 0,
                amountTokens: 0,
                timestamp: Date.now(),
                status: 'confirmed',
              })
            }
          }
        }
        
        if (successCount > 0) {
          setSuccess(`Successfully ${mode === 'buy' ? 'bought' : 'sold'} with ${successCount}/${results.length} wallets`)
          setAmount("")
          setTimeout(() => {
            refreshBalance()
            refreshTokenBalance()
            refreshPrice()
            refreshPNL()
          }, 2000)
        } else {
          setError(`All ${failureCount} trades failed`)
        }
      } catch (err) {
        console.error('[BATCH-TRADE] Error:', err)
        setError(err instanceof Error ? err.message : "Batch trade failed")
      } finally {
        setIsLoading(false)
      }
      return
    }

    // Single wallet trade
    if (!activeWallet?.public_key) {
      setError("No wallet selected. Please select a wallet.")
      return
    }

    // Check balance for buy mode
    if (mode === "buy") {
      if (isUsd1Mode) {
        // USD1 mode: check USD1 balance (fees still paid in SOL separately)
        if ((usd1Balance || 0) < parseFloat(amount)) {
          setError(`Insufficient USD1 balance. You have ${(usd1Balance || 0).toFixed(2)} USD1.`)
          return
        }
        // Also need some SOL for transaction fees
        if ((balanceSol || 0) < 0.01) {
          setError(`Insufficient SOL for fees. You have ${(balanceSol || 0).toFixed(4)} SOL, need ~0.01 SOL.`)
          return
        }
      } else {
        // SOL mode: check SOL balance with fee buffer
        if ((balanceSol || 0) < parseFloat(amount) + 0.01) {
          setError(`Insufficient balance. You have ${(balanceSol || 0).toFixed(4)} SOL.`)
          return
        }
      }
    }

    setIsLoading(true)
    setError(null)
    setSuccess(null)

    console.log('[TRADE] Executing trade:', {
      action: mode,
      token: token.mint_address?.slice(0, 8),
      tokenSymbol: token.symbol,
      poolType: (token as any).pool_type || 'pump',
      isJupiterToken: (token as any).pool_type === 'jupiter',
      amount,
      slippage,
      wallet: activeWallet.public_key?.slice(0, 8),
      sessionId: effectiveSessionId?.slice(0, 8),
      balance: balanceSol,
    })

    try {
      const response = await fetch("/api/trade", {
        method: "POST",
        headers: getAuthHeaders({
          sessionId: sessionId || userId,
          walletAddress: activeWallet.public_key,
          userId: userId,
        }),
        body: JSON.stringify({
          action: mode,
          tokenMint: token.mint_address,
          amount: parseFloat(amount),
          slippageBps: parseFloat(slippage) * 100,
          tokenDecimals: token.decimals || 6,
          // Bonk pool USD1 support
          pool: (token as any).pool_type || 'pump',
          quoteMint: isUsd1Mode ? USD1_MINT : WSOL_MINT,
          // When isUsd1Mode is true, user is paying with USD1 directly (no conversion needed)
          // autoConvertUsd1 would be for converting SOL->USD1, which we don't want when user has USD1
          autoConvertUsd1: false,
        }),
      })

      const data = await response.json()
      console.log('[TRADE] Response:', data)

      if (!response.ok) {
        // Use specific error message if available
        const errorCode = data.error?.code
        const friendlyMessage = errorCode && ERROR_MESSAGES[errorCode] 
          ? ERROR_MESSAGES[errorCode]
          : data.error?.message || data.error || "Trade failed - please try again"
        throw new Error(friendlyMessage)
      }

      // Emit trade event for INSTANT UI update (no waiting for Helius indexing!)
      if (data.data?.txSignature && token.mint_address) {
        tradeEvents.emit({
          signature: data.data.txSignature,
          tokenMint: token.mint_address,
          type: mode,
          walletAddress: activeWallet?.public_key || '',
          amountSol: data.data.amountSol || parseFloat(amount) || 0,
          amountTokens: data.data.amountTokens || 0,
          timestamp: Date.now(),
          status: 'confirmed',
        })
      }
      
      setSuccess(`Successfully ${mode === 'buy' ? 'bought' : 'sold'} ${token.symbol}!`)
      setAmount("")
      // Refresh balances and price after successful trade
      setTimeout(() => {
        refreshBalance()
        refreshTokenBalance()
        refreshPrice()
      }, 2000)
    } catch (err) {
      console.error('[TRADE] Error:', err)
      setError(err instanceof Error ? err.message : "Trade failed - please try again")
    } finally {
      setIsLoading(false)
    }
  }

  const quickAmounts = mode === "buy" ? ["0.1", "0.5", "1", "2"] : ["25", "50", "75", "100"]

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`
  }

  return (
    <div className="glass-panel-elevated p-4 rounded-lg">
      {/* Active Wallet Selector */}
      {isAuthenticated && activeWallet && (
        <div className="mb-4 relative" ref={selectorRef}>
          <div 
            onClick={() => setShowWalletSelector(!showWalletSelector)}
            className={cn(
              "flex items-center justify-between p-3 rounded-lg border transition-all cursor-pointer",
              "bg-[var(--bg-secondary)] border-[var(--border-subtle)]",
              "hover:border-[var(--aqua-primary)]",
              showWalletSelector && "border-[var(--aqua-primary)] ring-1 ring-[var(--aqua-primary)]/20"
            )}
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--aqua-primary)]/20 to-[var(--aqua-secondary)]/20 border border-[var(--aqua-primary)]/30 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-[var(--aqua-primary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h13a1 1 0 0 0 1-1v-3" strokeLinecap="round" />
                  <path d="M19 7h-8a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z" />
                  <circle cx="16" cy="12" r="1" fill="currentColor" />
                </svg>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Trading with</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-mono font-medium text-[var(--text-primary)] truncate">
                    {isMultiWalletMode ? `${toggledWallets.size} wallets` : (activeWallet.label || truncateAddress(activeWallet.public_key))}
                  </span>
                  {!isMultiWalletMode && activeWallet.is_primary && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--aqua-primary)]/20 text-[var(--aqua-primary)] font-medium flex-shrink-0">
                      Main
                    </span>
                  )}
                  {isMultiWalletMode && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400 font-medium flex-shrink-0">
                      Batch
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="text-right">
                <p className={cn(
                  "text-sm font-mono font-semibold",
                  balanceLoading ? "text-[var(--text-muted)]" : "text-[var(--text-primary)]"
                )}>
                  {balanceLoading ? "..." : `${(balanceSol || 0).toFixed(4)} SOL`}
                </p>
              </div>
              <div className="w-2 h-2 rounded-full bg-[var(--green)] animate-pulse" />
              <svg 
                className={cn("w-4 h-4 text-[var(--text-muted)] transition-transform", showWalletSelector && "rotate-180")} 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          {/* Wallet Selector Dropdown */}
          {showWalletSelector && (
            <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-lg shadow-xl overflow-hidden">
              <div className="p-2 border-b border-[var(--border-subtle)] flex items-center justify-between">
                <span className="text-xs text-[var(--text-muted)]">Select wallet for trading</span>
                <span className="text-[10px] text-[var(--aqua-primary)] font-medium">{wallets.length} wallet{wallets.length !== 1 ? 's' : ''}</span>
              </div>
              
              {/* Wallet List */}
              <div className="max-h-48 overflow-y-auto">
                {wallets.map((wallet) => (
                  <button
                    key={wallet.id}
                    onClick={() => {
                      setActiveWallet(wallet)
                      setShowWalletSelector(false)
                    }}
                    className={cn(
                      "w-full flex items-center justify-between p-3 text-left transition-all",
                      "hover:bg-[var(--bg-secondary)]",
                      wallet.id === activeWallet.id && "bg-[var(--aqua-primary)]/10"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold",
                        wallet.id === activeWallet.id 
                          ? "bg-[var(--aqua-primary)]/20 text-[var(--aqua-primary)]" 
                          : "bg-[var(--bg-secondary)] text-[var(--text-muted)]"
                      )}>
                        {(wallet.label || wallet.public_key.slice(0, 2)).slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-mono text-[var(--text-primary)]">
                            {wallet.label || truncateAddress(wallet.public_key)}
                          </span>
                          {wallet.is_primary && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--aqua-primary)]/20 text-[var(--aqua-primary)]">
                              Main
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-[var(--text-muted)]">
                          {truncateAddress(wallet.public_key)}
                        </span>
                      </div>
                    </div>
                    {wallet.id === activeWallet.id && (
                      <svg className="w-5 h-5 text-[var(--aqua-primary)]" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>

              {/* Add New Wallet Button */}
              <div className="p-2 border-t border-[var(--border-subtle)]">
                <button
                  onClick={() => {
                    setShowWalletSelector(false)
                    setIsOnboarding(true)
                  }}
                  className="w-full flex items-center justify-center gap-2 p-2 rounded-lg text-xs font-medium text-[var(--aqua-primary)] hover:bg-[var(--aqua-primary)]/10 transition-all"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Another Wallet
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Multi-Wallet Mode Section */}
      {isAuthenticated && wallets.length > 1 && (
        <div className="mb-4 border border-[var(--border-subtle)] rounded-lg overflow-hidden">
          {/* Toggle Header */}
          <div 
            className={cn(
              "flex items-center justify-between p-3 cursor-pointer transition-all",
              isMultiWalletMode ? "bg-purple-500/10" : "bg-[var(--bg-secondary)]"
            )}
            onClick={() => setMultiWalletMode(!isMultiWalletMode)}
          >
            <div className="flex items-center gap-2">
              <div className={cn(
                "w-5 h-5 rounded border-2 flex items-center justify-center transition-all",
                isMultiWalletMode 
                  ? "bg-purple-500 border-purple-500" 
                  : "border-[var(--border-default)]"
              )}>
                {isMultiWalletMode && (
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <span className="text-sm font-medium text-[var(--text-primary)]">Multi-Wallet Mode</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">{wallets.length} wallets</span>
            </div>
            <svg 
              className={cn("w-4 h-4 text-[var(--text-muted)] transition-transform", isMultiWalletMode && "rotate-180")} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          {/* Wallet Cards (expanded when enabled) */}
          {isMultiWalletMode && (
            <div className="p-3 border-t border-[var(--border-subtle)]">
              <div className="flex flex-wrap gap-2">
                {walletPNLData.map((wallet) => {
                  const pnl = formatPnlPercent(wallet.unrealizedPnlPercent)
                  return (
                    <div 
                      key={wallet.walletId}
                      onClick={() => toggleWallet(wallet.walletId)}
                      className={cn(
                        "flex flex-col p-2 rounded-lg border cursor-pointer transition-all min-w-[80px]",
                        wallet.isToggled 
                          ? "border-purple-500 bg-purple-500/10" 
                          : "border-[var(--border-subtle)] bg-[var(--bg-secondary)] hover:border-[var(--border-default)]"
                      )}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <div className={cn(
                          "w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0",
                          wallet.isToggled 
                            ? "bg-purple-500 border-purple-500" 
                            : "border-[var(--border-default)]"
                        )}>
                          {wallet.isToggled && (
                            <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <span className="text-[10px] font-bold text-[var(--text-primary)] truncate max-w-[52px]">
                          {wallet.label}
                        </span>
                      </div>
                      {/* SOL Balance */}
                      <div className="text-[10px] font-bold font-mono text-[var(--aqua-primary)] mb-0.5">
                        {formatSolBalance(wallet.solBalance)} SOL
                      </div>
                      {/* Token Balance */}
                      <div className="text-[10px] font-semibold font-mono text-[var(--text-muted)]">
                        {formatTokenBalance(wallet.tokenBalance)} {token.symbol?.slice(0, 4)}
                      </div>
                      {/* PNL */}
                      <div className={cn(
                        "text-[10px] font-bold",
                        pnl.color === "green" ? "text-[var(--green)]" : 
                        pnl.color === "red" ? "text-[var(--red)]" : "text-[var(--text-muted)]"
                      )}>
                        {pnl.text}
                      </div>
                    </div>
                  )
                })}
              </div>
              
              {/* Summary */}
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-[var(--text-muted)] font-semibold">
                  {toggledWallets.size} wallet{toggledWallets.size !== 1 ? 's' : ''} • {formatSolBalance(totalSolBalance)} SOL
                </span>
                <span className="text-[var(--text-primary)] font-bold">
                  {formatTokenBalance(totalTokenBalance)} {token.symbol}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Volume Bot Quick Controls */}
      {isAuthenticated && token.mint_address && (
        <div className="mb-4">
          <VolumeBotQuickControls 
            tokenMint={token.mint_address} 
            tokenSymbol={token.symbol || 'TOKEN'}
            currentPrice={effectivePriceSol}
          />
        </div>
      )}

      {/* Header */}
      <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Swap {token.symbol}</h3>

      {/* Bonk Pool: USD1/SOL Quote Currency Toggle */}
      {isBonkPool && (
        <div className="mb-4 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center">
                <DollarSign className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <div>
                <span className="text-xs font-medium text-[var(--text-primary)]">Quote Currency</span>
                {tokenQuoteMint === USD1_MINT && (
                  <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">Token Default: USD1</span>
                )}
              </div>
            </div>
            <div className="flex gap-1 bg-[var(--bg-secondary)] p-0.5 rounded-lg border border-[var(--border-subtle)]">
              <button
                onClick={() => setQuoteCurrency('SOL')}
                className={cn(
                  "px-3 py-1.5 rounded text-xs font-medium transition-all",
                  quoteCurrency === 'SOL'
                    ? "bg-gradient-to-r from-purple-500 to-blue-500 text-white shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                )}
              >
                SOL
              </button>
              <button
                onClick={() => setQuoteCurrency('USD1')}
                className={cn(
                  "px-3 py-1.5 rounded text-xs font-medium transition-all flex items-center gap-1",
                  quoteCurrency === 'USD1'
                    ? "bg-gradient-to-r from-amber-500 to-yellow-500 text-white shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                )}
              >
                <DollarSign className="w-3 h-3" />
                USD1
              </button>
            </div>
          </div>
          {isUsd1Mode && (
            <p className="text-[10px] text-amber-400/80 mt-2">
              {mode === 'buy' 
                ? '💱 Your SOL will be auto-converted to USD1 before buying'
                : '💱 Proceeds will be in USD1, then auto-converted to SOL'
              }
            </p>
          )}
        </div>
      )}

      <div className="flex gap-2 mb-6 bg-[var(--bg-secondary)] p-1 rounded-lg border border-[var(--border-subtle)]">
        <button
          onClick={() => setMode("buy")}
          className={cn(
            "flex-1 py-2.5 rounded font-semibold text-sm transition-all",
            mode === "buy"
              ? "bg-[var(--green)] text-white"
              : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
          )}
        >
          Buy
        </button>
        <button
          onClick={() => setMode("sell")}
          className={cn(
            "flex-1 py-2.5 rounded font-semibold text-sm transition-all",
            mode === "sell"
              ? "bg-[var(--red)] text-white"
              : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
          )}
        >
          Sell
        </button>
      </div>

      {/* Amount Input */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-[var(--text-muted)] uppercase mb-2 tracking-wide">
          {mode === "buy" ? "Amount in SOL" : "Amount in " + token.symbol}
          {isMultiWalletMode && mode === "buy" && (
            <span className="text-purple-400 ml-1">(per wallet)</span>
          )}
        </label>
        <div className="relative">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="input w-full text-lg"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)] font-medium">
            {mode === "buy" ? "SOL" : token.symbol}
          </div>
        </div>

        {/* Quick amounts */}
        <div className="flex gap-1 mt-2">
          {quickAmounts.map((amt) => (
            <button
              key={amt}
              onClick={() => handleQuickAmount(amt)}
              className="flex-1 px-2 py-1.5 rounded text-xs font-medium border border-[var(--border-default)] text-[var(--text-muted)] hover:border-[var(--aqua-primary)] hover:text-[var(--aqua-primary)] transition-all"
            >
              {mode === "buy" ? amt : `${amt}%`}
            </button>
          ))}
        </div>
        
        {/* Token Balance Display for Sell Mode */}
        {mode === "sell" && activeWallet && (
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-[var(--text-muted)]">Your {token.symbol} balance:</span>
            <span className={cn(
              "font-mono font-medium",
              tokenBalanceLoading ? "text-[var(--text-muted)]" : "text-[var(--text-primary)]"
            )}>
              {tokenBalanceLoading ? "..." : isMultiWalletMode ? formatTokenBalance(totalTokenBalance) : (tokenBalance > 0 
                ? tokenBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })
                : "0")
              } {token.symbol}
            </span>
          </div>
        )}
      </div>

      {/* Arrow separator */}
      <div className="flex items-center justify-center my-3 text-[var(--text-muted)]">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 2v12M4 10l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>

      {/* Output estimate */}
      <div className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] mb-4">
        <div className="text-xs text-[var(--text-muted)] uppercase font-medium mb-1">You receive</div>
        <div className="flex items-baseline justify-between">
          <span className="text-lg font-semibold text-[var(--text-primary)]">
            {mode === "buy"
              ? (estimatedTokens || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })
              : (estimatedSol || 0).toFixed(6)}
            {isMultiWalletMode && mode === "buy" && toggledWallets.size > 1 && (
              <span className="text-xs text-[var(--text-muted)] ml-1">x {toggledWallets.size}</span>
            )}
          </span>
          <span className="text-xs text-[var(--text-muted)] font-medium">{mode === "buy" ? token.symbol : "SOL"}</span>
        </div>
        {isMultiWalletMode && toggledWallets.size > 1 && mode === "buy" && (
          <div className="text-xs text-purple-400 mt-1">
            Total: {(estimatedTokens * toggledWallets.size).toLocaleString(undefined, { maximumFractionDigits: 2 })} {token.symbol}
          </div>
        )}
      </div>

      {/* Slippage */}
      <div className="mb-6">
        <label className="block text-xs font-medium text-[var(--text-muted)] uppercase mb-2 tracking-wide">
          Slippage tolerance
        </label>
        <div className="flex gap-1">
          {["0.5", "1", "2", "5"].map((s) => (
            <button
              key={s}
              onClick={() => {
                setSlippage(s)
                setShowCustomSlippage(false)
              }}
              className={cn(
                "flex-1 py-1.5 rounded text-xs font-medium border transition-all",
                slippage === s && !showCustomSlippage
                  ? "border-[var(--aqua-primary)] bg-[var(--aqua-bg)] text-[var(--aqua-primary)]"
                  : "border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--border-default)]",
              )}
            >
              {s}%
            </button>
          ))}
          {/* Custom button */}
          <button
            onClick={() => {
              setShowCustomSlippage(true)
              setCustomSlippage(slippage)
            }}
            className={cn(
              "flex-1 py-1.5 rounded text-xs font-medium border transition-all",
              showCustomSlippage || !["0.5", "1", "2", "5"].includes(slippage)
                ? "border-[var(--aqua-primary)] bg-[var(--aqua-bg)] text-[var(--aqua-primary)]"
                : "border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--border-default)]",
            )}
          >
            {!["0.5", "1", "2", "5"].includes(slippage) ? `${slippage}%` : "Custom"}
          </button>
        </div>
        
        {/* Custom slippage input */}
        {showCustomSlippage && (
          <div className="mt-2 flex gap-2">
            <div className="relative flex-1">
              <input
                type="number"
                value={customSlippage}
                onChange={(e) => setCustomSlippage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCustomSlippageSubmit()}
                placeholder="Enter slippage %"
                min="0.1"
                max="50"
                step="0.1"
                className="w-full h-9 px-3 pr-8 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--aqua-primary)]"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)]">%</span>
            </div>
            <button
              onClick={handleCustomSlippageSubmit}
              className="px-4 h-9 rounded-lg bg-[var(--aqua-primary)] text-white text-xs font-semibold hover:bg-[var(--aqua-secondary)] transition-colors"
            >
              Set
            </button>
          </div>
        )}
        
        {/* Slippage warning for high values */}
        {parseFloat(slippage) >= 10 && (
          <div className="mt-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <p className="text-[10px] text-amber-400">
              ⚠️ High slippage ({slippage}%) - You may receive significantly less than expected
            </p>
          </div>
        )}
      </div>

      {/* Insufficient Balance Warning */}
      {insufficientBalance && mode === "buy" && !isMultiWalletMode && (
        <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <div className="text-amber-400 text-sm">
              <p className="font-medium">Insufficient balance</p>
              <p className="text-xs opacity-80">
                {isUsd1Mode ? (
                  <>You have {(usd1Balance || 0).toFixed(2)} USD1, need {(parsedAmount || 0).toFixed(2)} USD1</>
                ) : (
                  <>You have {(balanceSol || 0).toFixed(4)} SOL, need ~{((parsedAmount || 0) + 0.01).toFixed(4)} SOL (incl. fees)</>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Batch Results */}
      {batchResults && (
        <div className="mb-4 p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
          <div className="text-xs font-medium text-[var(--text-muted)] mb-2">Batch Results</div>
          <div className="space-y-1 max-h-24 overflow-y-auto">
            {batchResults.map((result, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs">
                <span className="font-mono text-[var(--text-muted)]">
                  {result.walletAddress.slice(0, 4)}...{result.walletAddress.slice(-4)}
                </span>
                {result.success ? (
                  <span className="text-[var(--green)]">Success</span>
                ) : (
                  <span className="text-[var(--red)]" title={result.error}>Failed</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error/Success messages */}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <span className="text-red-400 text-sm">{error}</span>
          </div>
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="text-green-400 text-sm">{success}</span>
          </div>
        </div>
      )}

      {/* Trade button */}
      {!isAuthenticated ? (
        <button onClick={() => setIsOnboarding(true)} className="btn-primary w-full">
          Connect Wallet to Trade
        </button>
      ) : (
        <button
          onClick={handleTrade}
          disabled={!amount || isLoading || (insufficientBalance && !isMultiWalletMode) || (isMultiWalletMode && toggledWallets.size === 0)}
          className={cn(
            "w-full py-3 rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed",
            mode === "buy"
              ? "bg-[var(--green)] text-white hover:bg-[var(--green-light)] shadow-lg hover:shadow-xl hover:shadow-[var(--green)]/25"
              : "bg-[var(--red)] text-white hover:bg-[var(--red-light)] shadow-lg hover:shadow-xl hover:shadow-[var(--red)]/25",
          )}
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              {isMultiWalletMode ? "Processing Batch..." : "Processing..."}
            </span>
          ) : insufficientBalance && !isMultiWalletMode ? (
            "Insufficient Balance"
          ) : isMultiWalletMode && toggledWallets.size === 0 ? (
            "Select Wallets"
          ) : isMultiWalletMode ? (
            `${mode === "buy" ? "Buy" : "Sell"} with ${toggledWallets.size} Wallet${toggledWallets.size !== 1 ? 's' : ''}`
          ) : (
            `${mode === "buy" ? "Buy" : "Sell"} ${token.symbol}`
          )}
        </button>
      )}

      {/* Fee breakdown */}
      {amount && parseFloat(amount) > 0 && (
        <div className="mt-4">
          <FeeBreakdown
            operationAmount={mode === "buy" ? parseFloat(amount) * (isMultiWalletMode ? toggledWallets.size : 1) : estimatedSol * (isMultiWalletMode ? toggledWallets.size : 1)}
            currentBalance={balanceSol}
            compact={true}
          />
        </div>
      )}

      {/* Price info footer */}
      <div className="mt-4 pt-4 border-t border-[var(--border-subtle)] space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-[var(--text-muted)]">Price</span>
          <div className="flex items-center gap-1.5">
            {priceLoading && (
              <div className="w-2 h-2 border border-[var(--aqua-primary)] border-t-transparent rounded-full animate-spin" />
            )}
            <span className="text-[var(--text-primary)] font-medium">
              {effectivePriceSol > 0 ? effectivePriceSol.toFixed(8) : "Loading..."} SOL
            </span>
            {livePriceSol > 0 && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-[var(--aqua-primary)]/20 text-[var(--aqua-primary)]">LIVE</span>
            )}
          </div>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-muted)]">Price impact</span>
          <span className="text-[var(--green)]">&lt;0.01%</span>
        </div>
      </div>

      {/* PROPEL Earn Shortcut */}
      <div className="mt-4">
        <EarnShortcut tokenSymbol={token.symbol} />
      </div>
    </div>
  )
}
