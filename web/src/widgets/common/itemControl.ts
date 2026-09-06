export interface ItemChoice {
  command: string
  labelKey?: string
  label?: string
}

export interface ItemRange extends NumericScale {
  kind: 'range'
  unit?: string
}

export type ItemControl =
  | { kind: 'auto' }
  | ItemRange
  | { kind: 'onoff'; on: string; off: string }
  | { kind: 'choices'; choices: ItemChoice[] }
  | { kind: 'color'; power?: boolean }

export function finiteOr(v: unknown, fallback: number): number {
  if (typeof v === 'string' && v.trim() === '') return fallback
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : fallback
}

export interface NumericScale {
  min: number
  max: number
  step: number
}

export function numericScale(min: unknown, max: unknown, step: unknown): NumericScale {
  const lo = finiteOr(min, 0)
  const hi = finiteOr(max, 100)
  const rawStep = finiteOr(step, 1)
  return { min: lo, max: hi > lo ? hi : lo + 100, step: rawStep > 0 ? rawStep : 1 }
}

export function rangeControl(scale: NumericScale, unit: unknown): ItemRange {
  return { ...scale, kind: 'range', unit: typeof unit === 'string' && unit !== '' ? unit : undefined }
}

export function commandOr(v: unknown, fallback: string): string {
  return typeof v === 'string' && v !== '' ? v : fallback
}

export function stepDecimals(step: number): number {
  const dot = String(step).indexOf('.')
  return dot < 0 ? 0 : Math.min(6, String(step).length - dot - 1)
}
