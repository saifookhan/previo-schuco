import { getTranslations } from 'next-intl/server'

import { PageSkeleton } from '@/components/ui/table-skeleton'

/** First load of a product family's page (ADR 0014). */
const Loading = async () => {
  const t = await getTranslations('loading')
  return <PageSkeleton label={t('loading')} columns={4} action />
}

export default Loading
