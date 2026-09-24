export type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'TRACE'

export interface LogEntry {
  id: number
  seq?: number
  time: number
  level: LogLevel
  logger: string
  message: string
  stack: string
}

// union-keyed, so the compiler pins the index and it needs no lookup()
export const LEVEL_RANK: Record<LogLevel, number> = { TRACE: 0, DEBUG: 1, INFO: 2, WARN: 3, ERROR: 4 }

export function levelOf(raw: unknown): LogLevel {
  const s = typeof raw === 'string' ? raw.trim().toUpperCase() : ''
  switch (s) {
    case 'ERROR':
    case 'WARN':
    case 'INFO':
    case 'DEBUG':
    case 'TRACE':
      return s
    default:
      return 'INFO'
  }
}

export type LogSource = 'openhab' | 'events' | 'both'

export function sourceOf(logger: string): 'openhab' | 'events' {
  return logger === 'openhab.event' || logger.startsWith('openhab.event.') ? 'events' : 'openhab'
}

export function sourceSetting(raw: unknown): LogSource {
  return raw === 'events' || raw === 'both' ? raw : 'openhab'
}

export type MinLevel = 'all' | 'info' | 'warn' | 'error'

export function minLevelOf(raw: unknown): MinLevel {
  return raw === 'info' || raw === 'warn' || raw === 'error' ? raw : 'all'
}

export function minRank(min: MinLevel): number {
  switch (min) {
    case 'info':
      return LEVEL_RANK.INFO
    case 'warn':
      return LEVEL_RANK.WARN
    case 'error':
      return LEVEL_RANK.ERROR
    default:
      return 0
  }
}

export const KEEP_MIN = 50
export const KEEP_MAX = 5000
export const KEEP_DEFAULT = 500
export const BUFFER_MAX = KEEP_MAX

export function keepOf(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN
  if (!Number.isFinite(n)) return KEEP_DEFAULT
  return Math.min(KEEP_MAX, Math.max(KEEP_MIN, Math.round(n)))
}

export function wrapOf(raw: unknown): boolean {
  return raw === true
}

// bounded, or a pasted config turns into a regex farm
const MAX_PATTERNS = 50
const MAX_PATTERN_LENGTH = 200

// a wildcard walk rather than a regex: "a*****b" compiled to .*.*.*.* backtracks exponentially on a logger
// name that does not match, and this runs for every line on every tile
export function globMatch(pattern: string, text: string): boolean {
  let p = 0
  let t = 0
  let star = -1
  let mark = 0
  while (t < text.length) {
    if (p < pattern.length && pattern[p] === text[t]) {
      p++
      t++
    } else if (p < pattern.length && pattern[p] === '*') {
      star = p++
      mark = t
    } else if (star !== -1) {
      p = star + 1
      t = ++mark
    } else {
      return false
    }
  }
  while (p < pattern.length && pattern[p] === '*') p++
  return p === pattern.length
}

export function loggerMatcher(text: unknown): ((logger: string) => boolean) | null {
  if (typeof text !== 'string') return null
  const lines = text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s !== '')
    .slice(0, MAX_PATTERNS)
    .map((s) => s.slice(0, MAX_PATTERN_LENGTH))
  if (lines.length === 0) return null
  const tests = lines.map((line): ((logger: string) => boolean) => {
    if (line.includes('*')) return (logger) => globMatch(line, logger)
    return (logger) => logger === line || logger.startsWith(line + '.')
  })
  return (logger) => tests.some((test) => test(logger))
}

/**
 * Whether a line from a reconnected socket is one this page has not seen. The socket asks for the
 * server's whole history again, because an openHAB restart numbers its lines from 0, and asking for
 * everything after the last number seen got nothing back until the new count passed the old one. A
 * number that went backwards with a later time is that restart; a number already seen is a repeat.
 */
export function isNewEntry(entry: LogEntry, lastSeq: number | undefined, lastTime: number | undefined): boolean {
  if (entry.seq === undefined || lastSeq === undefined) return true
  if (entry.seq > lastSeq) return true
  return lastTime !== undefined && entry.time > lastTime
}

export interface LogFilter {
  source: LogSource
  minRank: number
  loggers: ((logger: string) => boolean) | null
  contains: string
}

export function filterOf(config: Record<string, unknown>): LogFilter {
  return {
    source: sourceSetting(config.source),
    minRank: minRank(minLevelOf(config.minLevel)),
    loggers: loggerMatcher(config.loggers),
    contains: typeof config.contains === 'string' ? config.contains.trim().toLowerCase() : ''
  }
}

