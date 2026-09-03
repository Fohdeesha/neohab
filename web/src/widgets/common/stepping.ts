/**
 * Stepping a number inside a range, shared by every widget that moves a value one step at a
 * time: the stepper, and the thermostat's setpoint. Written once here so a setpoint that steps
 * 16-30 by 0.5 behaves the same whichever tile it is on. Pure, and unit-checked with the stepper.
 */
import { stepDecimals } from './itemControl'
import type { NumericScale } from './itemControl'

/** A value on the step's own digits: what `72.1 + 0.2` has to read on a thermostat. */
export function snapToStep(v: number, step: number): number {
  return Number(v.toFixed(stepDecimals(step)))
}

/**
 * The value one press moves to. Nothing known yet (a NULL item) starts at the minimum whichever
 * way it is pressed; otherwise one step along, snapped, and held inside the range.
 */
export function stepNumber(current: number | undefined, dir: 1 | -1, scale: NumericScale): number {
  if (current === undefined || !Number.isFinite(current)) return scale.min
  const next = snapToStep(current + dir * scale.step, scale.step)
  return Math.min(scale.max, Math.max(scale.min, next))
}

/** True when a press in that direction has nowhere to go. An unknown value can always start. */
export function atLimit(current: number | undefined, dir: 1 | -1, scale: NumericScale): boolean {
  if (current === undefined || !Number.isFinite(current)) return false
  return dir > 0 ? current >= scale.max : current <= scale.min
}

/** Where a value sits in its range, 0..1, for the range bar. An unknown value sits at 0. */
export function fractionOf(v: number | undefined, scale: NumericScale): number {
  if (v === undefined || !Number.isFinite(v)) return 0
  const f = (v - scale.min) / (scale.max - scale.min)
  return Math.min(1, Math.max(0, Number.isFinite(f) ? f : 0))
}

/**
 * Two commands that mean the same state. Numerically tolerant because openHAB echoes `64` as
 * `64.0` and a Gson round trip writes `1` as `1.0`; the empty string is guarded first because
 * `Number('')` is 0 and would make "" the same as "0".
 */
export function sameCommand(a: string, b: string): boolean {
  if (a === b) return true
  if (a.trim() === '' || b.trim() === '') return false
  const x = Number(a)
  const y = Number(b)
  return Number.isFinite(x) && Number.isFinite(y) && x === y
}
