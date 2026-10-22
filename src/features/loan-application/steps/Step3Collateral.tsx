import { useState } from 'react'
import { ClipboardCheck, Gauge } from 'lucide-react'
import { Badge, Btn, Card, CheckRow, Grid, Modal, NumberField, Notice, ReadField, SectionTitle, SelectField, TextAreaField, TextField, when } from '@/components/ui'
import FileField from '@/components/FileField'
import StepFooter from '@/components/StepFooter'
import { useStep } from '../useStep'
import { can } from '@/lib/permissions'
import { LISTS } from '@/lib/schemas'
import { fmt, finalMarketValue, num } from '@/lib/finance'
import type { Application, Collateral } from '@/types'

const REQUIRED: Array<[keyof Collateral, string]> = [
  ['vehicleNo', 'Vehicle number'], ['engineNo', 'Engine number'], ['chassisNo', 'Chassis number'], ['firstRegistration', 'First registration date'],
  ['make', 'Make'], ['model', 'Model'], ['yom', 'Year of manufacture'], ['engineCapacity', 'Engine capacity'], ['owner', 'Registered owner'], ['seller', 'Seller'],
]

export default function Step3({ app }: { app: Application }) {
  const s = useStep(app, 3)
  const k = app.collateral, v = app.valuation, qa = app.qa
  const [busy, setBusy] = useState(false)
  const [qaNote, setQaNote] = useState(qa.comment)
  const [ask, setAsk] = useState(false)
  const accepted = v.officerDecision === 'accepted'
  const missing = REQUIRED.filter(([f]) => !String(k[f]).trim()).map(([, l]) => `${l} is required`)
  const blockers = [
    ...missing,
    ...(!k.crAttached ? ['Attach the registration certificate (CR)'] : []),
    ...(!k.photosAttached ? ['Attach vehicle inspection photos'] : []),
    ...(k.encumbrance ? ['Resolve the registered encumbrance'] : []),
    ...(v.status !== 'reported' ? ['Valuation report has not been received'] : []),
    ...(v.status === 'reported' && !accepted ? ['Accept the valuation (Confirm submission)'] : []),
    ...(qa.status !== 'approved' ? ['Manual QA approval is pending'] : []),
  ]
  const setK = (f: keyof Collateral, val: string | boolean) => s.edit('collateral', { [f]: val })
  const T = (f: keyof Collateral, label: string, extra: { type?: string; span?: 2 } = {}) => (
    <TextField label={label} required value={String(k[f])} type={extra.type} onChange={x => setK(f, x)} error={s.showErrors && missing.some(m => m.startsWith(label)) ? 'Required' : undefined} />
  )

  async function valuate() { setBusy(true); await s.act.integration('valuation'); setBusy(false); setAsk(true) }
  const decide = async (accept: boolean) => { setAsk(false); await s.act.transition(accept ? 'valuation_accept' : 'valuation_reject', '', accept ? 'Record saved' : 'Valuation discarded') }
  const review = (status: 'approved' | 'rejected' | 'revaluation') =>
    s.act.transition({ approved: 'qa_approve', rejected: 'qa_reject', revaluation: 'qa_revaluation' }[status], qaNote, `Valuation ${status === 'approved' ? 'approved' : 'updated'}`)

  return (
    <div className="space-y-5">
      {s.readOnly && <Notice tone="warn" title="View only">Your current role cannot edit vehicle details. Valuation and QA actions below may still be available to you.</Notice>}
      <fieldset disabled={s.readOnly}>
        <Card title="Vehicle info">
          <SectionTitle>Identifiers</SectionTitle>
          <Grid cols={3}>{T('vehicleNo', 'Vehicle number')}{T('engineNo', 'Engine number')}{T('chassisNo', 'Chassis number')}
            {T('firstRegistration', 'First registration date', { type: 'date' })}
            <SelectField label="Vehicle category" options={LISTS.categories} value={k.vehicleCategory} onChange={x => setK('vehicleCategory', x)} />
            <SelectField label="Usage of vehicle" options={['Private', 'Hiring', 'Commercial']} value={k.usage} onChange={x => setK('usage', x)} /></Grid>
          <SectionTitle>Specifications</SectionTitle>
          <Grid cols={3}>
            <SelectField label="Asset type" options={['Motor Car', 'Van', 'Motor Cycle', 'Three Wheeler', 'SUV']} value={k.assetType} onChange={x => setK('assetType', x)} />
            <SelectField label="Asset condition" options={['Registered', 'Unregistered', 'Reconditioned']} value={k.condition} onChange={x => setK('condition', x)} />
            <SelectField label="Make" required options={LISTS.makes} value={k.make} onChange={x => setK('make', x)} error={s.showErrors && !k.make ? 'Required' : undefined} />
            {T('model', 'Model')}{T('yom', 'Year of manufacture')}{T('engineCapacity', 'Engine capacity')}
            <SelectField label="Fuel type" options={['Petrol', 'Diesel', 'Hybrid', 'Electric']} value={k.fuel} onChange={x => setK('fuel', x)} />
            <SelectField label="Transmission" options={['Automatic', 'Manual']} value={k.transmission} onChange={x => setK('transmission', x)} /></Grid>
          <SectionTitle>Ownership and evidence</SectionTitle>
          <Grid cols={3}>{T('owner', 'Registered owner')}{T('seller', 'Seller')}<div />
            <FileField appId={app.id} label="CR attachment" name={k.crFile ?? ''} fileId={k.crFileId} onChange={(n, id) => s.edit('collateral', { crFile: n, crFileId: id, crAttached: true })} />
            <FileField appId={app.id} label="Vehicle inspection photos" name={k.photosFile ?? ''} fileId={k.photosFileId} onChange={(n, id) => s.edit('collateral', { photosFile: n, photosFileId: id, photosAttached: true })} /></Grid>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <CheckRow checked={k.insured} onChange={x => setK('insured', x)} title="Vehicle is insured" desc="Comprehensive cover is required before disbursement." />
            <CheckRow checked={k.encumbrance} onChange={x => setK('encumbrance', x)} title="Existing encumbrance registered" desc="Must be cleared before the facility proceeds." />
          </div>
        </Card>
      </fieldset>

      <Card title="Valuation" subtitle="Request an independent valuation. Final market value = market value − approved deductions.">
        <Btn busy={busy} className="mb-4 w-full !py-2.5" disabled={!can.valuer(s.role) || !k.vehicleNo || !k.make || !k.yom || v.status === 'reported'} onClick={() => void valuate()}><Gauge className="h-4 w-4" />Get Market Value</Btn>
        {v.status === 'reported' && !accepted && (
          <div className="mb-4"><Notice tone="warn" title="Valuation awaiting your confirmation">
            <span className="mr-3">LKR {fmt(v.marketValue)} was returned by {v.valuer}.</span>
            <button className="font-medium text-brand-600 underline" onClick={() => setAsk(true)}>Review</button></Notice></div>)}
        {v.status === 'idle' && <Notice tone="info" title="No valuation yet">Complete the vehicle details, then request a valuation.</Notice>}
        {v.status === 'requested' && <Notice tone="info" title="Valuation requested">Waiting for the valuer's report.</Notice>}
        {v.status === 'reported' && (
          <>
            <p className="mb-4 text-[13px] text-slate-500">{v.valuer} · {v.reference} · Report date {v.reportDate}</p>
            <Grid cols={4}>
              <ReadField label="Market value (LKR)" value={fmt(v.marketValue)} />
              <NumberField label="Market value deduction (LKR)" value={String(v.deduction)} disabled={!can.valuer(s.role)} onChange={x => s.edit('valuation', { deduction: Math.min(num(x), v.marketValue) })} />
              <ReadField label="Final market value (LKR)" value={<strong>{fmt(finalMarketValue(app))}</strong>} />
              <ReadField label="Forced-sale value (LKR)" value={fmt(v.forcedSaleValue)} />
              <TextField label="Mileage (km)" value={v.mileage} disabled={!can.valuer(s.role)} onChange={x => s.edit('valuation', { mileage: x })} />
              <div className="md:col-span-3"><TextField label="Defects noted" value={v.defects} disabled={!can.valuer(s.role)} onChange={x => s.edit('valuation', { defects: x })} /></div>
            </Grid>
          </>)}
      </Card>

      <Card title="Manual QA" subtitle="Check asset identity, report evidence and any discrepancies"
        action={<Badge tone={qa.status === 'approved' ? 'ok' : qa.status === 'pending' ? 'warn' : 'bad'}>{qa.status === 'pending' ? 'Pending QA' : qa.status === 'approved' ? 'QA approved' : qa.status === 'rejected' ? 'QA rejected' : 'Revaluation requested'}</Badge>}>
        {v.status !== 'reported' || !accepted ? <p className="text-sm text-slate-500">QA opens once the valuation report is received and accepted by the officer.</p> : (
          <div className="space-y-3">
            <TextAreaField label="QA comment" value={qaNote} disabled={!can.qa(s.role)} onChange={setQaNote} hint="Required when rejecting or requesting revaluation" />
            <div className="flex flex-wrap items-center gap-2">
              <Btn variant="ok" disabled={!can.qa(s.role)} onClick={() => review('approved')}><ClipboardCheck className="h-4 w-4" />Approve valuation</Btn>
              <Btn variant="ghost" disabled={!can.qa(s.role) || qaNote.trim().length < 5} onClick={() => review('revaluation')}>Request revaluation</Btn>
              <Btn variant="danger" disabled={!can.qa(s.role) || qaNote.trim().length < 5} onClick={() => review('rejected')}>Reject</Btn>
              {!can.qa(s.role) && <span className="text-[13px] text-slate-500">Switch role to QA Officer to review.</span>}
            </div>
            {qa.reviewer && <p className="text-[13px] text-slate-500">Reviewed by {qa.reviewer} · {when(qa.reviewedAt)}</p>}
          </div>)}
      </Card>
      <Modal open={ask && v.status === 'reported' && !accepted} title="Confirm submission" onClose={() => setAsk(false)}>
        <p className="text-sm text-slate-700">Your facility received a market value of <strong>LKR {fmt(v.marketValue)}/=</strong>. Do you want to proceed with this valuation?</p>
        <p className="mt-2 text-[13px] text-slate-500">Choosing Cancel discards this valuation so you can request a new one.</p>
        <div className="mt-5 flex justify-end gap-2"><Btn variant="ghost" onClick={() => void decide(false)}>Cancel</Btn><Btn onClick={() => void decide(true)}>OK</Btn></div>
      </Modal>
      <StepFooter app={app} step={3} blockers={blockers} showErrors={s.showErrors} onAttempt={() => s.setShowErrors(true)} />
    </div>
  )
}
