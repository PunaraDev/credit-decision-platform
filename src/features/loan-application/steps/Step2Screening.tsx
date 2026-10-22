import { useEffect, useState } from 'react'
import { Copy, ExternalLink, Link2, Lock, Mail, RefreshCw, Send, ShieldAlert, ShieldCheck, Smartphone, type LucideIcon } from 'lucide-react'
import { Badge, Btn, Card, Grid, Notice, ReadField, SelectField, TextAreaField, TextField, when } from '@/components/ui'
import StepFooter from '@/components/StepFooter'
import { useStep } from '../useStep'
import { can } from '@/lib/permissions'
import { fmt } from '@/lib/finance'
import { toast } from '@/store/toastStore'
import type { Application, Cdd } from '@/types'

const mark = (v?: string) => v === 'clear' ? <Badge tone="ok">Clear</Badge> : v === 'match' ? <Badge tone="bad">Possible match</Badge> : <Badge>Not run</Badge>

export default function Step2({ app }: { app: Application }) {
  const s = useStep(app, 2)
  const [busy, setBusy] = useState<string | null>(null)
  const [adj, setAdj] = useState('')
  const sc = app.screening, cdd = app.cdd, crib = app.crib, fourN = app.fourN
  const canRun = can.screening(s.role)
  // The customer's permission for the CRIB inquiry and customer screening, given only through the secure link. The server enforces the same rule.
  const permitted = fourN.status === 'submitted' && app.submission.submitted && !!app.consent.cribInquiry && !!app.consent.screeningCheck && !!app.consent.customerConsentAt
  const cribRun = crib.status === 'HIT' || crib.status === 'NO_HIT'

  // While the customer has not yet opened and submitted the link, check for the response every few seconds.
  useEffect(() => {
    if (fourN.status !== 'sent') return
    const t = setInterval(() => { void s.act.reload() }, 6000)
    return () => clearInterval(t)
  }, [fourN.status]) // eslint-disable-line react-hooks/exhaustive-deps

  const blockers = [
    ...(!permitted ? [fourN.status === 'sent' ? 'Waiting for the customer to give permission and submit through the link' : 'Send the secure link so the customer can give permission for CRIB and screening'] : []),
    ...(!cribRun ? ['Run the CRIB inquiry'] : []),
    ...(sc.status !== 'clear' ? ['Screening must be clear (run it, and adjudicate any match)'] : []),
    ...(!cdd.sourceOfIncome || !cdd.transactionPurpose || !cdd.riskClass ? ['Complete CDD: source of income, purpose and risk class'] : []),
  ]
  const run = async (key: string, fn: () => Promise<unknown>) => { setBusy(key); await fn(); setBusy(null) }
  const locked = (what: string) => !permitted && <p className="mt-3 flex items-center gap-1.5 text-[13px] text-warn-500"><Lock className="h-3.5 w-3.5" />{what} stays locked until the customer gives permission through the link above.</p>

  return (
    <div className="stagger space-y-5">
      <Card title="KYC status" subtitle="Summary of the identity data captured on stage 1">
        <Grid cols={4}>
          <ReadField label="Customer" value={app.customer.fullName} /><ReadField label="NIC" value={app.customer.nic} />
          <ReadField label="ERP" value={app.erp.status === 'found' ? `Existing · ${app.erp.customerId}` : 'New customer'} />
          <ReadField label="Privacy and identity consents" value={app.consent.capturedAt ? `Captured ${when(app.consent.capturedAt)}` : 'Recorded'} />
        </Grid>
        {app.erp.status === 'found' && (app.erp.existingFacilities ?? 0) > 0 && <div className="mt-4"><Notice tone="warn" title="Existing facilities found">{app.erp.existingFacilities} active facilities are linked to this customer. Review for duplicates and combined exposure.</Notice></div>}
      </Card>

      <Card title="Customer permission" subtitle="The secure link is sent to the customer by email and text message after stage 1. The customer must submit it before CRIB and screening can be run.">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-line p-4">
            <p className="mb-2 text-sm font-medium">1. Send secure link</p>
            <p className="mb-3 text-[13px] text-slate-600">Sent to the customer’s email and mobile number from stage 1.</p>
            <Btn variant="ghost" busy={busy === '4n'} disabled={permitted || !canRun || (!app.customer.email && !app.customer.mobile)} onClick={() => void run('4n', () => s.act.integration('fourn'))}><Send className="h-4 w-4" />{fourN.link ? 'Send again with new link' : 'Send link'}</Btn>
            <div className="mt-3 space-y-2">
              <DeliveryRow icon={Mail} label="Email" to={app.customer.email} d={fourN.emailDelivery} />
              <DeliveryRow icon={Smartphone} label="Mobile (SMS)" to={app.customer.mobile} d={fourN.smsDelivery} />
            </div>
            {fourN.link && (
              <div className="mt-3 animate-fade-in rounded-lg bg-[#FAF9F5] p-3 text-[13px]"><p className="break-all text-slate-700"><Link2 className="mr-1 inline h-3.5 w-3.5" />{fourN.link}</p>
                <p className="mt-1 text-slate-500">Expires {when(fourN.expiresAt)}. Each resend replaces the previous link.</p>
                <div className="mt-2 flex gap-2"><button className="flex items-center gap-1 text-brand-600 hover:underline" onClick={() => { void navigator.clipboard.writeText(fourN.link!); toast.ok('Link copied') }}><Copy className="h-3.5 w-3.5" />Copy</button>
                  <a className="flex items-center gap-1 text-brand-600 hover:underline" href={fourN.link} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" />Open</a></div></div>)}
          </div>
          <div className="rounded-xl border border-line p-4">
            <p className="mb-2 text-sm font-medium">2. Customer permission</p>
            {permitted ? (
              <div className="animate-fade-in space-y-2">
                <div className="flex items-center justify-between text-sm">CRIB inquiry<Badge tone="ok">Allowed</Badge></div>
                <div className="flex items-center justify-between text-sm">Customer screening<Badge tone="ok">Allowed</Badge></div>
                <p className="text-[13px] text-slate-600">Signed by {fourN.confirmedBy ?? app.consent.customerConsentBy}<br />{when(fourN.confirmedAt ?? app.consent.customerConsentAt)}</p>
              </div>)
              : fourN.status === 'sent' ? <div><Badge tone="info">Waiting for customer</Badge><p className="mt-2 text-[13px] text-slate-500">Checking automatically.</p><button className="mt-2 flex items-center gap-1 text-[13px] text-brand-600 hover:underline" onClick={() => void s.act.reload()}><RefreshCw className="h-3.5 w-3.5" />Check now</button></div>
              : <p className="text-[13px] text-slate-500">Create the link first.</p>}
          </div>
          <div className="rounded-xl border border-line p-4">
            <p className="mb-2 text-sm font-medium">3. Customer submission</p>
            {app.submission.submitted ? <div className="animate-fade-in"><Badge tone="ok">Submitted</Badge><p className="mt-2 text-[13px] text-slate-600">Snapshot {app.submission.snapshotId}<br />{when(app.submission.submittedAt)}</p></div>
              : <p className="text-[13px] text-slate-500">Pending. This happens when the customer submits the link.</p>}
          </div>
        </div>
        <div className="mt-4">
          {permitted
            ? <Notice tone="ok" title="The customer has submitted">You can now run the CRIB inquiry and customer screening, complete CDD and continue the application.</Notice>
            : <Notice tone="warn" title="Waiting for the customer">CRIB and customer screening cannot be run until the customer has given permission and submitted.</Notice>}
        </div>
      </Card>

      <Card title="Customer screening" subtitle="Sanctions, PEP, adverse media and internal watchlists"
        action={<Btn variant="ghost" busy={busy === 'screen'} disabled={!permitted || !canRun} onClick={() => void run('screen', () => s.act.integration('screening', 'Screening complete'))}><ShieldAlert className="h-4 w-4" />{sc.ranAt ? 'Re-run' : 'Run screening'}</Btn>}>
        <div className="grid gap-3 md:grid-cols-4">
          {[['Sanctions', sc.sanctions], ['PEP', sc.pep], ['Adverse media', sc.adverseMedia], ['Internal watchlist', sc.internalWatchlist]].map(([l, v]) => (
            <div key={l} className="flex items-center justify-between rounded-lg border border-line px-3 py-2.5 text-sm">{l}{mark(v)}</div>))}
        </div>
        {locked('Screening')}
        {sc.status === 'review' && (
          <div className="mt-4 space-y-3 animate-scale-in"><Notice tone="warn" title="Possible match needs adjudication">A compliance officer must record the reason before the match can be cleared.</Notice>
            <TextAreaField label="Adjudication note" value={adj} disabled={!can.adjudicate(s.role)} onChange={setAdj} hint="At least 10 characters" />
            <Btn variant="ok" disabled={!can.adjudicate(s.role) || adj.trim().length < 10} onClick={() => void s.act.transition('adjudicate_screening', adj, 'Match cleared')}>Clear match</Btn></div>)}
      </Card>

      <Card title="CRIB report" subtitle="Bureau data is shown as returned. It is kept separate from the internal AI score."
        action={<Btn variant="ghost" busy={busy === 'crib'} disabled={!permitted || !canRun || !app.customer.nic} onClick={() => void run('crib', () => s.act.integration('crib', 'CRIB inquiry complete'))}><ShieldCheck className="h-4 w-4" />{cribRun ? 'Re-run inquiry' : 'Run CRIB inquiry'}</Btn>}>
        {!cribRun ? <>
          <Notice tone="info" title="CRIB inquiry not run yet">{permitted ? 'Run the inquiry to get the bureau result.' : 'The customer must give permission through the secure link first.'}</Notice>
          {locked('The CRIB inquiry')}</> : (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              {([['Help ID', crib.helpId], ['Status', crib.status === 'NO_HIT' ? 'NO HIT' : crib.status], ['Loan / lease commitment (LKR)', fmt(crib.commitment ?? 0)], ['Bureau score', crib.score ?? 'n/a']] as const).map(([l, v]) => (
                <div key={l}><p className="mb-1 text-[13px] text-slate-600">{l}</p><div className="rounded-lg border border-yellow-300 bg-yellow-100 px-3 py-2 text-sm font-medium">{v}</div></div>))}
            </div>
            <p className="mt-3 text-[13px] text-slate-500">Report date {crib.reportDate} · Arrears {crib.arrears ? 'reported' : 'none reported'}.</p>
            {crib.status === 'NO_HIT' && <div className="mt-3"><Notice tone="warn" title="No bureau hit">A no-hit result is not proof of low risk.</Notice></div>}
          </>)}
      </Card>

      <fieldset disabled={s.readOnly}>
        <Card title="Customer due diligence (CDD)">
          <Grid cols={3}>
            <SelectField label="Source of income" required options={['Salary', 'Business income', 'Professional fees', 'Pension', 'Remittances']} value={cdd.sourceOfIncome} onChange={v => s.edit('cdd', { sourceOfIncome: v })} />
            <SelectField label="Purpose of facility" required options={['Personal vehicle', 'Business vehicle', 'Fleet replacement']} value={cdd.transactionPurpose} onChange={v => s.edit('cdd', { transactionPurpose: v })} />
            <TextField label="Expected monthly account activity (LKR)" value={cdd.expectedMonthlyActivity} onChange={v => s.edit('cdd', { expectedMonthlyActivity: v.replace(/[^0-9]/g, '') })} />
            <SelectField label="Customer risk class" required options={['Low', 'Medium', 'High']} value={cdd.riskClass} onChange={v => s.edit('cdd', { riskClass: v as Cdd['riskClass'] })} />
            <div className="md:col-span-2"><TextAreaField label="Notes" value={cdd.notes} onChange={v => s.edit('cdd', { notes: v })} /></div>
          </Grid>
          {cdd.riskClass === 'High' && <div className="mt-4"><Notice tone="warn" title="Enhanced due diligence">High-risk customers need source-of-funds evidence and senior compliance sign-off.</Notice></div>}
        </Card>
      </fieldset>

      <StepFooter app={app} step={2} blockers={blockers} showErrors={s.showErrors} onAttempt={() => s.setShowErrors(true)} />
    </div>
  )
}

type Delivery = { status: string; recipient?: string; sentAt?: string; message?: string }

/** One sending channel for the customer's link: where it went and whether it was accepted. */
function DeliveryRow({ icon: Icon, label, to, d }: { icon: LucideIcon; label: string; to?: string; d?: Delivery }) {
  const tone = !d ? undefined : d.status === 'sent' ? 'ok' : d.status === 'pending' ? 'info' : 'warn'
  const text = !d ? 'Not sent yet' : d.status === 'sent' ? 'Sent' : d.status === 'pending' ? 'Sending' : d.status === 'simulated' ? 'Not delivered (sandbox)' : 'Not sent'
  return (
    <div className="rounded-lg border border-line p-3 text-[13px]">
      <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-1.5 font-medium"><Icon className="h-3.5 w-3.5" />{label}</span><Badge tone={tone}>{text}</Badge></div>
      <p className="mt-1 break-all text-slate-600">{d?.recipient || to || 'Not entered on stage 1'}</p>
      {d && d.status !== 'pending' && d.message && <p className="mt-1 text-slate-500">{d.status === 'sent' && d.sentAt ? `${when(d.sentAt)}. ` : ''}{d.message}</p>}
    </div>
  )
}
