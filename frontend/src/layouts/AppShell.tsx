import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { LayoutDashboard, FileText, Users, ShieldCheck, Car, Brain, FolderCheck, Settings, Plus, LogOut, KeyRound, ChevronDown, Bell, Search } from 'lucide-react'
import { Btn } from '@/components/ui'
import { logout, useAuth } from '@/store/authStore'
import { useStore } from '@/store/applicationStore'
import { api } from '@/services/api'
import { tasks } from '@/lib/tasks'
import type { Role } from '@/types'

const ALL: Role[] = ['Administrator', 'Customer', 'Marketing Officer', 'Compliance Officer', 'Valuer', 'QA Officer', 'Credit Officer', 'Credit Approver', 'Operations Officer']
const STAFF = ALL.filter(r => r !== 'Customer')
const nav: Array<{ to: string; label: string; icon: typeof FileText; end?: boolean; roles: Role[] }> = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true, roles: ALL },
  { to: '/applications', label: 'Applications', icon: FileText, roles: ALL },
  { to: '/customers', label: 'Customers', icon: Users, roles: STAFF },
  { to: '/screening', label: 'Screening', icon: ShieldCheck, roles: ['Administrator', 'Compliance Officer', 'Marketing Officer'] },
  { to: '/valuations', label: 'Valuations', icon: Car, roles: ['Administrator', 'Valuer', 'QA Officer', 'Marketing Officer'] },
  { to: '/decisions', label: 'Decisions', icon: Brain, roles: ['Administrator', 'Credit Officer', 'Credit Approver', 'Marketing Officer'] },
  { to: '/documents', label: 'Documents', icon: FolderCheck, roles: ['Administrator', 'Operations Officer', 'Marketing Officer'] },
  { to: '/admin', label: 'Administration', icon: Settings, roles: ['Administrator'] },
]

/** Closes a popover when the user clicks elsewhere or presses Escape. */
function usePopover() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key) }
  }, [open])
  return { open, setOpen, ref }
}

function HeaderSearch() {
  const { rows, loadList } = useStore(), go = useNavigate()
  const [q, setQ] = useState('')
  const pop = usePopover()
  const hits = useMemo(() => {
    if (q.trim().length < 2) return []
    const n = q.toLowerCase()
    return (rows ?? []).filter(r => `${r.reference} ${r.summary.customerName} ${r.summary.nic} ${r.summary.vehicleNo}`.toLowerCase().includes(n)).slice(0, 6)
  }, [q, rows])
  return (
    <div ref={pop.ref} className="relative">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input aria-label="Search applications" className="input !w-72 !rounded-full !pl-9" placeholder="Search name, NIC, reference, vehicle" value={q}
        onFocus={() => { pop.setOpen(true); if (!rows) void loadList() }} onChange={e => { setQ(e.target.value); pop.setOpen(true) }} />
      {pop.open && q.trim().length >= 2 && (
        <div className="glass-strong absolute left-0 z-40 mt-2 w-[360px] animate-scale-in rounded-2xl p-1.5">
          {hits.length === 0 ? <p className="px-3 py-3 text-sm text-slate-500">No matches</p> : hits.map(r => (
            <button key={r.id} className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left hover:bg-brand-50" onClick={() => { go(`/applications/${r.id}/${r.currentStep}`); setQ(''); pop.setOpen(false) }}>
              <span><span className="block text-sm font-medium">{r.reference}</span><span className="block text-xs text-slate-500">{r.summary.customerName || 'Unnamed'} · {r.summary.nic || 'no NIC yet'}</span></span>
              <span className="text-xs text-slate-400">Stage {r.currentStep}</span></button>))}
        </div>)}
    </div>
  )
}

function Bell_({ role }: { role: Role }) {
  const { rows, loadList } = useStore(), go = useNavigate()
  const pop = usePopover()
  useEffect(() => { void loadList(); const t = setInterval(() => void loadList(), 30000); return () => clearInterval(t) }, [loadList])
  const list = tasks(role, rows ?? [])
  return (
    <div ref={pop.ref} className="relative">
      <button aria-label={`Notifications, ${list.length} pending`} onClick={() => pop.setOpen(!pop.open)} className="glass relative flex h-10 w-10 items-center justify-center rounded-full text-ink-800 transition hover:-translate-y-0.5">
        <Bell className="h-4 w-4" />
        {list.length > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] animate-pop items-center justify-center rounded-full bg-bad-500 px-1 text-[10px] font-semibold text-white">{list.length > 9 ? '9+' : list.length}</span>}
      </button>
      {pop.open && (
        <div className="glass-strong absolute right-0 z-40 mt-2 w-[360px] animate-scale-in rounded-2xl p-1.5">
          <p className="px-3 pb-1 pt-2 text-[13px] font-medium text-slate-500">Needs your attention</p>
          {list.length === 0 ? <p className="px-3 py-4 text-sm text-slate-500">You're all caught up.</p> : list.slice(0, 7).map((t, i) => (
            <button key={i} className="flex w-full flex-col rounded-xl px-3 py-2 text-left hover:bg-brand-50" onClick={() => { go(`/applications/${t.row.id}/${t.step}`); pop.setOpen(false) }}>
              <span className="text-sm font-medium">{t.row.reference} <span className="font-normal text-slate-500">· {t.row.summary.customerName || 'Unnamed'}</span></span><span className="text-[13px] text-slate-500">{t.what}</span></button>))}
        </div>)}
    </div>
  )
}

