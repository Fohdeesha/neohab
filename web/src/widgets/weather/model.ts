import type { ItemState } from '../../api/types'
import { cardinalFor } from '../compass/model'
import { displayValue, splitValueUnit } from '../common/format'

export type UnitSystem = 'metric' | 'imperial'

export interface ConditionSpec {
  day: string
  night: string
  label: string
}

const c = (day: string, night: string, label: string): ConditionSpec => ({ day, night, label })
const one = (icon: string, label: string): ConditionSpec => ({ day: icon, night: icon, label })

export const WMO_CONDITIONS = new Map<number, ConditionSpec>([
  [0, c('clear-day', 'clear-night', 'Clear sky')],
  [1, c('clear-day', 'clear-night', 'Mainly clear')],
  [2, c('partly-cloudy-day', 'partly-cloudy-night', 'Partly cloudy')],
  [3, c('overcast-day', 'overcast-night', 'Overcast')],
  [45, c('fog-day', 'fog-night', 'Fog')],
  [48, c('fog-day', 'fog-night', 'Rime fog')],
  [51, c('partly-cloudy-day-drizzle', 'partly-cloudy-night-drizzle', 'Light drizzle')],
  [53, one('drizzle', 'Drizzle')],
  [55, c('overcast-day-drizzle', 'overcast-night-drizzle', 'Dense drizzle')],
  [56, c('partly-cloudy-day-sleet', 'partly-cloudy-night-sleet', 'Light freezing drizzle')],
  [57, one('sleet', 'Freezing drizzle')],
  [61, c('partly-cloudy-day-rain', 'partly-cloudy-night-rain', 'Light rain')],
  [63, one('rain', 'Rain')],
  [65, c('extreme-day-rain', 'extreme-night-rain', 'Heavy rain')],
  [66, c('partly-cloudy-day-sleet', 'partly-cloudy-night-sleet', 'Light freezing rain')],
  [67, c('extreme-day-sleet', 'extreme-night-sleet', 'Freezing rain')],
  [71, c('partly-cloudy-day-snow', 'partly-cloudy-night-snow', 'Light snow')],
  [73, one('snow', 'Snow')],
  [75, c('extreme-day-snow', 'extreme-night-snow', 'Heavy snow')],
  [77, one('snowflake', 'Snow grains')],
  [80, c('partly-cloudy-day-rain', 'partly-cloudy-night-rain', 'Light showers')],
  [81, c('overcast-day-rain', 'overcast-night-rain', 'Showers')],
  [82, c('extreme-day-rain', 'extreme-night-rain', 'Heavy showers')],
  [85, c('partly-cloudy-day-snow', 'partly-cloudy-night-snow', 'Light snow showers')],
  [86, c('extreme-day-snow', 'extreme-night-snow', 'Snow showers')],
  [95, c('thunderstorms-day', 'thunderstorms-night', 'Thunderstorm')],
  [96, c('thunderstorms-day-extreme', 'thunderstorms-night-extreme', 'Thunderstorm with hail')],
  [99, c('thunderstorms-day-extreme', 'thunderstorms-night-extreme', 'Thunderstorm with heavy hail')]
])

export const OWM_ICON_CONDITIONS = new Map<string, ConditionSpec>([
  ['01', c('clear-day', 'clear-night', 'Clear sky')],
  ['02', c('partly-cloudy-day', 'partly-cloudy-night', 'Few clouds')],
  ['03', one('cloudy', 'Scattered clouds')],
  ['04', c('overcast-day', 'overcast-night', 'Broken clouds')],
  ['09', c('overcast-day-rain', 'overcast-night-rain', 'Shower rain')],
  ['10', c('partly-cloudy-day-rain', 'partly-cloudy-night-rain', 'Rain')],
  ['11', c('thunderstorms-day', 'thunderstorms-night', 'Thunderstorm')],
  ['13', one('snow', 'Snow')],
  ['50', one('mist', 'Mist')]
])

export const OWM_ID_CONDITIONS = new Map<number, ConditionSpec>([
  [701, one('mist', 'Mist')],
  [711, one('smoke', 'Smoke')],
  [721, c('haze-day', 'haze-night', 'Haze')],
  [731, c('dust-day', 'dust-night', 'Dust')],
  [741, c('fog-day', 'fog-night', 'Fog')],
  [751, c('dust-day', 'dust-night', 'Dust')],
  [761, c('dust-day', 'dust-night', 'Dust')],
  [762, one('smoke', 'Smoke')],
  [771, one('wind', 'Windy')],
  [781, one('hurricane', 'Tornado')]
])

