import { STEPS, type AppRow } from '@/types'

/** What needs this role's attention right now. */
export function tasks(role: string, rows: AppRow[]): Array<{ row: AppRow; what: string; step: number }> {
  const t: Array<{ row: AppRow; what: string; step: number }> = []
  for (const r of rows) {
    const s = r.summary
    if (r.status === 'Completed' || r.status === 'Declined') continue
    if (['Compliance Officer', 'Administrator'].includes(role) && s.screening === 'review') t.push({ row: r, what: 'Possible screening match to adjudicate', step: 2 })
    if (['QA Officer', 'Administrator'].includes(role) && s.valuation === 'reported' && s.qa === 'pending') t.push({ row: r, what: 'Valuation awaiting QA', step: 3 })
    if (['Credit Approver', 'Administrator'].includes(role) && s.outcome && s.approval === 'pending') t.push({ row: r, what: `${s.outcome} awaiting approval`, step: 5 })
    if (['Operations Officer', 'Administrator'].includes(role) && s.docsPending > 0) t.push({ row: r, what: `${s.docsPending} document(s) to verify`, step: 7 })
    if (['Marketing Officer', 'Customer'].includes(role)) t.push({ row: r, what: `Continue at stage ${r.currentStep}: ${STEPS[r.currentStep - 1].title}`, step: r.currentStep })
  }
  return t
}

