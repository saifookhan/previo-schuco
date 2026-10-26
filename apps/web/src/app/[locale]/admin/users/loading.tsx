import { getTranslations } from 'next-intl/server'

import { PageSkeleton } from '@/components/ui/table-skeleton'

/** First load of the platform users list (ADR 0014). */
const Loading = async () => {
  const t = await getTranslations('loading')
  return <PageSkeleton label={t('loading')} columns={6} tone="dark" />
}

export default Loading
