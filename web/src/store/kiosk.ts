/**
 * Per-device kiosk settings.
 *
 * These live in localStorage rather than in the server configuration: a wall panel, a phone and
 * a desktop pointing at the same openHAB should each decide for themselves whether they are a
 * kiosk, which dashboard they wake up on and when their screen blanks. Like the sidebar pin,
 * they deliberately stay out of backup bundles.
 *
 * Kiosk mode itself can additionally be forced for the session by a URL parameter -
 * `?kiosk=on` / `?kiosk=off`, accepted both before the hash (`/neohab/index.html?kiosk=on#/d/x`,
 * what kiosk-browser apps configure) and inside it (`#/d/x?kiosk=on`). The URL override is
 * per-session and never persisted: a kiosk browser re-applies it on every boot via its pinned
 * URL, while a passer-by trying `?kiosk=on` has not silently reconfigured the device. Changing
 * the setting explicitly (settings screen, the 5-tap exit) clears the session override.
 */
import { create } from 'zustand'

export type ScreensaverMode = 'off' | 'blank' | 'clock'

export interface KioskSettings {
  /** Dashboard id this device opens at app start instead of Home. */
  pinnedDashboard?: string
  /** Kiosk mode: all navigation/editing chrome hidden. Exit: 5 taps in a corner or ?kiosk=off. */
  kiosk: boolean
  screensaver: ScreensaverMode
  /** Idle minutes before the screensaver engages. */
  screensaverMinutes: number
  /** Keep the screen awake (Wake Lock API - needs HTTPS or localhost to exist at all). */
  wakeLock: boolean
  /** Follow the dashboard-control item. Absent = follow exactly while in kiosk mode. */
  followControl?: boolean
}

const KEY = 'neohab:kiosk'

const defaults = (): KioskSettings => ({
  kiosk: false,
  screensaver: 'off',
  screensaverMinutes: 10,
  wakeLock: false,
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

/** The ?kiosk= override from the URL, if any (search string or hash query). */
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
  /** Session-only kiosk override from the URL; null when the URL says nothing. */
  sessionKiosk: boolean | null
}

export const useKioskStore = create<KioskState>(() => ({
  settings: readStored(),
  sessionKiosk: urlKioskOverride(),
}))

export function setKioskSettings(patch: Partial<KioskSettings>): void {
  const next = { ...useKioskStore.getState().settings, ...patch }
  // An explicit kiosk choice beats (and clears) whatever the URL said this session.
  const clearOverride = 'kiosk' in patch
  useKioskStore.setState((s) => ({ settings: next, sessionKiosk: clearOverride ? null : s.sessionKiosk }))
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* not persisting is survivable; honour it for this session */
  }
}

export function kioskModeActive(): boolean {
  const s = useKioskStore.getState()
  return s.sessionKiosk ?? s.settings.kiosk
}

/** Reactive: is kiosk mode (settings or session URL override) on right now? */
export function useKioskMode(): boolean {
  return useKioskStore((s) => s.sessionKiosk ?? s.settings.kiosk)
}
