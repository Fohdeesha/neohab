import { normalizeForecast, type UnitSystem, type WeatherData } from './model'

const FORECAST_BASE = 'https://api.open-meteo.com/v1/forecast'
const GEOCODE_BASE = 'https://geocoding-api.open-meteo.com/v1/search'
const FETCH_TIMEOUT_MS = 15_000

export const FORECAST_MODELS = ['', 'ecmwf_ifs025', 'gfs_seamless', 'icon_seamless', 'gem_seamless'] as const

export function forecastUrl(lat: number, lon: number, sys: UnitSystem, model = ''): string {
  const p = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current:
      'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m,precipitation_probability',
    hourly: 'temperature_2m,weather_code,precipitation_probability,precipitation,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum',
    forecast_days: '7',
    timezone: 'auto'
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
    language: /^[a-z]{2}/i.test(lang) ? lang.slice(0, 2).toLowerCase() : 'en'
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

export function getForecast(lat: number, lon: number, sys: UnitSystem, maxAgeMs: number, model = ''): Promise<WeatherData> {
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

export interface GeoPlace {
  name: string
  label: string
  lat: number
  lon: number
}

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
      typeof p.country_code === 'string' && p.country_code !== '' ? p.country_code.toUpperCase() : undefined
    ]
      .filter(Boolean)
      .join(', ')
    out.push({ name: p.name, label, lat, lon })
  }
  return out
}

export async function searchLocations(query: string, lang: string): Promise<GeoPlace[]> {
  const q = query.trim()
  if (q === '') return []
  return parseGeoResults(await fetchJson(geocodeUrl(q, lang)))
}
