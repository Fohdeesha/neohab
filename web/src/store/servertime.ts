/**
 * The openHAB server's clock, as this device measures it.
 *
 * One `HEAD /rest/` per sync: the response's `Date` header is the server's own clock, `/rest/`
 * declares no required role so it answers even on a token-only server, and a HEAD carries no body.
 * See `model/servertime.ts` for why one reading is enough and what its limits are.
 *
 * Shared by every clock on the page rather than run per widget, and the last good reading is kept
 * per device so a second tab, or the same tab reopened, draws the corrected time immediately
 * instead of showing this machine's clock until the first request lands. The periodic sync runs
 * only while a widget that needs it is on screen, so a dashboard without a server-sourced clock
 * makes no requests at all.
 */
import { create } from 'zustand'
import { applyAuthHeader, applyProxyAuth, getAccessToken } from '../api/auth'
import { ohUrl } from '../api/base'
import { offsetFromReading, type ClockReading } from '../model/servertime'

/** How often to re-read while a server-sourced clock is on screen. Two clocks drift slowly. */
const SYNC_INTERVAL_MS = 5 * 60_000
/** A reading older than this is not used at startup; the clock shows this device's until one lands. */
const CACHE_MAX_AGE_MS = 30 * 60_000
/** Coming back to a hidden tab re-reads if the last one is older than this: a laptop that has been
 *  asleep is exactly when its clock is worth doubting. */
const WAKE_STALE_MS = 60_000
/** A request that has not answered by now is treated as a failure rather than left hanging. */
const REQUEST_TIMEOUT_MS = 8000

const CACHE_KEY = 'neohab:serverClock'

export interface ServerTimeState {
  /** How far ahead of this device the server is, or null when nothing has been read yet. */
  offsetMs: number | null
  /** Device clock when that reading was taken, or null. */
  at: number | null
  /** Round trip of the reading it came from, for the sheet to qualify the number with. */
  roundTripMs: number | null
  /** True while a request is in flight. */
  syncing: boolean
  /** Set when the last attempt failed, cleared by the next success. */
  failed: boolean
}

interface Cached {
  offsetMs: number
  at: number
}

function readCache(): Cached | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const { offsetMs, at } = parsed as Record<string, unknown>
    if (typeof offsetMs !== 'number' || !Number.isFinite(offsetMs)) return null
    if (typeof at !== 'number' || !Number.isFinite(at)) return null
    // A negative age means this device's clock was put BACK since the reading was written, which
    // is the one event most likely to have changed the offset. Either way it is not usable.
    const age = Date.now() - at
    if (age < 0 || age > CACHE_MAX_AGE_MS) return null
    return { offsetMs, at }
  } catch {
    return null
  }
}

function writeCache(offsetMs: number, at: number): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ offsetMs, at }))
  } catch {
    // storage unavailable (private mode): the reading still holds for this page load
  }
}

const cached = readCache()

export const useServerTimeStore = create<ServerTimeState>(() => ({
  offsetMs: cached?.offsetMs ?? null,
  at: cached?.at ?? null,
  roundTripMs: null,
  syncing: false,
  failed: false
}))

/**
 * One reading of the server's clock.
 *
 * The header is read whatever the status: a 401 from a server with no anonymous role still came
 * from that server and still carries its clock, and refusing to look would make the feature
 * unavailable on exactly the installs most likely to be carefully run.
 */
async function readServerClock(): Promise<ClockReading | null> {
  const headers = new Headers()
  applyProxyAuth(headers)
  const token = await getAccessToken()
  if (token) applyAuthHeader(headers, token)

  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS)
  try {
    const sent = Date.now()
    // no-store so an intermediate cache cannot answer with a Date from some earlier minute
    const res = await fetch(ohUrl('/rest/'), {
      method: 'HEAD',
      headers,
      cache: 'no-store',
      signal: abort.signal
    })
    const received = Date.now()
    const header = res.headers.get('Date')
    if (!header) return null
    const serverSecond = Date.parse(header)
    if (!Number.isFinite(serverSecond)) return null
    return { sent, received, serverSecond }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

let inFlight: Promise<void> | null = null
/** Identifies the run that owns `inFlight`, so only that run may clear it. */
let inFlightToken = 0

/**
 * Read the server's clock once, updating the shared offset.
 *
 * Concurrent callers share the request: several clocks mounting together, or a detail sheet
 * opening while the interval fires, must not each ask.
 */
export function syncServerTime(): Promise<void> {
  if (inFlight) return inFlight
  const token = ++inFlightToken
  useServerTimeStore.setState({ syncing: true })
  const run = (async () => {
    const reading = await readServerClock()
    const offsetMs = reading ? offsetFromReading(reading) : null
    if (reading && offsetMs !== null) {
      const at = reading.received
      useServerTimeStore.setState({
        offsetMs,
        at,
        roundTripMs: reading.received - reading.sent,
        syncing: false,
        failed: false
      })
      writeCache(offsetMs, at)
    } else {
      // The previous reading is kept: a clock that has been right for four minutes should not
      // fall back to this device's time because one request was refused.
      useServerTimeStore.setState({ syncing: false, failed: true })
    }
  })()
  // Cleared by token rather than by comparing promises: `run.finally(...)` returns a NEW promise,
  // so a guard written as `inFlight === run` never matches the value that was stored and the
  // store freezes on its first result for good.
  const wrapper = run.finally(() => {
    if (inFlightToken === token) inFlight = null
  })
  inFlight = wrapper
  return wrapper
}

let users = 0
let timer: ReturnType<typeof setInterval> | null = null

function onVisible(): void {
  if (document.visibilityState !== 'visible') return
  const { at } = useServerTimeStore.getState()
  if (at === null || Date.now() - at > WAKE_STALE_MS) void syncServerTime()
}

/**
 * Keep the offset up to date while at least one caller needs it. Reference-counted, so the
 * interval and the wake listener exist exactly while a server-sourced clock is on screen.
 */
export function acquireServerTime(): () => void {
  users += 1
  if (users === 1) {
    void syncServerTime()
    timer = setInterval(() => void syncServerTime(), SYNC_INTERVAL_MS)
    document.addEventListener('visibilitychange', onVisible)
  } else {
    // A clock mounting later than the first still wants a reading if the cache was too old to use.
    if (useServerTimeStore.getState().at === null) void syncServerTime()
  }
  let released = false
  return () => {
    if (released) return
    released = true
    users -= 1
    if (users === 0) {
      if (timer) clearInterval(timer)
      timer = null
      document.removeEventListener('visibilitychange', onVisible)
    }
  }
}
