'use client'

import {
  DndContext,
  DragOverlay,
  closestCenter,
  pointerWithin,
  rectIntersection,
  useDroppable,
  type CollisionDetection,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
import {
  familyTotal,
  quoteTotal,
  totalsByCategory,
  type ActivityRow,
  type ClosingBlock,
  type PaymentRow,
  type QuoteDocument,
  type QuoteFamily,
} from '@schuco/contracts'
import { AlertTriangle, CheckCircle, CheckCircle2, Eye, EyeOff, GripVertical, Plus, Trash2, XCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { EUR } from '@/lib/format'

import { AddTextModuleButton } from './add-text-module-button'
import { useQuoteEditor } from './context'
import { RichTextModule } from './rich-text-module'
import {
  DeleteConfirmPopover,
  DragHandle,
  ModuleBox,
  MoveArrows,
  SectionCard,
  htmlPreview,
  moveItem,
  newLocalId,
  reorderOnDrop,
  useDragSensors,
  useSortableItem,
} from './shared'

const PERCENT = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 })

/** A sortable row of the closing's small lists (families, categories, payments). */
const SortableListRow = ({
  id,
  index,
  count,
  onMove,
  children,
  className = 'flex items-center gap-1 border-b border-slate-300 py-1.5 last:border-0',
}: {
  id: string
  index: number
  count: number
  onMove: (direction: -1 | 1) => void
  children: React.ReactNode
  className?: string
}) => {
  const { readOnly } = useQuoteEditor()
  const { setNodeRef, style, handleProps } = useSortableItem(id)
  return (
    <div ref={setNodeRef} style={style} className={className}>
      {readOnly ? null : (
        <div className="flex flex-shrink-0 items-center gap-0.5">
          <DragHandle {...handleProps} size={14} className="text-slate-400 hover:text-slate-600" />
          <MoveArrows onUp={() => onMove(-1)} onDown={() => onMove(1)} canUp={index > 0} canDown={index < count - 1} size={13} />
        </div>
      )}
      {children}
    </div>
  )
}

const BlockTitle = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">{children}</p>
)

