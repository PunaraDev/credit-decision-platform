import { useAuth } from '@/store/authStore'
import type { Role } from '@/types'

/** UI-level hints only. The workflow service enforces the same rules and is the authority. */
export const ROLES: Role[] = ['Administrator', 'Customer', 'Marketing Officer', 'Compliance Officer', 'Valuer', 'QA Officer', 'Credit Officer', 'Credit Approver', 'Operations Officer']
export const useRole = (): Role => useAuth(s => s.user?.role ?? 'Customer')

export const can = {
  edit: (r: Role, step: number): boolean => {
    if (r === 'Administrator') return true
    const map: Record<number, Role[]> = {
      1: ['Customer', 'Marketing Officer'], 2: ['Customer', 'Compliance Officer', 'Marketing Officer'],
      3: ['Marketing Officer', 'Valuer', 'QA Officer'], 4: ['Marketing Officer'],
      5: ['Marketing Officer', 'Credit Officer', 'Credit Approver'], 6: ['Marketing Officer', 'Operations Officer', 'Customer'],
      7: ['Operations Officer', 'Marketing Officer', 'Customer'],
    }
    return map[step]?.includes(r) ?? false
  },
  screening: (r: Role) => ['Administrator', 'Compliance Officer', 'Marketing Officer'].includes(r),
  adjudicate: (r: Role) => ['Administrator', 'Compliance Officer'].includes(r),
  customerSubmit: (r: Role) => ['Administrator', 'Customer', 'Marketing Officer'].includes(r),
  valuer: (r: Role) => ['Administrator', 'Valuer', 'Marketing Officer'].includes(r),
  qa: (r: Role) => ['Administrator', 'QA Officer'].includes(r),
  approve: (r: Role) => ['Administrator', 'Credit Approver'].includes(r),
  verifyDocs: (r: Role) => ['Administrator', 'Operations Officer'].includes(r),
  checker: (r: Role) => ['Administrator', 'Operations Officer', 'Marketing Officer'].includes(r),
  admin: (r: Role) => r === 'Administrator',
}
