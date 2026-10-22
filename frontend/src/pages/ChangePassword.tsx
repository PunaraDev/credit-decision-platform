import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Btn, Notice } from '@/components/ui'
import { api } from '@/services/api'
import { ApiError } from '@/services/http'
import { logout, useAuth } from '@/store/authStore'
import { toast } from '@/store/toastStore'

export default function ChangePassword() {
  const { user, setUser, token } = useAuth()
  const nav = useNavigate()
  const [cur, setCur] = useState(''), [n1, setN1] = useState(''), [n2, setN2] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  if (!token || !user) return <Navigate to="/login" replace />
  const forced = user.mustChangePassword
  const rules = [['At least 10 characters', n1.length >= 10], ['Letters and numbers', /[A-Za-z]/.test(n1) && /\d/.test(n1)], ['Matches confirmation', n1.length > 0 && n1 === n2]] as const

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true)
    try { await api.changePassword(cur, n1); setUser({ ...user!, mustChangePassword: false }); toast.ok('Password updated'); nav('/', { replace: true }) }
    catch (x) { setErr(x instanceof ApiError ? x.message : 'Could not update the password') } finally { setBusy(false) }
  }
  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-paper to-brand-50 p-6">
      <form onSubmit={submit} className="glass-strong w-full max-w-md animate-scale-in rounded-3xl p-8">
        <h1 className="font-display text-3xl font-medium">{forced ? 'Set a new password' : 'Change password'}</h1>
        <p className="mb-6 mt-1 text-sm text-slate-500">{forced ? 'For your security, replace the temporary password before continuing.' : 'You will stay signed in on this device; other devices are signed out.'}</p>
        {err && <div className="mb-4"><Notice tone="bad">{err}</Notice></div>}
        {([['Current password', cur, setCur, 'current-password'], ['New password', n1, setN1, 'new-password'], ['Confirm new password', n2, setN2, 'new-password']] as const).map(([l, v, set, ac]) => (
          <label key={l} className="mb-4 block"><span className="mb-1 block text-[13px] text-slate-600">{l}</span>
            <input className="input" type="password" autoComplete={ac} value={v} onChange={e => set(e.target.value)} required /></label>))}
        <ul className="mb-6 space-y-1 text-[13px]">{rules.map(([t, ok]) => <li key={t} className={ok ? 'text-ok-600' : 'text-slate-500'}>{ok ? '✓' : '○'} {t}</li>)}</ul>
        <div className="flex items-center justify-between">
          <button type="button" className="text-sm text-slate-500 hover:text-ink-900" onClick={() => forced ? void logout() : nav(-1)}>{forced ? 'Sign out' : 'Cancel'}</button>
          <Btn type="submit" busy={busy} disabled={!cur || rules.some(r => !r[1])}>Update password</Btn>
        </div>
      </form>
    </div>
  )
}
