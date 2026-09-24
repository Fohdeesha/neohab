// A refresh period out of stored configuration. `setInterval(fn, NaN)` fires about every 4ms, a period
// of 0.01s every 10ms, and anything over ~24.8 days overflows to 1ms - each one floods whatever it asks.
const MAX_TIMER_MS = 2_147_483_647

// a refresh that is off unless it is a positive number of seconds; a day at most, a second at least
export function refreshMs(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
  if (!Number.isFinite(n) || n <= 0) return null
  return intervalMs(n, { unit: 's', min: 1, max: 86_400, fallback: 60 })
}

export function intervalMs(value: unknown, opts: { unit: 's' | 'ms'; min: number; max: number; fallback: number }): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
  const scale = opts.unit === 's' ? 1000 : 1
  if (!Number.isFinite(n)) return opts.fallback * scale
  const clamped = Math.min(opts.max, Math.max(opts.min, n))
  return Math.min(MAX_TIMER_MS, Math.round(clamped * scale))
}
