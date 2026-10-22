import { create } from 'zustand'
import type { Role } from '@/types'

export interface User { id: string; username: string; fullName: string; email: string; role: Role; isActive: boolean; mustChangePassword: boolean; lastLogin?: string; branch?: string; zone?: string }
const KEY = 'originiq.session'

interface Auth {
  token: string | null; user: User | null; expiredNotice: boolean
  setSession: (token: string, user: User) => void
  setUser: (u: User) => void
  clear: () => void
  expire: () => void
}
const saved = (() => { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null') as { token: string; user: User } | null } catch { return null } })()

/** Session lives in sessionStorage (cleared when the tab closes). The server can also revoke it at any time. */
export const useAuth = create<Auth>((set) => ({
  token: saved?.token ?? null, user: saved?.user ?? null, expiredNotice: false,
  setSession: (token, user) => { sessionStorage.setItem(KEY, JSON.stringify({ token, user })); set({ token, user, expiredNotice: false }) },
  setUser: user => set(s => { if (s.token) sessionStorage.setItem(KEY, JSON.stringify({ token: s.token, user })); return { user } }),
  clear: () => { sessionStorage.removeItem(KEY); set({ token: null, user: null }) },
  expire: () => { sessionStorage.removeItem(KEY); set({ token: null, user: null, expiredNotice: true }) },
}))

export async function login(username: string, password: string) {
  const { http } = await import('@/services/http')
  const r = await http<{ accessToken: string; user: User }>('POST', '/auth/login', { body: { username, password }, auth: false, busy: 'Signing you in. Please wait.' })
  useAuth.getState().setSession(r.accessToken, r.user)
  return r.user
}
export async function logout() {
  const { http } = await import('@/services/http')
  try { await http('POST', '/auth/logout') } catch { /* already invalid; still sign out locally */ }
  useAuth.getState().clear()
}
