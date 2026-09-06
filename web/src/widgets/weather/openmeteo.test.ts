import { afterEach, describe, expect, it, vi } from 'vitest'
import forecast from './openmeteo.fixture.json'
import geocode from './geocode.fixture.json'
import { FORECAST_MODELS, forecastUrl, geocodeUrl, getForecast, parseGeoResults } from './openmeteo'

describe('forecastUrl', () => {
  it('asks for imperial units explicitly and metric as the service default', () => {
    const imp = forecastUrl(42.33, -83.05, 'imperial')
    expect(imp).toContain('temperature_unit=fahrenheit')
    expect(imp).toContain('wind_speed_unit=mph')
    expect(imp).toContain('precipitation_unit=inch')
    const met = forecastUrl(42.33, -83.05, 'metric')
    expect(met).not.toContain('temperature_unit')
    expect(met).not.toContain('wind_speed_unit')
  })

  it('names a weather model only when it is one the service has', () => {
    // Models genuinely disagree - the whole point of offering the choice - but an id the service
    // does not know is an HTTP 400, which is no weather at all.
    expect(forecastUrl(42.33, -83.05, 'metric')).not.toContain('models=')
    expect(forecastUrl(42.33, -83.05, 'metric', '')).not.toContain('models=')
    expect(forecastUrl(42.33, -83.05, 'metric', 'ecmwf_ifs025')).toContain('models=ecmwf_ifs025')
    expect(forecastUrl(42.33, -83.05, 'metric', 'wishful_thinking')).not.toContain('models=')
    for (const model of FORECAST_MODELS) {
      if (model) expect(forecastUrl(1, 2, 'metric', model)).toContain('models=' + model)
    }
  })

  it('fixes the request shape: 7 days, local times, 4-decimal coordinates', () => {
    const url = forecastUrl(42.331433, -83.045753, 'metric')
    expect(url).toContain('latitude=42.3314')
    expect(url).toContain('longitude=-83.0458')
    expect(url).toContain('forecast_days=7')
    expect(url).toContain('timezone=auto')
    expect(url).toContain('weather_code')
  })
})

describe('geocodeUrl', () => {
  it('passes a two-letter language and falls back to English on junk', () => {
    expect(geocodeUrl('detroit', 'de-DE')).toContain('language=de')
    expect(geocodeUrl('detroit', '')).toContain('language=en')
    expect(geocodeUrl('detroit', '7!')).toContain('language=en')
  })

  it('escapes the query', () => {
    expect(geocodeUrl('st. john&x=1', 'en')).toContain('name=st.+john%26x%3D1')
  })
})

describe('parseGeoResults', () => {
  it('parses a real geocoding response into labelled places', () => {
    const places = parseGeoResults(geocode)
    expect(places.length).toBe(8)
    expect(places[0].name).toBe('Detroit')
    expect(places[0].label).toBe('Detroit, Michigan, US')
    expect(places[0].lat).toBeCloseTo(42.33143)
    expect(places[0].lon).toBeCloseTo(-83.04575)
  })

  it('refuses junk shapes and skips unusable entries', () => {
    for (const bad of [null, undefined, 42, 'x', {}, { results: {} }, { results: 'nope' }]) {
      expect(parseGeoResults(bad), JSON.stringify(bad)).toEqual([])
    }
    const mixed = parseGeoResults({
      results: [
        null,
        'x',
        { name: 'NoCoords' },
        { name: 'BadLat', latitude: 91, longitude: 0 },
        { name: 'Bare', latitude: 1.5, longitude: 2.5 },
        { name: 7, latitude: 1, longitude: 1 }
      ]
    })
    expect(mixed).toEqual([{ name: 'Bare', label: 'Bare', lat: 1.5, lon: 2.5 }])
  })

  it('caps the list at eight places', () => {
    const many = { results: Array.from({ length: 20 }, (_, i) => ({ name: 'P' + i, latitude: i, longitude: i })) }
    expect(parseGeoResults(many).length).toBe(8)
  })
})

describe('getForecast cache', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const okFetch = () => vi.fn(async () => ({ ok: true, status: 200, json: async () => forecast }) as unknown as Response)

  it('shares one fetch between widgets asking for the same place', async () => {
    const f = okFetch()
    vi.stubGlobal('fetch', f)
    const [a, b] = await Promise.all([getForecast(10.0001, 20, 'metric', 60_000), getForecast(10.0001, 20, 'metric', 60_000)])
    expect(f).toHaveBeenCalledTimes(1)
    expect(a).toBe(b)
    // fresh enough: a later call answers from the cache without fetching again
    const c = await getForecast(10.0001, 20, 'metric', 60_000)
    expect(f).toHaveBeenCalledTimes(1)
    expect(c).toBe(a)
  })

  it('refetches once the data is older than the caller accepts', async () => {
    const f = okFetch()
    vi.stubGlobal('fetch', f)
    await getForecast(11, 21, 'metric', 60_000)
    await getForecast(11, 21, 'metric', 0)
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('keeps different places and unit systems apart', async () => {
    const f = okFetch()
    vi.stubGlobal('fetch', f)
    await getForecast(12, 22, 'metric', 60_000)
    await getForecast(12, 22, 'imperial', 60_000)
    await getForecast(12.5, 22, 'metric', 60_000)
    expect(f).toHaveBeenCalledTimes(3)
  })

  it('keeps different weather models apart', async () => {
    // Same place, same units, different model: sharing the cache entry would hand one widget
    // the other's forecast, which is the disagreement the setting exists to resolve.
    const f = okFetch()
    vi.stubGlobal('fetch', f)
    // coordinates of its own: the cache is module-level, so a place another test uses would
    // answer from it and prove nothing
    await getForecast(16, 26, 'metric', 60_000)
    await getForecast(16, 26, 'metric', 60_000, 'ecmwf_ifs025')
    await getForecast(16, 26, 'metric', 60_000, 'gfs_seamless')
    expect(f).toHaveBeenCalledTimes(3)
  })

  it('caches nothing on failure, so the next tick retries', async () => {
    const f = vi
      .fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue({ ok: true, status: 200, json: async () => forecast } as unknown as Response)
    vi.stubGlobal('fetch', f)
    await expect(getForecast(13, 23, 'metric', 60_000)).rejects.toThrow('down')
    const data = await getForecast(13, 23, 'metric', 60_000)
    expect(data.daily.length).toBe(7)
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('rejects on a body that is not a forecast', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ nope: 1 }) }) as unknown as Response)
    )
    await expect(getForecast(14, 24, 'metric', 60_000)).rejects.toThrow('shape')
  })

  it('rejects on an HTTP error status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}) }) as unknown as Response)
    )
    await expect(getForecast(15, 25, 'metric', 60_000)).rejects.toThrow('429')
  })
})
