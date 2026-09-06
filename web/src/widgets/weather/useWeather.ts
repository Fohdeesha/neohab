/**
 * The weather widget's data, for whoever is drawing it.
 *
 * The tile and the detail sheet both need the same forecast for the same place in the same
 * units, and only ONE of them should be deciding how any of that is resolved. This is that one
 * place: the unit system behind "Auto", the Open-Meteo fetch and its refresh, and the failure
 * message. What each caller then BUILDS from the data is its own business - the tile shows what
 * its settings ask for, the sheet shows everything there is.
 *
 * Opening the sheet costs no request: `getForecast` caches per place and the tile has already
 * filled it.
 */
import { useEffect, useState } from 'react'
import { getRootInfo } from '../../api/items'
import { clampInt, locationOf, systemFor, type UnitSystem, type WeatherData } from './model'
import { FORECAST_MODELS, getForecast } from './openmeteo'

export const REFRESH_DEFAULT_MIN = 15

/**
 * The unit system behind "Auto": the server's own measurement system (`GET /rest/`
 * measurementSystem), resolved once per session and shared by every weather widget. Falls
 * back to the browser locale when the server does not say or cannot be asked.
 */
let autoSystem: UnitSystem | null = null
let autoPromise: Promise<UnitSystem> | null = null
function resolveAutoSystem(): Promise<UnitSystem> {
  autoPromise ??= getRootInfo()
    .then((info) => systemFor(info.measurementSystem, info.locale))
    .catch(() => systemFor(undefined, navigator.language))
    .then((sys) => {
      autoSystem = sys
      return sys
    })
  return autoPromise
}

export function useUnitSystem(setting: unknown): UnitSystem | null {
  const explicit = setting === 'metric' || setting === 'imperial' ? setting : null
  const [auto, setAuto] = useState<UnitSystem | null>(autoSystem)
  useEffect(() => {
    if (explicit !== null || auto !== null) return
    let dead = false
    void resolveAutoSystem().then((sys) => {
      if (!dead) setAuto(sys)
    })
    return () => {
      dead = true
    }
  }, [explicit, auto])
  return explicit ?? auto
}

export interface WeatherSource {
  /** 'items' when the readings come from openHAB, 'openmeteo' when they are fetched here. */
  source: 'items' | 'openmeteo'
  /** The forecast, once it has arrived. Always null in items mode. */
  data: WeatherData | null
  /** Resolved units, or null while "Auto" is still asking the server. */
  sys: UnitSystem | null
  /** Set when the place has coordinates. */
  located: boolean
  failed: boolean
}

/** The configured place, units and forecast - everything that does not depend on the look. */
export function useWeather(config: Record<string, unknown>): WeatherSource {
  const source = config.source === 'items' ? 'items' : 'openmeteo'
  const sys = useUnitSystem(config.units)
  const loc = source === 'openmeteo' ? locationOf(config.location) : null
  const refreshMs = clampInt(config.refreshMinutes, 5, 120, REFRESH_DEFAULT_MIN) * 60_000
  // Anything else stored here is ignored rather than sent: an unknown model is an HTTP 400
  // from Open-Meteo, which is no weather at all.
  const model = (FORECAST_MODELS as readonly string[]).includes(String(config.model ?? '')) ? String(config.model ?? '') : ''

  const [data, setData] = useState<WeatherData | null>(null)
  const [failed, setFailed] = useState(false)

  const lat = loc?.lat
  const lon = loc?.lon
  useEffect(() => {
    if (source !== 'openmeteo' || lat === undefined || lon === undefined || sys === null) return
    let dead = false
    const load = async () => {
      try {
        // accept anything younger than the refresh window, so widgets sharing a place share
        // one request; the small slack keeps an interval tick from just missing its own cache
        const d = await getForecast(lat, lon, sys, refreshMs - 2000, model)
        if (!dead) {
          setData(d)
          setFailed(false)
        }
      } catch {
        if (!dead) setFailed(true)
      }
    }
    // a short beat before the first fetch, so hand-typed coordinates do not fetch per digit
    const first = setTimeout(() => void load(), 350)
    const timer = setInterval(() => void load(), refreshMs)
    return () => {
      dead = true
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [source, lat, lon, sys, refreshMs, model])

  return { source, data, sys, located: loc !== null, failed }
}
