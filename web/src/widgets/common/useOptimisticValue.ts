import { useEffect, useReducer, useState } from 'react'
import { useSteadyValue } from './useSteadyValue'
import { useIsDragging } from '../../store/dragging'
import { useUnconfirmed } from '../../store/unconfirmed'

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
  const [pending, setPending] = useState<{ v: T; at: number } | null>(null)
  const [, bump] = useReducer((c: number) => c + 1, 0)
  useEffect(() => {
    if (!pending) return
    const remaining = pending.at + settleMs - Date.now()
    if (remaining <= 0) return
    const t = setTimeout(bump, remaining + 50)
    return () => clearTimeout(t)
  }, [pending, settleMs])

  const steady = useSteadyValue(live, liveKey, opts.item)
  // while another control in this tab drags the same item, a value this one sent earlier must not hide it
  const dragging = useIsDragging(opts.item)
  // an item with `autoupdate` vetoed gets nothing back from openHAB itself, so it holds until its
  // device answers rather than for the settle window, which would snap back to a state that has not moved
  const waiting = useUnconfirmed(opts.item) !== undefined
  const holding = pending !== null && !dragging && (waiting || Date.now() - pending.at < settleMs)
  const display = pending && (close(steady, pending.v) || holding) ? pending.v : steady
  return {
    display,
    commit: (v: T) => setPending({ v, at: Date.now() }),
    cancel: (v: T) => setPending((p) => (p && p.v === v ? null : p))
  }
}
