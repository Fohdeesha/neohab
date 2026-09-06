/**
 * "neohab has been updated, reload."
 *
 * Replacing the jar replaces every bundle with a content-hashed name, so a tab that was already
 * open still holds the OLD index and asks for chunks that are no longer on the server. Everything
 * loaded lazily is exposed: a theme's stylesheet, the chart plot, a language catalog, the camera
 * player. Before this, each failed silently in its own way - a theme that never applied, a chart
 * that stayed blank - with nothing anywhere saying that the answer was one reload.
 *
 * Vite raises `vite:preloadError` on the window for exactly this, once per failed dynamic import,
 * so one listener covers every chunk the app will ever have rather than a catch per call site.
 * `preventDefault` stops the default rethrow, which would otherwise reach the error boundary and
 * replace a working screen with a panel about a problem the user cannot act on from there.
 *
 * Not a toast: this does not stop mattering after six seconds, and reloading is a decision rather
 * than a notification. It sits above the toasts and below nothing.
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

export function UpdateNotice() {
  const { t } = useTranslation()
  const [stale, setStale] = useState(false)

  useEffect(() => {
    const onPreloadError = (e: Event) => {
      e.preventDefault()
      setStale(true)
    }
    window.addEventListener('vite:preloadError', onPreloadError)
    return () => window.removeEventListener('vite:preloadError', onPreloadError)
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