export function passes(entry: LogEntry, filter: LogFilter): boolean {
  if (filter.source !== 'both' && sourceOf(entry.logger) !== filter.source) return false
  if (LEVEL_RANK[entry.level] < filter.minRank) return false
  if (filter.loggers && !filter.loggers(entry.logger)) return false
  if (filter.contains !== '' && !entry.message.toLowerCase().includes(filter.contains)) return false
  return true
}

export function searchMatches(entry: LogEntry, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (q === '') return true
  return entry.message.toLowerCase().includes(q) || entry.logger.toLowerCase().includes(q)
}

export function lastMatching(entries: readonly LogEntry[], filter: LogFilter, keep: number, query = ''): LogEntry[] {
  const out: LogEntry[] = []
  for (let i = entries.length - 1; i >= 0 && out.length < keep; i--) {
    const e = entries[i]
    if (passes(e, filter) && searchMatches(e, query)) out.push(e)
  }
  return out.reverse()
}

export function trimEntries(entries: LogEntry[], max: number): LogEntry[] {
  return entries.length > max ? entries.slice(entries.length - max) : entries
}

export type LogProtocol = 'list' | 'object'

export function protocolFor(version: unknown): LogProtocol {
  const m = typeof version === 'string' ? /^\s*(\d+)/.exec(version) : null
  return m && Number(m[1]) < 5 ? 'list' : 'object'
}

// 4.3 wants a list of logger patterns and 5.x an object, and each server's keepalive is its own filter message
export function filterMessage(protocol: LogProtocol, sinceSeq?: number): string {
  if (protocol === 'list') return '[]'
  return JSON.stringify({ sequenceStart: sinceSeq === undefined ? 0 : sinceSeq })
}

export function keepaliveMessage(protocol: LogProtocol): string {
  return protocol === 'list' ? '[]' : '{}'
}

export function logSocketUrl(pageUrl: string, path: string, token: string | null): string {
  const url = new URL(path, pageUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  if (token) url.searchParams.set('accessToken', token)
  return url.toString()
}

// a frame is untrusted input like any other, and this runs for every line the server sends
export function parseEntry(raw: unknown, id: number): LogEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as {
    loggerName?: unknown
    level?: unknown
    unixtime?: unknown
    message?: unknown
    stackTrace?: unknown
    sequence?: unknown
  }
  const logger = typeof r.loggerName === 'string' ? r.loggerName : ''
  const message = typeof r.message === 'string' ? r.message : ''
  if (logger === '' && message === '') return null
  const time = typeof r.unixtime === 'number' && Number.isFinite(r.unixtime) ? r.unixtime : Date.now()
  const seq = typeof r.sequence === 'number' && Number.isFinite(r.sequence) ? r.sequence : undefined
  return {
    id,
    seq,
    time,
    level: levelOf(r.level),
    logger,
    message,
    stack: typeof r.stackTrace === 'string' ? r.stackTrace : ''
  }
}

export function parseFrame(text: string, nextId: () => number): LogEntry[] {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return []
  }
  const items = Array.isArray(data) ? data : [data]
  const out: LogEntry[] = []
  for (const item of items) {
    const entry = parseEntry(item, nextId())
    if (entry) out.push(entry)
  }
  return out
}

export function shortLogger(logger: string): string {
  const at = logger.lastIndexOf('.')
  return at === -1 ? logger : logger.slice(at + 1)
}

export const LOGGER_COLUMN = 36

// the LAST 36 characters, matching openhab.log's own %-36.36c column
export function loggerColumn(logger: string): string {
  return logger.length > LOGGER_COLUMN ? logger.slice(-LOGGER_COLUMN) : logger
}

const formatters = new Map<string, Intl.DateTimeFormat>()

export function formatTime(ms: number, lang: string, millis = false): string {
  const key = lang + (millis ? ':ms' : '')
  let f = formatters.get(key)
  if (!f) {
    const opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }
    if (millis) (opts as Intl.DateTimeFormatOptions & { fractionalSecondDigits: number }).fractionalSecondDigits = 3
    try {
      f = new Intl.DateTimeFormat(lang, opts)
    } catch {
      f = new Intl.DateTimeFormat('en', opts)
    }
    formatters.set(key, f)
  }
  return f.format(ms)
}

export function entryText(entry: LogEntry, lang: string): string {
  const head = `${formatTime(entry.time, lang, true)} [${entry.level.padEnd(5)}] [${entry.logger}] - ${entry.message}`
  return entry.stack ? head + '\n' + entry.stack.trimEnd() : head
}
