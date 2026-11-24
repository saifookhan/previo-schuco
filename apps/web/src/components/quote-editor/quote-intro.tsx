'use client'

import { DndContext, closestCenter } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { QuoteTextModule } from '@schuco/contracts'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { AddTextModuleButton } from './add-text-module-button'
import { useQuoteEditor } from './context'
import { RichTextModule } from './rich-text-module'
import {
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

const SortableModule = ({
  module,
  index,
  count,
  collapsed,
  onToggle,
  onChange,
  onDelete,
  onMove,
}: {
  module: QuoteTextModule
  index: number
  count: number
  collapsed: boolean
  onToggle: () => void
  onChange: (html: string) => void
  onDelete: () => void
  onMove: (direction: -1 | 1) => void
}) => {
  const t = useTranslations('quoteEditor')
  const { readOnly, saveTemplate } = useQuoteEditor()
  const { setNodeRef, style, handleProps } = useSortableItem(module.id)
  return (
    <div ref={setNodeRef} style={style} className="group flex items-center gap-2">
      {readOnly ? null : (
        <div className="flex flex-shrink-0 items-center gap-0.5">
          <DragHandle {...handleProps} />
          <MoveArrows onUp={() => onMove(-1)} onDown={() => onMove(1)} canUp={index > 0} canDown={index < count - 1} />
        </div>
      )}
      <ModuleBox title={t('textModule')} preview={htmlPreview(module.html)} collapsed={collapsed} onToggle={onToggle}>
        <RichTextModule
          html={module.html}
          onChange={onChange}
          onDelete={count > 1 ? onDelete : undefined}
          onSaveAsTemplate={saveTemplate}
          readOnly={readOnly}
        />
      </ModuleBox>
    </div>
  )
}

/** "Introduzione": the quote's opening text modules, sortable. */
export const QuoteIntro = ({ modules, onChange }: { modules: QuoteTextModule[]; onChange: (modules: QuoteTextModule[]) => void }) => {
  const t = useTranslations('quoteEditor')
  const sensors = useDragSensors()
  const [expanded, setExpanded] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  return (
    <SectionCard
      title={t('intro')}
      summary={htmlPreview(modules[0]?.html ?? '', 60)}
      expanded={expanded}
      onToggle={() => setExpanded((value) => !value)}
    >
      <div className="space-y-3 px-4 pb-4 pt-1 md:px-6 md:pb-6">
        {modules.length === 0 ? <p className="py-4 text-center text-[13px] italic text-slate-400">{t('noModules')}</p> : null}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => onChange(reorderOnDrop(modules, event))}>
          <SortableContext items={modules.map((module) => module.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {modules.map((module, index) => (
                <SortableModule
                  key={module.id}
                  module={module}
                  index={index}
                  count={modules.length}
                  collapsed={collapsed[module.id] ?? false}
                  onToggle={() => setCollapsed((state) => ({ ...state, [module.id]: !(state[module.id] ?? false) }))}
                  onChange={(html) => onChange(modules.map((m) => (m.id === module.id ? { ...m, html } : m)))}
                  onDelete={() => onChange(modules.filter((m) => m.id !== module.id))}
                  onMove={(direction) => onChange(moveItem(modules, index, direction))}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        <AddTextModuleButton onAdd={(html) => onChange([...modules, { id: newLocalId('m'), html }])} />
      </div>
    </SectionCard>
  )
}
