import { create } from 'zustand'

export interface Toast { id: number; tone: 'ok' | 'info'; text: string }
export interface ErrorInfo { title: string; message?: string; details?: string[] }
interface T {
  toasts: Toast[]
  dialog: ErrorInfo | null
  push: (tone: Toast['tone'], text: string) => void
  dismiss: (id: number) => void
  showError: (e: ErrorInfo) => void
  closeError: () => void
}
let n = 0
export const useToasts = create<T>(set => ({
  toasts: [], dialog: null,
  push: (tone, text) => {
    const id = ++n
    set(s => ({ toasts: [...s.toasts.slice(-3), { id, tone, text }] }))
    setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), 3200)
  },
  dismiss: id => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
  // Mistakes open a dialog the user must acknowledge. The same message is not stacked twice.
  showError: e => set(s => (s.dialog && s.dialog.message === e.message && s.dialog.title === e.title ? s : { dialog: e })),
  closeError: () => set({ dialog: null }),
}))

export const toast = {
  ok: (t: string) => useToasts.getState().push('ok', t),
  info: (t: string) => useToasts.getState().push('info', t),
  /** Shows the error dialog. Existing calls like toast.bad(errText(e)) keep working. */
  bad: (text: string, opts: Partial<ErrorInfo> = {}) => useToasts.getState().showError({ title: opts.title ?? 'Something needs your attention', message: text, details: opts.details }),
}