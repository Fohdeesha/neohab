import { useEffect, useState } from 'react'
import { getRootInfo } from '../../api/items'
import { clampInt, locationOf, systemFor, type UnitSystem, type WeatherData } from './model'
import { FORECAST_MODELS, getForecast } from './openmeteo'

export const REFRESH_DEFAULT_MIN = 15

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
  source: 'items' | 'openmeteo'
  data: WeatherData | null
  sys: UnitSystem | null
  located: boolean
  failed: boolean
}

export function useWeather(config: Record<string, unknown>): WeatherSource {
  const source = config.source === 'items' ? 'items' : 'openmeteo'
  const sys = useUnitSystem(config.units)
  const loc = source === 'openmeteo' ? locationOf(config.location) : null
  const refreshMs = clampInt(config.refreshMinutes, 5, 120, REFRESH_DEFAULT_MIN) * 60_000
  const model = (FORECAST_MODELS as readonly string[]).includes(String(config.model ?? '')) ? String(config.model ?? '') : ''

  const [data, setData] = useState<WeatherData | null>(null)
  const [failed, setFailed] = useState(false)
  // the view is built against the clock, so an offline panel still has to be redrawn as time passes
  const [, setClock] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setClock((n) => n + 1), 5 * 60_000)
    return () => clearInterval(id)
  }, [])

  const lat = loc?.lat
  const lon = loc?.lon
  useEffect(() => {
    if (source !== 'openmeteo' || lat === undefined || lon === undefined || sys === null) return
    let dead = false
    const load = async () => {
      try {
        const d = await getForecast(lat, lon, sys, refreshMs - 2000, model)
        if (!dead) {
          setData(d)
          setFailed(false)
        }
      } catch {
        if (!dead) setFailed(true)
      }
    }
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
