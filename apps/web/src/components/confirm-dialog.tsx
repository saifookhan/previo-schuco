'use client'

import { AlertTriangle, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  cancelLabel: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** Blocking confirmation modal for destructive actions (unlike duplicate, delete needs one). */
export const ConfirmDialog = ({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  busy,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) => {
  if (!open) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center bg-slate-950/60 p-6"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 text-red-600" />
          <p className="font-semibold text-slate-900">{title}</p>
        </div>
        <p className="mb-5 text-sm text-slate-600">{description}</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="gap-2 bg-red-600 text-white hover:bg-red-700"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
