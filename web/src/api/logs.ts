import { getAccessToken } from './auth'
import { ohUrl } from './base'
import { getRootInfo } from './items'
import { hasLogSocket, parseServerVersion, type ServerVersion } from '../model/serverVersion'
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
  | 'unsupported' // this openHAB has no log websocket at all, so there is nothing to retry

export interface LogSocketHandlers {
  onEntries: (entries: LogEntry[]) => void
  onStatus: (status: LogSocketStatus, serverVersion: string | null) => void
}

const KEEPALIVE_MS = 8000
const RETRY_MIN_MS = 1000
const RETRY_MAX_MS = 30_000
const RETRY_REFUSED_MS = 60_000

interface ServerFacts {
  protocol: LogProtocol
  version: ServerVersion | null
}

let factsProbe: Promise<ServerFacts> | null = null

function serverFacts(): Promise<ServerFacts> {
  factsProbe ??= getRootInfo()
    .then((info) => {
      const raw = info.runtimeInfo?.version ?? info.version
      return { protocol: protocolFor(raw), version: parseServerVersion(raw) }
    })
    .catch(() => {
      factsProbe = null
      return { protocol: 'object' as const, version: null }
    })
  return factsProbe
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
  private serverVersion: string | null = null

  constructor(private handlers: LogSocketHandlers) {}

  private report(status: LogSocketStatus): void {
    this.handlers.onStatus(status, this.serverVersion)
  }

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
    this.report('idle')
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
    this.report('connecting')
    const [facts, token] = await Promise.all([serverFacts(), getAccessToken()])
    if (this.closed || gen !== this.generation) return
    this.serverVersion = facts.version?.raw ?? null

    // openHAB registers no log websocket before 4.1, so connecting would fail every time and a
    // "retrying" notice would be a lie. Say what the server is instead, and stop.
    if (!hasLogSocket(facts.version)) {
      this.report('unsupported')
      return
    }
    const protocol = facts.protocol

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
      this.report('live')
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
    this.report(wasOpen ? 'down' : 'refused')
    const delay = wasOpen ? this.retryDelay : RETRY_REFUSED_MS
    if (wasOpen) this.retryDelay = Math.min(this.retryDelay * 2, RETRY_MAX_MS)
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      void this.connect()
    }, delay)
  }
}
