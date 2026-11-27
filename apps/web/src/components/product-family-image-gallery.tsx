'use client'

import { ImagePlus, RotateCcw, Trash2, Upload, X, ZoomIn, ZoomOut } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

import { useAuth } from '@/hooks/use-auth'
import { useRouter } from '@/i18n/navigation'
import { showToast } from '@/lib/toast'
import type { ProductFamilyImage } from '@/types/product-family'

/** Matches the API: three managed slots, ten in total. */
const MANAGED_SLOTS = 3
const MAX_IMAGES = 10
const MAX_BYTES = 5 * 1024 * 1024
const ACCEPTED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const FALLBACK_TITLES = ['Generale', 'Dettaglio', 'Sezione']

interface ProductFamilyImageGalleryProps {
  familyId: string
  familyName: string
  images: ProductFamilyImage[]
  /** Owning company (or super-admin) and the family's edit policy allows changes. */
  canEdit: boolean
}

const slotTitle = (image: ProductFamilyImage): string =>
  image.title?.trim() || (image.sortOrder < MANAGED_SLOTS ? FALLBACK_TITLES[image.sortOrder] ?? '' : '')

/** Image slots for a product family: upload, replace, delete, and a zoomable lightbox. */
export const ProductFamilyImageGallery = ({ familyId, familyName, images, canEdit }: ProductFamilyImageGalleryProps) => {
  const t = useTranslations('productFamilyImages')
  const router = useRouter()
  const { user, can } = useAuth()
  const editable = canEdit && Boolean(user) && can('catalog.edit')
  const inputRef = useRef<HTMLInputElement>(null)
  const targetRef = useRef<string | 'new' | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)

  const ordered = [...images].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
  const managed = ordered.filter((image) => image.sortOrder < MANAGED_SLOTS)
  const extra = ordered.filter((image) => image.sortOrder >= MANAGED_SLOTS)
  const filled = ordered.filter((image) => image.localPath)
  // Viewers only see pictures. Editors also see the empty slots they can fill.
  const shownManaged = editable ? managed : managed.filter((image) => image.localPath)
  const shownExtra = editable ? extra : extra.filter((image) => image.localPath)
  const openIndex = filled.findIndex((image) => image.id === openId)

  useEffect(() => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }, [openId])

  useEffect(() => {
    if (openId === null) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenId(null)
      else if (event.key === 'ArrowRight' && filled.length > 1) {
        setOpenId(filled[(openIndex + 1) % filled.length]?.id ?? null)
      } else if (event.key === 'ArrowLeft' && filled.length > 1) {
        setOpenId(filled[(openIndex - 1 + filled.length) % filled.length]?.id ?? null)
      } else if (event.key === '+' || event.key === '=') setScale((current) => clampScale(current * 1.25))
      else if (event.key === '-' || event.key === '_') setScale((current) => clampScale(current / 1.25))
      else if (event.key === '0') {
        setScale(1)
        setOffset({ x: 0, y: 0 })
      }
    }
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      setScale((current) => clampScale(current * (event.deltaY < 0 ? 1.12 : 1 / 1.12)))
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('wheel', onWheel)
    }
  }, [openId, openIndex, filled])

  if (!editable && filled.length === 0) return null

  const imageUrl = (imageId: string) => `/api/product-families/${familyId}/images/${imageId}`

  const chooseFile = (target: string | 'new') => {
    targetRef.current = target
    if (inputRef.current) inputRef.current.value = ''
    inputRef.current?.click()
  }

  const upload = async (file: File) => {
    const target = targetRef.current
    if (!target) return
    if (!ACCEPTED.has(file.type === 'image/jpg' ? 'image/jpeg' : file.type)) {
      showToast(t('wrongType'))
      return
    }
    if (file.size > MAX_BYTES) {
      showToast(t('tooLarge'))
      return
    }
    const form = new FormData()
    form.set('file', file)
    if (target !== 'new') form.set('imageId', target)
    setBusy(target)
    try {
      const response = await fetch(`/api/product-families/${familyId}/images`, { method: 'POST', body: form })
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string }
        showToast(data.error ? `${t('saveFailed')}: ${data.error}` : t('saveFailed'))
        return
      }
      showToast(t('saved'))
      router.refresh()
    } catch {
      showToast(t('saveFailed'))
    } finally {
      setBusy(null)
    }
  }

  const remove = async (imageId: string) => {
    setBusy(imageId)
    try {
      const response = await fetch(`/api/product-families/${familyId}/images/${imageId}`, { method: 'DELETE' })
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string }
        showToast(data.error ? `${t('deleteFailed')}: ${data.error}` : t('deleteFailed'))
        return
      }
      if (openId === imageId) setOpenId(null)
      showToast(t('removed'))
      router.refresh()
    } catch {
      showToast(t('deleteFailed'))
    } finally {
      setBusy(null)
    }
  }

  const resetZoom = () => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }

  const slot = (image: ProductFamilyImage) => {
    const title = slotTitle(image) || familyName
    const hasFile = Boolean(image.localPath)
    return (
      <figure key={image.id} className="flex flex-col gap-2">
        {hasFile ? (
          <button type="button" onClick={() => setOpenId(image.id)} className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl(image.id)} alt={title} className="aspect-square w-full cursor-zoom-in object-cover transition-opacity hover:opacity-90" />
          </button>
        ) : (
          <div className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-2 text-center text-xs text-slate-400">
            {t('empty')}
          </div>
        )}
        <figcaption className="truncate text-sm font-medium text-slate-800">{slotTitle(image) || '—'}</figcaption>
        {editable ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => chooseFile(image.id)}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <Upload className="h-3.5 w-3.5" />
              {hasFile ? t('replace') : t('upload')}
            </button>
            {hasFile ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void remove(image.id)}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t('delete')}
              </button>
            ) : null}
          </div>
        ) : null}
      </figure>
    )
  }

  const openImage = openIndex >= 0 ? filled[openIndex] : null

  return (
    <section className="mb-6">
      <h2 className="text-sm font-semibold text-slate-900">{t('title')}</h2>
      <p className="mt-1 max-w-3xl text-sm text-slate-500">{t('hint')}</p>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void upload(file)
        }}
      />

      {shownManaged.length > 0 ? (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">{t('managed')}</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">{shownManaged.map(slot)}</div>
        </div>
      ) : null}

      {shownExtra.length > 0 || editable ? (
        <div className="mt-6">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">{t('additional')}</p>
          {shownExtra.length > 0 ? <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">{shownExtra.map(slot)}</div> : null}
          {editable && ordered.length < MAX_IMAGES ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => chooseFile('new')}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <ImagePlus className="h-4 w-4" />
              {t('add')}
            </button>
          ) : null}
        </div>
      ) : null}

      {openImage ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 p-6" onClick={() => setOpenId(null)}>
          <div className="absolute right-6 top-6 flex items-center gap-2">
            <button type="button" onClick={(event) => { event.stopPropagation(); setScale((current) => clampScale(current / 1.25)) }} className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label={t('zoomOut')}>
              <ZoomOut className="h-5 w-5" />
            </button>
            <button type="button" onClick={(event) => { event.stopPropagation(); setScale((current) => clampScale(current * 1.25)) }} className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label={t('zoomIn')}>
              <ZoomIn className="h-5 w-5" />
            </button>
            <button type="button" onClick={(event) => { event.stopPropagation(); resetZoom() }} className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label={t('zoomReset')}>
              <RotateCcw className="h-5 w-5" />
            </button>
            <button type="button" onClick={() => setOpenId(null)} className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label={t('close')}>
              <X className="h-5 w-5" />
            </button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl(openImage.id)}
            alt={slotTitle(openImage) || familyName}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => {
              if (scale <= 1) return
              drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y }
              event.currentTarget.setPointerCapture(event.pointerId)
            }}
            onPointerMove={(event) => {
              if (!drag.current) return
              setOffset({ x: drag.current.ox + event.clientX - drag.current.x, y: drag.current.oy + event.clientY - drag.current.y })
            }}
            onPointerUp={() => {
              drag.current = null
            }}
            style={{ transform: scale === 1 ? undefined : `translate(${offset.x}px, ${offset.y}px) scale(${scale})`, cursor: scale > 1 ? 'grab' : 'default' }}
            className="max-h-full max-w-full rounded-lg object-contain"
          />
          {filled.length > 1 ? (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs text-white">
              {openIndex + 1} / {filled.length}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

const clampScale = (value: number): number => Math.min(6, Math.max(1, value))
