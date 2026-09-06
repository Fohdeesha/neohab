import { stepDecimals } from './itemControl'
import type { NumericScale } from './itemControl'

export function snapToStep(v: number, step: number): number {
  return Number(v.toFixed(stepDecimals(step)))
}

export function stepNumber(current: number | undefined, dir: 1 | -1, scale: NumericScale): number {
  if (current === undefined || !Number.isFinite(current)) return scale.min
  const next = snapToStep(current + dir * scale.step, scale.step)
  return Math.min(scale.max, Math.max(scale.min, next))
}

export function atLimit(current: number | undefined, dir: 1 | -1, scale: NumericScale): boolean {
  if (current === undefined || !Number.isFinite(current)) return false
  return dir > 0 ? current >= scale.max : current <= scale.min
}

export function fractionOf(v: number | undefined, scale: NumericScale): number {
  if (v === undefined || !Number.isFinite(v)) return 0
  const f = (v - scale.min) / (scale.max - scale.min)
  return Math.min(1, Math.max(0, Number.isFinite(f) ? f : 0))
}

export function sameCommand(a: string, b: string): boolean {
  if (a === b) return true
  if (a.trim() === '' || b.trim() === '') return false
  const x = Number(a)
  const y = Number(b)
  return Number.isFinite(x) && Number.isFinite(y) && x === y
}
