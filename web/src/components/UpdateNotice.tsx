// replacing the jar renames every hashed bundle, so a tab left open since the old build asks for chunks that
// are gone
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
