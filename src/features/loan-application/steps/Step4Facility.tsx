import { Bot } from 'lucide-react'
import { Card, Grid, NumberField, Notice, ReadField, SelectField, TextField } from '@/components/ui'
import StepFooter from '@/components/StepFooter'
import { useStep } from '../useStep'
import { facilitySchema, validate, LISTS } from '@/lib/schemas'
import { fmt, finalMarketValue, num } from '@/lib/finance'
import type { Application, Facility } from '@/types'

export default function Step4({ app }: { app: Application }) {
  const s = useStep(app, 4)
  const f = app.facility
  const errs = validate(facilitySchema, f)
  const extra: string[] = [
    ...(f.guarantor === 'Yes' && (!f.guarantorName || !f.guarantorNic) ? ['Enter guarantor name and NIC'] : []),
    ...(f.jointClient === 'Yes' && (!f.jointName || !f.jointNic) ? ['Enter joint client name and NIC'] : []),
    ...(num(f.downPayment) >= finalMarketValue(app) ? ['Down payment must be below the final market value'] : []),
    ...(f.product === 'Vehicle Loan' && num(f.lumpSum) > 0 ? ['Lump sum is only supported on leases'] : []),
  ]
  const blockers = [...Object.values(errs), ...extra]
  const set = (p: Partial<Facility>) => s.edit('facility', p)
  const e = (k: keyof Facility) => (s.showErrors ? errs[k] : undefined)

  return (
    <div className="space-y-5">
      {s.readOnly && <Notice tone="warn" title="View only">Your current role cannot edit the facility.</Notice>}
      <Card title="Approved references" subtitle="Read-only values carried from earlier stages; edit them where they were captured">
        <Grid cols={3}>
          <ReadField label="Final market value (LKR)" value={fmt(finalMarketValue(app))} /><ReadField label="Verified monthly net income (LKR)" value={fmt(num(app.customer.netIncome))} />
          <ReadField label="Vehicle" value={`${app.collateral.make} ${app.collateral.model} (${app.collateral.yom})`} />
        </Grid>
      </Card>
      <fieldset disabled={s.readOnly}>
        <Card title="Facility info">
          <Grid cols={3}>
            <SelectField label="Product" options={['Vehicle Lease', 'Vehicle Loan']} value={f.product} onChange={x => set({ product: x as Facility['product'], lumpSum: x === 'Vehicle Loan' ? '0' : f.lumpSum })} />
            <SelectField label="Scheme" options={['Other Lease - Fixed - Individual', 'Other Lease - Floating - Individual', 'Vehicle Loan - Fixed - Individual', 'Vehicle Loan - Floating - Individual']} value={f.scheme} onChange={x => set({ scheme: x })} />
            <SelectField label="Repayment frequency" options={['Monthly']} value={f.repaymentFrequency} onChange={x => set({ repaymentFrequency: x })} />
            <SelectField label="Customer sector" required options={LISTS.sectors} value={f.sector} onChange={x => set({ sector: x })} error={e('sector')} />
            <SelectField label="Customer sub sector" required options={LISTS.subSectors} value={f.subSector} onChange={x => set({ subSector: x })} error={e('subSector')} />
            <div />
            <SelectField label="Facility purpose" required options={LISTS.purposes} value={f.purpose} onChange={x => set({ purpose: x })} error={e('purpose')} />
            <SelectField label="Facility sub purpose" required options={LISTS.subPurposes} value={f.subPurpose} onChange={x => set({ subPurpose: x })} error={e('subPurpose')} />
          </Grid>
          <div className="mt-4"><Grid cols={4}>
            <NumberField label="Net facility (LKR)" required value={f.netFacility} onChange={x => set({ netFacility: x })} error={e('netFacility')} />
            <NumberField label="Tenor (months)" required value={f.tenor} onChange={x => set({ tenor: x })} error={e('tenor')} />
            <NumberField label="Down payment (LKR)" value={f.downPayment} onChange={x => set({ downPayment: x })} />
            <NumberField label="Capitalized charges total (LKR)" value={f.capitalizedCharges} onChange={x => set({ capitalizedCharges: x })} />
            <NumberField label="Lump sum amount (LKR)" value={f.lumpSum} disabled={f.product === 'Vehicle Loan'} onChange={x => set({ lumpSum: x })} hint={f.product === 'Vehicle Loan' ? 'Leases only' : 'Balloon due at maturity'} />
            <NumberField label="Requesting rate (%)" required value={f.requestedRate} onChange={x => set({ requestedRate: x })} error={e('requestedRate')} hint="A request only, not an approval" />
            <SelectField label="VAT" options={['Yes', 'No']} value={f.vat} onChange={x => set({ vat: x as Facility['vat'] })} />
            <SelectField label="Do you have a joint client?" options={['Yes', 'No']} value={f.jointClient} onChange={x => set({ jointClient: x as Facility['jointClient'] })} />
            <SelectField label="Do you have a guarantor?" options={['Yes', 'No']} value={f.guarantor} onChange={x => set({ guarantor: x as Facility['guarantor'] })} />
          </Grid></div>
          {f.jointClient === 'Yes' && <div className="mt-4"><Grid cols={3}>
            <TextField label="Joint client name" required value={f.jointName} onChange={x => set({ jointName: x })} /><TextField label="Joint client NIC" required value={f.jointNic} onChange={x => set({ jointNic: x })} /></Grid></div>}
          {f.guarantor === 'Yes' && <div className="mt-4"><Grid cols={3}>
            <TextField label="Guarantor name" required value={f.guarantorName} onChange={x => set({ guarantorName: x })} /><TextField label="Guarantor NIC" required value={f.guarantorNic} onChange={x => set({ guarantorNic: x })} /></Grid></div>}
        </Card>
      </fieldset>
      <StepFooter app={app} step={4} blockers={blockers} showErrors={s.showErrors} onAttempt={() => s.setShowErrors(true)} nextLabel="Continue with risk-based pricing" nextVariant="ok" nextIcon={<Bot className="h-4 w-4" />} />
    </div>
  )
}
