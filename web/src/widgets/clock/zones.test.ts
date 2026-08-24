/**
 * The clock's zone handling.
 *
 * Every instant here is written as UTC and every zone is named explicitly, so these say the same
 * thing on a machine in Indiana and one in Berlin - which is the whole point of the feature and
 * would otherwise be the first thing to rot in CI.
 */
import { describe, expect, it } from 'vitest'
import {
  deviceZone,
  extraZones,
  isValidZone,
  resolveZone,
  zoneCity,
  zoneLabelMode,
  zoneLabelText,
  zoneOffsetLabel,
  zoneOffsetMinutes,
  zoneOptions,
  zoneParts,
  zoneRegion,
  zoneShortName,
} from './zones'

/** A summer instant, so the northern zones below are on daylight saving. */
const SUMMER = new Date('2026-08-24T04:30:00Z')
/** ...and a winter one, to prove an offset is read at the instant rather than cached. */
const WINTER = new Date('2026-01-15T04:30:00Z')

describe('zone names', () => {
  it('reads the city out of an id', () => {
    expect(zoneCity('Asia/Tokyo')).toBe('Tokyo')
    expect(zoneCity('America/New_York')).toBe('New York')
    expect(zoneCity('UTC')).toBe('UTC')
  })

  it('keeps the middle segment of a three-part id', () => {
    // Ten Argentinian cities and ten Indiana ones would otherwise be told apart by nothing.
    expect(zoneCity('America/Argentina/Salta')).toBe('Argentina / Salta')
    expect(zoneCity('America/Indiana/Indianapolis')).toBe('Indiana / Indianapolis')
  })

  it('groups by region', () => {
    expect(zoneRegion('Asia/Tokyo')).toBe('Asia')
    expect(zoneRegion('UTC')).toBe('UTC')
  })
})

describe('the zone list', () => {
  const options = zoneOptions()

  it('offers the whole database', () => {
    expect(options.length).toBeGreaterThan(300)
  })

  it('includes plain UTC, which the browser does not list', () => {
    // `Intl.supportedValuesOf` returns only region/city ids, so the one zone somebody running
    // servers is most likely to pick is the one that has to be added.
    expect(options.some((o) => o.value === 'UTC')).toBe(true)
  })

  it('names and groups every entry, and lists none twice', () => {
    const seen = new Set<string>()
    for (const o of options) {
      expect(o.label, o.value).not.toBe('')
      expect(o.group, o.value).toBeTruthy()
      expect(seen.has(o.value), o.value).toBe(false)
      seen.add(o.value)
    }
  })

  it('offers only zones it can actually format in', () => {
    // A select whose options throw when chosen is worse than no select.
    const bad = options.filter((o) => !isValidZone(o.value)).map((o) => o.value)
    expect(bad).toEqual([])
  })

  it('returns the same list each time', () => {
    expect(zoneOptions()).toBe(options)
  })
})

describe('validating a stored zone', () => {
  it('accepts what the browser knows', () => {
    expect(isValidZone('Asia/Tokyo')).toBe(true)
    expect(isValidZone('UTC')).toBe(true)
  })

  it('rejects everything else, rather than throwing from inside render', () => {
    for (const junk of ['', 'Not/AZone', 'Tokyo', 42, null, undefined, {}, ['Asia/Tokyo']]) {
      expect(isValidZone(junk), JSON.stringify(junk)).toBe(false)
    }
  })

  it('falls back to this device for anything it cannot use', () => {
    expect(resolveZone('Asia/Tokyo')).toBe('Asia/Tokyo')
    for (const junk of [undefined, '', 'Not/AZone', 7]) {
      expect(resolveZone(junk), JSON.stringify(junk)).toBe(deviceZone())
    }
  })
})

describe('the wall clock in a zone', () => {
  it('reads an instant as that zone reads it', () => {
    expect(zoneParts(SUMMER, 'Asia/Tokyo')).toEqual({
      year: 2026,
      month: 8,
      day: 24,
      hour: 13,
      minute: 30,
      second: 0,
    })
    // The same instant, the previous evening in New York.
    expect(zoneParts(SUMMER, 'America/New_York')).toMatchObject({ day: 24, hour: 0, minute: 30 })
  })

  it('calls midnight hour zero, not twenty-four', () => {
    // `hour12: false` has historically rendered it as 24 under en-US, which the analog face would
    // draw as an hour hand at noon.
    expect(zoneParts(new Date('2026-08-24T00:00:30Z'), 'UTC').hour).toBe(0)
  })

  it('rolls the date over when the zone does, not when this machine does', () => {
    // 11pm in New York is already tomorrow in London.
    const evening = new Date('2026-08-24T03:00:00Z')
    expect(zoneParts(evening, 'America/New_York')).toMatchObject({ day: 23, hour: 23 })
    expect(zoneParts(evening, 'Europe/London')).toMatchObject({ day: 24, hour: 4 })
  })
})

