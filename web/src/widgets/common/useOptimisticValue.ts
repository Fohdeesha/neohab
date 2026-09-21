import { useEffect, useReducer, useState } from 'react'
import { useSteadyValue } from './useSteadyValue'
import { useCatalogStore } from '../../store/catalog'
import { useIsDragging } from '../../store/dragging'

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
  // The settle window exists so a value this control sent cannot hide a change made elsewhere. An
  // item with `autoupdate` vetoed has no such change to hide: openHAB posts nothing for a command,
  // so letting the window lapse just snaps the control back to a state that will never move.
  const noAutoUpdate = useCatalogStore((s) => (opts.item === undefined ? false : s.noAutoUpdate.has(opts.item)))
  const holding = pending !== null && !dragging && (noAutoUpdate || Date.now() - pending.at < settleMs)
  const display = pending && (close(steady, pending.v) || holding) ? pending.v : steady
  return {
    display,
    commit: (v: T) => setPending({ v, at: Date.now() }),
    cancel: (v: T) => setPending((p) => (p && p.v === v ? null : p))
  }
}
