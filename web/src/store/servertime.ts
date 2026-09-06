import { create } from 'zustand'
import { applyAuthHeader, applyProxyAuth, getAccessToken } from '../api/auth'
import { ohUrl } from '../api/base'
import { offsetFromReading, type ClockReading } from '../model/servertime'

const SYNC_INTERVAL_MS = 5 * 60_000
const CACHE_MAX_AGE_MS = 30 * 60_000
const WAKE_STALE_MS = 60_000
const REQUEST_TIMEOUT_MS = 8000

const CACHE_KEY = 'neohab:serverClock'

export interface ServerTimeState {
  offsetMs: number | null
  at: number | null
  roundTripMs: number | null
  syncing: boolean
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
    // storage unavailable (private mode)
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

async function readServerClock(): Promise<ClockReading | null> {
  const headers = new Headers()
  applyProxyAuth(headers)
  const token = await getAccessToken()
  if (token) applyAuthHeader(headers, token)

  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS)
  try {
    const sent = Date.now()
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
let inFlightToken = 0

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
      useServerTimeStore.setState({ syncing: false, failed: true })
    }
  })()
  // cleared by token: `run.finally(...)` returns a NEW promise, so a `inFlight === run` guard never matches
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

export function acquireServerTime(): () => void {
  users += 1
  if (users === 1) {
    void syncServerTime()
    timer = setInterval(() => void syncServerTime(), SYNC_INTERVAL_MS)
    document.addEventListener('visibilitychange', onVisible)
  } else {
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