const FamilySummary = ({ families, onReorder }: { families: QuoteFamily[]; onReorder: (families: QuoteFamily[]) => void }) => {
  const t = useTranslations('quoteEditor')
  const sensors = useDragSensors()
  return (
    <div>
      <BlockTitle>{t('blockFamilySummary')}</BlockTitle>
      <div className="rounded-lg border border-slate-400 bg-slate-50 px-2 py-1">
        {families.length === 0 ? (
          <p className="py-2 text-sm italic text-slate-400">{t('noFamilies')}</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => onReorder(reorderOnDrop(families, event))}>
            <SortableContext items={families.map((f) => f.id)} strategy={verticalListSortingStrategy}>
              {families.map((family, index) => (
                <SortableListRow key={family.id} id={family.id} index={index} count={families.length} onMove={(d) => onReorder(moveItem(families, index, d))}>
                  <span className="flex flex-1 items-center gap-2 text-sm text-slate-700">
                    {family.name || t('unnamedFamily')}
                    {family.isAlternative ? <span className="text-[10px] italic text-amber-600">{t('familyAlternativeNote')}</span> : null}
                  </span>
                  <span className="font-mono text-sm font-medium tabular-nums text-slate-800">{EUR.format(familyTotal(family))}</span>
                </SortableListRow>
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  )
}

const CategorySummary = ({
  families,
  order,
  onReorder,
}: {
  families: QuoteFamily[]
  order: string[] | undefined
  onReorder: (order: string[]) => void
}) => {
  const t = useTranslations('quoteEditor')
  const sensors = useDragSensors()
  const rows = totalsByCategory(families, order)
  if (rows.length === 0) return null
  const ids = rows.map((row) => row.category)
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from !== -1 && to !== -1) onReorder(arrayMove(ids, from, to))
  }
  return (
    <div>
      <BlockTitle>{t('blockCategoryGrouping')}</BlockTitle>
      <div className="rounded-lg border border-slate-400 bg-slate-50 px-2 py-1">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            {rows.map((row, index) => (
              <SortableListRow key={row.category} id={row.category} index={index} count={rows.length} onMove={(d) => onReorder(moveItem(ids, index, d))}>
                <span className="flex-1 text-sm text-slate-700">{row.category}</span>
                <span className="font-mono text-sm font-medium tabular-nums text-slate-800">{EUR.format(row.total)}</span>
              </SortableListRow>
            ))}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  )
}

const TotalBlock = ({ total }: { total: number }) => {
  const t = useTranslations('quoteEditor')
  return (
    <div className="flex flex-col items-end">
      <p className="mb-3 self-start text-[11px] font-semibold uppercase tracking-widest text-slate-400">{t('blockTotalTitle')}</p>
      <div className="font-mono text-[22px] font-bold leading-none tabular-nums text-brand md:text-[28px]">{EUR.format(total)}</div>
      <span className="mt-2 rounded-full bg-slate-100 px-3 py-1 text-[12px] font-medium text-slate-400">{t('vatExcluded')}</span>
    </div>
  )
}

const Payments = ({ rows, total, onChange }: { rows: PaymentRow[]; total: number; onChange: (rows: PaymentRow[]) => void }) => {
  const t = useTranslations('quoteEditor')
  const { readOnly } = useQuoteEditor()
  const sensors = useDragSensors()
  const sum = rows.reduce((acc, row) => acc + (row.pct || 0), 0)
  const complete = Math.abs(sum - 100) < 0.01
  const update = (id: string, patch: Partial<PaymentRow>) => onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  return (
    <div>
      <BlockTitle>{t('blockPayments')}</BlockTitle>
      <div className="overflow-hidden rounded-lg border border-slate-400">
        <div className="flex items-center gap-1 border-b border-slate-200 bg-slate-50 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          <span className="w-[52px] flex-shrink-0" />
          <span className="flex-1">{t('paymentDescription')}</span>
          <span className="w-16 flex-shrink-0 text-right">%</span>
          <span className="w-28 flex-shrink-0 pr-1 text-right">{t('paymentAmount')}</span>
          <span className="w-7 flex-shrink-0" />
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => onChange(reorderOnDrop(rows, event))}>
          <SortableContext items={rows.map((row) => row.id)} strategy={verticalListSortingStrategy}>
            {rows.map((row, index) => (
              <SortableListRow
                key={row.id}
                id={row.id}
                index={index}
                count={rows.length}
                onMove={(d) => onChange(moveItem(rows, index, d))}
                className="flex items-center gap-1 border-b border-slate-100 pl-2 last:border-0"
              >
                <input
                  type="text"
                  value={row.description}
                  onChange={(event) => update(row.id, { description: event.target.value })}
                  disabled={readOnly}
                  placeholder={t('paymentPlaceholder')}
                  className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-1.5 text-[13px] text-slate-800 outline-none transition-colors focus:border-[#7EC8E3] focus:ring-1 focus:ring-[#7EC8E3]"
                />
                <div className="flex w-16 flex-shrink-0 items-center gap-0.5">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={row.pct}
                    onChange={(event) => update(row.id, { pct: Math.min(100, Math.max(0, Number.parseFloat(event.target.value) || 0)) })}
                    disabled={readOnly}
                    className="w-12 rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-right text-[13px] tabular-nums text-slate-800 outline-none focus:border-[#7EC8E3] focus:ring-1 focus:ring-[#7EC8E3]"
                  />
                  <span className="text-[12px] text-slate-400">%</span>
                </div>
                <span className="w-28 flex-shrink-0 pr-1 text-right font-mono text-[13px] font-medium tabular-nums text-slate-700">
                  {EUR.format(total > 0 ? total * (row.pct / 100) : 0)}
                </span>
                <button
                  type="button"
                  onClick={() => onChange(rows.filter((r) => r.id !== row.id))}
                  disabled={readOnly || rows.length <= 1}
                  className="mr-1 flex w-7 flex-shrink-0 items-center justify-center rounded text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-20"
                  aria-label={t('deleteRow')}
                >
                  <Trash2 size={13} />
                </button>
              </SortableListRow>
            ))}
          </SortableContext>
        </DndContext>
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-3 py-2">
          <div className={`flex items-center gap-1.5 text-[12px] font-medium ${complete ? 'text-emerald-600' : 'text-amber-600'}`}>
            {complete ? <CheckCircle2 size={14} className="flex-shrink-0" /> : <AlertTriangle size={14} className="flex-shrink-0" />}
            <span className="tabular-nums">
              {complete
                ? t('paymentsComplete')
                : sum > 100
                  ? t('paymentsOver', { sum: PERCENT.format(sum), diff: PERCENT.format(sum - 100) })
                  : t('paymentsUnder', { sum: PERCENT.format(sum), diff: PERCENT.format(100 - sum) })}
            </span>
          </div>
          {readOnly ? null : (
            <button
              type="button"
              onClick={() => onChange([...rows, { id: newLocalId('pag'), description: t('newPayment'), pct: 0 }])}
              className="flex flex-shrink-0 items-center gap-1 text-[12px] text-slate-500 transition-colors hover:text-brand"
            >
              <Plus size={13} />
              {t('addPayment')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const ZONE_INCLUDED = 'zone-included'
const ZONE_EXCLUDED = 'zone-excluded'

const activityCollision: CollisionDetection = (args) => {
  const within = pointerWithin(args)
  return within.length > 0 ? within : rectIntersection(args)
}

const DroppableZone = ({ id, children }: { id: string; children: React.ReactNode }) => {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div ref={setNodeRef} className={`min-h-[28px] rounded transition-colors ${isOver ? 'bg-slate-50' : ''}`}>
      {children}
    </div>
  )
}

const ActivityRowItem = ({
  row,
  index,
  count,
  onChange,
  onMove,
  onDelete,
}: {
  row: ActivityRow
  index: number
  count: number
  onChange: (patch: Partial<ActivityRow>) => void
  onMove: (direction: -1 | 1) => void
  onDelete: () => void
}) => {
  const t = useTranslations('quoteEditor')
  const { readOnly } = useQuoteEditor()
  const { setNodeRef, style, handleProps } = useSortableItem(row.id)
  return (
    <div ref={setNodeRef} style={style} className="group/row flex items-center gap-1.5 border-b border-slate-100 px-2 py-1 last:border-0">
      {readOnly ? null : (
        <>
          <DragHandle {...handleProps} size={13} className="text-slate-300 hover:text-slate-500" />
          <div className="flex-shrink-0 opacity-0 transition-opacity group-hover/row:opacity-100">
            <MoveArrows onUp={() => onMove(-1)} onDown={() => onMove(1)} canUp={index > 0} canDown={index < count - 1} size={11} />
          </div>
        </>
      )}
      <input
        type="text"
        value={row.description}
        onChange={(event) => onChange({ description: event.target.value })}
        disabled={readOnly}
        placeholder={t('activityPlaceholder')}
        className={`min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-[13px] outline-none transition-colors focus:border-[#7EC8E3] focus:ring-1 focus:ring-[#7EC8E3] ${
          row.enabled ? 'text-slate-800' : 'text-slate-400 line-through'
        }`}
      />
      <button
        type="button"
        title={row.enabled ? t('activityPrinted') : t('activityNotPrinted')}
        aria-label={row.enabled ? t('activityPrinted') : t('activityNotPrinted')}
        onClick={() => onChange({ enabled: !row.enabled })}
        disabled={readOnly}
        className={`flex-shrink-0 rounded p-1 transition-colors hover:bg-slate-50 ${row.enabled ? 'text-slate-400 hover:text-brand' : 'text-slate-300 hover:text-slate-500'}`}
      >
        {row.enabled ? <Eye size={13} /> : <EyeOff size={13} />}
      </button>
      {readOnly ? null : (
        <button
          type="button"
          onClick={onDelete}
          className="flex-shrink-0 rounded p-1 text-slate-300 opacity-0 transition-colors hover:bg-red-50 hover:text-red-500 group-hover/row:opacity-100"
          aria-label={t('delete')}
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  )
}

const Activities = ({ rows, onChange }: { rows: ActivityRow[]; onChange: (rows: ActivityRow[]) => void }) => {
  const t = useTranslations('quoteEditor')
  const { readOnly } = useQuoteEditor()
  const sensors = useDragSensors()
  const [activeId, setActiveId] = useState<string | null>(null)
  const included = rows.filter((row) => row.included)
  const excluded = rows.filter((row) => !row.included)
  const activeRow = activeId ? rows.find((row) => row.id === activeId) : undefined

  const joined = (zoneIncluded: boolean, zone: ActivityRow[], other: ActivityRow[]) => (zoneIncluded ? [...zone, ...other] : [...other, ...zone])

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null)
    if (!over) return
    const dragged = rows.find((row) => row.id === active.id)
    if (!dragged) return
    const overZone = over.id === ZONE_INCLUDED || over.id === ZONE_EXCLUDED
    const overRow = overZone ? undefined : rows.find((row) => row.id === over.id)
    const targetIncluded = overZone ? over.id === ZONE_INCLUDED : (overRow?.included ?? dragged.included)
    if (dragged.included === targetIncluded) {
      const zone = rows.filter((row) => row.included === targetIncluded)
      const from = zone.findIndex((row) => row.id === active.id)
      const to = overRow ? zone.findIndex((row) => row.id === over.id) : zone.length - 1
      if (from === -1 || to === -1 || from === to) return
      onChange(joined(targetIncluded, arrayMove(zone, from, to), rows.filter((row) => row.included !== targetIncluded)))
      return
    }
    const moved = { ...dragged, included: targetIncluded }
    const source = rows.filter((row) => row.included === dragged.included && row.id !== dragged.id)
    const target = rows.filter((row) => row.included === targetIncluded)
    const at = overRow ? target.findIndex((row) => row.id === overRow.id) : target.length
    onChange(joined(targetIncluded, [...target.slice(0, at), moved, ...target.slice(at)], source))
  }

  const zone = (isIncluded: boolean, list: ActivityRow[]) =>
    list.map((row, index) => (
      <ActivityRowItem
        key={row.id}
        row={row}
        index={index}
        count={list.length}
        onChange={(patch) => onChange(rows.map((r) => (r.id === row.id ? { ...r, ...patch } : r)))}
        onMove={(direction) => onChange(joined(isIncluded, moveItem(list, index, direction), rows.filter((r) => r.included !== isIncluded)))}
        onDelete={() => onChange(rows.filter((r) => r.id !== row.id))}
      />
    ))

  return (
    <div>
      <BlockTitle>{t('blockActivities')}</BlockTitle>
      <DndContext sensors={sensors} collisionDetection={activityCollision} onDragStart={({ active }) => setActiveId(String(active.id))} onDragEnd={onDragEnd}>
        <div className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-400">
          <div>
            <div className="flex items-center gap-1.5 border-b border-emerald-100 bg-emerald-50 px-3 py-1.5">
              <CheckCircle size={13} className="flex-shrink-0 text-emerald-500" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">{t('included')}</span>
              <span className="ml-auto text-[10px] tabular-nums text-emerald-500">{included.length}</span>
            </div>
            <SortableContext items={included.map((row) => row.id)} strategy={verticalListSortingStrategy}>
              <DroppableZone id={ZONE_INCLUDED}>
                {included.length === 0 ? <p className="px-4 py-2 text-[12px] italic text-slate-400">{t('dropIncluded')}</p> : null}
                {zone(true, included)}
              </DroppableZone>
            </SortableContext>
          </div>
          <div>
            <div className="flex items-center gap-1.5 border-b border-amber-200 bg-amber-50 px-3 py-1.5">
              <XCircle size={13} className="flex-shrink-0 text-amber-500" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">{t('notIncluded')}</span>
              <span className="ml-auto text-[10px] tabular-nums text-amber-500">{excluded.length}</span>
            </div>
            <SortableContext items={excluded.map((row) => row.id)} strategy={verticalListSortingStrategy}>
              <DroppableZone id={ZONE_EXCLUDED}>
                {excluded.length === 0 ? <p className="px-4 py-2 text-[12px] italic text-slate-400">{t('dropNotIncluded')}</p> : null}
                {zone(false, excluded)}
              </DroppableZone>
            </SortableContext>
          </div>
        </div>
        <DragOverlay dropAnimation={null}>
          {activeRow ? (
            <div className="flex items-center gap-2 rounded-md border border-[#7EC8E3] bg-white px-3 py-1.5 text-[13px] opacity-95 shadow-lg">
              <GripVertical size={13} className="flex-shrink-0 text-slate-400" />
              <span className={`flex-1 ${activeRow.enabled ? 'text-slate-800' : 'text-slate-400 line-through'}`}>{activeRow.description}</span>
              {activeRow.enabled ? <Eye size={13} className="text-slate-400" /> : <EyeOff size={13} className="text-slate-300" />}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      {readOnly ? null : (
        <button
          type="button"
          onClick={() => onChange([...rows, { id: newLocalId('att'), description: t('newActivity'), included: true, enabled: true }])}
          className="mt-2 flex items-center gap-1 text-[12px] text-slate-500 transition-colors hover:text-brand"
        >
          <Plus size={13} />
          {t('addActivity')}
        </button>
      )}
    </div>
  )
}

const BLOCK_TITLE_KEYS = {
  familySummary: 'blockFamilySummary',
  categorySummary: 'blockCategorySummary',
  total: 'blockTotal',
  payments: 'blockPayments',
  activities: 'blockActivities',
  text: 'textModule',
} as const

const SortableBlock = ({
  block,
  index,
  count,
  document,
  collapsed,
  onToggle,
  onChange,
  onDelete,
  onMove,
  onFamiliesReorder,
}: {
  block: ClosingBlock
  index: number
  count: number
  document: QuoteDocument
  collapsed: boolean
  onToggle: () => void
  onChange: (block: ClosingBlock) => void
  onDelete: () => void
  onMove: (direction: -1 | 1) => void
  onFamiliesReorder: (families: QuoteFamily[]) => void
}) => {
  const t = useTranslations('quoteEditor')
  const { readOnly, saveTemplate } = useQuoteEditor()
  const { setNodeRef, style, handleProps } = useSortableItem(block.id)
  const total = quoteTotal(document)

  return (
    <div ref={setNodeRef} style={style} className="group flex items-center gap-2">
      {readOnly ? null : (
        <div className="flex flex-shrink-0 items-center gap-0.5">
          <DragHandle {...handleProps} />
          <MoveArrows onUp={() => onMove(-1)} onDown={() => onMove(1)} canUp={index > 0} canDown={index < count - 1} />
        </div>
      )}
      <ModuleBox title={t(BLOCK_TITLE_KEYS[block.type])} preview={block.type === 'text' ? htmlPreview(block.html) : undefined} collapsed={collapsed} onToggle={onToggle}>
        {block.type === 'text' ? (
          <RichTextModule html={block.html} onChange={(html) => onChange({ ...block, html })} onSaveAsTemplate={saveTemplate} readOnly={readOnly} />
        ) : (
          <div className="p-3">
            {block.type === 'familySummary' ? <FamilySummary families={document.families} onReorder={onFamiliesReorder} /> : null}
            {block.type === 'categorySummary' ? (
              <CategorySummary families={document.families} order={block.categoryOrder} onReorder={(categoryOrder) => onChange({ ...block, categoryOrder })} />
            ) : null}
            {block.type === 'total' ? <TotalBlock total={total} /> : null}
            {block.type === 'payments' ? <Payments rows={block.rows} total={total} onChange={(rows) => onChange({ ...block, rows })} /> : null}
            {block.type === 'activities' ? <Activities rows={block.rows} onChange={(rows) => onChange({ ...block, rows })} /> : null}
          </div>
        )}
      </ModuleBox>
      {block.type === 'text' && !readOnly ? (
        <DeleteConfirmPopover onConfirm={onDelete} label={t('deleteModuleConfirm')}>
          <button
            type="button"
            aria-label={t('deleteModule')}
            className="flex-shrink-0 rounded p-1 text-slate-600 transition-colors hover:bg-red-50 hover:text-red-500"
          >
            <Trash2 size={16} />
          </button>
        </DeleteConfirmPopover>
      ) : null}
    </div>
  )
}

/** "Riepilogo e Chiusura": the closing blocks, sortable, each collapsible (texts start collapsed). */
export const QuoteClosing = ({
  document,
  onChange,
  onFamiliesReorder,
}: {
  document: QuoteDocument
  onChange: (closing: ClosingBlock[]) => void
  onFamiliesReorder: (families: QuoteFamily[]) => void
}) => {
  const t = useTranslations('quoteEditor')
  const sensors = useDragSensors()
  const [expanded, setExpanded] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const blocks = document.closing

  return (
    <SectionCard
      title={t('closing')}
      summary={<span className="font-mono tabular-nums">{EUR.format(quoteTotal(document))}</span>}
      expanded={expanded}
      onToggle={() => setExpanded((value) => !value)}
    >
      <div className="space-y-3 px-3 pb-3 pt-1 md:px-4 md:pb-4">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => onChange(reorderOnDrop(blocks, event))}>
          <SortableContext items={blocks.map((block) => block.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {blocks.map((block, index) => (
                <SortableBlock
                  key={block.id}
                  block={block}
                  index={index}
                  count={blocks.length}
                  document={document}
                  collapsed={collapsed[block.id] ?? block.type === 'text'}
                  onToggle={() => setCollapsed((state) => ({ ...state, [block.id]: !(state[block.id] ?? block.type === 'text') }))}
                  onChange={(updated) => onChange(blocks.map((b) => (b.id === block.id ? updated : b)))}
                  onDelete={() => onChange(blocks.filter((b) => b.id !== block.id))}
                  onMove={(direction) => onChange(moveItem(blocks, index, direction))}
                  onFamiliesReorder={onFamiliesReorder}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        <AddTextModuleButton
          onAdd={(html) => {
            const id = newLocalId('c')
            setCollapsed((state) => ({ ...state, [id]: false }))
            onChange([...blocks, { id, type: 'text', html }])
          }}
        />
      </div>
    </SectionCard>
  )
}