export function owmIdToWmo(id: number): number | null {
  if (id >= 200 && id <= 299) return 95
  if (id === 300 || id === 310) return 51
  if (id === 302 || id === 312 || id === 313 || id === 314) return 55
  if (id >= 300 && id <= 321) return 53
  if (id === 500) return 61
  if (id === 501) return 63
  if (id === 511) return 66
  if (id === 520) return 80
  if (id === 521) return 81
  if (id >= 502 && id <= 531) return 82
  if (id === 600) return 71
  if (id === 602) return 75
  if (id === 611 || id === 612 || id === 613) return 57
  if (id === 615 || id === 616) return 66
  if (id === 620) return 85
  if (id >= 621 && id <= 622) return 86
  if (id >= 601 && id <= 699) return 73
  if (id === 800) return 0
  if (id === 801) return 1
  if (id === 802) return 2
  if (id === 803) return 3
  if (id === 804) return 3
  return null
}

export const UNKNOWN_ICON = 'not-available'

export interface Condition {
  icon: string
  label: string
  translate: boolean
}

export function conditionForWmo(code: number | null | undefined, isDay: boolean): Condition | null {
  if (typeof code !== 'number') return null
  const spec = WMO_CONDITIONS.get(code)
  if (!spec) return null
  return { icon: isDay ? spec.day : spec.night, label: spec.label, translate: true }
}

export function conditionFromState(raw: string | undefined | null, isDay: boolean): Condition | null {
  if (raw === undefined || raw === null) return null
  const s = String(raw).trim()
  if (s === '' || s === 'NULL' || s === 'UNDEF') return null

  const icon = /^(\d{2})([dn])$/.exec(s)
  if (icon) {
    const spec = OWM_ICON_CONDITIONS.get(icon[1])
    if (spec) return { icon: icon[2] === 'd' ? spec.day : spec.night, label: spec.label, translate: true }
  }

  if (/^\d+(\.0+)?$/.test(s)) {
    const n = parseInt(s, 10)
    if (n <= 99) {
      const wmo = conditionForWmo(n, isDay)
      if (wmo) return wmo
    } else {
      const extra = OWM_ID_CONDITIONS.get(n)
      if (extra) return { icon: isDay ? extra.day : extra.night, label: extra.label, translate: true }
      const wmo = conditionForWmo(owmIdToWmo(n), isDay)
      if (wmo) return wmo
    }
    return { icon: UNKNOWN_ICON, label: s, translate: false }
  }

  return { icon: UNKNOWN_ICON, label: s, translate: false }
}

export function meteoIcon(name: string, style: unknown): string {
  return 'meteo:' + name + (style === 'line' ? '' : '-fill')
}

export function unitLabels(sys: UnitSystem): { temp: string; wind: string; precip: string } {
  return sys === 'imperial' ? { temp: '°F', wind: 'mph', precip: 'in' } : { temp: '°C', wind: 'km/h', precip: 'mm' }
}

export function systemFor(measurementSystem: string | undefined, locale: string | undefined): UnitSystem {
  if (measurementSystem === 'US') return 'imperial'
  if (measurementSystem === 'SI') return 'metric'
  const m = /[-_]([A-Za-z]{2})(?:\b|$)/.exec(locale ?? '')
  const region = m ? m[1].toUpperCase() : ''
  return region === 'US' || region === 'LR' || region === 'MM' ? 'imperial' : 'metric'
}

export interface WeatherCurrent {
  time: string
  temp: number | null
  feels: number | null
  humidity: number | null
  windSpeed: number | null
  windDir: number | null
  precip: number | null
  precipProb: number | null
  code: number | null
  isDay: boolean
}

export interface WeatherHour {
  time: string
  temp: number | null
  code: number | null
  precipProb: number | null
  isDay: boolean
}

export interface WeatherDay {
  date: string
  code: number | null
  high: number | null
  low: number | null
  precipProb: number | null
}

