import { useEffect, useState } from 'react'
import { useCountUp } from '@/hooks/useCountUp'

/** Animated circular gauge for the 0-100 credit score. */
export default function ScoreRing({ score, size = 132 }: { score: number; size?: number }) {
  const r = (size - 16) / 2, c = 2 * Math.PI * r
  const [p, setP] = useState(0)
  useEffect(() => { const t = setTimeout(() => setP(score / 100), 80); return () => clearTimeout(t) }, [score])
  const shown = useCountUp(score)
  const color = score >= 75 ? '#157A55' : score >= 60 ? '#2C6BC0' : score >= 45 ? '#B97F05' : '#C03535'
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E5E2D9" strokeWidth={9} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={9} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - p)} style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(.2,.7,.2,1)' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-4xl font-medium leading-none tabular-nums">{Math.round(shown)}</span>
        <span className="mt-1 text-xs text-slate-500">of 100</span>
      </div>
    </div>
  )
}
