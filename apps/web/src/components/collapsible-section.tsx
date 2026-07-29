'use client'

import * as Collapsible from '@radix-ui/react-collapsible'
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/lib/utils'

interface CollapsibleSectionProps {
  title: string
  preview?: string
  children?: React.ReactNode
  rightContent?: React.ReactNode
  ariaLabel: string
}

/**
 * Collapsible card section matching the PREVIO demo layout.
 */
export const CollapsibleSection = ({
  title,
  preview,
  children,
  rightContent,
  ariaLabel,
}: CollapsibleSectionProps) => {
  const [open, setOpen] = useState(false)

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <div className="flex h-9 items-center justify-between px-3 md:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex-shrink-0 text-[15px] font-semibold text-slate-800">
              {title}
            </span>
            {!open && preview && (
              <span className="ml-2 truncate text-[13px] text-slate-400">{preview}</span>
            )}
            {!open && rightContent}
          </div>
          <Collapsible.Trigger
            aria-label={ariaLabel}
            className={cn(
              'flex-shrink-0 rounded-md p-1.5 text-slate-600 transition-colors',
              'hover:bg-slate-100 hover:text-brand',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand',
            )}
          >
            <ChevronDown
              className={cn('h-5 w-5 transition-transform', open && 'rotate-180')}
            />
          </Collapsible.Trigger>
        </div>
        <Collapsible.Content className="border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
          {children}
        </Collapsible.Content>
      </div>
    </Collapsible.Root>
  )
}
