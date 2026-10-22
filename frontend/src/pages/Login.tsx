import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, LockKeyhole, ShieldCheck, Gauge, FileCheck2 } from 'lucide-react'
import { Btn, Notice } from '@/components/ui'
import { login, useAuth } from '@/store/authStore'
import { ApiError } from '@/services/http'

export default function Login() {
  const { token, expiredNotice } = useAuth()
  const nav = useNavigate()
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/'
  const [u, setU] = useState(''), [p, setP] = useState(''), [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false), [err, setErr] = useState('')
  if (token) return <Navigate to={from} replace />

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true)
    try { const user = await login(u.trim(), p); nav(user.mustChangePassword ? '/change-password' : from, { replace: true }) }
    catch (x) { setErr(x instanceof ApiError ? x.message : 'Something went wrong. Please try again.') }
    finally { setBusy(false) }
  }
  return (
    <div className="grid min-h-full lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-ink-950 via-ink-900 to-ink-800 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="pointer-events-none absolute -left-24 top-1/4 h-80 w-80 animate-floaty rounded-full bg-brand-500/25 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -right-16 bottom-10 h-96 w-96 animate-floaty rounded-full bg-gold-500/20 blur-3xl [animation-delay:-4s]" />
        <p className="relative animate-fade-in font-display text-2xl">Origin<span className="text-gold-400">IQ</span></p>
        <div className="relative max-w-lg stagger">
          <h1 className="font-display text-5xl font-medium leading-[1.1]">Credit decisions,<br /><em className="text-gold-400">explained.</em></h1>
          <p className="mt-5 text-[17px] leading-relaxed text-slate-300">Seven governed stages from consent to disbursement for vehicle leasing and loans, with every rate, score and approval traceable.</p>
          <ul className="mt-8 space-y-3.5 text-slate-200">
            {[[ShieldCheck, 'Role-based control and a full audit trail'], [Gauge, 'Risk-based pricing with the reasons shown'], [FileCheck2, 'Documents verified before anything is disbursed']].map(([I, t]) => {
              const Icon = I as typeof ShieldCheck
              return <li key={t as string} className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10"><Icon className="h-4 w-4 text-gold-400" /></span>{t as string}</li>
            })}
          </ul>
        </div>
        <p className="relative text-xs text-slate-400">Authorized use only. Activity is logged.</p>
      </aside>
      <main className="relative flex items-center justify-center bg-gradient-to-br from-brand-50 via-paper to-gold-50 p-6">
        <div aria-hidden className="pointer-events-none absolute -right-10 top-10 h-72 w-72 animate-floaty rounded-full bg-brand-500/15 blur-3xl" />
        <form onSubmit={submit} className="glass-strong relative w-full max-w-sm animate-fade-up rounded-3xl p-8" aria-label="Sign in">
          <p className="mb-8 font-display text-2xl lg:hidden">Origin<span className="text-gold-500">IQ</span></p>
          <h2 className="font-display text-3xl font-medium">Welcome back</h2>
          <p className="mb-7 mt-1 text-sm text-slate-500">Sign in to continue to your workspace.</p>
          {expiredNotice && !err && <div className="mb-4"><Notice tone="warn" title="Your session ended">Please sign in again.</Notice></div>}
          {err && <div className="mb-4 animate-scale-in"><Notice tone="bad">{err}</Notice></div>}
          <label className="mb-4 block"><span className="mb-1 block text-[13px] text-slate-600">Username</span>
            <input className="input" autoFocus autoComplete="username" value={u} onChange={e => setU(e.target.value)} required /></label>
          <label className="mb-6 block"><span className="mb-1 block text-[13px] text-slate-600">Password</span>
            <div className="relative"><input className="input pr-10" type={show ? 'text' : 'password'} autoComplete="current-password" value={p} onChange={e => setP(e.target.value)} required />
              <button type="button" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(!show)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-ink-800">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></label>
          <Btn type="submit" busy={busy} className="w-full !py-2.5" disabled={!u || !p}><LockKeyhole className="h-4 w-4" />Sign in</Btn>
          <p className="mt-6 text-center text-xs text-slate-500">Forgot your password? Ask an administrator to reset it.</p>
        </form>
      </main>
    </div>
  )
}
