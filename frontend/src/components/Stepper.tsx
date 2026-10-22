import clsx from 'clsx'
import { Check, Lock } from 'lucide-react'
import { STEPS, type Application } from '@/types'

export function Stepper({ app, active, onGo }: { app: Application; active: number; onGo: (n: number) => void }) {
  const reached = Math.min(app.currentStep, 7)
  return (
    <nav aria-label="Application progress" className="glass overflow-x-auto rounded-2xl px-5 pb-4 pt-5">
      <ol className="relative flex min-w-[860px] justify-between">
        <span aria-hidden className="absolute left-[calc(100%/14)] right-[calc(100%/14)] top-[15px] h-[3px] rounded bg-line" />
        <span aria-hidden className="absolute left-[calc(100%/14)] top-[15px] h-[3px] rounded bg-gradient-to-r from-ok-500 to-brand-500 transition-[width] duration-700 ease-out"
          style={{ width: `calc((100% - 100% / 7) * ${(Math.max(0, reached - 1)) / 6})` }} />
        {STEPS.map(s => {
          const done = app.completed.includes(s.n), locked = s.n > app.currentStep, isActive = s.n === active
          return (
            <li key={s.n} className="relative z-10 flex w-[calc(100%/7)] flex-col items-center text-center">
              <button disabled={locked} onClick={() => onGo(s.n)} aria-current={isActive ? 'step' : undefined} aria-label={`Stage ${s.n}: ${s.title}`}
                className={clsx('flex h-8 w-8 items-center justify-center rounded-full border-2 text-[13px] font-semibold transition-all duration-300',
                  isActive && 'scale-110 border-brand-600 bg-brand-600 text-white animate-ping2', !isActive && done && 'border-ok-500 bg-ok-500 text-white hover:scale-105',
                  !isActive && !done && !locked && 'border-brand-500 bg-white text-brand-600 hover:scale-105', locked && 'cursor-not-allowed border-line bg-paper text-slate-400')}>
                {done && !isActive ? <Check key="c" className="h-4 w-4 animate-pop" /> : locked ? <Lock className="h-3.5 w-3.5" /> : s.n}
              </button>
              <span className={clsx('mt-2 text-[13px] font-medium leading-tight transition-colors', isActive ? 'text-ink-950' : locked ? 'text-slate-400' : 'text-ink-800')}>{s.title}</span>
              <span className="text-xs text-slate-500">{s.sub}</span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
