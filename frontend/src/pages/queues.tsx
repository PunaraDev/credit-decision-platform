import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui'
import QueueTable, { type Col } from '@/components/QueueTable'
import { useStore } from '@/store/applicationStore'
import { fmt } from '@/lib/finance'
import type { AppRow } from '@/types'

type Tone = 'neutral' | 'ok' | 'warn' | 'bad' | 'info'
const B = ({ v, map }: { v?: string | null; map: Record<string, Tone> }) => (v ? <Badge tone={map[v] ?? 'neutral'}>{v.replace('_', ' ')}</Badge> : <span className="text-slate-400">Not started</span>)
const ref = (r: AppRow) => <span className="font-medium text-brand-600">{r.reference}</span>
const who = (r: AppRow) => r.summary.customerName || <span className="text-slate-400">Unnamed</span>

function useRows() {
  const { rows, loadList } = useStore(); const go = useNavigate()
  useEffect(() => { void loadList() }, [loadList])
  return { rows, loadList, open: (r: AppRow, step: number) => go(`/applications/${r.id}/${Math.min(step, r.currentStep)}`) }
}

export function ScreeningPage() {
  const { rows, loadList, open } = useRows()
  const cols: Col<AppRow>[] = [
    { header: 'Reference', cell: ref }, { header: 'Customer', cell: who }, { header: 'NIC', cell: r => r.summary.nic || '—' },
    { header: 'Screening', cell: r => <B v={r.summary.screening} map={{ clear: 'ok', review: 'bad', running: 'info' }} /> },
    { header: 'Risk class', cell: r => <B v={r.summary.riskClass} map={{ Low: 'ok', Medium: 'warn', High: 'bad' }} /> },
    { header: 'Customer permission', cell: r => <B v={r.summary.fourN} map={{ submitted: 'ok', sent: 'info' }} /> },
    { header: 'CRIB', cell: r => <B v={r.summary.cribStatus} map={{ HIT: 'ok', NO_HIT: 'warn' }} /> },
  ]
  return <QueueTable title="Screening" subtitle="Sanctions, PEP and adverse-media checks, CDD and customer review" rows={rows} columns={cols} onRefresh={() => void loadList()} onOpen={r => open(r, 2)}
    search={r => `${r.reference} ${r.summary.customerName} ${r.summary.nic}`} empty="No applications have reached screening yet."
    chips={[{ label: 'All', test: () => true }, { label: 'Needs review', test: r => r.summary.screening === 'review' }, { label: 'Not run', test: r => !r.summary.screening || r.summary.screening === 'idle' }, { label: 'Awaiting customer', test: r => r.summary.fourN === 'sent' }]}
    stats={[{ label: 'Applications', value: x => x.length }, { label: 'Possible matches', value: x => x.filter(r => r.summary.screening === 'review').length, tone: 'bad' },
      { label: 'Awaiting customer', value: x => x.filter(r => r.summary.fourN === 'sent').length, tone: 'warn' }, { label: 'Cleared', value: x => x.filter(r => r.summary.screening === 'clear').length, tone: 'ok' }]} />
}

