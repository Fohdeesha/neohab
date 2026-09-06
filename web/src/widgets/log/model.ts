/**
 * The log widget's pure model: what a log entry is, how a stored configuration is read, which
 * entries a widget shows, and the two shapes of the server's log protocol.
 *
 * openHAB streams its OSGi log over the `/ws/logs` websocket - the feed Main UI's own log viewer
 * reads. What arrives is one JSON object per entry (or an array of them when they come in fast),
 * carrying the logger's name, the level, the time and the message. events.log is not a separate
 * feed: the item, thing and rule events that log4j routes to that file are the `openhab.event.*`
 * loggers, and the OSGi reader sees every logger whatever file it is written to. So one socket
 * serves both files, and `sourceOf` is the whole of the split.
 *
 * Two protocols, because the two openHAB lines the add-on runs on differ (both probed live, not
 * read from a reference checkout):
 *   - openHAB 5 takes a filter OBJECT (`{sequenceStart, timeStart, timeStop, loggerNames}`),
 *     answers it with the entries the OSGi reader still holds (100 on a stock install), numbers
 *     every entry, and treats a bare `{}` as a keepalive it does not answer.
 *   - openHAB 4.3 takes a JSON LIST of logger-name patterns, sends no history at all and no
 *     sequence numbers, and logs a WARNING for every message it cannot parse as that list - so
 *     the 5.x keepalive would write a warning into the very log being watched, every eight
 *     seconds. Its keepalive is the list again, which is idempotent and silent.
 * Both close an idle socket after ten seconds, so something has to be sent regardless.
 */

export type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'TRACE'

export interface LogEntry {
  /** Unique on this page; the React key. The server's own number, where it has one, is `seq`. */
  id: number
  /** openHAB 5's sequence number, which a reconnect asks for history AFTER. Absent on 4.3. */
  seq?: number
  /** Milliseconds since the epoch. */
  time: number
  level: LogLevel
  logger: string
  message: string
  /** openHAB 5 sends a stack trace with an entry that carried an exception; empty otherwise. */
  stack: string
}

/** Union-keyed, so a bare index is pinned by the compiler and needs no `lookup`. */
export const LEVEL_RANK: Record<LogLevel, number> = { TRACE: 0, DEBUG: 1, INFO: 2, WARN: 3, ERROR: 4 }

/**
 * A level as the server names it. OSGi's `AUDIT` (a level that is always logged) has no
 * counterpart in a log file and is shown as INFO; anything unrecognised is INFO too, so a level
 * this code has never heard of is shown rather than dropped.
 */
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

/** The lowest rank a minimum-level setting lets through. */
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

/** Both bounds enforced at the read: a stored value is untrusted input. */
export const KEEP_MIN = 50
export const KEEP_MAX = 5000
export const KEEP_DEFAULT = 500
/** What the shared store holds in all, which is the largest any widget may ask to keep. */
export const BUFFER_MAX = KEEP_MAX

export function keepOf(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN
  if (!Number.isFinite(n)) return KEEP_DEFAULT
  return Math.min(KEEP_MAX, Math.max(KEEP_MIN, Math.round(n)))
}

export function wrapOf(raw: unknown): boolean {
  return raw === true
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A pattern list out of stored configuration is bounded, or a pasted file becomes a regex farm. */
const MAX_PATTERNS = 50
const MAX_PATTERN_LENGTH = 200

/**
 * The logger filter a widget was given, one pattern per line, as a predicate - or null when
 * there is none, so the caller can skip the test entirely.
 *
 * A pattern with a star is a glob over the whole logger name (`*.mqtt.*`); one without is a
 * name that matches itself and everything under it, the way log4j's logger hierarchy works
 * (`org.openhab.binding.mqtt` covers `org.openhab.binding.mqtt.internal.MqttBrokerHandler`).
 * The star is the only thing that reaches the regex, so a pattern cannot be a hostile one.
 */
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
    if (line.includes('*')) {
      const re = new RegExp('^' + line.split('*').map(escapeRe).join('.*') + '$')
      return (logger) => re.test(logger)
    }
    return (logger) => logger === line || logger.startsWith(line + '.')
  })
  return (logger) => tests.some((test) => test(logger))
}

