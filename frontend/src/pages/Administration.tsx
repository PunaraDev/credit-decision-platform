import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import clsx from 'clsx'
import { Plus } from 'lucide-react'
import { Badge, Btn, Card, CheckRow, EmptyState, Grid, Modal, Notice, ReadField, SelectField, Skeleton, TextField, when } from '@/components/ui'
import { api } from '@/services/api'
import { errText, useStore } from '@/store/applicationStore'
import { useAuth, type User } from '@/store/authStore'
import { ROLES } from '@/lib/permissions'
import { toast } from '@/store/toastStore'
import type { Role } from '@/types'

const TABS = ['Users', 'Policy', 'Security log', 'System'] as const

export default function Administration() {
  const me = useAuth(s => s.user)
  const [tab, setTab] = useState<(typeof TABS)[number]>('Users')
  if (me?.role !== 'Administrator') return <Navigate to="/" replace />
  return (
    <div className="mx-auto max-w-[1240px] space-y-6 px-6 py-8">
      <div><h1 className="text-4xl font-medium">Administration</h1><p className="mt-1 text-sm text-slate-500">People, policy and platform settings</p></div>
      <div role="tablist" className="inline-flex rounded-full border border-line bg-white p-1 shadow-card">
        {TABS.map(t => <button key={t} role="tab" aria-selected={t === tab} onClick={() => setTab(t)} className={clsx('rounded-full px-4 py-1.5 text-sm font-medium transition', t === tab ? 'bg-ink-950 text-white' : 'text-slate-600 hover:text-ink-950')}>{t}</button>)}
      </div>
      <div key={tab} className="animate-fade-up">{tab === 'Users' ? <Users /> : tab === 'Policy' ? <Policy /> : tab === 'Security log' ? <SecurityLog /> : <System />}</div>
    </div>
  )
}

function Users() {
  const me = useAuth(s => s.user)!
  const [users, setUsers] = useState<User[] | null>(null)
  const [edit, setEdit] = useState<User | 'new' | null>(null)
  const load = useCallback(() => { api.users().then(setUsers).catch(e => toast.bad(errText(e))) }, [])
  useEffect(load, [load])
  return (
    <Card title="Users" subtitle="Roles decide what each person can see and do" action={<Btn onClick={() => setEdit('new')}><Plus className="h-4 w-4" />Add user</Btn>} className="!p-0 overflow-hidden">
      {!users ? <div className="space-y-3 p-5"><Skeleton className="h-9" /><Skeleton className="h-9" /></div> : (
        <table className="w-full text-sm"><thead className="bg-white/40 text-left text-[13px] text-slate-500"><tr>{['Name', 'Username', 'Role', 'Branch / zone', 'Status', 'Last sign-in', ''].map(h => <th key={h} className="px-5 py-2.5 font-medium">{h}</th>)}</tr></thead>
          <tbody>{users.map((u, i) => (
            <tr key={u.id} style={{ animationDelay: `${i * 25}ms` }} className="row-in border-t border-line">
              <td className="px-5 py-3 font-medium">{u.fullName}</td><td className="px-5 py-3 text-slate-600">{u.username}</td><td className="px-5 py-3"><Badge tone="info">{u.role}</Badge></td><td className="px-5 py-3 text-slate-600">{u.branch || '—'}{u.zone ? ` / ${u.zone}` : ''}</td>
              <td className="px-5 py-3">{u.isActive ? <Badge tone="ok">Active</Badge> : <Badge tone="bad">Disabled</Badge>}{u.mustChangePassword && <span className="ml-2 text-xs text-slate-500">password change pending</span>}</td>
              <td className="px-5 py-3 text-slate-500">{when(u.lastLogin)}</td><td className="px-5 py-3 text-right"><button className="text-sm font-medium text-brand-600 hover:underline" onClick={() => setEdit(u)}>{u.id === me.id ? 'View' : 'Edit'}</button></td></tr>))}</tbody></table>)}
      {edit && <UserModal user={edit === 'new' ? null : edit} self={edit !== 'new' && edit.id === me.id} onClose={() => setEdit(null)} onDone={() => { setEdit(null); load() }} />}
    </Card>
  )
}

