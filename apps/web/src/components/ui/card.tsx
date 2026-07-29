import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * Card container for demo settings pages.
 */
export const Card = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('rounded-xl border border-slate-200 bg-white shadow-sm', className)}
    {...props}
  />
)

/**
 * Card header section with optional title area.
 */
export const CardHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('border-b border-slate-100 px-6 py-4', className)} {...props} />
)

/**
 * Card body content area.
 */
export const CardContent = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('px-6 py-4', className)} {...props} />
)

/**
 * Card title heading.
 */
export const CardTitle = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h2 className={cn('text-lg font-semibold text-slate-900', className)} {...props} />
)
