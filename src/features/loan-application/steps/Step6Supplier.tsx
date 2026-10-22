import { ShieldCheck, UserCheck, BadgeCheck } from 'lucide-react'
import { Badge, Btn, Card, CheckRow, Grid, Notice, NumberField, ReadField, SectionTitle, SelectField, TextField } from '@/components/ui'
import StepFooter from '@/components/StepFooter'
import { useStep } from '../useStep'
import { can } from '@/lib/permissions'
import { LISTS, supplierSchema, validate } from '@/lib/schemas'
import { fmt, lkr, num } from '@/lib/finance'
import type { Application, Supplier } from '@/types'

export default function Step6({ app }: { app: Application }) {
  const s = useStep(app, 6)
  const sp = app.supplier, c = app.confirmation, d = app.decision
  const errs = validate(supplierSchema, sp)
  const expected = num(app.facility.netFacility) + num(app.facility.downPayment)
  const priceMismatch = num(sp.purchasePrice) > 0 && num(sp.purchasePrice) !== expected
  const checks = sp.duplicateInvoiceCheck && sp.eligibilityCheck && sp.beneficiaryVerified
  const blockers = [
    ...Object.values(errs),
    ...(priceMismatch ? [`Purchase price must equal net facility plus down payment (${fmt(expected)})`] : []),
    ...(!checks ? ['Run the supplier checks'] : []),
    ...(!c.insurance ? ['Confirm insurance cover'] : []),
    ...(!c.customerAccepted ? ['Customer acceptance is missing'] : []),
    ...(!c.officerConfirmed ? ['Officer confirmation is missing'] : []),
  ]
  const set = (p: Partial<Supplier>) => s.edit('supplier', p)
  const e = (k: keyof Supplier) => (s.showErrors ? errs[k] : undefined)
  const T = (k: keyof Supplier, label: string, o: { type?: string; span?: 2 } = {}) => <TextField label={label} required value={String(sp[k])} type={o.type} span={o.span} onChange={x => set({ [k]: x })} error={e(k)} />

  return (
    <div className="stagger space-y-5">
      <fieldset disabled={s.readOnly}>
        <Card title="Supplier details">
          <SectionTitle>Identity</SectionTitle>
          <Grid cols={3}>{T('supplierId', 'Supplier ID')}{T('name', 'Registered name')}{T('regNo', 'Registration number')}{T('address', 'Address', { span: 2 })}{T('contact', 'Contact number')}</Grid>
          <SectionTitle>Beneficiary bank</SectionTitle>
          <Grid cols={3}><SelectField label="Bank" required options={LISTS.banks} value={sp.bank} onChange={x => set({ bank: x })} error={e('bank')} />{T('accountNo', 'Account number')}{T('accountName', 'Account holder name')}</Grid>
          <SectionTitle>Asset purchase</SectionTitle>
          <Grid cols={4}>{T('invoiceNo', 'Invoice / quotation number')}{T('invoiceDate', 'Invoice date', { type: 'date' })}
            <NumberField label="Purchase price (LKR)" required value={sp.purchasePrice} onChange={x => set({ purchasePrice: x })} error={e('purchasePrice') ?? (priceMismatch ? 'Does not match facility plus down payment' : undefined)} />
            {T('deliveryDate', 'Delivery date', { type: 'date' })}</Grid>
          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl bg-[#FAF9F5] px-4 py-3">
            <Btn variant="ghost" disabled={!['Administrator', 'Operations Officer', 'Marketing Officer'].includes(s.role)} onClick={() => void s.act.transition('run_supplier_checks', '', 'Supplier checks passed')}><ShieldCheck className="h-4 w-4" />Run supplier checks</Btn>
            {([['Duplicate invoice', sp.duplicateInvoiceCheck], ['Supplier eligibility', sp.eligibilityCheck], ['Beneficiary account', sp.beneficiaryVerified]] as const).map(([l, ok]) => <Badge key={l} tone={ok ? 'ok' : 'neutral'}>{l}: {ok ? 'passed' : 'not run'}</Badge>)}
          </div>
        </Card>
      </fieldset>

      <Card title="Facility confirmation" subtitle="Approved terms are read-only. Any material change sends the application back for reassessment.">
        {d && <Grid cols={4}>
          <ReadField label="Approved facility" value={lkr(d.financed)} /><ReadField label="Agreed rate" value={`${(app.rate?.rate ?? d.approvedRate).toFixed(2)}% p.a.${app.rate?.mode === 'special' ? ' (special rate)' : ''}`} /><ReadField label="Tenor" value={`${app.facility.tenor} months`} />
          <ReadField label="Monthly rental" value={lkr(app.rate?.installment ?? d.installment)} /><ReadField label="Down payment" value={lkr(num(app.facility.downPayment))} /><ReadField label="Capitalized charges" value={lkr(num(app.facility.capitalizedCharges))} />
          <ReadField label="Lump sum" value={lkr(num(app.facility.lumpSum))} /><ReadField label="Agreement version" value={c.agreementVersion} />
        </Grid>}
        {!d && <Notice tone="warn">No approved decision found.</Notice>}
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <CheckRow checked={c.insurance} disabled={s.readOnly} onChange={x => s.edit('confirmation', { insurance: x })} title="Comprehensive insurance arranged" desc="Lender noted as interested party." />
          <div className="rounded-xl border border-line p-4"><p className="mb-1 text-sm font-medium">Customer acceptance</p>
            {c.customerAccepted ? <div className="animate-fade-in"><Badge tone="ok">Accepted</Badge><p className="mt-1 text-[13px] text-slate-500">via {c.acceptanceChannel}</p></div> : <>
              <SelectField label="Channel" options={['Branch', 'Digital', 'Phone']} value={c.acceptanceChannel} onChange={x => s.edit('confirmation', { acceptanceChannel: x })} />
              <Btn className="mt-2" disabled={!can.customerSubmit(s.role) || !d} onClick={() => void s.act.transition('customer_accept', '', 'Customer acceptance recorded')}><UserCheck className="h-4 w-4" />Record acceptance</Btn></>}</div>
          <div className="rounded-xl border border-line p-4"><p className="mb-1 text-sm font-medium">Officer confirmation</p>
            {c.officerConfirmed ? <div className="animate-fade-in"><Badge tone="ok">Confirmed</Badge></div> : <>
              <p className="mb-2 text-[13px] text-slate-500">Maker-checker: the checker must be a different user from the person who created the application.</p>
              <Btn disabled={!can.checker(s.role) || !d} onClick={() => void s.act.transition('officer_confirm', '', 'Confirmed')}><BadgeCheck className="h-4 w-4" />Confirm as checker</Btn></>}</div>
        </div>
      </Card>
      <StepFooter app={app} step={6} blockers={blockers} showErrors={s.showErrors} onAttempt={() => s.setShowErrors(true)} />
    </div>
  )
}
