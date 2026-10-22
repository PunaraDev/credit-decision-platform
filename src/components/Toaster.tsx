import { CheckCircle2, Info, X } from 'lucide-react'
import clsx from 'clsx'
import { useToasts } from '@/store/toastStore'

/** Small confirmations ("Record saved", "Link copied"). Mistakes use the ErrorDialog instead. */
export default function Toaster() {
  const { toasts, dismiss } = useToasts()
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map(t => {
        const Icon = t.tone === 'ok' ? CheckCircle2 : Info
        return (
          <div key={t.id} role="status" className={clsx('glass-strong pointer-events-auto flex animate-slide-left items-start gap-3 rounded-2xl px-4 py-3',
            t.tone === 'ok' ? 'border-ok-500/30' : 'border-brand-500/30')}>
            <Icon className={clsx('mt-0.5 h-4 w-4 shrink-0', t.tone === 'ok' ? 'text-ok-500' : 'text-brand-600')} />
            <p className="flex-1 text-sm text-ink-800">{t.text}</p>
            <button aria-label="Dismiss" onClick={() => dismiss(t.id)} className="text-slate-400 hover:text-ink-800"><X className="h-4 w-4" /></button>
          </div>
        )
      })}
    </div>
  )
}