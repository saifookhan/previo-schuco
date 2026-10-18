import useDocusaurusContext from '@docusaurus/useDocusaurusContext'

type Target = 'app' | 'mailpit'

interface AppLinkProps {
  /** Which service the link points at (default: the web app). */
  to?: Target
  /** Path appended to the service's base URL, e.g. `/en/login`. */
  path?: string
}

/** Link to the running app or Mailpit, using the URLs resolved in docusaurus.config.ts. */
const AppLink = ({ to = 'app', path = '' }: AppLinkProps) => {
  const { siteConfig } = useDocusaurusContext()
  const base = String(to === 'mailpit' ? siteConfig.customFields?.mailpitUrl : siteConfig.customFields?.appUrl)
  const href = `${base}${path}`
  return (
    <a href={href} target="_blank" rel="noreferrer">
      <code>{href}</code>
    </a>
  )
}

export default AppLink
