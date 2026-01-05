"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import type { TerminalLogEntry } from "@/lib/1st/sniper-config"

interface TerminalLogProps {
  logs: TerminalLogEntry[]
  maxHeight?: string
  showTimestamp?: boolean
  autoScroll?: boolean
  className?: string
}

// Format timestamp for terminal display
const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('en-US', { 
    hour12: false, 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit' 
  })
}

// Log type colors and prefixes
const logStyles: Record<TerminalLogEntry['type'], { color: string; prefix: string; icon: string }> = {
  info: { 
    color: 'text-white/70', 
    prefix: 'INFO', 
    icon: '○' 
  },
  success: { 
    color: 'text-[#00FF41]', 
    prefix: 'SUCCESS', 
    icon: '✓' 
  },
  warning: { 
    color: 'text-[#FFD700]', 
    prefix: 'WARN', 
    icon: '⚠' 
  },
  error: { 
    color: 'text-[#FF3333]', 
    prefix: 'ERROR', 
    icon: '✗' 
  },
  snipe: { 
    color: 'text-[#00FFFF]', 
    prefix: 'SNIPE', 
    icon: '🎯' 
  },
  sell: { 
    color: 'text-[#FF8C00]', 
    prefix: 'SELL', 
    icon: '💰' 
  },
  detection: { 
    color: 'text-[#D4AF37]', 
    prefix: 'DETECT', 
    icon: '◉' 
  },
}

