import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-teal-500/30",
  {
    variants: {
      variant: {
        default: 'bg-teal-600 text-white hover:bg-teal-500 shadow-md shadow-teal-600/20',
        destructive:
          'bg-red-600 text-white hover:bg-red-500 shadow-md shadow-red-600/20',
        outline:
          'border border-zinc-600 bg-zinc-900/80 text-zinc-100 hover:bg-zinc-800 hover:border-zinc-500',
        secondary:
          'bg-zinc-800 text-zinc-100 border border-zinc-700 hover:bg-zinc-700 hover:border-zinc-600',
        ghost:
          'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100',
        link: 'text-teal-500 underline-offset-4 hover:underline',
        success: 'bg-green-600 text-white hover:bg-green-500 shadow-md shadow-green-600/20',
      },
      size: {
        default: 'h-10 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'h-11 rounded-md px-6 has-[>svg]:px-4',
        icon: 'size-10',
        'icon-sm': 'size-8',
        'icon-lg': 'size-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
