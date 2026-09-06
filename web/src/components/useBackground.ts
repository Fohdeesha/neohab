import type { CSSProperties } from 'react'
import type { Dashboard } from '../model/dashboard'
import { cssUrl } from './download'
import { resolveBackgroundRef } from '../model/background'
import { useConfigStore } from '../store/config'

export function useBackgroundStyle(dashboard?: Dashboard): CSSProperties | undefined {
  const globalRef = useConfigStore((s) => s.settings.background)
  const backgrounds = useConfigStore((s) => s.backgrounds)
  const url = resolveBackgroundRef(dashboard?.background || globalRef, backgrounds)
  if (!url) return undefined
  return {
    backgroundImage: `url("${cssUrl(url)}")`,
    backgroundSize: 'cover',
    backgroundPosition: 'center'
  }
}
