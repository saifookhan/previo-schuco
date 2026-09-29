export interface ToastMessage {
  id: string
  message: string
  variant: 'success' | 'error'
}

type Listener = (toasts: ToastMessage[]) => void

/**
 * Module-level toast store (not React context) so any client component —
 * including ones nested deep in a page, outside any single provider tree —
 * can call `showToast` without needing a context provider ancestor.
 * `<Toaster />` (mounted once per shell) is the only subscriber that
 * renders anything.
 */
let toasts: ToastMessage[] = []
const listeners = new Set<Listener>()

const emit = (): void => {
  for (const listener of listeners) {
    listener(toasts)
  }
}

export const subscribeToasts = (listener: Listener): (() => void) => {
  listeners.add(listener)
  listener(toasts)
  return () => {
    listeners.delete(listener)
  }
}

export const showToast = (message: string, variant: ToastMessage['variant'] = 'success'): void => {
  const id = crypto.randomUUID()
  toasts = [...toasts, { id, message, variant }]
  emit()
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id)
    emit()
  }, 4000)
}

export const dismissToast = (id: string): void => {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}
