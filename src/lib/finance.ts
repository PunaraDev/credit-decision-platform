import type { Application } from '@/types'

export const num = (v: string | number | undefined | null): number => {
  if (v === undefined || v === null || v === '') return 0
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}
export const lkr = (n: number, dp = 0) =>
  'LKR ' + n.toLocaleString('en-LK', { minimumFractionDigits: dp, maximumFractionDigits: dp })
export const fmt = (n: number, dp = 0) => n.toLocaleString('en-LK', { minimumFractionDigits: dp, maximumFractionDigits: dp })

/** Level instalment on a reducing-balance facility. balloon = residual / lump sum due at maturity. */
export function pmt(principal: number, annualRatePct: number, months: number, balloon = 0): number {
  if (months <= 0 || principal <= 0) return 0
  const r = annualRatePct / 1200
  if (r === 0) return (principal - balloon) / months
  const g = Math.pow(1 + r, months)
  return ((principal - balloon / g) * r) / (1 - 1 / g)
}

export interface ScheduleRow { n: number; opening: number; interest: number; principal: number; installment: number; closing: number }
export function schedule(principal: number, annualRatePct: number, months: number, balloon = 0): ScheduleRow[] {
  const r = annualRatePct / 1200
  const p = pmt(principal, annualRatePct, months, balloon)
  const rows: ScheduleRow[] = []
  let bal = principal
  for (let i = 1; i <= months; i++) {
    const interest = bal * r
    let prin = p - interest
    let inst = p
    if (i === months) { inst = p + balloon; prin = bal }
    const closing = Math.max(0, bal - prin)
    rows.push({ n: i, opening: bal, interest, principal: prin, installment: inst, closing })
    bal = closing
  }
  return rows
}

export function finalMarketValue(a: Application) {
  return Math.max(0, a.valuation.marketValue - a.valuation.deduction)
}
