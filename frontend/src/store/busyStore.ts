import { create } from 'zustand'

/** Counts user-triggered server commands that are in flight. The "Processing Request" box shows while count > 0. */
interface Busy { count: number; message: string }
export const useBusy = create<Busy>(() => ({ count: 0, message: '' }))

export async function withBusy<T>(fn: () => Promise<T>, message = ''): Promise<T> {
  useBusy.setState(s => ({ count: s.count + 1, message: message || s.message }))
  try { return await fn() }
  finally { useBusy.setState(s => ({ count: Math.max(0, s.count - 1), message: s.count - 1 <= 0 ? '' : s.message })) }
}