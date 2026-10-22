import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { Stepper } from '@/components/Stepper'
import { Badge, Skeleton } from '@/components/ui'
import { useApp, useStore } from '@/store/applicationStore'
import { STEPS } from '@/types'
import Step1 from '@/features/loan-application/steps/Step1Onboarding'
import Step2 from '@/features/loan-application/steps/Step2Screening'
import Step3 from '@/features/loan-application/steps/Step3Collateral'
import Step4 from '@/features/loan-application/steps/Step4Facility'
import Step5 from '@/features/loan-application/steps/Step5Decision'
import Step6 from '@/features/loan-application/steps/Step6Supplier'
import Step7 from '@/features/loan-application/steps/Step7Documents'

const views = { 1: Step1, 2: Step2, 3: Step3, 4: Step4, 5: Step5, 6: Step6, 7: Step7 } as const

export default function ApplicationWizard() {
  const { id, step: stepParam } = useParams()
  const app = useApp(id)
  const load = useStore(s => s.load)
  const go = useNavigate()
  const [missing, setMissing] = useState(false)
  const step = Number(stepParam) || 1
  useEffect(() => { if (id) void load(id).then(a => setMissing(!a)) }, [id, load])

  if (missing) return <Navigate to="/applications" replace />
  if (!app) return <div className="mx-auto max-w-[1180px] space-y-5 px-6 py-8"><Skeleton className="h-10 w-72" /><Skeleton className="h-24" /><Skeleton className="h-72" /></div>
  // The server enforces stage order too; the UI never offers a locked stage.
  if (step > app.currentStep || step < 1 || step > 7) return <Navigate to={`/applications/${app.id}/${app.currentStep}`} replace />
  const View = views[step as 1]
  const tone = app.status === 'Completed' || app.status === 'Approved' ? 'ok' : app.status === 'Declined' ? 'bad' : 'info'
  return (
    <div className="mx-auto max-w-[1180px] space-y-5 px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-[13px] text-slate-500">{app.reference} · {app.product}</p><h1 className="text-4xl font-medium">{app.customer.fullName || 'New application'}</h1></div>
        <div className="flex items-center gap-2"><Badge tone={tone}>{app.status}</Badge><span className="text-[13px] text-slate-500">Stage {step} of 7: {STEPS[step - 1].title}</span></div>
      </div>
      <Stepper app={app} active={step} onGo={n => go(`/applications/${app.id}/${n}`)} />
      <div key={step} className="animate-fade-up"><View app={app} /></div>
    </div>
  )
}
