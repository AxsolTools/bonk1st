import * as React from 'react'

import { cn } from '@/lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // Base styles
        'flex min-h-[80px] w-full rounded-md px-3 py-2 text-base md:text-sm resize-y',
        // Background - dark input background
        'bg-zinc-900/80',
        // VISIBLE border - white with opacity
        'border border-zinc-600',
        // Text and placeholder
        'text-zinc-100 placeholder:text-zinc-500',
        // Focus states with teal/aqua glow
        'focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30',
        // Hover state
        'hover:border-zinc-500',
        // Transitions
        'transition-all duration-150',
        // Disabled state
        'disabled:cursor-not-allowed disabled:opacity-50',
        // Invalid state
        'aria-invalid:border-red-500 aria-invalid:ring-red-500/30',
        // Selection
        'selection:bg-teal-500 selection:text-white',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
