import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useItemsStore } from '../store/items'
import { useConfigStore } from '../store/config'
import { anonymousReadAllowed } from '../api/items'

const GRACE_MS = 8000
// the notice waits for the probe rather than appearing with a guess and correcting itself, but it
// must appear even if the probe never answers, which is a real possibility on the sort of server
// that got us here
const PROBE_MS = 3000

export function LiveStatus() {
  const { t } = useTranslation()
  const connected = useItemsStore((s) => s.connected)
  const authRequired = useConfigStore((s) => s.authRequired)
  const [state, setState] = useState<null | { needsAccount: boolean }>(null)

  useEffect(() => {
    if (connected) {
      setState(null)
      return
    }
    let live = true
    // asked only once something is already wrong, so a healthy page never pays for it
    const timer = setTimeout(() => {
      const answer = anonymousReadAllowed().then((allowed) => !allowed)
      const bail = new Promise<boolean>((r) => setTimeout(() => r(false), PROBE_MS))
      void Promise.race([answer, bail]).then((needsAccount) => {
        if (live) setState({ needsAccount })
      })
    }, GRACE_MS)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [connected])

  if (state === null) return null
  // `authRequired` is "the config load got a 401", which is only true signed out. The probe is
  // whether THIS SERVER refuses a read that carries no token, which is what an EventSource sends -
  // the question that matters to someone signed in and looking at stale tiles.
  const why =
    authRequired || state.needsAccount
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
