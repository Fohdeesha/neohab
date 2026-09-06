import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useItemsStore } from '../store/items'
import { useConfigStore } from '../store/config'

const GRACE_MS = 8000

export function LiveStatus() {
  const { t } = useTranslation()
  const connected = useItemsStore((s) => s.connected)
  const authRequired = useConfigStore((s) => s.authRequired)
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
  const why = authRequired
    ? t('This server shows nothing without an account, and live values cannot carry one - they need openHAB’s user role enabled.')
    : t('Usually a proxy buffering the event stream, security software holding it, or openHAB restarting.')
  return (
    <div className="nh-live" role="status" aria-live="polite">
      <span aria-hidden="true">⚠</span>
      <span>
        {t('Live updates unavailable - item states may be out of date.')} {why}
      </span>
    </div>
  )
}
