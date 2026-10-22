import clsx from 'clsx'
import { Loader2, CheckCircle2, AlertTriangle, Info, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ReactNode, ChangeEvent } from 'react'
import { useCountUp } from '@/hooks/useCountUp'
import { useBusy } from '@/store/busyStore'

export function Card({ title, subtitle, action, children, className }: { title?: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx('glass rounded-2xl transition-shadow duration-300', className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 border-b border-white/70 px-5 py-3.5">
          <div>
            <h3 className="font-display text-[18px] font-medium text-ink-950">{title}</h3>
            {subtitle && <p className="mt-0.5 text-[13px] text-slate-500">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  )
}

export const Grid = ({ cols = 3, children }: { cols?: 1 | 2 | 3 | 4; children: ReactNode }) => (
  <div className={clsx('grid gap-x-4 gap-y-4 grid-cols-1', cols === 2 && 'md:grid-cols-2', cols === 3 && 'md:grid-cols-2 xl:grid-cols-3', cols === 4 && 'md:grid-cols-2 xl:grid-cols-4')}>{children}</div>
)

interface FieldProps { label: string; error?: string; hint?: string; required?: boolean; span?: 2 | 3; children: ReactNode }
export function Field({ label, error, hint, required, span, children }: FieldProps) {
  return (
    <label className={clsx('block', span === 2 && 'md:col-span-2', span === 3 && 'md:col-span-2 xl:col-span-3')}>
      <span className="mb-1 block text-[13px] text-slate-600">{label}{required && <span className="text-bad-500"> *</span>}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-bad-500">{error}</span> : hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  )
}

interface TextProps extends Omit<FieldProps, 'children'> {
  value: string; onChange: (v: string) => void; type?: string; placeholder?: string; disabled?: boolean; readOnly?: boolean; inputMode?: 'numeric' | 'decimal' | 'tel' | 'email'
}
export function TextField({ value, onChange, type = 'text', placeholder, disabled, readOnly, inputMode, ...f }: TextProps) {
  return (
    <Field {...f}>
      <input className={clsx(readOnly ? 'input-ro' : 'input', f.error && 'input-err')} type={type} value={value} placeholder={placeholder}
        disabled={disabled} readOnly={readOnly} inputMode={inputMode} onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)} />
    </Field>
  )
}
export function NumberField(p: TextProps) {
  return <TextField {...p} inputMode="decimal" onChange={v => p.onChange(v.replace(/[^0-9.]/g, ''))} />
}
interface SelectProps extends Omit<FieldProps, 'children'> { value: string; onChange: (v: string) => void; options: string[]; disabled?: boolean; placeholder?: string }
export function SelectField({ value, onChange, options, disabled, placeholder = 'Select', ...f }: SelectProps) {
  return (
    <Field {...f}>
      <select className={clsx('input', f.error && 'input-err')} value={value} disabled={disabled} onChange={e => onChange(e.target.value)}>
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </Field>
  )
}
export const ReadField = ({ label, value, span, hint }: { label: string; value: ReactNode; span?: 2 | 3; hint?: string }) => (
  <Field label={label} span={span} hint={hint}><div className="input-ro min-h-[38px]">{value || '—'}</div></Field>
)
export const TextAreaField = ({ value, onChange, disabled, ...f }: Omit<FieldProps, 'children'> & { value: string; onChange: (v: string) => void; disabled?: boolean }) => (
  <Field {...f}><textarea className="input min-h-[84px]" value={value} disabled={disabled} onChange={e => onChange(e.target.value)} /></Field>
)

export function CheckRow({ checked, onChange, title, desc, disabled }: { checked: boolean; onChange: (v: boolean) => void; title: string; desc?: string; disabled?: boolean }) {
  return (
    <label className={clsx('flex cursor-pointer items-start gap-3 rounded-md border px-3.5 py-3 transition-colors', checked ? 'border-brand-500 bg-brand-50' : 'border-line bg-white hover:bg-slate-50', disabled && 'opacity-60')}>
      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-600" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      <span><span className="block text-sm font-medium text-ink-950">{title}</span>{desc && <span className="block text-[13px] text-slate-500">{desc}</span>}</span>
    </label>
  )
}

type Tone = 'neutral' | 'ok' | 'warn' | 'bad' | 'info'
const tones: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700', ok: 'bg-ok-50 text-ok-600', warn: 'bg-warn-50 text-warn-500', bad: 'bg-bad-50 text-bad-500', info: 'bg-brand-50 text-brand-700',
}
export const Badge = ({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) => (
  <span className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', tones[tone])}>{children}</span>
)

export function Notice({ tone = 'info', title, children }: { tone?: Tone; title?: string; children?: ReactNode }) {
  const Icon = { ok: CheckCircle2, warn: AlertTriangle, bad: XCircle, info: Info, neutral: Info }[tone]
  const ring = { ok: 'border-ok-500/30 bg-ok-50', warn: 'border-warn-500/30 bg-warn-50', bad: 'border-bad-500/30 bg-bad-50', info: 'border-brand-500/30 bg-brand-50', neutral: 'border-line bg-slate-50' }[tone]
  const ic = { ok: 'text-ok-500', warn: 'text-warn-500', bad: 'text-bad-500', info: 'text-brand-600', neutral: 'text-slate-500' }[tone]
  return (
    <div className={clsx('flex gap-3 rounded-md border px-4 py-3 text-sm', ring)}>
      <Icon className={clsx('mt-0.5 h-4 w-4 shrink-0', ic)} />
      <div>{title && <p className="font-medium text-ink-950">{title}</p>}{children && <div className="text-[13px] text-slate-700">{children}</div>}</div>
    </div>
  )
}

export const Spinner = () => <Loader2 className="h-4 w-4 animate-spin" />
export function Btn({ busy, children, variant = 'primary', ...p }: { busy?: boolean; variant?: 'primary' | 'ok' | 'ghost' | 'danger' } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...p} disabled={p.disabled || busy} className={clsx(`btn-${variant}`, p.className)}>{busy && <Spinner />}{children}</button>
}

