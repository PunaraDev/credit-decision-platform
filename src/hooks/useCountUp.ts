import { useEffect, useRef, useState } from 'react'

/** Animates a number from its previous value to the target (ease-out). Respects reduced-motion. */
export function useCountUp(target: number, ms = 900): number {
  const [v, setV] = useState(0)
  const from = useRef(0)
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setV(target); return }
    const start = performance.now(), a = from.current
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms)
      const e = 1 - Math.pow(1 - p, 3)
      setV(a + (target - a) * e)
      if (p < 1) raf = requestAnimationFrame(tick); else from.current = target
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return v
}
