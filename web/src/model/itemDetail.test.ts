import { describe, expect, it } from 'vitest'
import { lastChangeAt, lastChangeFromHistory, lastUpdateAt, mainUiItemPath, relativeTime } from './itemDetail'

/** 2026-08-19T12:00:00Z, a fixed "now" so nothing here depends on when it runs. */
const NOW = Date.UTC(2026, 7, 19, 12, 0, 0)

describe('lastChangeAt / lastUpdateAt', () => {
  it('reads the epoch openHAB 5 serves', () => {
    expect(lastChangeAt({ lastStateChange: 1787089241630 })).toBe(1787089241630)
    expect(lastUpdateAt({ lastStateUpdate: 1787089327443 })).toBe(1787089327443)
  })

  it('is absent on openHAB 4, which serves no such field', () => {
    // The whole reason every read here is optional: 4.3.7 sends neither field.
    expect(lastChangeAt({})).toBeUndefined()
    expect(lastUpdateAt({})).toBeUndefined()
  })

  it('treats "not fetched yet" the same as "not served"', () => {
    expect(lastChangeAt(null)).toBeUndefined()
    expect(lastChangeAt(undefined)).toBeUndefined()
  })

  it('accepts the string and float forms a serializer may produce', () => {
    expect(lastChangeAt({ lastStateChange: '1787089241630' as unknown as number })).toBe(1787089241630)
    // Gson's float echo of an integer.
    expect(lastChangeAt({ lastStateChange: 1787089241630.0 })).toBe(1787089241630)
  })

  it('rejects values that cannot be a moment', () => {
    for (const bad of [0, -1, NaN, Infinity, 'soon', '', {}, []]) {
      expect(lastChangeAt({ lastStateChange: bad as unknown as number })).toBeUndefined()
    }
  })
})

describe('lastChangeFromHistory', () => {
  const at = (time: number, state: string) => ({ time, state })

  it('reports the moment the value became what it is now', () => {
    const rows = [at(100, '20'), at(200, '20'), at(300, '21'), at(400, '21')]
    expect(lastChangeFromHistory(rows)).toEqual({ kind: 'at', time: 300 })
  })

  it('walks past everything since, not just the previous row', () => {
    // The value has held for the last four samples; the change is where the run started.
    const rows = [at(1, 'OFF'), at(2, 'ON'), at(3, 'ON'), at(4, 'ON'), at(5, 'ON')]
    expect(lastChangeFromHistory(rows)).toEqual({ kind: 'at', time: 2 })
  })

  it('says the value held the whole window rather than inventing a moment', () => {
    expect(lastChangeFromHistory([at(1, '20'), at(2, '20')])).toEqual({ kind: 'before' })
    // The boundary row alone: there IS history, and it never moved inside the window.
    expect(lastChangeFromHistory([at(1, '20')])).toEqual({ kind: 'before' })
  })

  it('knows nothing when persistence returned nothing', () => {
    expect(lastChangeFromHistory([])).toEqual({ kind: 'unknown' })
  })

  it('does not call a difference in spelling a change', () => {
    // Persistence writes a BigDecimal, so the same reading can arrive as "64" and as "64.0".
    expect(lastChangeFromHistory([at(1, '64.0'), at(2, '64'), at(3, '64.00')])).toEqual({ kind: 'before' })
    expect(lastChangeFromHistory([at(1, '63'), at(2, '64.0'), at(3, '64')])).toEqual({ kind: 'at', time: 2 })
  })

  it('handles the row openHAB repeats at a binary transition', () => {
    // For Switch and Contact the REST layer emits the PREVIOUS state at the transition instant so
    // a plot draws no diagonal, which puts two rows on the same timestamp.
    const rows = [at(100, 'OFF'), at(500, 'OFF'), at(500, 'ON'), at(900, 'ON')]
    expect(lastChangeFromHistory(rows)).toEqual({ kind: 'at', time: 500 })
  })

  it('survives history that is not a list of points', () => {
    for (const bad of [null, undefined, 'no', 42, {}] as unknown as { time: number; state: string }[][]) {
      expect(() => lastChangeFromHistory(bad), String(bad)).not.toThrow()
      expect(lastChangeFromHistory(bad)).toEqual({ kind: 'unknown' })
    }
    // A malformed row among good ones is dropped, not trusted.
    const rows = [{ time: 'x', state: '1' }, null, { time: 2, state: '1' }] as never
    expect(lastChangeFromHistory(rows)).toEqual({ kind: 'before' })
  })

  it('compares non-numeric states exactly', () => {
    expect(lastChangeFromHistory([at(1, 'PLAY'), at(2, 'PAUSE')])).toEqual({ kind: 'at', time: 2 })
    expect(lastChangeFromHistory([at(1, 'PAUSE'), at(2, 'PAUSE')])).toEqual({ kind: 'before' })
    // Number('') is 0, which would make an empty state equal to a stored zero.
    expect(lastChangeFromHistory([at(1, ''), at(2, '0')])).toEqual({ kind: 'at', time: 2 })
  })
})

