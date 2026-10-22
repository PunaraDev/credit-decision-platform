import { http } from './http'
import type { AppRow, Product, ServerApplication } from '@/types'
import type { User } from '@/store/authStore'

const A = (id: string) => `/applications/${id}`
export const api = {
  list: () => http<AppRow[]>('GET', '/applications'),
  get: (id: string) => http<ServerApplication>('GET', A(id)),
  create: (product: Product) => http<ServerApplication>('POST', '/applications', { body: { product }, idem: crypto.randomUUID(), busy: true }),
  save: (method: 'PATCH' | 'POST', path: string, body: object) => http<ServerApplication>(method, path, { body }),
  integration: (id: string, name: string) => http<ServerApplication>('POST', `${A(id)}/integrations/${name}`, { busy: true }),
  transition: (id: string, action: string, comment = '', extra: object = {}) => http<ServerApplication>('POST', `${A(id)}/transitions`, { body: { action, comment, ...extra }, busy: true }),
  walr: (id: string) => http<Walr>('GET', `${A(id)}/walr`),
  assess: (id: string) => http<ServerApplication>('POST', `${A(id)}/assessments`, { busy: true }),
  document: (id: string, body: object) => http<ServerApplication>('POST', `${A(id)}/documents`, { body, busy: true }),
  timeline: (id: string) => http<Array<{ at: string; actor: string; role: string; action: string; detail: string }>>('GET', `${A(id)}/timeline`),
  upload: (id: string, file: File, label: string) => {
    const f = new FormData(); f.append('file', file); f.append('label', label)
    return http<{ id: string; name: string; size: number }>('POST', `${A(id)}/files`, { form: f, busy: 'Uploading your file. Please wait.' })
  },
  async download(fileId: string, name: string) {
    const res = await http<Response>('GET', `/files/${fileId}`, { raw: true, busy: 'Preparing your download.' })
    const url = URL.createObjectURL(await res.blob())
    const a = Object.assign(document.createElement('a'), { href: url, download: name }); a.click(); URL.revokeObjectURL(url)
  },
  mode: () => http<{ mode: 'mock' | 'live' }>('GET', '/integrations/mode'),
  policy: () => http<Record<string, unknown>>('GET', '/decisions/policy'),
  // identity
  users: () => http<User[]>('GET', '/auth/users'),
  createUser: (b: object) => http<User>('POST', '/auth/users', { body: b, busy: true }),
  updateUser: (id: string, b: object) => http<User>('PATCH', `/auth/users/${id}`, { body: b, busy: true }),
  securityLog: () => http<Array<{ at: string; username: string; outcome: string; ip: string }>>('GET', '/auth/security-log'),
  changePassword: (current: string, next: string) => http('POST', '/auth/change-password', { body: { current, new: next }, busy: true }),
  me: () => http<User>('GET', '/auth/me'),
  // customer review (public)
  review: (token: string) => http<ReviewData>('GET', `/public/review/${token}`, { auth: false }),
  confirmReview: (token: string, body: { confirm: boolean; cribConsent: boolean; screeningConsent: boolean; typedName: string }) => http('POST', `/public/review/${token}`, { body, auth: false, busy: true }),
}
export interface WalrCell { overall: number; rg: number; ur: number; count: number }
export interface Walr { currentMonth: { branch: WalrCell; zone: WalrCell }; last30Days: { branch: WalrCell; zone: WalrCell }; branch: string; zone: string }
export interface ReviewData {
  customerName: string; nic: string; mobile: string; address: string; employer: string; monthlyIncome: number; product: string; reference: string
  alreadyConfirmed: boolean
}
