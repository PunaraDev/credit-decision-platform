import { useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { Badge, Btn, Card, CheckRow, Grid, Notice, ReadField, SectionTitle, SelectField, TextField, NumberField, when } from '@/components/ui'
import FileField from '@/components/FileField'
import StepFooter from '@/components/StepFooter'
import { useStep } from '../useStep'
import { customerSchema, validate, LISTS, PROVINCE_OF } from '@/lib/schemas'
import type { Application, Consent, Customer } from '@/types'

const CONSENTS: Array<{ k: keyof Consent; title: string; desc: string; required: boolean }> = [
  { k: 'privacyNotice', title: 'Privacy notice acknowledged', desc: 'Notice version, channel and timestamp are recorded as evidence.', required: true },
  { k: 'dataProcessing', title: 'Personal data processing', desc: 'Customer agrees to processing for credit assessment and servicing.', required: true },
  { k: 'identityVerification', title: 'Identity verification authorization', desc: 'Permits NIC and identity checks against authorized sources.', required: true },
  { k: 'thirdPartySharing', title: 'Third-party data sharing (optional)', desc: 'Sharing with named partners such as insurers, where policy allows.', required: false },
]

export default function Step1({ app }: { app: Application }) {
  const s = useStep(app, 1)
  const c = app.customer
  const errs = validate(customerSchema, c)
  const [busy, setBusy] = useState<'erp' | null>(null)
  const nicOk = !errs.nic

  const consentOk = CONSENTS.filter(x => x.required).every(x => app.consent[x.k])
  const blockers = [
    ...(!consentOk ? ['Record all required consents'] : []),
    ...Object.values(errs),
    ...(app.erp.status === 'idle' || app.erp.status === 'searching' ? ['Run the ERP customer search'] : []),
  ]

  const live = useRef({ c, errs, s })
  live.current = { c, errs, s }
  const { F, Sel, Num, File } = useMemo(() => ({
    F: ({ k, label, ...p }: { k: keyof Customer; label: string; type?: string; span?: 2 | 3; required?: boolean; hint?: string }) => {
      const { c, errs, s } = live.current
      return <TextField label={label} required={p.required ?? true} value={c[k] ?? ''} type={p.type} span={p.span} hint={p.hint}
        onChange={v => s.edit('customer', { [k]: v })} error={s.showErrors ? errs[k] : undefined} />
    },
        Sel: ({ k, label, options, required = true }: { k: keyof Customer; label: string; options: string[]; required?: boolean }) => {
      const { c, errs, s } = live.current
      return <SelectField label={label} required={required} options={options} value={c[k] ?? ''} onChange={v => s.edit('customer', { [k]: v })} error={s.showErrors ? errs[k] : undefined} />
    },
    Num: ({ k, label }: { k: keyof Customer; label: string }) => {
      const { c, errs, s } = live.current
      return <NumberField label={label} required value={c[k] ?? ''} onChange={v => s.edit('customer', { [k]: v })} error={s.showErrors ? errs[k] : undefined} />
    },
    File: ({ k, label }: { k: 'idFront' | 'idBack' | 'addressProof' | 'incomeProof'; label: string }) => {
      const { c, errs, s } = live.current
      return <FileField appId={app.id} label={label} name={c[k]} fileId={c[`${k}FileId`]} error={s.showErrors ? errs[k] : undefined}
        onChange={(n, id) => s.edit('customer', { [k]: n, [`${k}FileId`]: id })} />
    },
  }), [app.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function doErp() { setBusy('erp'); await s.act.integration('erp', 'ERP search complete'); setBusy(null) }
  const setConsent = (k: keyof Consent, v: boolean) => {
    const next = { ...app.consent, [k]: v }
    const ok = CONSENTS.filter(x => x.required).every(x => next[x.k])
    s.edit('consent', { [k]: v, capturedAt: ok ? new Date().toISOString() : undefined })
  }

  return (
    <div className="space-y-5">
      {s.readOnly && <Notice tone="warn" title="View only">Your current role cannot edit this stage.</Notice>}
      <Card title="Client info" subtitle="Fetched from the ERP when the client already exists">
        <Grid cols={4}>
          <ReadField label="Client code" value={app.erp.clientCode ?? 'Auto-generated on approval'} />
          <ReadField label="Application type" value={<span className="text-bad-500">NORMAL</span>} />
          <ReadField label="Client type" value={<span className="text-bad-500">INDIVIDUAL</span>} />
          <ReadField label="ERP" value={app.erp.status === 'found' ? `Existing · ${app.erp.existingFacilities ?? 0} facilities` : app.erp.status === 'new' ? 'New client' : 'Not searched'} />
        </Grid>
      </Card>
      <fieldset disabled={s.readOnly} className="space-y-5">
        <Card title="Consent and authorization" subtitle="Record before any personal data is processed. Permission for the CRIB inquiry and screening is given by the customer through a secure link on the next stage"
          action={app.consent.capturedAt ? <Badge tone="ok">Captured {when(app.consent.capturedAt)}</Badge> : <Badge tone="warn">Required</Badge>}>
          <div className="grid gap-3 md:grid-cols-2">
            {CONSENTS.map(x => <CheckRow key={x.k} checked={Boolean(app.consent[x.k])} onChange={v => setConsent(x.k, v)} title={x.title} desc={x.desc} />)}
          </div>
          <div className="mt-4 max-w-xs"><SelectField label="Consent channel" options={['Branch', 'Digital', 'Phone']} value={app.consent.channel} onChange={v => s.edit('consent', { channel: v as Consent['channel'] })} /></div>
        </Card>

        <Card title="Customer KYC and basic details">
          <SectionTitle>Identity</SectionTitle>
          <Grid cols={3}>
            <SelectField label="Customer type" options={['Individual']} value={c.customerType} onChange={() => undefined} hint="Business customers are added in a later release" />
            <F k="fullName" label="Full legal name" span={2} /><F k="initials" label="Initials" />
            <F k="nic" label="NIC number" hint="9 digits + V/X, or 12 digits" /><F k="dob" label="Date of birth" type="date" />
            <Sel k="gender" label="Gender" options={['Female', 'Male', 'Other']} />
          </Grid>
          <SectionTitle>Contact and household</SectionTitle>
          <Grid cols={3}>
            <F k="mobile" label="Mobile number" hint="The secure review link is sent to this number by text message when you save and continue to stage 2." /><F k="email" label="Email" required={false} type="email" hint="The secure review link is also emailed here." /><SelectField label="Preferred language" options={['English', 'Sinhala', 'Tamil']} value={c.language} onChange={v => s.edit('customer', { language: v })} />
            <F k="address" label="Residential address" span={3} />
            <SelectField label="District" required options={LISTS.districts} value={c.district} onChange={v => s.edit('customer', { district: v, province: PROVINCE_OF[v] ?? c.province })} error={s.showErrors ? errs.district : undefined} /><Sel k="province" label="Province" options={LISTS.provinces} /><Sel k="residenceType" label="Residence type" options={LISTS.residence} />
            <Sel k="maritalStatus" label="Marital status" options={LISTS.marital} required={false} /><F k="dependents" label="Dependents" required={false} type="number" />
          </Grid>
          <SectionTitle>Employment and finances (monthly, LKR)</SectionTitle>
          <Grid cols={3}>
            <Sel k="employmentStatus" label="Employment status" options={LISTS.employment} /><F k="employer" label="Employer / business" /><F k="designation" label="Designation" required={false} />
            <Num k="yearsOfService" label="Years of service" /><Num k="grossIncome" label="Gross monthly income" /><Num k="netIncome" label="Net monthly income (verified)" />
            <Num k="monthlyExpenses" label="Monthly expenses" /><Num k="existingObligations" label="Existing obligations (declared)" />
          </Grid>
          <SectionTitle>Bank account</SectionTitle>
          <Grid cols={3}><Sel k="bank" label="Bank" options={LISTS.banks} /><F k="branch" label="Branch" required={false} /><F k="accountNo" label="Account number" /></Grid>
          <SectionTitle>Identity and income evidence</SectionTitle>
          <Grid cols={4}><File k="idFront" label="NIC front" /><File k="idBack" label="NIC back" /><File k="addressProof" label="Address proof" /><File k="incomeProof" label="Payslips / statements" /></Grid>
        </Card>

        <Card title="ERP customer search" subtitle="Existing-customer lookup">
          <div className="rounded-md border border-line p-4 md:max-w-md">
            <div className="mb-3 flex items-center justify-between"><p className="text-sm font-medium">ERP customer search</p>
              {app.erp.status === 'found' && <Badge tone="info">Existing customer</Badge>}{app.erp.status === 'new' && <Badge tone="ok">New customer</Badge>}</div>
            <Btn variant="ghost" busy={busy === 'erp'} disabled={!nicOk || s.readOnly} onClick={doErp}><Search className="h-4 w-4" />Search by NIC</Btn>
            {app.erp.status === 'found' && <p className="mt-3 text-[13px] text-slate-600">Customer ID {app.erp.customerId}. {app.erp.existingFacilities} existing facilities linked.</p>}
            {app.erp.status === 'new' && <p className="mt-3 text-[13px] text-slate-600">No match in ERP. A customer record will be created on submission.</p>}
          </div>
          <div className="mt-4"><Notice tone="info" title="CRIB and customer screening come next">On the next stage you send the customer a secure link. The CRIB inquiry and screening can only be run after the customer gives permission and submits.</Notice></div>
        </Card>
      </fieldset>
      <StepFooter app={app} step={1} blockers={blockers} showErrors={s.showErrors} onAttempt={() => s.setShowErrors(true)} />
    </div>
  )
}
// ReadField is re-exported for steps that show frozen customer data
export { ReadField }
