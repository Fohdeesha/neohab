/**
 * Time zones, for a clock that is not showing this device's own.
 *
 * A second clock set to another country is the whole point of the setting, so everything the
 * widget draws - the digits, the analog hands, the date, the zone's own label - has to be worked
 * out IN that zone rather than in the browser's. `Intl` carries the full IANA database and the
 * daylight-saving rules with it, so none of this needs a dependency or a table to maintain.
 *
 * Everything here is pure and takes the instant as an argument, because an offset is a property
 * of a zone AT a moment: Europe/London is UTC+1 in August and UTC+0 in December, and a clock that
 * cached either would be an hour wrong for half the year.
 */

/** A zone the widget can be set to, as the settings panel's grouped select renders it. */
export interface ZoneOption {
  /** The IANA id, which is what gets stored. */
  value: string
  /** What the option row says. */
  label: string
  /** The `<optgroup>` it sits under; the id's own first segment. */
  group?: string
}

/**
 * Zones `Intl.supportedValuesOf` leaves out but every engine accepts. It lists only the canonical
 * region/city ids, so plain UTC - which is exactly what somebody running servers would pick - is
 * not among the 418 it returns.
 */
export const EXTRA_ZONES = ['UTC']

/** Underscores are the id's word separator; a person reading a list wants the spaces back. */
function prettySegment(segment: string): string {
  return segment.replace(/_/g, ' ')
}

/**
 * The city part of an id, which is what a world clock is usually labelled with. Three-segment ids
 * (America/Argentina/Salta, America/Indiana/Indianapolis) keep the middle part, so the ten
 * Argentinian cities and the ten Indiana ones stay tellable apart.
 */
export function zoneCity(id: string): string {
  const parts = id.split('/')
  if (parts.length <= 1) return prettySegment(id)
  return parts.slice(1).map(prettySegment).join(' / ')
}

/** The region an id belongs to, used as the select's group heading. */
export function zoneRegion(id: string): string {
  const at = id.indexOf('/')
  return at > 0 ? id.slice(0, at) : 'UTC'
}

/** This browser's own zone, or '' in the odd environment that reports none. */
export function deviceZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  } catch {
    return ''
  }
}

/**
 * `Intl.supportedValuesOf` is ES2022 and this project's TypeScript lib target predates it, so it
 * is reached through a declared shape rather than by widening the whole compilation. Read as a
 * value, not called blindly, so the fallback below is a branch rather than a caught exception.
 */
const supportedValuesOf = (Intl as unknown as { supportedValuesOf?: (key: 'timeZone') => string[] })
  .supportedValuesOf

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

let cachedOptions: ZoneOption[] | null = null

/**
 * Every zone the browser knows, grouped by region and sorted within it.
 *
 * Built once: it is a 419-entry list that never changes for the life of the page, and a settings
 * panel that rebuilt it per keystroke would be doing 419 string splits for nothing.
 */
export function zoneOptions(): ZoneOption[] {
  if (cachedOptions) return cachedOptions
  let ids: string[] = []
  try {
    // The fallback is reachable only on an engine older than every other feature this app already
    // requires, and keeps the control usable rather than rendering an empty select.
    ids = supportedValuesOf ? supportedValuesOf('timeZone') : [deviceZone()].filter((z) => z !== '')
  } catch {
    ids = []
  }
  const all = [...EXTRA_ZONES, ...ids.filter((id) => !EXTRA_ZONES.includes(id))]
  cachedOptions = all
    .map((id) => ({ value: id, label: zoneCity(id), group: zoneRegion(id) }))
    // Plain comparison rather than localeCompare: IANA ids are ASCII identifiers, where collation
    // buys nothing and costs a lot - 35ms of the 45 this used to take, for 419 entries.
    .sort((a, b) => cmp(a.group ?? '', b.group ?? '') || cmp(a.label, b.label))
  return cachedOptions
}

/**
 * Whether a stored value names a zone this browser can format in.
 *
 * Stored configuration is untrusted input: a backup written on a newer browser, a hand edit or an
 * imported file can all carry an id this engine does not know, and passing one to `Intl` throws a
 * RangeError from inside render. Everything below goes through here first.
 */
export function isValidZone(id: unknown): id is string {
  if (typeof id !== 'string' || id === '') return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: id })
    return true
  } catch {
    return false
  }
}

/**
 * The zone a config resolves to: the one it names when the browser knows it, else this device's.
 * Absent, empty and unknown all mean the device's own, which is what the widget did before the
 * setting existed.
 */
export function resolveZone(stored: unknown): string {
  return isValidZone(stored) ? stored : deviceZone()
}

/** Formatter cache: building one costs real work, and a clock builds the same few every second. */
const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(key: string, build: () => Intl.DateTimeFormat): Intl.DateTimeFormat {
  const hit = formatters.get(key)
  if (hit) return hit
  const made = build()
  formatters.set(key, made)
  return made
}

/** The calendar fields of an instant as they read in a zone. */
export interface ZoneParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

