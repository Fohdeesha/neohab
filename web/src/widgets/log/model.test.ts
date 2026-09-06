import { describe, expect, it } from 'vitest'
import {
  BUFFER_MAX,
  KEEP_DEFAULT,
  KEEP_MAX,
  KEEP_MIN,
  entryText,
  filterMessage,
  filterOf,
  formatTime,
  keepOf,
  keepaliveMessage,
  lastMatching,
  levelOf,
  loggerColumn,
  loggerMatcher,
  logSocketUrl,
  minRank,
  parseEntry,
  parseFrame,
  passes,
  protocolFor,
  searchMatches,
  shortLogger,
  sourceOf,
  trimEntries,
  type LogEntry
} from './model'

const entry = (over: Partial<LogEntry> = {}): LogEntry => ({
  id: 1,
  time: 1_788_582_792_150,
  level: 'INFO',
  logger: 'openhab.event.ItemStateChangedEvent',
  message: "Item 'nh_dimmer' changed from 60 to 61",
  stack: '',
  ...over
})

describe('a log entry off the wire', () => {
  it('reads the shape openHAB 5 sends, sequence and stack trace included', () => {
    const e = parseEntry(
      {
        loggerName: 'openhab.event.ItemCommandEvent',
        level: 'INFO',
        timestamp: 'Sep 5, 2026, 12:33:12 AM',
        unixtime: 1788582792150,
        message: "Item 'nh_dimmer' received command 57",
        stackTrace: '',
        sequence: 3204
      },
      7
    )
    expect(e).toEqual({
      id: 7,
      seq: 3204,
      time: 1788582792150,
      level: 'INFO',
      logger: 'openhab.event.ItemCommandEvent',
      message: "Item 'nh_dimmer' received command 57",
      stack: ''
    })
  })

  it('reads the shape openHAB 4.3 sends, which has no sequence and no stack trace', () => {
    const e = parseEntry(
      { loggerName: 'openhab.event.ItemStateChangedEvent', level: 'INFO', timestamp: 'x', unixtime: 1788587750299, message: 'changed' },
      1
    )
    expect(e?.seq).toBeUndefined()
    expect(e?.stack).toBe('')
    expect(e?.time).toBe(1788587750299)
  })

  it('takes every field as untrusted: the wrong shape falls back rather than throwing', () => {
    expect(parseEntry(null, 1)).toBeNull()
    expect(parseEntry('text', 1)).toBeNull()
    expect(parseEntry({}, 1)).toBeNull()
    expect(parseEntry({ loggerName: 42, message: {} }, 1)).toBeNull()
    const before = Date.now()
    const e = parseEntry({ message: 'only a message', level: 7, unixtime: 'yesterday', sequence: 'first', stackTrace: [] }, 3)
    expect(e).toMatchObject({ id: 3, level: 'INFO', logger: '', message: 'only a message', stack: '' })
    expect(e?.seq).toBeUndefined()
    expect(e?.time).toBeGreaterThanOrEqual(before)
  })

  it('reads a single entry or a clustered array from one frame, and nothing from garbage', () => {
    let n = 0
    const next = () => ++n
    expect(parseFrame('{"loggerName":"a","level":"WARN","unixtime":1,"message":"m"}', next).map((e) => e.level)).toEqual(['WARN'])
    const two = parseFrame('[{"loggerName":"a","message":"1"},{"loggerName":"b","message":"2"},"junk",null]', next)
    expect(two.map((e) => e.message)).toEqual(['1', '2'])
    expect(two.map((e) => e.id)).toEqual([2, 3])
    expect(parseFrame('not json', next)).toEqual([])
    expect(parseFrame('{}', next)).toEqual([])
  })

  it('names the five levels a log file has, and shows what it does not know as INFO', () => {
    for (const l of ['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE']) expect(levelOf(l)).toBe(l)
    expect(levelOf('warn')).toBe('WARN')
    expect(levelOf(' error ')).toBe('ERROR')
    expect(levelOf('AUDIT')).toBe('INFO')
    expect(levelOf(undefined)).toBe('INFO')
    expect(levelOf(3)).toBe('INFO')
    // The prototype's own names are just unknown levels, as everything else is.
    expect(levelOf('constructor')).toBe('INFO')
  })
})

describe('which file an entry belongs to', () => {
  it('is decided by the logger, the way log4j routes it', () => {
    expect(sourceOf('openhab.event.ItemCommandEvent')).toBe('events')
    expect(sourceOf('openhab.event')).toBe('events')
    expect(sourceOf('openhab.eventual.Thing')).toBe('openhab')
    expect(sourceOf('org.openhab.core.io.websocket.log.LogWebSocket')).toBe('openhab')
    expect(sourceOf('')).toBe('openhab')
  })
})

