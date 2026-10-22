import { blankApplication } from './defaults'
import type { Application, ServerApplication } from '@/types'

type Sec = Record<string, unknown>
const sec = (stages: ServerApplication['stages'], stage: string, key: string): Sec | undefined =>
  (stages[stage]?.[key] as Sec | undefined)

/** Server stores each stage as {stageName: {section: {...}}}. The UI works with flat sections. */
export function fromServer(sa: ServerApplication): Application {
  const d = blankApplication(sa.product)
  const st = sa.stages ?? {}
  const m = <K extends keyof Application>(k: K, stage: string, key: string) => ({ ...(d[k] as object), ...(sec(st, stage, key) ?? {}) }) as unknown as Application[K]
  return {
    ...d, id: sa.id, reference: sa.reference, product: sa.product, status: sa.status, createdAt: sa.createdAt,
    currentStep: sa.currentStep, completed: sa.completed,
    consent: m('consent', 'onboarding', 'consent'), customer: m('customer', 'onboarding', 'customer'),
    erp: m('erp', 'onboarding', 'erp'), crib: m('crib', 'onboarding', 'crib'),
    screening: m('screening', 'screening', 'screening'), cdd: m('cdd', 'screening', 'cdd'), fourN: m('fourN', 'screening', 'fourN'), submission: m('submission', 'screening', 'submission'),
    collateral: m('collateral', 'collateral', 'collateral'), valuation: m('valuation', 'collateral', 'valuation'), qa: m('qa', 'collateral', 'qa'),
    facility: m('facility', 'facility', 'facility'),
    decision: (sec(st, 'assessment', 'decision') as unknown as Application['decision']) ?? null, approval: m('approval', 'assessment', 'approval'),
    rate: (sec(st, 'assessment', 'rate') as unknown as Application['rate']) ?? null, rateRequest: (sec(st, 'assessment', 'rateRequest') as unknown as Application['rateRequest']) ?? null,
    supplier: m('supplier', 'confirmation', 'supplier'), confirmation: m('confirmation', 'confirmation', 'confirmation'),
    documents: ((st.documents?.documents as Application['documents'] | undefined) ?? d.documents), audit: [],
  }
}
