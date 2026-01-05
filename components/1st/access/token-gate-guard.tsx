"use client"

import * as React from "react"
import { useTokenGate } from "@/hooks/use-token-gate"
import { GoldCard } from "../ui/gold-card"
import { GoldButton } from "../ui/gold-button"
import { GoldBadge } from "../ui/gold-badge"

interface TokenGateGuardProps {
  children: React.ReactNode
}

/**
 * Wraps content that requires token gate access
 * Shows a gate screen if user doesn't hold enough tokens
 */
export function TokenGateGuard({ children }: TokenGateGuardProps) {
  const {
    isLoading,
    hasAccess,
    gateEnabled,
    tokenSymbol,
    requiredAmount,
    currentBalance,
    message,
  } = useTokenGate()
  
  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/50">Checking access...</p>
        </div>
      </div>
    )
  }
  
  // If gate is disabled or user has access, show content
  if (!gateEnabled || hasAccess) {
    return <>{children}</>
  }
  
  // Access denied - show gate screen
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <GoldCard variant="elevated" className="max-w-md w-full text-center p-8">
        {/* Lock icon */}
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center">
          <svg 
            className="w-10 h-10 text-[#D4AF37]" 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" 
            />
          </svg>
        </div>
        
        <h2 className="text-2xl font-bold text-[#D4AF37] mb-2">
          TOKEN GATE
        </h2>
        
        <p className="text-white/70 mb-6">
          Hold <span className="text-[#FFD700] font-bold">{requiredAmount.toLocaleString()} ${tokenSymbol}</span> to access the BONK1ST Sniper
        </p>
        
        {/* Balance display */}
        <div className="bg-[#0A0A0A] rounded-lg p-4 mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-white/40">Your Balance</span>
            <GoldBadge variant={currentBalance >= requiredAmount ? 'success' : 'danger'} size="xs">
              {currentBalance >= requiredAmount ? 'SUFFICIENT' : 'INSUFFICIENT'}
            </GoldBadge>
          </div>
          <p className="text-2xl font-bold text-white">
            {currentBalance.toLocaleString()} <span className="text-[#D4AF37]">${tokenSymbol}</span>
          </p>
          <p className="text-xs text-white/40 mt-1">
            Need {Math.max(0, requiredAmount - currentBalance).toLocaleString()} more
          </p>
        </div>
        
        {/* Message */}
        <p className="text-sm text-white/50 mb-6">
          {message}
        </p>
        
        {/* Actions */}
        <div className="space-y-3">
          <GoldButton 
            variant="primary" 
            className="w-full"
            onClick={() => {
              // Open swap/buy page for the token
              window.open(`https://jup.ag/swap/SOL-${tokenSymbol}`, '_blank')
            }}
          >
            BUY ${tokenSymbol}
          </GoldButton>
          
          <GoldButton 
            variant="ghost" 
            className="w-full"
            onClick={() => window.location.reload()}
          >
            REFRESH
          </GoldButton>
        </div>
        
        {/* Info */}
        <p className="text-[10px] text-white/30 mt-6">
          Token holdings are checked from your main wallet. Make sure your wallet is connected and set as main.
        </p>
      </GoldCard>
    </div>
  )
}

