import { describe, expect, it } from 'vitest'
import type { ItemState } from '../../api/types'
import fixture from './openmeteo.fixture.json'
import {
  buildForecastView,
  buildItemsView,
  clampInt,
  conditionForWmo,
  conditionFromState,
  expandPattern,
  hourLabel,
  itemsBinding,
  locationOf,
  meteoIcon,
  normalizeForecast,
  patternItems,
  systemFor,
  UNKNOWN_ICON,
  weekdayLabel,
  WMO_CONDITIONS,
  type ViewOptions,
} from './model'

const t = (s: string) => s
const opts: ViewOptions = { days: 5, hours: 12, showPrecip: true, lang: 'en-US', t }

describe('WMO condition table', () => {
  it('covers every code Open-Meteo documents', () => {
    const codes = [0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99]
    for (const code of codes) expect(WMO_CONDITIONS.has(code), 'code ' + code).toBe(true)
    expect(WMO_CONDITIONS.size).toBe(codes.length)
  })

  it('switches day and night drawings', () => {
    expect(conditionForWmo(0, true)).toEqual({ icon: 'clear-day', label: 'Clear sky', translate: true })
    expect(conditionForWmo(0, false)).toEqual({ icon: 'clear-night', label: 'Clear sky', translate: true })
  })

  it('answers null for unknown or missing codes', () => {
    expect(conditionForWmo(42, true)).toBeNull()
    expect(conditionForWmo(null, true)).toBeNull()
    expect(conditionForWmo(undefined, true)).toBeNull()
  })
})

describe('conditionFromState', () => {
  it('reads a WMO code number, including the Gson float echo', () => {
    expect(conditionFromState('3', true)?.icon).toBe('overcast-day')
    expect(conditionFromState('3.0', false)?.icon).toBe('overcast-night')
    expect(conditionFromState('95', true)?.label).toBe('Thunderstorm')
  })

  it('reads an OpenWeatherMap icon code, whose own letter picks day or night', () => {
    expect(conditionFromState('04d', false)?.icon).toBe('overcast-day')
    expect(conditionFromState('10n', true)?.icon).toBe('partly-cloudy-night-rain')
    expect(conditionFromState('50d', true)?.label).toBe('Mist')
  })

  it('reads an OpenWeatherMap condition id', () => {
    expect(conditionFromState('800', true)?.icon).toBe('clear-day')
    expect(conditionFromState('212', true)?.label).toBe('Thunderstorm')
    expect(conditionFromState('741', false)?.icon).toBe('fog-night')
    expect(conditionFromState('781', true)?.label).toBe('Tornado')
    expect(conditionFromState('502', true)?.label).toBe('Heavy showers')
  })

  it('passes free text through untranslated, with the neutral drawing', () => {
    const c = conditionFromState('Partly Sunny', true)
    expect(c).toEqual({ icon: UNKNOWN_ICON, label: 'Partly Sunny', translate: false })
  })

  it('cannot be fooled by a state naming an Object.prototype member', () => {
    const c = conditionFromState('constructor', true)
    expect(c?.icon).toBe(UNKNOWN_ICON)
    expect(c?.label).toBe('constructor')
    expect(c?.translate).toBe(false)
  })

  it('treats an unmapped number as text, not as a crash', () => {
    const c = conditionFromState('43', true)
    expect(c).toEqual({ icon: UNKNOWN_ICON, label: '43', translate: false })
  })

  it('answers null for no reading at all', () => {
    for (const s of [undefined, null, '', '  ', 'NULL', 'UNDEF']) {
      expect(conditionFromState(s, true), String(s)).toBeNull()
    }
  })
})

describe('meteoIcon', () => {
  it('picks the filled drawing unless the widget asked for line art', () => {
    expect(meteoIcon('clear-day', 'fill')).toBe('meteo:clear-day-fill')
    expect(meteoIcon('clear-day', undefined)).toBe('meteo:clear-day-fill')
    expect(meteoIcon('clear-day', 'line')).toBe('meteo:clear-day')
  })
})

