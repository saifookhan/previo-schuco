'use client'

import { useLocale } from 'next-intl'

import { PreventivoEditor } from '@/components/preventivo-editor'

/**
 * Invoice / preventivo editor page (PREVIO demo replica).
 */
const InvoicePage = () => {
  const locale = useLocale()
  return <PreventivoEditor locale={locale} />
}

export default InvoicePage
