import Link from 'next/link'
import type { AnchorHTMLAttributes, ImgHTMLAttributes, ReactNode, TableHTMLAttributes } from 'react'

/** Turn a handbook link into a same-app path. `slug` is the page the link is on. */
export const rewriteHelpHref = (href: string | undefined, slug: string): string | undefined => {
  if (!href) return href
  if (href.startsWith('pathname:///')) return `/help/${href.slice('pathname:///'.length)}`
  if (href.startsWith('/img/screens/')) return `/help/screens/${href.slice('/img/screens/'.length)}`
  if (
    href.startsWith('#') ||
    href.startsWith('http://') ||
    href.startsWith('https://') ||
    href.startsWith('mailto:')
  ) {
    return href
  }
  if (href.startsWith('/')) return href

  const hashIndex = href.indexOf('#')
  const pathPart = hashIndex === -1 ? href : href.slice(0, hashIndex)
  const hash = hashIndex === -1 ? '' : href.slice(hashIndex)
  const segments = slug.includes('/') ? slug.split('/').slice(0, -1) : []
  for (const part of pathPart.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') segments.pop()
    else segments.push(part.replace(/\.(md|mdx)$/, ''))
  }
  const next = segments.length === 0 ? '/help' : `/help/${segments.join('/')}`
  return `${next}${hash}`
}

type AppLinkProps = {
  to?: 'app' | 'mailpit'
  path?: string
  appUrl: string
  mailpitUrl: string
}

/** Absolute label, same-origin target. Mailpit stays on its own host. */
export const AppLink = ({ to = 'app', path = '', appUrl, mailpitUrl }: AppLinkProps) => {
  if (to === 'mailpit') {
    return (
      <a href={mailpitUrl} target="_blank" rel="noreferrer">
        <code>{mailpitUrl}</code>
      </a>
    )
  }
  return (
    <Link href={path || '/'}>
      <code>{`${appUrl}${path}`}</code>
    </Link>
  )
}

type HelpAnchorProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  slug: string
  node?: unknown
  children?: ReactNode
}

export const HelpAnchor = ({ href, slug, children, node: _node, ...rest }: HelpAnchorProps) => {
  const rewritten = rewriteHelpHref(typeof href === 'string' ? href : undefined, slug)
  if (!rewritten) return <a {...rest}>{children}</a>
  const external = rewritten.startsWith('http://') || rewritten.startsWith('https://')
  if (external) {
    return (
      <a href={rewritten} target="_blank" rel="noreferrer" {...rest}>
        {children}
      </a>
    )
  }
  return (
    <Link href={rewritten} {...rest}>
      {children}
    </Link>
  )
}

type HelpImageProps = ImgHTMLAttributes<HTMLImageElement> & { node?: unknown }

export const HelpImage = ({ src, alt, node: _node, ...rest }: HelpImageProps) => {
  const resolved = typeof src === 'string' ? rewriteHelpHref(src, '') : undefined
  return <img src={resolved} alt={alt ?? ''} {...rest} />
}

type HelpTableProps = TableHTMLAttributes<HTMLTableElement> & { node?: unknown; children?: ReactNode }

export const HelpTable = ({ children, node: _node, ...rest }: HelpTableProps) => (
  <div className="help-table">
    <table {...rest}>{children}</table>
  </div>
)
