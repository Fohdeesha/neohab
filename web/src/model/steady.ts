/**
 * The rule for displaying an item that is being changed by something else, while the device
 * catches up.
 *
 * A light does not step to a new value, and the states it reports on the way are not positions
 * anyone chose. Measured on this project's own server, one press of a button that runs an
 * openHAB rule over five DMX strips produced this for one of them, commanded `21,87,100`:
 *
 *   +0ms     21,87,100          openHAB's own prediction - the value the rule asked for
 *   +50ms    0.000,100,4.7059   the binding echoing the channel's PRE-FADE readback
 *   +50ms    60.000,100,4.7059
 *   +50ms    0,0,4.7059
 *   +1075ms  0.000,95.29400,100 the fade landing
 *   +1076ms  24.198,95.29400,100
 *   +1076ms  20.810,87.05900,100  the real value, the commanded one to the eye
 *
 * Drawn verbatim that is a fader jumping to the new colour, collapsing to near-black, and
 * climbing back - the "jumps twice" a user sees, over about a second, on every light at once.
 *
 * So: the first change is shown at once (nothing is delayed), and anything arriving within
 * STEADY_MS of it is held back until that window closes, when the newest value is shown. Both
 * ends of the burst above are the value the rule asked for, so the fader moves once and stays.
 *
 * What this deliberately is NOT: a filter over item states. The store keeps every state exactly
 * as it arrives - charts, timelines and readouts must show what an item did, not a calmed
 * version of it. This is the display rule for a CONTROL, whose position is a thing the user
 * grabs, and it is applied where `useOptimisticValue` already holds a value the user set.
 * `model/settling.ts` is the sibling rule for a value neohab itself commanded, where the target
 * is known and can be held outright.
 */

/**
 * Long enough to cover a whole fade (1.08s measured here, both directions), short enough that
 * a display which really is following something stays live: while an item keeps changing, this
 * is also the slowest the reading can move.
 */
export const STEADY_MS = 1500

export interface SteadyState<T> {
  /** The value on screen. */
  shown: T
  /** Its identity, so `shown` and `latest` can be compared without knowing what T is. */
  shownKey: string | number
  /** The newest value seen; equal to `shown` unless a burst is holding one back. */
  latest: T
  latestKey: string | number
  /** When the burst that put `shown` on screen began. */
  since: number
}

/**
 * Nothing has been shown yet. `since` is deliberately in the infinite past: a widget mounts
 * before its item's state arrives, and holding that first state back would leave every control
 * on a dashboard sitting at zero for a window after every page load.
 */
export function steadyInitial<T>(live: T, key: string | number): SteadyState<T> {
  return shownAt(live, key, -Infinity)
}

/** `live` is on screen from `now`, and the window that holds back the churn starts with it. */
function shownAt<T>(live: T, key: string | number, now: number): SteadyState<T> {
  return { shown: live, shownKey: key, latest: live, latestKey: key, since: now }
}

/**
 * A new live value arrived. Outside a burst it is shown at once and starts one; inside, it is
 * remembered and held back. Calling it again with the key already recorded changes nothing, so
 * a component may run it on every render.
 */
export function steadyStep<T>(
  prev: SteadyState<T>,
  live: T,
  key: string | number,
  now: number
): SteadyState<T> {
  // Object.is, not ===: a NaN key (a reading that parsed to nothing) would otherwise differ from
  // itself on every render, and this runs during one - which is a render loop, not a wrong value.
  if (Object.is(key, prev.latestKey)) return prev
  if (now - prev.since >= STEADY_MS) return shownAt(live, key, now)
  return { ...prev, latest: live, latestKey: key }
}

/**
 * The window has closed: show whatever arrived during it. Returns null when there is nothing to
 * do, so a caller can leave its state alone rather than re-rendering for no reason.
 */
export function steadyFlush<T>(prev: SteadyState<T>, now: number): SteadyState<T> | null {
  if (Object.is(prev.latestKey, prev.shownKey)) return null
  if (now - prev.since < STEADY_MS) return null
  return shownAt(prev.latest, prev.latestKey, now)
}

/** Is a value waiting for the window to close? */
export function steadyHolding<T>(state: SteadyState<T>): boolean {
  return !Object.is(state.latestKey, state.shownKey)
}
