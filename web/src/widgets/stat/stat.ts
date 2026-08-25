/**
 * Pure model for the stat widget: which way a reading has moved, and whether that is good
 * news. No React, no DOM - unit-testable arithmetic, so the drawn arrow and the stored config
 * cannot drift apart.
 */
import { lookup } from '../../model/lookup'

/** Windows offered for a history-based comparison. */
export const STAT_PERIODS: Record<string, number> = {
  '1h': 3600_000,
  '24h': 24 * 3600_000,
  '7d': 7 * 24 * 3600_000,
  '30d': 30 * 24 * 3600_000,
}

export function statPeriodMs(period: string | undefined): number {
  // Through `lookup` because the id is stored widget configuration - see model/lookup.ts.
  return lookup(STAT_PERIODS, period) ?? STAT_PERIODS['24h']
}

export type TrendDirection = 'up' | 'down' | 'flat'
/** Whether the movement is good news, bad news, or carries no judgement. */
export type TrendTone = 'good' | 'bad' | 'neutral'

/**
 * Movement is only called when it is worth calling: a change under half a percent of the
 * reference reads as flat, so a sensor that wobbles in its last digit does not flip the arrow
 * on every update. A zero reference has no scale to be relative to, so any change counts.
 */
const DEADBAND = 0.005

export function trendDirection(current: number, reference: number): TrendDirection | null {
  if (!Number.isFinite(current) || !Number.isFinite(reference)) return null
  const delta = current - reference
  if (Math.abs(delta) <= Math.abs(reference) * DEADBAND) return 'flat'
  return delta > 0 ? 'up' : 'down'
}

/**
 * The tone an arrow is drawn in. Direction and judgement are deliberately separate: on a
 * drop-off rate a fall is good news and on a response rate a rise is, so the same downward
 * arrow is green on one tile and red on the next - exactly as a real operations board reads.
 */
export function trendTone(direction: TrendDirection, good: string | undefined): TrendTone {
  if (direction === 'flat' || (good !== 'up' && good !== 'down')) return 'neutral'
  return direction === good ? 'good' : 'bad'
}

/**
 * The value in force at the start of the window, from a history series (sample-and-hold: a
 * stored sample holds until the next one). Persistence is asked with `boundary`, so the first
 * point is normally the state as it was at t0; a series that starts later still answers with
 * its earliest known value rather than nothing.
 */
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
