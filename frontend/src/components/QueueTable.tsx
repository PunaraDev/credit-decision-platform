import { useMemo, useState, type ReactNode } from 'react'
import { RefreshCw, Search } from 'lucide-react'
import clsx from 'clsx'
import { Btn, Card, EmptyState, Skeleton, Stat } from './ui'

export interface Col<T> { header: string; cell: (r: T) => ReactNode; className?: string }
export interface Chip<T> { label: string; test: (r: T) => boolean }
export interface StatDef<T> { label: string; value: (rows: T[]) => number | string; tone?: 'ok' | 'bad' | 'warn' }

/** Generic work-queue: search, filter chips, headline numbers, animated rows. Used by Customers, Screening, Valuations, Decisions, Documents. */
export default function QueueTable<T>({ title, subtitle, rows, columns, chips, stats, search, onOpen, onRefresh, empty }: {
  title: string; subtitle: string; rows: T[] | null; columns: Col<T>[]; chips: Chip<T>[]; stats: StatDef<T>[]
  search: (r: T) => string; onOpen: (r: T) => void; onRefresh: () => void; empty: string
}) {
  const [q, setQ] = useState(''), [chip, setChip] = useState(0)
  const shown = useMemo(() => (rows ?? []).filter(r => chips[chip].test(r) && (!q || search(r).toLowerCase().includes(q.toLowerCase()))), [rows, q, chip, chips, search])
  return (
    <div className="mx-auto max-w-[1240px] space-y-6 px-6 py-8">
      <div className="flex items-end justify-between gap-4">
        <div><h1 className="text-4xl font-medium">{title}</h1><p className="mt-1 text-sm text-slate-500">{subtitle}</p></div>
        <Btn variant="ghost" onClick={onRefresh}><RefreshCw className="h-4 w-4" />Refresh</Btn>
      </div>
      <div className="stagger grid grid-cols-2 gap-4 lg:grid-cols-4">{stats.map(s => <Stat key={s.label} label={s.label} value={rows ? s.value(rows) : '…'} tone={s.tone} />)}</div>
      <Card className="!p-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/70 px-5 py-3">
          <div className="flex gap-1.5">{chips.map((c, i) => (
            <button key={c.label} onClick={() => setChip(i)} className={clsx('rounded-full px-3.5 py-1.5 text-[13px] font-medium transition', i === chip ? 'bg-ink-950 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100')}>
              {c.label}{rows && <span className={clsx('ml-1.5 text-xs', i === chip ? 'text-slate-300' : 'text-slate-400')}>{rows.filter(c.test).length}</span>}</button>))}</div>
          <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className="input !w-64 !pl-9" placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} aria-label="Search" /></div>
        </div>
        {!rows ? <div className="space-y-3 p-5">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-9" />)}</div>
          : shown.length === 0 ? <EmptyState title={q || chip ? 'Nothing matches' : empty} hint={q || chip ? 'Try a different filter or search.' : undefined} />
          : <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-white/40 text-left text-[13px] text-slate-500"><tr>{columns.map(c => <th key={c.header} className={clsx('px-5 py-2.5 font-medium', c.className)}>{c.header}</th>)}</tr></thead>
            <tbody>{shown.map((r, i) => (
              <tr key={i} tabIndex={0} onClick={() => onOpen(r)} onKeyDown={e => e.key === 'Enter' && onOpen(r)} style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                className="row-in cursor-pointer border-t border-line transition-colors hover:bg-brand-50/60 focus:bg-brand-50/60 focus:outline-none">
                {columns.map(c => <td key={c.header} className={clsx('px-5 py-3', c.className)}>{c.cell(r)}</td>)}</tr>))}</tbody></table></div>}
      </Card>
    </div>
  )
}