export interface WeatherData {
  current: WeatherCurrent
  hourly: WeatherHour[]
  daily: WeatherDay[]
  // the location's offset from UTC, which is what lets a forecast say how old it is
  utcOffsetSeconds?: number
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const numAt = (arr: unknown, i: number): number | null => (Array.isArray(arr) ? num(arr[i]) : null)

export function normalizeForecast(json: unknown): WeatherData | null {
  if (typeof json !== 'object' || json === null) return null
  const root = json as Record<string, unknown>
  const cur = root.current
  if (typeof cur !== 'object' || cur === null) return null
  const cc = cur as Record<string, unknown>
  if (typeof cc.time !== 'string') return null

  const current: WeatherCurrent = {
    time: cc.time,
    temp: num(cc.temperature_2m),
    feels: num(cc.apparent_temperature),
    humidity: num(cc.relative_humidity_2m),
    windSpeed: num(cc.wind_speed_10m),
    windDir: num(cc.wind_direction_10m),
    precip: num(cc.precipitation),
    precipProb: num(cc.precipitation_probability),
    code: num(cc.weather_code),
    isDay: cc.is_day !== 0
  }

  const hourly: WeatherHour[] = []
  const hr = root.hourly
  if (typeof hr === 'object' && hr !== null) {
    const h = hr as Record<string, unknown>
    const times = Array.isArray(h.time) ? h.time : []
    for (let i = 0; i < times.length; i++) {
      const time = times[i]
      if (typeof time !== 'string') continue
      hourly.push({
        time,
        temp: numAt(h.temperature_2m, i),
        code: numAt(h.weather_code, i),
        precipProb: numAt(h.precipitation_probability, i),
        isDay: !Array.isArray(h.is_day) || h.is_day[i] !== 0
      })
    }
  }

  const daily: WeatherDay[] = []
  const dl = root.daily
  if (typeof dl === 'object' && dl !== null) {
    const d = dl as Record<string, unknown>
    const dates = Array.isArray(d.time) ? d.time : []
    for (let i = 0; i < dates.length; i++) {
      const date = dates[i]
      if (typeof date !== 'string') continue
      daily.push({
        date,
        code: numAt(d.weather_code, i),
        high: numAt(d.temperature_2m_max, i),
        low: numAt(d.temperature_2m_min, i),
        precipProb: numAt(d.precipitation_probability_max, i)
      })
    }
  }

  const offset = num(root.utc_offset_seconds)
  return offset === null ? { current, hourly, daily } : { current, hourly, daily, utcOffsetSeconds: offset }
}

// the location's wall-clock time now, in the forecast's own "2026-09-23T15:00" form
export function localNow(data: WeatherData, nowMs: number): string | null {
  if (data.utcOffsetSeconds === undefined) return null
  return new Date(nowMs + data.utcOffsetSeconds * 1000).toISOString().slice(0, 16)
}

export interface WeatherLocation {
  name?: string
  lat: number
  lon: number
}

export function locationOf(value: unknown): WeatherLocation | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  const lat = num(v.lat)
  const lon = num(v.lon)
  if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  return { name: typeof v.name === 'string' ? v.name : undefined, lat, lon }
}

export function expandPattern(pattern: string, n: number): string {
  return pattern.replace(/\{n\}/g, String(n))
}

export function patternItems(pattern: unknown, first: number, count: number): string[] | null {
  if (typeof pattern !== 'string' || !pattern.includes('{n}')) return null
  const names: string[] = []
  for (let i = 0; i < count; i++) names.push(expandPattern(pattern, first + i))
  return names
}

export function clampInt(v: unknown, min: number, max: number, dflt: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  if (!Number.isFinite(n)) return dflt
  return Math.min(max, Math.max(min, Math.round(n)))
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v : undefined)

export interface ItemsBinding {
  temp?: string
  feels?: string
  humidity?: string
  windSpeed?: string
  windDir?: string
  condition?: string
  precipProb?: string
  highPattern?: string
  lowPattern?: string
  conditionPattern?: string
  precipPattern?: string
  firstNumber: number
  firstIsToday: boolean
}

export function itemsBinding(config: Record<string, unknown>): ItemsBinding {
  return {
    temp: str(config.tempItem),
    feels: str(config.feelsItem),
    humidity: str(config.humidityItem),
    windSpeed: str(config.windSpeedItem),
    windDir: str(config.windDirItem),
    condition: str(config.conditionItem),
    precipProb: str(config.precipProbItem),
    highPattern: str(config.dayHighPattern),
    lowPattern: str(config.dayLowPattern),
    conditionPattern: str(config.dayConditionPattern),
    precipPattern: str(config.dayPrecipPattern),
    firstNumber: clampInt(config.dayFirstNumber, 0, 99, 1),
    firstIsToday: config.dayFirstIs === 'today'
  }
}

