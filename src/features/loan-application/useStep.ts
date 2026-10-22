import { useState } from 'react'
import { useStore } from '@/store/applicationStore'
import { can, useRole } from '@/lib/permissions'
import { api } from '@/services/api'
import { toast } from '@/store/toastStore'
import { errText } from '@/store/applicationStore'
import type { Application } from '@/types'

/** Shared per-step helper. edit() autosaves a section; act.* are server commands (the server decides, the UI reflects). */
export function useStep(app: Application, step: number) {
  const store = useStore()
  const role = useRole()
  const [showErrors, setShowErrors] = useState(false)
  const id = app.id
  const guard = async (fn: () => Promise<unknown>, ok?: string) => { try { await fn(); if (ok) toast.ok(ok) } catch { /* store already toasted */ } }
  return {
    role, readOnly: !can.edit(role, step), showErrors, setShowErrors,
    edit: <K extends keyof Application>(key: K, value: Partial<Application[K]>) => store.edit(id, key, value),
    act: {
      integration: (name: string, ok?: string) => guard(() => store.integration(id, name), ok),
      transition: (action: string, comment = '', ok?: string, extra?: object) => guard(() => store.transition(id, action, comment, extra), ok),
      assess: () => guard(() => store.assess(id)),
      document: (body: object) => guard(() => store.document(id, body)),
      reload: () => store.load(id),
      upload: async (file: File, label: string) => { try { return await api.upload(id, file, label) } catch (e) { toast.bad(errText(e)); return null } },
    },
  }
}
