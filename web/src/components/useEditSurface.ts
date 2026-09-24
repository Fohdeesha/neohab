import { SIDE_PANEL_MIN } from '../model/layout'
import { useSidebarLayout } from '../store/sidebar'
import { useSurfaceBounds } from './useSurfaceBounds'
import { useViewportWidth } from './useViewportWidth'

/**
 * The answer run mode gives: the grid's own width against the phone threshold. `runWidth` is that width, taken
 * from a box a docked panel cannot narrow: measured on the surface itself, it lagged the panel closing by a
 * frame, and that frame was a stack, which also reset the tablet layout to the desktop one. 0 until measured.
 * The viewport alone read 844px as a grid on a phone in landscape that run mode, 24px of padding narrower,
 * stacks.
 */
export function useGridEditSurface(runWidth: number): boolean {
  const viewportWidth = useViewportWidth()
  const sidebarInset = useSidebarLayout().inset
  const { phoneBelow } = useSurfaceBounds()
  return (runWidth > 0 ? runWidth : viewportWidth - sidebarInset) >= phoneBelow
}

export function useSidePanelDocked(): boolean {
  return useViewportWidth() >= SIDE_PANEL_MIN
}
