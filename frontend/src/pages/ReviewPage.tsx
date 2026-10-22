import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, ShieldCheck } from 'lucide-react'
import { Btn, Card, CheckRow, Notice, ReadField, Skeleton, TextField } from '@/components/ui'
import { api, type ReviewData } from '@/services/api'
import { ApiError } from '@/services/http'
import { lkr } from '@/lib/finance'

/**
 * Customer-facing page opened from the secure link. No staff login, token-protected, one-time.
 * The customer checks their details and gives permission for the CRIB inquiry and customer screening.
 * Neither check can be run by staff until this page has been submitted.
 */
export default function ReviewPage() {
  const { token = '' } = useParams()
  const [d, setD] = useState<ReviewData | null>(null)
  const [err, setErr] = useState(''), [done, setDone] = useState(false), [busy, setBusy] = useState(false)
  const [correct, setCorrect] = useState(false), [crib, setCrib] = useState(false), [screening, setScreening] = useState(false), [name, setName] = useState('')
  useEffect(() => { api.review(token).then(r => { setD(r); setDone(r.alreadyConfirmed) }).catch(e => setErr(e instanceof ApiError ? e.message : 'Could not load this page')) }, [token])

  const ready = correct && crib && screening && name.trim().length >= 3
  async function submit() {
    setBusy(true); setErr('')
    try { await api.confirmReview(token, { confirm: correct, cribConsent: crib, screeningConsent: screening, typedName: name.trim() }); setDone(true) }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not submit. Please try again.') } finally { setBusy(false) }
  }
  return (
    <div className="min-h-full bg-gradient-to-b from-brand-50 to-paper px-4 py-10">
      <div className="mx-auto max-w-2xl stagger">
        <p className="mb-6 text-center font-display text-2xl">Origin<span className="text-gold-500">IQ</span></p>
        {!d && !err && <Card><Skeleton className="mb-3 h-6 w-1/2" /><Skeleton className="mb-2 h-10" /><Skeleton className="h-10" /></Card>}
        {err && !d && <Notice tone="bad" title="This link cannot be used">{err}</Notice>}
        {d && done && (
          <Card><div className="flex flex-col items-center py-8 text-center"><span className="flex h-16 w-16 animate-pop items-center justify-center rounded-full bg-ok-50"><CheckCircle2 className="h-9 w-9 text-ok-500" /></span>
            <h1 className="mt-5 text-3xl font-medium">Thank you, {d.customerName?.split(' ')[0]}</h1>
            <p className="mt-2 max-w-sm text-sm text-slate-600">Your permission for application {d.reference} has been recorded. Your officer will now continue the process and contact you.</p></div></Card>)}
        {d && !done && (<>
          <div className="mb-5"><h1 className="text-3xl font-medium">Please check your details and give your permission</h1>
            <p className="mt-1 text-sm text-slate-600">Application {d.reference} · {d.product}. Your officer can only check your credit report and screen your details after you submit this page.</p></div>
          <Card title="Your details" subtitle="Sensitive numbers are partly hidden">
            <div className="grid gap-4 md:grid-cols-2"><ReadField label="Full name" value={d.customerName} /><ReadField label="NIC" value={d.nic} /><ReadField label="Mobile" value={d.mobile} />
              <ReadField label="Employer" value={d.employer} /><ReadField label="Address" value={d.address} span={2} /><ReadField label="Monthly income" value={lkr(d.monthlyIncome)} /></div>
          </Card>
          <Card title="Your permission" subtitle="Both are needed to continue with your application" className="mt-5">
            <div className="space-y-3">
              <CheckRow checked={crib} onChange={setCrib} title="Credit information report (CRIB)"
                desc="I allow the lender to obtain my credit information report from the Credit Information Bureau (CRIB) to assess this application." />
              <CheckRow checked={screening} onChange={setScreening} title="Customer screening"
                desc="I allow the lender to screen my details against sanctions, politically exposed person, adverse media and internal watchlists." />
            </div>
            <p className="mt-3 flex items-center gap-2 text-[13px] text-slate-500"><ShieldCheck className="h-4 w-4 text-ok-500" />Your permission is recorded with the date, time and your name, and applies only to this application.</p>
          </Card>
          <Card title="Confirm and submit" className="mt-5">
            <div className="space-y-4"><CheckRow checked={correct} onChange={setCorrect} title="I confirm these details are correct" desc="I understand they will be used to assess my application." />
              <TextField label="Type your full name to sign" value={name} onChange={setName} />
              {err && <Notice tone="bad">{err}</Notice>}
              <Btn busy={busy} disabled={!ready} onClick={() => void submit()} className="w-full !py-2.5">Give permission and submit</Btn></div>
          </Card></>)}
      </div>
    </div>
  )
}
