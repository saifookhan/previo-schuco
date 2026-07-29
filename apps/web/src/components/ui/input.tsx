import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * Styled text input matching shadcn conventions.
 */
export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    className={cn(
      'flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm',
      'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    ref={ref}
    {...props}
  />
))
Input.displayName = 'Input'
