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
  private items = new Set<string>()
  private opened: Promise<void> = Promise.resolve()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = 1000

  constructor(private onReport: (item: string, value: string) => void) {}

  /** listening for all of these, reopening if needed; settles once open or after a bound either way */
  listen(names: Iterable<string>): Promise<void> {
    const wanted = [...names].filter((n) => ITEM_NAME.test(n))
    if (this.source && wanted.every((n) => this.items.has(n))) return this.opened
    for (const n of wanted) this.items.add(n)
    this.connect()
    return this.opened
  }

  close(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.source?.close()
    this.source = null
    this.items.clear()
  }

  private connect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.source?.close()
    this.source = null
    if (this.items.size === 0) return
    const topics = [...this.items].sort().map((n) => `openhab/items/${n}/state`)
    const source = new EventSource(ohUrl('/rest/events?topics=') + encodeURIComponent(topics.join(',')))
    this.source = source
    let settle = () => {}
    this.opened = new Promise<void>((resolve) => {
      const done = setTimeout(resolve, OPEN_WAIT_MS)
      settle = () => {
        clearTimeout(done)
        resolve()
      }
    })
    source.onopen = () => {
      this.reconnectDelay = 1000
      settle()
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
      // a stream the server refuses must not hold up the command that is waiting on it
      settle()
      source.close()
      if (this.source !== source) return
      this.source = null
      if (this.reconnectTimer || this.items.size === 0) return
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null
        this.connect()
      }, this.reconnectDelay)
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000)
    }
  }
}
