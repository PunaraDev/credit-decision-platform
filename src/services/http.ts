/** Single fetch wrapper: adds the bearer token, parses the standard error contract, signs out on 401. */
import { useAuth } from '@/store/authStore'
import { withBusy } from '@/store/busyStore'

export class ApiError extends Error {
  constructor(public code: string, message: string, public details: string[] = [], public status = 0) { super(message) }
}

type Opts = { body?: unknown; form?: FormData; idem?: string; raw?: boolean; auth?: boolean; busy?: boolean | string }

/** busy: true (or a message) shows the "Processing Request" box while this call runs. Use it for actions the user triggered, not for autosave. */
export function http<T = unknown>(method: string, path: string, o: Opts = {}): Promise<T> {
  return o.busy ? withBusy(() => run<T>(method, path, o), typeof o.busy === 'string' ? o.busy : '') : run<T>(method, path, o)
}

async function run<T>(method: string, path: string, o: Opts): Promise<T> {
  const token = useAuth.getState().token
  const headers: Record<string, string> = {}
  if (o.auth !== false && token) headers.Authorization = `Bearer ${token}`
  if (o.body !== undefined) headers['Content-Type'] = 'application/json'
  if (o.idem) headers['Idempotency-Key'] = o.idem
  let res: Response
  try {
    res = await fetch(`/api/v1${path}`, { method, headers, body: o.form ?? (o.body !== undefined ? JSON.stringify(o.body) : undefined) })
  } catch {
    throw new ApiError('network', 'Cannot reach the server. Check your connection and try again.')
  }
  if (o.raw && res.ok) return res as unknown as T
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const e = json?.error ?? {}
    if (res.status === 401 && o.auth !== false && e.code !== 'invalid_credentials') useAuth.getState().expire()
    const raw = e.details
    const details = Array.isArray(raw) ? raw.map(String) : raw && typeof raw === 'object' ? Object.values(raw).flat().map(String) : []
    throw new ApiError(e.code ?? 'error', e.message ?? res.statusText, details, res.status)
  }
  return json as T
}
