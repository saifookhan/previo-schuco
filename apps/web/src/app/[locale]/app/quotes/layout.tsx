import { guardedLayout } from '@/lib/auth/require-page-access'

/** Same access rule as the sidebar entry (PAGE_ACCESS). */
export default guardedLayout('/app/quotes')
