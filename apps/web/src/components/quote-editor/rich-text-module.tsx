'use client'

import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import TextAlign from '@tiptap/extension-text-align'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  BookmarkPlus,
  Heading1,
  Heading2,
  ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Strikethrough,
  Trash2,
  UnderlineIcon,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRef, type ChangeEvent, type ReactNode } from 'react'

import { DeleteConfirmPopover } from './shared'

/** Largest image pasted into a text module (it is stored inside the quote). */
const IMAGE_MAX_BYTES = 1024 * 1024

const ToolbarButton = ({
  onClick,
  active = false,
  title,
  children,
}: {
  onClick: () => void
  active?: boolean
  title: string
  children: ReactNode
}) => (
  <button
    type="button"
    onMouseDown={(event) => {
      event.preventDefault()
      onClick()
    }}
    title={title}
    aria-label={title}
    aria-pressed={active}
    className={`rounded p-1.5 transition-colors ${active ? 'bg-brand text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
  >
    {children}
  </button>
)

const Divider = () => <span className="mx-0.5 h-5 w-px flex-shrink-0 bg-slate-200" />

interface RichTextModuleProps {
  html: string
  onChange: (html: string) => void
  onDelete?: () => void
  /** Saves the text as one of the company's saved texts. */
  onSaveAsTemplate?: (html: string) => void
  readOnly?: boolean
}

/** One rich-text module (intro or closing text) with the client's toolbar. */
export const RichTextModule = ({ html, onChange, onDelete, onSaveAsTemplate, readOnly = false }: RichTextModuleProps) => {
  const t = useTranslations('quoteEditor')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const editor = useEditor({
    immediatelyRender: false,
    editable: !readOnly,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2] }, link: { openOnClick: false } }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Image.configure({ inline: false, allowBase64: true }),
      Placeholder.configure({ placeholder: t('textPlaceholder') }),
    ],
    content: html,
    onUpdate: ({ editor: current }) => onChange(current.getHTML()),
    editorProps: {
      attributes: { class: 'quote-rich max-w-none min-h-[80px] px-3 py-3 text-sm text-slate-800 outline-none' },
    },
  })

  const active = useEditorState({
    editor,
    selector: ({ editor: current }) =>
      current
        ? {
            h1: current.isActive('heading', { level: 1 }),
            h2: current.isActive('heading', { level: 2 }),
            bold: current.isActive('bold'),
            italic: current.isActive('italic'),
            underline: current.isActive('underline'),
            strike: current.isActive('strike'),
            left: current.isActive({ textAlign: 'left' }),
            center: current.isActive({ textAlign: 'center' }),
            right: current.isActive({ textAlign: 'right' }),
            justify: current.isActive({ textAlign: 'justify' }),
            bullet: current.isActive('bulletList'),
            ordered: current.isActive('orderedList'),
            link: current.isActive('link'),
          }
        : null,
  })

  // useEditorState only updates on the editor's first transaction, so don't wait for it to show the editor.
  if (!editor) return null
  const is = active ?? {
    h1: false,
    h2: false,
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    left: false,
    center: false,
    right: false,
    justify: false,
    bullet: false,
    ordered: false,
    link: false,
  }

  const pickImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > IMAGE_MAX_BYTES) {
      window.alert(t('imageTooLarge'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => editor.chain().focus().setImage({ src: String(reader.result) }).run()
    reader.readAsDataURL(file)
  }

  const setLink = () => {
    const previous = editor.getAttributes('link').href as string | undefined
    const url = window.prompt(t('linkPrompt'), previous ?? '')
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  if (readOnly) {
    return (
      <div className="bg-white">
        <EditorContent editor={editor} />
      </div>
    )
  }

  const chain = () => editor.chain().focus()
  return (
    <div className="bg-white">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-300 bg-slate-50 px-2 py-1.5">
        <ToolbarButton onClick={() => chain().toggleHeading({ level: 1 }).run()} active={is.h1} title={t('toolHeading1')}>
          <Heading1 size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => chain().toggleHeading({ level: 2 }).run()} active={is.h2} title={t('toolHeading2')}>
          <Heading2 size={15} />
        </ToolbarButton>
        <Divider />
        <ToolbarButton onClick={() => chain().toggleBold().run()} active={is.bold} title={t('toolBold')}>
          <Bold size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => chain().toggleItalic().run()} active={is.italic} title={t('toolItalic')}>
          <Italic size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => chain().toggleUnderline().run()} active={is.underline} title={t('toolUnderline')}>
          <UnderlineIcon size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => chain().toggleStrike().run()} active={is.strike} title={t('toolStrike')}>
          <Strikethrough size={15} />
        </ToolbarButton>
        <Divider />
        <ToolbarButton onClick={() => chain().setTextAlign('left').run()} active={is.left} title={t('toolAlignLeft')}>
          <AlignLeft size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => chain().setTextAlign('center').run()} active={is.center} title={t('toolAlignCenter')}>
          <AlignCenter size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => chain().setTextAlign('right').run()} active={is.right} title={t('toolAlignRight')}>
          <AlignRight size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => chain().setTextAlign('justify').run()} active={is.justify} title={t('toolJustify')}>
          <AlignJustify size={15} />
        </ToolbarButton>
        <Divider />
        <ToolbarButton onClick={() => chain().toggleBulletList().run()} active={is.bullet} title={t('toolBulletList')}>
          <List size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => chain().toggleOrderedList().run()} active={is.ordered} title={t('toolOrderedList')}>
          <ListOrdered size={15} />
        </ToolbarButton>
        <Divider />
        <ToolbarButton onClick={() => chain().setHorizontalRule().run()} title={t('toolRule')}>
          <Minus size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={setLink} active={is.link} title={t('toolLink')}>
          <Link2 size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => fileInputRef.current?.click()} title={t('toolImage')}>
          <ImageIcon size={15} />
        </ToolbarButton>
        <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={pickImage} />
        <div className="flex-1" />
        {onSaveAsTemplate ? (
          <ToolbarButton onClick={() => onSaveAsTemplate(editor.getHTML())} title={t('saveAsTemplate')}>
            <BookmarkPlus size={15} />
          </ToolbarButton>
        ) : null}
        {onDelete ? (
          <DeleteConfirmPopover onConfirm={onDelete} label={t('deleteModuleConfirm')}>
            <button
              type="button"
              aria-label={t('deleteModule')}
              title={t('deleteModule')}
              className="ml-1 flex-shrink-0 rounded p-1.5 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500"
            >
              <Trash2 size={14} />
            </button>
          </DeleteConfirmPopover>
        ) : null}
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}
