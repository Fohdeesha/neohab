/**
 * Navigation sidebar state.
 *
 * Two independent things: whether it is `open` right now (transient, closes when the pointer
 * leaves it) and whether the user `pinned` it open (sticky). Pinning is per-device rather than
 * part of the saved configuration: it is a choice about one screen's real estate, so a wall
 * panel and a phone should be free to disagree, and it stays out of backup bundles.
 *
 * Wide screens inset the dashboard beside the sidebar; narrow ones overlay it, because a phone
 * has no room to shrink the content into (see SIDEBAR_PUSH_MIN).
 */
import { create } from 'zustand'
import { useConfigStore } from './config'
import { useViewportWidth } from '../components/useViewportWidth'

export const SIDEBAR_WIDTH = 260

/**
 * Below this viewport width the sidebar overlays the dashboard instead of insetting it: at
 * 393px, insetting would leave the dashboard 133px wide. Matches the width at which the editor
 * panels become side panels, so the app has one notion of "wide".
 */
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

export const openSidebar = (): void => useSidebarStore.setState({ open: true })
export const closeSidebar = (): void => useSidebarStore.setState({ open: false })
export const toggleSidebar = (): void => useSidebarStore.setState((s) => ({ open: !s.open }))

/**
 * Pin or unpin on this device.
 *
 * Pinning clears `open` rather than setting it: while pinned, `pinned` alone decides visibility,
 * and a leftover `open` would resurface the moment the screen stopped being wide enough to honour
 * the pin - rotating a pinned tablet to portrait would throw the sidebar over the dashboard as an
 * overlay nobody asked for. Unpinning does the opposite and leaves it on screen, so it goes away
 * on its own terms (the pointer leaving) rather than vanishing from under the cursor.
 */
export function setSidebarPinned(pinned: boolean): void {
  try {
    if (pinned) localStorage.setItem(PIN_KEY, '1')
    else localStorage.removeItem(PIN_KEY)
  } catch {
    /* not persisting the pin is survivable; honour it for this session */
  }
  useSidebarStore.setState({ pinned, open: !pinned })
}

export interface SidebarLayout {
  /** The feature is turned on for this installation. */
  enabled: boolean
  /** Visible right now (pinned counts as open). */
  open: boolean
  /** Pinned *and* on a screen wide enough to honour it. */
  pinned: boolean
  /** Wide enough to inset the content rather than overlay it. */
  canPush: boolean
  /** Px the app content is inset by; 0 whenever the sidebar overlays or is closed. */
  inset: number
}

/**
 * Everything the layout needs to know about the sidebar. `pinned` is reported false on a narrow
 * screen even when stored true, so JS and CSS can never disagree about whether it is honoured -
 * shrinking the window falls back to the overlay, and widening it restores the pin.
 */
export function useSidebarLayout(): SidebarLayout {
  const enabled = useConfigStore((s) => s.settings.sidebar !== false)
  const open = useSidebarStore((s) => s.open)
  const pinned = useSidebarStore((s) => s.pinned)
  const canPush = useViewportWidth() >= SIDEBAR_PUSH_MIN

  const pinnedNow = enabled && pinned && canPush
  const openNow = enabled && (pinnedNow || open)
  return { enabled, open: openNow, pinned: pinnedNow, canPush, inset: openNow && canPush ? SIDEBAR_WIDTH : 0 }
}