describe('systemFor', () => {
  it('follows the server measurement system first', () => {
    expect(systemFor('US', 'de-DE')).toBe('imperial')
    expect(systemFor('SI', 'en-US')).toBe('metric')
  })

  it('falls back to the locale region, then metric', () => {
    expect(systemFor(undefined, 'en-US')).toBe('imperial')
    expect(systemFor(undefined, 'en_US')).toBe('imperial')
    expect(systemFor(undefined, 'de-DE')).toBe('metric')
    expect(systemFor(undefined, 'en')).toBe('metric')
    expect(systemFor(undefined, undefined)).toBe('metric')
  })
})

describe('normalizeForecast', () => {
  it('normalizes a real Open-Meteo response', () => {
    const data = normalizeForecast(fixture)
    expect(data).not.toBeNull()
    expect(data!.current.time).toBe(fixture.current.time)
    expect(data!.current.temp).toBe(fixture.current.temperature_2m)
    expect(data!.current.isDay).toBe(true)
    expect(data!.hourly.length).toBe(168)
    expect(data!.daily.length).toBe(7)
    expect(data!.daily[0].high).toBe(fixture.daily.temperature_2m_max[0])
  })

  it('refuses shapes that are not a forecast', () => {
    for (const bad of [null, undefined, 42, 'x', [], {}, { current: null }, { current: { time: 5 } }]) {
      expect(normalizeForecast(bad), JSON.stringify(bad)).toBeNull()
    }
  })

  it('survives hostile sections: non-array series, mismatched lengths, junk values', () => {
    const data = normalizeForecast({
      current: { time: '2026-08-18T12:00', temperature_2m: 'hot', is_day: 0 },
      hourly: { time: ['2026-08-18T13:00', '2026-08-18T14:00'], temperature_2m: [70], weather_code: 'nope' },
      daily: {},
    })
    expect(data).not.toBeNull()
    expect(data!.current.temp).toBeNull()
    expect(data!.current.isDay).toBe(false)
    expect(data!.hourly.length).toBe(2)
    expect(data!.hourly[0].temp).toBe(70)
    expect(data!.hourly[1].temp).toBeNull()
    expect(data!.hourly[0].code).toBeNull()
    expect(data!.daily.length).toBe(0)
  })
})

describe('locationOf', () => {
  it('accepts a stored location with finite in-range coordinates', () => {
    expect(locationOf({ name: 'Detroit', lat: 42.33, lon: -83.05 })).toEqual({ name: 'Detroit', lat: 42.33, lon: -83.05 })
    expect(locationOf({ lat: 0, lon: 0 })).toEqual({ name: undefined, lat: 0, lon: 0 })
  })

  it('refuses everything else', () => {
    for (const bad of [undefined, null, 'Detroit', 42, { lat: 42.33 }, { lat: '42', lon: '-83' }, { lat: 91, lon: 0 }, { lat: 0, lon: 181 }, { lat: NaN, lon: 0 }]) {
      expect(locationOf(bad), JSON.stringify(bad)).toBeNull()
    }
  })
})

describe('item patterns', () => {
  it('expands {n} everywhere it appears', () => {
    expect(expandPattern('Weather_Day{n}_High', 3)).toBe('Weather_Day3_High')
    expect(expandPattern('D{n}_x_{n}', 2)).toBe('D2_x_2')
  })

  it('lists the item names a pattern resolves to', () => {
    expect(patternItems('Day{n}_Max', 1, 3)).toEqual(['Day1_Max', 'Day2_Max', 'Day3_Max'])
    expect(patternItems('Day{n}_Max', 0, 2)).toEqual(['Day0_Max', 'Day1_Max'])
  })

  it('answers null when there is no usable pattern', () => {
    expect(patternItems('Day_Max', 1, 3)).toBeNull()
    expect(patternItems('', 1, 3)).toBeNull()
    expect(patternItems(undefined, 1, 3)).toBeNull()
    expect(patternItems(42, 1, 3)).toBeNull()
  })
})

describe('clampInt', () => {
  it('clamps, rounds, parses strings and falls back on junk', () => {
    expect(clampInt(5, 1, 7, 5)).toBe(5)
    expect(clampInt(99, 1, 7, 5)).toBe(7)
    expect(clampInt(-2, 1, 7, 5)).toBe(1)
    expect(clampInt('3', 1, 7, 5)).toBe(3)
    expect(clampInt(4.6, 1, 7, 5)).toBe(5)
    expect(clampInt('junk', 1, 7, 5)).toBe(5)
    expect(clampInt(undefined, 1, 7, 5)).toBe(5)
    expect(clampInt({}, 1, 7, 5)).toBe(5)
  })
})

