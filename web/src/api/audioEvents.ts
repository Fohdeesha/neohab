/**
 * Listener for openHAB's web-audio events on the classic SSE endpoint.
 *
 * Rules that play a sound through the "Web Audio" sink make the server publish a
 * `PlayURLEvent` on topic `openhab/webaudio/playurl`; the payload is the (JSON-encoded) URL of
 * a temporarily served audio stream, or an empty string meaning "stop whatever is playing".
 * These events do NOT arrive on the `/rest/events/states` item tracker the rest of the app
 * uses - they need their own subscription to the topic-filtered event firehose.
 *
 * Resilience: EventSource's built-in retry, an exponential-backoff reconnect on error, and a
 * staleness watchdog for silently black-holed connections. The watchdog only arms once this
 * connection has actually produced a heartbeat (`alive` events, observed every ~10s on
 * openHAB 4.3) - a server that never heartbeats must not be "rescued" into a reconnect loop.
 */
import { ohUrl } from './base'
import { api } from './client'

const TOPIC = 'openhab/webaudio/playurl'
const STALE_AFTER_MS = 35_000

/**
 * Whether this server has the web audio sink at all. Without it no PlayURLEvent can ever be
 * published, and holding a permanent connection open for events that cannot happen wastes one
 * of the browser's six per-origin sockets. Asked once per session; on any doubt (endpoint
 * missing, request failed) we assume it is there and behave as before.
 */
let sinkProbe: Promise<boolean> | null = null
export function hasWebAudioSink(): Promise<boolean> {
  sinkProbe ??= api
    .get<{ id?: string }[]>('/rest/audio/sinks')
    .then((sinks) => (Array.isArray(sinks) ? sinks.some((s) => s.id === 'webaudio') : true))
    .catch(() => true)
  return sinkProbe
}

/**
 * Ask again after the credentials change. A device that looked at `/rest/audio/sinks` while
 * signed out, on a server that role-gates it, would otherwise keep the anonymous answer for the
 * whole session. `api/persistence.ts` has the same shape for the same reason.
 */
export function forgetWebAudioSink(): void {
  sinkProbe = null
}

interface SseEnvelope {
  topic?: string
  payload?: string
}

export class AudioEventSource {
  private source: EventSource | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private watchdog: ReturnType<typeof setInterval> | null = null
  private reconnectDelay = 1000
  private closed = true
  private lastEventAt = 0
  private heartbeats = false

  constructor(private onUrl: (url: string) => void) {}

  start(): void {
    this.closed = false
    this.connect()
    this.watchdog ??= setInterval(() => {
      if (this.closed || !this.source || !this.heartbeats) return
      if (Date.now() - this.lastEventAt > STALE_AFTER_MS) {
        this.source.close()
        this.source = null
        this.heartbeats = false
        this.connect()
      }
    }, 10_000)
  }

  stop(): void {
    this.closed = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.watchdog) {
      clearInterval(this.watchdog)
      this.watchdog = null
    }
    this.source?.close()
    this.source = null
  }

  private connect(): void {
    if (this.closed || this.source) return
    this.lastEventAt = Date.now()
    this.heartbeats = false
    const source = new EventSource(ohUrl('/rest/events?topics=') + encodeURIComponent(TOPIC))
    this.source = source

    source.onopen = () => {
      this.reconnectDelay = 1000
    }

    source.addEventListener('alive', () => {
      this.lastEventAt = Date.now()
      this.heartbeats = true
    })

    source.onmessage = (e) => {
      this.lastEventAt = Date.now()
      if (!e.data) return
      try {
        const evt = JSON.parse(e.data) as SseEnvelope
        if (evt.topic !== TOPIC || typeof evt.payload !== 'string') return
        const url = JSON.parse(evt.payload) as unknown
        if (typeof url === 'string') this.onUrl(url)
      } catch {
        /* ignore malformed frames */
      }
    }

    source.onerror = () => {
      source.close()
      if (this.source !== source) return // the watchdog already replaced this stream
      this.source = null
      if (this.closed || this.reconnectTimer) return
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null
        this.connect()
      }, this.reconnectDelay)
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000)
    }
  }
}
