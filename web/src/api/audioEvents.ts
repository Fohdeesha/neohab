import { ohUrl } from './base'
import { api } from './client'

const TOPIC = 'openhab/webaudio/playurl'
const STALE_AFTER_MS = 35_000

let sinkProbe: Promise<boolean> | null = null
export function hasWebAudioSink(): Promise<boolean> {
  sinkProbe ??= api
    .get<{ id?: string }[]>('/rest/audio/sinks')
    .then((sinks) => (Array.isArray(sinks) ? sinks.some((s) => s.id === 'webaudio') : true))
    .catch(() => true)
  return sinkProbe
}

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
        // ignore malformed frames
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
