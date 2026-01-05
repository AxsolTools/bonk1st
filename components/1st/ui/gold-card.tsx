"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export interface GoldCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'terminal' | 'highlight' | 'danger' | 'success'
  glow?: boolean
  pulse?: boolean
  noPadding?: boolean
}

const GoldCard = React.forwardRef<HTMLDivElement, GoldCardProps>(
  ({ 
    className, 
    variant = 'default',
    glow = false,
    pulse = false,
    noPadding = false,
    children, 
    ...props 
  }, ref) => {
    const baseStyles = `
      relative overflow-hidden
      backdrop-blur-xl
      transition-all duration-300 ease-out
    `
    
    const variants = {
      default: `
        bg-[#0A0A0A]/90
        border border-[#D4AF37]/15
        hover:border-[#D4AF37]/30
        rounded-xl
      `,
      elevated: `
        bg-gradient-to-b from-[#111111] to-[#0A0A0A]
        border border-[#D4AF37]/20
        hover:border-[#D4AF37]/40
        shadow-[0_8px_32px_rgba(0,0,0,0.6)]
        hover:shadow-[0_12px_40px_rgba(0,0,0,0.7),0_0_20px_rgba(212,175,55,0.1)]
        rounded-xl
      `,
      terminal: `
        bg-[#000000]
        border border-[#D4AF37]/30
        rounded-lg
        font-mono
        shadow-[inset_0_0_30px_rgba(0,0,0,0.8)]
      `,
      highlight: `
        bg-gradient-to-br from-[#1A1A0A] to-[#0A0A0A]
        border-2 border-[#D4AF37]/40
        hover:border-[#D4AF37]/60
        shadow-[0_0_30px_rgba(212,175,55,0.15)]
        hover:shadow-[0_0_40px_rgba(212,175,55,0.25)]
        rounded-xl
      `,
      danger: `
        bg-gradient-to-br from-[#1A0A0A] to-[#0A0A0A]
        border border-[#FF3333]/30
        hover:border-[#FF3333]/50
        shadow-[0_0_20px_rgba(255,51,51,0.1)]
        rounded-xl
      `,
      success: `
        bg-gradient-to-br from-[#0A1A0A] to-[#0A0A0A]
        border border-[#00FF41]/30
        hover:border-[#00FF41]/50
        shadow-[0_0_20px_rgba(0,255,65,0.1)]
        rounded-xl
      `,
    }
    
    const glowEffect = glow 
      ? 'shadow-[0_0_30px_rgba(212,175,55,0.3)] hover:shadow-[0_0_40px_rgba(212,175,55,0.4)]' 
      : ''
    
    const pulseAnimation = pulse 
      ? 'animate-[first-pulse-gold_2s_ease-in-out_infinite]' 
      : ''
    
    const padding = noPadding ? '' : 'p-4'
    
    return (
      <div
        ref={ref}
        className={cn(
          baseStyles,
          variants[variant],
          glowEffect,
          pulseAnimation,
          padding,
          className
        )}
        {...props}
      >
        {children}
        
        {/* Subtle gold corner accent */}
        {(variant === 'elevated' || variant === 'highlight') && (
          <>
            <div 
              className="absolute top-0 left-0 w-8 h-8 pointer-events-none"
              style={{
                background: 'linear-gradient(135deg, rgba(212,175,55,0.2) 0%, transparent 50%)',
              }}
            />
            <div 
              className="absolute bottom-0 right-0 w-8 h-8 pointer-events-none"
              style={{
                background: 'linear-gradient(-45deg, rgba(212,175,55,0.2) 0%, transparent 50%)',
              }}
            />
          </>
        )}
      </div>
    )
  }
)

GoldCard.displayName = "GoldCard"

// Card Header
export interface GoldCardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string
  subtitle?: string
  action?: React.ReactNode
  status?: 'active' | 'inactive' | 'warning' | 'error'
}

const GoldCardHeader = React.forwardRef<HTMLDivElement, GoldCardHeaderProps>(
  ({ className, title, subtitle, action, status, ...props }, ref) => {
    const statusColors = {
      active: 'bg-[#00FF41]',
      inactive: 'bg-[#666666]',
      warning: 'bg-[#FFD700]',
      error: 'bg-[#FF3333]',
    }
    
    return (
      <div
        ref={ref}
        className={cn(
          "flex items-center justify-between pb-3 mb-3 border-b border-[#D4AF37]/10",
          className
        )}
        {...props}
      >
        <div className="flex items-center gap-3">
          {status && (
            <span 
              className={cn(
                "w-2 h-2 rounded-full",
                statusColors[status],
                status === 'active' && 'animate-pulse'
              )}
            />
          )}
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              {title}
            </h3>
            {subtitle && (
              <p className="text-xs text-white/50 mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {action && (
          <div className="flex-shrink-0">
            {action}
          </div>
        )}
      </div>
    )
  }
)

GoldCardHeader.displayName = "GoldCardHeader"

// Card Content
const GoldCardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("", className)}
    {...props}
  />
))

GoldCardContent.displayName = "GoldCardContent"

// Card Footer
const GoldCardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex items-center justify-between pt-3 mt-3 border-t border-[#D4AF37]/10",
      className
    )}
    {...props}
  />
))

GoldCardFooter.displayName = "GoldCardFooter"

// Stat Card - For displaying metrics
export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string
  value: string | number
  change?: number
  prefix?: string
  suffix?: string
  size?: 'sm' | 'md' | 'lg'
}

const StatCard = React.forwardRef<HTMLDivElement, StatCardProps>(
  ({ className, label, value, change, prefix, suffix, size = 'md', ...props }, ref) => {
    const sizes = {
      sm: { label: 'text-[10px]', value: 'text-lg' },
      md: { label: 'text-xs', value: 'text-2xl' },
      lg: { label: 'text-sm', value: 'text-3xl' },
    }
    
    const changeColor = change === undefined 
      ? '' 
      : change >= 0 
        ? 'text-[#00FF41]' 
        : 'text-[#FF3333]'
    
    return (
      <div
        ref={ref}
        className={cn(
          "bg-[#0A0A0A]/80 border border-[#D4AF37]/10 rounded-lg p-3",
          className
        )}
        {...props}
      >
        <p className={cn("text-white/50 uppercase tracking-wider mb-1", sizes[size].label)}>
          {label}
        </p>
        <div className="flex items-baseline gap-2">
          <span className={cn("font-bold text-[#D4AF37] font-mono", sizes[size].value)}>
            {prefix}{value}{suffix}
          </span>
          {change !== undefined && (
            <span className={cn("text-xs font-mono", changeColor)}>
              {change >= 0 ? '+' : ''}{change.toFixed(2)}%
            </span>
          )}
        </div>
      </div>
    )
  }
)

StatCard.displayName = "StatCard"

export { 
  GoldCard, 
  GoldCardHeader, 
  GoldCardContent, 
  GoldCardFooter,
  StatCard,
}