function UserModal({ user, self, onClose, onDone }: { user: User | null; self: boolean; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ username: user?.username ?? '', fullName: user?.fullName ?? '', email: user?.email ?? '', role: (user?.role ?? '') as string, branch: user?.branch ?? '', zone: user?.zone ?? '', password: '', isActive: user?.isActive ?? true, unlock: false })
  const [busy, setBusy] = useState(false)
  const set = (k: string) => (v: string) => setF(p => ({ ...p, [k]: v }))
  async function save() {
    setBusy(true)
    try {
      if (!user) await api.createUser({ username: f.username, fullName: f.fullName, email: f.email, role: f.role, branch: f.branch, zone: f.zone, password: f.password })
      else await api.updateUser(user.id, { fullName: f.fullName, email: f.email, role: f.role, branch: f.branch, zone: f.zone, isActive: f.isActive, unlock: f.unlock || undefined, password: f.password || undefined })
      toast.ok(user ? 'User updated' : 'User created'); onDone()
    } catch (e) { toast.bad(errText(e)) } finally { setBusy(false) }
  }
  return (
    <Modal open title={user ? `Edit ${user.fullName}` : 'Add user'} onClose={onClose}>
      <div className="space-y-4">
        {!user && <TextField label="Username" required value={f.username} onChange={set('username')} />}
        <TextField label="Full name" required value={f.fullName} onChange={set('fullName')} /><TextField label="Email" type="email" value={f.email} onChange={set('email')} />
        <SelectField label="Role" required options={ROLES as string[]} value={f.role} onChange={set('role')} disabled={self} />
        <div className="grid gap-4 sm:grid-cols-2"><TextField label="Branch" value={f.branch} onChange={set('branch')} hint="Used for branch-level rate comparison" /><TextField label="Zone" value={f.zone} onChange={set('zone')} /></div>
        <TextField label={user ? 'Reset password (optional)' : 'Temporary password'} required={!user} type="password" value={f.password} onChange={set('password')} hint="At least 10 characters with letters and numbers. The user must change it at first sign-in." />
        {user && !self && <div className="grid gap-3 sm:grid-cols-2"><CheckRow checked={f.isActive} onChange={v => setF(p => ({ ...p, isActive: v }))} title="Account active" /><CheckRow checked={f.unlock} onChange={v => setF(p => ({ ...p, unlock: v }))} title="Unlock account" desc="Clears a failed-attempt lockout" /></div>}
        {user && !self && <p className="text-xs text-slate-500">Changing the role, resetting the password or disabling the account signs the user out everywhere.</p>}
        <div className="flex justify-end gap-2 pt-2"><Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn busy={busy} onClick={() => void save()} disabled={!f.fullName || !f.role || (!user && (!f.username || !f.password))}>{user ? 'Save changes' : 'Create user'}</Btn></div>
      </div>
    </Modal>
  )
}

function Policy() {
  const [p, setP] = useState<Record<string, unknown> | null>(null)
  useEffect(() => { api.policy().then(setP).catch(e => toast.bad(errText(e))) }, [])
  if (!p) return <Skeleton className="h-64" />
  const adj = (p.risk_adjustments as Array<{ minScore: number; adjustment: number }>) ?? []
  return (
    <div className="space-y-5">
      <Notice tone="warn" title="Illustrative policy">These values are placeholders to demonstrate the flow. Replace them with your lender's approved credit policy (decision-service/decision/policy.py) and keep the version recorded on every decision.</Notice>
      <Card title="Active policy" subtitle={String(p.version)}>
        <Grid cols={4}><ReadField label="Base rate" value={`${p.base_rate}%`} /><ReadField label="Maximum rate" value={`${p.max_rate}%`} /><ReadField label="Auto-approve limit" value={`LKR ${Number(p.auto_approve_limit).toLocaleString()}`} />
          <ReadField label="Maximum LTV" value={`${p.max_ltv}%`} /><ReadField label="Maximum DSR" value={`${p.max_dsr}%`} /><ReadField label="Tenor range" value={`${p.min_tenor}-${p.max_tenor} months`} /></Grid>
      </Card>
      <Card title="Risk-based rate adjustment" subtitle="Added to the base rate by internal score">
        <div className="grid gap-3 sm:grid-cols-4">{adj.map(a => <div key={a.minScore} className="rounded-lg border border-line bg-[#FAF9F5] p-4"><p className="text-[13px] text-slate-500">Score {a.minScore}+</p><p className="font-display text-2xl">+{a.adjustment}%</p></div>)}</div>
      </Card>
    </div>
  )
}

function SecurityLog() {
  const [log, setLog] = useState<Awaited<ReturnType<typeof api.securityLog>> | null>(null)
  useEffect(() => { api.securityLog().then(setLog).catch(e => toast.bad(errText(e))) }, [])
  const tone = (o: string) => (o === 'success' ? 'ok' : o === 'logout' ? 'neutral' : 'bad')
  return (
    <Card title="Sign-in activity" subtitle="Latest 100 events" className="!p-0 overflow-hidden">
      {!log ? <div className="p-5"><Skeleton className="h-40" /></div> : log.length === 0 ? <EmptyState title="No activity yet" /> : (
        <table className="w-full text-sm"><thead className="bg-white/40 text-left text-[13px] text-slate-500"><tr>{['When', 'Username', 'Outcome', 'IP'].map(h => <th key={h} className="px-5 py-2.5 font-medium">{h}</th>)}</tr></thead>
          <tbody>{log.map((e, i) => <tr key={i} className="border-t border-line"><td className="px-5 py-2.5 text-slate-600">{when(e.at)}</td><td className="px-5 py-2.5">{e.username}</td>
            <td className="px-5 py-2.5"><Badge tone={tone(e.outcome) as 'ok' | 'bad' | 'neutral'}>{e.outcome.replace('_', ' ')}</Badge></td><td className="px-5 py-2.5 text-slate-500">{e.ip}</td></tr>)}</tbody></table>)}
    </Card>
  )
}

function System() {
  const mode = useStore(s => s.mode)
  return (
    <div className="space-y-5">
      <Card title="Integrations" subtitle="CRIB, ERP, screening and valuation connectors">
        <div className="flex items-center gap-3"><Badge tone={mode === 'live' ? 'ok' : 'warn'}>{mode === 'live' ? 'Live' : 'Sandbox'}</Badge>
          <p className="text-sm text-slate-600">{mode === 'live' ? 'Requests go to the configured provider endpoints.' : 'Results are simulated. Set INTEGRATION_MODE=live and the connector URLs and keys to use real providers (see README).'}</p></div>
      </Card>
      <Card title="Platform"><Grid cols={3}><ReadField label="Application" value="OriginIQ 1.0" /><ReadField label="Services" value="identity, workflow, decision, integration" /><ReadField label="Roles available" value={ROLES.length as unknown as string} /></Grid></Card>
    </div>
  )
}
export type { Role }
