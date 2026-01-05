"use client"

import type React from "react"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface TerminalPanelProps {
  children: ReactNode
  title?: string
  className?: string
  showHeader?: boolean
}

export function TerminalPanel({ children, title, className, showHeader = true }: TerminalPanelProps) {
  return (
    <div className={cn("terminal-panel", className)}>
      {showHeader && (
        <div className="terminal-header">
          <div className="flex items-center gap-2">
            <span className="terminal-dot terminal-dot-red" />
            <span className="terminal-dot terminal-dot-yellow" />
            <span className="terminal-dot terminal-dot-green" />
          </div>
          {title && (
            <span className="ml-4 font-mono text-xs text-[var(--text-muted)] uppercase tracking-wider">{title}</span>
          )}
          <span className="ml-auto font-mono text-[10px] text-[var(--text-muted)]">AQUARIUS_TERMINAL v1.0</span>
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  )
}

interface TerminalInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  prefix?: string
}

export function TerminalInput({ label, prefix = ">", className, ...props }: TerminalInputProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block font-mono text-xs text-[var(--text-muted)] uppercase tracking-wider">{label}</label>
      )}
      <div className="relative flex items-center">
        <span className="absolute left-3 font-mono text-[var(--aqua-primary)] font-bold">{prefix}</span>
        <input className={cn("terminal-input pl-8", className)} {...props} />
        <span className="cursor-blink absolute right-3" />
      </div>
    </div>
  )
}

interface TerminalButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "outline"
  children: ReactNode
}

export function TerminalButton({ variant = "primary", children, className, ...props }: TerminalButtonProps) {
  return (
    <button className={cn("terminal-btn", variant === "outline" && "terminal-btn-outline", className)} {...props}>
      {children}
    </button>
  )
}

interface TerminalMetricProps {
  label: string
  value: string | number
  suffix?: string
  trend?: "up" | "down" | "neutral"
  dataLabel?: string
}

export function TerminalMetric({ label, value, suffix, trend, dataLabel }: TerminalMetricProps) {
  return (
    <div className="terminal-metric" data-label={dataLabel}>
      <div className="flex items-end gap-2">
        <span className="terminal-metric-value">{value}</span>
        {suffix && <span className="font-mono text-sm text-[var(--text-muted)] mb-1">{suffix}</span>}
        {trend && (
          <span
            className={cn(
              "font-mono text-xs mb-1",
              trend === "up" && "text-[var(--terminal-green)]",
              trend === "down" && "text-[var(--terminal-red)]",
              trend === "neutral" && "text-[var(--text-muted)]",
            )}
          >
            {trend === "up" && "▲"}
            {trend === "down" && "▼"}
            {trend === "neutral" && "─"}
          </span>
        )}
      </div>
      <div className="terminal-metric-label">{label}</div>
    </div>
  )
}

interface TerminalProgressProps {
  value: number
  max?: number
  label?: string
  showPercentage?: boolean
}

export function TerminalProgress({ value, max = 100, label, showPercentage = true }: TerminalProgressProps) {
  const percentage = Math.min((value / max) * 100, 100)

  return (
    <div className="space-y-1">
      {label && (
        <div className="flex justify-between font-mono text-xs">
          <span className="text-[var(--text-muted)] uppercase tracking-wider">{label}</span>
          <span className="text-[var(--aqua-primary)]">
            {value.toLocaleString()} / {max.toLocaleString()}
          </span>
        </div>
      )}
      <div className="terminal-progress">
        <div className="terminal-progress-bar" style={{ width: `${percentage}%` }} />
        {showPercentage && <div className="terminal-progress-text">{percentage.toFixed(1)}%</div>}
      </div>
    </div>
  )
}

interface LogEntryProps {
  timestamp: string
  type: "buy" | "sell" | "pour" | "system"
  message: string
  amount?: string
}

export function LogEntry({ timestamp, type, message, amount }: LogEntryProps) {
  return (
    <div className="log-entry">
      <span className="log-timestamp">{timestamp}</span>
      <span
        className={cn(
          "log-type",
          type === "buy" && "log-type-buy",
          type === "sell" && "log-type-sell",
          type === "pour" && "log-type-pour",
          type === "system" && "bg-[var(--ocean-surface)] text-[var(--text-muted)]",
        )}
      >
        {type}
      </span>
      <span className="flex-1 text-[var(--text-secondary)]">{message}</span>
      {amount && <span className="text-[var(--aqua-primary)] font-semibold">{amount}</span>}
    </div>
  )
}

interface StatusIndicatorProps {
  status: "online" | "offline" | "pending"
  label: string
}

export function StatusIndicator({ status, label }: StatusIndicatorProps) {
  return <span className={cn("status-indicator", status)}>{label}</span>
}
