import { create } from 'zustand'
import { useConfigStore } from './config'
import { useKioskMode } from './kiosk'
import { useViewportWidth } from '../components/useViewportWidth'

export const SIDEBAR_WIDTH = 260

export const SIDEBAR_PUSH_MIN = 900

const PIN_KEY = 'neohab:sidebarPinned'

interface SidebarState {
  open: boolean
  pinned: boolean
}

function readPinned(): boolean {
  try {
    return localStorage.getItem(PIN_KEY) === '1'
  } catch {
    return false // private mode / storage disabled: unpinned is the safe default
  }
}

export const useSidebarStore = create<SidebarState>(() => ({ open: false, pinned: readPinned() }))

export const closeSidebar = (): void => useSidebarStore.setState({ open: false })
export const toggleSidebar = (): void => useSidebarStore.setState((s) => ({ open: !s.open }))

// pinning clears `open`: pinned alone decides visibility, or rotating to portrait leaves it overlaying the
// dashboard
export function setSidebarPinned(pinned: boolean): void {
  try {
    if (pinned) localStorage.setItem(PIN_KEY, '1')
    else localStorage.removeItem(PIN_KEY)
  } catch {
    // not persisting the pin is survivable
  }
  useSidebarStore.setState({ pinned, open: !pinned })
}

export interface SidebarLayout {
  enabled: boolean
  open: boolean
  pinned: boolean
  canPush: boolean
  inset: number
}

export function useSidebarLayout(): SidebarLayout {
  // kiosk disables the sidebar here rather than in each consumer, or the inset and the aside disagree
  const kiosk = useKioskMode()
  const enabled = useConfigStore((s) => s.settings.sidebar !== false) && !kiosk
  const open = useSidebarStore((s) => s.open)
  const pinned = useSidebarStore((s) => s.pinned)
  const canPush = useViewportWidth() >= SIDEBAR_PUSH_MIN

  const pinnedNow = enabled && pinned && canPush
  const openNow = enabled && (pinnedNow || open)
  return { enabled, open: openNow, pinned: pinnedNow, canPush, inset: openNow && canPush ? SIDEBAR_WIDTH : 0 }
}
