/**
 * Per-device theme override. The shared `settings.theme` stays the default for every device;
 * a device that picks a theme here keeps it regardless (a light desk browser next to a dark
 * wall panel). Lives in localStorage like the text size, and deliberately not in backups.
 */
import { create } from 'zustand'

const KEY = 'neohab:themeOverride'

function readStored(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export const useDeviceThemeStore = create<{ themeId: string | null }>(() => ({ themeId: readStored() }))

/** Set (theme id) or clear (null = follow the shared setting) this device's theme. */
export function setDeviceTheme(themeId: string | null): void {
  useDeviceThemeStore.setState({ themeId })
  try {
    if (themeId === null) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, themeId)
  } catch {
    // storage unavailable (private mode): still applies for this page load
  }
}
