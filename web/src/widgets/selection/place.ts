export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

export interface MenuPlace {
  left: number
  width: number
  /** set when the list opens below the control */
  top?: number
  /** set when it opens above, measured up from the bottom of the window */
  bottom?: number
  maxHeight: number
}

export const MENU_MARGIN = 8
const GAP = 4

/**
 * Where the list goes: centred on the control and kept inside the window, under the control when the list
 * fits there or there is more room below than above, over it otherwise. Taller than the room it gets, it
 * scrolls.
 */
export function placeMenu(anchor: Box, view: { width: number; height: number }, wanted: { width: number; height: number }): MenuPlace {
  const width = Math.max(0, Math.min(Math.max(wanted.width, anchor.right - anchor.left), view.width - 2 * MENU_MARGIN))
  const centre = (anchor.left + anchor.right) / 2
  const left = Math.max(MENU_MARGIN, Math.min(centre - width / 2, view.width - MENU_MARGIN - width))
  const below = view.height - anchor.bottom - GAP - MENU_MARGIN
  const above = anchor.top - GAP - MENU_MARGIN
  if (below >= wanted.height || below >= above) return { left, width, top: anchor.bottom + GAP, maxHeight: Math.max(0, below) }
  return { left, width, bottom: view.height - anchor.top + GAP, maxHeight: Math.max(0, above) }
}
