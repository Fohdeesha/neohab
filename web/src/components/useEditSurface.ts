/**
 * Which editing surface is on screen: the full grid, or the single-column stack.
 *
 * Keyed on VIEWPORT width minus a pinned sidebar's inset, deliberately not on the container:
 * the settings panel shrinking the container by 340px must not flip the editor to the stacked
 * surface mid-drag, while a pinned sidebar is standing chrome that genuinely narrows the space.
 * Shared by the grid and the palette so both agree on which gestures make sense.
 */
import { STACK_BELOW } from '../model/layout'
import { useSidebarLayout } from '../store/sidebar'
import { useViewportWidth } from './useViewportWidth'

export function useGridEditSurface(): boolean {
  const viewportWidth = useViewportWidth()
  const sidebarInset = useSidebarLayout().inset
  return viewportWidth - sidebarInset >= STACK_BELOW
}
