/**
 * Live item-state tracker over the `/rest/events/states` SSE endpoint.
 *
 * Flow: open the stream, receive a `ready` event carrying a connection id, then POST the list
 * of item names to track to `/rest/events/states/{id}`. The server then pushes state deltas
 * only for those items - far cheaper than subscribing to the full event firehose, which matters
 * on constrained servers and wall tablets.
 *
 * Wire format (observed on openHAB 4.3):
 *   event: ready\n   data: <connectionId>
 *   event: alive\n   data: {"type":"ALIVE","interval":10}
 *   data: {"Item_Name":{"state":"1","numericState":1.0,"type":"Decimal"}, ...}
 */
import type { ItemState } from './types'

export type StateMap = Record<string, ItemState>
type Listener = (states: StateMap) => void

/** The server heartbeats every ~10s; treat a socket silent for longer than this as dead. */
const STALE_AFTER_MS = 35_000

export class StatesTracker {
  private source: EventSource | null = null
  private connectionId: string | null = null
  private tracked = new Set<string>()
  private listeners = new Set<Listener>()
  private reconnectDelay = 1000
  private closed = false
  private lastEventAt = 0
  private watchdog: ReturnType<typeof setInterval> | null = null

  onStates(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Replace the set of tracked items. Safe to call before the connection is ready. */
  setTracked(items: Iterable<string>): void {
    this.tracked = new Set(items)
    void this.pushTracked()
  }

  start(): void {
    this.closed = false
    if (!this.source) this.connect()
    // A dropped connection does not always fire onerror (e.g. network path dies silently);
    // the heartbeat watchdog forces a reconnect so wall panels never show stale-but-live data.
    this.watchdog ??= setInterval(() => {
      if (this.closed || !this.source) return
      if (Date.now() - this.lastEventAt > STALE_AFTER_MS) {
        this.source.close()
        this.source = null
        this.connectionId = null
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
    this.source?.close()
    this.source = null
    this.connectionId = null
  }

  private connect(): void {
    if (this.closed) return
    this.lastEventAt = Date.now()
    const source = new EventSource('/rest/events/states')
    this.source = source

    source.addEventListener('ready', (e) => {
      this.lastEventAt = Date.now()
      this.connectionId = (e as MessageEvent<string>).data
      this.reconnectDelay = 1000
      void this.pushTracked()
    })

    source.addEventListener('alive', () => {
      this.lastEventAt = Date.now()
    })

    source.onmessage = (e) => {
      this.lastEventAt = Date.now()
      if (!e.data) return
      try {
        const states = JSON.parse(e.data) as StateMap
        for (const listener of this.listeners) listener(states)
      } catch {
        /* ignore malformed frames */
      }
    }

    source.onerror = () => {
      source.close()
      this.source = null
      this.connectionId = null
      if (this.closed) return
      setTimeout(() => this.connect(), this.reconnectDelay)
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000)
    }
  }

  private async pushTracked(): Promise<void> {
    if (!this.connectionId) return
    try {
      await fetch('/rest/events/states/' + this.connectionId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([...this.tracked]),
      })
    } catch {
      /* will be retried on next setTracked or reconnect */
    }
  }
}
