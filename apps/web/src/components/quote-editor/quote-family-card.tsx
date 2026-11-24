'use client'

import { DndContext, closestCenter } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { familyTotal, familyTotalM2, type QuoteFamily, type QuoteFamilyStatus, type QuoteLine } from '@schuco/contracts'
import { ChevronDown, ChevronUp, Copy, Plus, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState, type HTMLAttributes } from 'react'

import { DECIMAL, EUR } from '@/lib/format'

import { familySpecifications, newCatalogLine, newManualLine, nextLineCode } from './catalog'
import { useQuoteEditor } from './context'
import { QuoteLineRow } from './quote-line-row'
import { DeleteConfirmPopover, DragHandle, MoveArrows, moveItem, newLocalId, reorderOnDrop, useDragSensors, useSortableItem } from './shared'

const formatDate = (iso: string): string => {
  const [year, month, day] = iso.split('-')
  return `${day}/${month}/${year}`
}

/** The day after `iso` (the first day a family whose prices end on `iso` is no longer valid). */
const dayAfter = (iso: string): string => {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

/** The validity badge in the card's header: green while the family can price, red once it can't. */
const ValidityBadge = ({ status }: { status: QuoteFamilyStatus | undefined }) => {
  const t = useTranslations('quoteEditor')
  if (!status) return null
  const text =
    status.status === 'current'
      ? status.priceValidTo
        ? t('validUntil', { date: formatDate(status.priceValidTo) })
        : t('valid')
      : status.status === 'expired' && status.priceValidTo
        ? t('notValidSince', { date: formatDate(dayAfter(status.priceValidTo)) })
        : status.status === 'upcoming'
          ? t('notValidYet')
          : t('notPublished')
  const warning = status.status !== 'current'
  return (
    <span
      title={text}
      className={`hidden flex-shrink-0 cursor-default items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium sm:inline-flex ${
        warning ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
      }`}
    >
      <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${warning ? 'bg-red-500' : 'bg-green-500'}`} />
      {text.length > 40 ? `${text.slice(0, 40)}…` : text}
    </span>
  )
}

const SortableLine = (props: Omit<Parameters<typeof QuoteLineRow>[0], 'dragHandleProps'>) => {
  const { setNodeRef, style, handleProps } = useSortableItem(props.line.id)
  return (
    <div ref={setNodeRef} style={style}>
      <QuoteLineRow {...props} dragHandleProps={handleProps} />
    </div>
  )
}

interface QuoteFamilyCardProps {
  family: QuoteFamily
  onChange: (family: QuoteFamily) => void
  onDelete: () => void
  onDuplicate: () => void
  onMove: (direction: -1 | 1) => void
  canMoveUp: boolean
  canMoveDown: boolean
  isNew: boolean
  dragHandleProps: HTMLAttributes<HTMLElement>
}

/** One product family: its header bar, details & specifications, and its lines. */
export const QuoteFamilyCard = ({
  family,
  onChange,
  onDelete,
  onDuplicate,
  onMove,
  canMoveUp,
  canMoveDown,
  isNew,
  dragHandleProps,
}: QuoteFamilyCardProps) => {
  const t = useTranslations('quoteEditor')
  const { readOnly, catalog, familyStatus } = useQuoteEditor()
  const sensors = useDragSensors()
  const [highlighted, setHighlighted] = useState(isNew)
  const [expanded, setExpanded] = useState(true)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [newLineId, setNewLineId] = useState<string | null>(null)

  useEffect(() => {
    if (!isNew) return
    const timer = setTimeout(() => setHighlighted(false), 600)
    return () => clearTimeout(timer)
  }, [isNew])

  const detail = family.productFamilyId ? catalog[family.productFamilyId] : undefined
  const status = familyStatus.find((s) => s.productFamilyId === family.productFamilyId)
  const total = familyTotal(family)
  const totalM2 = familyTotalM2(family)
  const specifications = familySpecifications(family, detail, { code: t('specProductCode'), brand: t('specBrand') })

  const setLines = (lines: QuoteLine[]) => onChange({ ...family, lines })
  const addLine = () => {
    const code = nextLineCode(family)
    const line = family.productFamilyId && detail ? newCatalogLine(detail, code) : newManualLine(code)
    setNewLineId(line.id)
    setExpanded(true)
    setLines([...family.lines, line])
  }
  const duplicateLine = (index: number) => {
    const source = family.lines[index]
    const copy = { ...source, id: newLocalId('l'), code: nextLineCode(family), locked: false }
    setNewLineId(copy.id)
    setLines([...family.lines.slice(0, index + 1), copy, ...family.lines.slice(index + 1)])
  }

  return (
    <div className={`overflow-hidden rounded-xl border-l-4 border-l-brand bg-white shadow-sm transition-all duration-200 hover:shadow-md ${highlighted ? 'animate-highlight' : ''}`}>
      <div className="relative z-10 flex items-center justify-between border-b border-slate-300 bg-white px-3 py-1.5 md:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {readOnly ? null : (
            <div className="flex flex-shrink-0 items-center text-slate-600">
              <DragHandle {...dragHandleProps} size={20} />
              <MoveArrows onUp={() => onMove(-1)} onDown={() => onMove(1)} canUp={canMoveUp} canDown={canMoveDown} size={14} />
            </div>
          )}
          <input
            type="text"
            value={family.name}
            onChange={(event) => onChange({ ...family, name: event.target.value })}
            disabled={readOnly}
            className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-2 py-0.5 text-[16px] font-semibold text-slate-900 outline-none transition-colors hover:border-slate-200 focus:border-brand focus:ring-1 focus:ring-brand disabled:hover:border-transparent"
            placeholder={t('familyNamePlaceholder')}
            aria-label={t('familyName')}
          />
          <ValidityBadge status={status} />
          <button
            type="button"
            onClick={() => onChange({ ...family, isAlternative: !family.isAlternative })}
            disabled={readOnly}
            className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold transition-colors ${
              family.isAlternative ? 'bg-amber-100 text-amber-600 hover:bg-amber-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
            }`}
            title={family.isAlternative ? t('familyAlternativeTitle') : t('markAlternative')}
          >
            {family.isAlternative ? 'ALT' : 'STD'}
          </button>
        </div>

        <div className="ml-2 flex flex-shrink-0 items-center gap-1">
          {!expanded ? <div className="mr-1 hidden text-[14px] font-bold tabular-nums text-brand sm:mr-2 sm:block">{EUR.format(total)}</div> : null}
          {readOnly ? null : (
            <>
              <button
                type="button"
                onClick={onDuplicate}
                className="rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                aria-label={t('duplicateFamily')}
                title={t('duplicateFamily')}
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
              <DeleteConfirmPopover onConfirm={onDelete} label={t('deleteFamilyConfirm')}>
                <button
                  type="button"
                  className="rounded-md p-1 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600"
                  aria-label={t('deleteFamily')}
                  title={t('deleteFamily')}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </DeleteConfirmPopover>
            </>
          )}
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="rounded-md p-1 text-slate-600 transition-colors hover:bg-slate-100"
            aria-label={expanded ? t('collapseFamily') : t('expandFamily')}
          >
            {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {expanded ? (
        <>
          <div className="border-b border-slate-300">
            <div className="flex w-full items-center gap-1 bg-slate-50 px-3 py-1.5 md:px-4">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">{t('detailsAndSpecs')}</span>
              <button
                type="button"
                onClick={() => setDetailsOpen((value) => !value)}
                aria-expanded={detailsOpen}
                aria-label={detailsOpen ? t('collapse') : t('expand')}
                className="rounded p-0.5 transition-colors hover:bg-slate-200"
              >
                {detailsOpen ? <ChevronUp className="h-5 w-5 text-slate-600" /> : <ChevronDown className="h-5 w-5 text-slate-600" />}
              </button>
            </div>
            {detailsOpen ? (
              <div className="flex flex-col gap-1.5 bg-slate-50/30 px-3 pb-2 pt-2 md:px-4">
                <input
                  type="text"
                  value={family.category}
                  onChange={(event) => onChange({ ...family, category: event.target.value })}
                  disabled={readOnly}
                  placeholder={t('categoryPlaceholder')}
                  aria-label={t('category')}
                  className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-600 outline-none transition-colors focus:border-brand focus:ring-1 focus:ring-brand"
                />
                <textarea
                  value={family.description}
                  onChange={(event) => onChange({ ...family, description: event.target.value })}
                  disabled={readOnly}
                  rows={2}
                  placeholder={t('descriptionPlaceholder')}
                  aria-label={t('description')}
                  className="w-full resize-y rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-600 outline-none transition-colors focus:border-brand focus:ring-1 focus:ring-brand"
                />
                <textarea
                  value={family.notes}
                  onChange={(event) => onChange({ ...family, notes: event.target.value })}
                  disabled={readOnly}
                  rows={2}
                  placeholder={t('notesPlaceholder')}
                  aria-label={t('notes')}
                  className="w-full resize-y rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-600 outline-none transition-colors focus:border-brand focus:ring-1 focus:ring-brand"
                />
                {specifications.length > 0 ? (
                  <div className="overflow-hidden rounded-md border border-slate-400 text-[12px]">
                    {specifications.map((row) => (
                      <div
                        key={`${row.kind}-${row.label}-${row.value}`}
                        className={`flex items-stretch border-b border-slate-300 last:border-0 ${row.kind === 'header' ? 'bg-white font-medium' : 'bg-slate-50'}`}
                      >
                        <div className={`border-r border-slate-200 px-3 py-1.5 text-slate-700 ${row.kind === 'header' ? 'w-[38%]' : 'w-[32%]'}`}>{row.label}</div>
                        {row.kind === 'detail' ? <div className="w-[30%] border-r border-slate-200 px-3 py-1.5 text-slate-500">{row.positions}</div> : null}
                        <div className="flex-1 px-3 py-1.5 text-slate-700">{row.value}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="px-3 pb-1.5 pt-2 md:px-4">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => setLines(reorderOnDrop(family.lines, event))}>
              <SortableContext items={family.lines.map((line) => line.id)} strategy={verticalListSortingStrategy}>
                <div className="border-l-2 border-[#7EC8E3] pl-2 md:pl-4">
                  <div className="mb-1 hidden items-center gap-1 border-b border-slate-300 px-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 md:flex">
                    <div className="w-[38px] shrink-0" />
                    <div className="w-10 shrink-0">{t('colPos')}</div>
                    <div className="w-9 shrink-0">{t('colQty')}</div>
                    <div className="min-w-[90px] flex-1">{t('colLine')}</div>
                    <div className="w-11 shrink-0">{t('colUnit')}</div>
                    <div className="w-16 shrink-0">{t('colWidth')}</div>
                    <div className="w-16 shrink-0">{t('colHeight')}</div>
                    <div className="w-12 shrink-0 normal-case">m²</div>
                    <div className="w-14 shrink-0">{t('colExtra')}</div>
                    <div className="w-16 shrink-0">{t('colUnitPrice')}</div>
                    <div className="w-10 shrink-0">{t('colDiscount')}</div>
                    <div className="w-[72px] shrink-0">{t('colNet')}</div>
                    <div className="w-[80px] shrink-0">{t('colTotal')}</div>
                    <div className="w-11 shrink-0">{t('colVat')}</div>
                    <div className="w-12 shrink-0">{t('colHours')}</div>
                    <div className="w-[48px] shrink-0" />
                  </div>
                  <div className="space-y-1.5">
                    {family.lines.map((line, index) => (
                      <SortableLine
                        key={line.id}
                        line={line}
                        detail={detail}
                        onChange={(updated) => setLines(family.lines.map((l) => (l.id === line.id ? updated : l)))}
                        onDelete={() => setLines(family.lines.filter((l) => l.id !== line.id))}
                        onDuplicate={() => duplicateLine(index)}
                        onMove={(direction) => setLines(moveItem(family.lines, index, direction))}
                        canMoveUp={index > 0}
                        canMoveDown={index < family.lines.length - 1}
                        isNew={newLineId === line.id}
                      />
                    ))}
                    {readOnly ? null : (
                      <button
                        type="button"
                        onClick={addLine}
                        className="flex h-[36px] w-full items-center justify-center rounded-lg border border-dashed border-slate-300 text-[13px] text-slate-500 transition-colors hover:border-[#7EC8E3] hover:bg-slate-50 hover:text-brand"
                      >
                        <Plus className="mr-2 h-5 w-5" />
                        {t('addLine')}
                      </button>
                    )}
                  </div>
                </div>
              </SortableContext>
            </DndContext>
          </div>

          <div className="flex items-center justify-end gap-4 border-t border-slate-300 bg-slate-50 px-3 py-1.5 text-sm md:px-4">
            {family.isAlternative ? <span className="text-[12px] italic text-amber-600">{t('familyAlternativeNote')}</span> : null}
            <div className="flex items-center gap-3">
              {totalM2 > 0 ? (
                <span className="text-slate-500">
                  {t('totalSurface')} <span className="font-medium tabular-nums text-slate-700">{DECIMAL.format(totalM2)} m²</span>
                </span>
              ) : null}
              <span className="text-slate-500">{t('subtotal')}</span>
              <span className="text-[18px] font-bold tabular-nums text-brand">{EUR.format(total)}</span>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
