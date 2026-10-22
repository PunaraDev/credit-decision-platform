import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Badge, Btn, Card, EmptyState, Skeleton } from '@/components/ui'
import { useStore } from '@/store/applicationStore'
import { useAuth } from '@/store/authStore'
import { fmt } from '@/lib/finance'
import { STEPS } from '@/types'

export default function ApplicationsList() {
  const { rows, loadList } = useStore()
  const role = useAuth(s => s.user?.role)
  const go = useNavigate()
  useEffect(() => { void loadList() }, [loadList])
  const canCreate = role && ['Administrator', 'Customer', 'Marketing Officer'].includes(role)
  const start = () => go('/applications/new')
  return (
    <div className="mx-auto max-w-[1240px] space-y-6 px-6 py-8">
      <div className="flex items-end justify-between"><div><h1 className="text-4xl font-medium">Applications</h1><p className="mt-1 text-sm text-slate-500">Every application and where it stands</p></div>
        {canCreate && <div className="flex gap-2"><Btn onClick={start}><Plus className="h-4 w-4" />New application</Btn></div>}</div>
      <Card className="!p-0 overflow-hidden">
        {!rows ? <div className="space-y-3 p-5">{[0, 1, 2].map(i => <Skeleton key={i} className="h-9" />)}</div>
          : rows.length === 0 ? <EmptyState title="No applications yet" hint="Start a vehicle lease or loan to begin the seven-stage journey." /> : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead className="bg-white/40 text-left text-[13px] text-slate-500"><tr>{['Reference', 'Customer', 'Product', 'Facility (LKR)', 'Stage', 'Status'].map(h => <th key={h} className="px-5 py-2.5 font-medium">{h}</th>)}</tr></thead>
              <tbody>{rows.map((a, i) => (
                <tr key={a.id} style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }} className="row-in border-t border-line transition-colors hover:bg-brand-50/60">
                  <td className="px-5 py-3 font-medium"><Link className="text-brand-600 hover:underline" to={`/applications/${a.id}/${a.currentStep}`}>{a.reference}</Link></td>
                  <td className="px-5 py-3">{a.summary.customerName || '—'}</td><td className="px-5 py-3">{a.product}</td>
                  <td className="px-5 py-3 tabular-nums">{a.summary.netFacility ? fmt(a.summary.netFacility) : '—'}</td>
                  <td className="px-5 py-3">{a.status === 'Completed' ? 'Done' : `${a.currentStep}. ${STEPS[a.currentStep - 1].title}`}</td>
                  <td className="px-5 py-3"><Badge tone={a.status === 'Completed' ? 'ok' : a.status === 'Declined' ? 'bad' : 'info'}>{a.status}</Badge></td></tr>))}</tbody></table></div>)}
      </Card>
    </div>
  )
}
