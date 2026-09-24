import { useMemo, type CSSProperties } from 'react'
import type { Dashboard } from '../model/dashboard'
import { cssUrl } from './download'
import { resolveBackgroundRef } from '../model/background'
import { useConfigStore } from '../store/config'

export function useBackgroundStyle(dashboard?: Dashboard): CSSProperties | undefined {
  const globalRef = useConfigStore((s) => s.settings.background)
  const backgrounds = useConfigStore((s) => s.backgrounds)
  const url = resolveBackgroundRef(dashboard?.background || globalRef, backgrounds)
  // an uploaded background is a data URI of megabytes, so the escaped copy is made once rather than per render
  return useMemo(
    () => (url ? { backgroundImage: `url("${cssUrl(url)}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined),
    [url]
  )
}
