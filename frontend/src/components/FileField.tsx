import { useState } from 'react'
import { Paperclip, CheckCircle2, Download } from 'lucide-react'
import { Field, Spinner } from './ui'
import { api } from '@/services/api'
import { errText } from '@/store/applicationStore'
import { toast } from '@/store/toastStore'

/** Uploads to the workflow service (type, size and content-signature checked server-side) and reports back the stored file id. */
export default function FileField({ appId, label, name, fileId, onChange, error }: {
  appId: string; label: string; name: string; fileId?: string; onChange: (name: string, id: string) => void; error?: string
}) {
  const [busy, setBusy] = useState(false)
  async function pick(f: File | undefined) {
    if (!f) return
    setBusy(true)
    try { const r = await api.upload(appId, f, label); onChange(r.name, r.id); toast.ok(`${label} uploaded`) } catch (e) { toast.bad(errText(e)) } finally { setBusy(false) }
  }
  return (
    <Field label={label} required error={error} hint="PDF, JPG, PNG or ZIP, up to 10 MB">
      <div className="flex items-center gap-2">
        <label className="btn-ghost cursor-pointer !py-1.5">{busy ? <Spinner /> : <Paperclip className="h-4 w-4" />}{name ? 'Replace' : 'Attach'}
          <input type="file" className="sr-only" accept=".pdf,.jpg,.jpeg,.png,.zip" onChange={e => void pick(e.target.files?.[0])} /></label>
        {name ? (
          <span className="flex min-w-0 animate-fade-in items-center gap-1.5 text-[13px] text-ok-600"><CheckCircle2 className="h-4 w-4 shrink-0" />
            <span className="truncate">{name}</span>
            {fileId && <button type="button" aria-label="Download" className="text-slate-400 hover:text-brand-600" onClick={() => void api.download(fileId, name)}><Download className="h-3.5 w-3.5" /></button>}
          </span>
        ) : <span className="text-[13px] text-slate-400">No file</span>}
      </div>
    </Field>
  )
}
