"use client"

import type React from "react"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { motion } from "framer-motion"

interface GlassPanelProps {
  children: ReactNode
  title?: string
  subtitle?: string
  className?: string
  glowColor?: "cyan" | "purple" | "green" | "orange"
  showBorder?: boolean
}

export function GlassPanel({ 
  children, 
  title, 
  subtitle,
  className, 
  glowColor = "cyan",
  showBorder = true 
}: GlassPanelProps) {
  return (
    <motion.div 
      className={cn(
        "relative rounded-xl bg-[var(--bg-card)] transition-all duration-300",
        showBorder && "border border-[var(--border-subtle)]",
        className
      )}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* Content */}
      <div className="relative">
        {(title || subtitle) && (
          <div className="px-5 py-4 border-b border-[var(--border-subtle)]">
            {title && (
              <h3 className="text-base font-semibold text-[var(--text-primary)]">{title}</h3>
            )}
            {subtitle && (
              <p className="text-xs text-[var(--text-muted)] mt-0.5">{subtitle}</p>
            )}
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </motion.div>
  )
}

interface GlassInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string
}

export function GlassInput({ label, hint, error, className, ...props }: GlassInputProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">{label}</label>
      )}
      <input 
        className={cn(
          "w-full px-3 py-2.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-default)]",
          "text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm",
          "focus:outline-none focus:border-[var(--aqua-primary)] focus:ring-2 focus:ring-[var(--aqua-bg)]",
          "transition-all duration-150",
          error && "border-[var(--red)] focus:border-[var(--red)]",
          className
        )} 
        {...props} 
      />
      {hint && !error && (
        <p className="text-[11px] text-[var(--text-muted)]">{hint}</p>
      )}
      {error && (
        <p className="text-[11px] text-[var(--red)]">{error}</p>
      )}
    </div>
  )
}

interface GlassTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  hint?: string
  error?: string
  charCount?: number
  maxChars?: number
}

export function GlassTextarea({ label, hint, error, charCount, maxChars, className, ...props }: GlassTextareaProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        {label && (
          <label className="block text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">{label}</label>
        )}
        {maxChars && (
          <span className={cn(
            "text-[11px] tabular-nums",
            charCount && charCount > maxChars ? "text-[var(--red)]" : "text-[var(--text-muted)]"
          )}>
            {charCount || 0}/{maxChars}
          </span>
        )}
      </div>
      <textarea 
        className={cn(
          "w-full px-3 py-2.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-default)]",
          "text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm",
          "focus:outline-none focus:border-[var(--aqua-primary)] focus:ring-2 focus:ring-[var(--aqua-bg)]",
          "transition-all duration-150 resize-none",
          error && "border-[var(--red)] focus:border-[var(--red)]",
          className
        )} 
        {...props} 
      />
      {hint && !error && (
        <p className="text-[11px] text-[var(--text-muted)]">{hint}</p>
      )}
      {error && (
        <p className="text-[11px] text-[var(--red)]">{error}</p>
      )}
    </div>
  )
}

interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline"
  size?: "sm" | "md" | "lg"
  children: ReactNode
  isLoading?: boolean
}

export function GlassButton({ 
  variant = "primary", 
  size = "md",
  children, 
  className, 
  isLoading,
  disabled,
  ...props 
}: GlassButtonProps) {
  const sizeClasses = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2.5 text-sm",
    lg: "px-6 py-3 text-sm",
  }

  const variantClasses = {
    primary: "bg-[var(--aqua-primary)] text-[var(--bg-primary)] font-semibold hover:bg-[var(--aqua-secondary)]",
    secondary: "bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] border border-[var(--border-default)]",
    outline: "bg-transparent text-[var(--text-secondary)] border border-[var(--border-default)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]",
  }

  return (
    <button 
      className={cn(
        "rounded-lg transition-all duration-150 font-medium",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        sizeClasses[size],
        variantClasses[variant],
        className
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <div className="flex items-center justify-center gap-2">
          <div className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
          <span>Processing...</span>
        </div>
      ) : children}
    </button>
  )
}

interface StepIndicatorProps {
  steps: Array<{ id: number; name: string; description?: string }>
  currentStep: number
}

export function StepIndicator({ steps, currentStep }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-between w-full">
      {steps.map((step, index) => (
        <div key={step.id} className="flex items-center flex-1">
          <div className="flex flex-col items-center">
            {/* Step circle - cleaner fintech style */}
            <motion.div
              className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center font-medium text-sm",
                "border transition-all duration-300",
                currentStep > step.id 
                  ? "bg-[var(--aqua-primary)] border-[var(--aqua-primary)] text-[var(--bg-primary)]"
                  : currentStep === step.id
                    ? "bg-[var(--aqua-bg)] border-[var(--aqua-primary)] text-[var(--aqua-primary)]"
                    : "bg-[var(--bg-secondary)] border-[var(--border-default)] text-[var(--text-muted)]"
              )}
              animate={{
                scale: currentStep === step.id ? 1.02 : 1,
              }}
            >
              {currentStep > step.id ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : step.id}
            </motion.div>
            
            {/* Step label */}
            <div className="mt-2.5 text-center">
              <p className={cn(
                "text-xs font-medium",
                currentStep >= step.id ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"
              )}>
                {step.name}
              </p>
            </div>
          </div>

          {/* Connector line */}
          {index < steps.length - 1 && (
            <div className="flex-1 h-px mx-3 bg-[var(--border-default)] rounded overflow-hidden">
              <motion.div
                className="h-full bg-[var(--aqua-primary)]"
                initial={{ width: "0%" }}
                animate={{ width: currentStep > step.id ? "100%" : "0%" }}
                transition={{ duration: 0.3 }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

interface ImageUploadProps {
  value: string | null
  onChange: (file: File | null, preview: string | null) => void
  accept?: string
  maxSize?: number // in MB
}

export function ImageUpload({ value, onChange, accept = "image/*", maxSize = 2 }: ImageUploadProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > maxSize * 1024 * 1024) {
        alert(`File size must be less than ${maxSize}MB`)
        return
      }
      const reader = new FileReader()
      reader.onloadend = () => {
        onChange(file, reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  return (
    <label className={cn(
      "flex flex-col items-center justify-center w-28 h-28 rounded-lg cursor-pointer",
      "border border-dashed transition-all duration-150",
      value 
        ? "border-[var(--aqua-border)] bg-[var(--aqua-bg)]" 
        : "border-[var(--border-default)] bg-[var(--bg-secondary)] hover:border-[var(--aqua-border)] hover:bg-[var(--bg-elevated)]"
    )}>
      {value ? (
        <img src={value} alt="Preview" className="w-full h-full object-cover rounded-lg" />
      ) : (
        <div className="text-center p-3">
          <div className="w-8 h-8 mx-auto mb-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex items-center justify-center">
            <svg className="w-4 h-4 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <span className="text-[11px] text-[var(--text-muted)]">Upload</span>
          <span className="text-[10px] text-[var(--text-dim)] block mt-0.5">{maxSize}MB max</span>
        </div>
      )}
      <input 
        type="file" 
        accept={accept}
        onChange={handleChange}
        className="hidden" 
      />
    </label>
  )
}
