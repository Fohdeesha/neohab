// One home for "where do the layouts change over", so run mode and the editor cannot disagree about
// what counts as a phone. The clamping and ordering live in surfaceBounds; this only feeds it the
// stored settings, which are untrusted like every other stored value.
import { surfaceBounds, type SurfaceBounds } from '../model/layout'
import { useConfigStore } from '../store/config'

export function useSurfaceBounds(): SurfaceBounds {
  const phoneBelow = useConfigStore((s) => s.settings.phoneBelow)
  const tabletBelow = useConfigStore((s) => s.settings.tabletBelow)
  return surfaceBounds({ phoneBelow, tabletBelow })
}
