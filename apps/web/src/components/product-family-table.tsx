'use client'

import { ChevronRight, ExternalLink, History } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Fragment, useState, type MouseEvent } from 'react'

import { ProductFamilyFlagSelect } from '@/components/product-family-flag-select'
import { PriceValidityBadge, PriceValidityFields, usePriceValidityLabel } from '@/components/product-family-price-validity'
import { ProductFamilyPublishSwitch, ProductFamilyRowActions } from '@/components/product-family-row-actions'
import { ProductFamilyShareButton } from '@/components/product-family-share-button'
import { Badge } from '@/components/ui/badge'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'
import type { ProductFamilySummary } from '@/types/product-family'
import type { PriceValidity } from '@schuco/contracts'

/** The two dates as one range, with Upcoming / Expired when the prices aren't current. */
const ValidityCell = ({ validity, today }: { validity: PriceValidity; today: string }) => {
  const t = useTranslations('priceValidity')
  const label = usePriceValidityLabel()
  return (
    <div className="space-y-1">
      <p className="whitespace-nowrap text-slate-600">{label(validity) ?? t('notSet')}</p>
      <PriceValidityBadge validity={validity} today={today} />
    </div>
  )
}

/** Technical name, previous version, the two dates, and delete — one open row at a time. */
const ExpandedFamily = ({ family, tab }: { family: ProductFamilySummary; tab: 'own' | 'shared' }) => {
  const tVersion = useTranslations('productFamilyVersion')
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0 space-y-3">
        {family.technicalName ? <p className="text-sm text-slate-500">{family.technicalName}</p> : null}
        {family.supersedesId ? (
          <Link
            href={`/app/product-families/${family.supersedesId}`}
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand"
          >
            <History className="h-3.5 w-3.5" />
            {tVersion('viewPreviousVersion')}
          </Link>
        ) : null}
        <PriceValidityFields
          familyId={family.id}
          familyName={family.name}
          validity={{ priceValidFrom: family.priceValidFrom, priceValidTo: family.priceValidTo }}
          canEdit={tab === 'own'}
        />
      </div>
      {tab === 'own' ? (
        <ProductFamilyRowActions
          familyId={family.id}
          familyName={family.name}
          isPublished={family.isPublished}
          readyForInvoicing={family.readyForInvoicing}
          validity={family}
          showPublish={false}
          showDuplicate={false}
          labeledDelete
        />
      ) : null}
    </div>
  )
}

/**
 * Product families list. Click a row to open it (one at a time); the name, the new-tab icon,
 * switches, share and duplicate keep their own actions. The open row stays open across a save,
 * because this state lives here and a refresh only replaces the family data.
 */
