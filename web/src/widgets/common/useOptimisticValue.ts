/**
 * Optimistic display value for command widgets (slider, color picker).
 *
 * Devices rarely echo back exactly what was commanded: the DMX binding reports the pre-fade
 * value for a moment, dimmers quantize, and Color items round-trip HSB through RGB - at low
 * saturation/brightness the hue that comes back is essentially arbitrary. Following the raw
 * item state makes controls snap back or jump to unrelated positions right after a drag.
 *
 * Rule: after a commit, display the committed value while (a) the live state is "close" to it
 * (the device confirmed - keep showing the user's exact numbers, which also preserves hue
 * memory on white/black colors forever), or (b) the settle window is still open (the device is
 * mid-fade). Only when live is meaningfully different after the window (someone else changed
 * it) does the display follow the live state again - and it snaps back to the committed value
 * if live later returns close to it.
 *
 * A command the server refuses is not a slow device, so callers `cancel()` it: without that the
 * "close" rule hides the failure completely at low brightness, where every hue is the same
 * near-black in RGB and a rejected value would sit on screen forever.
 *
 * The rule above only covers a value THIS control commanded. The same device does the same
 * thing when a rule, a scene or another panel changes it, and then there is no committed value
 * to hold - so the live state is read through `useSteadyValue` first, which holds the start of
 * a burst of changes until it settles. Doing it here rather than at each call site is the point:
 * this is the one place that decides what a control displays, and a control added later cannot
 * forget it. `liveKey` identifies the live value for that (see the hook).
 */
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
  // Re-render once when the settle window closes, so an unconfirmed value stops sticking
  // even if no further state events arrive.
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
    // The device never took this value: stop showing it. Guarded against dropping a newer
    // commit the user made while the failed one was still in flight.
    cancel: (v: T) => setPending((p) => (p && p.v === v ? null : p))
  }
}
