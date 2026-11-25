'use client'

import { PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { arrayMove, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import * as Popover from '@radix-ui/react-popover'
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState, type CSSProperties, type HTMLAttributes, type ReactElement } from 'react'

import { cn } from '@/lib/utils'

/** A new client-side id ("f-…", "l-…"): only unique within the quote document. */
export const newLocalId = (prefix: string): string => `${prefix}-${crypto.randomUUID().slice(0, 13)}`

/** Swaps the item at `index` with its neighbour above (-1) or below (1). */
export const moveItem = <T,>(items: T[], index: number, direction: -1 | 1): T[] => {
  const next = index + direction
  if (next < 0 || next >= items.length) return items
  const copy = [...items]
  ;[copy[index], copy[next]] = [copy[next], copy[index]]
  return copy
}

/** The list after dropping the dragged item (by id) onto another one; unchanged otherwise. */
export const reorderOnDrop = <T extends { id: string }>(items: T[], { active, over }: DragEndEvent): T[] => {
  if (!over || active.id === over.id) return items
  const from = items.findIndex((item) => item.id === active.id)
  const to = items.findIndex((item) => item.id === over.id)
  return from === -1 || to === -1 ? items : arrayMove(items, from, to)
}

/** Pointer dragging that starts after 8px, so clicks on the handle's neighbours still work. */
export const useDragSensors = () => useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

/** `useSortable` with the client's drag styling: faded while dragged, above its neighbours. */
export const useSortableItem = (id: string) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    position: 'relative',
    zIndex: isDragging ? 10 : undefined,
  }
  return { setNodeRef, style, handleProps: { ...attributes, ...listeners } as HTMLAttributes<HTMLElement> }
}

export const DragHandle = ({ size = 16, className, ...props }: HTMLAttributes<HTMLElement> & { size?: number }) => {
  const t = useTranslations('quoteEditor')
  return (
    <div
      {...props}
      className={cn('cursor-grab touch-none p-0.5 text-slate-600 transition-colors hover:text-slate-800 active:cursor-grabbing', className)}
      title={t('dragToReorder')}
      aria-label={t('dragToReorder')}
    >
      <GripVertical size={size} />
    </div>
  )
}

/** The ↑/↓ pair next to a drag handle. */
export const MoveArrows = ({
  onUp,
  onDown,
  canUp,
  canDown,
  size = 15,
}: {
  onUp: () => void
  onDown: () => void
  canUp: boolean
  canDown: boolean
  size?: number
}) => {
  const t = useTranslations('quoteEditor')
  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={onUp}
        disabled={!canUp}
        aria-label={t('moveUp')}
        className="rounded p-0.5 text-slate-600 transition-colors hover:text-brand disabled:cursor-not-allowed disabled:opacity-20"
      >
        <ChevronUp size={size} />
      </button>
      <button
        type="button"
        onClick={onDown}
        disabled={!canDown}
        aria-label={t('moveDown')}
        className="rounded p-0.5 text-slate-600 transition-colors hover:text-brand disabled:cursor-not-allowed disabled:opacity-20"
      >
        <ChevronDown size={size} />
      </button>
    </div>
  )
}

/** "Eliminare …?" with Annulla / Elimina, above the trash button it wraps. */
export const DeleteConfirmPopover = ({
  onConfirm,
  label,
  children,
}: {
  onConfirm: () => void
  label: string
  children: ReactElement
}) => {
  const t = useTranslations('quoteEditor')
  const [open, setOpen] = useState(false)
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="center"
          sideOffset={6}
          className="z-50 min-w-[150px] rounded-lg border border-slate-200 bg-white p-3 shadow-lg"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <p className="mb-2 text-center text-[12px] font-medium text-slate-700">{label}</p>
          <div className="flex justify-center gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md border border-slate-200 px-3 py-1 text-[12px] text-slate-600 transition-colors hover:bg-slate-50"
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onConfirm()
              }}
              className="rounded-md bg-red-500 px-3 py-1 text-[12px] text-white transition-colors hover:bg-red-600"
            >
              {t('delete')}
            </button>
          </div>
          <Popover.Arrow className="fill-white" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

/** Plain text of rich text, for a one-line preview of a collapsed module. */
export const htmlPreview = (html: string, max = 70): string => {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/** A collapsible bordered box with a small uppercase title (the closing's and intro's modules). */
export const ModuleBox = ({
  title,
  preview,
  collapsed,
  onToggle,
  children,
}: {
  title: string
  preview?: string
  collapsed: boolean
  onToggle: () => void
  children: React.ReactNode
}) => (
  <div className="min-w-0 flex-1 overflow-hidden rounded-lg border border-slate-400">
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      className="flex w-full items-center justify-between bg-slate-50 px-3 py-1.5 text-left transition-colors hover:bg-slate-100"
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="flex-shrink-0 text-[11px] font-semibold uppercase tracking-widest text-slate-400">{title}</span>
        {collapsed && preview ? <span className="truncate text-[12px] text-slate-500">{preview}</span> : null}
      </span>
      {collapsed ? (
        <ChevronDown size={16} className="flex-shrink-0 text-slate-600" />
      ) : (
        <ChevronUp size={16} className="flex-shrink-0 text-slate-600" />
      )}
    </button>
    {collapsed ? null : children}
  </div>
)

/** The white card of a top-level section ("Introduzione", "Riepilogo e Chiusura") with its expand toggle. */
export const SectionCard = ({
  title,
  summary,
  expanded,
  onToggle,
  children,
}: {
  title: string
  summary?: React.ReactNode
  expanded: boolean
  onToggle: () => void
  children: React.ReactNode
}) => {
  const t = useTranslations('quoteEditor')
  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm">
      <div className="flex h-[36px] items-center justify-between px-3 md:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex-shrink-0 text-[15px] font-semibold text-slate-800">{title}</span>
          {!expanded && summary ? <span className="ml-2 truncate text-[13px] text-slate-400">{summary}</span> : null}
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={expanded ? t('collapse') : t('expand')}
          className="flex-shrink-0 rounded-md p-1.5 text-slate-600 transition-colors hover:bg-slate-100 hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
      </div>
      {expanded ? children : null}
    </div>
  )
}
