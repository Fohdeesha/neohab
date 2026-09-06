import { create } from 'zustand'

export type ScreensaverMode = 'off' | 'blank' | 'clock'

export interface KioskSettings {
  pinnedDashboard?: string
  kiosk: boolean
  screensaver: ScreensaverMode
  screensaverMinutes: number
  wakeLock: boolean
  followControl?: boolean
}

const KEY = 'neohab:kiosk'

const defaults = (): KioskSettings => ({
  kiosk: false,
  screensaver: 'off',
  screensaverMinutes: 10,
  wakeLock: false
})

function readStored(): KioskSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaults()
    return { ...defaults(), ...(JSON.parse(raw) as Partial<KioskSettings>) }
  } catch {
    return defaults() // private mode / corrupted value: a plain browser is the safe default
  }
}

function urlKioskOverride(): boolean | null {
  const hash = window.location.hash
  const q = hash.indexOf('?')
  const fromHash = q >= 0 ? new URLSearchParams(hash.slice(q + 1)).get('kiosk') : null
  const v = fromHash ?? new URLSearchParams(window.location.search).get('kiosk')
  if (v === 'on' || v === 'true' || v === '1') return true
  if (v === 'off' || v === 'false' || v === '0') return false
  return null
}

interface KioskState {
  settings: KioskSettings
  sessionKiosk: boolean | null
}

export const useKioskStore = create<KioskState>(() => ({
  settings: readStored(),
  sessionKiosk: urlKioskOverride()
}))

export function setKioskSettings(patch: Partial<KioskSettings>): void {
  const next = { ...useKioskStore.getState().settings, ...patch }
  const clearOverride = 'kiosk' in patch
  useKioskStore.setState((s) => ({ settings: next, sessionKiosk: clearOverride ? null : s.sessionKiosk }))
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // not persisting is survivable
  }
}

export function useKioskMode(): boolean {
  return useKioskStore((s) => s.sessionKiosk ?? s.settings.kiosk)
}
