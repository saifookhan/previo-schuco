'use client'

import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as Popover from '@radix-ui/react-popover'
import { quoteVariantCode, type BusinessUnit, type QuoteHeader, type QuotePrintSettings, type QuoteStatus, type QuoteVersionRef, type SalesContact } from '@schuco/contracts'
import { Check, ChevronDown, Eye, FileDown, History, LayoutGrid, Loader2, Pencil, Save, SlidersHorizontal, Star } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { EUR } from '@/lib/format'
import { cn } from '@/lib/utils'

const RadioDot = ({ selected }: { selected: boolean }) => (
  <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors ${selected ? 'border-brand' : 'border-slate-300'}`}>
    {selected ? <span className="h-2 w-2 rounded-full bg-brand" /> : null}
  </span>
)

const CheckBox = ({ checked }: { checked: boolean }) => (
  <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors ${checked ? 'border-brand bg-brand' : 'border-slate-300 bg-white'}`}>
    {checked ? <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} /> : null}
  </span>
)

const SectionLabel = ({ label }: { label: string }) => <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">{label}</p>

type PrintFlag = Exclude<keyof QuotePrintSettings, 'salesContactUserId' | 'businessUnitId'>

const PRINT_FLAGS: { key: PrintFlag; label: string }[] = [
  { key: 'showSalesContact', label: 'printSalesContact' },
  { key: 'showImages', label: 'printImages' },
  { key: 'showFamilyDescription', label: 'printFamilyDescription' },
  { key: 'showLineCharacteristics', label: 'printLineCharacteristics' },
  { key: 'showFamilySummary', label: 'printFamilySummary' },
  { key: 'showCategorySummary', label: 'printCategorySummary' },
  { key: 'showTotal', label: 'printTotal' },
  { key: 'showPayments', label: 'printPayments' },
  { key: 'showActivities', label: 'printActivities' },
  { key: 'showExtraMarkup', label: 'printExtraMarkup' },
  { key: 'showDiscount', label: 'printDiscount' },
]

const fieldCls =
  'w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[13px] text-slate-800 outline-none transition-colors focus:border-brand focus:ring-1 focus:ring-brand disabled:bg-slate-50'

/** The customer, project and date of the quote (the "Cliente / Azienda" block opens it). */
const HeaderForm = ({ header, onChange, readOnly }: { header: QuoteHeader; onChange: (header: QuoteHeader) => void; readOnly: boolean }) => {
  const t = useTranslations('quoteEditor')
  const text = (key: 'customerName' | 'customerFiscalCode' | 'customerAddress' | 'customerCity' | 'projectLocation', label: string, required = false) => (
    <label className="block">
      <span className="mb-0.5 block text-[11px] font-medium text-slate-500">{label}</span>
      <input
        type="text"
        value={header[key] ?? ''}
        required={required}
        disabled={readOnly}
        onChange={(event) => onChange({ ...header, [key]: required ? event.target.value : event.target.value || null })}
        className={fieldCls}
      />
    </label>
  )
  return (
    <div className="grid w-[min(92vw,420px)] grid-cols-2 gap-2 p-3">
      <div className="col-span-2">{text('customerName', t('customer'), true)}</div>
      {text('customerFiscalCode', t('customerFiscalCode'))}
      <label className="block">
        <span className="mb-0.5 block text-[11px] font-medium text-slate-500">{t('quoteDate')}</span>
        <input
          type="date"
          value={header.quoteDate}
          disabled={readOnly}
          onChange={(event) => event.target.value && onChange({ ...header, quoteDate: event.target.value })}
          className={fieldCls}
        />
      </label>
      <div className="col-span-2">{text('customerAddress', t('customerAddress'))}</div>
      {text('customerCity', t('customerCity'))}
      {text('projectLocation', t('project'))}
      <label className="col-span-2 block">
        <span className="mb-0.5 block text-[11px] font-medium text-slate-500">{t('internalNotes')}</span>
        <textarea value={header.notes} disabled={readOnly} rows={2} onChange={(event) => onChange({ ...header, notes: event.target.value })} className={fieldCls} />
      </label>
    </div>
  )
}

export interface QuoteTopBarProps {
  reference: string
  header: QuoteHeader
  total: number
  printSettings: QuotePrintSettings
  /** Some line has a discount, so the discount column must print. */
  discountRequired: boolean
  salesContacts: SalesContact[]
  businessUnits: BusinessUnit[]
  currentUserId: string | null
  versions: QuoteVersionRef[]
  version: number
  alternative: number
  label: string | null
  isFinal: boolean
  isFavorite: boolean
  status: QuoteStatus
  readOnly: boolean
  canEdit: boolean
  dirty: boolean
  saving: boolean
  /** Why the quote can't be saved or printed right now (e.g. an expired family without a newer version). */
  blockedReason: string | null
  onHeaderChange: (header: QuoteHeader) => void
  onPrintSettingsChange: (settings: QuotePrintSettings) => void
  onPreview: () => void
  onSave: () => void
  onOpenHistory: () => void
  onSelectVariant: (version: number, alternative: number) => void
  onSetStatus: (status: QuoteStatus) => void
  onNewAlternative: () => void
  onOpenMatrix: () => void
  onDuplicate: () => void
  onMarkFinal: () => void
  onToggleFavorite: () => void
  onSetLabel: (label: string) => void
}

