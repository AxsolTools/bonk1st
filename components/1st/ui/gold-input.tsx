"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export interface GoldInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string
  prefix?: React.ReactNode
  suffix?: React.ReactNode
  variant?: 'default' | 'terminal'
}

const GoldInput = React.forwardRef<HTMLInputElement, GoldInputProps>(
  ({ 
    className, 
    label,
    hint,
    error,
    prefix,
    suffix,
    variant = 'default',
    type = 'text',
    ...props 
  }, ref) => {
    const id = React.useId()
    
    const variants = {
      default: `
        bg-[#0A0A0A]
        border border-[#D4AF37]/20
        hover:border-[#D4AF37]/40
        focus:border-[#D4AF37]
        focus:shadow-[0_0_0_2px_rgba(212,175,55,0.15)]
        rounded-lg
      `,
      terminal: `
        bg-[#000000]
        border border-[#D4AF37]/30
        hover:border-[#D4AF37]/50
        focus:border-[#D4AF37]
        focus:shadow-[0_0_10px_rgba(212,175,55,0.2)]
        rounded
        font-mono
      `,
    }
    
    return (
      <div className="w-full">
        {label && (
          <label 
            htmlFor={id}
            className="block text-xs font-semibold text-white/70 uppercase tracking-wider mb-1.5"
          >
            {label}
          </label>
        )}
        
        <div className="relative">
          {prefix && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#D4AF37]/70">
              {prefix}
            </div>
          )}
          
          <input
            id={id}
            ref={ref}
            type={type}
            className={cn(
              "w-full h-10 px-3 text-sm text-white placeholder:text-white/30",
              "transition-all duration-200 ease-out",
              "outline-none",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              variants[variant],
              prefix && "pl-10",
              suffix && "pr-10",
              error && "border-[#FF3333] focus:border-[#FF3333] focus:shadow-[0_0_0_2px_rgba(255,51,51,0.15)]",
              className
            )}
            {...props}
          />
          
          {suffix && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[#D4AF37]/70">
              {suffix}
            </div>
          )}
        </div>
        
        {hint && !error && (
          <p className="mt-1 text-[10px] text-white/40">
            {hint}
          </p>
        )}
        
        {error && (
          <p className="mt-1 text-[10px] text-[#FF3333]">
            {error}
          </p>
        )}
      </div>
    )
  }
)

GoldInput.displayName = "GoldInput"

// Number input with increment/decrement
export interface GoldNumberInputProps extends Omit<GoldInputProps, 'type' | 'onChange'> {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
}

const GoldNumberInput = React.forwardRef<HTMLInputElement, GoldNumberInputProps>(
  ({ 
    value,
    onChange,
    min = 0,
    max = Infinity,
    step = 1,
    className,
    ...props 
  }, ref) => {
    const handleIncrement = () => {
      const newValue = Math.min(value + step, max)
      onChange(newValue)
    }
    
    const handleDecrement = () => {
      const newValue = Math.max(value - step, min)
      onChange(newValue)
    }
    
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = parseFloat(e.target.value) || 0
      if (newValue >= min && newValue <= max) {
        onChange(newValue)
      }
    }
    
    return (
      <div className="relative">
        <GoldInput
          ref={ref}
          type="number"
          value={value}
          onChange={handleChange}
          min={min}
          max={max}
          step={step}
          className={cn("pr-20", className)}
          {...props}
        />
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-0.5">
          <button
            type="button"
            onClick={handleDecrement}
            className="w-8 h-8 flex items-center justify-center text-[#D4AF37] hover:bg-[#D4AF37]/10 rounded transition-colors"
            disabled={value <= min}
          >
            <span className="text-lg font-bold">−</span>
          </button>
          <button
            type="button"
            onClick={handleIncrement}
            className="w-8 h-8 flex items-center justify-center text-[#D4AF37] hover:bg-[#D4AF37]/10 rounded transition-colors"
            disabled={value >= max}
          >
            <span className="text-lg font-bold">+</span>
          </button>
        </div>
      </div>
    )
  }
)

GoldNumberInput.displayName = "GoldNumberInput"

// Toggle Switch
export interface GoldToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  description?: string
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg'
}

