import type { ItemState } from '../../api/types'

export function displayValue(state: ItemState | undefined, fallback = '-'): string {
  if (!state) return fallback
  return state.displayState ?? state.state ?? fallback
}

export function splitValueUnit(text: string): { num: string; unit?: string } {
  const m = /^(-?\d[\d.,]*)\s*(\D{1,8})?$/.exec(text.trim())
  if (!m || !/\d$/.test(m[1])) return { num: text }
  const unit = m[2]?.trim()
  return unit ? { num: m[1], unit } : { num: m[1] }
}

export function segParts(num: string): { int: string; frac?: string } {
  const m = /^(-?\d+[.,])(\d)$/.exec(num)
  return m ? { int: m[1], frac: m[2] } : { int: num }
}

export function ghostFor(text: string): string | undefined {
  return /\d/.test(text) ? text.replace(/\d/g, '8') : undefined
}

export function isSegmentable(text: string): boolean {
  return /^-?[\d.,: ]+$/.test(text) && /\d/.test(text)
}

export function numericValue(state: ItemState | undefined): number | undefined {
  if (!state) return undefined
  if (typeof state.numericState === 'number') return state.numericState
  const n = parseFloat(state.state)
  return Number.isNaN(n) ? undefined : n
}

export function isOn(state: ItemState | undefined): boolean {
  if (!state) return false
  const raw = state.state
  if (raw === 'ON') return true
  if (raw === 'OFF') return false
  if (typeof raw !== 'string') return false
  const parts = raw.split(',')
  const level = parseFloat(parts[parts.length - 1])
  return !Number.isNaN(level) && level > 0
}
