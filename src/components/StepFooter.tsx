import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, Cloud } from 'lucide-react'
import { Btn, Notice } from './ui'
import { useStore } from '@/store/applicationStore'
import { toast } from '@/store/toastStore'
import type { Application } from '@/types'

interface Props { app: Application; step: number; blockers: string[]; showErrors: boolean; onAttempt: () => void; nextLabel?: string; nextIcon?: ReactNode; nextVariant?: 'primary' | 'ok' }

export default function StepFooter({ app, step, blockers, showErrors, onAttempt, nextLabel, nextIcon, nextVariant = 'primary' }: Props) {
  const go = useNavigate()
  const { advance, saving } = useStore()
  const [busy, setBusy] = useState(false)
  const [serverErrors, setServerErrors] = useState<string[]>([])
  const [attempt, setAttempt] = useState(0)

  // After a failed attempt, bring the first missing field into view and focus it
  useEffect(() => {
    if (!attempt) return
    const el = document.querySelector<HTMLElement>('[aria-invalid="true"]')
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setTimeout(() => el?.focus({ preventScroll: true }), 350)
  }, [attempt])

  const done = app.completed.includes(step)
  const blocked = blockers.length > 0 && !done

  async function proceed() {
    if (blocked) {
      onAttempt(); setAttempt(n => n + 1)
      toast.bad('Please complete the details below before continuing.', { title: 'Some details are missing', details: blockers })
      return
    }
    if (!done) {
      setBusy(true); const r = await advance(app.id); setBusy(false)
      if (!r.ok) { setServerErrors(r.errors); toast.bad('This stage cannot be completed yet.', { title: 'Complete these items to continue', details: r.errors }); return }
    }
    setServerErrors([])
    go(step === 7 ? '/applications' : `/applications/${app.id}/${step + 1}`)
  }
  const errors = serverErrors.length ? serverErrors : showErrors && blocked ? blockers : []
  return (
    <div className="mt-6 space-y-3">
      {errors.length > 0 && (
        <div className="animate-scale-in"><Notice tone="bad" title="Complete these items to continue">
          <ul className="list-disc pl-4">{errors.slice(0, 8).map(b => <li key={b}>{b}</li>)}{errors.length > 8 && <li>and {errors.length - 8} more</li>}</ul></Notice></div>
      )}
      <div className="glass flex items-center justify-between rounded-2xl px-5 py-3">
        <Btn variant="ghost" disabled={step === 1} onClick={() => go(`/applications/${app.id}/${step - 1}`)}><ArrowLeft className="h-4 w-4" />Back</Btn>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-xs text-slate-500">
            {saving > 0 ? <><Cloud className="h-3.5 w-3.5 animate-pulse" />Saving…</> : done ? <><Check className="h-3.5 w-3.5 text-ok-500" />Stage completed</> : <><Check className="h-3.5 w-3.5 text-slate-400" />All changes saved</>}
          </span>
          <Btn variant={nextVariant} busy={busy} onClick={() => void proceed()}>{nextIcon}{done ? 'Next' : nextLabel ?? (step === 7 ? 'Finish application' : 'Save and continue')}<ArrowRight className="h-4 w-4" /></Btn>
        </div>
      </div>
    </div>
  )
}