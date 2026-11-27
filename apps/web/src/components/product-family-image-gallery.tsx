'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { ImagePlus, Loader2, Pencil, Trash2, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks/use-auth'
import { useRouter } from '@/i18n/navigation'
import { showToast } from '@/lib/toast'
import type { ProductFamilyImage } from '@/types/product-family'

interface ProductFamilyImageGalleryProps {
  familyId: string
  familyName: string
  images: ProductFamilyImage[]
  /** Server edit policy and ownership. The role is checked here too. */
  canEdit?: boolean
}

/** Thumbnail strip that opens a full-size lightbox. Owners can upload, retitle and remove images. */
export const ProductFamilyImageGallery = ({ familyId, familyName, images, canEdit = false }: ProductFamilyImageGalleryProps) => {
  const t = useTranslations('productFamilyManual')
  const tEdit = useTranslations('productFamilyEdit')
  const router = useRouter()
  const { user, can } = useAuth()
  const editable = canEdit && !!user && can('catalog.edit')
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<ProductFamilyImage | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [savingTitle, setSavingTitle] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<ProductFamilyImage | null>(null)
  const [deleting, setDeleting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (openIndex === null) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenIndex(null)
      else if (e.key === 'ArrowRight') setOpenIndex((i) => (i === null ? null : (i + 1) % images.length))
      else if (e.key === 'ArrowLeft') setOpenIndex((i) => (i === null ? null : (i - 1 + images.length) % images.length))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openIndex, images.length])

  if (images.length === 0 && !editable) return null

  const imageUrl = (imageId: string) => `/api/product-families/${familyId}/images/${imageId}`

  const upload = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!file) {
      setError(t('imageFileRequired'))
      return
    }
    const body = new FormData()
    body.append('file', file)
    body.append('title', title)
    setUploading(true)
    setError(null)
    try {
      const response = await fetch(`/api/product-families/${familyId}/images`, { method: 'POST', body })
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string }
        setError(data.error ? `${t('saveFailed')}: ${data.error}` : t('saveFailed'))
        return
      }
      showToast(t('imageSaved'))
      setUploadOpen(false)
      setFile(null)
      setTitle('')
      router.refresh()
    } catch {
      setError(t('saveFailedUnreachable'))
    } finally {
      setUploading(false)
    }
  }

  const saveTitle = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!editing) return
    setSavingTitle(true)
    setError(null)
    try {
      const response = await fetch(`/api/product-families/${familyId}/images/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle }),
      })
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string }
        setError(data.error ? `${t('saveFailed')}: ${data.error}` : t('saveFailed'))
        return
      }
      showToast(t('imageTitleSaved'))
      setEditing(null)
      router.refresh()
    } catch {
      setError(t('saveFailedUnreachable'))
    } finally {
      setSavingTitle(false)
    }
  }

  const remove = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      const response = await fetch(`/api/product-families/${familyId}/images/${pendingDelete.id}`, { method: 'DELETE' })
      if (!response.ok) {
        showToast(t('saveFailed'))
        return
      }
      showToast(t('imageRemoved'))
      setPendingDelete(null)
      setOpenIndex(null)
      router.refresh()
    } catch {
      showToast(t('saveFailedUnreachable'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <div className="mb-6">
        {editable ? (
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm text-slate-500">{images.length === 0 ? t('noImages') : t('imageHint')}</p>
            <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => { setError(null); setUploadOpen(true) }}>
              <ImagePlus className="h-3.5 w-3.5" /> {t('uploadImage')}
            </Button>
          </div>
        ) : null}
        {images.length > 0 ? (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
            {images.map((image, index) => (
              <div key={image.id} className="group relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl(image.id)}
                  alt={image.title ?? familyName}
                  onClick={() => setOpenIndex(index)}
                  className="aspect-square w-full cursor-zoom-in rounded-lg border border-slate-200 object-cover transition-opacity hover:opacity-90"
                />
                {image.title ? <p className="mt-1 truncate text-xs text-slate-600">{image.title}</p> : null}
                {editable ? (
                  <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      className="rounded bg-white/90 p-1 text-slate-600 shadow hover:text-brand"
                      aria-label={t('editImageTitle')}
                      onClick={() => { setEditing(image); setEditTitle(image.title ?? ''); setError(null) }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="rounded bg-white/90 p-1 text-slate-600 shadow hover:text-red-600"
                      aria-label={t('deleteImage')}
                      onClick={() => setPendingDelete(image)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {openIndex !== null && images[openIndex] ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 p-6" onClick={() => setOpenIndex(null)}>
          <button type="button" onClick={() => setOpenIndex(null)} className="absolute right-6 top-6 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label={tEdit('close')}>
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl(images[openIndex].id)}
            alt={images[openIndex].title ?? familyName}
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full rounded-lg object-contain"
          />
          {images.length > 1 ? (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs text-white">
              {openIndex + 1} / {images.length}
            </div>
          ) : null}
        </div>
      ) : null}

      <Dialog.Root open={uploadOpen} onOpenChange={(next) => (!uploading ? setUploadOpen(next) : undefined)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-slate-950/60" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[60] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-5 shadow-xl focus:outline-none">
            <form onSubmit={(e) => void upload(e)} className="space-y-4">
              <Dialog.Title className="text-lg font-semibold text-slate-900">{t('uploadImage')}</Dialog.Title>
              <p className="text-sm text-slate-500">{t('imageHint')}</p>
              <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/bmp" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
                {file ? file.name : t('chooseImage')}
              </Button>
              <div className="space-y-1.5">
                <Label htmlFor="image-title">{t('imageTitle')}</Label>
                <Input id="image-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
              </div>
              {error && uploadOpen ? <p className="text-sm text-red-600">{error}</p> : null}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" disabled={uploading} onClick={() => setUploadOpen(false)}>{tEdit('cancel')}</Button>
                <Button type="submit" disabled={uploading} className="gap-2">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {uploading ? tEdit('saving') : t('uploadImage')}
                </Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={editing !== null} onOpenChange={(next) => (!next && !savingTitle ? setEditing(null) : undefined)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-slate-950/60" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[60] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-5 shadow-xl focus:outline-none">
            <form onSubmit={(e) => void saveTitle(e)} className="space-y-4">
              <Dialog.Title className="text-lg font-semibold text-slate-900">{t('editImageTitle')}</Dialog.Title>
              <div className="space-y-1.5">
                <Label htmlFor="image-title-edit">{t('imageTitle')}</Label>
                <Input id="image-title-edit" value={editTitle} maxLength={200} onChange={(e) => setEditTitle(e.target.value)} />
              </div>
              {error && editing ? <p className="text-sm text-red-600">{error}</p> : null}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" disabled={savingTitle} onClick={() => setEditing(null)}>{tEdit('cancel')}</Button>
                <Button type="submit" disabled={savingTitle}>{savingTitle ? tEdit('saving') : tEdit('save')}</Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t('deleteImageTitle')}
        description={t('deleteImageDescription')}
        confirmLabel={t('delete')}
        cancelLabel={tEdit('cancel')}
        busy={deleting}
        onConfirm={() => void remove()}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  )
}
