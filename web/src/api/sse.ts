import { ohUrl } from './base'
import { api } from './client'
import type { ItemState } from './types'

export type StateMap = Record<string, ItemState>
type Listener = (states: StateMap) => void
type StatusListener = (live: boolean) => void

const STALE_AFTER_MS = 35_000
const PUSH_TIMEOUT_MS = 15_000

export class StatesTracker {
  private source: EventSource | null = null
  private connectionId: string | null = null
  private tracked = new Set<string>()
  private listeners = new Set<Listener>()
  private statusListeners = new Set<StatusListener>()
  private live = false
  private reconnectDelay = 1000
  private closed = false
  private lastEventAt = 0
  private contacted = false
  private watchdog: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  onStates(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener)
    listener(this.live)
    return () => this.statusListeners.delete(listener)
  }

  private setLive(live: boolean): void {
    if (this.live === live) return
    this.live = live
    for (const l of this.statusListeners) l(live)
  }

  private pushTimer: ReturnType<typeof setTimeout> | null = null

  setTracked(items: Iterable<string>): void {
    this.tracked = new Set(items)
    if (this.pushTimer) clearTimeout(this.pushTimer)
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null
      void this.pushTracked()
    }, 250)
  }

  start(): void {
    this.closed = false
    if (!this.source) this.connect()
    this.watchdog ??= setInterval(() => {
      // only rescue a stream that has been alive - one still queued behind the socket limit would just go to the
      // back of the queue
      if (this.closed || !this.source || !this.contacted) return
      if (Date.now() - this.lastEventAt > STALE_AFTER_MS) {
        this.source.close()
        this.source = null
        this.connectionId = null
        this.contacted = false
        this.setLive(false)
        this.connect()
      }
    }, 10_000)
  }

  stop(): void {
    this.closed = true
    if (this.watchdog) {
      clearInterval(this.watchdog)
      this.watchdog = null
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.pushTimer) {
      clearTimeout(this.pushTimer)
      this.pushTimer = null
    }
    this.source?.close()
    this.source = null
    this.connectionId = null
    this.contacted = false
    this.setLive(false)
  }

  private connect(): void {
    if (this.closed || this.source) return // never run two streams at once
    this.lastEventAt = Date.now()
    const source = new EventSource(ohUrl('/rest/events/states'))
    this.source = source

    source.addEventListener('ready', (e) => {
      this.lastEventAt = Date.now()
      this.contacted = true
      this.connectionId = (e as MessageEvent<string>).data
      this.reconnectDelay = 1000
      void this.pushTracked()
    })

    source.addEventListener('alive', () => {
      this.lastEventAt = Date.now()
      this.contacted = true
    })

    source.onmessage = (e) => {
      this.lastEventAt = Date.now()
      this.contacted = true
      if (!e.data) return
      try {
        const states = JSON.parse(e.data) as StateMap
        for (const listener of this.listeners) listener(states)
      } catch {
        // ignore malformed frames
      }
    }

    source.onerror = () => {
      source.close()
      // a late error from a stream the watchdog already replaced must not clear the live one's connection id
      if (this.source !== source) return
      this.source = null
      this.connectionId = null
      this.contacted = false
      this.setLive(false)
      if (this.closed || this.reconnectTimer) return
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null
        this.connect()
      }, this.reconnectDelay)
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000)
    }
  }

  private async pushTracked(): Promise<void> {
    if (!this.connectionId) return // the ready handler pushes as soon as there is one
    const connection = this.connectionId
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), PUSH_TIMEOUT_MS)
    try {
      // through the api client, not a bare fetch: this POST needs the token and any proxy credentials to get through
      await api.post('/rest/events/states/' + connection, [...this.tracked], {
        signal: controller.signal
      })
      if (connection !== this.connectionId) return
      this.setLive(true)
    } catch {
      if (connection !== this.connectionId) return
      this.setLive(false)
      if (!this.closed && !this.pushTimer) {
        this.pushTimer = setTimeout(() => {
          this.pushTimer = null
          void this.pushTracked()
        }, 2000)
      }
    } finally {
      clearTimeout(timeout)
    }
  }
}
