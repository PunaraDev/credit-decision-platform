import { useEffect, useState } from 'react'
import { Check, Download, FileUp, X } from 'lucide-react'
import clsx from 'clsx'
import { Badge, Btn, Card, Modal, Notice, Spinner, TextAreaField, when } from '@/components/ui'
import StepFooter from '@/components/StepFooter'
import { useStep } from '../useStep'
import { can } from '@/lib/permissions'
import { api } from '@/services/api'
import type { Application, DocItem } from '@/types'

const tone = (s: DocItem['status']) => (s === 'verified' ? 'ok' : s === 'rejected' ? 'bad' : s === 'uploaded' ? 'info' : 'neutral')

export default function Step7({ app }: { app: Application }) {
  const s = useStep(app, 7)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<DocItem | null>(null)
  const [reason, setReason] = useState('')
  const [log, setLog] = useState<Awaited<ReturnType<typeof api.timeline>>>([])
  useEffect(() => { api.timeline(app.id).then(setLog).catch(() => undefined) }, [app.id, app.documents, app.status])

  const need = (d: DocItem) => d.mandatory || (d.key === 'guarantor' && app.facility.guarantor === 'Yes')
  const required = app.documents.filter(need)
  const verified = required.filter(d => d.status === 'verified').length
  const blockers = required.filter(d => d.status !== 'verified').map(d => `${d.label}: ${d.status === 'missing' ? 'upload required' : d.status === 'uploaded' ? 'awaiting verification' : 'rejected, resubmit'}`)

  async function upload(d: DocItem, file: File) {
    setBusyKey(d.key)
    const r = await s.act.upload(file, d.key)
    if (r) await s.act.document({ action: 'upload', key: d.key, fileName: r.name, fileId: r.id })
    setBusyKey(null)
  }
  async function reject() {
    if (!rejecting) return
    await s.act.document({ action: 'reject', key: rejecting.key, reason }); setRejecting(null); setReason('')
  }

  return (
    <div className="stagger space-y-5">
      <Card title="Document collection and verification" subtitle="All mandatory documents must be verified before disbursement"
        action={<div className="flex items-center gap-3"><span className="text-sm text-slate-600">{verified} of {required.length} verified</span><div className="h-2 w-32 overflow-hidden rounded-full bg-line"><div className="h-2 rounded-full bg-gradient-to-r from-ok-500 to-ok-600 transition-[width] duration-700" style={{ width: `${(verified / Math.max(1, required.length)) * 100}%` }} /></div></div>}>
        <ul className="divide-y divide-line">
          {app.documents.filter(d => d.key !== 'guarantor' || app.facility.guarantor === 'Yes').map(d => (
            <li key={d.key} className="flex flex-wrap items-center gap-4 py-3.5">
              <div className="min-w-[260px] flex-1">
                <p className="text-sm font-medium">{d.label}{!need(d) && <span className="ml-2 text-xs text-slate-500">optional</span>}</p>
                <p className="text-[13px] text-slate-500">Check: {d.check}</p>
                {d.fileName && <p className="flex items-center gap-1.5 text-[13px] text-slate-600">{d.fileName} · version {d.version}{d.reviewer ? ` · reviewed by ${d.reviewer.slice(0, 8)}` : ''}
                  {d.fileId && <button aria-label="Download" className="text-slate-400 hover:text-brand-600" onClick={() => void api.download(d.fileId!, d.fileName!)}><Download className="h-3.5 w-3.5" /></button>}</p>}
                {d.reason && <p className="text-[13px] text-bad-500">Rejected: {d.reason}</p>}
              </div>
              <Badge tone={tone(d.status)}>{d.status === 'missing' ? 'Missing' : d.status === 'uploaded' ? 'Uploaded' : d.status === 'verified' ? 'Verified' : 'Rejected'}</Badge>
              <div className="flex items-center gap-2">
                <label className={clsx('btn-ghost cursor-pointer !py-1.5', !can.edit(s.role, 7) && 'pointer-events-none opacity-50')}>{busyKey === d.key ? <Spinner /> : <FileUp className="h-4 w-4" />}{d.status === 'missing' ? 'Upload' : 'Replace'}
                  <input type="file" className="sr-only" accept=".pdf,.jpg,.jpeg,.png,.zip" onChange={e => { const f = e.target.files?.[0]; if (f) void upload(d, f); e.target.value = '' }} /></label>
                <Btn variant="ok" className="!py-1.5" disabled={d.status !== 'uploaded' || !can.verifyDocs(s.role)} onClick={() => void s.act.document({ action: 'verify', key: d.key })}><Check className="h-4 w-4" />Verify</Btn>
                <Btn variant="ghost" className="!py-1.5" disabled={d.status !== 'uploaded' || !can.verifyDocs(s.role)} onClick={() => setRejecting(d)}><X className="h-4 w-4" />Reject</Btn>
              </div>
            </li>))}
        </ul>
        {!can.verifyDocs(s.role) && <div className="mt-4"><Notice tone="info">Verification is done by an Operations Officer. Uploaded files are checked for type and content on the server.</Notice></div>}
      </Card>
      <Card title="Application activity" subtitle="Audit trail of every state change">
        <ul className="space-y-1.5 text-[13px]">{log.slice(0, 15).map((a, i) => <li key={i} className="flex gap-3"><span className="w-40 shrink-0 text-slate-500">{when(a.at)}</span><span className="w-36 shrink-0 text-slate-600">{a.role}</span><span>{a.action}{a.detail ? `: ${a.detail}` : ''}</span></li>)}</ul>
      </Card>
      <Modal open={!!rejecting} title={`Reject ${rejecting?.label ?? ''}`} onClose={() => setRejecting(null)}>
        <TextAreaField label="Reason (shown to the uploader)" value={reason} onChange={setReason} />
        <div className="mt-4 flex justify-end gap-2"><Btn variant="ghost" onClick={() => setRejecting(null)}>Cancel</Btn><Btn variant="danger" disabled={reason.trim().length < 3} onClick={() => void reject()}>Reject document</Btn></div>
      </Modal>
      <StepFooter app={app} step={7} blockers={blockers} showErrors={s.showErrors} onAttempt={() => s.setShowErrors(true)} />
    </div>
  )
}