export function ValuationsPage() {
  const { rows, loadList, open } = useRows()
  const cols: Col<AppRow>[] = [
    { header: 'Reference', cell: ref }, { header: 'Vehicle', cell: r => <span>{r.summary.vehicle || '—'}<span className="block text-xs text-slate-500">{r.summary.vehicleNo}</span></span> },
    { header: 'Customer', cell: who },
    { header: 'Valuation', cell: r => <B v={r.summary.valuation} map={{ reported: 'ok', requested: 'info', idle: 'neutral' }} /> },
    { header: 'Market value (LKR)', className: 'text-right tabular-nums', cell: r => (r.summary.marketValue ? fmt(r.summary.marketValue) : '—') },
    { header: 'QA', cell: r => <B v={r.summary.qa} map={{ approved: 'ok', pending: 'warn', rejected: 'bad', revaluation: 'info' }} /> },
  ]
  return <QueueTable title="Valuations" subtitle="Valuation requests and manual QA of the reports" rows={rows} columns={cols} onRefresh={() => void loadList()} onOpen={r => open(r, 3)}
    search={r => `${r.reference} ${r.summary.customerName} ${r.summary.vehicle} ${r.summary.vehicleNo}`} empty="No vehicles have been entered yet."
    chips={[{ label: 'All', test: r => !!r.summary.vehicleNo || r.currentStep >= 3 }, { label: 'QA pending', test: r => r.summary.valuation === 'reported' && r.summary.qa === 'pending' }, { label: 'Not requested', test: r => r.currentStep >= 3 && r.summary.valuation !== 'reported' }, { label: 'QA approved', test: r => r.summary.qa === 'approved' }]}
    stats={[{ label: 'Vehicles', value: x => x.filter(r => r.summary.vehicleNo).length }, { label: 'QA pending', value: x => x.filter(r => r.summary.valuation === 'reported' && r.summary.qa === 'pending').length, tone: 'warn' },
      { label: 'QA approved', value: x => x.filter(r => r.summary.qa === 'approved').length, tone: 'ok' }, { label: 'Rejected / revalue', value: x => x.filter(r => r.summary.qa === 'rejected' || r.summary.qa === 'revaluation').length, tone: 'bad' }]} />
}

export function DecisionsPage() {
  const { rows, loadList, open } = useRows()
  const cols: Col<AppRow>[] = [
    { header: 'Reference', cell: ref }, { header: 'Customer', cell: who }, { header: 'Facility (LKR)', className: 'text-right tabular-nums', cell: r => fmt(r.summary.netFacility) },
    { header: 'Decision', cell: r => <B v={r.summary.outcome} map={{ Approve: 'ok', 'Conditional approve': 'info', 'Manual review': 'warn', Decline: 'bad', 'Compliance hold': 'bad' }} /> },
    { header: 'Score', className: 'text-right tabular-nums', cell: r => r.summary.score ?? '—' }, { header: 'Rate', className: 'text-right tabular-nums', cell: r => (r.summary.approvedRate ? `${r.summary.approvedRate.toFixed(2)}%` : '—') },
    { header: 'Approval', cell: r => <B v={r.summary.approval} map={{ approved: 'ok', pending: 'warn', rejected: 'bad' }} /> },
  ]
  return <QueueTable title="Decisions" subtitle="AI-assisted credit decisions, pricing and approvals" rows={rows} columns={cols} onRefresh={() => void loadList()} onOpen={r => open(r, 5)}
    search={r => `${r.reference} ${r.summary.customerName} ${r.summary.outcome ?? ''}`} empty="No credit assessments have been run yet."
    chips={[{ label: 'All', test: r => !!r.summary.outcome }, { label: 'Awaiting approval', test: r => r.summary.approval === 'pending' && !!r.summary.outcome }, { label: 'Approved', test: r => r.summary.approval === 'approved' }, { label: 'Declined / rejected', test: r => r.summary.outcome === 'Decline' || r.summary.approval === 'rejected' }]}
    stats={[{ label: 'Assessed', value: x => x.filter(r => r.summary.outcome).length }, { label: 'Awaiting approval', value: x => x.filter(r => r.summary.approval === 'pending' && r.summary.outcome).length, tone: 'warn' },
      { label: 'Approved', value: x => x.filter(r => r.summary.approval === 'approved').length, tone: 'ok' },
      { label: 'Average score', value: x => { const s = x.filter(r => r.summary.score != null); return s.length ? Math.round(s.reduce((a, r) => a + (r.summary.score ?? 0), 0) / s.length) : '—' } }]} />
}

