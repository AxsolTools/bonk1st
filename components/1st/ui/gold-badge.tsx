"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export interface GoldBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'gold' | 'outline'
  size?: 'xs' | 'sm' | 'md'
  pulse?: boolean
  dot?: boolean
}

const GoldBadge = React.forwardRef<HTMLSpanElement, GoldBadgeProps>(
  ({ 
    className, 
    variant = 'default', 
    size = 'sm',
    pulse = false,
    dot = false,
    children, 
    ...props 
  }, ref) => {
    const variants = {
      default: 'bg-[#1A1A1A] text-white/80 border-[#333333]',
      success: 'bg-[#00FF41]/10 text-[#00FF41] border-[#00FF41]/30',
      warning: 'bg-[#FFD700]/10 text-[#FFD700] border-[#FFD700]/30',
      danger: 'bg-[#FF3333]/10 text-[#FF3333] border-[#FF3333]/30',
      info: 'bg-[#00FFFF]/10 text-[#00FFFF] border-[#00FFFF]/30',
      gold: 'bg-gradient-to-r from-[#D4AF37]/20 to-[#FFD700]/20 text-[#FFD700] border-[#D4AF37]/40',
      outline: 'bg-transparent text-[#D4AF37] border-[#D4AF37]/50',
    }
    
    const sizes = {
      xs: 'text-[9px] px-1.5 py-0.5 rounded',
      sm: 'text-[10px] px-2 py-0.5 rounded',
      md: 'text-xs px-2.5 py-1 rounded-md',
    }
    
    const dotColors = {
      default: 'bg-white/50',
      success: 'bg-[#00FF41]',
      warning: 'bg-[#FFD700]',
      danger: 'bg-[#FF3333]',
      info: 'bg-[#00FFFF]',
      gold: 'bg-[#FFD700]',
      outline: 'bg-[#D4AF37]',
    }
    
    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center gap-1.5 font-semibold uppercase tracking-wider border",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {dot && (
          <span 
            className={cn(
              "w-1.5 h-1.5 rounded-full",
              dotColors[variant],
              pulse && "animate-pulse"
            )}
          />
        )}
        {children}
      </span>
    )
  }
)

GoldBadge.displayName = "GoldBadge"

// Status Badge - Pre-configured for common statuses
export interface StatusBadgeProps {
  status: 'active' | 'inactive' | 'pending' | 'success' | 'error' | 'warning'
  label?: string
  pulse?: boolean
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status, label, pulse }) => {
  const config = {
    active: { variant: 'success' as const, text: 'ACTIVE', dot: true },
    inactive: { variant: 'default' as const, text: 'INACTIVE', dot: true },
    pending: { variant: 'warning' as const, text: 'PENDING', dot: true },
    success: { variant: 'success' as const, text: 'SUCCESS', dot: false },
    error: { variant: 'danger' as const, text: 'ERROR', dot: false },
    warning: { variant: 'warning' as const, text: 'WARNING', dot: false },
  }
  
  const { variant, text, dot } = config[status]
  
  return (
    <GoldBadge 
      variant={variant} 
      dot={dot} 
      pulse={pulse ?? (status === 'active' || status === 'pending')}
    >
      {label || text}
    </GoldBadge>
  )
}

// Pool Badge - For displaying pool types
export interface PoolBadgeProps {
  pool: 'bonk-usd1' | 'bonk-sol' | 'pump' | 'raydium'
}

const PoolBadge: React.FC<PoolBadgeProps> = ({ pool }) => {
  const config = {
    'bonk-usd1': { text: 'BONK/USD1', variant: 'gold' as const },
    'bonk-sol': { text: 'BONK/SOL', variant: 'warning' as const },
    'pump': { text: 'PUMP.FUN', variant: 'info' as const },
    'raydium': { text: 'RAYDIUM', variant: 'success' as const },
  }
  
  const { text, variant } = config[pool]
  
  return (
    <GoldBadge variant={variant} size="xs">
      {text}
    </GoldBadge>
  )
}

// Block Badge - For displaying block numbers
export interface BlockBadgeProps {
  block: number
  isBlockZero?: boolean
}

const BlockBadge: React.FC<BlockBadgeProps> = ({ block, isBlockZero }) => {
  if (isBlockZero || block === 0) {
    return (
      <GoldBadge variant="gold" size="xs" pulse>
        BLOCK 0
      </GoldBadge>
    )
  }
  
  return (
    <GoldBadge variant="outline" size="xs">
      BLOCK {block}
    </GoldBadge>
  )
}

// PnL Badge - For displaying profit/loss
export interface PnLBadgeProps {
  pnlPercent: number
  showSign?: boolean
}

const PnLBadge: React.FC<PnLBadgeProps> = ({ pnlPercent, showSign = true }) => {
  const isPositive = pnlPercent >= 0
  const variant = isPositive ? 'success' : 'danger'
  const sign = showSign ? (isPositive ? '+' : '') : ''
  
  return (
    <GoldBadge variant={variant} size="sm">
      {sign}{pnlPercent.toFixed(2)}%
    </GoldBadge>
  )
}

// Token Logo with fallback
export interface TokenLogoProps {
  src?: string
  symbol: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const TokenLogo: React.FC<TokenLogoProps> = ({ src, symbol, size = 'md', className }) => {
  const [error, setError] = React.useState(false)
  
  const sizes = {
    sm: 'w-6 h-6 text-[8px]',
    md: 'w-8 h-8 text-[10px]',
    lg: 'w-12 h-12 text-xs',
  }
  
  if (!src || error) {
    // Fallback to symbol initials
    const initials = symbol.slice(0, 2).toUpperCase()
    return (
      <div 
        className={cn(
          "flex items-center justify-center rounded-full",
          "bg-gradient-to-br from-[#D4AF37]/20 to-[#B8860B]/20",
          "border border-[#D4AF37]/30",
          "font-bold text-[#D4AF37]",
          sizes[size],
          className
        )}
      >
        {initials}
      </div>
    )
  }
  
  return (
    <img
      src={src}
      alt={symbol}
      onError={() => setError(true)}
      className={cn(
        "rounded-full object-cover",
        "border border-[#D4AF37]/20",
        sizes[size],
        className
      )}
    />
  )
}

export { 
  GoldBadge, 
  StatusBadge, 
  PoolBadge, 
  BlockBadge,
  PnLBadge,
  TokenLogo,
}