const GoldToggle = React.forwardRef<HTMLButtonElement, GoldToggleProps>(
  ({ checked, onChange, label, description, disabled, size = 'md' }, ref) => {
    const sizes = {
      sm: { track: 'w-8 h-4', thumb: 'w-3 h-3', translate: 'translate-x-4' },
      md: { track: 'w-11 h-6', thumb: 'w-5 h-5', translate: 'translate-x-5' },
      lg: { track: 'w-14 h-7', thumb: 'w-6 h-6', translate: 'translate-x-7' },
    }
    
    return (
      <div className="flex items-center justify-between gap-3">
        {(label || description) && (
          <div className="flex-1">
            {label && (
              <p className="text-sm font-medium text-white">
                {label}
              </p>
            )}
            {description && (
              <p className="text-xs text-white/50 mt-0.5">
                {description}
              </p>
            )}
          </div>
        )}
        
        <button
          ref={ref}
          type="button"
          role="switch"
          aria-checked={checked}
          disabled={disabled}
          onClick={() => onChange(!checked)}
          className={cn(
            "relative inline-flex shrink-0 cursor-pointer rounded-full",
            "transition-all duration-200 ease-out",
            "focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 focus:ring-offset-2 focus:ring-offset-black",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            sizes[size].track,
            checked 
              ? "bg-gradient-to-r from-[#D4AF37] to-[#FFD700]" 
              : "bg-[#333333]"
          )}
        >
          <span
            className={cn(
              "pointer-events-none inline-block rounded-full bg-white shadow-lg",
              "transition-transform duration-200 ease-out",
              "translate-x-0.5",
              sizes[size].thumb,
              checked && sizes[size].translate
            )}
            style={{
              marginTop: '0.125rem',
            }}
          />
        </button>
      </div>
    )
  }
)

GoldToggle.displayName = "GoldToggle"

// Select/Dropdown
export interface GoldSelectProps {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string; disabled?: boolean }[]
  label?: string
  placeholder?: string
  disabled?: boolean
}

const GoldSelect = React.forwardRef<HTMLSelectElement, GoldSelectProps>(
  ({ value, onChange, options, label, placeholder, disabled }, ref) => {
    const id = React.useId()
    
    return (
      <div className="w-full">
        {label && (
          <label 
            htmlFor={id}
            className="block text-xs font-semibold text-white/70 uppercase tracking-wider mb-1.5"
          >
            {label}
          </label>
        )}
        
        <div className="relative">
          <select
            id={id}
            ref={ref}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className={cn(
              "w-full h-10 px-3 pr-10 text-sm text-white",
              "bg-[#0A0A0A] border border-[#D4AF37]/20 rounded-lg",
              "hover:border-[#D4AF37]/40",
              "focus:border-[#D4AF37] focus:shadow-[0_0_0_2px_rgba(212,175,55,0.15)]",
              "transition-all duration-200 ease-out",
              "outline-none appearance-none cursor-pointer",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((option) => (
              <option 
                key={option.value} 
                value={option.value}
                disabled={option.disabled}
                className="bg-[#0A0A0A] text-white"
              >
                {option.label}
              </option>
            ))}
          </select>
          
          {/* Custom dropdown arrow */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <svg 
              width="12" 
              height="12" 
              viewBox="0 0 12 12" 
              fill="none"
              className="text-[#D4AF37]"
            >
              <path 
                d="M3 4.5L6 7.5L9 4.5" 
                stroke="currentColor" 
                strokeWidth="1.5" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      </div>
    )
  }
)

GoldSelect.displayName = "GoldSelect"

// Slider
export interface GoldSliderProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  label?: string
  showValue?: boolean
  formatValue?: (value: number) => string
}

const GoldSlider = React.forwardRef<HTMLInputElement, GoldSliderProps>(
  ({ 
    value, 
    onChange, 
    min = 0, 
    max = 100, 
    step = 1,
    label,
    showValue = true,
    formatValue = (v) => String(v),
  }, ref) => {
    const percentage = ((value - min) / (max - min)) * 100
    
    return (
      <div className="w-full">
        {(label || showValue) && (
          <div className="flex items-center justify-between mb-2">
            {label && (
              <span className="text-xs font-semibold text-white/70 uppercase tracking-wider">
                {label}
              </span>
            )}
            {showValue && (
              <span className="text-sm font-mono text-[#D4AF37]">
                {formatValue(value)}
              </span>
            )}
          </div>
        )}
        
        <div className="relative h-2">
          {/* Track background */}
          <div className="absolute inset-0 bg-[#1A1A1A] rounded-full" />
          
          {/* Filled track */}
          <div 
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#B8860B] to-[#D4AF37] rounded-full"
            style={{ width: `${percentage}%` }}
          />
          
          {/* Input */}
          <input
            ref={ref}
            type="range"
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            min={min}
            max={max}
            step={step}
            className={cn(
              "absolute inset-0 w-full h-full opacity-0 cursor-pointer",
              "[&::-webkit-slider-thumb]:appearance-none",
              "[&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4",
              "[&::-webkit-slider-thumb]:rounded-full",
              "[&::-webkit-slider-thumb]:bg-[#FFD700]",
              "[&::-webkit-slider-thumb]:cursor-pointer"
            )}
          />
          
          {/* Thumb */}
          <div 
            className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-gradient-to-b from-[#FFD700] to-[#D4AF37] rounded-full shadow-lg pointer-events-none"
            style={{ left: `calc(${percentage}% - 8px)` }}
          />
        </div>
      </div>
    )
  }
)

GoldSlider.displayName = "GoldSlider"

export { 
  GoldInput, 
  GoldNumberInput,
  GoldToggle, 
  GoldSelect,
  GoldSlider,
}

