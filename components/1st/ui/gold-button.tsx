"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export interface GoldButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  loading?: boolean
  pulse?: boolean
  glow?: boolean
}

const GoldButton = React.forwardRef<HTMLButtonElement, GoldButtonProps>(
  ({ 
    className, 
    variant = 'primary', 
    size = 'md', 
    loading = false,
    pulse = false,
    glow = false,
    disabled,
    children, 
    ...props 
  }, ref) => {
    const baseStyles = `
      relative inline-flex items-center justify-center gap-2
      font-semibold tracking-wide uppercase
      transition-all duration-200 ease-out
      disabled:opacity-50 disabled:cursor-not-allowed
      focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black
    `
    
    const variants = {
      primary: `
        bg-gradient-to-b from-[#FFD700] via-[#D4AF37] to-[#B8860B]
        text-black
        border border-[#FFD700]/50
        hover:from-[#FFE44D] hover:via-[#E5C04A] hover:to-[#C9971C]
        hover:shadow-[0_0_20px_rgba(212,175,55,0.5)]
        active:from-[#B8860B] active:via-[#D4AF37] active:to-[#FFD700]
        focus:ring-[#D4AF37]
      `,
      secondary: `
        bg-[#1A1A1A]
        text-[#D4AF37]
        border border-[#D4AF37]/30
        hover:bg-[#252525]
        hover:border-[#D4AF37]/50
        hover:shadow-[0_0_15px_rgba(212,175,55,0.2)]
        active:bg-[#111111]
        focus:ring-[#D4AF37]/50
      `,
      outline: `
        bg-transparent
        text-[#D4AF37]
        border-2 border-[#D4AF37]/50
        hover:bg-[#D4AF37]/10
        hover:border-[#D4AF37]
        hover:shadow-[0_0_15px_rgba(212,175,55,0.3)]
        active:bg-[#D4AF37]/20
        focus:ring-[#D4AF37]/50
      `,
      ghost: `
        bg-transparent
        text-[#D4AF37]
        border border-transparent
        hover:bg-[#D4AF37]/10
        hover:border-[#D4AF37]/20
        active:bg-[#D4AF37]/15
        focus:ring-[#D4AF37]/30
      `,
      danger: `
        bg-gradient-to-b from-[#FF4444] via-[#CC3333] to-[#991111]
        text-white
        border border-[#FF4444]/50
        hover:from-[#FF5555] hover:via-[#DD4444] hover:to-[#AA2222]
        hover:shadow-[0_0_20px_rgba(255,68,68,0.5)]
        active:from-[#991111] active:via-[#CC3333] active:to-[#FF4444]
        focus:ring-[#FF4444]
      `,
      success: `
        bg-gradient-to-b from-[#00FF41] via-[#00CC33] to-[#009922]
        text-black
        border border-[#00FF41]/50
        hover:from-[#33FF66] hover:via-[#22DD44] hover:to-[#11AA33]
        hover:shadow-[0_0_20px_rgba(0,255,65,0.5)]
        active:from-[#009922] active:via-[#00CC33] active:to-[#00FF41]
        focus:ring-[#00FF41]
      `,
    }
    
    const sizes = {
      sm: 'h-8 px-3 text-xs rounded',
      md: 'h-10 px-4 text-sm rounded-md',
      lg: 'h-12 px-6 text-base rounded-lg',
      xl: 'h-14 px-8 text-lg rounded-lg',
    }
    
    const pulseAnimation = pulse ? 'animate-[first-pulse-gold_2s_ease-in-out_infinite]' : ''
    const glowEffect = glow ? 'shadow-[0_0_20px_rgba(212,175,55,0.5)]' : ''
    
    return (
      <button
        ref={ref}
        className={cn(
          baseStyles,
          variants[variant],
          sizes[size],
          pulseAnimation,
          glowEffect,
          className
        )}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg
            className="animate-spin h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {children}
        
        {/* Shine effect overlay */}
        {variant === 'primary' && !disabled && !loading && (
          <span 
            className="absolute inset-0 overflow-hidden rounded-[inherit] pointer-events-none"
            aria-hidden="true"
          >
            <span 
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
              style={{
                transform: 'translateX(-100%)',
                animation: 'shine 3s ease-in-out infinite',
              }}
            />
          </span>
        )}
      </button>
    )
  }
)

GoldButton.displayName = "GoldButton"

export { GoldButton }

// Specialized buttons for common actions

export function SnipeButton({ 
  className, 
  children = "SNIPE", 
  ...props 
}: Omit<GoldButtonProps, 'variant'>) {
  return (
    <GoldButton
      variant="primary"
      glow
      className={cn("font-bold tracking-widest", className)}
      {...props}
    >
      <span className="mr-1">🎯</span>
      {children}
    </GoldButton>
  )
}

export function EmergencyStopButton({ 
  className, 
  children = "EMERGENCY STOP", 
  ...props 
}: Omit<GoldButtonProps, 'variant'>) {
  return (
    <GoldButton
      variant="danger"
      pulse
      className={cn("font-bold tracking-widest", className)}
      {...props}
    >
      <span className="mr-1">⚡</span>
      {children}
    </GoldButton>
  )
}

export function StartSniperButton({ 
  className, 
  children = "ARM SNIPER", 
  ...props 
}: Omit<GoldButtonProps, 'variant'>) {
  return (
    <GoldButton
      variant="success"
      glow
      className={cn("font-bold tracking-widest", className)}
      {...props}
    >
      <span className="mr-1">🟢</span>
      {children}
    </GoldButton>
  )
}

export function StopSniperButton({ 
  className, 
  children = "DISARM", 
  ...props 
}: Omit<GoldButtonProps, 'variant'>) {
  return (
    <GoldButton
      variant="secondary"
      className={cn("font-bold tracking-widest", className)}
      {...props}
    >
      <span className="mr-1">🔴</span>
      {children}
    </GoldButton>
  )
}

