// keyed on the viewport, not the container, so a docked panel cannot flip the editor to the stacked surface
// mid-drag
import { SIDE_PANEL_MIN } from '../model/layout'
import { useSidebarLayout } from '../store/sidebar'
import { useSurfaceBounds } from './useSurfaceBounds'
import { useViewportWidth } from './useViewportWidth'

export function useGridEditSurface(): boolean {
  const viewportWidth = useViewportWidth()
  const sidebarInset = useSidebarLayout().inset
  // the same threshold run mode uses, or the editor would draw a stack of a board that renders as a grid
  const { phoneBelow } = useSurfaceBounds()
  return viewportWidth - sidebarInset >= phoneBelow
}

export function useSidePanelDocked(): boolean {
  return useViewportWidth() >= SIDE_PANEL_MIN
}