/** The sticky bar: the quote's reference, customer and project on the left; the total and actions on the right. */
export const QuoteTopBar = (props: QuoteTopBarProps) => {
  const t = useTranslations('quoteEditor')
  const ts = useTranslations('quotes.statusValue')
  const { header, printSettings, salesContacts, businessUnits } = props
  const code = quoteVariantCode(props.version, props.alternative)
  const [label, setLabel] = useState(props.label ?? '')
  useEffect(() => setLabel(props.label ?? ''), [props.label])
  const otherStatuses: QuoteStatus[] = (['draft', 'invoiced', 'accepted'] as const).filter((status) => status !== props.status)

  const selectedContact = salesContacts.find((contact) => contact.id === printSettings.salesContactUserId)
  const availableUnits = selectedContact ? businessUnits.filter((unit) => selectedContact.businessUnitIds.includes(unit.id)) : businessUnits

  const setContact = (contactId: string) => {
    const contact = salesContacts.find((c) => c.id === contactId)
    const units = contact ? businessUnits.filter((unit) => contact.businessUnitIds.includes(unit.id)) : businessUnits
    const keepUnit = units.some((unit) => unit.id === printSettings.businessUnitId)
    props.onPrintSettingsChange({
      ...printSettings,
      salesContactUserId: contactId,
      businessUnitId: keepUnit ? printSettings.businessUnitId : (units[0]?.id ?? printSettings.businessUnitId),
    })
  }
  const toggle = (key: PrintFlag) => {
    if (key === 'showDiscount' && props.discountRequired) return
    props.onPrintSettingsChange({ ...printSettings, [key]: !printSettings[key] })
  }
  return (
    <div className="sticky top-0 z-30 w-full border-b bg-white/90 shadow-md backdrop-blur-md">
      <div className="mx-auto flex h-20 max-w-[1200px] items-center justify-between gap-4 px-4 md:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex-shrink-0 rounded-md bg-brand px-2.5 py-1 text-[13px] font-semibold tracking-wide text-white">{props.reference}</span>

          {props.canEdit ? (
            <button
              type="button"
              aria-pressed={props.isFavorite}
              aria-label={t(props.isFavorite ? 'unfavorite' : 'favorite', { code })}
              disabled={props.saving}
              onClick={props.onToggleFavorite}
              className="rounded-md border border-slate-200 p-1.5 text-slate-400 hover:bg-slate-50"
            >
              <Star className={cn('h-4 w-4', props.isFavorite ? 'fill-sky-500 text-sky-500' : 'text-slate-300')} />
            </button>
          ) : props.isFavorite ? (
            <Star className="h-4 w-4 fill-sky-500 text-sky-500" />
          ) : null}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className="flex flex-shrink-0 items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[12px] font-medium text-slate-600 hover:bg-slate-50"
                aria-label={t('versions')}
              >
                {props.isFinal ? <Star className="h-3 w-3 fill-amber-400 text-amber-500" /> : null}
                {code}
                {props.label ? ` · ${props.label}` : ''} · {ts(props.status)}
                <ChevronDown className="h-3 w-3" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="start" sideOffset={6} className="z-50 min-w-[260px] rounded-lg border border-slate-200 bg-white py-1.5 shadow-lg">
                <SectionLabel label={t('versions')} />
                {[...props.versions].reverse().map((variant) => (
                  <DropdownMenu.Item
                    key={variant.id}
                    onSelect={() => props.onSelectVariant(variant.version, variant.alternative)}
                    className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-[13px] text-slate-700 outline-none focus:bg-slate-50"
                  >
                    <RadioDot selected={variant.version === props.version && variant.alternative === props.alternative} />
                    <span className="flex flex-1 items-center gap-1">
                      {variant.isFinal ? <Star className="h-3 w-3 fill-amber-400 text-amber-500" /> : null}
                      {variant.isFavorite ? <Star className="h-3 w-3 fill-sky-500 text-sky-500" /> : null}
                      {quoteVariantCode(variant.version, variant.alternative)}
                      {variant.label ? <span className="truncate text-slate-400">{variant.label}</span> : null}
                    </span>
                    <span className="text-[11px] text-slate-400">{ts(variant.status)}</span>
                    <span className="font-mono text-[11px] tabular-nums text-slate-500">{EUR.format(Number(variant.totalPrice))}</span>
                  </DropdownMenu.Item>
                ))}
                {props.canEdit && !props.readOnly ? (
                  <>
                    <div className="my-1 h-px bg-slate-100" />
                    <label className="block px-3 py-1.5">
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-slate-400">{t('variantLabel')}</span>
                      <input
                        value={label}
                        maxLength={120}
                        placeholder={t('variantLabelPlaceholder')}
                        onChange={(event) => setLabel(event.target.value)}
                        onBlur={() => {
                          const next = label.trim()
                          if (next !== (props.label ?? '')) props.onSetLabel(next)
                        }}
                        onKeyDown={(event) => event.stopPropagation()}
                        className="w-full rounded-md border border-slate-200 px-2 py-1 text-[13px] outline-none focus:border-brand"
                      />
                    </label>
                    <DropdownMenu.Item onSelect={props.onNewAlternative} className="cursor-pointer px-3 py-1.5 text-[13px] text-slate-700 outline-none focus:bg-slate-50">
                      {t('newAlternative', { code })}
                    </DropdownMenu.Item>
                    <DropdownMenu.Item onSelect={props.onDuplicate} className="cursor-pointer px-3 py-1.5 text-[13px] text-slate-700 outline-none focus:bg-slate-50">
                      {t('duplicateThis', { code })}
                    </DropdownMenu.Item>
                    {props.isFinal ? null : (
                      <DropdownMenu.Item onSelect={props.onMarkFinal} className="cursor-pointer px-3 py-1.5 text-[13px] text-slate-700 outline-none focus:bg-slate-50">
                        {t('markFinal', { code })}
                      </DropdownMenu.Item>
                    )}
                    <div className="my-1 h-px bg-slate-100" />
                    <SectionLabel label={t('markAs')} />
                    {otherStatuses.map((status) => (
                      <DropdownMenu.Item
                        key={status}
                        disabled={props.dirty || ((status === 'invoiced' || status === 'accepted') && props.blockedReason !== null)}
                        onSelect={() => props.onSetStatus(status)}
                        className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-[13px] text-slate-700 outline-none focus:bg-slate-50 data-[disabled]:cursor-not-allowed data-[disabled]:text-slate-300"
                      >
                        {t(`markStatus.${status}`)}
                      </DropdownMenu.Item>
                    ))}
                    {props.dirty ? <p className="px-3 pb-1 pt-0.5 text-[11px] text-slate-400">{t('saveBeforeStatus')}</p> : null}
                  </>
                ) : null}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>

          <span className="hidden h-5 w-px flex-shrink-0 bg-slate-200 md:block" />

          <Popover.Root>
            <Popover.Trigger asChild>
              <button type="button" className="group hidden min-w-0 items-center gap-3 rounded-md px-1 py-0.5 text-left hover:bg-slate-50 md:flex">
                <span className="flex min-w-0 flex-col">
                  <span className="mb-0.5 text-[11px] font-medium uppercase leading-none tracking-wider text-slate-400">{t('customerCompany')}</span>
                  <span className="max-w-[220px] truncate text-[14px] font-semibold text-slate-800">{header.customerName || '—'}</span>
                </span>
                <span className="hidden h-5 w-px flex-shrink-0 bg-slate-200 lg:block" />
                <span className="hidden min-w-0 flex-col lg:flex">
                  <span className="mb-0.5 text-[11px] font-medium uppercase leading-none tracking-wider text-slate-400">{t('projectSite')}</span>
                  <span className="max-w-[260px] truncate text-[14px] font-medium text-slate-600">{header.projectLocation || '—'}</span>
                </span>
                <Pencil className="h-3.5 w-3.5 flex-shrink-0 text-slate-300 group-hover:text-slate-500" />
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content side="bottom" align="start" sideOffset={6} className="z-50 rounded-lg border border-slate-200 bg-white shadow-lg">
                <p className="px-3 pt-2.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">{t('quoteDetails')}</p>
                <HeaderForm header={header} onChange={props.onHeaderChange} readOnly={props.readOnly} />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>

        <div className="flex flex-shrink-0 items-center gap-4">
          <div className="flex flex-col items-end">
            <div className="font-mono text-[22px] font-bold leading-none tabular-nums text-brand md:text-[28px]">{EUR.format(props.total)}</div>
            <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-slate-500">{t('totalVatExcluded')}</div>
          </div>

          <div className="flex items-center gap-2">
            <Popover.Root>
              <Popover.Trigger asChild>
                <button
                  type="button"
                  className="hidden rounded-md border border-slate-300 bg-white p-2 text-slate-600 transition-colors hover:border-slate-400 hover:bg-slate-50 md:block"
                  title={t('printSettings')}
                  aria-label={t('printSettings')}
                >
                  <SlidersHorizontal className="h-4 w-4" />
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content side="bottom" align="end" sideOffset={6} className="z-50 max-h-[80vh] min-w-[260px] overflow-y-auto rounded-lg border border-slate-200 bg-white py-1.5 shadow-lg">
                  <p className="px-3 pb-2 pt-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">{t('printSettings')}</p>
                  <div className="h-px bg-slate-100" />
                  <SectionLabel label={t('fileType')} />
                  {(['PDF', 'Word', 'Excel'] as const).map((type) => (
                    <div
                      key={type}
                      title={type === 'PDF' ? undefined : t('comingSoon')}
                      className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] ${type === 'PDF' ? 'text-slate-700' : 'cursor-not-allowed text-slate-300'}`}
                    >
                      <RadioDot selected={type === 'PDF'} />
                      {type}
                      {type === 'PDF' ? null : <span className="text-[10px] italic">{t('comingSoon')}</span>}
                    </div>
                  ))}

                  <div className="mt-1 h-px bg-slate-100" />
                  <SectionLabel label={t('salesContact')} />
                  {salesContacts.map((contact) => (
                    <button
                      key={contact.id}
                      type="button"
                      disabled={props.readOnly}
                      onClick={() => setContact(contact.id)}
                      className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-slate-700 transition-colors hover:bg-slate-50"
                    >
                      <RadioDot selected={printSettings.salesContactUserId === contact.id} />
                      <span>
                        {contact.name || contact.email}
                        {contact.id === props.currentUserId ? <span className="ml-1 text-[10px] text-slate-400">{t('loggedInUser')}</span> : null}
                      </span>
                    </button>
                  ))}

                  {availableUnits.length > 1 ? (
                    <>
                      <div className="mt-1 h-px bg-slate-100" />
                      <SectionLabel label={t('businessUnit')} />
                      {availableUnits.map((unit) => (
                        <button
                          key={unit.id}
                          type="button"
                          disabled={props.readOnly}
                          onClick={() => props.onPrintSettingsChange({ ...printSettings, businessUnitId: unit.id })}
                          className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-slate-700 transition-colors hover:bg-slate-50"
                        >
                          <RadioDot selected={printSettings.businessUnitId === unit.id} />
                          {unit.name}
                        </button>
                      ))}
                    </>
                  ) : null}

                  <div className="mt-1 h-px bg-slate-100" />
                  <SectionLabel label={t('fields')} />
                  {PRINT_FLAGS.map((flag) => {
                    const forced = flag.key === 'showDiscount' && props.discountRequired
                    return (
                      <button
                        key={flag.key}
                        type="button"
                        disabled={props.readOnly}
                        onClick={() => toggle(flag.key)}
                        title={forced ? t('discountRequiredTitle') : undefined}
                        className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] transition-colors ${forced ? 'cursor-not-allowed text-slate-400' : 'text-slate-700 hover:bg-slate-50'}`}
                      >
                        <CheckBox checked={forced || printSettings[flag.key]} />
                        <span className="flex items-center gap-1.5">
                          {t(flag.label)}
                          {forced ? <span className="text-[10px] italic text-slate-400">{t('required')}</span> : null}
                        </span>
                      </button>
                    )
                  })}
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>

            <button
              type="button"
              onClick={props.onPreview}
              disabled={props.blockedReason !== null}
              className="hidden rounded-md border border-slate-300 bg-white p-2 text-slate-600 transition-colors hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 md:block"
              title={props.blockedReason ?? t('openPreview')}
              aria-label={t('openPreview')}
            >
              <Eye size={16} />
            </button>
            <button
              type="button"
              disabled
              className="hidden cursor-not-allowed rounded-md border border-slate-200 bg-slate-100 p-2 text-slate-400 md:block"
              title={t('exportFile')}
              aria-label={t('exportFile')}
            >
              <FileDown size={16} />
            </button>
            <button
              type="button"
              onClick={props.onOpenMatrix}
              className="hidden rounded-md border border-slate-300 bg-white p-2 text-slate-600 transition-colors hover:border-slate-400 hover:bg-slate-50 md:block"
              title={t('matrix')}
              aria-label={t('matrix')}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              type="button"
              onClick={props.onOpenHistory}
              className="rounded-md border border-slate-300 bg-white p-2 text-slate-600 transition-colors hover:border-slate-400 hover:bg-slate-50"
              title={t('history')}
              aria-label={t('history')}
            >
              <History size={16} />
            </button>
            {props.canEdit && !props.readOnly ? (
              <button
                type="button"
                onClick={props.onSave}
                disabled={!props.dirty || props.saving || props.blockedReason !== null}
                title={props.blockedReason ?? undefined}
                className="flex items-center gap-1.5 rounded-md bg-brand px-3 py-2 text-[13px] font-medium text-white transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-40"
              >
                {props.saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                <span className="hidden sm:inline">{t('save')}</span>
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
