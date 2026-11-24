'use client'

import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as Tooltip from '@radix-ui/react-tooltip'
import { lineNetUnitPrice, lineTotal, lineTotalM2, type QuoteLine, type VatRate } from '@schuco/contracts'
import { AlertTriangle, ChevronDown, ChevronUp, Copy, Loader2, Lock, MoreVertical, RotateCcw, Settings, Trash2, Unlock } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState, type HTMLAttributes } from 'react'

import { EUR } from '@/lib/format'
import type { ProductFamilyDetail } from '@/types/product-family'

import { lineCharacteristics } from './catalog'
import { useQuoteEditor } from './context'
import { DeleteConfirmPopover, DragHandle, MoveArrows } from './shared'

const VAT_RATES: VatRate[] = ['22%', '10%', '4%', 'Es.']

const inputCls = (extra = '') =>
  `h-[26px] text-[12px] text-slate-800 bg-slate-50 border border-slate-200 focus:border-[#7EC8E3] focus:ring-1 focus:ring-[#7EC8E3] rounded px-1 py-0 outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${extra}`

const calcCls = (extra = '') => `h-[26px] text-[12px] tabular-nums text-slate-500 bg-transparent flex items-center ${extra}`

const parseDecimal = (text: string): number => Number.parseFloat(text.replace('%', '').replace(',', '.'))

/** A number field edited as text and applied on blur (so "1," can be typed), like the client's cells. */
const useDecimalField = (value: number, format: (value: number) => string) => {
  const [text, setText] = useState(() => format(value))
  useEffect(() => setText(format(value)), [value, format])
  return [text, setText] as const
}

const formatPrice = (value: number) => value.toFixed(2)
const formatMarkup = (value: number) => String(100 + value)
const formatPlain = (value: number) => String(value)

interface QuoteLineRowProps {
  line: QuoteLine
  /** The catalog family of the line's family, when it is from the catalog. */
  detail: ProductFamilyDetail | undefined
  onChange: (line: QuoteLine) => void
  onDelete: () => void
  onDuplicate: () => void
  onMove: (direction: -1 | 1) => void
  canMoveUp: boolean
  canMoveDown: boolean
  isNew: boolean
  dragHandleProps: HTMLAttributes<HTMLElement>
}

