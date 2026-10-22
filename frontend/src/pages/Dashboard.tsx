import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { AnimatedNumber, Badge, Card, Skeleton, Stat } from '@/components/ui'
import { useStore } from '@/store/applicationStore'
import { useAuth } from '@/store/authStore'
import { STEPS } from '@/types'
import { tasks } from '@/lib/tasks'

export default function Dashboard() {
  const { rows, loadList } = useStore()
  const user = useAuth(s => s.user)
  useEffect(() => { void loadList() }, [loadList])
  const list = rows ?? []
  const by = (n: number) => list.filter(a => a.currentStep === n && a.status !== 'Completed').length
  const max = Math.max(1, ...STEPS.map(s => by(s.n)))
  const mine = tasks(user?.role ?? '', list).slice(0, 7)
  const hour = new Date().getHours()
  return (
    <div className="mx-auto max-w-[1240px] space-y-8 px-6 py-8">
      <div><p className="text-sm text-slate-500">{hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'}, {user?.fullName.split(' ')[0]}</p>
        <h1 className="text-4xl font-medium">Dashboard</h1></div>
      <div className="stagger grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Applications" value={rows ? <AnimatedNumber value={list.length} /> : '…'} />
        <Stat label="In progress" value={rows ? <AnimatedNumber value={list.filter(a => a.status === 'In Progress' || a.status === 'Draft').length} /> : '…'} />
        <Stat label="Completed" value={rows ? <AnimatedNumber value={list.filter(a => a.status === 'Completed').length} /> : '…'} tone="ok" />
        <Stat label="Pipeline (LKR)" value={rows ? <AnimatedNumber value={list.reduce((s, a) => s + a.summary.netFacility, 0)} /> : '…'} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card title="Applications by stage" subtitle="Where open applications sit in the seven-stage journey">
          {!rows ? <Skeleton className="h-40" /> : (
            <div className="space-y-3">{STEPS.map(s => (
              <div key={s.n} className="flex items-center gap-3 text-sm"><span className="w-40 shrink-0 text-slate-600">{s.n}. {s.title}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-600 transition-[width] duration-1000 ease-out" style={{ width: `${(by(s.n) / max) * 100}%` }} /></div>
                <span className="w-6 text-right tabular-nums">{by(s.n)}</span></div>))}</div>)}
        </Card>
        <Card title="Needs your attention" subtitle={user?.role}>
          {!rows ? <Skeleton className="h-40" /> : mine.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">You're all caught up.</p> : (
            <ul className="divide-y divide-line">{mine.map((t, i) => (
              <li key={i}><Link to={`/applications/${t.row.id}/${t.step}`} className="group -mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition hover:bg-brand-50">
                <span><span className="text-sm font-medium">{t.row.reference}</span><span className="text-sm text-slate-500"> · {t.row.summary.customerName || 'Unnamed'}</span><span className="block text-[13px] text-slate-500">{t.what}</span></span>
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-1 group-hover:text-brand-600" /></Link></li>))}</ul>)}
        </Card>
      </div>
      <Card title="Recent applications">
        {!rows ? <Skeleton className="h-24" /> : list.length === 0 ? <p className="text-sm text-slate-500">No applications yet.</p> : (
          <ul className="divide-y divide-line">{list.slice(0, 6).map(a => (
            <li key={a.id} className="flex items-center justify-between py-2.5 text-sm"><Link to={`/applications/${a.id}/${a.currentStep}`} className="font-medium text-brand-600 hover:underline">{a.reference}</Link>
              <span className="text-slate-600">{a.summary.customerName || 'Unnamed customer'}</span><Badge tone={a.status === 'Completed' ? 'ok' : a.status === 'Declined' ? 'bad' : 'info'}>{a.status}</Badge></li>))}</ul>)}
      </Card>
    </div>
  )
}