describe('offsets', () => {
  it('measures whole-hour zones', () => {
    expect(zoneOffsetMinutes(SUMMER, 'Asia/Tokyo')).toBe(540)
    expect(zoneOffsetMinutes(SUMMER, 'UTC')).toBe(0)
  })

  it('measures the zones that are not on the hour', () => {
    expect(zoneOffsetMinutes(SUMMER, 'Asia/Kolkata')).toBe(330)
    expect(zoneOffsetMinutes(SUMMER, 'Pacific/Chatham')).toBe(765)
  })

  it('follows daylight saving, because it is read at the instant', () => {
    expect(zoneOffsetMinutes(SUMMER, 'America/New_York')).toBe(-240)
    expect(zoneOffsetMinutes(WINTER, 'America/New_York')).toBe(-300)
    expect(zoneOffsetMinutes(SUMMER, 'Europe/London')).toBe(60)
    expect(zoneOffsetMinutes(WINTER, 'Europe/London')).toBe(0)
  })

  it('is not thrown off by the milliseconds in the instant', () => {
    // The formatted fields carry whole seconds, so the fraction has to be taken off first or it
    // lands in the rounding.
    for (const ms of [0, 1, 499, 500, 999]) {
      const at = new Date(Date.UTC(2026, 7, 24, 4, 30, 0, ms))
      expect(zoneOffsetMinutes(at, 'Asia/Kolkata'), String(ms)).toBe(330)
    }
  })

  it('writes an offset the way people do', () => {
    expect(zoneOffsetLabel(SUMMER, 'Asia/Tokyo')).toBe('UTC+9')
    expect(zoneOffsetLabel(SUMMER, 'America/New_York')).toBe('UTC-4')
    expect(zoneOffsetLabel(SUMMER, 'Asia/Kolkata')).toBe('UTC+5:30')
    expect(zoneOffsetLabel(SUMMER, 'Pacific/Chatham')).toBe('UTC+12:45')
    expect(zoneOffsetLabel(SUMMER, 'UTC')).toBe('UTC')
  })
})

describe('the tile caption', () => {
  it('draws nothing unless asked', () => {
    expect(zoneLabelText(SUMMER, 'Asia/Tokyo', 'en', undefined, undefined)).toBe('')
    expect(zoneLabelText(SUMMER, 'Asia/Tokyo', 'en', 'none', 'ignored')).toBe('')
  })

  it('uses what the language calls the zone', () => {
    expect(zoneLabelText(SUMMER, 'America/New_York', 'en', 'short', undefined)).toBe('EDT')
    // Not every zone has letters in every language, and inventing some would be worse.
    expect(zoneLabelText(SUMMER, 'Asia/Tokyo', 'en', 'short', undefined)).toBe(
      zoneShortName(SUMMER, 'Asia/Tokyo', 'en')
    )
  })

  it('or the offset', () => {
    expect(zoneLabelText(SUMMER, 'Asia/Tokyo', 'en', 'offset', undefined)).toBe('UTC+9')
  })

  it('or whatever the author typed', () => {
    expect(zoneLabelText(SUMMER, 'Asia/Tokyo', 'en', 'custom', 'Head office')).toBe('Head office')
    expect(zoneLabelText(SUMMER, 'Asia/Tokyo', 'en', 'custom', '  Mum  ')).toBe('Mum')
  })

  it('falls back to the city when the text is empty', () => {
    // Picking "Your own text" and typing nothing is a reasonable way to ask for "Tokyo".
    for (const empty of ['', '   ', undefined, null, 42]) {
      expect(zoneLabelText(SUMMER, 'Asia/Tokyo', 'en', 'custom', empty), JSON.stringify(empty)).toBe('Tokyo')
    }
  })

  it('treats a mode it does not know as off', () => {
    expect(zoneLabelMode('sideways')).toBe('none')
    expect(zoneLabelMode(undefined)).toBe('none')
    expect(zoneLabelText(SUMMER, 'Asia/Tokyo', 'en', 'sideways', 'x')).toBe('')
  })
})

describe('the extra zones a sheet lists', () => {
  it('keeps the good rows and their labels', () => {
    expect(extraZones([{ zone: 'Asia/Tokyo', label: 'Head office' }, { zone: 'UTC' }])).toEqual([
      { zone: 'Asia/Tokyo', label: 'Head office' },
      { zone: 'UTC', label: undefined },
    ])
  })

  it('drops anything it could not format, rather than throwing while the sheet renders', () => {
    // Stored lists are untrusted input: a hand edit, an import, a backup from another browser.
    expect(extraZones([{ zone: 'Not/AZone' }, { zone: 42 }, null, 'Asia/Tokyo', {}, []])).toEqual([])
    expect(extraZones('Asia/Tokyo')).toEqual([])
    expect(extraZones(undefined)).toEqual([])
    expect(extraZones({ zone: 'Asia/Tokyo' })).toEqual([])
  })

  it('lists the same zone once', () => {
    expect(extraZones([{ zone: 'UTC' }, { zone: 'UTC', label: 'again' }])).toEqual([
      { zone: 'UTC', label: undefined },
    ])
  })

  it('ignores a label of only spaces', () => {
    expect(extraZones([{ zone: 'UTC', label: '   ' }])[0].label).toBeUndefined()
  })
})
