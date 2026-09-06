import { getAccessToken } from './auth'
import { ohUrl } from './base'
import { getRootInfo } from './items'
import {
  filterMessage,
  keepaliveMessage,
  logSocketUrl,
  parseFrame,
  protocolFor,
  type LogEntry,
  type LogProtocol
} from '../widgets/log/model'

export type LogSocketStatus =
  | 'idle' // not asked for
  | 'connecting'
  | 'live'
  | 'refused' // the last attempt never opened: refused by the server, or the server is unreachable
  | 'down' // it was open and dropped; a retry is scheduled

export interface LogSocketHandlers {
  onEntries: (entries: LogEntry[]) => void
  onStatus: (status: LogSocketStatus) => void
}

const KEEPALIVE_MS = 8000
const RETRY_MIN_MS = 1000
const RETRY_MAX_MS = 30_000
const RETRY_REFUSED_MS = 60_000

let protocolProbe: Promise<LogProtocol> | null = null

function logProtocol(): Promise<LogProtocol> {
  protocolProbe ??= getRootInfo()
    .then((info) => protocolFor(info.runtimeInfo?.version ?? info.version))
    .catch(() => {
      protocolProbe = null
      return 'object' as const
    })
  return protocolProbe
}

export class LogSocket {
  private ws: WebSocket | null = null
  private closed = true
  private opened = false
  private lastSeq: number | undefined
  private nextId = 1
  private retryDelay = RETRY_MIN_MS
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private keepalive: ReturnType<typeof setInterval> | null = null
  private generation = 0

  constructor(private handlers: LogSocketHandlers) {}

  start(): void {
    if (!this.closed) return
    this.closed = false
    void this.connect()
  }

  stop(): void {
    this.closed = true
    this.generation++
    this.clearTimers()
    const ws = this.ws
    this.ws = null
    ws?.close()
    this.handlers.onStatus('idle')
  }

  restart(): void {
    this.stop()
    this.retryDelay = RETRY_MIN_MS
    this.start()
  }

  private clearTimers(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    if (this.keepalive) {
      clearInterval(this.keepalive)
      this.keepalive = null
    }
  }

  private async connect(): Promise<void> {
    const gen = ++this.generation
    this.handlers.onStatus('connecting')
    const [protocol, token] = await Promise.all([logProtocol(), getAccessToken()])
    if (this.closed || gen !== this.generation) return

    let ws: WebSocket
    try {
      ws = new WebSocket(logSocketUrl(window.location.href, ohUrl('/ws/logs'), token))
    } catch {
      // a malformed address is the one way the constructor throws, so treat it as a refusal
      this.schedule(false)
      return
    }
    this.ws = ws
    this.opened = false

    ws.onopen = () => {
      if (this.ws !== ws) return
      this.opened = true
      this.retryDelay = RETRY_MIN_MS
      ws.send(filterMessage(protocol, this.lastSeq))
      this.keepalive = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(keepaliveMessage(protocol))
      }, KEEPALIVE_MS)
      this.handlers.onStatus('live')
    }

    ws.onmessage = (e: MessageEvent) => {
      if (this.ws !== ws || typeof e.data !== 'string') return
      const entries = parseFrame(e.data, () => this.nextId++)
      for (const entry of entries) {
        if (entry.seq !== undefined && (this.lastSeq === undefined || entry.seq > this.lastSeq)) this.lastSeq = entry.seq
      }
      if (entries.length > 0) this.handlers.onEntries(entries)
    }

    ws.onclose = () => {
      if (this.ws !== ws) return // replaced or stopped; that path reported already
      this.ws = null
      this.clearTimers()
      if (this.closed) return
      this.schedule(this.opened)
    }
  }

  private schedule(wasOpen: boolean): void {
    this.handlers.onStatus(wasOpen ? 'down' : 'refused')
    const delay = wasOpen ? this.retryDelay : RETRY_REFUSED_MS
    if (wasOpen) this.retryDelay = Math.min(this.retryDelay * 2, RETRY_MAX_MS)
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      void this.connect()
    }, delay)
  }
}