export const ProductFamilyTable = ({
  families,
  tab,
  today,
}: {
  families: ProductFamilySummary[]
  tab: 'own' | 'shared'
  /** `priceValidityToday()` from the server page, so the badge matches the server render. */
  today: string
}) => {
  const t = useTranslations('productFamilies')
  const tVersion = useTranslations('productFamilyVersion')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const shared = tab === 'shared'
  const columnCount = shared ? 13 : 11

  const toggle = (id: string) => setExpandedId((current) => (current === id ? null : id))

  // Links and controls inside the row do their own job. Anything else opens or closes the row.
  const onRowClick = (id: string, event: MouseEvent<HTMLTableRowElement>) => {
    const target = event.target
    if (!(target instanceof Element) || target.closest('a, button, input, select, textarea, label')) return
    toggle(id)
  }

  return (
    <table className="w-full min-w-[1040px] text-sm [&_td]:px-3 [&_td]:py-3 [&_th]:px-3 [&_th]:py-3 [&_td]:align-middle [&_th]:align-middle [&_td:first-child]:pl-6 [&_th:first-child]:pl-6">
      <thead>
        <tr className="border-b border-slate-100 text-left text-slate-500">
          <th className="w-16" />
          <th className="font-medium">{t('name')}</th>
          {shared ? <th className="font-medium">{t('owner')}</th> : null}
          <th className="font-medium">{t('category')}</th>
          <th className="font-medium">{t('brand')}</th>
          {shared ? <th className="font-medium">{t('yourDiscount')}</th> : null}
          <th className="font-medium">{t('status')}</th>
          <th className="font-medium">{t('version')}</th>
          <th className="font-medium">{t('validity')}</th>
          <th className="font-medium">{t('hasPriceList')}</th>
          <th className="font-medium">{t('readyForInvoicing')}</th>
          <th className="font-medium">{t('inLibrary')}</th>
          <th>
            <span className="sr-only">{t('actions')}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {families.map((family) => {
          const open = expandedId === family.id
          const validity = { priceValidFrom: family.priceValidFrom, priceValidTo: family.priceValidTo }
          return (
            <Fragment key={family.id}>
              <tr
                className={cn('cursor-pointer border-b border-slate-50 hover:bg-slate-50/80', open && 'border-b-0 bg-slate-50/80')}
                onClick={(event) => onRowClick(family.id, event)}
              >
                <td>
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-label={t(open ? 'collapse' : 'expand', { name: family.name })}
                      className="rounded p-1 text-slate-400 hover:bg-white hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                      onClick={(event) => {
                        event.stopPropagation()
                        toggle(family.id)
                      }}
                    >
                      <ChevronRight className={cn('h-4 w-4 transition-transform', open && 'rotate-90')} />
                    </button>
                    <Link
                      href={`/app/product-families/${family.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t('openInNewTab', { name: family.name })}
                      title={t('openInNewTab', { name: family.name })}
                      className="rounded p-1 text-slate-400 hover:bg-white hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </td>
                <td className="min-w-[11rem] font-medium text-slate-900">
                  <Link href={`/app/product-families/${family.id}`} className="hover:text-brand">
                    {family.name}
                  </Link>
                </td>
                {shared ? <td className="text-slate-600">{family.ownerCompanyName ?? '—'}</td> : null}
                <td className="text-slate-600">{family.category ?? '—'}</td>
                <td className="text-slate-600">{family.brand ?? '—'}</td>
                {shared ? <td className="text-slate-600">{family.shareDiscountPct ? `${family.shareDiscountPct}%` : '—'}</td> : null}
                <td>
                  <ProductFamilyPublishSwitch
                    familyId={family.id}
                    familyName={family.name}
                    isPublished={family.isPublished}
                    canEdit={tab === 'own'}
                  />
                </td>
                <td>
                  <Badge variant="muted" className="whitespace-nowrap">
                    {tVersion('versionBadge', { version: family.version })}
                  </Badge>
                </td>
                <td>
                  <ValidityCell validity={validity} today={today} />
                </td>
                <td>
                  <ProductFamilyFlagSelect
                    flag="hasPriceList"
                    appearance="switch"
                    familyId={family.id}
                    familyName={family.name}
                    value={family.hasPriceList}
                    canEdit={tab === 'own'}
                  />
                </td>
                <td>
                  <ProductFamilyFlagSelect
                    flag="readyForInvoicing"
                    appearance="switch"
                    familyId={family.id}
                    familyName={family.name}
                    value={family.readyForInvoicing}
                    canEdit={tab === 'own'}
                  />
                </td>
                <td>
                  {/* The caller's company library: changed on both tabs, own families and shared ones. */}
                  <ProductFamilyFlagSelect
                    flag="inLibrary"
                    appearance="switch"
                    familyId={family.id}
                    familyName={family.name}
                    value={family.inLibrary ?? true}
                    canEdit
                  />
                </td>
                <td>
                  <div className="flex items-center justify-end gap-2">
                    <ProductFamilyShareButton
                      familyId={family.id}
                      familyName={family.name}
                      isPublished={family.isPublished}
                      iconOnly
                    />
                    {tab === 'own' ? (
                      <ProductFamilyRowActions
                        familyId={family.id}
                        familyName={family.name}
                        isPublished={family.isPublished}
                        readyForInvoicing={family.readyForInvoicing}
                        validity={family}
                        showPublish={false}
                        showDelete={false}
                      />
                    ) : null}
                  </div>
                </td>
              </tr>
              {open ? (
                <tr className="border-b border-slate-100 bg-slate-50/80">
                  <td colSpan={columnCount}>
                    <ExpandedFamily family={family} tab={tab} />
                  </td>
                </tr>
              ) : null}
            </Fragment>
          )
        })}
      </tbody>
    </table>
  )
}
