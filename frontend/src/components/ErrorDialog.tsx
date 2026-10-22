import { useEffect } from 'react'
import { XCircle } from 'lucide-react'
import { Btn } from './ui'
import { useToasts } from '@/store/toastStore'

/** Dialog for mistakes and failures: clear title, what went wrong, optional list of items, and an OK button. */
export default function ErrorDialog() {
  const { dialog, closeError } = useToasts()
  useEffect(() => {
    if (!dialog) return
    const h = (e: KeyboardEvent) => (e.key === 'Escape' || e.key === 'Enter') && closeError()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [dialog, closeError])
  if (!dialog) return null
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink-950/45 p-4 backdrop-blur-md animate-fade-in" onMouseDown={closeError}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="err-title" onMouseDown={e => e.stopPropagation()}
        className="glass-strong w-full max-w-md animate-scale-in rounded-2xl p-7 text-center">
        <span className="mx-auto flex h-14 w-14 animate-pop items-center justify-center rounded-full bg-bad-50"><XCircle className="h-8 w-8 text-bad-500" /></span>
        <h3 id="err-title" className="mt-4 font-display text-2xl font-medium">{dialog.title}</h3>
        {dialog.message && <p className="mt-2 text-sm text-slate-600">{dialog.message}</p>}
        {dialog.details && dialog.details.length > 0 && (
          <ul className="mt-4 max-h-52 list-disc overflow-auto rounded-xl bg-bad-50/70 py-3 pl-8 pr-4 text-left text-[13px] text-slate-700">
            {dialog.details.map(d => <li key={d}>{d}</li>)}
          </ul>)}
        <Btn autoFocus className="mt-6 w-full !py-2.5" onClick={closeError}>OK</Btn>
      </div>
    </div>
  )
}