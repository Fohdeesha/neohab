// replacing the jar renames every hashed bundle, so a tab left open since the old build asks for chunks that
// are gone
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { parseHash } from '../app/router'
import { useEditorStore } from '../store/editor'

const UPDATE_EVENT = 'neohab:updated'
// the notice is not mounted until the configuration has loaded, and an update can land before that
let updatePending = false

/**
 * Called when a new build has taken over this tab. Nothing to lose: a wall panel on a dashboard reloads
 * by itself, as it always did. Someone editing a dashboard, a theme or a custom widget is asked instead,
 * or the reload takes their draft with it.
 */
export function announceUpdate(): void {
  if (!useEditorStore.getState().editing && parseHash(window.location.hash).name !== 'settings') {
    window.location.reload()
    return
  }
  updatePending = true
  window.dispatchEvent(new Event(UPDATE_EVENT))
}

export function UpdateNotice() {
  const { t } = useTranslation()
  const [stale, setStale] = useState(() => updatePending)

  useEffect(() => {
    const onPreloadError = (e: Event) => {
      e.preventDefault()
      setStale(true)
    }
    const onUpdated = () => setStale(true)
    window.addEventListener('vite:preloadError', onPreloadError)
    window.addEventListener(UPDATE_EVENT, onUpdated)
    return () => {
      window.removeEventListener('vite:preloadError', onPreloadError)
      window.removeEventListener(UPDATE_EVENT, onUpdated)
    }
  }, [])

  if (!stale) return null
  return (
    <div className="nh-update" role="status">
      <span>{t('neohab has been updated on the server. Reload to finish.')}</span>
      <button type="button" className="nh-btn nh-btn--primary" onClick={() => window.location.reload()}>
        {t('Reload')}
      </button>
      <button type="button" className="nh-iconbtn" aria-label={t('Dismiss')} onClick={() => setStale(false)}>
        ✕
      </button>
    </div>
  )
}
