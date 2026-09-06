// long enough to cover a whole fade (1.08s measured), short enough that a display really following something
// stays live
export const STEADY_MS = 1500

export interface SteadyState<T> {
  shown: T
  shownKey: string | number
  latest: T
  latestKey: string | number
  since: number
}

// `since` is in the infinite past on purpose: holding the first state back would leave every control at zero
// after a page load
export function steadyInitial<T>(live: T, key: string | number): SteadyState<T> {
  return shownAt(live, key, -Infinity)
}

function shownAt<T>(live: T, key: string | number, now: number): SteadyState<T> {
  return { shown: live, shownKey: key, latest: live, latestKey: key, since: now }
}

export function steadyStep<T>(prev: SteadyState<T>, live: T, key: string | number, now: number): SteadyState<T> {
  // Object.is, not ===: a NaN key differs from itself, and this runs during render, which makes that a render
  // loop
  if (Object.is(key, prev.latestKey)) return prev
  if (now - prev.since >= STEADY_MS) return shownAt(live, key, now)
  return { ...prev, latest: live, latestKey: key }
}

export function steadyFlush<T>(prev: SteadyState<T>, now: number): SteadyState<T> | null {
  if (Object.is(prev.latestKey, prev.shownKey)) return null
  if (now - prev.since < STEADY_MS) return null
  return shownAt(prev.latest, prev.latestKey, now)
}

export function steadyHolding<T>(state: SteadyState<T>): boolean {
  return !Object.is(state.latestKey, state.shownKey)
}
