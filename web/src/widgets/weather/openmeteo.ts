/**
 * The Open-Meteo side of the weather widget: URL building, the forecast fetch with a
 * module-level cache shared by every widget pointing at the same place, and the geocoding
 * search behind the location field.
 *
 * api.open-meteo.com and geocoding-api.open-meteo.com are free, keyless, and send
 * `Access-Control-Allow-Origin: *` (verified against the live service), so the browser fetches
 * them directly. The openHAB api client is deliberately not involved: this traffic is not the
 * server's, and must not carry its token or proxy credentials.
 */
import { normalizeForecast, type UnitSystem, type WeatherData } from './model'

const FORECAST_BASE = 'https://api.open-meteo.com/v1/forecast'
const GEOCODE_BASE = 'https://geocoding-api.open-meteo.com/v1/search'
const FETCH_TIMEOUT_MS = 15_000

/**
 * The weather models Open-Meteo will run the forecast from, offered because they genuinely
 * disagree and a reading is always compared against some other outlet. Measured at one place
 * on one morning: the automatic blend and GFS said a 27% chance of rain and no accumulation,
 * ECMWF said 69% and 2.4mm, and the big consumer sites were showing 60-93%. None of them is
 * wrong; they are different models. Automatic is Open-Meteo's own per-location pick, which is
 * the right default and the only one that sends no parameter at all.
 *
 * Every id here has been checked against the live service - one that does not exist is an
 * HTTP 400 and no weather at all.
 */
export const FORECAST_MODELS = ['', 'ecmwf_ifs025', 'gfs_seamless', 'icon_seamless', 'gem_seamless'] as const

/**
 * One fixed request shape: every reading any look can show, 7 days, location-local times.
 * Widgets differing only in what they DISPLAY then share one cache entry per place, and the
 * response stays small (~7 KB). Metric asks for Open-Meteo's defaults (°C, km/h, mm).
 */
export function forecastUrl(lat: number, lon: number, sys: UnitSystem, model = ''): string {
  const p = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current:
      'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m,precipitation_probability',
    hourly: 'temperature_2m,weather_code,precipitation_probability,precipitation,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum',
    forecast_days: '7',
    timezone: 'auto',
  })
  if (model && (FORECAST_MODELS as readonly string[]).includes(model)) p.set('models', model)
  if (sys === 'imperial') {
    p.set('temperature_unit', 'fahrenheit')
    p.set('wind_speed_unit', 'mph')
    p.set('precipitation_unit', 'inch')
  }
  return FORECAST_BASE + '?' + p.toString()
}

export function geocodeUrl(query: string, lang: string): string {
  const p = new URLSearchParams({
    name: query,
    count: '8',
    format: 'json',
    language: /^[a-z]{2}/i.test(lang) ? lang.slice(0, 2).toLowerCase() : 'en',
  })
  return GEOCODE_BASE + '?' + p.toString()
}

async function fetchJson(url: string): Promise<unknown> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: ctl.signal })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    return (await res.json()) as unknown
  } finally {
    clearTimeout(timer)
  }
}

interface CacheEntry {
  at: number
  data: WeatherData
}

const cache = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<WeatherData>>()

/**
 * The forecast for a place, at most `maxAgeMs` old. Fresh-enough data answers from the cache,
 * a request already underway is joined rather than duplicated, and a FAILED fetch caches
 * nothing - the next interval tick retries, so errors pace themselves to the refresh cadence
 * instead of hammering. The in-flight entry clears on both settle paths, by key (the
 * memoized-promise trap: a cleared-by-identity entry wrapped in `.finally()` never matches).
 */
export function getForecast(
  lat: number,
  lon: number,
  sys: UnitSystem,
  maxAgeMs: number,
  model = ''
): Promise<WeatherData> {
  const key = lat.toFixed(4) + ',' + lon.toFixed(4) + ',' + sys + ',' + model
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < maxAgeMs) return Promise.resolve(hit.data)
  let p = inflight.get(key)
  if (!p) {
    p = (async () => {
      try {
        const data = normalizeForecast(await fetchJson(forecastUrl(lat, lon, sys, model)))
        if (!data) throw new Error('unexpected forecast shape')
        cache.set(key, { at: Date.now(), data })
        return data
      } finally {
        inflight.delete(key)
      }
    })()
    inflight.set(key, p)
  }
  return p
}

/** A geocoding result ready for the location field: display label plus coordinates. */
export interface GeoPlace {
  name: string
  label: string
  lat: number
  lon: number
}

/** Parse a geocoding response - a third party's shape, so nothing about it is trusted. */
export function parseGeoResults(json: unknown): GeoPlace[] {
  if (typeof json !== 'object' || json === null) return []
  const results = (json as Record<string, unknown>).results
  if (!Array.isArray(results)) return []
  const out: GeoPlace[] = []
  for (const r of results) {
    if (out.length >= 8) break
    if (typeof r !== 'object' || r === null) continue
    const p = r as Record<string, unknown>
    if (typeof p.name !== 'string' || p.name === '') continue
    const lat = typeof p.latitude === 'number' && Number.isFinite(p.latitude) ? p.latitude : null
    const lon = typeof p.longitude === 'number' && Number.isFinite(p.longitude) ? p.longitude : null
    if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue
    const label = [
      p.name,
      typeof p.admin1 === 'string' && p.admin1 !== '' ? p.admin1 : undefined,
      typeof p.country_code === 'string' && p.country_code !== '' ? p.country_code.toUpperCase() : undefined,
    ]
      .filter(Boolean)
      .join(', ')
    out.push({ name: p.name, label, lat, lon })
  }
  return out
}

/** Search places by name, in the app language where the service speaks it. */
export async function searchLocations(query: string, lang: string): Promise<GeoPlace[]> {
  const q = query.trim()
  if (q === '') return []
  return parseGeoResults(await fetchJson(geocodeUrl(q, lang)))
}
