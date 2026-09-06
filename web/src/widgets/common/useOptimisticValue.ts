import { useEffect, useReducer, useState } from 'react'
import { useSteadyValue } from './useSteadyValue'

export const SETTLE_MS = 8000

export function useOptimisticValue<T>(
  live: T,
  liveKey: string | number,
  close: (live: T, committed: T) => boolean,
  settleMs = SETTLE_MS
): { display: T; commit: (v: T) => void; cancel: (v: T) => void } {
  const [pending, setPending] = useState<{ v: T; at: number } | null>(null)
  const [, bump] = useReducer((c: number) => c + 1, 0)
  useEffect(() => {
    if (!pending) return
    const remaining = pending.at + settleMs - Date.now()
    if (remaining <= 0) return
    const t = setTimeout(bump, remaining + 50)
    return () => clearTimeout(t)
  }, [pending, settleMs])

  const steady = useSteadyValue(live, liveKey)
  const display = pending && (close(steady, pending.v) || Date.now() - pending.at < settleMs) ? pending.v : steady
  return {
    display,
    commit: (v: T) => setPending({ v, at: Date.now() }),
    cancel: (v: T) => setPending((p) => (p && p.v === v ? null : p))
  }
}
