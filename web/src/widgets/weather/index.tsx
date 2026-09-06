/**
 * The weather widget: current conditions, an hourly strip and a daily forecast, drawn three
 * ways (hero, compact row, forecast strip) from either of two sources - Open-Meteo fetched
 * straight from this device, or the user's own openHAB items.
 *
 * The pure model (condition tables, normalization, the display view) is in model.ts, the
 * Open-Meteo fetch and its shared cache in openmeteo.ts, and the looks in looks.tsx. This
 * module is the definition: the settings schema, the fetch wiring and the source dispatch.
 */
import { useTranslation } from 'react-i18next'
import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { buildForecastView, buildItemsView, clampInt, itemsBinding, patternItems, type ViewOptions, type WeatherView } from './model'
import { REFRESH_DEFAULT_MIN, useWeather } from './useWeather'
import { CompactLook, HeroLook, StripLook } from './looks'
import { WeatherDetail } from './detail'

interface WeatherConfig extends Record<string, unknown> {
  source?: string
  look?: string
  label?: string
  location?: unknown
  units?: string
  refreshMinutes?: number
  iconStyle?: string
  /** Which weather model Open-Meteo runs the forecast from; empty = its own pick. */
  model?: string
}

function WeatherWidget({ config, ctx }: WidgetProps<WeatherConfig>) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language || 'en'

  const { source, data, sys, located, failed } = useWeather(config)
  const look = config.look === 'compact' || config.look === 'strip' ? config.look : 'hero'
  const days = clampInt(config.days, 1, 7, 5)
  const hours = clampInt(config.hourlyCount, 3, 24, 12)
  const showDaily = config.showDaily !== false
  const showHourly = config.showHourly !== false && source === 'openmeteo'
  const details = {
    feels: config.showFeels !== false,
    humidity: config.showHumidity !== false,
    wind: config.showWind !== false,
    precip: config.showPrecip !== false
  }

  const opts: ViewOptions = { days, hours, showPrecip: details.precip, lang, t }
  let view: WeatherView | null = null
  let message: string | null = null
  if (source === 'items') {
    const binding = itemsBinding(config)
    if (!binding.temp && !binding.condition) message = t('Pick the items that hold your weather readings.')
    else view = buildItemsView(binding, ctx.getItem, { ...opts, now: new Date() })
  } else if (!located) {
    message = t('Set a location to fetch the forecast.')
  } else if (data) {
    view = buildForecastView(data, sys ?? 'metric', opts)
  } else if (failed) {
    message = t('Could not fetch the forecast. It keeps retrying; check that this device can reach the internet.')
  } else {
    message = t('Loading…')
  }

  const lookProps = view ? { view, iconStyle: config.iconStyle, t, showHourly, showDaily, details } : null
  return (
    <WidgetFrame label={config.label}>
      {lookProps ? (
        look === 'compact' ? (
          <CompactLook {...lookProps} />
        ) : look === 'strip' ? (
          <StripLook {...lookProps} showCurrent={config.stripCurrent !== false} stripOf={config.stripOf} />
        ) : (
          <HeroLook {...lookProps} />
        )
      ) : (
        <div className="nh-weather__empty">{message}</div>
      )}
    </WidgetFrame>
  )
}

const isOm = (c: Record<string, unknown>) => c.source !== 'items'
const isItems = (c: Record<string, unknown>) => c.source === 'items'
const isStrip = (c: Record<string, unknown>) => c.look === 'strip'
const isHero = (c: Record<string, unknown>) => c.look !== 'compact' && c.look !== 'strip'
const wantsDaily = (c: Record<string, unknown>) => c.showDaily !== false
const itemsDaily = (c: Record<string, unknown>) => isItems(c) && wantsDaily(c)