export function DocumentsPage() {
  const { rows, loadList, open } = useRows()
  const cols: Col<AppRow>[] = [
    { header: 'Reference', cell: ref }, { header: 'Customer', cell: who },
    { header: 'Verified', cell: r => <span className="flex items-center gap-2"><span className="h-1.5 w-24 overflow-hidden rounded bg-line"><span className="block h-full rounded bg-ok-500 transition-all duration-700" style={{ width: `${(r.summary.docsVerified / Math.max(1, r.summary.docsRequired)) * 100}%` }} /></span>
      <span className="tabular-nums text-[13px] text-slate-600">{r.summary.docsVerified}/{r.summary.docsRequired}</span></span> },
    { header: 'Awaiting review', className: 'tabular-nums', cell: r => (r.summary.docsPending ? <Badge tone="warn">{r.summary.docsPending}</Badge> : '—') },
    { header: 'Stage', cell: r => (r.status === 'Completed' ? <Badge tone="ok">Completed</Badge> : `Stage ${r.currentStep}`) },
  ]
  return <QueueTable title="Documents" subtitle="Collection and verification across all applications" rows={rows} columns={cols} onRefresh={() => void loadList()} onOpen={r => open(r, 7)}
    search={r => `${r.reference} ${r.summary.customerName}`} empty="No applications yet."
    chips={[{ label: 'All', test: () => true }, { label: 'Needs verification', test: r => r.summary.docsPending > 0 }, { label: 'In collection', test: r => r.currentStep >= 7 && r.status !== 'Completed' }, { label: 'Complete', test: r => r.status === 'Completed' }]}
    stats={[{ label: 'Applications', value: x => x.length }, { label: 'Documents to verify', value: x => x.reduce((a, r) => a + r.summary.docsPending, 0), tone: 'warn' },
      { label: 'At document stage', value: x => x.filter(r => r.currentStep >= 7 && r.status !== 'Completed').length }, { label: 'Completed', value: x => x.filter(r => r.status === 'Completed').length, tone: 'ok' }]} />
}

interface Cust { nic: string; name: string; mobile: string; district: string; erpId?: string; crib?: string; score?: number; apps: AppRow[] }
export function CustomersPage() {
  const { rows, loadList } = useRows(); const go = useNavigate()
  const map = new Map<string, Cust>()
  for (const r of rows ?? []) {
    const s = r.summary; if (!s.nic) continue
    const c = map.get(s.nic) ?? { nic: s.nic, name: s.customerName, mobile: s.mobile, district: s.district, apps: [] }
    c.apps.push(r); c.erpId ||= s.erpCustomerId; c.crib ||= s.cribStatus; c.score ??= s.cribScore; map.set(s.nic, c)
  }
  const list = rows ? [...map.values()] : null
  const cols: Col<Cust>[] = [
    { header: 'Customer', cell: c => <span className="font-medium">{c.name}</span> }, { header: 'NIC', cell: c => c.nic }, { header: 'Mobile', cell: c => c.mobile || '—' }, { header: 'District', cell: c => c.district || '—' },
    { header: 'ERP', cell: c => (c.erpId ? <Badge tone="info">{c.erpId}</Badge> : <Badge tone="ok">New customer</Badge>) },
    { header: 'Bureau', cell: c => <span className="flex items-center gap-2"><B v={c.crib} map={{ HIT: 'ok', NO_HIT: 'warn' }} />{c.score != null && <span className="tabular-nums text-xs text-slate-500">{c.score}</span>}</span> },
    { header: 'Applications', className: 'tabular-nums', cell: c => c.apps.length },
  ]
  return <QueueTable<Cust> title="Customers" subtitle="Everyone with an application, with ERP link and bureau result" rows={list} columns={cols} onRefresh={() => void loadList()}
    onOpen={c => go(`/applications/${c.apps[0].id}/${Math.min(1, c.apps[0].currentStep)}`)} search={c => `${c.name} ${c.nic} ${c.mobile}`} empty="Customers appear here once an application captures their details."
    chips={[{ label: 'All', test: () => true }, { label: 'Existing in ERP', test: c => !!c.erpId }, { label: 'New', test: c => !c.erpId }, { label: 'Multiple applications', test: c => c.apps.length > 1 }]}
    stats={[{ label: 'Customers', value: x => x.length }, { label: 'Existing in ERP', value: x => x.filter(c => c.erpId).length }, { label: 'Bureau hits', value: x => x.filter(c => c.crib === 'HIT').length, tone: 'ok' }, { label: 'No bureau hit', value: x => x.filter(c => c.crib === 'NO_HIT').length, tone: 'warn' }]} />
}
