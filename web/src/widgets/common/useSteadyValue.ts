import { useEffect, useReducer, useRef, useState } from 'react'
import { STEADY_MS, steadyFlush, steadyHolding, steadyInitial, steadyStep, type SteadyState } from '../../model/steady'

export function useSteadyValue<T>(live: T, key: string | number): T {
  const [state, setState] = useState<SteadyState<T>>(() => steadyInitial(live, key))
  const next = steadyStep(state, live, key, Date.now())
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
    const next = prev ? steadyStep(prev, live, key, now) : steadyInitial(live, key)
    if (next !== prev) map.set(item, next)
    return next.shown
  }
}