describe('itemsBinding', () => {
  it('reads only usable strings and clamps the day numbering', () => {
    const b = itemsBinding({
      tempItem: 'Out_Temp',
      humidityItem: 42,
      windSpeedItem: '',
      dayHighPattern: 'Day{n}_High',
      dayFirstNumber: '2',
      dayFirstIs: 'today',
    })
    expect(b.temp).toBe('Out_Temp')
    expect(b.humidity).toBeUndefined()
    expect(b.windSpeed).toBeUndefined()
    expect(b.highPattern).toBe('Day{n}_High')
    expect(b.firstNumber).toBe(2)
    expect(b.firstIsToday).toBe(true)
    expect(itemsBinding({}).firstIsToday).toBe(false)
    expect(itemsBinding({}).firstNumber).toBe(1)
  })
})

describe('time labels', () => {
  it('labels an hour in the app language, from the location-local ISO time', () => {
    expect(hourLabel('2026-08-18T16:00', 'en-US')).toMatch(/4/)
    expect(hourLabel('2026-08-18T16:00', 'de')).toMatch(/16/)
    expect(hourLabel('garbage', 'en-US')).toBe('')
  })

  it('labels a weekday from the calendar date alone', () => {
    expect(weekdayLabel('2026-08-20', 'en-US')).toBe('Thu')
    expect(weekdayLabel('2026-08-20T00:00', 'en-US')).toBe('Thu')
    expect(weekdayLabel('junk', 'en-US')).toBe('')
  })
})

describe('buildForecastView', () => {
  const data = normalizeForecast(fixture)!

  it('builds the current block from a real response', () => {
    const v = buildForecastView(data, 'imperial', opts)
    expect(v.temp).toEqual({ num: '83', unit: '°F' })
    expect(v.icon).toBe('clear-day')
    expect(v.label).toBe('Mainly clear')
    expect(v.humidity).toBe(Math.round(fixture.current.relative_humidity_2m) + '%')
    expect(v.wind).toMatch(/^\d+ mph [A-Z]{1,3}$/)
    expect(v.high).toBe(Math.round(fixture.daily.temperature_2m_max[0]) + '°')
    expect(v.low).toBe(Math.round(fixture.daily.temperature_2m_min[0]) + '°')
  })

  it('starts the hour columns strictly after the current time and honours the count', () => {
    const v = buildForecastView(data, 'imperial', opts)
    expect(v.hours.length).toBe(12)
    for (const h of v.hours) expect(h.key > data.current.time, h.key).toBe(true)
  })

  it('labels the first daily column Today and the rest by weekday', () => {
    const v = buildForecastView(data, 'imperial', opts)
    expect(v.days.length).toBe(5)
    expect(v.days[0].label).toBe('Today')
    expect(v.days[1].label).toBe(weekdayLabel(data.daily[1].date, 'en-US'))
  })

  it('drops precipitation columns when the toggle is off, and zero chances always', () => {
    const off = buildForecastView(data, 'imperial', { ...opts, showPrecip: false })
    expect(off.days.every((d) => d.precipProb === undefined)).toBe(true)
    const on = buildForecastView(data, 'imperial', opts)
    for (const d of on.days) {
      if (d.precipProb !== undefined) expect(d.precipProb).toMatch(/^[1-9]\d*%$/)
    }
  })

  it('shows metric units when asked', () => {
    const v = buildForecastView(data, 'metric', opts)
    expect(v.temp.unit).toBe('°C')
    expect(v.wind).toContain('km/h')
  })

  it('renders dashes, not crashes, when readings are null', () => {
    const bare = normalizeForecast({ current: { time: '2026-08-18T12:00' } })!
    const v = buildForecastView(bare, 'imperial', opts)
    expect(v.temp.num).toBe('-')
    expect(v.feels).toBeUndefined()
    expect(v.wind).toBeUndefined()
    expect(v.hours).toEqual([])
    expect(v.days).toEqual([])
    expect(v.icon).toBe(UNKNOWN_ICON)
  })
})