describe('relativeTime', () => {
  const ago = (ms: number) => relativeTime(NOW - ms, NOW, 'en')

  it('picks a unit that suits the distance', () => {
    expect(ago(5_000)).toBe('5 seconds ago')
    expect(ago(5 * 60_000)).toBe('5 minutes ago')
    expect(ago(5 * 3_600_000)).toBe('5 hours ago')
    expect(ago(5 * 86_400_000)).toBe('5 days ago')
  })

  it('lets a language use its own word where it has one', () => {
    // `numeric: 'auto'` is what makes this "yesterday" rather than "1 day ago".
    expect(ago(86_400_000)).toBe('yesterday')
    expect(ago(0)).toBe('now')
  })

  it('crosses into larger units at sensible thresholds', () => {
    expect(ago(44_000)).toBe('44 seconds ago')
    expect(ago(46_000)).toBe('1 minute ago')
    // Past the 22-hour threshold this is a day, and at exactly one day "auto" says "yesterday".
    expect(ago(21 * 3_600_000)).toBe('21 hours ago')
    expect(ago(23 * 3_600_000)).toBe('yesterday')
    expect(ago(40 * 86_400_000)).toMatch(/month/)
    expect(ago(400 * 86_400_000)).toMatch(/year/)
  })

  it('renders a future timestamp as the present, never as a countdown', () => {
    // A "last changed" ahead of now is two clocks disagreeing, so counting forwards would state
    // something that cannot be true.
    expect(relativeTime(NOW + 30_000, NOW, 'en')).toBe('now')
    expect(relativeTime(NOW + 86_400_000, NOW, 'en')).toBe('now')
  })

  it('translates itself', () => {
    expect(relativeTime(NOW - 5 * 60_000, NOW, 'de')).toMatch(/Minuten/)
    expect(relativeTime(NOW - 5 * 60_000, NOW, 'fr')).toMatch(/minutes/)
  })

  it('survives an unusable locale tag rather than taking the sheet down', () => {
    expect(relativeTime(NOW - 5 * 60_000, NOW, 'not a locale')).toBeTruthy()
  })

  it('has no answer for a non-moment', () => {
    expect(relativeTime(NaN, NOW)).toBeUndefined()
    expect(relativeTime(NOW, Infinity)).toBeUndefined()
  })
})

describe('mainUiItemPath', () => {
  it('addresses the item page Main UI actually serves', () => {
    expect(mainUiItemPath('main_lights_level')).toBe('/settings/items/main_lights_level')
  })

  it('encodes a name that would otherwise change the path', () => {
    expect(mainUiItemPath('a/b')).toBe('/settings/items/a%2Fb')
    expect(mainUiItemPath('a b')).toBe('/settings/items/a%20b')
  })
})