export interface LogFilter {
  source: LogSource
  minRank: number
  loggers: ((logger: string) => boolean) | null
  /** Lower-cased once here, so the comparison per entry is one `includes`. */
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

/** The page's live search: the message or the logger, either case. */
export function searchMatches(entry: LogEntry, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (q === '') return true
  return entry.message.toLowerCase().includes(q) || entry.logger.toLowerCase().includes(q)
}

/**
 * The newest `keep` entries that pass the filter, oldest first. Walked from the end so a store
 * holding five thousand entries costs a widget keeping fifty no more than it has to.
 */
export function lastMatching(entries: readonly LogEntry[], filter: LogFilter, keep: number, query = ''): LogEntry[] {
  const out: LogEntry[] = []
  for (let i = entries.length - 1; i >= 0 && out.length < keep; i--) {
    const e = entries[i]
    if (passes(e, filter) && searchMatches(e, query)) out.push(e)
  }
  return out.reverse()
}

/** Drop the oldest so the buffer never exceeds `max`. Returns the same array when nothing has to go. */
export function trimEntries(entries: LogEntry[], max: number): LogEntry[] {
  return entries.length > max ? entries.slice(entries.length - max) : entries
}

/* ------------------------------------------------------------------ *
 * The wire
 * ------------------------------------------------------------------ */

export type LogProtocol = 'list' | 'object'

/** Which protocol a server speaks, from the version `GET /rest/` reports. Unknown means the newer one. */
export function protocolFor(version: unknown): LogProtocol {
  const m = typeof version === 'string' ? /^\s*(\d+)/.exec(version) : null
  return m && Number(m[1]) < 5 ? 'list' : 'object'
}

/**
 * The first message a connection sends, which is what makes the server start streaming.
 *
 * On openHAB 5 it also asks for history: everything the reader holds on a first connect, and
 * only what arrived after the last entry seen on a reconnect - so a dropped connection costs no
 * gap and no duplicates. The list protocol has no history to ask for; an empty list subscribes
 * to every logger, and the filtering is done here.
 */
export function filterMessage(protocol: LogProtocol, sinceSeq?: number): string {
  if (protocol === 'list') return '[]'
  return JSON.stringify({ sequenceStart: sinceSeq === undefined ? 0 : sinceSeq })
}

/** What keeps the socket open past the server's ten-second idle timeout without side effects. */
export function keepaliveMessage(protocol: LogProtocol): string {
  return protocol === 'list' ? '[]' : '{}'
}

/**
 * The socket's address: the page's own origin and scheme (so it works behind a sub-path proxy
 * and over TLS), and the token as a query parameter.
 *
 * The query parameter rather than the `Sec-WebSocket-Protocol` form Main UI uses on openHAB 5:
 * the 4.3 servlet does not know that form and never echoes a subprotocol, which makes the
 * browser fail the handshake outright, while the query form is accepted by both lines (probed
 * on 4.3.7 and 5.2.1). No token at all is a real request too - a 4.3 server with the implicit
 * user role on answers it, and a 5.x server refuses it, and the widget shows whichever happened.
 */
export function logSocketUrl(pageUrl: string, path: string, token: string | null): string {
  const url = new URL(path, pageUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  if (token) url.searchParams.set('accessToken', token)
  return url.toString()
}

/**
 * One entry out of whatever the server sent. Everything is checked: a frame is untrusted
 * input like any other, and this runs for every line a chatty binding produces.
 */
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

/** A whole frame: one entry, or an array of them when the server clustered a burst. */
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

/* ------------------------------------------------------------------ *
 * Presentation helpers
 * ------------------------------------------------------------------ */

/** The last segment of a logger name: `ItemCommandEvent`, `MqttBrokerHandler`. */
export function shortLogger(logger: string): string {
  const at = logger.lastIndexOf('.')
  return at === -1 ? logger : logger.slice(at + 1)
}

/** The width of openhab.log's own logger column (`%-36.36c` in the stock log4j2.xml). */
export const LOGGER_COLUMN = 36

/**
 * A logger name as openhab.log prints it: the LAST 36 characters, so a long name keeps the class
 * that wrote the line (`b.core.io.websocket.log.LogWebSocket`) rather than the package it sits
 * in. The page shows this in a fixed column so the messages line up; the whole name is on hover.
 */
export function loggerColumn(logger: string): string {
  return logger.length > LOGGER_COLUMN ? logger.slice(-LOGGER_COLUMN) : logger
}

const formatters = new Map<string, Intl.DateTimeFormat>()

/**
 * The time of an entry, the way a log file prints it: 24-hour clock, seconds, and milliseconds
 * where the reader has room for them. Formatters are cached per language, since one is built
 * per line otherwise.
 */
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

/** One entry as a line of text, for copying: the shape a log file itself has. */
export function entryText(entry: LogEntry, lang: string): string {
  const head = `${formatTime(entry.time, lang, true)} [${entry.level.padEnd(5)}] [${entry.logger}] - ${entry.message}`
  return entry.stack ? head + '\n' + entry.stack.trimEnd() : head
}
