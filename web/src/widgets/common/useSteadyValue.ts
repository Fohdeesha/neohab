import { useEffect, useReducer, useRef, useState } from 'react'
import { STEADY_MS, steadyFlush, steadyHolding, steadyInitial, steadyStep, type SteadyState } from '../../model/steady'
import { useDraggingStore, useIsDragging } from '../../store/dragging'

// while this tab drags the item every change is one we caused, so the display follows them all. The state
// is kept at its starting point meanwhile, so the first change after the drag ends shows at once too.
function following<T>(prev: SteadyState<T>, live: T, key: string | number): SteadyState<T> {
  return Object.is(prev.latestKey, key) && Object.is(prev.shownKey, key) && prev.since === -Infinity ? prev : steadyInitial(live, key)
}

export function useSteadyValue<T>(live: T, key: string | number, item?: string): T {
  const dragging = useIsDragging(item)
  const [state, setState] = useState<SteadyState<T>>(() => steadyInitial(live, key))
  const next = dragging ? following(state, live, key) : steadyStep(state, live, key, Date.now())
  if (next !== state) setState(next)

  const holding = steadyHolding(next)
  const since = next.since
  useEffect(() => {
    if (!holding) return
    const wait = Math.max(0, since + STEADY_MS - Date.now()) + 20
    const timer = setTimeout(() => setState((s) => steadyFlush(s, Date.now()) ?? s), wait)
    return () => clearTimeout(timer)
  }, [holding, since])

  return next.shown
}

export function useSteadyStates(): (item: string, live: string | undefined) => string | undefined {
  const dragging = useDraggingStore((s) => s.items)
  const map = useRef(new Map<string, SteadyState<string | undefined>>()).current
  const [, bump] = useReducer((c: number) => c + 1, 0)
  const seen = new Set<string>()
  const now = Date.now()

  useEffect(() => {
    for (const item of [...map.keys()]) if (!seen.has(item)) map.delete(item)
    let due = Infinity
    for (const state of map.values()) if (steadyHolding(state)) due = Math.min(due, state.since + STEADY_MS)
    if (!Number.isFinite(due)) return
    const timer = setTimeout(
      () => {
        const at = Date.now()
        for (const [item, state] of map) {
          const flushed = steadyFlush(state, at)
          if (flushed) map.set(item, flushed)
        }
        bump()
      },
      Math.max(0, due - Date.now()) + 20
    )
    return () => clearTimeout(timer)
  })

  return (item, live) => {
    seen.add(item)
    const key = live ?? ''
    const prev = map.get(item)
    const next = !prev ? steadyInitial(live, key) : dragging.has(item) ? following(prev, live, key) : steadyStep(prev, live, key, now)
    if (next !== prev) map.set(item, next)
    return next.shown
  }
}
