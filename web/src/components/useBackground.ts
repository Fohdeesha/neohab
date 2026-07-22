/**
 * The background image behind a surface: the dashboard's own `background` when set, else the
 * global one from settings. Returns a ready-to-apply style, or undefined so themed surfaces
 * stay exactly as they were when no background is configured.
 */
import type { CSSProperties } from 'react'
import type { Dashboard } from '../model/dashboard'
import { resolveBackgroundRef } from '../model/background'
import { useConfigStore } from '../store/config'

export function useBackgroundStyle(dashboard?: Dashboard): CSSProperties | undefined {
  const globalRef = useConfigStore((s) => s.settings.background)
  const backgrounds = useConfigStore((s) => s.backgrounds)
  const url = resolveBackgroundRef(dashboard?.background || globalRef, backgrounds)
  if (!url) return undefined
  return {
    backgroundImage: `url("${url.replace(/["\\]/g, '\\$&')}")`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  }
}
