/**
 * Idle screensaver for wall panels: after the configured idle time the screen goes black
 * (optionally with a slowly drifting dim clock, so an OLED panel never shows a static image).
 * Any input wakes it - and the waking input is swallowed, so the tap that wakes the screen
 * cannot also press whatever happens to be under it.
 */
import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { useKioskStore } from '../store/kiosk'

/** How often idleness is re-checked. Activity itself is event-driven; this only fires the saver. */
const CHECK_MS = 1000

/**
 * Reactive "the screen is covered right now", for anything whose work is pointless while nobody
 * can see it - the camera widget above all, which otherwise kept four decoders and four sockets
 * busy all night behind a black rectangle. The saver is an overlay, so neither `visibilityState`
 * nor an IntersectionObserver notices it; this flag is the only way to know.
 */
export const useScreensaverStore = create<{ active: boolean }>(() => ({ active: false }))

export function Screensaver() {
  const mode = useKioskStore((s) => s.settings.screensaver)
  const minutes = useKioskStore((s) => s.settings.screensaverMinutes)
  /**
   * Component state, deliberately - NOT the store below.
   *
   * The swallow depends on it. A mouse WAKES the saver by moving, and the click that follows is a
   * separate event: `activeRef` is still true for it because React batches the wake and re-renders
   * after the current event, so the click is swallowed too. Driving this from an external store
   * instead makes the wake flush synchronously inside the pointermove, so by the time the click
   * arrives the saver is already gone and the click lands on whatever is underneath - which is the
   * one thing this feature exists to prevent. Proved with a probe, not reasoned: the click's own
   * dispatch saw `.nh-saver` already removed.
   */
  const [active, setActive] = useState(false)
  const activeRef = useRef(false)
  activeRef.current = active
  const lastActivity = useRef(Date.now())

  // Publish it for anything whose work is pointless while the screen is covered. Mirrored in an
  // effect rather than being the source of truth, so the timing above is untouched: a frame's
  // delay is nothing to a camera deciding whether to hold a socket open.
  useEffect(() => {
    useScreensaverStore.setState({ active: active && mode !== 'off' })
    return () => useScreensaverStore.setState({ active: false })
  }, [active, mode])

  useEffect(() => {
    if (mode === 'off') return
    lastActivity.current = Date.now() // re-arm when the mode or timeout changes

    const onInput = (e: Event) => {
      lastActivity.current = Date.now()
      if (activeRef.current) {
        // Wake, and swallow the waking input (capture phase, before any app handler).
        e.preventDefault()
        e.stopPropagation()
        setActive(false)
      }
    }
    /**
     * Two registrations on purpose.
     *
     * Only the waking input has to be cancellable, and a non-passive `wheel`/`touchstart`
     * listener opts the whole page out of the browser's fast-scroll path for as long as it is
     * attached - on exactly the touch devices that turn a screensaver on. So the scroll-ish
     * events are passive while the saver is idle and only become cancellable once it is showing.
     */
    const always: (keyof WindowEventMap)[] = ['pointerdown', 'pointermove', 'keydown']
    const scrollish: (keyof WindowEventMap)[] = ['wheel', 'touchstart']
    for (const ev of always) window.addEventListener(ev, onInput, { capture: true, passive: false })
    for (const ev of scrollish) window.addEventListener(ev, onInput, { capture: true, passive: !active })

    const timer = window.setInterval(() => {
      if (activeRef.current) return
      // Guard against a nonsense stored value; anything below ~1s becomes ~1s.
      const idleMs = Math.max(0.02, minutes) * 60_000
      if (Date.now() - lastActivity.current >= idleMs) setActive(true)
    }, CHECK_MS)

    return () => {
      for (const ev of [...always, ...scrollish]) {
        window.removeEventListener(ev, onInput, { capture: true } as EventListenerOptions)
      }
      window.clearInterval(timer)
    }
    // `active` is a dependency so the scroll-ish listeners are re-registered as cancellable once
    // the saver is showing, and passive again once it is not.
  }, [mode, minutes, active])

  if (!active || mode === 'off') return null
  return (
    <div className="nh-saver" role="presentation" data-mode={mode}>
      {mode === 'clock' ? <SaverClock /> : null}
    </div>
  )
}

function SaverClock() {
  const [now, setNow] = useState(() => new Date())
  const [pos, setPos] = useState({ x: 50, y: 50 })

  useEffect(() => {
    const tick = window.setInterval(() => setNow(new Date()), 10_000)
    // Drift somewhere new each minute so no pixel shows a static image for long.
    const drift = window.setInterval(() => {
      setPos({ x: 18 + Math.random() * 64, y: 18 + Math.random() * 64 })
    }, 60_000)
    return () => {
      window.clearInterval(tick)
      window.clearInterval(drift)
    }
  }, [])

  return (
    <div className="nh-saver__clock" style={{ left: pos.x + '%', top: pos.y + '%' }}>
      <div className="nh-saver__time">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
      <div className="nh-saver__date">
        {now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
      </div>
    </div>
  )
}
