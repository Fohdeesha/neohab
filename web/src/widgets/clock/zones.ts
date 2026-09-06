export interface ZoneOption {
  value: string
  label: string
  group?: string
}

export const EXTRA_ZONES = ['UTC']

function prettySegment(segment: string): string {
  return segment.replace(/_/g, ' ')
}

export function zoneCity(id: string): string {
  const parts = id.split('/')
  if (parts.length <= 1) return prettySegment(id)
  return parts.slice(1).map(prettySegment).join(' / ')
}

export function zoneRegion(id: string): string {
  const at = id.indexOf('/')
  return at > 0 ? id.slice(0, at) : 'UTC'
}

export function deviceZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  } catch {
    return ''
  }
}

const supportedValuesOf = (Intl as unknown as { supportedValuesOf?: (key: 'timeZone') => string[] }).supportedValuesOf

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

let cachedOptions: ZoneOption[] | null = null

export function zoneOptions(): ZoneOption[] {
  if (cachedOptions) return cachedOptions
  let ids: string[] = []
  try {
    ids = supportedValuesOf ? supportedValuesOf('timeZone') : [deviceZone()].filter((z) => z !== '')
  } catch {
    ids = []
  }
  const all = [...EXTRA_ZONES, ...ids.filter((id) => !EXTRA_ZONES.includes(id))]
  cachedOptions = all
    .map((id) => ({ value: id, label: zoneCity(id), group: zoneRegion(id) }))
    .sort((a, b) => cmp(a.group ?? '', b.group ?? '') || cmp(a.label, b.label))
  return cachedOptions
}

export function isValidZone(id: unknown): id is string {
  if (typeof id !== 'string' || id === '') return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: id })
    return true
  } catch {
    return false
  }
}

export function resolveZone(stored: unknown): string {
  return isValidZone(stored) ? stored : deviceZone()
}

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(key: string, build: () => Intl.DateTimeFormat): Intl.DateTimeFormat {
  const hit = formatters.get(key)
  if (hit) return hit
  const made = build()
  formatters.set(key, made)
  return made
}

export interface ZoneParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

export function zoneParts(date: Date, zone: string): ZoneParts {
  const fmt = formatter(
    'parts:' + zone,
    () =>
      new Intl.DateTimeFormat('en-US', {
        timeZone: zone || undefined,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
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

export function zoneOffsetMinutes(date: Date, zone: string): number {
  const p = zoneParts(date, zone)
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return Math.round((asIfUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000)
}

export function zoneOffsetLabel(date: Date, zone: string): string {
  const mins = zoneOffsetMinutes(date, zone)
  if (mins === 0) return 'UTC'
  const rest = Math.abs(mins) % 60
  const hours = Math.floor(Math.abs(mins) / 60)
  return `UTC${mins < 0 ? '-' : '+'}${hours}${rest ? ':' + String(rest).padStart(2, '0') : ''}`
}

function zoneName(date: Date, zone: string, lang: string, width: 'short' | 'long'): string {
  if (zone === '') return ''
  try {
    const fmt = formatter(`${width}:${lang}:${zone}`, () => new Intl.DateTimeFormat(lang || 'en', { timeZone: zone, timeZoneName: width }))
    return fmt.formatToParts(date).find((p) => p.type === 'timeZoneName')?.value ?? zone
  } catch {
    return zone
  }
}

export const zoneShortName = (date: Date, zone: string, lang: string): string => zoneName(date, zone, lang, 'short')

export const zoneLongName = (date: Date, zone: string, lang: string): string => zoneName(date, zone, lang, 'long')

export type ZoneLabelMode = 'none' | 'short' | 'offset' | 'custom'

const LABEL_MODES: ZoneLabelMode[] = ['none', 'short', 'offset', 'custom']

export function zoneLabelMode(stored: unknown): ZoneLabelMode {
  return LABEL_MODES.includes(stored as ZoneLabelMode) ? (stored as ZoneLabelMode) : 'none'
}

export function zoneLabelText(date: Date, zone: string, lang: string, mode: unknown, custom: unknown): string {
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

export interface ExtraZone {
  zone: string
  label?: string
}

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
