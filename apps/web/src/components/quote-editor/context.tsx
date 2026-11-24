'use client'

import type { QuoteFamilyStatus, TextTemplate } from '@schuco/contracts'
import { createContext, useContext } from 'react'

import type { ProductFamilyDetail } from '@/types/product-family'

/** Why a catalog line has no price right now (no size, a size out of the table, …). */
export type LinePriceErrors = Record<string, string>

export interface QuoteEditorContextValue {
  /** Nothing can be changed (an old revision is shown). */
  readOnly: boolean
  /** The catalog families the document uses, by id, once loaded. */
  catalog: Record<string, ProductFamilyDetail>
  familyStatus: QuoteFamilyStatus[]
  priceErrors: LinePriceErrors
  /** Lines whose catalog price is being fetched. */
  pricing: Set<string>
  templates: TextTemplate[]
  saveTemplate: (html: string) => void
}

const QuoteEditorContext = createContext<QuoteEditorContextValue | null>(null)

export const QuoteEditorProvider = QuoteEditorContext.Provider

export const useQuoteEditor = (): QuoteEditorContextValue => {
  const value = useContext(QuoteEditorContext)
  if (!value) throw new Error('useQuoteEditor must be used inside QuoteEditorProvider')
  return value
}