export const weatherWidget: WidgetDefinition<WeatherConfig> = {
  type: 'weather',
  name: 'Weather',
  description: 'Conditions and forecast from Open-Meteo or your own items',
  defaultSize: { w: 4, h: 4 },
  minPixelHeight: 110,
  hasHeader: true,
  defaultConfig: () => ({
    source: 'openmeteo',
    look: 'hero',
    units: 'auto',
    iconStyle: 'fill',
    refreshMinutes: REFRESH_DEFAULT_MIN,
    model: '',
    days: 5,
    hourlyCount: 12,
    showDaily: true,
    showHourly: true,
    showFeels: true,
    showHumidity: true,
    showWind: true,
    showPrecip: true,
    stripOf: 'days',
    stripCurrent: true,
    dayFirstNumber: 1,
    dayFirstIs: 'tomorrow'
  }),
  settings: [
    {
      key: 'source',
      type: 'select',
      label: 'Weather source',
      options: [
        { value: 'openmeteo', label: 'Open-Meteo (internet)' },
        { value: 'items', label: 'openHAB items' }
      ],
      hint: 'Open-Meteo is a free forecast service fetched straight from this device - no key, no server setup, but the device needs internet. Items mode reads your own weather items instead.'
    },
    { key: 'label', type: 'text', label: 'Name' },
    {
      key: 'look',
      type: 'select',
      label: 'Style',
      options: [
        { value: 'hero', label: 'Hero' },
        { value: 'compact', label: 'Compact row' },
        { value: 'strip', label: 'Forecast strip' }
      ]
    },
    { key: 'location', type: 'weatherlocation', label: 'Location', showIf: isOm },
    {
      key: 'units',
      type: 'select',
      label: 'Units',
      options: [
        { value: 'auto', label: 'Auto (server setting)' },
        { value: 'metric', label: 'Metric (°C, km/h)' },
        { value: 'imperial', label: 'Imperial (°F, mph)' }
      ],
      showIf: isOm
    },
    { key: 'refreshMinutes', type: 'number', label: 'Refresh (minutes)', min: 5, max: 120, showIf: isOm },
    {
      key: 'model',
      type: 'select',
      label: 'Forecast model',
      options: [
        { value: '', label: 'Automatic' },
        { value: 'ecmwf_ifs025', label: 'ECMWF' },
        { value: 'gfs_seamless', label: 'NOAA GFS' },
        { value: 'icon_seamless', label: 'DWD ICON' },
        { value: 'gem_seamless', label: 'Environment Canada GEM' }
      ],
      hint: 'Models disagree, sometimes a lot. Automatic is Open-Meteo’s own pick for the location; if a reading looks nothing like the forecast you usually read, try another.',
      showIf: isOm
    },
    {
      key: 'iconStyle',
      type: 'select',
      label: 'Icon style',
      options: [
        { value: 'fill', label: 'Filled' },
        { value: 'line', label: 'Line art' }
      ]
    },
    { key: 'tempItem', type: 'item', label: 'Temperature item', itemTypes: ['Number'], showIf: isItems },
    {
      key: 'conditionItem',
      type: 'item',
      label: 'Condition item',
      showIf: isItems,
      hint: 'A WMO weather code, an OpenWeatherMap condition id or icon code ("04d"), or plain text shown as it is.'
    },
    { key: 'feelsItem', type: 'item', label: 'Feels-like item', itemTypes: ['Number'], showIf: isItems },
    { key: 'humidityItem', type: 'item', label: 'Humidity item', itemTypes: ['Number'], showIf: isItems },
    { key: 'windSpeedItem', type: 'item', label: 'Wind speed item', itemTypes: ['Number'], showIf: isItems },
    {
      key: 'windDirItem',
      type: 'item',
      label: 'Wind direction item',
      showIf: isItems,
      hint: 'Degrees or a cardinal name; shown beside the wind speed.'
    },
    { key: 'precipProbItem', type: 'item', label: 'Precipitation chance item', itemTypes: ['Number'], showIf: isItems },
    { key: 'showDaily', type: 'boolean', label: 'Daily forecast' },
    { key: 'days', type: 'number', label: 'Days', min: 1, max: 7, showIf: wantsDaily },
    { key: 'showHourly', type: 'boolean', label: 'Hourly forecast', showIf: isOm },
    {
      key: 'hourlyCount',
      type: 'number',
      label: 'Hours',
      min: 3,
      max: 24,
      showIf: (c) => isOm(c) && c.showHourly !== false
    },
    {
      key: 'stripOf',
      type: 'select',
      label: 'Strip shows',
      options: [
        { value: 'days', label: 'Days' },
        { value: 'hours', label: 'Hours' }
      ],
      showIf: isStrip,
      hint: 'Hours need the Open-Meteo source; in items mode the strip shows days.'
    },
    { key: 'stripCurrent', type: 'boolean', label: 'Current conditions beside the strip', showIf: isStrip },
    { key: 'showFeels', type: 'boolean', label: 'Feels like', showIf: isHero },
    { key: 'showHumidity', type: 'boolean', label: 'Humidity', showIf: isHero },
    { key: 'showWind', type: 'boolean', label: 'Wind', showIf: isHero },
    {
      key: 'showPrecip',
      type: 'boolean',
      label: 'Precipitation',
      hint: 'The chance of precipitation, on the current conditions and every forecast column.'
    },
    {
      key: 'dayHighPattern',
      type: 'itempattern',
      label: 'Day high pattern',
      showIf: itemsDaily,
      placeholder: 'Weather_Day{n}_MaxTemp',
      hint: 'Item names with {n} standing for the day number, expanded for each forecast day.'
    },
    { key: 'dayLowPattern', type: 'itempattern', label: 'Day low pattern', showIf: itemsDaily, placeholder: 'Weather_Day{n}_MinTemp' },
    { key: 'dayConditionPattern', type: 'itempattern', label: 'Day condition pattern', showIf: itemsDaily },
    { key: 'dayPrecipPattern', type: 'itempattern', label: 'Day precipitation pattern', showIf: itemsDaily },
    {
      key: 'dayFirstNumber',
      type: 'number',
      label: 'First day number',
      min: 0,
      max: 9,
      showIf: itemsDaily,
      hint: 'The {n} of the first forecast day - OpenWeatherMap items usually start at 1.'
    },
    {
      key: 'dayFirstIs',
      type: 'select',
      label: 'The first day is',
      options: [
        { value: 'tomorrow', label: 'Tomorrow' },
        { value: 'today', label: 'Today' }
      ],
      showIf: itemsDaily
    }
  ],
  itemKeys: (c) => {
    if (c.source !== 'items') return []
    const b = itemsBinding(c)
    const names = [b.temp, b.feels, b.humidity, b.windSpeed, b.windDir, b.condition, b.precipProb].filter(
      (s): s is string => typeof s === 'string' && s !== ''
    )
    if (c.showDaily !== false) {
      const days = clampInt(c.days, 1, 7, 5)
      for (const pattern of [b.highPattern, b.lowPattern, b.conditionPattern, b.precipPattern]) {
        const expanded = patternItems(pattern, b.firstNumber, days)
        if (expanded) names.push(...expanded)
      }
    }
    return names
  },
  canCommand: () => false,
  Component: WeatherWidget,
  DetailView: WeatherDetail
}
