import { ohUrl } from './base'

const OPEN_WAIT_MS = 1500
// an item name is \w+ in openHAB, and anything else would make the server refuse the whole filter
const ITEM_NAME = /^\w+$/

interface SseEnvelope {
  topic?: unknown
  payload?: unknown
}

/**
 * Every state update for a few items, including the ones that change nothing. The states tracker
 * is fed from ItemStateChangedEvent alone, so a device that answers a command by confirming the
 * state it already had is only heard here.
 */
export class ReportStream {
  private source: EventSource | null = null
  private open = false
  private items = new Set<string>()
  private waiters = new Set<() => void>()
  private scheduled = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = 1000

  constructor(
    private onReport: (item: string, value: string) => void,
    private makeSource: (url: string) => EventSource = (url) => new EventSource(url)
  ) {}

  /**
   * Listening for all of these, reopening if needed; settles once open, or after a bound either way.
   * Everything asked for in one tick shares one reconnect: five commands a preset sends at once used to
   * tear down each other's stream, and all but the last waited out the bound.
   */
  listen(names: Iterable<string>): Promise<void> {
    const wanted = [...names].filter((n) => ITEM_NAME.test(n))
    const known = wanted.every((n) => this.items.has(n))
    if (known && this.source && !this.scheduled) return this.open ? Promise.resolve() : this.nextOpen()
    for (const n of wanted) this.items.add(n)
    if (!this.scheduled) {
      this.scheduled = true
      queueMicrotask(() => {
        this.scheduled = false
        this.connect()
      })
    }
    return this.nextOpen()
  }

  close(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.source?.close()
    this.source = null
    this.open = false
    this.items.clear()
    this.settleWaiters()
  }

  private nextOpen(): Promise<void> {
    return new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer)
        this.waiters.delete(done)
        resolve()
      }
      const timer = setTimeout(done, OPEN_WAIT_MS)
      this.waiters.add(done)
    })
  }

  private settleWaiters(): void {
    for (const w of [...this.waiters]) w()
  }

  private connect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.source?.close()
    this.source = null
    this.open = false
    if (this.items.size === 0) {
      this.settleWaiters()
      return
    }
    const topics = [...this.items].sort().map((n) => `openhab/items/${n}/state`)
    const source = this.makeSource(ohUrl('/rest/events?topics=') + encodeURIComponent(topics.join(',')))
    this.source = source
    source.onopen = () => {
      if (this.source !== source) return
      this.open = true
      this.reconnectDelay = 1000
      this.settleWaiters()
    }

    source.onmessage = (e) => {
      if (!e.data) return
      try {
        const evt = JSON.parse(e.data as string) as SseEnvelope
        if (typeof evt.topic !== 'string' || typeof evt.payload !== 'string') return
        const parts = evt.topic.split('/')
        if (parts.length !== 4 || parts[0] !== 'openhab' || parts[1] !== 'items' || parts[3] !== 'state') return
        const payload = JSON.parse(evt.payload) as { value?: unknown }
        if (typeof payload.value === 'string') this.onReport(parts[2], payload.value)
      } catch {
        // ignore malformed frames
      }
    }

    source.onerror = () => {
      source.close()
      if (this.source !== source) return
      // a stream the server refuses must not hold up the commands that are waiting on it
      this.settleWaiters()
      this.source = null
      this.open = false
      if (this.reconnectTimer || this.items.size === 0) return
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null
        this.connect()
      }, this.reconnectDelay)
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000)
    }
  }
}
