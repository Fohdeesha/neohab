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
import { ohUrl } from './base'
import { api } from './client'
import type { ItemState } from './types'

export type StateMap = Record<string, ItemState>
type Listener = (states: StateMap) => void
type StatusListener = (live: boolean) => void

/** The server heartbeats every ~10s; treat a socket silent for longer than this as dead. */
const STALE_AFTER_MS = 35_000
/**
 * Give up on a tracked-items POST after this long. It is not enough for the stream to be open:
 * until this request lands the server does not know which items to send, so a POST left pending
 * forever (a socket-starved origin never rejects, it just queues) means permanently dead
 * widgets. Timing out lets the retry take a fresh place in the queue.
 */
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

  /**
   * Whether item states are actually flowing: the stream is up AND the server has been told
   * what to track. Drives the "live updates unavailable" notice.
   */
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

  /**
   * Replace the set of tracked items. Safe to call before the connection is ready.
   * Debounced: rapid changes (mount storms, typing in an item picker) collapse to one POST.
   */
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
    // A dropped connection does not always fire onerror (e.g. network path dies silently);
    // the heartbeat watchdog forces a reconnect so wall panels never show stale-but-live data.
    this.watchdog ??= setInterval(() => {
      // Only rescue a stream that has actually produced something. A connection still queued
      // behind the browser's per-origin socket limit has never been alive, and tearing it down
      // every 35s only sends it to the back of that queue again.
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
    // A reconnect queued before stop() would otherwise still fire after the next start(),
    // opening a second stream alongside it and orphaning the first.
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
        /* ignore malformed frames */
      }
    }

    source.onerror = () => {
      source.close()
      // A late error from a stream the watchdog already replaced must not clear the live one's
      // connection id: the replacement would keep receiving events the tracker no longer knows
      // how to configure, and no state would ever arrive again.
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
    // Which connection this push is for. A stream that reconnects while a push is in flight
    // gives us a new id, and the old push's answer says nothing about the new connection: on
    // success it would report live for a connection that is gone, and on failure it would
    // report dead over the state the new connection's own push had just set correctly.
    const connection = this.connectionId
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), PUSH_TIMEOUT_MS)
    try {
      // Through the api client, not a bare fetch: this POST is what tells the server which items
      // to push, so it has to carry whatever the request needs to get through - an openHAB token
      // on a server with no anonymous role, and a reverse proxy's own credentials.
      await api.post('/rest/events/states/' + connection, [...this.tracked], {
        signal: controller.signal,
      })
      if (connection !== this.connectionId) return
      this.setLive(true)
    } catch {
      if (connection !== this.connectionId) return
      // A widget would silently never get updates if this were dropped - retry shortly
      // (unless something else already queued a push).
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