/** One product line on one row: the client's columns, from Pos to Ore posa, then its actions. */
export const QuoteLineRow = ({
  line,
  detail,
  onChange,
  onDelete,
  onDuplicate,
  onMove,
  canMoveUp,
  canMoveDown,
  isNew,
  dragHandleProps,
}: QuoteLineRowProps) => {
  const t = useTranslations('quoteEditor')
  const { readOnly, priceErrors, pricing } = useQuoteEditor()
  const [highlighted, setHighlighted] = useState(isNew)
  const [expanded, setExpanded] = useState(false)
  const [priceText, setPriceText] = useDecimalField(line.unitPrice, formatPrice)
  const [markupText, setMarkupText] = useDecimalField(line.extraMarkupPct, formatMarkup)
  const [discountText, setDiscountText] = useDecimalField(line.discountPct, formatPlain)

  useEffect(() => {
    if (!isNew) return
    const timer = setTimeout(() => setHighlighted(false), 600)
    return () => clearTimeout(timer)
  }, [isNew])

  const disabled = readOnly || line.locked
  const characteristics = detail ? lineCharacteristics(detail, line.productLineId) : []
  const canExpand = characteristics.length > 0 || line.options.length > 0
  const totalM2 = lineTotalM2(line)
  const priceError = priceErrors[line.id]
  const isPricing = pricing.has(line.id)
  const fromCatalog = line.productLineId !== null && detail !== undefined

  const update = (patch: Partial<QuoteLine>) => onChange({ ...line, ...patch })

  const chooseCatalogLine = (productLineId: string) => {
    const catalogLine = detail?.lines.find((l) => l.id === productLineId)
    if (!catalogLine) return
    update({
      productLineId,
      name: catalogLine.name,
      unit: catalogLine.unitSymbol,
      options: [],
      priceMode: 'catalog',
      installationHours: catalogLine.installationHoursPerUnit == null ? null : Number(catalogLine.installationHoursPerUnit),
    })
  }

  const chooseOption = (mainId: string, subId: string) => {
    const others = line.options.filter((option) => option.characteristicId !== mainId)
    const main = characteristics.find((c) => c.main.id === mainId)
    const sub = main?.values.find((value) => value.id === subId)
    update({
      options: main && sub ? [...others, { characteristicId: mainId, subCharacteristicId: subId, name: main.main.name, value: sub.name }] : others,
    })
  }

  const commitPrice = () => {
    // Left as shown: keep the catalog price at full precision (the field shows it rounded).
    if (priceText === formatPrice(line.unitPrice)) return
    const value = Math.max(0, parseDecimal(priceText) || 0)
    setPriceText(formatPrice(value))
    // Typing a price of one's own makes the line manual; the catalog price stays one click away.
    if (value !== line.unitPrice) update({ unitPrice: value, priceMode: 'manual' })
  }
  const commitMarkup = () => {
    const parsed = parseDecimal(markupText)
    const value = Number.isNaN(parsed) ? 0 : Math.max(100, parsed) - 100
    setMarkupText(formatMarkup(value))
    if (value !== line.extraMarkupPct) update({ extraMarkupPct: value })
  }
  const commitDiscount = () => {
    const value = Math.min(100, Math.max(0, parseDecimal(discountText) || 0))
    setDiscountText(formatPlain(value))
    if (value !== line.discountPct) update({ discountPct: value })
  }
  const setSize = (field: 'widthMm' | 'heightMm', text: string) => {
    const value = text === '' ? null : Number.parseFloat(text)
    update({ [field]: value === null || Number.isNaN(value) || value <= 0 ? null : value })
  }

  const rowCls = line.locked
    ? 'border border-brand bg-[#EEF4F9]'
    : line.isAlternative
      ? 'border border-slate-300 border-l-4 border-l-amber-400 bg-white hover:border-slate-400 hover:border-l-amber-400'
      : 'border border-slate-300 bg-white hover:border-[#7EC8E3]'

  return (
    <div className={`group rounded-lg transition-all ${rowCls} ${highlighted ? 'animate-highlight' : ''}`}>
      <div className={`px-2 py-1 ${line.locked ? 'opacity-75' : ''}`}>
        {/* Desktop */}
        <div className="hidden gap-1 md:flex md:items-center">
          <div className="flex w-[38px] shrink-0 items-center gap-0.5">
            {readOnly ? null : (
              <>
                <DragHandle {...dragHandleProps} size={14} />
                <MoveArrows onUp={() => onMove(-1)} onDown={() => onMove(1)} canUp={canMoveUp} canDown={canMoveDown} size={14} />
              </>
            )}
          </div>

          <input
            type="text"
            maxLength={10}
            value={line.code}
            onChange={(event) => update({ code: event.target.value })}
            disabled={disabled}
            className={inputCls('w-10 shrink-0 !px-0 text-center')}
            title={t('colPos')}
            aria-label={t('colPos')}
          />
          <input
            type="number"
            min={1}
            value={line.quantity}
            onChange={(event) => update({ quantity: Math.max(1, Number.parseInt(event.target.value, 10) || 1) })}
            disabled={disabled}
            className={inputCls('w-9 shrink-0 text-right')}
            aria-label={t('colQty')}
          />

          {fromCatalog ? (
            <select
              value={line.productLineId ?? ''}
              onChange={(event) => chooseCatalogLine(event.target.value)}
              disabled={disabled}
              title={line.name}
              aria-label={t('colLine')}
              className="h-[26px] min-w-[90px] flex-1 truncate rounded border border-transparent bg-transparent px-0.5 text-[12px] font-medium text-slate-900 outline-none transition-colors hover:border-slate-200 focus:border-[#7EC8E3] focus:ring-1 focus:ring-[#7EC8E3] disabled:cursor-not-allowed"
            >
              {detail.lines.map((catalogLine) => (
                <option key={catalogLine.id} value={catalogLine.id}>
                  {catalogLine.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={line.name}
              onChange={(event) => update({ name: event.target.value })}
              disabled={disabled}
              placeholder={t('lineNamePlaceholder')}
              aria-label={t('colLine')}
              className="h-[26px] min-w-[90px] flex-1 rounded border border-transparent bg-transparent px-1 py-0 text-[12px] font-medium text-slate-900 outline-none transition-colors focus:border-[#7EC8E3] focus:ring-1 focus:ring-[#7EC8E3] disabled:cursor-not-allowed"
            />
          )}

          <input
            type="text"
            value={line.unit}
            onChange={(event) => update({ unit: event.target.value })}
            disabled={disabled || fromCatalog}
            placeholder="PZ"
            aria-label={t('colUnit')}
            className={inputCls('w-11 shrink-0 text-center')}
          />
          <input
            type="number"
            min={0}
            value={line.widthMm ?? ''}
            onChange={(event) => setSize('widthMm', event.target.value)}
            disabled={disabled}
            placeholder="—"
            aria-label={t('colWidth')}
            className={inputCls('w-16 shrink-0 text-right')}
          />
          <input
            type="number"
            min={0}
            value={line.heightMm ?? ''}
            onChange={(event) => setSize('heightMm', event.target.value)}
            disabled={disabled}
            placeholder="—"
            aria-label={t('colHeight')}
            className={inputCls('w-16 shrink-0 text-right')}
          />
          <div className={calcCls('w-12 shrink-0 justify-end')}>
            {totalM2 != null ? totalM2.toFixed(2) : <span className="text-slate-300">—</span>}
          </div>
          <input
            type="text"
            inputMode="decimal"
            value={markupText}
            onChange={(event) => setMarkupText(event.target.value.replace('%', ''))}
            onBlur={commitMarkup}
            onFocus={(event) => event.target.select()}
            disabled={disabled}
            placeholder="100"
            aria-label={t('colExtra')}
            className={inputCls('w-14 shrink-0 text-right')}
          />

          <div className="relative w-16 shrink-0">
            <input
              type="text"
              inputMode="decimal"
              value={priceText}
              onChange={(event) => setPriceText(event.target.value)}
              onBlur={commitPrice}
              onFocus={(event) => event.target.select()}
              disabled={disabled}
              aria-label={t('colUnitPrice')}
              title={priceError ?? (line.priceMode === 'catalog' ? t('catalogPrice') : t('manualPrice'))}
              className={inputCls(`w-16 text-right ${priceError ? '!border-red-300 !bg-red-50' : ''} ${line.priceMode === 'manual' && fromCatalog ? 'italic' : ''}`)}
            />
            {isPricing ? <Loader2 className="absolute -left-3.5 top-1.5 h-3 w-3 animate-spin text-slate-400" /> : null}
            {priceError && !isPricing ? (
              <span className="absolute -left-3.5 top-1.5" title={priceError} role="img" aria-label={priceError}>
                <AlertTriangle className="h-3 w-3 text-red-500" />
              </span>
            ) : null}
            {line.priceMode === 'manual' && fromCatalog && !disabled ? (
              <button
                type="button"
                onClick={() => update({ priceMode: 'catalog' })}
                title={t('backToCatalogPrice')}
                aria-label={t('backToCatalogPrice')}
                className="absolute -left-3.5 top-1.5 text-slate-400 hover:text-brand"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
            ) : null}
          </div>

          <input
            type="text"
            inputMode="decimal"
            value={discountText}
            onChange={(event) => setDiscountText(event.target.value.replace('%', ''))}
            onBlur={commitDiscount}
            onFocus={(event) => event.target.select()}
            disabled={disabled}
            placeholder="0"
            aria-label={t('colDiscount')}
            className={inputCls('w-10 shrink-0 text-right')}
          />
          <div className={calcCls('w-[72px] shrink-0 justify-end font-medium text-slate-600')}>{EUR.format(lineNetUnitPrice(line))}</div>
          <div className={`w-[80px] shrink-0 text-right text-[13px] font-bold tabular-nums ${line.isAlternative ? 'text-amber-500' : 'text-brand'}`}>
            {EUR.format(lineTotal(line))}
          </div>
          <select
            value={line.vatRate}
            onChange={(event) => update({ vatRate: event.target.value as VatRate })}
            disabled={disabled}
            aria-label={t('colVat')}
            className={inputCls('w-11 shrink-0 cursor-pointer text-center')}
          >
            {VAT_RATES.map((rate) => (
              <option key={rate}>{rate}</option>
            ))}
          </select>
          <input
            type="number"
            min={0}
            step={0.5}
            value={line.installationHours ?? ''}
            onChange={(event) => update({ installationHours: event.target.value === '' ? null : Math.max(0, Number.parseFloat(event.target.value) || 0) })}
            disabled={disabled}
            placeholder="—"
            title={t('colHours')}
            aria-label={t('colHours')}
            className={inputCls('w-12 shrink-0 text-right')}
          />

          <button
            type="button"
            onClick={() => update({ isAlternative: !line.isAlternative })}
            disabled={readOnly}
            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold transition-colors ${
              line.isAlternative ? 'bg-amber-100 text-amber-600 hover:bg-amber-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
            }`}
            title={line.isAlternative ? t('lineAlternativeTitle') : t('markAlternative')}
          >
            {line.isAlternative ? 'ALT' : 'STD'}
          </button>

          <div className="grid w-[48px] shrink-0 grid-cols-2 gap-0.5">
            <button
              type="button"
              onClick={onDuplicate}
              disabled={readOnly}
              className="flex items-center justify-center rounded-md p-1 text-slate-600 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-30"
              aria-label={t('duplicateLine')}
              title={t('duplicate')}
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            {readOnly ? (
              <span />
            ) : (
              <DeleteConfirmPopover onConfirm={onDelete} label={t('deleteLineConfirm')}>
                <button
                  type="button"
                  className="flex items-center justify-center rounded-md p-1 text-slate-600 hover:bg-red-50 hover:text-red-600"
                  aria-label={t('deleteLine')}
                  title={t('delete')}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </DeleteConfirmPopover>
            )}
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              disabled={!canExpand}
              className={`flex items-center justify-center rounded-md p-1 ${canExpand ? 'text-slate-600 hover:bg-slate-100 hover:text-slate-800' : 'cursor-not-allowed text-slate-300'}`}
              aria-label={t('expandCharacteristics')}
              title={expanded ? t('collapseDetails') : t('expandDetails')}
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button
                  type="button"
                  onClick={() => update({ locked: !line.locked })}
                  disabled={readOnly}
                  aria-label={line.locked ? t('unlockLine') : t('lockLine')}
                  className={`flex items-center justify-center rounded-md p-1 transition-colors ${
                    line.locked ? 'bg-amber-50 text-amber-500' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                  }`}
                >
                  {line.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content className="z-50 rounded bg-slate-800 px-2 py-1 text-xs text-white shadow-lg" sideOffset={5}>
                  {line.locked ? t('unlockLine') : t('lockLine')}
                  <Tooltip.Arrow className="fill-slate-800" />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          </div>
        </div>

        {line.isAlternative ? (
          <div className="mt-0.5 hidden border-t border-slate-100 px-2 pb-1 text-[11px] italic text-amber-600 md:block">{t('lineAlternativeNote')}</div>
        ) : null}

        {/* Mobile */}
        <div className="flex flex-col gap-2 md:hidden">
          <div className="flex items-center gap-2">
            {readOnly ? null : <DragHandle {...dragHandleProps} size={20} />}
            <button
              type="button"
              onClick={() => update({ locked: !line.locked })}
              disabled={readOnly}
              aria-label={line.locked ? t('unlockLine') : t('lockLine')}
              className={`shrink-0 rounded-md p-1.5 transition-colors ${line.locked ? 'bg-amber-50 text-amber-500' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {line.locked ? <Lock className="h-5 w-5" /> : <Unlock className="h-5 w-5" />}
            </button>
            <input
              type="text"
              value={line.name}
              onChange={(event) => update({ name: event.target.value })}
              disabled={disabled || fromCatalog}
              placeholder={t('lineNamePlaceholder')}
              className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-1 text-[14px] font-medium text-slate-900 outline-none transition-colors focus:border-[#7EC8E3] focus:ring-1 focus:ring-[#7EC8E3] disabled:cursor-not-allowed"
            />
            {readOnly ? null : (
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button
                    type="button"
                    aria-label={t('lineActions')}
                    className="shrink-0 rounded-md p-1.5 text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-[#7EC8E3]"
                  >
                    <MoreVertical className="h-5 w-5" />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content align="end" sideOffset={5} className="z-50 min-w-[160px] rounded-md border border-slate-200 bg-white p-1 shadow-md">
                    <DropdownMenu.Item
                      onSelect={() => setExpanded((value) => !value)}
                      disabled={!canExpand}
                      className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-slate-700 outline-none focus:bg-slate-100 data-[disabled]:cursor-not-allowed data-[disabled]:text-slate-300"
                    >
                      <Settings className="h-5 w-5" />
                      {expanded ? t('hideDetails') : t('showDetails')}
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      onSelect={onDuplicate}
                      className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-slate-700 outline-none focus:bg-slate-100"
                    >
                      <Copy className="h-5 w-5" />
                      {t('duplicate')}
                    </DropdownMenu.Item>
                    <DropdownMenu.Separator className="my-1 h-px bg-slate-100" />
                    <DropdownMenu.Item
                      onSelect={() => update({ isAlternative: !line.isAlternative })}
                      className={`flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-amber-50 ${line.isAlternative ? 'text-amber-600' : 'text-slate-700'}`}
                    >
                      <span className={`rounded px-1 py-0.5 text-[10px] font-bold ${line.isAlternative ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-400'}`}>
                        {line.isAlternative ? 'ALT' : 'STD'}
                      </span>
                      {line.isAlternative ? t('removeAlternative') : t('markAlternative')}
                    </DropdownMenu.Item>
                    <DropdownMenu.Separator className="my-1 h-px bg-slate-100" />
                    <DropdownMenu.Item
                      onSelect={onDelete}
                      className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-red-600 outline-none focus:bg-red-50"
                    >
                      <Trash2 className="h-5 w-5" />
                      {t('delete')}
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            )}
          </div>
          <div className="flex items-center justify-between border-t border-slate-50 pl-6 pt-1.5">
            <div className="flex items-center gap-1.5 text-[13px] text-slate-600">
              <input
                type="number"
                min={1}
                value={line.quantity}
                onChange={(event) => update({ quantity: Math.max(1, Number.parseInt(event.target.value, 10) || 1) })}
                disabled={disabled}
                aria-label={t('colQty')}
                className="w-14 rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-right text-[13px] text-slate-800 outline-none focus:border-[#7EC8E3] disabled:cursor-not-allowed"
              />
              <span className="text-slate-400">×</span>
              <input
                type="text"
                inputMode="decimal"
                value={priceText}
                onChange={(event) => setPriceText(event.target.value)}
                onBlur={commitPrice}
                disabled={disabled}
                aria-label={t('colUnitPrice')}
                className="w-24 rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-right text-[13px] text-slate-800 outline-none focus:border-[#7EC8E3] disabled:cursor-not-allowed"
              />
              {line.discountPct > 0 ? <span className="rounded bg-green-50 px-1 text-[11px] text-green-600">-{line.discountPct}%</span> : null}
            </div>
            <div className="text-[14px] font-bold tabular-nums text-brand">{EUR.format(lineTotal(line))}</div>
          </div>
        </div>
      </div>

      {expanded && canExpand ? (
        <div className="w-full px-3 pb-3 sm:px-12">
          {fromCatalog && !disabled ? (
            <div className="flex flex-wrap gap-2">
              {characteristics.map(({ main, values }) => {
                const chosen = line.options.find((option) => option.characteristicId === main.id)
                return (
                  <label key={main.id} className="inline-flex items-center gap-1 rounded-md border border-slate-100 bg-slate-50 px-2 py-0.5 text-[13px]">
                    <span className="text-slate-500">{main.name}:</span>
                    <select
                      value={chosen?.subCharacteristicId ?? ''}
                      onChange={(event) => chooseOption(main.id, event.target.value)}
                      className="rounded border border-transparent bg-transparent py-0.5 text-[13px] font-medium text-slate-700 outline-none hover:border-slate-200 focus:border-[#7EC8E3]"
                    >
                      <option value="">—</option>
                      {values.map((value) => (
                        <option key={value.id} value={value.id}>
                          {value.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {line.options.map((option) => (
                <div key={option.subCharacteristicId} className="inline-flex items-center rounded-md border border-slate-100 bg-slate-50 px-2.5 py-1 text-[13px]">
                  <span className="mr-1 text-slate-500">{option.name}:</span>
                  <span className="font-medium text-slate-700">{option.value}</span>
                </div>
              ))}
            </div>
          )}
          {line.widthMm && line.heightMm ? null : fromCatalog ? (
            <p className="mt-1.5 text-[11px] text-slate-400">{t('sizeNeeded')}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
