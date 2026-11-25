'use client'

import * as Popover from '@radix-ui/react-popover'
import { FileText, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { useQuoteEditor } from './context'

/** "Aggiungi modulo testo": an empty text, or one of the company's saved texts. */
export const AddTextModuleButton = ({ onAdd }: { onAdd: (html: string) => void }) => {
  const t = useTranslations('quoteEditor')
  const { templates, readOnly } = useQuoteEditor()
  const [open, setOpen] = useState(false)
  if (readOnly) return null

  const add = (html: string) => {
    setOpen(false)
    onAdd(html)
  }
  const button = (
    <button
      type="button"
      onClick={templates.length === 0 ? () => onAdd('') : undefined}
      className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 py-2.5 text-[13px] text-slate-500 transition-colors hover:border-brand hover:bg-blue-50 hover:text-brand"
    >
      <Plus size={16} />
      {t('addTextModule')}
    </button>
  )
  if (templates.length === 0) return button

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>{button}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="center"
          sideOffset={6}
          className="z-50 max-h-[60vh] min-w-[280px] overflow-y-auto rounded-lg border border-slate-200 bg-white py-1.5 shadow-lg"
        >
          <button
            type="button"
            onClick={() => add('')}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-slate-700 hover:bg-slate-50"
          >
            <Plus size={14} className="text-slate-400" />
            {t('emptyText')}
          </button>
          <div className="my-1 h-px bg-slate-100" />
          <p className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">{t('savedTexts')}</p>
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => add(template.html)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-slate-700 hover:bg-slate-50"
            >
              <FileText size={14} className="flex-shrink-0 text-slate-400" />
              <span className="truncate">{template.name}</span>
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
