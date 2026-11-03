import { create } from 'zustand'
import type { Surface } from '../model/layout'

const KEY = 'neohab:deviceType'

// what this device says it is, whatever its width; null is "decide by width" as everywhere else
export function deviceTypeFrom(value: unknown): Surface | null {
  return value === 'phone' || value === 'tablet' || value === 'desktop' ? value : null
}

function readStored(): Surface | null {
  try {
    return deviceTypeFrom(localStorage.getItem(KEY))
  } catch {
    return null
  }
}

export const useDeviceTypeStore = create<{ type: Surface | null }>(() => ({ type: readStored() }))

export function setDeviceType(type: Surface | null): void {
  useDeviceTypeStore.setState({ type })
  try {
    if (type === null) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, type)
  } catch {
    // storage unavailable (private mode)
  }
}