export const Stat = ({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: string; tone?: Tone }) => (
  <div className="glass rounded-xl px-4 py-3">
    <p className="text-[13px] text-slate-500">{label}</p>
    <p className={clsx('mt-0.5 text-xl font-semibold', tone === 'ok' && 'text-ok-600', tone === 'bad' && 'text-bad-500', tone === 'warn' && 'text-warn-500')}>{value}</p>
    {sub && <p className="text-xs text-slate-500">{sub}</p>}
  </div>
)

export const SectionTitle = ({ children }: { children: ReactNode }) => (
  <h4 className="mb-3 mt-6 border-b border-line pb-2 text-sm font-semibold text-ink-900 first:mt-0">{children}</h4>
)
export const when = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-LK', { dateStyle: 'medium', timeStyle: 'short' }) : '—')


export const Skeleton = ({ className }: { className?: string }) => <div className={clsx('skeleton', className)} />

export function AnimatedNumber({ value, dp = 0, prefix = '', suffix = '' }: { value: number; dp?: number; prefix?: string; suffix?: string }) {
  const v = useCountUp(value)
  return <>{prefix}{v.toLocaleString('en-LK', { minimumFractionDigits: dp, maximumFractionDigits: dp })}{suffix}</>
}

export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 p-4 backdrop-blur-md animate-fade-in" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onMouseDown={e => e.stopPropagation()} className="glass-strong w-full max-w-lg animate-scale-in rounded-2xl p-6">
        <h3 className="mb-4 font-display text-xl font-medium">{title}</h3>{children}
      </div>
    </div>
  )
}

export const EmptyState = ({ title, hint }: { title: string; hint?: string }) => (
  <div className="px-6 py-14 text-center"><p className="font-display text-lg text-ink-800">{title}</p>{hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}</div>
)


/** Full-screen "Processing Request" box. Appears only if the action takes longer than a moment, so quick actions do not flash. */
export function ProcessingOverlay() {
  const { count, message } = useBusy()
  const active = count > 0
  const [show, setShow] = useState(false)
  useEffect(() => {
    if (!active) { setShow(false); return }
    const t = setTimeout(() => setShow(true), 250)
    return () => clearTimeout(t)
  }, [active])
  if (!show) return null
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink-950/45 backdrop-blur-md animate-fade-in" role="alertdialog" aria-live="assertive" aria-label="Processing request">
      <div className="glass-strong w-[340px] animate-scale-in rounded-2xl p-7 text-center">
        <svg className="mx-auto h-12 w-12" viewBox="0 0 48 48" fill="none" style={{ animation: 'spin360 1s linear infinite' }}>
          <circle cx="24" cy="24" r="19" stroke="#DCE8F7" strokeWidth="4" /><path d="M24 5a19 19 0 0 1 19 19" stroke="#1E4F8F" strokeWidth="4" strokeLinecap="round" /></svg>
        <p className="mt-4 font-display text-xl">Processing Request</p>
        <p className="mt-1 text-sm text-slate-600">{message || 'Please wait while we complete the action.'}</p>
        <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-brand-100"><div className="stripes h-full w-full rounded-full" /></div>
      </div>
    </div>
  )
}
