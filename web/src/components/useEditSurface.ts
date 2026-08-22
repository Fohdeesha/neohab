/**
 * Which editing surface is on screen: the full grid, or the single-column stack.
 *
 * Keyed on VIEWPORT width minus a pinned sidebar's inset, deliberately not on the container: a
 * docked settings panel must not flip the editor to the stacked surface mid-drag, while a pinned
 * sidebar is standing chrome that genuinely narrows the space. (The panel no longer narrows the
 * container at all - it zooms the grid instead - but the reasoning is the same either way.)
 * Shared by the grid and the palette so both agree on which gestures make sense.
 */
import { SIDE_PANEL_MIN, STACK_BELOW } from '../model/layout'
import { useSidebarLayout } from '../store/sidebar'
import { useViewportWidth } from './useViewportWidth'

export function useGridEditSurface(): boolean {
  const viewportWidth = useViewportWidth()
  const sidebarInset = useSidebarLayout().inset
  return viewportWidth - sidebarInset >= STACK_BELOW
}

/**
 * Is the settings panel docked beside the dashboard, rather than raised as a bottom sheet?
 *
 * Purely a question about the viewport, because that is what the CSS media query around
 * `.nh-sheet--side` asks. Deliberately NOT the same threshold as the editing surface above:
 * between the two, the grid is edited as a grid while its panel still rises from the bottom.
 */
export function useSidePanelDocked(): boolean {
  return useViewportWidth() >= SIDE_PANEL_MIN
}