describe('the widget filter', () => {
  const server = entry({ logger: 'org.openhab.binding.mqtt.internal.MqttBrokerHandler', level: 'WARN', message: 'Broker gone' })
  const event = entry()
  const debug = entry({ logger: 'org.openhab.binding.mqtt.internal.Handler', level: 'DEBUG', message: 'noise' })

  it('reads a stored configuration on the defaults when the keys are missing or wrong', () => {
    const f = filterOf({})
    expect(f).toMatchObject({ source: 'openhab', minRank: 0, loggers: null, contains: '' })
    const junk = filterOf({ source: 'constructor', minLevel: 42, loggers: ['a'], contains: 7 })
    expect(junk).toMatchObject({ source: 'openhab', minRank: 0, loggers: null, contains: '' })
  })

  it('splits the two files, or shows both', () => {
    expect(passes(server, filterOf({ source: 'openhab' }))).toBe(true)
    expect(passes(event, filterOf({ source: 'openhab' }))).toBe(false)
    expect(passes(event, filterOf({ source: 'events' }))).toBe(true)
    expect(passes(server, filterOf({ source: 'events' }))).toBe(false)
    expect(passes(server, filterOf({ source: 'both' }))).toBe(true)
    expect(passes(event, filterOf({ source: 'both' }))).toBe(true)
  })

  it('holds a minimum level', () => {
    expect(minRank('all')).toBe(0)
    expect(minRank('info')).toBe(2)
    expect(minRank('warn')).toBe(3)
    expect(minRank('error')).toBe(4)
    const warn = filterOf({ source: 'both', minLevel: 'warn' })
    expect(passes(server, warn)).toBe(true)
    expect(passes(event, warn)).toBe(false)
    expect(passes(debug, filterOf({ minLevel: 'info' }))).toBe(false)
    expect(passes(debug, filterOf({ minLevel: 'all' }))).toBe(true)
    expect(passes(server, filterOf({ minLevel: 'error' }))).toBe(false)
  })

  it('matches loggers by name and under it, or by a glob', () => {
    const under = loggerMatcher('org.openhab.binding.mqtt')
    expect(under?.('org.openhab.binding.mqtt')).toBe(true)
    expect(under?.('org.openhab.binding.mqtt.internal.MqttBrokerHandler')).toBe(true)
    // Not a prefix match on the characters: `mqttx` is a different logger.
    expect(under?.('org.openhab.binding.mqttx.Handler')).toBe(false)
    const glob = loggerMatcher('*.mqtt.*\nopenhab.event.Item*Event')
    expect(glob?.('org.openhab.binding.mqtt.internal.Handler')).toBe(true)
    expect(glob?.('openhab.event.ItemCommandEvent')).toBe(true)
    expect(glob?.('openhab.event.ThingStatusInfoChangedEvent')).toBe(false)
    // A dot in a pattern is a dot, not "any character".
    expect(loggerMatcher('a.b*')?.('axb')).toBe(false)
    expect(loggerMatcher('a.b*')?.('a.bc')).toBe(true)
  })

  it('has no logger filter at all for an empty or missing setting', () => {
    expect(loggerMatcher('')).toBeNull()
    expect(loggerMatcher('  \n \n')).toBeNull()
    expect(loggerMatcher(undefined)).toBeNull()
    expect(loggerMatcher(['x'])).toBeNull()
  })

  it('bounds a pasted pattern list', () => {
    const many = Array.from({ length: 80 }, (_, i) => `logger${i}`).join('\n')
    const m = loggerMatcher(many)
    expect(m?.('logger49')).toBe(true)
    expect(m?.('logger79')).toBe(false)
    const long = loggerMatcher('x'.repeat(500))
    expect(long?.('x'.repeat(500))).toBe(false)
    expect(long?.('x'.repeat(200))).toBe(true)
  })

  it('matches a text in the message, either case, and the page search in the logger too', () => {
    expect(passes(event, filterOf({ source: 'events', contains: 'NH_DIMMER' }))).toBe(true)
    expect(passes(event, filterOf({ source: 'events', contains: 'kitchen' }))).toBe(false)
    expect(searchMatches(event, '')).toBe(true)
    expect(searchMatches(event, 'itemstatechanged')).toBe(true)
    expect(searchMatches(event, 'from 60')).toBe(true)
    expect(searchMatches(event, 'nothing here')).toBe(false)
  })

  it('takes the newest lines that pass, oldest first, and no more than it keeps', () => {
    const entries = Array.from({ length: 10 }, (_, i) =>
      entry({ id: i, message: `line ${i}`, level: i % 2 ? 'WARN' : 'INFO', logger: 'x' })
    )
    const f = filterOf({ source: 'openhab', minLevel: 'warn' })
    expect(lastMatching(entries, f, 3).map((e) => e.message)).toEqual(['line 5', 'line 7', 'line 9'])
    expect(lastMatching(entries, filterOf({}), 100).length).toBe(10)
    expect(lastMatching(entries, filterOf({}), 4, 'line 2').map((e) => e.message)).toEqual(['line 2'])
  })

  it('keeps a bounded number of lines, whatever the setting says', () => {
    expect(keepOf(undefined)).toBe(KEEP_DEFAULT)
    expect(keepOf('abc')).toBe(KEEP_DEFAULT)
    expect(keepOf(0)).toBe(KEEP_MIN)
    expect(keepOf(-5)).toBe(KEEP_MIN)
    expect(keepOf(1e9)).toBe(KEEP_MAX)
    expect(keepOf('250')).toBe(250)
    expect(keepOf(249.6)).toBe(250)
    expect(KEEP_MAX).toBe(BUFFER_MAX)
  })

  it('drops the oldest entries past the cap and leaves an array within it alone', () => {
    const entries = Array.from({ length: 6 }, (_, i) => entry({ id: i }))
    expect(trimEntries(entries, 4).map((e) => e.id)).toEqual([2, 3, 4, 5])
    expect(trimEntries(entries, 6)).toBe(entries)
    expect(trimEntries(entries, 10)).toBe(entries)
  })
})

