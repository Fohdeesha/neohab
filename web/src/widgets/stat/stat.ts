import { lookup } from '../../model/lookup'

export const STAT_PERIODS: Record<string, number> = {
  '1h': 3600_000,
  '24h': 24 * 3600_000,
  '7d': 7 * 24 * 3600_000,
  '30d': 30 * 24 * 3600_000
}

export function statPeriodMs(period: string | undefined): number {
  return lookup(STAT_PERIODS, period) ?? STAT_PERIODS['24h']
}

export type TrendDirection = 'up' | 'down' | 'flat'
export type TrendTone = 'good' | 'bad' | 'neutral'

const DEADBAND = 0.005

export function trendDirection(current: number, reference: number): TrendDirection | null {
  if (!Number.isFinite(current) || !Number.isFinite(reference)) return null
  const delta = current - reference
  if (Math.abs(delta) <= Math.abs(reference) * DEADBAND) return 'flat'
  return delta > 0 ? 'up' : 'down'
}

export function trendTone(direction: TrendDirection, good: string | undefined): TrendTone {
  if (direction === 'flat' || (good !== 'up' && good !== 'down')) return 'neutral'
  return direction === good ? 'good' : 'bad'
}

export function referenceValue(points: { time: number; value: number }[], t0: number): number | undefined {
  let best: number | undefined
  for (const p of points) {
    if (!Number.isFinite(p?.value) || !Number.isFinite(p?.time)) continue
    if (p.time <= t0) best = p.value
    else if (best === undefined) return p.value // series begins after t0: its first known value
    else break
  }
  return best
}
