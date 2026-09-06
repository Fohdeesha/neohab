import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useItemsStore } from '../store/items'
import { useConfigStore } from '../store/config'

/**
 * Says so when item states have stopped flowing, instead of leaving a dashboard full of
 * stale-but-plausible values looking like a working one. A short grace period keeps it out of
 * the way of the normal connect at page load and of brief reconnects.
 */
const GRACE_MS = 8000

export function LiveStatus() {
  const { t } = useTranslation()
  const connected = useItemsStore((s) => s.connected)
  // A server with openHAB's implicit user role off is the one case where this is permanent
  // rather than a hiccup, and it is worth saying so - the stream is an EventSource, which
  // browsers do not let anything attach a token to.
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
  // Naming the usual causes is the difference between a notice a person can act on and one that
  // only says something is wrong. When the configuration itself was refused we know which of them
  // it is, and that it is not going to fix itself: the stream is an EventSource, and a browser
  // will not attach a token to one of those for anybody.
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
