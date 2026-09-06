// keyed on the viewport, not the container, so a docked panel cannot flip the editor to the stacked surface
// mid-drag
import { SIDE_PANEL_MIN, STACK_BELOW } from '../model/layout'
import { useSidebarLayout } from '../store/sidebar'
import { useViewportWidth } from './useViewportWidth'

export function useGridEditSurface(): boolean {
  const viewportWidth = useViewportWidth()
  const sidebarInset = useSidebarLayout().inset
  return viewportWidth - sidebarInset >= STACK_BELOW
}

export function useSidePanelDocked(): boolean {
  return useViewportWidth() >= SIDE_PANEL_MIN
}
