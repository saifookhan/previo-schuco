'use client'

import type { ComponentProps, MouseEvent } from 'react'

import { useLoadingTransition } from '@/components/ui/loading-region'
import { Link, useRouter } from '@/i18n/navigation'

/**
 * A link that reloads the current table (tab, page, preset filter) inside the surrounding
 * `LoadingRegionProvider`'s transition, so the table shows its loading state (ADR 0014).
 * Modified clicks (new tab, etc.) behave like a normal link. Doesn't scroll to the top unless `scroll` is set.
 */
export const PendingLink = ({ href, onClick, replace, scroll = false, ...props }: ComponentProps<typeof Link> & { href: string }) => {
  const router = useRouter()
  const { startTransition } = useLoadingTransition()
  const navigate = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event)
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    startTransition(() => (replace ? router.replace(href, { scroll }) : router.push(href, { scroll })))
  }
  return <Link href={href} onClick={navigate} replace={replace} scroll={scroll} {...props} />
}
