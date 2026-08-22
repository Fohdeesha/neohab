/**
 * React wrapper for `model/steady.ts`: the live value, calmed while a device is mid-fade.
 *
 * `key` is what identifies the value - the raw item state, or the number the control shows.
 * It is a separate argument because T is often rebuilt on every render (parsing "21,87,100"
 * gives a fresh object each time), so the value itself cannot say whether anything changed.
 */
import { useEffect, useReducer, useRef, useState } from 'react'
import { STEADY_MS, steadyFlush, steadyHolding, steadyInitial, steadyStep, type SteadyState } from '../../model/steady'

export function useSteadyValue<T>(live: T, key: string | number): T {
  const [state, setState] = useState<SteadyState<T>>(() => steadyInitial(live, key))
  // Adjusting state during render (React re-runs this component immediately and throws the
  // in-flight output away) rather than in an effect: an effect lands a frame late, which is one
  // painted frame of exactly the churn this exists to hide.
  const next = steadyStep(state, live, key, Date.now())
  if (next !== state) setState(next)

  const holding = steadyHolding(next)
  const since = next.since
  useEffect(() => {
    if (!holding) return
    // Re-render once when the window closes, so the held value appears even though no further
    // state arrives to trigger one.
    const wait = Math.max(0, since + STEADY_MS - Date.now()) + 20
    const timer = setTimeout(() => setState((s) => steadyFlush(s, Date.now()) ?? s), wait)
    return () => clearTimeout(timer)
  }, [holding, since])

  return next.shown
}

/**
 * The same rule for a SET of items, read by name.
 *
 * A floor plan draws as many lights as the house has, so there is no fixed number of hooks to
 * give them one each - and its glows and preset chips are DERIVED from several items at once,
 * which makes them worse off than a single control: one stale echo mid-fade turns a whole
 * preset's highlight off and flashes the room back through the scene being left.
 *
 * The map is a ref advanced during render rather than state, because the reader is a getter
 * called an unknown number of times per render. `steadyStep` returns its input unchanged when
 * the key is the one already recorded, so a repeated call (or a re-render) changes nothing.
 */
export function useSteadyStates(): (item: string, live: string | undefined) => string | undefined {
  const map = useRef(new Map<string, SteadyState<string | undefined>>()).current
  const [, bump] = useReducer((c: number) => c + 1, 0)
  const seen = new Set<string>()
  const now = Date.now()

  // Re-render when the earliest open window closes, and forget items nobody read this time.
  useEffect(() => {
    for (const item of [...map.keys()]) if (!seen.has(item)) map.delete(item)
    let due = Infinity
    for (const state of map.values()) if (steadyHolding(state)) due = Math.min(due, state.since + STEADY_MS)
    if (!Number.isFinite(due)) return
    const timer = setTimeout(() => {
      const at = Date.now()
      for (const [item, state] of map) {
        const flushed = steadyFlush(state, at)
        if (flushed) map.set(item, flushed)
      }
      bump()
    }, Math.max(0, due - Date.now()) + 20)
    return () => clearTimeout(timer)
  })

  return (item, live) => {
    seen.add(item)
    const key = live ?? ''
    const prev = map.get(item)
    const next = prev ? steadyStep(prev, live, key, now) : steadyInitial(live, key)
    if (next !== prev) map.set(item, next)
    return next.shown
  }
}