/**
 * An instant's wall-clock fields in a zone.
 *
 * `hourCycle: 'h23'` rather than `hour12: false`: the two agree on this engine, but `hour12:false`
 * is specified to pair with the locale's own cycle and has historically rendered midnight as "24"
 * under en-US. The analog face would turn that into an hour hand pointing at noon.
 */
export function zoneParts(date: Date, zone: string): ZoneParts {
  const fmt = formatter('parts:' + zone, () =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: zone || undefined,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  )
  const out: ZoneParts = { year: 0, month: 1, day: 1, hour: 0, minute: 0, second: 0 }
  for (const p of fmt.formatToParts(date)) {
    if (p.type === 'year') out.year = Number(p.value)
    else if (p.type === 'month') out.month = Number(p.value)
    else if (p.type === 'day') out.day = Number(p.value)
    else if (p.type === 'hour') out.hour = Number(p.value) % 24
    else if (p.type === 'minute') out.minute = Number(p.value)
    else if (p.type === 'second') out.second = Number(p.value)
  }
  return out
}

/**
 * How far a zone is from UTC at a given instant, in minutes.
 *
 * Read off the formatted fields rather than from a name: reassembling them as though they were
 * UTC and subtracting the real instant gives the offset directly, which works for the half-hour
 * and three-quarter-hour zones (Kolkata at +5:30, Chatham at +12:45) that an hours-only
 * assumption gets wrong. The instant is floored to the second first, because the fields carry no
 * milliseconds and the difference would otherwise pick up whatever fraction was left over.
 */
export function zoneOffsetMinutes(date: Date, zone: string): number {
  const p = zoneParts(date, zone)
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return Math.round((asIfUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000)
}

/** The offset as people write it: "UTC", "UTC+9", "UTC-4", "UTC+5:30". */
export function zoneOffsetLabel(date: Date, zone: string): string {
  const mins = zoneOffsetMinutes(date, zone)
  if (mins === 0) return 'UTC'
  const rest = Math.abs(mins) % 60
  const hours = Math.floor(Math.abs(mins) / 60)
  return `UTC${mins < 0 ? '-' : '+'}${hours}${rest ? ':' + String(rest).padStart(2, '0') : ''}`
}

/**
 * What the locale calls the zone at that instant, short ("EDT") or long ("Eastern Daylight
 * Time"). Not every zone has letters: `short` answers "GMT+9" for Tokyo, which is the honest
 * thing for a zone whose language has no abbreviation for it.
 */
function zoneName(date: Date, zone: string, lang: string, width: 'short' | 'long'): string {
  if (zone === '') return ''
  try {
    const fmt = formatter(`${width}:${lang}:${zone}`, () =>
      new Intl.DateTimeFormat(lang || 'en', { timeZone: zone, timeZoneName: width })
    )
    return fmt.formatToParts(date).find((p) => p.type === 'timeZoneName')?.value ?? zone
  } catch {
    return zone
  }
}

export const zoneShortName = (date: Date, zone: string, lang: string): string =>
  zoneName(date, zone, lang, 'short')

export const zoneLongName = (date: Date, zone: string, lang: string): string =>
  zoneName(date, zone, lang, 'long')

/** How a clock tile labels its zone. */
export type ZoneLabelMode = 'none' | 'short' | 'offset' | 'custom'

const LABEL_MODES: ZoneLabelMode[] = ['none', 'short', 'offset', 'custom']

/** A stored mode, or 'none' for anything that is not one of the four. */
export function zoneLabelMode(stored: unknown): ZoneLabelMode {
  return LABEL_MODES.includes(stored as ZoneLabelMode) ? (stored as ZoneLabelMode) : 'none'
}

/**
 * The line under the time, or '' when the tile draws none.
 *
 * The custom mode falls back to the zone's own city, so picking "Your own text" and typing
 * nothing gives "Tokyo" rather than an empty line - which is what a world clock wanted anyway,
 * and leaves the field free for "Head office".
 */
export function zoneLabelText(
  date: Date,
  zone: string,
  lang: string,
  mode: unknown,
  custom: unknown
): string {
  switch (zoneLabelMode(mode)) {
    case 'short':
      return zoneShortName(date, zone, lang)
    case 'offset':
      return zoneOffsetLabel(date, zone)
    case 'custom': {
      const text = typeof custom === 'string' ? custom.trim() : ''
      return text !== '' ? text : zoneCity(zone)
    }
    default:
      return ''
  }
}

/** One of the extra zones a clock lists in its detail sheet. */
export interface ExtraZone {
  zone: string
  label?: string
}

/**
 * The stored extras, cleaned up: anything that is not an object naming a zone this browser knows
 * is dropped, and the same zone twice is kept once. Stored lists are untrusted input, and this
 * one is read while the sheet renders.
 */
export function extraZones(stored: unknown): ExtraZone[] {
  if (!Array.isArray(stored)) return []
  const seen = new Set<string>()
  const out: ExtraZone[] = []
  for (const row of stored) {
    if (typeof row !== 'object' || row === null) continue
    const { zone, label } = row as Record<string, unknown>
    if (!isValidZone(zone) || seen.has(zone)) continue
    seen.add(zone)
    out.push({ zone, label: typeof label === 'string' && label.trim() !== '' ? label.trim() : undefined })
  }
  return out
}