export interface WeatherView {
  icon: string
  label: string
  temp: { num: string; unit?: string }
  feels?: string
  humidity?: string
  wind?: string
  precipProb?: string
  high?: string
  low?: string
  hours: HourColumn[]
  days: DayColumn[]
}

export interface HourColumn {
  key: string
  label: string
  icon: string
  temp: string
  precipProb?: string
}

export interface DayColumn {
  key: string
  label: string
  icon: string
  high: string
  low: string
  precipProb?: string
}

export interface ViewOptions {
  days: number
  hours: number
  showPrecip: boolean
  lang: string
  t: (s: string) => string
}

const round = (v: number | null): string | undefined => (v === null ? undefined : String(Math.round(v)))
const deg = (v: number | null): string => (v === null ? '-' : Math.round(v) + '°')
const percent = (v: number | null): string | undefined => (v === null || v <= 0 ? undefined : Math.round(v) + '%')

export function hourLabel(isoTime: string, lang: string): string {
  const h = parseInt(isoTime.slice(11, 13), 10)
  if (!Number.isFinite(h) || h < 0 || h > 23) return ''
  try {
    return new Intl.DateTimeFormat(lang, { hour: 'numeric', timeZone: 'UTC' }).format(Date.UTC(2000, 0, 1, h))
  } catch {
    return String(h)
  }
}

export function weekdayLabel(isoDate: string, lang: string): string {
  const d = new Date(isoDate.slice(0, 10) + 'T12:00:00Z')
  if (Number.isNaN(d.getTime())) return ''
  try {
    return new Intl.DateTimeFormat(lang, { weekday: 'short', timeZone: 'UTC' }).format(d)
  } catch {
    return isoDate.slice(0, 10)
  }
}

function condition(code: number | null, isDay: boolean, t: (s: string) => string): { icon: string; label: string } {
  const cond = conditionForWmo(code, isDay)
  return cond ? { icon: cond.icon, label: t(cond.label) } : { icon: UNKNOWN_ICON, label: '' }
}

/**
 * A panel that lost its connection keeps the last forecast it had, and read literally that forecast's
 * "today" was yesterday. So the view is built from the real clock at the location: past hours and days
 * go, and once an hour has passed since the reading, "now" comes from the hourly forecast for this hour
 * rather than from a reading that is no longer current.
 */
function asOfNow(data: WeatherData, nowMs: number): WeatherCurrent {
  const now = localNow(data, nowMs)
  if (now === null || now.slice(0, 13) <= data.current.time.slice(0, 13)) return data.current
  const hour = data.hourly.find((h) => h.time.slice(0, 13) === now.slice(0, 13))
  if (!hour) return { ...data.current, time: now }
  return {
    time: now,
    temp: hour.temp,
    feels: null,
    humidity: null,
    windSpeed: null,
    windDir: null,
    precip: null,
    precipProb: hour.precipProb,
    code: hour.code,
    isDay: hour.isDay
  }
}

export function buildForecastView(data: WeatherData, sys: UnitSystem, o: ViewOptions, nowMs = Date.now()): WeatherView {
  const units = unitLabels(sys)
  const cur = asOfNow(data, nowMs)
  const cond = condition(cur.code, cur.isDay, o.t)

  const windSpeed = round(cur.windSpeed)
  const wind =
    windSpeed !== undefined ? windSpeed + ' ' + units.wind + (cur.windDir !== null ? ' ' + cardinalFor(cur.windDir) : '') : undefined

  const hours: HourColumn[] = []
  for (const h of data.hourly) {
    if (hours.length >= o.hours) break
    if (h.time <= cur.time) continue
    const hc = condition(h.code, h.isDay, o.t)
    hours.push({
      key: h.time,
      label: hourLabel(h.time, o.lang),
      icon: hc.icon,
      temp: deg(h.temp),
      precipProb: o.showPrecip ? percent(h.precipProb) : undefined
    })
  }

  const today = cur.time.slice(0, 10)
  const days: DayColumn[] = data.daily
    .filter((d) => d.date.slice(0, 10) >= today)
    .slice(0, o.days)
    .map((d) => {
      const dc = condition(d.code, true, o.t)
      return {
        key: d.date,
        label: d.date.slice(0, 10) === today ? o.t('Today') : weekdayLabel(d.date, o.lang),
        icon: dc.icon,
        high: deg(d.high),
        low: deg(d.low),
        precipProb: o.showPrecip ? percent(d.precipProb) : undefined
      }
    })

  const todays = data.daily.find((d) => d.date.slice(0, 10) === today)
  return {
    icon: cond.icon,
    label: cond.label,
    temp: { num: cur.temp === null ? '-' : String(Math.round(cur.temp)), unit: units.temp },
    feels: cur.feels === null ? undefined : deg(cur.feels),
    humidity: cur.humidity === null ? undefined : Math.round(cur.humidity) + '%',
    wind,
    precipProb: percent(todays ? todays.precipProb : cur.precipProb),
    high: todays ? deg(todays.high) : undefined,
    low: todays ? deg(todays.low) : undefined,
    hours,
    days
  }
}

