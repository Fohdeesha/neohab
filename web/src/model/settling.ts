/**
 * The rule for displaying a value that has just been commanded, while the device catches up.
 *
 * A light does not step to a commanded value. openHAB applies its own prediction at once, the
 * binding then echoes the channel's PRE-FADE readback, and the real value only lands when the
 * fade finishes. Measured on a DMX strip switching between two scenes, one activation produced
 * five state changes over 1.1 seconds: the new value, the old value back, two mid-fade values,
 * then the new value again. Drawing each one verbatim flashes the previous scene back over the
 * floor plan and blinks the preset chip on, off and on again before it settles.
 *
 * So a commanded value is displayed in place of the live state while either the settle window
 * is open (the device is mid-fade) or the live state already agrees with it (the device
 * confirmed - keep the commanded numbers rather than the device's rounding of them). A live
 * state that still disagrees once the window has closed wins, which is how somebody else's wall
 * switch takes over.
 *
 * The per-item form of the rule `useOptimisticValue` applies to one control the user is
 * holding. Pure; `store/settling.ts` holds the values it is applied to.
 */
import { commandMatchesState } from './presets'

/**
 * Longer than any fade measured here (1.1s on a DMX strip) so the whole of one is covered, and
 * short enough that a command a device never took stops being shown promptly.
 */
export const SETTLE_MS = 3000

export interface Settling {
  command: string
  at: number
}

export function settledDisplay(pending: Settling | undefined, live: string | undefined, now: number): string | undefined {
  if (!pending) return live
  if (now - pending.at < SETTLE_MS) return pending.command
  return commandMatchesState(pending.command, live) ? pending.command : live
}
