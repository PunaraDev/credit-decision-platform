import { create } from 'zustand'
import { api } from '@/services/api'
import { ApiError } from '@/services/http'
import { fromServer } from '@/lib/mapServer'
import { toast } from './toastStore'
import type { AppRow, Application, Product } from '@/types'

/** Which endpoint persists which UI section. The server whitelists the same keys and is the authority. */
const ENDPOINT: Record<string, { step: number; method: 'PATCH' | 'POST'; path: string }> = {
  consent: { step: 1, method: 'PATCH', path: 'onboarding' }, customer: { step: 1, method: 'PATCH', path: 'onboarding' },
  cdd: { step: 2, method: 'POST', path: 'screening' },
  collateral: { step: 3, method: 'POST', path: 'valuations' }, valuation: { step: 3, method: 'POST', path: 'valuations' },
  facility: { step: 4, method: 'PATCH', path: 'facility' },
  supplier: { step: 6, method: 'POST', path: 'confirmations' }, confirmation: { step: 6, method: 'POST', path: 'confirmations' },
}
/** Sections the server owns: always taken from the server, even after an autosave response. */
const SERVER_OWNED: (keyof Application)[] = ['erp', 'crib', 'screening', 'fourN', 'submission', 'qa', 'decision', 'approval', 'documents']
const DEBOUNCE_MS = 600

interface Queue { path: string; method: 'PATCH' | 'POST'; payload: Record<string, Record<string, unknown>>; timer?: ReturnType<typeof setTimeout> }
const queues: Record<string, Record<string, Queue>> = {}

export const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.')

interface State {
  apps: Record<string, Application>
  rows: AppRow[] | null
  mode: 'mock' | 'live' | null
  saving: number
  lastSaved: number
  processing: number
  loadList: () => Promise<void>
  loadMode: () => Promise<void>
  load: (id: string) => Promise<Application | null>
  create: (product: Product) => Promise<string>
  edit: <K extends keyof Application>(id: string, section: K, partial: Partial<Application[K]>) => void
  flush: (id: string) => Promise<void>
  integration: (id: string, name: string) => Promise<void>
  transition: (id: string, action: string, comment?: string, extra?: object) => Promise<void>
  assess: (id: string) => Promise<void>
  document: (id: string, body: object) => Promise<void>
  advance: (id: string) => Promise<{ ok: boolean; errors: string[] }>
}

export const useStore = create<State>((set, get) => {
  const put = (a: Application) => set(s => ({ apps: { ...s.apps, [a.id]: a } }))
  const applyFull = (sa: Parameters<typeof fromServer>[0]) => put(fromServer(sa))
  const applyMeta = (sa: Parameters<typeof fromServer>[0]) => {
    const cur = get().apps[sa.id], next = fromServer(sa)
    if (!cur) return put(next)
    const merged: Application = { ...cur, status: next.status, currentStep: next.currentStep, completed: next.completed }
    for (const k of SERVER_OWNED) (merged as unknown as Record<string, unknown>)[k] = next[k]
    put(merged)
  }

  async function sendQueue(id: string, key: string) {
    const q = queues[id]?.[key]; if (!q) return
    clearTimeout(q.timer); delete queues[id][key]
    set(s => ({ saving: s.saving + 1 }))
    try { applyMeta(await api.save(q.method, `/applications/${id}/${q.path}`, q.payload)); set({ lastSaved: Date.now() }) }
    catch (e) { toast.bad(errText(e)); await get().load(id) }  // reconcile with the server
    finally { set(s => ({ saving: s.saving - 1 })) }
  }

  /** blocking = show the full-screen "Processing request" overlay while the server works (integrations, pricing). */
  async function act(id: string, fn: () => Promise<Parameters<typeof fromServer>[0]>, okMsg?: string, blocking = false) {
    await get().flush(id)
    if (blocking) set(s => ({ processing: s.processing + 1 }))
    try { applyFull(await fn()); if (okMsg) toast.ok(okMsg) }
    catch (e) { toast.bad(errText(e)); throw e }
    finally { if (blocking) set(s => ({ processing: s.processing - 1 })) }
  }

  return {
    apps: {}, rows: null, mode: null, saving: 0, lastSaved: 0, processing: 0,
    loadList: async () => { try { set({ rows: await api.list() }) } catch (e) { toast.bad(errText(e)); set({ rows: get().rows ?? [] }) } },
    loadMode: async () => { try { set({ mode: (await api.mode()).mode }) } catch { /* non-critical */ } },
    load: async id => {
      try { const a = fromServer(await api.get(id)); put(a); return a } catch (e) { if (!(e instanceof ApiError && e.status === 404)) toast.bad(errText(e)); return null }
    },
    create: async product => { const a = fromServer(await api.create(product)); put(a); return a.id },

    edit: (id, section, partial) => {
      const ep = ENDPOINT[section as string]; const cur = get().apps[id]
      if (!ep || !cur) return
      const optimistic: Application = { ...cur, [section]: { ...(cur[section] as object), ...partial } as Application[typeof section] }
      if (cur.completed.some(s => s >= ep.step)) { optimistic.completed = cur.completed.filter(s => s < ep.step); optimistic.currentStep = Math.min(cur.currentStep, ep.step) }
      put(optimistic)
      const q = ((queues[id] ??= {})[ep.path] ??= { path: ep.path, method: ep.method, payload: {} })
      q.payload[section as string] = { ...(q.payload[section as string] ?? {}), ...(partial as object) }
      clearTimeout(q.timer); q.timer = setTimeout(() => void sendQueue(id, ep.path), DEBOUNCE_MS)
      set(s => ({ saving: s.saving }))  // nudge subscribers
    },
    flush: async id => { await Promise.all(Object.keys(queues[id] ?? {}).map(k => sendQueue(id, k))) },

    integration: (id, name) => act(id, () => api.integration(id, name), undefined, true),
    transition: (id, action, comment = '', extra = {}) => act(id, () => api.transition(id, action, comment, extra)),
    assess: async id => {
      await act(id, () => api.assess(id), undefined, true)
      const d = get().apps[id]?.decision
      if (d) (d.trafficLight === 'Green' ? toast.ok : d.trafficLight === 'Red' ? toast.bad : toast.info)(`${d.trafficLight} decision`)
    },
    document: (id, body) => act(id, () => api.document(id, body)),
    advance: async id => {
      await get().flush(id)
      try { applyFull(await api.transition(id, 'advance')); toast.ok('Record saved'); return { ok: true, errors: [] } }
      catch (e) {
        if (e instanceof ApiError && e.status === 422) return { ok: false, errors: e.details }
        toast.bad(errText(e)); return { ok: false, errors: [errText(e)] }
      }
    },
  }
})

export const useApp = (id: string | undefined) => useStore(s => (id ? s.apps[id] : undefined))