export function buildItemsView(
  b: ItemsBinding,
  getItem: (name: string) => ItemState | undefined,
  o: ViewOptions & { now: Date }
): WeatherView {
  const t = o.t
  const hourNow = o.now.getHours()
  const isDay = hourNow >= 6 && hourNow < 18

  const tempState = b.temp ? getItem(b.temp) : undefined
  const temp = splitValueUnit(displayValue(tempState))

  const cond = b.condition ? conditionFromState(getItem(b.condition)?.state, isDay) : null
  const windState = b.windSpeed ? getItem(b.windSpeed) : undefined
  const windDir = b.windDir ? numericOf(getItem(b.windDir)) : null
  const windText = windState ? displayValue(windState) : undefined
  const wind = windText !== undefined && windText !== '-' ? windText + (windDir !== null ? ' ' + cardinalFor(windDir) : '') : undefined

  const days: DayColumn[] = []
  const wantDays = b.highPattern || b.lowPattern || b.conditionPattern ? o.days : 0
  for (let i = 0; i < wantDays; i++) {
    const n = b.firstNumber + i
    const date = new Date(o.now.getTime())
    date.setDate(date.getDate() + i + (b.firstIsToday ? 0 : 1))
    const high = b.highPattern ? numericOf(getItem(expandPattern(b.highPattern, n))) : null
    const low = b.lowPattern ? numericOf(getItem(expandPattern(b.lowPattern, n))) : null
    const dayCond = b.conditionPattern ? conditionFromState(getItem(expandPattern(b.conditionPattern, n))?.state, true) : null
    const prob = o.showPrecip && b.precipPattern ? percent(numericOf(getItem(expandPattern(b.precipPattern, n)))) : undefined
    if (high === null && low === null && !dayCond) continue
    days.push({
      key: 'd' + i,
      label: i === 0 && b.firstIsToday ? t('Today') : localWeekday(date, o.lang),
      icon: dayCond ? dayCond.icon : UNKNOWN_ICON,
      high: deg(high),
      low: deg(low),
      precipProb: prob
    })
  }

  return {
    icon: cond ? cond.icon : UNKNOWN_ICON,
    label: cond ? (cond.translate ? t(cond.label) : cond.label) : '',
    temp,
    feels: b.feels ? textOf(getItem(b.feels)) : undefined,
    humidity: b.humidity ? textOf(getItem(b.humidity)) : undefined,
    wind,
    precipProb: b.precipProb ? textOf(getItem(b.precipProb)) : undefined,
    high: days.length > 0 && days[0].label === t('Today') ? days[0].high : undefined,
    low: days.length > 0 && days[0].label === t('Today') ? days[0].low : undefined,
    hours: [],
    days
  }
}

function numericOf(state: ItemState | undefined): number | null {
  if (!state) return null
  if (typeof state.numericState === 'number' && Number.isFinite(state.numericState)) return state.numericState
  const n = parseFloat(state.state)
  return Number.isFinite(n) ? n : null
}

function textOf(state: ItemState | undefined): string | undefined {
  const v = displayValue(state)
  return v === '-' || v === 'NULL' || v === 'UNDEF' ? undefined : v
}

function localWeekday(date: Date, lang: string): string {
  try {
    return new Intl.DateTimeFormat(lang, { weekday: 'short' }).format(date)
  } catch {
    return date.toDateString().slice(0, 3)
  }
}
