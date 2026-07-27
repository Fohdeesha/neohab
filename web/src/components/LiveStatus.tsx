import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useItemsStore } from '../store/items'

/**
 * Says so when item states have stopped flowing, instead of leaving a dashboard full of
 * stale-but-plausible values looking like a working one. A short grace period keeps it out of
 * the way of the normal connect at page load and of brief reconnects.
 */
const GRACE_MS = 8000

export function LiveStatus() {
  const { t } = useTranslation()
  const connected = useItemsStore((s) => s.connected)
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (connected) {
      setShow(false)
      return
    }
    const timer = setTimeout(() => setShow(true), GRACE_MS)
    return () => clearTimeout(timer)
  }, [connected])

  if (!show) return null
  return (
    <div className="nh-live" role="status" aria-live="polite">
      <span aria-hidden="true">⚠</span>
      <span>{t('Live updates unavailable — item states may be out of date.')}</span>
    </div>
  )
}