describe('buildItemsView', () => {
  const states: Record<string, ItemState> = {
    Out_Temp: { state: '22.34 °C', displayState: '22.3 °C', type: 'Number' },
    Out_Feels: { state: '21.0 °C', displayState: '21 °C', type: 'Number' },
    Out_Hum: { state: '64 %', displayState: '64 %', type: 'Number' },
    Out_Wind: { state: '12.4', displayState: '12 km/h', type: 'Number' },
    Out_WindDir: { state: '245', type: 'Number' },
    Out_Cond: { state: '3', type: 'Number' },
    Day1_High: { state: '24.2', type: 'Number' },
    Day1_Low: { state: '15.1', type: 'Number' },
    Day1_Cond: { state: '61', type: 'Number' },
    Day2_High: { state: '26.8', type: 'Number' },
    Day2_Low: { state: '16.0', type: 'Number' },
    Day2_Cond: { state: '0', type: 'Number' },
    Day1_Prob: { state: '40', type: 'Number' },
  }
  const getItem = (name: string) => states[name]
  const noonToday = new Date(2026, 7, 18, 12, 0, 0)

  const binding = itemsBinding({
    tempItem: 'Out_Temp',
    feelsItem: 'Out_Feels',
    humidityItem: 'Out_Hum',
    windSpeedItem: 'Out_Wind',
    windDirItem: 'Out_WindDir',
    conditionItem: 'Out_Cond',
    dayHighPattern: 'Day{n}_High',
    dayLowPattern: 'Day{n}_Low',
    dayConditionPattern: 'Day{n}_Cond',
    dayPrecipPattern: 'Day{n}_Prob',
    dayFirstNumber: 1,
  })

  it('shows the server-formatted current readings', () => {
    const v = buildItemsView(binding, getItem, { ...opts, now: noonToday })
    expect(v.temp).toEqual({ num: '22.3', unit: '°C' })
    expect(v.feels).toBe('21 °C')
    expect(v.humidity).toBe('64 %')
    expect(v.wind).toBe('12 km/h WSW')
    expect(v.icon).toBe('overcast-day')
    expect(v.label).toBe('Overcast')
  })

  it('uses the night drawing outside daytime hours', () => {
    const v = buildItemsView(binding, getItem, { ...opts, now: new Date(2026, 7, 18, 23, 0, 0) })
    expect(v.icon).toBe('overcast-night')
  })

  it('expands the day patterns and skips slots with nothing resolved', () => {
    const v = buildItemsView(binding, getItem, { ...opts, now: noonToday })
    expect(v.days.length).toBe(2)
    expect(v.days[0].high).toBe('24°')
    expect(v.days[0].low).toBe('15°')
    expect(v.days[0].icon).toBe('partly-cloudy-day-rain')
    expect(v.days[0].precipProb).toBe('40%')
    expect(v.days[1].precipProb).toBeUndefined()
    expect(v.hours).toEqual([])
  })

  it('labels the first day Today only when the pattern starts today', () => {
    const tomorrowFirst = buildItemsView(binding, getItem, { ...opts, now: noonToday })
    expect(tomorrowFirst.days[0].label).not.toBe('Today')
    expect(tomorrowFirst.high).toBeUndefined()

    const todayFirst = buildItemsView(itemsBinding({ dayHighPattern: 'Day{n}_High', dayFirstNumber: 1, dayFirstIs: 'today' }), getItem, {
      ...opts,
      now: noonToday,
    })
    expect(todayFirst.days[0].label).toBe('Today')
    expect(todayFirst.high).toBe('24°')
  })

  it('passes a text condition item through untranslated', () => {
    const v = buildItemsView(itemsBinding({ tempItem: 'Out_Temp', conditionItem: 'Out_Text' }), (n) =>
      n === 'Out_Text' ? { state: 'Chance Flurries', type: 'String' } : states[n]
    , { ...opts, now: noonToday })
    expect(v.label).toBe('Chance Flurries')
    expect(v.icon).toBe(UNKNOWN_ICON)
  })

  it('shows placeholders when nothing is bound yet', () => {
    const v = buildItemsView(itemsBinding({ tempItem: 'Missing' }), () => undefined, { ...opts, now: noonToday })
    expect(v.temp.num).toBe('-')
    expect(v.days).toEqual([])
  })
})
