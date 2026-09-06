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

export function setDeviceTheme(themeId: string | null): void {
  useDeviceThemeStore.setState({ themeId })
  try {
    if (themeId === null) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, themeId)
  } catch {
    // storage unavailable (private mode)
  }
}