describe('the wire', () => {
  it('picks the list protocol for openHAB 4 and the object protocol for 5 or unknown', () => {
    expect(protocolFor('4.3.7')).toBe('list')
    expect(protocolFor('4.3.11 - Release Build')).toBe('list')
    expect(protocolFor('5.2.1')).toBe('object')
    expect(protocolFor('5.3.0-SNAPSHOT')).toBe('object')
    expect(protocolFor(undefined)).toBe('object')
    expect(protocolFor('')).toBe('object')
    expect(protocolFor(42)).toBe('object')
  })

  it('opens with a filter the server understands, and asks for history after the last entry seen', () => {
    expect(filterMessage('list')).toBe('[]')
    expect(filterMessage('list', 300)).toBe('[]')
    expect(JSON.parse(filterMessage('object'))).toEqual({ sequenceStart: 0 })
    expect(JSON.parse(filterMessage('object', 3204))).toEqual({ sequenceStart: 3204 })
  })

  it('keeps the socket alive with something each server accepts silently', () => {
    // openHAB 4.3 logs a WARNING for anything it cannot parse as a list - a `{}` there would
    // write into the log being watched every eight seconds. openHAB 5 treats `{}` as the
    // keepalive and a list as an unparseable filter.
    expect(keepaliveMessage('list')).toBe('[]')
    expect(keepaliveMessage('object')).toBe('{}')
  })

  it('addresses the socket from the page, with the scheme and any prefix', () => {
    expect(logSocketUrl('http://oh.lan:8080/neohab/index.html#/d/x', '/ws/logs', null)).toBe('ws://oh.lan:8080/ws/logs')
    expect(logSocketUrl('https://home.example/neohab/index.html', '/ws/logs', 'oh.tok')).toBe(
      'wss://home.example/ws/logs?accessToken=oh.tok'
    )
    // Behind a sub-path proxy the prefix comes with the path, as every other API path does.
    expect(logSocketUrl('https://home.example/openhab/neohab/index.html', '/openhab/ws/logs', 'a b')).toBe(
      'wss://home.example/openhab/ws/logs?accessToken=a+b'
    )
  })
})

describe('presentation', () => {
  it('shortens a logger to its last segment', () => {
    expect(shortLogger('openhab.event.ItemCommandEvent')).toBe('ItemCommandEvent')
    expect(shortLogger('Handler')).toBe('Handler')
    expect(shortLogger('')).toBe('')
  })

  it('prints a logger the way openhab.log does: the last 36 characters', () => {
    // The stock log4j2.xml pattern is `%-36.36c`, and the file really reads
    // `[b.core.io.websocket.log.LogWebSocket]` for this logger.
    expect(loggerColumn('org.openhab.core.io.websocket.log.LogWebSocket')).toBe('b.core.io.websocket.log.LogWebSocket')
    expect(loggerColumn('openhab.event.ItemStateChangedEvent')).toBe('openhab.event.ItemStateChangedEvent')
    expect(loggerColumn('x'.repeat(36))).toBe('x'.repeat(36))
    expect(loggerColumn('')).toBe('')
  })

  it('prints the time on a 24-hour clock, with milliseconds where asked', () => {
    // 2026-01-05 14:07:09.250 UTC, read in whatever zone the test runs in.
    const ms = Date.UTC(2026, 0, 5, 14, 7, 9, 250)
    const plain = formatTime(ms, 'en')
    expect(plain).toMatch(/^\d{2}:\d{2}:09$/)
    expect(formatTime(ms, 'en', true)).toMatch(/^\d{2}:\d{2}:09[.,]250$/)
    expect(formatTime(ms, 'de')).toMatch(/^\d{2}:\d{2}:09$/)
    // An unknown language falls back rather than throwing.
    expect(formatTime(ms, 'zz-ZZ-not-a-language')).toMatch(/:09$/)
  })

  it('copies an entry as a log file would print it, stack trace under it', () => {
    const line = entryText(entry({ level: 'WARN', stack: 'java.lang.Foo\n\tat x\n' }), 'en')
    expect(line).toMatch(
      /^\d{2}:\d{2}:\d{2}[.,]\d{3} \[WARN \] \[openhab\.event\.ItemStateChangedEvent\] - Item 'nh_dimmer' changed from 60 to 61\njava\.lang\.Foo\n\tat x$/
    )
    expect(entryText(entry(), 'en')).not.toContain('\n')
  })
})
