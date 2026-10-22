import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Building2, Car, Check, IdCard, Landmark, Repeat, Search, UserRound } from 'lucide-react'
import clsx from 'clsx'
import { Badge, Btn, Card, CheckRow, ReadField, SelectField, TextField } from '@/components/ui'
import { LISTS, PROVINCE_OF } from '@/lib/schemas'
import { errText, useApp, useStore } from '@/store/applicationStore'
import { toast } from '@/store/toastStore'
import type { Product } from '@/types'

const PRODUCTS: Array<{ key: Product | 'revolving' | 'reschedule'; title: string; sub: string; icon: typeof Car; live: boolean }> = [
  { key: 'Vehicle Lease', title: 'Normal Lease', sub: 'Standard risk-based pricing', icon: Car, live: true },
  { key: 'Vehicle Loan', title: 'Vehicle Loan', sub: 'Reducing-balance loan', icon: Landmark, live: true },
  { key: 'revolving', title: 'Revolving', sub: 'New product', icon: Repeat, live: false },
  { key: 'reschedule', title: 'Rescheduling', sub: 'Existing facilities', icon: Repeat, live: false },
]
const NIC = /^(\d{9}[VvXx]|\d{12})$/

/** Start screen: client type, product, then fetch the client by NIC (ERP) before the 7-stage journey begins. */
export default function NewApplication() {
  const go = useNavigate()
  const { create, edit, integration } = useStore()
  const [product, setProduct] = useState<Product>('Vehicle Lease')
  const [nic, setNic] = useState('')
  const [c1, setC1] = useState(false), [c2, setC2] = useState(false)
  const [id, setId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const app = useApp(id ?? undefined)
  const nicOk = NIC.test(nic.trim())
  const fetched = !!app && app.erp.status !== 'idle' && app.erp.status !== 'searching'

  async function fetchClient() {
    // Pop-up messages instead of silently disabled buttons
    if (!c1 || !c2) return toast.bad('Please record both customer consents before fetching the client.')
    if (!nic.trim()) return toast.bad('Enter the NIC number.')
    if (!nicOk) return toast.bad('That NIC is not valid. Use 9 digits followed by V or X, or a 12-digit NIC.')
    setBusy(true)
    try {
      const appId = id ?? await create(product)
      setId(appId)
      edit(appId, 'consent', { privacyNotice: c1, dataProcessing: c1, identityVerification: c2, capturedAt: new Date().toISOString() })
      edit(appId, 'customer', { nic: nic.trim() })
      await integration(appId, 'erp')
      const a = useStore.getState().apps[appId]
      if (a?.erp.status === 'found') toast.ok(`Client found in ERP (client code ${a.erp.clientCode}). Details were filled in.`)
      else toast.info('No ERP match: this is a new client. Please enter the client details.')
    } catch (e) { toast.bad(errText(e)) } finally { setBusy(false) }
  }

  function continueToApplication() {
    if (!app) return
    if (app.erp.status === 'new') {
      if (!app.customer.fullName.trim()) return toast.bad('Enter the client full name.')
      if (!app.customer.address.trim()) return toast.bad('Enter the client address.')
      if (!app.customer.district) return toast.bad('Select the client district.')
    }
    toast.ok('Record saved')
    go(`/applications/${app.id}/1`)
  }

  return (
    <div className="mx-auto max-w-[1040px] space-y-6 px-6 py-8">
      <div className="stagger space-y-6">
        <div>
          <h1 className="text-4xl font-medium">Select your application type</h1>
          <p className="mt-1 text-sm text-slate-500">Choose the client and product types that match this application before proceeding.</p>
        </div>

        <div className="inline-flex rounded-xl glass p-1" role="tablist" aria-label="Client type">
          <button role="tab" aria-selected className="flex items-center gap-2 rounded-lg bg-gradient-to-b from-brand-600 to-brand-700 px-4 py-2 text-sm font-medium text-white shadow-sm">
            <UserRound className="h-4 w-4" />Individual
          </button>
          <button role="tab" aria-selected={false} onClick={() => toast.info('Corporate clients are planned for a later release.')}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-slate-400">
            <Building2 className="h-4 w-4" />Corporate
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PRODUCTS.map(p => {
            const sel = p.live && product === p.key
            return (
              <button key={p.key} aria-pressed={sel}
                onClick={() => {
                  if (!p.live) return toast.info(`${p.title} is coming soon. Only vehicle leases and loans are available now.`)
                  if (id) return toast.info('The product cannot be changed after the client has been fetched.')
                  setProduct(p.key as Product)
                }}
                className={clsx('group relative flex flex-col items-center rounded-2xl border px-4 py-7 text-center transition-all duration-300',
                  sel ? 'border-ink-800 bg-gradient-to-br from-ink-950 to-ink-800 text-white shadow-lift'
                    : p.live ? 'glass hover:-translate-y-1 hover:shadow-lift' : 'glass opacity-60')}>
                {sel && (
                  <span className="absolute right-3 top-3 flex h-6 w-6 animate-pop items-center justify-center rounded-full bg-gold-400 text-ink-950">
                    <Check className="h-4 w-4" />
                  </span>
                )}
                <p.icon className={clsx('h-9 w-9 transition-transform duration-300 group-hover:scale-110', sel ? 'text-gold-400' : p.live ? 'text-brand-600' : 'text-slate-400')} />
                <p className="mt-3 font-display text-xl">{p.title}</p>
                <p className={clsx('text-[13px]', sel ? 'text-slate-300' : 'text-slate-500')}>{p.live ? p.sub : 'Coming soon'}</p>
              </button>
            )
          })}
        </div>

        <Card title="Find the client" subtitle="Enter the NIC to fetch the client from the ERP. The CRIB inquiry and screening are run later, after the customer gives permission through a secure link">
          <div className="grid gap-3 md:grid-cols-2">
            <CheckRow checked={c1} disabled={!!id} onChange={setC1} title="Privacy notice and data processing" desc="The customer has been informed and agrees." />
            <CheckRow checked={c2} disabled={!!id} onChange={setC2} title="Identity verification" desc="The customer allows the NIC to be checked against authorized sources." />
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="min-w-[280px] flex-1">
              <span className="mb-1 block text-[13px] text-slate-600">NIC number</span>
              <span className="relative block">
                <IdCard className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input className="input !pl-9" placeholder="e.g. 200056802318" value={nic} disabled={!!id}
                  onChange={e => setNic(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !id && void fetchClient()} />
              </span>
            </label>
            <Btn busy={busy && !fetched} disabled={!!id} onClick={() => void fetchClient()}>
              <Search className="h-4 w-4" />Fetch client
            </Btn>
          </div>
          {nic && !nicOk && <p className="mt-2 text-xs text-bad-500">Enter 9 digits followed by V or X, or a 12-digit NIC.</p>}
        </Card>

        {fetched && app && (
          <Card title="Client info"
            subtitle={app.erp.status === 'found'
              ? 'Fetched from the ERP. Details are auto-filled; the rest is completed on the next page.'
              : 'No ERP match. This is a new client: enter the details below.'}
            action={<Badge tone={app.erp.status === 'found' ? 'info' : 'ok'}>{app.erp.status === 'found' ? 'Existing client' : 'New client'}</Badge>}>

            {app.erp.status === 'new' ? (
              <div className="grid animate-fade-up gap-4 md:grid-cols-2 xl:grid-cols-4">
                <TextField label="Client full name" required span={2} value={app.customer.fullName}
                  onChange={v => edit(app.id, 'customer', { fullName: v })} />
                <ReadField label="NIC" value={app.customer.nic} />
                <ReadField label="Client code" value="Auto-generated on approval" />
                <TextField label="Client address" required span={2} value={app.customer.address}
                  onChange={v => edit(app.id, 'customer', { address: v })} />
                <ReadField label="Application type" value={<span className="text-bad-500">NORMAL</span>} />
                <ReadField label="Client type" value={<span className="text-bad-500">INDIVIDUAL</span>} />
                <SelectField label="Client district" required options={LISTS.districts} value={app.customer.district}
                  onChange={v => edit(app.id, 'customer', { district: v, province: PROVINCE_OF[v] ?? '' })} />
                <ReadField label="Client province" value={app.customer.province || 'Auto-generated'} />
              </div>
            ) : (
              <div className="grid animate-fade-up gap-4 md:grid-cols-2 xl:grid-cols-4">
                <ReadField label="Client full name" value={app.customer.fullName} span={2} />
                <ReadField label="NIC" value={app.customer.nic} />
                <ReadField label="Client code" value={app.erp.clientCode ?? 'Auto-generated on approval'} />
                <ReadField label="Client address" value={app.customer.address} span={2} />
                <ReadField label="Application type" value={<span className="text-bad-500">NORMAL</span>} />
                <ReadField label="Client type" value={<span className="text-bad-500">INDIVIDUAL</span>} />
                <ReadField label="Client district" value={app.customer.district} />
                <ReadField label="Client province" value={app.customer.province || 'Auto-generated'} />
                <p className="text-xs text-slate-500 md:col-span-2 xl:col-span-4">
                  These come from the ERP, which is the master record. If something is wrong, correct it on the next page.
                </p>
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <Btn onClick={continueToApplication}>
                Continue to application<ArrowRight className="h-4 w-4" />
              </Btn>
            </div>
          </Card>
        )}
      </div>

    </div>
  )
}