export default function AppShell() {
  const { user, token, setUser } = useAuth()
  const { mode, loadMode } = useStore()
  const go = useNavigate(), loc = useLocation()
  const menu = usePopover()
  useEffect(() => { if (token) { void loadMode(); api.me().then(setUser).catch(() => undefined) } }, [token, loadMode, setUser])
  useEffect(() => menu.setOpen(false), [loc.pathname]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!token || !user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />
  const canCreate = ['Administrator', 'Customer', 'Marketing Officer'].includes(user.role)
  const initials = user.fullName.split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase()

  return (
    <div className="relative flex h-full overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-32 top-1/3 h-[420px] w-[420px] animate-floaty rounded-full bg-brand-500/20 blur-3xl" />
        <div className="absolute right-[-120px] top-[-80px] h-[380px] w-[380px] animate-floaty rounded-full bg-gold-400/25 blur-3xl [animation-delay:-3s]" />
        <div className="absolute bottom-[-140px] left-1/2 h-[420px] w-[420px] animate-floaty rounded-full bg-ok-500/15 blur-3xl [animation-delay:-6s]" />
      </div>
      <aside className="glass-dark m-3 mr-0 hidden w-60 shrink-0 flex-col rounded-2xl lg:flex">
        <Link to="/" className="px-6 py-6"><p className="font-display text-[22px] text-white">Origin<span className="text-gold-400">IQ</span></p><p className="text-xs text-slate-400">Credit decisioning</p></Link>
        <nav className="flex-1 space-y-0.5 px-3">
          {nav.filter(n => n.roles.includes(user.role)).map(n => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200 ${isActive ? 'bg-white/12 text-white shadow-[inset_0_1px_0_rgba(255,255,255,.12)]' : 'hover:bg-white/6 hover:text-white'}`}>
              {({ isActive }) => (<><span className={`absolute left-0 h-5 w-[3px] rounded-r bg-gold-400 transition-all duration-300 ${isActive ? 'opacity-100' : 'scale-y-0 opacity-0'}`} />
                <n.icon className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />{n.label}</>)}
            </NavLink>))}
        </nav>
        <div className="m-3 rounded-xl bg-white/5 p-3 text-xs text-slate-400"><p className="font-medium text-slate-300">{user.branch || 'No branch set'}</p><p>{user.zone ? `${user.zone} zone` : 'Vehicle leasing and loans'}</p></div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass m-3 mb-0 flex items-center justify-between gap-4 rounded-2xl px-5 py-2.5">
          <div className="flex items-center gap-3"><HeaderSearch />
            {mode === 'mock' && <span title="CRIB, ERP, screening and valuation return simulated results until live connectors are configured" className="hidden rounded-full bg-warn-50 px-3 py-1 text-xs font-medium text-warn-500 md:inline">Sandbox integrations</span>}</div>
          <div className="flex items-center gap-3">
            {canCreate && <Btn onClick={() => go('/applications/new')}><Plus className="h-4 w-4" />New application</Btn>}
            <Bell_ role={user.role} />
            <div ref={menu.ref} className="relative">
              <button onClick={() => menu.setOpen(!menu.open)} aria-haspopup="menu" aria-expanded={menu.open} className="glass flex items-center gap-2.5 rounded-full py-1 pl-1 pr-3 transition hover:-translate-y-0.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brand-600 to-ink-800 text-xs font-semibold text-white">{initials}</span>
                <span className="hidden text-left leading-tight sm:block"><span className="block text-[13px] font-medium">{user.fullName}</span><span className="block text-xs text-slate-500">{user.role}</span></span>
                <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${menu.open ? 'rotate-180' : ''}`} />
              </button>
              {menu.open && (
                <div role="menu" className="glass-strong absolute right-0 z-40 mt-2 w-56 animate-scale-in rounded-2xl p-1.5">
                  <button role="menuitem" className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm hover:bg-brand-50" onClick={() => go('/change-password')}><KeyRound className="h-4 w-4 text-slate-500" />Change password</button>
                  <button role="menuitem" className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-bad-500 hover:bg-bad-50" onClick={() => void logout().then(() => go('/login'))}><LogOut className="h-4 w-4" />Sign out</button>
                </div>)}
            </div>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto"><div key={loc.pathname} className="animate-fade-up"><Outlet /></div></main>
      </div>
    </div>
  )
}
