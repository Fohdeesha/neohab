import { useEffect, useReducer, useState } from 'react'
import { useSteadyValue } from './useSteadyValue'
import { useIsDragging } from '../../store/dragging'
import { useUnconfirmed } from '../../store/unconfirmed'
import { stepPending, type Pending } from '../../model/optimistic'

// long enough for a slow device to report back, short enough that a change made elsewhere is not hidden for
// long by a value this control sent
export const SETTLE_MS = 4000

export function useOptimisticValue<T>(
  live: T,
  liveKey: string | number,
  close: (live: T, committed: T) => boolean,
  opts: { item?: string; settleMs?: number } = {}
): { display: T; commit: (v: T) => void; cancel: (v: T) => void } {
  const settleMs = opts.settleMs ?? SETTLE_MS
  const [pending, setPending] = useState<Pending<T> | null>(null)
  const [, bump] = useReducer((c: number) => c + 1, 0)

  const steady = useSteadyValue(live, liveKey, opts.item)
  // while another control in this tab drags the same item, a value this one sent earlier must not hide it
  const dragging = useIsDragging(opts.item)
  const waiting = useUnconfirmed(opts.item) !== undefined
  const next = stepPending(pending, {
    now: Date.now(),
    settleMs,
    waiting,
    dragging,
    liveKey,
    close: pending !== null && close(steady, pending.v)
  })
  if (next !== pending) setPending(next)

  // the window closing is not an event anything else would render for
  const at = next?.at
  useEffect(() => {
    if (at === undefined) return
    const remaining = at + settleMs - Date.now()
    if (remaining <= 0) return
    const t = setTimeout(bump, remaining + 50)
    return () => clearTimeout(t)
  }, [at, settleMs])

  return {
    display: next ? next.v : steady,
    commit: (v: T) => setPending({ v, at: Date.now(), awaited: false }),
    cancel: (v: T) => setPending((p) => (p && p.v === v ? null : p))
  }
}
