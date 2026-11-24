import { guardedLayout } from '@/lib/auth/require-page-access'

/** Printable pages, outside the app shell; same access rule as the quotes. */
export default guardedLayout('/app/quotes')
