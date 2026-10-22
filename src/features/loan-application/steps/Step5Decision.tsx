import { useEffect, useRef, useState } from 'react'
import { BadgeCheck, Gavel, RefreshCw, Sparkles } from 'lucide-react'
import clsx from 'clsx'
import { AnimatedNumber, Badge, Btn, Card, Modal, Notice, NumberField, TextAreaField, when } from '@/components/ui'
import ScoreRing from '@/components/ScoreRing'
import StepFooter from '@/components/StepFooter'
import { useStep } from '../useStep'
import { can } from '@/lib/permissions'
import { fmt, finalMarketValue, lkr, num, schedule } from '@/lib/finance'
import { api, type Walr, type WalrCell } from '@/services/api'
import type { Application } from '@/types'

const LIGHT = { Green: { dot: 'bg-emerald-300', text: 'Green decision' }, Amber: { dot: 'bg-amber-300', text: 'Amber decision' }, Red: { dot: 'bg-red-300', text: 'Red decision' } } as const

export default function Step5({ app }: { app: Application }) {
  const s = useStep(app, 5)
  const d = app.decision, rate = app.rate, rr = app.rateRequest
  const [note, setNote] = useState(app.approval.comment)
  const [all, setAll] = useState(false)
  const [special, setSpecial] = useState(false)
  const [spRate, setSpRate] = useState(''), [spWhy, setSpWhy] = useState('')
  const [walr, setWalr] = useState<Walr | null>(null)
  const ran = useRef(false)

  const run = () => s.act.assess()
  useEffect(() => { if (!app.decision && !ran.current) { ran.current = true; void run() } }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (app.decision) api.walr(app.id).then(setWalr).catch(() => undefined) }, [app.id, app.decision, app.rate?.mode, app.rate?.rate])

  const decide = (approve: boolean) => s.act.transition(approve ? 'approve' : 'reject', note, approve ? 'Approved' : 'Rejected')
  const stopped = d?.outcome === 'Decline' || d?.outcome === 'Compliance hold'
  const blockers = !d ? ['Run the credit assessment'] : [
    ...(stopped ? [`Outcome is “${d.outcome}”. Revise the facility or resolve the hold.`] : []),
    ...(app.approval.status !== 'approved' ? ['Credit approval is pending'] : []),
    ...(rr?.status === 'pending' ? ['A special rate request is awaiting approval'] : []),
    ...(!rate && rr?.status !== 'pending' ? ['Accept the AI rate or obtain a special rate'] : []),
  ]
  if (!d) return <div className="glass rounded-2xl p-12 text-center text-slate-500">Running the credit assessment…</div>

  const agreed = rate?.rate ?? d.approvedRate
  const inst = rate?.installment ?? d.installment
  const total = rate?.totalPayable ?? d.totalPayable
  const rows = schedule(d.financed, agreed, num(app.facility.tenor), num(app.facility.lumpSum))
  const shown = all ? rows : rows.slice(0, 12)
  const light = LIGHT[d.trafficLight]
  const canPrice = ['Administrator', 'Marketing Officer', 'Credit Officer'].includes(s.role)

  async function sendSpecial() {
    await s.act.transition('special_rate_request', spWhy, 'Special rate requested', { rate: Number(spRate) }); setSpecial(false)
  }
  const walrRow = (period: string, level: 'branch' | 'zone', first: boolean, data?: WalrCell) => (
    <tr key={period + level} className="border-t border-line/70">
      {first && <td rowSpan={2} className="border-r border-line/70 px-3 py-2 text-center align-middle text-[13px]">{period}</td>}
      <td className="border-r border-line/70 px-3 py-2 text-center text-[13px]">{level === 'branch' ? 'Branch' : 'Zone'}</td>
      {(['overall', 'rg', 'ur'] as const).map(k => <td key={k} className="px-2 py-1.5"><div className="rounded-lg border border-line bg-white/60 px-3 py-1.5 text-center tabular-nums">{(data?.[k] ?? 0).toFixed(2)}</div></td>)}
    </tr>)

  return (
    <div className="stagger space-y-5">
      <div className="relative grid overflow-hidden rounded-2xl bg-gradient-to-br from-ok-500 via-ok-600 to-[#0B4D35] text-white shadow-lift md:grid-cols-[1fr_auto]">
        <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-1/3 animate-sweep bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <div className="relative px-8 py-7 text-center">
          <p className="text-sm uppercase tracking-wide text-white/85">AI recommended rate</p>
          <p className="font-display text-7xl font-medium tabular-nums"><AnimatedNumber value={d.approvedRate} dp={2} /></p>
          <span className="mt-1 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[13px] backdrop-blur"><span className={clsx('h-2.5 w-2.5 rounded-full', light.dot)} />{light.text}</span>
          {rate && <p className="mt-2 text-[13px] text-white/85">Agreed rate: {rate.rate.toFixed(2)}% ({rate.mode === 'special' ? 'special rate' : 'AI rate'})</p>}
        </div>
        <div className="relative flex flex-col items-center justify-center gap-2 px-8 py-7 md:min-w-[260px]">
          <p className="text-sm uppercase tracking-wide text-white/85">AI floor rate</p>
          <div className="w-full rounded-lg border-2 border-white/40 bg-white px-6 py-3 text-center font-display text-3xl text-ink-950"><AnimatedNumber value={d.floorRate} dp={2} /></div>
          <p className="text-xs text-white/70">Requested {d.requestedRate}% · {d.modelVersion}</p>
        </div>
      </div>

      <Card title="Weighted average lending rate (WALR)" subtitle={`Rates agreed in your branch${walr?.branch ? ` (${walr.branch})` : ''} and zone${walr?.zone ? ` (${walr.zone})` : ''}, weighted by facility amount`}>
        <div className="overflow-x-auto rounded-xl border border-line/80">
          <table className="w-full text-sm">
            <thead><tr className="bg-brand-100/70 text-center text-[13px] font-semibold text-ink-900">{['Period', 'Level', 'Overall WALR', 'RG WALR', 'UR WALR'].map(h => <th key={h} className="px-3 py-2.5">{h}</th>)}</tr></thead>
            <tbody>
              {walrRow('Current Month', 'branch', true, walr?.currentMonth.branch)}{walrRow('Current Month', 'zone', false, walr?.currentMonth.zone)}
              {walrRow('Last 30 Days', 'branch', true, walr?.last30Days.branch)}{walrRow('Last 30 Days', 'zone', false, walr?.last30Days.zone)}
            </tbody></table></div>
        <p className="mt-2 text-xs text-slate-500">RG: AI-recommended rates that were accepted. UR: special rates approved outside the AI recommendation.</p>
      </Card>

      <Card>
        <div className="grid gap-4 md:grid-cols-3">
          {([['Credit score', d.score.toFixed(2)], ['Additional amount', fmt(d.additionalAmount)], ['Net facility', fmt(num(app.facility.netFacility))]] as const).map(([l, v]) => (
            <div key={l}><p className="mb-1 text-[13px] text-slate-600">{l}</p><div className="rounded-lg border border-lime-300 bg-lime-200/70 px-3 py-2.5 text-sm font-medium tabular-nums">{v}</div></div>))}
        </div>
        <p className="mt-2 text-xs text-slate-500">Additional amount: further financing still available inside the LTV and DSR limits at this rate and tenor.</p>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <Btn className="!py-2.5" disabled={!canPrice || stopped || !!rate && rate.mode === 'ai' || rr?.status === 'pending'} onClick={() => void s.act.transition('rate_accept', '', 'Record saved')}><BadgeCheck className="h-4 w-4" />{rate?.mode === 'ai' ? 'AI rate accepted' : 'Rate accept'}</Btn>
          <button className="btn bg-gradient-to-b from-amber-300 to-amber-400 !py-2.5 text-ink-950 shadow-sm hover:-translate-y-px hover:shadow-lift disabled:cursor-not-allowed disabled:opacity-50" disabled={!canPrice || stopped || rr?.status === 'pending'} onClick={() => { setSpRate(String(Math.max(0, d.approvedRate - 1))); setSpecial(true) }}><Sparkles className="h-4 w-4" />Special rate request</button>
        </div>
        {rr?.status === 'pending' && <div className="mt-4"><Notice tone="warn" title={`Special rate ${rr.rate}% is awaiting a credit approver`}>{rr.comment}</Notice></div>}
        {rr?.status === 'rejected' && !rate && <div className="mt-4"><Notice tone="bad" title="Special rate was rejected">{rr.decisionNote}. You can accept the AI rate or request another.</Notice></div>}
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {([['Decision', d.outcome], ['LTV', `${d.ltv.toFixed(1)}%`], ['DSR', `${d.dsr.toFixed(1)}%`], ['Monthly rental', fmt(inst)]] as const).map(([l, v]) => (
          <div key={l} className="glass rounded-xl px-4 py-3"><p className="text-[13px] text-slate-500">{l}</p><p className="mt-0.5 text-lg font-semibold">{v}</p></div>))}
      </div>

      {d.hardStops.length > 0 && <Notice tone="bad" title="Policy stops"><ul className="list-disc pl-4">{d.hardStops.map(h => <li key={h}>{h}</li>)}</ul></Notice>}
      {d.conditions.length > 0 && <Notice tone="warn" title="Conditions"><ul className="list-disc pl-4">{d.conditions.map(h => <li key={h}>{h}</li>)}</ul></Notice>}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Why this result" subtitle="Contribution of each factor to the internal score (base 50)">
          <div className="mb-4 flex items-center gap-5"><ScoreRing score={d.score} size={104} /><p className="text-[13px] text-slate-600">{d.needsApprover ? 'A credit approver must sign off before this proceeds.' : 'Within the delegated limit, so it was approved automatically.'}</p></div>
          <ul className="divide-y divide-line/70 text-sm">{d.factors.map(f => (
            <li key={f.label} className="flex items-center justify-between py-2"><span>{f.label}<span className="block text-xs text-slate-500">{f.note}</span></span>
              <span className={clsx('font-semibold tabular-nums', f.impact > 0 ? 'text-ok-600' : f.impact < 0 ? 'text-bad-500' : 'text-slate-500')}>{f.impact > 0 ? '+' : ''}{f.impact}</span></li>))}</ul>
          <p className="mt-3 text-xs text-slate-500">Rules-based and illustrative. Replace with the lender's approved policy and a validated model.</p>
        </Card>
        <Card title="Credit approval" subtitle={`Inputs: income ${lkr(num(app.customer.netIncome))}, collateral ${lkr(finalMarketValue(app))}, financed ${lkr(d.financed)}`}
          action={<div className="flex items-center gap-2"><Badge tone={app.approval.status === 'approved' ? 'ok' : app.approval.status === 'rejected' ? 'bad' : 'warn'}>{app.approval.status === 'approved' ? 'Approved' : app.approval.status === 'rejected' ? 'Rejected' : 'Awaiting approver'}</Badge>
            <Btn variant="ghost" onClick={() => void run()} disabled={!can.edit(s.role, 5)}><RefreshCw className="h-4 w-4" />Re-run</Btn></div>}>
          {app.approval.status === 'approved' && app.approval.by?.startsWith('System') && rr?.status !== 'pending' ? (
            <p className="text-sm text-slate-600">Auto-approved within the delegated limit of LKR 5,000,000. {when(app.approval.at)}</p>
          ) : (
            <div className="space-y-3">
              <TextAreaField label="Approver comment" value={note} disabled={!can.approve(s.role)} onChange={setNote} />
              <div className="flex flex-wrap items-center gap-2">
                <Btn variant="ok" disabled={!can.approve(s.role) || stopped} onClick={() => void decide(true)}><Gavel className="h-4 w-4" />{rr?.status === 'pending' ? 'Approve special rate' : 'Approve'}</Btn>
                <Btn variant="danger" disabled={!can.approve(s.role) || note.trim().length < 5} onClick={() => void decide(false)}>{rr?.status === 'pending' ? 'Reject special rate' : 'Reject'}</Btn>
                {!can.approve(s.role) && <span className="text-[13px] text-slate-500">A Credit Approver decides this.</span>}
              </div>
              {app.approval.by && <p className="text-[13px] text-slate-500">{app.approval.status} by {app.approval.by.slice(0, 8)} · {when(app.approval.at)}</p>}
            </div>)}
        </Card>
      </div>

      <Card title="Rental calculation" subtitle={`${num(app.facility.tenor)} monthly installments at ${agreed.toFixed(2)}% on ${lkr(d.financed)}${num(app.facility.lumpSum) ? ` with lump sum ${lkr(num(app.facility.lumpSum))}` : ''}`}>
        <div className="mb-4 grid gap-4 md:grid-cols-3">
          {([['Monthly rental', lkr(inst)], ['Total payable', lkr(total)], ['Total interest', lkr(total - d.financed)]] as const).map(([l, v]) => (
            <div key={l} className="glass rounded-xl px-4 py-3"><p className="text-[13px] text-slate-500">{l}</p><p className="mt-0.5 text-xl font-semibold">{v}</p></div>))}
        </div>
        <div className="overflow-x-auto rounded-xl border border-line/80"><table className="w-full text-sm tabular-nums">
          <thead className="bg-white/50 text-right text-[13px] text-slate-500"><tr>{['No.', 'Opening balance', 'Interest', 'Principal', 'Installment', 'Closing balance'].map((h, i) => <th key={h} className={clsx('px-4 py-2 font-medium', i === 0 && 'text-left')}>{h}</th>)}</tr></thead>
          <tbody>{shown.map(r => <tr key={r.n} className="border-t border-line/70 text-right"><td className="px-4 py-1.5 text-left">{r.n}</td>{[r.opening, r.interest, r.principal, r.installment, r.closing].map((v, i) => <td key={i} className="px-4 py-1.5">{fmt(v)}</td>)}</tr>)}</tbody>
        </table></div>
        {rows.length > 12 && <button className="mt-3 text-[13px] font-medium text-brand-600 hover:underline" onClick={() => setAll(!all)}>{all ? 'Show first 12' : `Show all ${rows.length} installments`}</button>}
        <p className="mt-3 text-xs text-slate-500">Reducing-balance convention. Confirm the lender's flat-rate, tax and residual conventions before use.</p>
      </Card>

      <Modal open={special} title="Special rate request" onClose={() => setSpecial(false)}>
        <div className="space-y-4">
          <NumberField label="Requested rate (% p.a.)" value={spRate} onChange={setSpRate} hint={`Must be below the AI rate of ${d.approvedRate.toFixed(2)}%. A credit approver decides.`} />
          <TextAreaField label="Reason" value={spWhy} onChange={setSpWhy} hint="At least 10 characters" />
          <div className="flex justify-end gap-2"><Btn variant="ghost" onClick={() => setSpecial(false)}>Cancel</Btn>
            <Btn disabled={!(Number(spRate) > 0 && Number(spRate) < d.approvedRate) || spWhy.trim().length < 10} onClick={() => void sendSpecial()}>Send for approval</Btn></div>
        </div>
      </Modal>
      <StepFooter app={app} step={5} blockers={blockers} showErrors={s.showErrors} onAttempt={() => s.setShowErrors(true)} />
    </div>
  )
}