// Single log line component
const TerminalLine: React.FC<{ 
  entry: TerminalLogEntry
  showTimestamp: boolean 
}> = React.memo(({ entry, showTimestamp }) => {
  const style = logStyles[entry.type]
  
  return (
    <div className={cn("flex items-start gap-2 py-0.5 hover:bg-white/[0.02] px-2 -mx-2 rounded", style.color)}>
      {showTimestamp && (
        <span className="text-white/30 shrink-0 tabular-nums">
          [{formatTimestamp(entry.timestamp)}]
        </span>
      )}
      <span className="shrink-0">{style.icon}</span>
      <span className="flex-1 break-words">
        {entry.message}
      </span>
      {entry.txSignature && (
        <a
          href={`https://solscan.io/tx/${entry.txSignature}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#D4AF37]/60 hover:text-[#D4AF37] shrink-0 underline"
        >
          TX
        </a>
      )}
    </div>
  )
})

TerminalLine.displayName = 'TerminalLine'

export function TerminalLog({ 
  logs, 
  maxHeight = '400px',
  showTimestamp = true,
  autoScroll = true,
  className,
}: TerminalLogProps) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [isAtBottom, setIsAtBottom] = React.useState(true)
  
  // Auto-scroll to bottom when new logs arrive
  React.useEffect(() => {
    if (autoScroll && isAtBottom && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [logs, autoScroll, isAtBottom])
  
  // Track scroll position
  const handleScroll = () => {
    if (!containerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current
    setIsAtBottom(scrollHeight - scrollTop - clientHeight < 50)
  }
  
  return (
    <div className={cn("relative", className)}>
      {/* Terminal window chrome */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[#0A0A0A] border-b border-[#D4AF37]/20 rounded-t-lg">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[#FF5F56]" />
          <div className="w-3 h-3 rounded-full bg-[#FFBD2E]" />
          <div className="w-3 h-3 rounded-full bg-[#27C93F]" />
        </div>
        <span className="text-[10px] text-white/40 font-mono uppercase tracking-wider ml-2">
          1ST Terminal
        </span>
        <div className="flex-1" />
        <span className="text-[10px] text-white/30 font-mono">
          {logs.length} entries
        </span>
      </div>
      
      {/* Terminal content */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className={cn(
          "bg-[#000000] p-3 font-mono text-xs leading-relaxed overflow-y-auto",
          "border border-t-0 border-[#D4AF37]/20 rounded-b-lg",
          "first-terminal-scroll"
        )}
        style={{ maxHeight }}
      >
        {logs.length === 0 ? (
          <div className="text-white/30 flex items-center gap-2">
            <span className="animate-pulse">●</span>
            Waiting for activity...
          </div>
        ) : (
          logs.map((entry) => (
            <TerminalLine 
              key={entry.id} 
              entry={entry} 
              showTimestamp={showTimestamp} 
            />
          ))
        )}
        
        {/* Cursor line */}
        <div className="flex items-center gap-2 mt-1 text-[#D4AF37]">
          <span>&gt;</span>
          <span className="animate-[first-terminal-blink_1s_step-end_infinite]">█</span>
        </div>
      </div>
      
      {/* Scroll to bottom indicator */}
      {!isAtBottom && logs.length > 0 && (
        <button
          onClick={() => {
            if (containerRef.current) {
              containerRef.current.scrollTop = containerRef.current.scrollHeight
              setIsAtBottom(true)
            }
          }}
          className="absolute bottom-4 right-4 px-2 py-1 text-[10px] font-mono bg-[#D4AF37]/20 text-[#D4AF37] rounded border border-[#D4AF37]/30 hover:bg-[#D4AF37]/30 transition-colors"
        >
          ↓ NEW
        </button>
      )}
    </div>
  )
}

// Mini terminal for compact display
export function MiniTerminal({ 
  logs, 
  maxLines = 5,
  className,
}: { 
  logs: TerminalLogEntry[]
  maxLines?: number
  className?: string 
}) {
  const recentLogs = logs.slice(-maxLines)
  
  return (
    <div 
      className={cn(
        "bg-[#000000] border border-[#D4AF37]/20 rounded-lg p-2 font-mono text-[10px]",
        className
      )}
    >
      {recentLogs.length === 0 ? (
        <div className="text-white/30">No activity</div>
      ) : (
        recentLogs.map((entry) => {
          const style = logStyles[entry.type]
          return (
            <div key={entry.id} className={cn("truncate", style.color)}>
              {style.icon} {entry.message}
            </div>
          )
        })
      )}
    </div>
  )
}

// Terminal status bar
export function TerminalStatus({
  status,
  tokensDetected,
  activeSnipes,
  className,
}: {
  status: 'idle' | 'armed' | 'scanning' | 'sniping' | 'paused' | 'error'
  tokensDetected: number
  activeSnipes: number
  className?: string
}) {
  const statusConfig = {
    idle: { label: 'IDLE', color: 'text-white/50', bg: 'bg-white/10' },
    armed: { label: 'ARMED', color: 'text-[#00FF41]', bg: 'bg-[#00FF41]/10' },
    scanning: { label: 'SCANNING', color: 'text-[#00FFFF]', bg: 'bg-[#00FFFF]/10' },
    sniping: { label: 'SNIPING', color: 'text-[#D4AF37]', bg: 'bg-[#D4AF37]/10' },
    paused: { label: 'PAUSED', color: 'text-[#FFD700]', bg: 'bg-[#FFD700]/10' },
    error: { label: 'ERROR', color: 'text-[#FF3333]', bg: 'bg-[#FF3333]/10' },
  }
  
  const config = statusConfig[status]
  
  return (
    <div className={cn(
      "flex items-center justify-between px-3 py-2 bg-[#0A0A0A] border border-[#D4AF37]/20 rounded-lg font-mono text-xs",
      className
    )}>
      <div className="flex items-center gap-3">
        <div className={cn("flex items-center gap-2 px-2 py-0.5 rounded", config.bg)}>
          <span className={cn("w-2 h-2 rounded-full", config.color.replace('text-', 'bg-'), status === 'scanning' && 'animate-pulse')} />
          <span className={config.color}>{config.label}</span>
        </div>
      </div>
      
      <div className="flex items-center gap-4 text-white/50">
        <div>
          <span className="text-[#D4AF37]">{tokensDetected}</span> detected
        </div>
        <div>
          <span className="text-[#00FF41]">{activeSnipes}</span> active
        </div>
      </div>
    </div>
  )
}

